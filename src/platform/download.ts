import { toJobExport } from '../core/draft';
import { createFilename } from '../core/filename';
import type { JobDraft } from '../core/model';
import { parseJobSource } from '../core/source-url';
import { formatTxt, toTextDataUrl } from '../core/txt';
import { exportMessages } from '../core/warnings';
import type { DownloadResources, TextResource } from './download-resources';

export type DownloadReply = { ok: true; id: number } | { ok: false; cancelled: boolean };

export function isJobDraft(value: unknown): value is JobDraft {
  if (!value || typeof value !== 'object') return false;
  const job = value as JobDraft;
  const source = typeof job.sourceUrl === 'string' ? parseJobSource(job.sourceUrl) : null;
  return !!source && source.sourceUrl === job.sourceUrl && source.jobId === job.jobId
    && ['companyName', 'jobTitle', 'description', 'extractedAt'].every(key => typeof (job as unknown as Record<string, unknown>)[key] === 'string')
    && !Number.isNaN(Date.parse(job.extractedAt))
    && ['easy_apply', 'external', 'unknown'].includes(job.applicationType)
    && ['available', 'missing', 'invalid'].includes(job.applicationUrlStatus)
    && (job.applicationUrl === null || typeof job.applicationUrl === 'string')
    && (job.atsName === null || typeof job.atsName === 'string')
    && (job.atsOverride === undefined || (typeof job.atsOverride?.url === 'string'
      && (job.atsOverride.value === null || typeof job.atsOverride.value === 'string')))
    && Array.isArray(job.warningCodes) && job.warningCodes.every(code => Object.hasOwn(exportMessages, code));
}

export async function startDownload(job: JobDraft, downloads: Pick<typeof chrome.downloads, 'download'>,
  resources?: DownloadResources): Promise<DownloadReply> {
  let resource: TextResource | undefined;
  try {
    if (!isJobDraft(job)) return { ok: false, cancelled: false };
    const exported = toJobExport(job);
    const text = formatTxt(exported);
    resource = resources?.create(text) ?? { url: toTextDataUrl(text), release() {} };
    const id = await downloads.download({
      url: resource.url, filename: createFilename(exported.companyName, exported.jobId),
      conflictAction: 'uniquify', saveAs: false,
    });
    resources?.track(id, resource);
    return { ok: true, id };
  } catch (error) {
    resource?.release();
    return { ok: false, cancelled: /cancel|USER_CANCELED/i.test(String(error)) };
  }
}
