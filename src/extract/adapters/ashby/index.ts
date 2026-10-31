import { isSameJobSource, parseJobSource } from '../../../core/source-url';
import type { WarningCode } from '../../../core/warnings';
import { descriptionToText, isVisible } from '../../plain-text';
import type { JobExtractor } from '../../types';
import { ashbyLocators as locators } from './locators';

function resolveLink(element: Element, base: string): URL | null {
  const href = element.getAttribute('href');
  if (!href?.trim()) return null;
  try { return new URL(href, base); } catch { return null; }
}

export const extractAshbyJob: JobExtractor = ({ document, source, now }) => {
  if (source.siteId !== 'ashby') return { ok: false, error: 'unsupported_page' };
  const relevant = (element: Element) => isVisible(element) && !element.closest(locators.excluded);
  const find = (selector: string) => [...document.querySelectorAll(selector)].filter(relevant);
  const titles = find(locators.title);
  const descriptions = find(locators.description);
  const panels = find(locators.overviewPanel);
  const expired = find(locators.expired).some(element => !descriptions.some(node => node.contains(element))
    && /(?:job|position|posting).*(?:no longer|not available|not found|expired|closed)|(?:职位|職位|職缺).*(?:已过期|已关闭|已關閉|不再接受)/i.test(element.textContent || ''));
  if (expired) return { ok: false, error: 'expired_job' };
  if (find(locators.loading).length) return { ok: false, error: 'page_loading' };
  if (titles.length > 1 || descriptions.length > 1 || panels.length > 1) {
    return { ok: false, error: 'ambiguous_container' };
  }
  if (!titles.length && !descriptions.length && !panels.length) {
    return { ok: false, error: document.readyState === 'loading' || document.querySelector('#root:empty')
      ? 'page_loading' : 'missing_container' };
  }

  // Tab links are identity evidence, even though navigation is excluded from the JD.
  const identityLinks = [...document.querySelectorAll(locators.overviewLink)]
    .filter(element => isVisible(element) && !element.closest('aside, footer'));
  if (identityLinks.length > 1) return { ok: false, error: 'ambiguous_container' };
  for (const link of identityLinks) {
    const url = resolveLink(link, source.sourceUrl);
    const linked = url ? parseJobSource(url.href) : null;
    if (!isSameJobSource(source, linked)) return { ok: false, error: 'job_changed' };
  }
  for (const link of find(locators.boardLink)) {
    const board = resolveLink(link, source.sourceUrl);
    const expected = '/' + encodeURIComponent(source.companySlug);
    if (!board || board.origin !== 'https://jobs.ashbyhq.com' || board.pathname.replace(/\/$/, '') !== expected) {
      return { ok: false, error: 'job_changed' };
    }
  }

  const jobTitle = (titles[0]?.textContent || '').replace(/\s+/g, ' ').trim();
  const description = descriptions[0] ? descriptionToText(descriptions[0], locators.excluded) : '';
  const warningCodes: WarningCode[] = [];
  if (!jobTitle) warningCodes.push('title_missing');
  if (!description) warningCodes.push('description_missing');
  return { ok: true, job: {
    companyName: source.companySlug, jobTitle, description,
    sourceUrl: source.sourceUrl, jobId: source.jobId, extractedAt: now().toISOString(),
    applicationType: 'external', applicationUrl: source.sourceUrl,
    applicationUrlStatus: 'available', atsName: 'Ashby', warningCodes,
  } };
};
