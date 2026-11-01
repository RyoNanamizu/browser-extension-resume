import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractCurrentJob } from '../src/extract/adapter';
import { revalidateDraft, toJobExport } from '../src/core/draft';
import { formatTxt } from '../src/core/txt';
import { exportMessages } from '../src/core/warnings';

const source = 'https://www.linkedin.com/jobs/view/123/';
const fixture = `<!doctype html><main data-job-id="123">
  <div><a href="/company/example/">Example Company</a><h1>Platform Engineer</h1>
    <a aria-label="Apply on company website" href="https://careers.example.org/123">Apply</a></div>
  <div><div><h2>About the job</h2></div><p>Build reliable software.</p>
    <ul><li>Review changes.</li></ul><p>End of description.</p></div>
  <aside><h1>Recommended Engineer</h1><a href="/company/other/">Other Company</a>
    <h2>About the job</h2><p>Unrelated description.</p><button>Easy Apply</button></aside>
</main>`;
async function page(html = fixture) {
  const dom = new JSDOM(html, { url: source });
  await new Promise<void>(resolve => dom.window.document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  return dom;
}
function extract(dom: JSDOM) { return extractCurrentJob(dom.window.document, () => source); }

test('unknown layout extracts with a mandatory warning despite complete fields', async () => {
  const dom = await page();
  const result = extract(dom);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected semantic extraction');
  assert.equal(result.job.companyName, 'Example Company');
  assert.equal(result.job.jobTitle, 'Platform Engineer');
  assert.equal(result.job.applicationUrl, 'https://careers.example.org/123');
  assert.match(result.job.description, /- Review changes\.[\s\S]*End of description\./);
  assert.ok(!result.job.description.includes('Unrelated'));
  assert.deepEqual(result.job.warningCodes, ['fallback_extraction']);
  const edited = revalidateDraft({ ...result.job, jobTitle: 'Edited title' });
  assert.deepEqual(edited.warningCodes, ['fallback_extraction']);
  assert.ok(formatTxt(toJobExport(edited)).includes(exportMessages.fallback_extraction));
  dom.window.close();
});

test('semantic extraction survives generated classes, extra wrappers and heading roles', async () => {
  const dom = await page(fixture.replace('<h1>Platform Engineer</h1>',
    '<div class="random-new-class"><div role="heading" aria-level="1">Platform Engineer</div></div>'));
  const result = extract(dom);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.deepEqual(result.job.warningCodes, ['fallback_extraction']);
  dom.window.close();
});

test('a main with explicit fields still warns when no known layout matches', async () => {
  const dom = await page(fixture.replace('<div><div><h2>About the job</h2></div>',
    '<div data-testid="job-description"><div><h2>About the job</h2></div>'));
  const result = extract(dom);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) assert.ok(result.job.warningCodes.includes('fallback_extraction'));
  dom.window.close();
});

test('fallback rejects stale data IDs, supporting slots, and title URLs', async () => {
  for (const html of [
    fixture.replace('data-job-id="123"', 'data-job-id="999"'),
    fixture.replace('</main>', '<div id="JobDetails_ManageJobBanner_999"></div></main>'),
    fixture.replace('Platform Engineer</h1>', '<a href="/jobs/view/999/">Platform Engineer</a></h1>'),
  ]) {
    const dom = await page(html);
    assert.deepEqual(extract(dom), { ok: false, error: 'job_changed' });
    dom.window.close();
  }
});

test('multiple semantic descriptions are rejected rather than selected by order', async () => {
  const dom = await page(fixture.replace('</main>', '<div><h2>Job description</h2><p>Another description.</p></div></main>'));
  assert.deepEqual(extract(dom), { ok: false, error: 'ambiguous_container' });
  dom.window.close();
});

test('fallback cannot borrow a company or description from excluded content', async () => {
  for (const html of [fixture.replace('<a href="/company/example/">Example Company</a>', ''),
    fixture.replace('<div><div><h2>About the job</h2></div><p>Build reliable software.</p>\n    <ul><li>Review changes.</li></ul><p>End of description.</p></div>', '')]) {
    const dom = await page(html);
    assert.deepEqual(extract(dom), { ok: false, error: 'missing_container' });
    dom.window.close();
  }
});

test('a recommendation spinner does not turn an unknown layout into a loading error', async () => {
  const dom = await page('<main><aside><span role="progressbar"></span></aside><p>Unknown layout</p></main>');
  assert.deepEqual(extract(dom), { ok: false, error: 'missing_container' });
  dom.window.close();
});
