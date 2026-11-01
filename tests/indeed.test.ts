import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractCurrentJob } from '../src/extract/adapter';
import { parseJobSource, supportsApplicationType } from '../src/core/sources';
import { revalidateDraft, toJobExport } from '../src/core/draft';
import { formatTxt } from '../src/core/txt';
import { isJobDraft } from '../src/platform/download';
import type { ExtractionResult, JobDraft } from '../src/core/model';

const id = 'abc123def4567890';
const source = 'https://ca.indeed.com/viewjob?jk=' + id;
// Synthetic RN Web structure, no saved job text or account state.
function markup(label = 'Apply on company site') {
  return `<!doctype html><link rel="canonical" href="${source}"><div data-testid="viewjob-main-content">
    <div data-testid="desktop-job-header"><h5 data-testid="vj-job-title">Synthetic AI Developer</h5>
    <div data-testid="company-info-metadata"><a href="/cmp/example">Example Company</a><span>3.6</span><span>Remote</span></div>
    <div data-testid="primary-apply-action"><a data-testid="viewjob-apply" href="/applystart?jk=${id}&amp;from=vj">${label}</a></div></div>
    <div data-testid="viewjob-job-content"><h4 data-testid="vj-job-description-heading">Full job description</h4>
    <div class="react-native-html-content simple-job-description-html"><style>.x { color: red }</style><p>Original <b>opening</b>.</p>
    <ul><li>Build systems.</li><li>Review changes.</li></ul><p>Final paragraph.</p><span hidden>Hidden text</span></div></div>
    <aside><h5 data-testid="vj-job-title">Other Job</h5><a data-testid="viewjob-apply">Apply now</a><span role="progressbar"></span></aside></div>`;
}
async function page(html = markup()) {
  const dom = new JSDOM(html, { url: source });
  await new Promise<void>(resolve => dom.window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  return dom;
}
function success(result: ExtractionResult): JobDraft {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected Indeed job');
  return result.job;
}

test('Indeed URL parsing normalizes tracking while requiring a unique safe job ID and exact source', () => {
  assert.deepEqual(parseJobSource(source + '&from=saved#description'), { siteId: 'indeed', jobId: id, sourceUrl: source });
  assert.equal(supportsApplicationType(parseJobSource(source)!, 'easy_apply'), true);
  for (const url of [source + '&jk=other', source + '&jk=', source.replace(id, ''), source.replace(id, '%20'),
    source.replace(id, 'a%2Fb'), source.replace(id, 'a%00b'), source.replace('https:', 'http:'),
    source.replace('ca.indeed.com', 'ca.indeed.com.evil.example'), source.replace('ca.indeed.com', 'www.indeed.com'),
    source.replace('/viewjob', '/applystart'), source.replace('/viewjob', '/jobs'),
    source.replace('ca.indeed.com', 'u:p@ca.indeed.com'), source.replace('ca.indeed.com', 'ca.indeed.com:8443')]) {
    assert.equal(parseJobSource(url), null, url);
  }
});

test('Indeed external extraction preserves JD and uses the job page regardless of apply href', async () => {
  const dom = await page();
  let clicks = 0;
  dom.window.document.addEventListener('click', () => clicks++);
  for (const href of ['/applystart?jk=' + id, 'https://jobs.lever.co/example/job', 'javascript:alert(1)', '']) {
    dom.window.document.querySelector('[data-testid="viewjob-apply"]')!.setAttribute('href', href);
    const job = success(extractCurrentJob(dom.window.document, () => source + '&from=saved', () => new Date('2026-11-01T12:00:00Z')));
    assert.equal(job.companyName, 'Example Company');
    assert.equal(job.jobTitle, 'Synthetic AI Developer');
    assert.equal(job.jobId, id);
    assert.equal(job.extractedAt, '2026-11-01T12:00:00.000Z');
    assert.equal(job.description, 'Original opening.\n\n- Build systems.\n\n- Review changes.\n\nFinal paragraph.');
    assert.equal(job.applicationUrl, source);
    assert.equal(job.applicationType, 'external');
    assert.equal(job.atsName, null);
    assert.deepEqual(job.warningCodes, []);
    assert.equal(isJobDraft(job), true);
    assert.match(formatTxt(toJobExport(job)), /Application URL: https:\/\/ca\.indeed\.com\/viewjob\?jk=abc123def4567890\nATS: Unrecognized External ATS/);
  }
  assert.equal(clicks, 0);
  dom.window.close();
});

test('Apply now maps to Indeed easily apply, including whitespace and no href', async () => {
  const dom = await page(markup(' Apply\n now '));
  dom.window.document.querySelector('[data-testid="viewjob-apply"]')!.removeAttribute('href');
  const job = success(extractCurrentJob(dom.window.document, () => source));
  assert.equal(job.applicationType, 'easy_apply');
  assert.equal(job.atsName, 'Indeed easily apply');
  assert.equal(job.applicationUrl, source);
  assert.deepEqual(job.warningCodes, []);
  const output = formatTxt(toJobExport(job));
  assert.match(output, /Application Type: Indeed easily apply/);
  assert.match(output, /ATS: Indeed easily apply/);
  assert.ok(!output.includes('LinkedIn'));
  dom.window.close();
});

test('missing, empty and conflicting primary buttons are unknown; matching duplicates agree', async () => {
  for (const mode of ['missing', 'empty', 'conflict', 'duplicate', 'hidden']) {
    const dom = await page();
    const control = dom.window.document.querySelector('[data-testid="primary-apply-action"]')!;
    if (mode === 'missing') control.remove();
    if (mode === 'empty') control.textContent = '';
    if (mode === 'hidden') control.setAttribute('hidden', '');
    if (mode === 'conflict') control.insertAdjacentHTML('beforeend', '<button data-testid="viewjob-apply">Apply now</button>');
    if (mode === 'duplicate') control.append(control.firstElementChild!.cloneNode(true));
    const job = success(extractCurrentJob(dom.window.document, () => source));
    assert.equal(job.applicationType, mode === 'duplicate' ? 'external' : 'unknown', mode);
    assert.equal(job.warningCodes.includes('application_unknown'), mode !== 'duplicate');
    assert.equal(job.warningCodes.includes('application_conflict'), mode === 'conflict');
    assert.equal(job.applicationUrl, source);
    dom.window.close();
  }
});

test('Indeed draft edits cannot replace the fixed URL or invent an ATS', async () => {
  const dom = await page();
  const job = success(extractCurrentJob(dom.window.document, () => source));
  for (const applicationType of ['easy_apply', 'external', 'unknown'] as const) {
    const edited = revalidateDraft({ ...job, applicationType, applicationUrl: 'https://jobs.lever.co/other',
      applicationUrlStatus: 'invalid', atsName: 'Lever', atsOverride: { url: source, value: 'Workday' },
      warningCodes: ['application_url_invalid'] });
    assert.equal(edited.applicationUrl, source);
    assert.equal(edited.applicationUrlStatus, 'available');
    assert.equal(edited.atsName, applicationType === 'easy_apply' ? 'Indeed easily apply' : null);
    assert.equal(edited.atsOverride, undefined);
    assert.ok(!edited.warningCodes.includes('application_url_invalid'));
    assert.equal(toJobExport(edited).applicationUrl, source);
  }
  dom.window.close();
});

test('Indeed rejects stale canonical, apply job ID, ambiguous roots and changing active URL', async () => {
  for (const mode of ['canonical', 'apply', 'duplicate-id', 'root', 'title', 'changed']) {
    const dom = await page();
    const d = dom.window.document;
    if (mode === 'canonical') d.querySelector('link')!.setAttribute('href', source.replace(id, 'another'));
    if (mode === 'apply') d.querySelector('[data-testid="viewjob-apply"]')!.setAttribute('href', '/applystart?jk=another');
    if (mode === 'duplicate-id') d.querySelector('[data-testid="viewjob-apply"]')!.setAttribute('href', '/applystart?jk=' + id + '&jk=another');
    if (mode === 'root') d.body.append(d.querySelector('[data-testid="viewjob-main-content"]')!.cloneNode(true));
    if (mode === 'title') d.querySelector('[data-testid="desktop-job-header"]')!.insertAdjacentHTML('beforeend', '<h5 data-testid="vj-job-title">Another</h5>');
    let reads = 0;
    const result = extractCurrentJob(d, () => mode === 'changed' && reads++ ? source.replace(id, 'another') : source);
    assert.deepEqual(result, { ok: false, error: ['root', 'title'].includes(mode) ? 'ambiguous_container' : 'job_changed' }, mode);
    dom.window.close();
  }
});

function dataScript(overrides = {}) {
  return '<script>window._rootProps = ' + JSON.stringify({ preloadedVJData: { jobKey: id, jobTitle: 'Fallback {Title}',
    companyTabModel: { companyName: 'Fallback Company' }, jobInfoWrapperModel: { jobInfoModel: {
      sanitizedJobDescription: '<p>Fallback "description" {braces}.</p><ul><li>Last item.</li></ul>' } }, ...overrides } })
    + '; throw new Error("Must not execute");</script>';
}

test('embedded job JSON supplies missing fields without executing scripts and with a fallback warning', async () => {
  const dom = await page('<div data-testid="viewjob-main-content"><div data-testid="primary-apply-action"><button data-testid="viewjob-apply">Apply now</button></div></div>' + dataScript());
  const job = success(extractCurrentJob(dom.window.document, () => source));
  assert.equal(job.companyName, 'Fallback Company');
  assert.equal(job.jobTitle, 'Fallback {Title}');
  assert.match(job.description, /^Fallback "description" \{braces\}\./);
  assert.match(job.description, /- Last item\.$/);
  assert.deepEqual(job.warningCodes, ['fallback_extraction']);
  dom.window.close();
});

test('job JSON catches stale and expired jobs; malformed JSON does not break supported DOM', async () => {
  for (const [script, error] of [
    [dataScript({ jobKey: 'another' }), 'job_changed'],
    [dataScript({ jobInfoWrapperModel: { jobInfoModel: { showExpiredHeader: true } } }), 'expired_job'],
    ['<script>window._rootProps = { broken: true };</script>', null],
  ] as const) {
    const dom = await page(markup() + script);
    const result = extractCurrentJob(dom.window.document, () => source);
    if (error) assert.deepEqual(result, { ok: false, error });
    else assert.equal(success(result).jobTitle, 'Synthetic AI Developer');
    dom.window.close();
  }
});

test('empty, loading and partial Indeed pages report errors or required field warnings', async () => {
  for (const [html, error] of [['<div id="root"></div>', 'page_loading'], ['<p>Unknown layout</p>', 'missing_container'],
    [markup().replace('<h5 data-testid="vj-job-title">', '<span role="progressbar"></span><h5 data-testid="vj-job-title">'), 'page_loading']] as const) {
    const dom = await page(html);
    assert.deepEqual(extractCurrentJob(dom.window.document, () => source), { ok: false, error });
    dom.window.close();
  }
  const dom = await page(markup());
  dom.window.document.querySelector('[data-testid="company-info-metadata"]')!.remove();
  const job = success(extractCurrentJob(dom.window.document, () => source));
  assert.ok(job.warningCodes.includes('company_missing'));
  assert.throws(() => toJobExport(job));
  dom.window.close();
});
