import type { JobExport } from './model';

export function formatTxt(job: JobExport): string {
  const applicationTypes = { easy_apply: 'LinkedIn Easy Apply', external: 'External Application', unknown: 'Unknown' };
  const lines = [
    `Company Name: ${job.companyName}`, `Job Title: ${job.jobTitle}`, '',
    `Application Type: ${applicationTypes[job.applicationType]}`,
    `Application URL: ${job.applicationUrlStatus === 'available' && job.applicationUrl ? job.applicationUrl : 'Not Available'}`,
    `ATS: ${job.applicationType === 'easy_apply' ? 'Not Applicable' : job.atsName || 'Unrecognized'}`, '',
    `LinkedIn URL: ${job.sourceUrl}`, `Job ID: ${job.jobId}`, `Extracted At: ${job.extractedAt}`, '',
    'Job Description:', job.description,
  ];
  if (job.warnings.length) lines.push('', 'Extraction Notes:', ...job.warnings);
  // LF line endings, a final newline, no BOM. Content is not translated or rewritten.
  return lines.join('\n').replace(/\r\n?/g, '\n') + '\n';
}

export function toTextDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:text/plain;charset=utf-8;base64,${btoa(binary)}`;
}
