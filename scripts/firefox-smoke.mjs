import { makePage } from '../tests/pages.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const output = resolve('test-results/firefox');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const downloads = await mkdtemp(join(tmpdir(), 'jd-firefox-downloads-'));
await mkdir(output, { recursive: true });
const port = 40000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const driver = spawn(process.env.GECKODRIVER_PATH || 'geckodriver',
  ['--host', '127.0.0.1', '--port', String(port), '--allow-system-access'], { stdio: ['ignore', 'pipe', 'pipe'] });
let driverLog = '';
driver.stdout.on('data', data => { driverLog += data; });
driver.stderr.on('data', data => { driverLog += data; });
driver.on('error', error => { driverLog += error.message; });
let sessionId;
let ws;
const checks = [];
const requests = [];
const protocolErrors = [];
async function call(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + (sessionId ? `/session/${sessionId}` : '') + path, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (result.value?.error) throw new Error(JSON.stringify(result.value));
  return result.value;
}
const chromeContext = () => call('/moz/context', { context: 'chrome' });
const contentContext = () => call('/moz/context', { context: 'content' });
const execute = (script, ...args) => call('/execute/sync', { script, args });
async function until(read, predicate, message) {
  const deadline = Date.now() + 15000;
  let last;
  do {
    const result = await read();
    last = result;
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`${message}; last result: ${JSON.stringify(last)}`);
}
try {
  await until(() => fetch(base + '/status').then(response => response.ok).catch(() => false), Boolean, 'geckodriver did not start: ' + driverLog);
  const session = await call('/session', { capabilities: { alwaysMatch: {
    browserName: 'firefox', webSocketUrl: true,
    'moz:firefoxOptions': { binary: process.env.FIREFOX_PATH || '/usr/bin/firefox', args: ['-headless'], prefs: {
      'browser.download.folderList': 2, 'browser.download.dir': downloads, 'browser.download.useDownloadDir': true,
      'browser.download.alwaysOpenPanel': false, 'browser.newtabpage.enabled': false,
      'datareporting.healthreport.uploadEnabled': false, 'toolkit.telemetry.enabled': false,
    } },
  } } });
  sessionId = session.sessionId;
  ws = new WebSocket(session.capabilities.webSocketUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  function bidi(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const fixture = makePage('ashby');
  const sduiFixture = makePage('sdui-empty');
  const loadedSduiFixture = makePage('sdui-loaded');
  let useLoadedSdui = false;
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === 'error') item?.reject(new Error(JSON.stringify(message)));
      else item?.resolve(message.result);
    } else if (message.method === 'network.beforeRequestSent') {
      const { request, isBlocked } = message.params;
      if (/^https?:/.test(request.url)) requests.push(request.url);
      if (isBlocked) {
        const fixtureBody = request.url === 'https://www.linkedin.com/jobs/view/123456789/' ? fixture
          : request.url === 'https://www.linkedin.com/jobs/view/900000001/'
            ? (useLoadedSdui ? loadedSduiFixture : sduiFixture) : null;
        const operation = fixtureBody
          ? bidi('network.provideResponse', { request: request.request, statusCode: 200,
            headers: [{ name: 'Content-Type', value: { type: 'string', value: 'text/html; charset=utf-8' } }],
            body: { type: 'base64', value: Buffer.from(fixtureBody).toString('base64') } })
          : bidi('network.failRequest', { request: request.request });
        operation.catch(error => protocolErrors.push(error.message));
      }
    }
  };
  await bidi('session.subscribe', { events: ['network.beforeRequestSent'] });
  // Intercept remote HTTP(S) only. A blanket interception also blocks Firefox's
  // local data: downloads, which would test the driver instead of the extension.
  await bidi('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: [
    { type: 'pattern', protocol: 'https' }, { type: 'pattern', protocol: 'http' },
  ] });
  assert.equal(await call('/moz/addon/install', {
    path: resolve(`dist/current-job-txt-firefox-${version}.zip`), temporary: true,
  }), 'current-job-txt@local.example');
  checks.push('Unmodified Firefox ZIP installed temporarily in an isolated Firefox profile.');
  await call('/url', { url: 'https://www.linkedin.com/jobs/view/123456789/' });
  await chromeContext();
  const uuid = await execute('return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[arguments[0]];', 'current-job-txt@local.example');
  const jobTabHandle = await call('/window');
  await execute('gUnifiedExtensions.togglePanel();');
  await until(() => execute('return !!document.getElementById("current-job-txt_local_example-BAP");'), Boolean, 'Native extension menu button missing');
  const button = await call('/element', { using: 'css selector', value: '#current-job-txt_local_example-BAP' });
  await call(`/element/${button['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  checks.push('Native Firefox extension action clicked to grant activeTab.');
  await contentContext();
  const popupWindow = await call('/window/new', { type: 'tab' });
  await call('/window', { handle: popupWindow.handle });
  await call('/url', { url: `moz-extension://${uuid}/popup.html` });
  // Select the fixture for tabs.query while continuing to automate the popup
  // document in its background tab. This uses native extension APIs unchanged.
  await chromeContext();
  await execute('gBrowser.selectedTab = gBrowser.tabs.find(tab => tab.linkedBrowser.currentURI.spec === arguments[0]);', 'https://www.linkedin.com/jobs/view/123456789/');
  await contentContext();
  assert.equal(await execute('return document.querySelector("#editor").hidden;'), true);
  await execute('document.querySelector("#extract").click();');
  await until(() => execute('return { visible: !document.querySelector("#editor").hidden, status: document.querySelector("#status").textContent };'), result => result.visible, 'Firefox extraction failed');
  assert.equal(await execute('return document.querySelector("#company").value;'), 'Marble AI');
  assert.equal(await execute('return document.querySelector("#ats").value;'), 'Ashby');
  checks.push('Native activeTab and scripting.executeScript extracted the local intercepted fixture; popup document tested as an extension tab.');
  await execute(`for (const [id, value] of Object.entries(arguments[0])) {
    const field = document.getElementById(id); field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }`, { company: '星河科技 🚀', title: '软件工程师', description: '原始中文说明。\n\n- 第一项\n- 第二项', 'application-url': 'https://jobs.lever.co/team/123?token=a%2Fb&plus=%2B' });
  assert.equal(await execute('return document.querySelector("#ats").value;'), 'Lever');
  assert.equal(await execute('return document.querySelector("#filename").textContent;'), 'new-jd-星河科技 🚀.txt');
  await execute('document.querySelector("#reextract").click();');
  assert.equal(await execute('return !document.querySelector("#overwrite").hidden;'), true);
  await execute('document.querySelector("#cancel-reextract").click();');
  const screenshot = await call('/screenshot');
  await writeFile(join(output, 'editable-preview.png'), Buffer.from(screenshot, 'base64'));
  checks.push('Unicode edits, ATS recomputation, filename preview, and re-extraction overwrite protection worked.');
  async function downloadRecords() {
    return call('/execute/async', { script: 'browser.downloads.search({}).then(arguments[arguments.length - 1]);', args: [] });
  }
  assert.equal((await downloadRecords()).length, 0);
  await execute('document.querySelector("#download").click();');
  await until(() => execute('return document.querySelector("#status").textContent;'), text => text.includes('TXT 已下载'), 'Firefox download did not complete');
  const [first] = await downloadRecords();
  assert.match(first.filename, /new-jd-星河科技 🚀\.txt$/);
  const text = await readFile(first.filename, 'utf8');
  assert.match(text, /Company Name: 星河科技 🚀\nJob Title: 软件工程师/);
  assert.ok(text.includes('ATS: Lever'));
  assert.ok(text.includes('token=a%2Fb&plus=%2B'));
  assert.ok(text.includes('原始中文说明。\n\n- 第一项\n- 第二项'));
  assert.ok(!text.includes('Extraction Notes:'));
  assert.ok(!text.includes('urlhash'));
  await writeFile(join(output, 'downloaded-example.txt'), text);
  checks.push('Native Firefox download produced a nonempty UTF-8 TXT reflecting the latest edits.');
  await execute('document.querySelector("#download").click();');
  await until(downloadRecords, items => items.filter(item => item.state === 'complete').length === 2, 'Second download failed');
  const records = await downloadRecords();
  assert.notEqual(records[0].filename, records[1].filename);
  checks.push('Repeated download uniquified filenames without overwriting.');
  await execute('const field = document.querySelector("#company"); field.value = "Popup Close Test"; field.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("#download").click();');
  await call('/window', undefined, 'DELETE');
  await call('/window', { handle: jobTabHandle });
  const { readdir } = await import('node:fs/promises');
  const names = await until(() => readdir(downloads), names => names.includes('new-jd-Popup Close Test.txt'), 'Download after popup closure did not finish');
  assert.ok(names.includes('new-jd-Popup Close Test.txt'));
  const expectedClosedText = text.replace('Company Name: 星河科技 🚀', 'Company Name: Popup Close Test');
  const closedText = await until(() => readFile(join(downloads, 'new-jd-Popup Close Test.txt'), 'utf8').catch(() => ''), text => text === expectedClosedText, 'Closed-popup download bytes were incomplete');
  assert.equal(closedText, expectedClosedText);
  checks.push('Download retained intact UTF-8 content after the popup document was closed.');

  await call('/url', { url: 'https://www.linkedin.com/jobs/view/900000001/' });
  await chromeContext();
  await execute('gUnifiedExtensions.togglePanel();');
  const sduiButton = await call('/element', { using: 'css selector', value: '#current-job-txt_local_example-BAP' });
  await call(`/element/${sduiButton['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await contentContext();
  const sduiWindow = await call('/window/new', { type: 'tab' });
  await call('/window', { handle: sduiWindow.handle });
  await call('/url', { url: `moz-extension://${uuid}/popup.html` });
  await chromeContext();
  await execute('gBrowser.selectedTab = gBrowser.tabs.find(tab => tab.linkedBrowser.currentURI.spec === arguments[0]);', 'https://www.linkedin.com/jobs/view/900000001/');
  await contentContext();
  assert.equal(await execute('return browser.runtime.getManifest().version;'), version);
  await execute('document.querySelector("#extract").click();');
  await until(() => execute('return !document.querySelector("#editor").hidden;'), Boolean, 'SDUI fixture extraction failed');
  assert.equal(await execute('return document.querySelector("#company").value;'), 'Example Company');
  assert.equal(await execute('return document.querySelector("#title").value;'), 'Platform Engineer');
  assert.equal(await execute('return document.querySelector("#description").value;'), '');
  assert.equal(await execute('return document.querySelector("#download").disabled;'), true);
  assert.match(await execute('return document.querySelector("#application-url").value;'), /^https:\/\/careers\.example\.org\//);
  checks.push('The empty-description negative fixture extracted Example Company/header data, ignored the recommendation spinner, and blocked export until description was available.');
  await call('/window', { handle: jobTabHandle });
  useLoadedSdui = true;
  await call('/refresh', {});
  const expectedItems = await execute('return [...document.querySelectorAll("#JobDetails_AboutTheJob_900000001 li")].map(element => element.textContent);');
  assert.equal(expectedItems.length, 32);
  // Refresh the temporary grant after navigation, as opening the action on the
  // newly loaded page would do in the normal workflow.
  await chromeContext();
  await execute('gUnifiedExtensions.togglePanel();');
  const refreshedButton = await call('/element', { using: 'css selector', value: '#current-job-txt_local_example-BAP' });
  await call(`/element/${refreshedButton['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await contentContext();
  await call('/window', { handle: sduiWindow.handle });
  await chromeContext();
  await execute('gBrowser.selectedTab = gBrowser.tabs.find(tab => tab.linkedBrowser.currentURI.spec === arguments[0]);', 'https://www.linkedin.com/jobs/view/900000001/');
  await contentContext();
  await execute('document.querySelector("#reextract").click();');
  const loadedState = await until(() => execute('return {description: document.querySelector("#description").value, status: document.querySelector("#status").textContent};'), state => state.description.includes('Synthetic engineering role for automated testing.'), 'Loaded SDUI description missing');
  const description = loadedState.description;
  assert.ok(description.length > 6000);
  for (const item of expectedItems) assert.ok(description.includes(`- ${item.replace(/\s+/g, ' ').trim()}`));
  assert.ok(description.includes('End of the synthetic description.'));
  assert.equal(await execute('return document.querySelectorAll("#warnings li").length;'), 0);
  await execute('document.querySelector("#download").click();');
  await until(() => execute('return document.querySelector("#status").textContent;'), text => text.includes('TXT 已下载'), 'SDUI download failed');
  const sduiDownload = (await downloadRecords()).find(item => /new-jd-Example Company(?: \(\d+\))?\.txt$/.test(item.filename));
  assert.equal(sduiDownload?.state, 'complete');
  const sduiText = await readFile(sduiDownload.filename, 'utf8');
  assert.match(sduiText, /Company Name: Example Company\nJob Title: Platform Engineer/);
  assert.ok(sduiText.includes(description));
  assert.ok(!sduiText.includes('Extraction Notes:'));
  assert.ok(!sduiText.includes('Unrelated company overview'));
  assert.ok(!sduiText.includes('Recommended Engineer'));
  await writeFile(join(output, 'sdui-export.txt'), sduiText);
  checks.push('The generated synthetic description was re-extracted and downloaded with over 6000 characters, all 32 items in four lists, and its final paragraph, excluding company/recommended-job content.');
  checks.push('Populated descriptions produced no speculative completeness warning in the preview or TXT, and no empty Extraction Notes section.');
  assert.deepEqual(protocolErrors, []);
  const jobRequests = requests.filter(url => url.includes('linkedin.com') || url.includes('lever.co') || url.includes('ashbyhq.com'));
  assert.deepEqual(jobRequests, ['https://www.linkedin.com/jobs/view/123456789/', 'https://www.linkedin.com/jobs/view/900000001/', 'https://www.linkedin.com/jobs/view/900000001/']);
  checks.push('Only three test-driver fixture navigations requested job/ATS URLs; no extension-initiated job/ATS requests.');
  const report = { version, browser: session.capabilities.browserVersion, geckodriver: session.capabilities['moz:geckodriverVersion'],
    fixture: 'Generated synthetic legacy and SDUI test markup only. No saved pages, real job descriptions, or live LinkedIn access.', checks,
    jobRequests, protocolErrors };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (sessionId) await call('', undefined, 'DELETE').catch(() => {});
  ws?.close();
  driver.kill();
  await writeFile(join(output, 'geckodriver.log'), driverLog);
}
