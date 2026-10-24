import { makePage } from '../tests/pages.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const output = resolve('test-results/chromium');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'jd-chromium-'));
await mkdir(join(profile, 'Default'));
await writeFile(join(profile, 'Default/Preferences'), JSON.stringify({ download: {
  default_directory: output, prompt_for_download: false, directory_upgrade: true,
} }));
const extension = resolve('dist/chromium');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, acceptDownloads: true, downloadsPath: output,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--enable-unsafe-extension-debugging'],
});
context.setDefaultTimeout(15000);
const checks = [];
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const permissions = await worker.evaluate(() => chrome.runtime.getManifest().permissions);
  assert.deepEqual(permissions, ['activeTab', 'scripting', 'downloads']);
  assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().version), version);
  checks.push('Unmodified Chromium Manifest V3 package and background worker loaded with only three permissions.');

  const fixtureHtml = makePage('ashby');
  const sduiHtml = makePage('sdui-empty');
  const loadedSduiHtml = makePage('sdui-loaded');
  let useLoadedSdui = false;
  const requests = [];
  await context.route('https://www.linkedin.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: new URL(route.request().url()).pathname === '/jobs/view/900000001/'
      ? (useLoadedSdui ? loadedSduiHtml : sduiHtml) : fixtureHtml }));
  context.on('request', request => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  const job = context.pages()[0] || await context.newPage();
  await job.goto('https://www.linkedin.com/jobs/view/123456789/');
  const browserCdp = await context.browser().newBrowserCDPSession();
  await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true });
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const targetInfo = targetInfos.find(info => info.url === job.url());
  assert.ok(targetInfo, 'Current job must have a browser tab target');
  const [jobTab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
  await browserCdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), jobTab.id);
  const downloadedBefore = new Set();
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(await popup.locator('#editor').isVisible(), false);
  assert.equal(await worker.evaluate(() => chrome.downloads.search({})).then(items => items.length), 0);
  checks.push('Native toolbar action granted activeTab; popup document exercised as an extension tab. Opening alone did not extract or download.');
  await popup.locator('#extract').click();
  await popup.locator('#editor').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('#company').inputValue(), 'Marble AI');
  assert.equal(await popup.locator('#ats').inputValue(), 'Ashby');
  checks.push('Real activeTab grant and scripting.executeScript extracted the intercepted local Ashby fixture.');
  await popup.locator('#company').fill('星河科技 🚀');
  await popup.locator('#title').fill('软件工程师');
  await popup.locator('#description').fill('原始中文说明。\n\n- 第一项\n- 第二项');
  await popup.locator('#application-url').fill('https://jobs.lever.co/team/123?token=a%2Fb&plus=%2B');
  assert.equal(await popup.locator('#ats').inputValue(), 'Lever');
  assert.equal(await popup.locator('#filename').textContent(), 'new-jd-星河科技 🚀.txt');
  await popup.locator('#reextract').click();
  assert.equal(await popup.locator('#overwrite').isVisible(), true);
  await popup.locator('#cancel-reextract').click();
  assert.equal(await popup.locator('#company').inputValue(), '星河科技 🚀');
  await popup.screenshot({ path: join(output, 'editable-preview.png'), fullPage: true });
  checks.push('Unicode edits, ATS recomputation, filename preview, and overwrite protection worked.');

  await popup.locator('#download').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('TXT 已下载'));
  const [first] = await worker.evaluate(() => chrome.downloads.search({}));
  assert.equal(first.state, 'complete');
  assert.match(first.filename, /new-jd-星河科技 🚀(?: \(\d+\))?\.txt$/);
  const text = await readFile(first.filename, 'utf8');
  assert.match(text, /Company Name: 星河科技 🚀\nJob Title: 软件工程师/);
  assert.match(text, /ATS: Lever/);
  assert.ok(text.includes('token=a%2Fb&plus=%2B'));
  assert.ok(!text.includes('urlhash'));
  assert.ok(text.includes('原始中文说明。\n\n- 第一项\n- 第二项'));
  assert.ok(!text.includes('Extraction Notes:'));
  await writeFile(join(output, 'downloaded-example.txt'), text);
  checks.push('Native downloads API produced a nonempty UTF-8 TXT matching the latest edited values.');

  await popup.locator('#download').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('TXT 已下载'));
  const duplicates = await worker.evaluate(() => chrome.downloads.search({}));
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0].filename, duplicates[1].filename);
  checks.push('Repeated download uniquified the filename without overwriting.');

  // Start the actual background request, then destroy the popup document before
  // awaiting its response. No Blob URL or popup document owns the downloaded data.
  await popup.locator('#company').fill('Popup Close Test');
  for (const item of await worker.evaluate(() => chrome.downloads.search({}))) downloadedBefore.add(item.id);
  await popup.locator('#download').click({ noWaitAfter: true });
  await popup.close();
  let closing;
  for (let attempt = 0; attempt < 100; attempt++) {
    closing = (await worker.evaluate(() => chrome.downloads.search({})))
      .find(item => !downloadedBefore.has(item.id) && item.state === 'complete');
    if (closing) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(closing, 'Download must complete after the popup document is destroyed');
  assert.equal(await readFile(closing.filename, 'utf8'), text.replace('Company Name: 星河科技 🚀', 'Company Name: Popup Close Test'));
  checks.push('Download completed with intact file bytes after immediate popup closure.');

  await job.goto('https://www.linkedin.com/jobs/view/900000001/');
  await browserCdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  const sduiPopup = await context.newPage();
  await sduiPopup.goto(`chrome-extension://${id}/popup.html`);
  await worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), jobTab.id);
  await sduiPopup.locator('#extract').click();
  await sduiPopup.locator('#editor').waitFor({ state: 'visible' });
  assert.equal(await sduiPopup.locator('#company').inputValue(), 'Example Company');
  assert.equal(await sduiPopup.locator('#title').inputValue(), 'Platform Engineer');
  assert.equal(await sduiPopup.locator('#description').inputValue(), '');
  assert.equal(await sduiPopup.locator('#download').isDisabled(), true);
  assert.match(await sduiPopup.locator('#application-url').inputValue(), /^https:\/\/careers\.example\.org\//);
  checks.push('The empty-description negative fixture extracted Example Company/header data, ignored the recommendation spinner, and blocked export until description was available.');
  useLoadedSdui = true;
  await job.reload();
  const expectedItems = await job.locator('#JobDetails_AboutTheJob_900000001 li').allTextContents();
  assert.equal(expectedItems.length, 32);
  await sduiPopup.locator('#reextract').click();
  await sduiPopup.waitForFunction(() => document.querySelector('#description').value.includes('Synthetic engineering role for automated testing.'));
  const description = await sduiPopup.locator('#description').inputValue();
  assert.ok(description.length > 6000);
  for (const item of expectedItems) assert.ok(description.includes(`- ${item.replace(/\s+/g, ' ').trim()}`));
  assert.ok(description.includes('End of the synthetic description.'));
  assert.equal(await sduiPopup.locator('#warnings li').count(), 0);
  await sduiPopup.locator('#download').click();
  await sduiPopup.waitForFunction(() => document.querySelector('#status').textContent.includes('TXT 已下载'));
  const exampleDownload = (await worker.evaluate(() => chrome.downloads.search({})))
    .find(item => /new-jd-Example Company(?: \(\d+\))?\.txt$/.test(item.filename));
  assert.equal(exampleDownload?.state, 'complete');
  const sduiText = await readFile(exampleDownload.filename, 'utf8');
  assert.match(sduiText, /Company Name: Example Company\nJob Title: Platform Engineer/);
  assert.ok(sduiText.includes(description));
  assert.ok(!sduiText.includes('Extraction Notes:'));
  assert.ok(!sduiText.includes('Unrelated company overview'));
  assert.ok(!sduiText.includes('Recommended Engineer'));
  await writeFile(join(output, 'sdui-export.txt'), sduiText);
  checks.push('The generated synthetic description was re-extracted and downloaded with over 6000 characters, all 32 items in four lists, and its final paragraph, excluding company/recommended-job content.');
  checks.push('Populated descriptions produced no speculative completeness warning in the preview or TXT, and no empty Extraction Notes section.');
  assert.deepEqual(requests, ['https://www.linkedin.com/jobs/view/123456789/', 'https://www.linkedin.com/jobs/view/900000001/', 'https://www.linkedin.com/jobs/view/900000001/']);
  assert.deepEqual(errors, []);
  checks.push('Only three test-driver fixture navigations requested job/ATS URLs; no popup runtime errors.');
  const report = { version, browser: context.browser()?.version(), profile,
    fixture: 'Generated synthetic legacy and SDUI test markup only. No saved pages, real job descriptions, or live LinkedIn access.', checks, errors };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
