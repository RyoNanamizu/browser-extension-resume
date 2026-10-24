import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { JobDraft } from '../src/core/model';

const html = await readFile('public/popup.html', 'utf8');
const compiled = await build({ entryPoints: ['src/popup.ts'], bundle: true, format: 'iife', write: false });
const code = compiled.outputFiles[0]!.text;
function job(): JobDraft {
  return { companyName: 'Fixture Company', jobTitle: 'Engineer', description: 'Original description',
    sourceUrl: 'https://www.linkedin.com/jobs/view/123/', jobId: '123',
    extractedAt: '2026-10-24T12:00:00.000Z', applicationType: 'external',
    applicationUrl: 'https://jobs.ashbyhq.com/team/1', applicationUrlStatus: 'available',
    atsName: 'Ashby', warningCodes: [] };
}
async function settle() {
  for (let i = 0; i < 4; i++) await new Promise<void>(resolve => setImmediate(resolve));
}
function popup() {
  const page = new JSDOM(html, { url: 'https://extension-test.example/popup.html', runScripts: 'outside-only' });
  const calls = { tabs: 0, injections: 0, messages: [] as { type: string; job: JobDraft }[] };
  const state = { failInjection: false, reply: { ok: true, id: 1 } as unknown,
    downloadState: 'complete', error: undefined as string | undefined };
  let changed: (delta: unknown) => void = () => {};
  Object.assign(page.window, { TextEncoder, chrome: {
    tabs: { query: async () => { calls.tabs++; return [{ id: 1, url: job().sourceUrl }]; },
      get: async () => ({ id: 1, url: job().sourceUrl }) },
    scripting: { executeScript: async () => {
      calls.injections++;
      if (state.failInjection) throw new Error('Denied');
      return [{ frameId: 0, result: { ok: true, job: job() } }];
    } },
    runtime: { sendMessage: async (message: { type: string; job: JobDraft }) => { calls.messages.push(message); return state.reply; } },
    downloads: { search: async () => [{ state: state.downloadState, error: state.error }],
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } } },
  } });
  page.window.eval(code);
  const document = page.window.document;
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const input = (id: string, value: string) => {
    const field = get<HTMLInputElement>(id);
    field.value = value;
    field.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  };
  return { page, get, input, calls, state, changed: (value: unknown) => changed(value) };
}

test('opening the popup reads no tab or DOM and starts no download', () => {
  const ui = popup();
  assert.equal(ui.calls.tabs, 0);
  assert.equal(ui.calls.injections, 0);
  assert.equal(ui.calls.messages.length, 0);
  assert.equal(ui.get<HTMLFormElement>('editor').hidden, true);
  ui.page.window.close();
});

test('editing the preview updates payload, ATS, and filename without interpreting HTML', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  ui.input('company', '新公司/平台');
  ui.input('title', '<img src=x onerror=alert(1)>');
  ui.input('description', '用户原文。\n\n- 条目');
  ui.input('application-url', 'https://jobs.lever.co/team/123');
  assert.equal(ui.get<HTMLInputElement>('ats').value, 'Lever');
  assert.equal(ui.get('filename').textContent, 'new-jd-新公司-平台.txt');
  assert.equal(ui.page.window.document.querySelector('img'), null);
  ui.get('download').click(); await settle();
  const payload = ui.calls.messages[0]!.job;
  assert.equal(payload.jobTitle, '<img src=x onerror=alert(1)>');
  assert.equal(payload.description, '用户原文。\n\n- 条目');
  assert.equal(payload.atsName, 'Lever');
  ui.page.window.close();
});

test('required empty fields disable download; unknown method remains exportable', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  ui.input('company', '');
  assert.equal(ui.get<HTMLButtonElement>('download').disabled, true);
  ui.input('company', 'Manual company');
  ui.input('application-type', 'unknown');
  ui.input('application-url', '');
  assert.equal(ui.get<HTMLButtonElement>('download').disabled, false);
  ui.get('download').click(); await settle();
  assert.equal(ui.calls.messages[0]!.job.applicationType, 'unknown');
  ui.page.window.close();
});

test('re-extraction asks before overwriting edits, then replaces only after confirmation', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  ui.input('company', 'Edited');
  ui.get('reextract').click(); await settle();
  assert.equal(ui.calls.injections, 1);
  assert.equal(ui.get('overwrite').hidden, false);
  ui.get('cancel-reextract').click();
  assert.equal(ui.get<HTMLInputElement>('company').value, 'Edited');
  ui.get('reextract').click();
  ui.get('confirm-reextract').click(); await settle();
  assert.equal(ui.calls.injections, 2);
  assert.equal(ui.get<HTMLInputElement>('company').value, 'Fixture Company');
  ui.page.window.close();
});

test('Easy Apply resets the entry URL; switching back clears stale Easy Apply data', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  ui.input('application-type', 'easy_apply');
  assert.equal(ui.get<HTMLInputElement>('application-url').value, job().sourceUrl);
  assert.equal(ui.get<HTMLInputElement>('application-url').readOnly, true);
  assert.equal(ui.get<HTMLInputElement>('ats').value, '');
  ui.input('application-type', 'external');
  assert.equal(ui.get<HTMLInputElement>('application-url').value, '');
  assert.equal(ui.get<HTMLInputElement>('application-url').readOnly, false);
  ui.page.window.close();
});

test('download failure and cancellation leave the preview retryable', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  for (const cancelled of [true, false]) {
    ui.state.reply = { ok: false, cancelled };
    ui.get('download').click(); await settle();
    assert.equal(ui.get<HTMLButtonElement>('download').disabled, false);
    assert.equal(ui.get('editor').hidden, false);
  }
  ui.state.reply = { ok: true, id: 1 };
  ui.state.downloadState = 'in_progress';
  ui.get('download').click(); await settle();
  assert.equal(ui.get<HTMLButtonElement>('download').disabled, true);
  ui.changed({ id: 1, state: { current: 'interrupted' }, error: { current: 'USER_CANCELED' } });
  assert.match(ui.get('status').textContent!, /已取消/);
  assert.equal(ui.get<HTMLButtonElement>('download').disabled, false);
  ui.page.window.close();
});

test('failed re-extraction removes the old preview and allows a fresh attempt', async () => {
  const ui = popup();
  ui.get('extract').click(); await settle();
  ui.state.failInjection = true;
  ui.get('reextract').click(); await settle();
  assert.equal(ui.get('editor').hidden, true);
  assert.equal(ui.get<HTMLButtonElement>('extract').disabled, false);
  ui.state.failInjection = false;
  ui.get('extract').click(); await settle();
  assert.equal(ui.get('editor').hidden, false);
  ui.page.window.close();
});
