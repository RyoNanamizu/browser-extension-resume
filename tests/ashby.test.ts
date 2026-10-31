import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractCurrentJob } from '../src/extract/adapter';
import type { ExtractionResult, JobDraft } from '../src/core/model';
import { toJobExport } from '../src/core/draft';
import { formatTxt } from '../src/core/txt';
import { ashbyJobId, ashbySourceUrl as source, makePage } from './pages.mjs';

async function dom(html = makePage('ashby-hosted')) {
  const page = new JSDOM(html, { url: source });
  await new Promise<void>(resolve => page.window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  return page;
}

function success(result: ExtractionResult): JobDraft {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected an extracted Ashby job');
  return result.job;
}

test('hosted Ashby extracts URL company, title, all 32 list items, and the description ending', async () => {
  const page = await dom();
  let clicks = 0;
  page.window.document.addEventListener('click', () => clicks++);
  const job = success(extractCurrentJob(page.window.document, () => source + '?utm_source=example',
    () => new Date('2026-10-29T12:00:00.000Z')));
  assert.equal(job.companyName, 'example.ai');
  assert.equal(job.jobTitle, 'Synthetic Web Engineer');
  assert.equal(job.jobId, ashbyJobId);
  assert.equal(job.sourceUrl, source);
  assert.equal(job.applicationUrl, source);
  assert.equal(job.applicationType, 'external');
  assert.equal(job.applicationUrlStatus, 'available');
  assert.equal(job.atsName, 'Ashby');
  assert.equal(job.extractedAt, '2026-10-29T12:00:00.000Z');
  assert.deepEqual(job.warningCodes, []);
  assert.equal((job.description.match(/^- /gm) || []).length, 32);
  assert.match(job.description, /^Synthetic opening paragraph with original wording\./);
  assert.match(job.description, /Line one\.\nLine two\./);
  assert.match(job.description, /End of the synthetic Ashby description\.$/);
  for (const excluded of ['Display Company', 'Example City', 'Example Team', 'Recommended Job',
    'Unrelated recommended content', 'Apply for this Job', 'Powered by Ashby', 'Privacy Policy']) {
    assert.ok(!job.description.includes(excluded), excluded);
  }
  const txt = formatTxt(toJobExport(job));
  assert.ok(txt.includes('Company Name: example.ai'));
  assert.ok(txt.includes('Application URL: ' + source + '\nATS: Ashby'));
  assert.ok(txt.includes('Source URL: ' + source));
  assert.ok(!txt.includes('LinkedIn URL:'));
  assert.equal(clicks, 0);
  page.window.close();
});

test('Ashby company comes only from the URL even without a header or document title', async () => {
  const page = await dom();
  page.window.document.querySelector('.ashby-job-posting-header')!.remove();
  page.window.document.title = '';
  const url = source.replace('example.ai', 'Another-Company.ai');
  page.window.document.querySelector('#job-overview')!.setAttribute('href', url);
  assert.equal(success(extractCurrentJob(page.window.document, () => url)).companyName, 'Another-Company.ai');
  page.window.close();
});

test('Ashby uses the source URL regardless of missing or conflicting application controls', async () => {
  const page = await dom();
  page.window.document.querySelector('#job-application-form')!.remove();
  const apply = page.window.document.querySelector('.apply-link')!;
  apply.setAttribute('href', 'https://jobs.lever.co/unrelated');
  assert.equal(success(extractCurrentJob(page.window.document, () => source)).applicationUrl, source);
  apply.remove();
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.applicationUrl, source);
  assert.deepEqual(result.warningCodes, []);
  page.window.close();
});

test('Ashby selectors work without generated classes and ignore hidden duplicate postings', async () => {
  const page = await dom();
  for (const element of page.window.document.querySelectorAll('[class]')) {
    for (const name of [...element.classList]) if (name.startsWith('generated-')) element.classList.remove(name);
  }
  const hidden = page.window.document.createElement('div');
  hidden.hidden = true;
  hidden.innerHTML = '<h1 class="ashby-job-posting-heading">Hidden Job</h1><div class="ashby-job-posting-description">Hidden description</div>';
  page.window.document.body.append(hidden);
  assert.equal(success(extractCurrentJob(page.window.document, () => source)).jobTitle, 'Synthetic Web Engineer');
  page.window.close();
});

for (const [selector, field, warning] of [
  ['.ashby-job-posting-description', 'description', 'description_missing'],
  ['.ashby-job-posting-heading', 'jobTitle', 'title_missing'],
] as const) {
  test('Ashby missing ' + field + ' remains empty for manual completion', async () => {
    const page = await dom();
    page.window.document.querySelector(selector)!.remove();
    const job = success(extractCurrentJob(page.window.document, () => source));
    assert.equal(job[field], '');
    assert.ok(job.warningCodes.includes(warning));
    assert.throws(() => toJobExport(job));
    page.window.close();
  });

  test('multiple visible Ashby ' + field + ' fields are ambiguous', async () => {
    const page = await dom();
    const node = page.window.document.querySelector(selector)!;
    node.parentElement!.append(node.cloneNode(true));
    assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error: 'ambiguous_container' });
    page.window.close();
  });
}

test('stale Ashby overview links reject changed job IDs, companies, and sites', async () => {
  const page = await dom();
  for (const href of [source.replace(ashbyJobId, 'another-job'), source.replace('example.ai', 'another-company'),
    'https://www.linkedin.com/jobs/view/123/', 'https://evil.example/job', '', 'https://[invalid']) {
    page.window.document.querySelector('#job-overview')!.setAttribute('href', href);
    assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error: 'job_changed' });
  }
  page.window.close();
});

test('a stale Ashby company header rejects the old company even with the same job ID', async () => {
  const page = await dom();
  page.window.document.querySelector('.ashby-job-board-back-to-all-jobs-button')!.setAttribute('href', '/another-company');
  assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error: 'job_changed' });
  page.window.close();
});

test('Ashby navigation during extraction is checked using the complete source URL', async () => {
  const page = await dom();
  let reads = 0;
  assert.deepEqual(extractCurrentJob(page.window.document, () => ++reads === 1
    ? source : source.replace('example.ai', 'another-company')), { ok: false, error: 'job_changed' });
  page.window.close();
});

test('core validation rejects Easy Apply on an Ashby source', async () => {
  const page = await dom();
  const job = success(extractCurrentJob(page.window.document, () => source));
  assert.throws(() => toJobExport({ ...job, applicationType: 'easy_apply' }), /unsupported/);
  page.window.close();
});

for (const [html, error] of [
  ['<div id="root"></div>', 'page_loading'],
  ['<div id="root"><p>Unknown layout</p></div>', 'missing_container'],
  ['<div id="root"><div role="alert">This job is no longer available</div></div>', 'expired_job'],
  ['<div id="root"><div class="ashby-job-posting-right-pane" aria-busy="true">Loading job</div></div>', 'page_loading'],
] as const) {
  test('Ashby page failure: ' + error + ' for ' + html.slice(0, 65), async () => {
    const page = await dom(html);
    assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error });
    page.window.close();
  });
}
