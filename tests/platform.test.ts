import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromActiveTab, type ExtractionPort } from '../src/platform/extraction';
import { isJobDraft, startDownload } from '../src/platform/download';
import type { JobDraft } from '../src/core/model';

const source = 'https://www.linkedin.com/jobs/view/123456789/';
function job(): JobDraft {
  return { companyName: '中文公司', jobTitle: '平台工程师', description: '说明。\n\n- 条目',
    sourceUrl: source, jobId: '123456789', extractedAt: '2026-10-24T12:00:00.000Z',
    applicationType: 'external', applicationUrl: 'https://jobs.ashbyhq.com/company/1',
    applicationUrlStatus: 'available', atsName: 'Ashby', warningCodes: [] };
}
function port(options: { initial?: string; final?: string; resultJob?: JobDraft; fail?: boolean } = {}) {
  const calls: unknown[] = [];
  return { calls, api: {
    tabs: { query: async () => [{ id: 7, url: options.initial ?? source }],
      get: async () => ({ id: 7, url: options.final ?? source }) },
    scripting: { executeScript: async (details: unknown) => {
      calls.push(details);
      if (options.fail) throw new Error('Missing activeTab permission');
      return [{ frameId: 0, result: { ok: true, job: options.resultJob ?? job() } }];
    } },
  } as unknown as ExtractionPort };
}

test('unsupported pages never trigger an injection', async () => {
  const mocked = port({ initial: 'https://www.linkedin.com/jobs/collections/saved/' });
  assert.deepEqual(await extractFromActiveTab(mocked.api), { ok: false, error: 'unsupported_page' });
  assert.equal(mocked.calls.length, 0);
});

test('on-demand extraction injects only the main frame of the selected tab', async () => {
  const mocked = port();
  assert.deepEqual(await extractFromActiveTab(mocked.api), { ok: true, job: job() });
  assert.deepEqual(mocked.calls, [{ target: { tabId: 7, frameIds: [0] }, files: ['extract.js'] }]);
});

test('job navigation across the asynchronous injection boundary discards results', async () => {
  const mocked = port({ final: 'https://www.linkedin.com/jobs/view/999/' });
  assert.deepEqual(await extractFromActiveTab(mocked.api), { ok: false, error: 'job_changed' });
  const mixed = port({ resultJob: { ...job(), jobId: '999' } });
  assert.deepEqual(await extractFromActiveTab(mixed.api), { ok: false, error: 'job_changed' });
});

test('permission/injection failures reach a recoverable popup error path', async () => {
  await assert.rejects(extractFromActiveTab(port({ fail: true }).api), /activeTab/);
});

test('background download uses local UTF-8 data and uniquify with current edited fields', async () => {
  let options: chrome.downloads.DownloadOptions | undefined;
  const downloads = { download: async (value: chrome.downloads.DownloadOptions) => { options = value; return 17; } };
  const draft = { ...job(), companyName: '新公司/团队', description: '编辑后的描述。' };
  assert.deepEqual(await startDownload(draft, downloads as typeof chrome.downloads), { ok: true, id: 17 });
  assert.equal(options?.filename, 'new-jd-新公司-团队.txt');
  assert.equal(options?.conflictAction, 'uniquify');
  assert.equal(options?.saveAs, false);
  assert.ok(options?.url.startsWith('data:text/plain;charset=utf-8;base64,'));
  const text = Buffer.from(options!.url.split(',')[1]!, 'base64').toString('utf8');
  assert.match(text, /Company Name: 新公司\/团队/);
  assert.match(text, /编辑后的描述。/);
});

test('download rejection and user cancellation return structured retryable outcomes', async () => {
  for (const [error, cancelled] of [['FILE_FAILED', false], ['USER_CANCELED', true]] as const) {
    const downloads = { download: async () => { throw new Error(error); } };
    assert.deepEqual(await startDownload(job(), downloads as unknown as typeof chrome.downloads), { ok: false, cancelled });
  }
});

test('download boundary rejects malformed drafts without calling the API', async () => {
  for (const draft of [null, {}, { ...job(), sourceUrl: 'https://evil.example' }, { ...job(), warningCodes: ['unknown-code'] }]) {
    assert.equal(isJobDraft(draft), false);
  }
  let called = false;
  assert.deepEqual(await startDownload({ ...job(), companyName: '' }, {
    download: async () => { called = true; return 1; },
  } as unknown as typeof chrome.downloads), { ok: false, cancelled: false });
  assert.equal(called, false);
});
