import type { ExtractionResult } from '../core/model';
import { isSameJobSource, parseJobSource } from '../core/source-url';
import { extractors } from './registry';

export function extractCurrentJob(document: Document, currentUrl: () => string,
  now: () => Date = () => new Date()): ExtractionResult {
  const source = parseJobSource(currentUrl());
  if (!source) return { ok: false, error: 'unsupported_page' };
  const result = extractors[source.siteId]({ document, source, now });
  if (!isSameJobSource(source, parseJobSource(currentUrl()))) return { ok: false, error: 'job_changed' };
  if (result.ok && (result.job.sourceUrl !== source.sourceUrl || result.job.jobId !== source.jobId)) {
    return { ok: false, error: 'job_changed' };
  }
  return result;
}
