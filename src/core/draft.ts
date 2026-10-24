import { parseApplicationUrl } from './application-url';
import { identifyAts } from './ats';
import type { JobDraft, JobExport } from './model';
import { exportMessages, uniqueWarnings, type WarningCode } from './warnings';

const urlWarnings = new Set<WarningCode>([
  'application_url_missing', 'application_url_invalid', 'redirect_invalid', 'internal_redirect',
]);

// Revalidation happens on every edit and again before a download.
export function revalidateDraft(draft: JobDraft): JobDraft {
  const codes = draft.warningCodes.filter(code => !urlWarnings.has(code)
    && !['company_missing', 'title_missing', 'description_missing', 'application_unknown'].includes(code));
  if (!draft.companyName.trim()) codes.push('company_missing');
  if (!draft.jobTitle.trim()) codes.push('title_missing');
  if (!draft.description.trim()) codes.push('description_missing');
  if (draft.applicationType === 'easy_apply') {
    return { ...draft, applicationUrl: draft.sourceUrl, applicationUrlStatus: 'available',
      atsName: null, warningCodes: uniqueWarnings(codes) };
  }
  if (draft.applicationType === 'unknown') codes.push('application_unknown');
  const parsed = parseApplicationUrl(draft.applicationUrl, draft.sourceUrl);
  if (!draft.applicationUrl && draft.applicationUrlStatus === 'invalid') {
    codes.push(...draft.warningCodes.filter(code => urlWarnings.has(code)));
    return { ...draft, atsName: null, warningCodes: uniqueWarnings(codes) };
  }
  if (parsed.warning) codes.push(parsed.warning);
  const atsName = parsed.url && draft.atsOverride?.url === parsed.url
    ? draft.atsOverride.value : identifyAts(parsed.url);
  return { ...draft, applicationUrlStatus: parsed.status, atsName,
    // Preserve the user's invalid input in the editor so it can be corrected.
    applicationUrl: parsed.url ?? draft.applicationUrl, warningCodes: uniqueWarnings(codes) };
}

export function toJobExport(draft: JobDraft): JobExport {
  const current = revalidateDraft(draft);
  const { warningCodes, atsOverride: _atsOverride, ...job } = current;
  if (!job.companyName.trim() || !job.jobTitle.trim() || !job.description.trim()) {
    throw new Error('Company name, job title, and description are required.');
  }
  return { ...job, applicationUrl: job.applicationUrlStatus === 'available' ? job.applicationUrl : null,
    warnings: warningCodes.map(code => exportMessages[code]) };
}
