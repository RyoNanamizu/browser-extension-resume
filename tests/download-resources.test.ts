import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadResources } from '../src/platform/download-resources';
import { startDownload } from '../src/platform/download';
import type { JobDraft } from '../src/core/model';

function harness(initialState = 'in_progress') {
  let changed: (delta: { id: number; state: { current: string } }) => void = () => {};
  const revoked: string[] = [];
  const resources = createDownloadResources({
    onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    search: async () => [{ state: initialState }],
  } as unknown as Pick<typeof chrome.downloads, 'onChanged' | 'search'>, {
    createObjectURL: () => 'blob:extension-owned', revokeObjectURL: url => { revoked.push(url); },
  });
  return { resources, revoked, changed: (state: string) => changed({ id: 7, state: { current: state } }) };
}

for (const terminal of ['complete', 'interrupted']) {
  test(`background Blob is released only after ${terminal}`, async () => {
    const state = harness();
    const resource = state.resources.create('中文文本');
    assert.equal(resource.url, 'blob:extension-owned');
    state.resources.track(7, resource);
    await new Promise<void>(resolve => setImmediate(resolve));
    state.changed('in_progress');
    assert.deepEqual(state.revoked, []);
    state.changed(terminal);
    state.changed(terminal);
    assert.deepEqual(state.revoked, ['blob:extension-owned']);
  });
}

test('download completion before ID tracking still releases the Blob', async () => {
  const state = harness('complete');
  state.resources.track(7, state.resources.create('text'));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(state.revoked, ['blob:extension-owned']);
});

test('service-worker environments use an exact UTF-8 data URL without DOM APIs', () => {
  const resources = createDownloadResources({
    onChanged: { addListener() {} }, search: async () => [],
  } as unknown as Pick<typeof chrome.downloads, 'onChanged' | 'search'>, {});
  const data = resources.create('中文\n- text');
  assert.ok(data.url.startsWith('data:text/plain;charset=utf-8;base64,'));
  assert.equal(Buffer.from(data.url.split(',')[1]!, 'base64').toString('utf8'), '中文\n- text');
});

test('a failed download releases its background Blob immediately', async () => {
  const state = harness();
  const job: JobDraft = { companyName: 'A', jobTitle: 'B', description: 'C',
    applicationType: 'easy_apply', applicationUrl: null, applicationUrlStatus: 'missing', atsName: null,
    sourceUrl: 'https://www.linkedin.com/jobs/view/1/', jobId: '1', extractedAt: '2026-10-24T12:00:00Z', warningCodes: [] };
  const result = await startDownload(job, {
    download: async () => { throw new Error('FILE_FAILED'); },
  } as unknown as Pick<typeof chrome.downloads, 'download'>, state.resources);
  assert.deepEqual(result, { ok: false, cancelled: false });
  assert.deepEqual(state.revoked, ['blob:extension-owned']);
});
