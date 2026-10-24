import type { ExtractionResult } from '../core/model';
import { parseJobSource } from '../core/source-url';

export interface ExtractionPort {
  tabs: Pick<typeof chrome.tabs, 'query' | 'get'>;
  scripting: Pick<typeof chrome.scripting, 'executeScript'>;
}

export async function extractFromActiveTab(port: ExtractionPort): Promise<ExtractionResult> {
  const [tab] = await port.tabs.query({ active: true, currentWindow: true });
  const initial = parseJobSource(tab?.url || '');
  if (!initial || tab?.id === undefined) return { ok: false, error: 'unsupported_page' };
  const results = await port.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] }, files: ['extract.js'],
  });
  const final = await port.tabs.get(tab.id);
  const current = parseJobSource(final.url || '');
  if (!current || current.jobId !== initial.jobId) return { ok: false, error: 'job_changed' };
  const result = results.find(item => item.frameId === 0)?.result as ExtractionResult | undefined;
  if (!result || typeof result.ok !== 'boolean') throw new Error('Injection did not return a result.');
  if (result.ok && result.job.jobId !== initial.jobId) return { ok: false, error: 'job_changed' };
  return result;
}
