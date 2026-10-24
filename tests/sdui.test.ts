import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from './pages.mjs';
import { JSDOM } from 'jsdom';
import { extractCurrentJob } from '../src/extract/adapter';
import { toJobExport } from '../src/core/draft';
import { formatTxt } from '../src/core/txt';
import type { ExtractionResult, JobDraft } from '../src/core/model';

const source = 'https://www.linkedin.com/jobs/view/900000001/';
const fixture = makePage('sdui-empty');
const loadedFixture = makePage('sdui-loaded');
async function page(html = fixture) {
  const dom = new JSDOM(html, { url: source });
  await new Promise<void>(resolve => dom.window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  return dom;
}
function job(result: ExtractionResult): JobDraft {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected current SDUI job');
  return result.job;
}
function extract(dom: JSDOM) { return extractCurrentJob(dom.window.document, () => source); }

test('synthetic SDUI layout extracts paragraph title, company link, and primary Apply href', async () => {
  const dom = await page();
  const result = job(extract(dom));
  assert.equal(dom.window.document.querySelector('h1'), null);
  assert.equal(result.companyName, 'Example Company');
  assert.equal(result.jobTitle, 'Platform Engineer');
  assert.equal(result.jobId, '900000001');
  assert.equal(result.applicationType, 'external');
  assert.equal(result.applicationUrl, 'https://careers.example.org/jobs/900000001?source=example');
  assert.equal(result.atsName, null);
  assert.ok(!JSON.stringify(result).includes('urlhash'));
  assert.ok(!JSON.stringify(result).includes('mt=example'));
  dom.window.close();
});

test('an empty description slot stays missing and blocks download until filled', async () => {
  const dom = await page();
  const result = job(extract(dom));
  assert.equal(result.description, '');
  assert.deepEqual(result.warningCodes, ['description_missing']);
  assert.throws(() => toJobExport(result), /required/);
  assert.doesNotThrow(() => toJobExport({ ...result, description: 'Manually supplied description.' }));
  dom.window.close();
});

test('a spinner in the synthetic recommendations slot does not mark this job as loading', async () => {
  const dom = await page();
  assert.ok(dom.window.document.querySelector('[role="progressbar"]'));
  assert.equal(extract(dom).ok, true);
  dom.window.close();
});

test('loaded SDUI description is confined to the matching job slot', async () => {
  const dom = await page();
  const marker = dom.window.document.getElementById('JobDetails_AboutTheJob_900000001')!;
  marker.innerHTML = '<div><p>Build reliable services.</p><p>Collaborate across teams.</p><ul><li>Write TypeScript.</li><li>Review changes.</li></ul><button aria-expanded="false">Show more</button></div>';
  const result = job(extract(dom));
  assert.match(result.description, /^Build reliable services\.\n\nCollaborate across teams\./);
  assert.match(result.description, /- Write TypeScript\.[\s\S]*- Review changes\./);
  for (const unwanted of ['Show more', 'Unrelated company overview', 'Recommended Engineer', 'assess how you fit']) {
    assert.ok(!result.description.includes(unwanted), unwanted);
  }
  assert.deepEqual(result.warningCodes, []);
  dom.window.close();
});

test('the current job slot must match the URL even when visible data looks complete', async () => {
  const dom = await page(fixture.replaceAll('900000001', '999'));
  assert.deepEqual(extract(dom), { ok: false, error: 'job_changed' });
  dom.window.close();
});

test('inconsistent id/componentkey job identities are rejected', async () => {
  const dom = await page(fixture.replace('componentkey="JobDetails_AboutTheJob_900000001"', 'componentkey="JobDetails_AboutTheJob_999"'));
  assert.deepEqual(extract(dom), { ok: false, error: 'job_changed' });
  dom.window.close();
});

test('multiple visible current-job slots are ambiguous', async () => {
  const dom = await page();
  const marker = dom.window.document.getElementById('JobDetails_AboutTheJob_900000001')!;
  marker.after(marker.cloneNode(true));
  assert.deepEqual(extract(dom), { ok: false, error: 'ambiguous_container' });
  dom.window.close();
});

test('SDUI Easy Apply uses the canonical job entry without following a link', async () => {
  const dom = await page();
  dom.window.document.querySelector('a[aria-label="Apply on company website"]')!.outerHTML = '<button aria-label="Easy Apply">Easy Apply</button>';
  const result = job(extract(dom));
  assert.equal(result.applicationType, 'easy_apply');
  assert.equal(result.applicationUrl, source);
  dom.window.close();
});

test('event-only SDUI Apply is missing a URL without borrowing a recommended job link', async () => {
  const dom = await page();
  dom.window.document.querySelector('a[aria-label="Apply on company website"]')!.outerHTML = '<button aria-label="Apply on company website">Apply</button>';
  const result = job(extract(dom));
  assert.equal(result.applicationType, 'external');
  assert.equal(result.applicationUrl, null);
  assert.equal(result.applicationUrlStatus, 'missing');
  dom.window.close();
});

test('conflicting SDUI primary controls are flagged without affecting sidebar scoping', async () => {
  const dom = await page();
  const apply = dom.window.document.querySelector('a[aria-label="Apply on company website"]')!;
  apply.insertAdjacentHTML('afterend', '<button>Easy Apply</button>');
  const result = job(extract(dom));
  assert.equal(result.applicationType, 'unknown');
  assert.ok(result.warningCodes.includes('application_conflict'));
  dom.window.close();
});

test('missing SDUI title remains empty instead of using location or recommended title', async () => {
  const dom = await page();
  [...dom.window.document.querySelectorAll('p')].find(element => element.textContent?.includes('Platform Engineer'))!.remove();
  const result = job(extract(dom));
  assert.equal(result.jobTitle, '');
  assert.equal(result.companyName, 'Example Company');
  assert.ok(result.warningCodes.includes('title_missing'));
  dom.window.close();
});

test('SDUI lookup is independent of generated CSS and binding UUID values', async () => {
  const dom = await page();
  for (const [index, element] of [...dom.window.document.querySelectorAll('*')].entries()) {
    element.setAttribute('class', `regenerated-${index}`);
  }
  dom.window.document.querySelector('[aria-label="Company, Example Company."]')!.setAttribute('componentkey', 'changed-binding-name');
  const result = job(extract(dom));
  assert.equal(result.jobTitle, 'Platform Engineer');
  assert.equal(result.companyName, 'Example Company');
  dom.window.close();
});

test('generated synthetic description retains all four lists and text after the expandable span', async () => {
  const dom = await page(loadedFixture);
  const slot = dom.window.document.getElementById('JobDetails_AboutTheJob_900000001')!;
  const expandable = slot.querySelector('[data-testid="expandable-text-box"]')!;
  const result = job(extract(dom));
  assert.equal(result.companyName, 'Example Company');
  assert.equal(result.jobTitle, 'Platform Engineer');
  assert.ok(result.description.length > 6000);
  assert.ok(result.description.length > expandable.textContent!.length * 4);
  assert.ok(result.description.includes('Role overview'));
  assert.ok(result.description.includes('Synthetic engineering role for automated testing.'));
  assert.ok(result.description.includes('End of the synthetic description.'));
  assert.equal(slot.querySelectorAll('ul,ol').length, 4);
  const items = [...slot.querySelectorAll('li')];
  assert.equal(items.length, 32);
  for (const item of items) {
    const expected = item.textContent!.replace(/\s+/g, ' ').trim();
    assert.ok(result.description.includes(`- ${expected}`), `Missing synthetic list item: ${expected}`);
  }
  assert.ok(!result.description.includes('Unrelated company overview'));
  assert.ok(!result.description.includes('Recommended Engineer'));
  assert.ok(!result.description.includes('… more'));
  assert.deepEqual(result.warningCodes, []);
  const exported = formatTxt(toJobExport(result));
  assert.ok(exported.includes(result.description));
  assert.ok(!exported.includes('Extraction Notes:'));
  dom.window.close();
});

test('a CSS-hidden SDUI expansion control does not add a warning', async () => {
  const dom = await page(loadedFixture);
  const slot = dom.window.document.getElementById('JobDetails_AboutTheJob_900000001')!;
  slot.querySelector('[data-testid="expandable-text-button"]')!.setAttribute('style', 'display: none');
  const result = job(extract(dom));
  assert.deepEqual(result.warningCodes, []);
  dom.window.close();
});

test('an expanded SDUI less control does not add a warning', async () => {
  const dom = await page(loadedFixture);
  const button = dom.window.document.querySelector('[data-testid="expandable-text-button"]')!;
  button.textContent = '… less';
  const result = job(extract(dom));
  assert.deepEqual(result.warningCodes, []);
  dom.window.close();
});

test('SDUI expansion controls outside the current description do not add a warning', async () => {
  const dom = await page();
  const document = dom.window.document;
  const main = document.querySelector('main')!;
  const section = document.createElement('section');
  section.append(...main.childNodes); main.append(section);
  document.getElementById('JobDetails_AboutTheJob_900000001')!.innerHTML = '<p>A loaded description with no expansion control.</p>';
  document.getElementById('JobDetails_AboutTheCompany_900000001')!.insertAdjacentHTML('beforeend', '<button>Show more</button>');
  const result = job(extract(dom));
  assert.deepEqual(result.warningCodes, []);
  dom.window.close();
});
