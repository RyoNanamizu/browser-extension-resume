import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from './pages.mjs';
import { JSDOM } from 'jsdom';
import { extractCurrentJob } from '../src/extract/adapter';
import type { ExtractionResult, JobDraft } from '../src/core/model';

const source = 'https://www.linkedin.com/jobs/view/123456789/?tracking=1';
async function fixture(name: string) { return makePage(name); }
async function dom(html: string) {
  const page = new JSDOM(html, { url: source });
  await new Promise<void>(resolve => page.window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  return page;
}
function success(result: ExtractionResult): JobDraft {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected extracted job');
  return result.job;
}

test('Easy Apply fixture preserves paragraphs/lists and excludes recommendations and controls', async () => {
  const page = await dom(await fixture('easy-apply'));
  const extracted = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(extracted.companyName, 'Marble AI');
  assert.equal(extracted.jobTitle, 'Software Engineer');
  assert.equal(extracted.applicationType, 'easy_apply');
  assert.equal(extracted.applicationUrl, 'https://www.linkedin.com/jobs/view/123456789/');
  assert.match(extracted.description, /Build useful tools\n\nWe build reliable products\.\n\nKeep the original paragraphs\./);
  assert.match(extracted.description, /- Write TypeScript\.[\s\S]*- Review code\.[\s\S]*- Share feedback\./);
  assert.match(extracted.description, /Line one\.\nLine two\./);
  for (const forbidden of ['Show more', 'Wrong Company', 'Recommended', 'Hidden tracking', 'Not job content']) {
    assert.ok(!extracted.description.includes(forbidden), forbidden);
  }
  assert.deepEqual(extracted.warningCodes, []);
  page.window.close();
});

test('Ashby fixture reads only the primary Apply href and does not click links', async () => {
  const page = await dom(await fixture('ashby'));
  let clicks = 0;
  page.window.document.addEventListener('click', () => clicks++);
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.atsName, 'Ashby');
  assert.equal(result.applicationUrl, 'https://jobs.ashbyhq.com/marble.ai/6f832eeb-08ff-4fb7-8788-420633a72960/application');
  assert.equal(result.applicationType, 'external');
  assert.ok(!JSON.stringify(result).includes('urlhash'));
  assert.equal(clicks, 0);
  page.window.close();
});

test('Chinese primary controls and CSS-collapsed DOM content are preserved without speculative warnings', async () => {
  const page = await dom(await fixture('chinese-collapsed'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.companyName, '星河科技 🚀');
  assert.equal(result.jobTitle, '软件工程师 / 平台');
  assert.equal(result.applicationType, 'easy_apply');
  assert.ok(result.description.includes('这段内容在 DOM 中，但在折叠区下方。'));
  assert.deepEqual(result.warningCodes, []);
  assert.equal(page.window.document.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'), 'false');
  page.window.close();
});

test('event-driven Apply has no URL; no arbitrary careers link is substituted', async () => {
  const page = await dom(await fixture('event-apply'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.applicationType, 'external');
  assert.equal(result.applicationUrl, null);
  assert.equal(result.atsName, null);
  assert.ok(result.warningCodes.includes('application_url_missing'));
  assert.match(result.description, /- Discuss the problem\.[\s\S]*- Build the solution\./);
  page.window.close();
});

test('conflicting primary controls produce unknown with review warning', async () => {
  const page = await dom((await fixture('ashby')).replace('</h1>', '</h1><button class="jobs-apply-button">Easy Apply</button>'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.applicationType, 'unknown');
  assert.equal(result.applicationUrl, null);
  assert.ok(result.warningCodes.includes('application_conflict'));
  page.window.close();
});

test('Easy Apply name plus an external href is conflicting evidence', async () => {
  const page = await dom((await fixture('ashby')).replace('>Apply</a>', '>Easy Apply</a>'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.applicationType, 'unknown');
  assert.equal(result.atsName, 'Ashby');
  assert.ok(result.warningCodes.includes('application_conflict'));
  page.window.close();
});

test('missing fields remain empty for manual completion instead of using recommendations', async () => {
  const page = await dom((await fixture('easy-apply')).replace('<h1>Software Engineer</h1>', '')
    .replace('<div class="job-details-jobs-unified-top-card__company-name"><a href="/company/marble-ai/">Marble AI</a></div>', ''));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.jobTitle, '');
  assert.equal(result.companyName, '');
  assert.ok(result.warningCodes.includes('company_missing'));
  assert.ok(result.warningCodes.includes('title_missing'));
  page.window.close();
});

test('missing descriptions do not fall back to whole-page or company text', async () => {
  const page = await dom('<main class="jobs-details"><h1>Title</h1><div data-testid="company-name">Company</div><p>Unrelated company information</p></main>');
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.description, '');
  assert.ok(result.warningCodes.includes('description_missing'));
  page.window.close();
});

for (const [html, error] of [
  ['<main><div class="authwall">Sign in</div></main>', 'login_required'],
  ['<main class="job-view-layout"><div role="alert">This job is no longer available</div></main>', 'expired_job'],
  ['<main><div aria-busy="true">Loading job</div></main>', 'page_loading'],
  ['<main><p>No current job details</p></main>', 'missing_container'],
  ['<main><section data-testid="job-details"><h1>A</h1></section><section data-testid="job-details"><h1>B</h1></section></main>', 'ambiguous_container'],
] as const) {
  test(`explicit page failure: ${error}`, async () => {
    const page = await dom(html);
    assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error });
    page.window.close();
  });
}

test('unsupported lists are rejected before DOM traversal', () => {
  const document = new Proxy({} as Document, { get() { throw new Error('Must not scan an unsupported page'); } });
  assert.deepEqual(extractCurrentJob(document, () => 'https://www.linkedin.com/jobs-tracker/'), { ok: false, error: 'unsupported_page' });
});

test('navigation during extraction discards the result; stale DOM IDs are also rejected', async () => {
  const page = await dom(await fixture('ashby'));
  let reads = 0;
  assert.deepEqual(extractCurrentJob(page.window.document, () => ++reads === 1 ? source : 'https://www.linkedin.com/jobs/view/999/'), { ok: false, error: 'job_changed' });
  page.window.document.querySelector('main')!.setAttribute('data-job-id', '999');
  assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error: 'job_changed' });
  page.window.close();
});

test('a loaded description without expansion controls has no generic completeness warning', async () => {
  const page = await dom(await fixture('ashby'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.deepEqual(result.warningCodes, []);
  page.window.close();
});

test('a busy current job with stale visible content is rejected until loading finishes', async () => {
  const page = await dom((await fixture('ashby')).replace('class="jobs-details"', 'class="jobs-details" aria-busy="true"'));
  assert.deepEqual(extractCurrentJob(page.window.document, () => source), { ok: false, error: 'page_loading' });
  page.window.close();
});

test('advertisement fields inside a details layout cannot supply job data', async () => {
  const advertisement = '<div aria-label="Advertisement" data-job-id="999"><h1>Ad title</h1><div data-testid="company-name">Ad company</div><div data-testid="job-description">Ad description</div><button class="jobs-apply-button">Easy Apply</button></div>';
  const page = await dom((await fixture('ashby')).replace('</main>', advertisement + '</main>'));
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.companyName, 'Marble AI');
  assert.equal(result.jobTitle, 'Software Engineer');
  assert.equal(result.applicationType, 'external');
  assert.ok(!result.description.includes('Ad description'));
  page.window.close();
});

test('semantic description lookup cannot escape the current job container', async () => {
  const page = await dom('<section><div data-testid="job-details"><h1>Title</h1><h2>About the job</h2></div><p>Unrelated outside text</p></section>');
  const result = success(extractCurrentJob(page.window.document, () => source));
  assert.equal(result.description, '');
  assert.ok(result.warningCodes.includes('description_missing'));
  page.window.close();
});
