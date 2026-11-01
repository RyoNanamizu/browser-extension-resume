import { revalidateDraft } from '../../../core/draft';
import type { ApplicationType } from '../../../core/model';
import { isSameJobSource, parseJobSource } from '../../../core/sources';
import type { WarningCode } from '../../../core/warnings';
import { descriptionToText, isVisible } from '../../plain-text';
import type { JobExtractor } from '../../types';
import { indeedLocators as locators } from './locators';
import { readIndeedData, record } from './page-data';

const text = (element: Element | null | undefined) => (element?.textContent || '').replace(/\s+/g, ' ').trim();
const string = (value: unknown) => typeof value === 'string' ? value : '';

export const extractIndeedJob: JobExtractor = ({ document, source, now }) => {
  if (source.siteId !== 'indeed') return { ok: false, error: 'unsupported_page' };
  const relevant = (element: Element) => isVisible(element) && !element.closest(locators.excluded);
  const roots = [...document.querySelectorAll(locators.root)].filter(relevant);
  if (roots.length > 1) return { ok: false, error: 'ambiguous_container' };
  const data = readIndeedData(document);
  if (data && data.jobKey !== source.jobId) return { ok: false, error: 'job_changed' };
  for (const canonical of document.querySelectorAll('link[rel="canonical"][href]')) {
    const linked = parseJobSource(canonical.getAttribute('href') || '');
    if (linked && !isSameJobSource(source, linked)) return { ok: false, error: 'job_changed' };
  }
  const info = record(record(data?.jobInfoWrapperModel).jobInfoModel);
  const details = record(record(info.jobDescriptionSectionModel).jobDetailsSection);
  if (info.showExpiredHeader === true || details.isJobExpired === true) return { ok: false, error: 'expired_job' };
  const root = roots[0];
  if (!root) return { ok: false, error: document.readyState === 'loading'
    || document.querySelector('#root:empty') ? 'page_loading' : 'missing_container' };
  const find = (selector: string) => [...root.querySelectorAll(selector)].filter(relevant);
  if (find('[aria-busy="true"], [role="progressbar"]').length) return { ok: false, error: 'page_loading' };
  const titles = find(locators.title), companies = find(locators.company), descriptions = find(locators.description);
  if ([titles, companies, descriptions].some(elements => elements.length > 1)) {
    return { ok: false, error: 'ambiguous_container' };
  }
  const controls = find(locators.controls);
  for (const control of controls) {
    const href = control.getAttribute('href');
    if (!href) continue;
    try {
      const url = new URL(href, source.sourceUrl);
      const ids = url.searchParams.getAll('jk');
      if (url.origin === 'https://ca.indeed.com' && ids.length
        && (ids.length !== 1 || ids[0] !== source.jobId)) return { ok: false, error: 'job_changed' };
    } catch { /* Application addresses are always the source URL, independent of href. */ }
  }
  const codes: WarningCode[] = [];
  const header = record(info.jobInfoHeaderModel);
  let jobTitle = text(titles[0]), companyName = text(companies[0]);
  let description = descriptions[0] ? descriptionToText(descriptions[0], locators.excluded) : '';
  if (data && (!jobTitle || !companyName || !description)) {
    let fallback = false;
    if (!jobTitle) { jobTitle = string(data.jobTitle) || string(header.jobTitle); fallback ||= !!jobTitle; }
    if (!companyName) { companyName = string(header.companyName) || string(record(data.companyTabModel).companyName); fallback ||= !!companyName; }
    const Parser = document.defaultView?.DOMParser;
    if (!description && typeof info.sanitizedJobDescription === 'string' && Parser) {
      const detached = new Parser().parseFromString(info.sanitizedJobDescription, 'text/html');
      description = descriptionToText(detached.body, locators.excluded);
      fallback ||= !!description;
    }
    if (fallback) codes.push('fallback_extraction');
  }
  if (!titles.length && !descriptions.length && !jobTitle && !description) {
    return { ok: false, error: document.readyState === 'loading' ? 'page_loading' : 'missing_container' };
  }
  // Responsive duplicates may agree; an absent, blank, or conflicting control is unknown.
  const labels = new Set(controls.map(text));
  let applicationType: ApplicationType = 'unknown';
  if (labels.size === 1 && !labels.has('')) applicationType = labels.has('Apply now') ? 'easy_apply' : 'external';
  else if (controls.length > 1) codes.push('application_conflict');
  return { ok: true, job: revalidateDraft({
    companyName, jobTitle, description, sourceUrl: source.sourceUrl, jobId: source.jobId,
    extractedAt: now().toISOString(), applicationType, applicationUrl: source.sourceUrl,
    applicationUrlStatus: 'available', atsName: null, warningCodes: codes,
  }) };
};
