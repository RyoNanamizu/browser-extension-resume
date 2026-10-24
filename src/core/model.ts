import type { WarningCode } from './warnings';

export type ApplicationType = 'easy_apply' | 'external' | 'unknown';
export type ApplicationUrlStatus = 'available' | 'missing' | 'invalid';

export interface JobExport {
  companyName: string;
  jobTitle: string;
  applicationType: ApplicationType;
  applicationUrl: string | null;
  applicationUrlStatus: ApplicationUrlStatus;
  atsName: string | null;
  description: string;
  sourceUrl: string;
  jobId: string;
  extractedAt: string;
  warnings: string[];
}

export interface JobDraft extends Omit<JobExport, 'warnings'> {
  warningCodes: WarningCode[];
  atsOverride?: { url: string; value: string | null };
}

export type ExtractionError = 'unsupported_page' | 'login_required' | 'expired_job'
  | 'page_loading' | 'missing_container' | 'ambiguous_container' | 'job_changed';

export type ExtractionResult = { ok: true; job: JobDraft }
  | { ok: false; error: ExtractionError };
