import { parseApplicationUrl } from '../core/application-url';
import { identifyAts } from '../core/ats';
import type { ApplicationType, ExtractionResult, JobDraft } from '../core/model';
import { parseJobSource } from '../core/source-url';
import { uniqueWarnings, type WarningCode } from '../core/warnings';
import { locators } from './locators';
import { descriptionToText, isVisible } from './plain-text';
import { isApplicationControl, isEasyApplyControl, isExternalApplyControl } from './control-semantics';
import { findSduiDetails } from './sdui';

function relevant(element: Element): boolean {
  return !element.closest(locators.excluded) && isVisible(element);
}

function first(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const matches = [...root.querySelectorAll(selector)].filter(relevant);
    if (matches.length === 1) return matches[0]!;
    // Multiple unrelated fields are ambiguous, never pick a sidebar's first match.
    if (matches.length > 1) return null;
  }
  return null;
}

function text(element: Element | null): string {
  return element ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function findDescription(root: Element): Element | null {
  const explicit = first(root, locators.description);
  if (explicit) return explicit;
  const headings = [...root.querySelectorAll('h2, h3')].filter(element => relevant(element)
    && /^(about the job|job description|职位描述|職位描述|关于此职位|關於此職位)$/i.test(text(element)));
  if (headings.length !== 1) return null;
  const scope = headings[0]!.closest('section, article');
  return scope && root.contains(scope) ? scope : null;
}

function getControls(root: Element, description: Element | null, includeRoot = false): Element[] {
  const candidates = new Set<Element>();
  for (const selector of locators.primaryControls) {
    for (const element of root.querySelectorAll(selector)) {
      if (relevant(element) && !description?.contains(element)
        && !element.closest(locators.secondaryControls)) candidates.add(element);
    }
  }
  if (!candidates.size) {
    const regions = (includeRoot ? [root] : [...root.querySelectorAll(locators.primaryRegions.join(','))]).filter(relevant);
    for (const region of regions) {
      for (const control of region.querySelectorAll('a[href], button, [role="button"]')) {
        if (!description?.contains(control) && relevant(control)
          && isApplicationControl(control)) candidates.add(control);
      }
    }
  }
  // A marker may be on a wrapper around its actual anchor/button.
  return [...candidates].filter(candidate => ![...candidates].some(other => other !== candidate && candidate.contains(other)));
}

function application(root: Element | null, description: Element | null, sourceUrl: string, includeRoot = false) {
  const controls = root ? getControls(root, description, includeRoot) : [];
  const codes: WarningCode[] = [];
  if (controls.length !== 1) {
    codes.push(controls.length ? 'application_conflict' : 'application_unknown', 'application_url_missing');
    return { applicationType: 'unknown' as ApplicationType, applicationUrl: null,
      applicationUrlStatus: 'missing' as const, atsName: null, codes };
  }
  const control = controls[0]!;
  const anchors = control.matches('a[href]') ? [control] : [...control.querySelectorAll('a[href]')];
  const rawHref = anchors.length === 1 ? anchors[0]!.getAttribute('href') : null;
  const parsed = parseApplicationUrl(rawHref, sourceUrl);
  if (isEasyApplyControl(control)) {
    if (parsed.status === 'available') {
      codes.push('application_conflict');
      return { applicationType: 'unknown' as const, applicationUrl: parsed.url,
        applicationUrlStatus: parsed.status, atsName: identifyAts(parsed.url), codes };
    }
    return { applicationType: 'easy_apply' as const, applicationUrl: sourceUrl,
      applicationUrlStatus: 'available' as const, atsName: null, codes };
  }
  const applicationType: ApplicationType = isExternalApplyControl(control) ? 'external' : 'unknown';
  if (applicationType === 'unknown') codes.push('application_unknown');
  if (parsed.warning) codes.push(parsed.warning);
  return { applicationType, applicationUrl: parsed.url, applicationUrlStatus: parsed.status,
    atsName: identifyAts(parsed.url), codes };
}

export function extractCurrentJob(document: Document, currentUrl: () => string,
  now: () => Date = () => new Date()): ExtractionResult {
  const before = parseJobSource(currentUrl());
  if (!before) return { ok: false, error: 'unsupported_page' };
  if ([...document.querySelectorAll(locators.login)].some(isVisible)) return { ok: false, error: 'login_required' };
  const expired = [...document.querySelectorAll(locators.expired)].find(element => isVisible(element)
    && /no longer|not available|expired|closed|不再接受|已过期|已關閉|已关闭|職缺已關閉/i.test(text(element)));
  if (expired) return { ok: false, error: 'expired_job' };
  if ([...document.querySelectorAll(locators.loading)].some(relevant)) return { ok: false, error: 'page_loading' };

  const sdui = findSduiDetails(document, before.jobId, relevant);
  if (sdui && !sdui.ok) return sdui;
  const details = sdui?.ok ? sdui.details : null;
  let container: Element | null = details?.root || null;
  for (const selector of details ? [] : locators.containers) {
    let candidates = [...document.querySelectorAll(selector)].filter(element => relevant(element)
      && (first(element, locators.title) || findDescription(element)));
    if (selector === 'main') candidates = candidates.filter(element => first(element, locators.title) && findDescription(element));
    candidates = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
    if (candidates.length > 1) return { ok: false, error: 'ambiguous_container' };
    if (candidates.length === 1) { container = candidates[0]!; break; }
  }
  if (!container) {
    return { ok: false, error: document.querySelector(locators.loading) || document.readyState === 'loading'
      ? 'page_loading' : 'missing_container' };
  }

  const identityScope = details?.primaryRegion || (details ? details.description : container);
  const declaredIds = [identityScope, ...identityScope.querySelectorAll('[data-job-id]')]
    .filter(element => relevant(element) && element.hasAttribute('data-job-id'))
    .map(element => element.getAttribute('data-job-id'));
  if (declaredIds.some(id => id !== before.jobId)) return { ok: false, error: 'job_changed' };
  const titleElement = details ? details.title : first(container, locators.title);
  const titleAnchor = titleElement?.matches('a[href]') ? titleElement : titleElement?.querySelector('a[href]');
  if (titleAnchor) {
    const titleSource = parseJobSource(new URL(titleAnchor.getAttribute('href') || '', before.sourceUrl).href);
    if (titleSource && titleSource.jobId !== before.jobId) return { ok: false, error: 'job_changed' };
  }
  const descriptionElement = details ? details.description : findDescription(container);
  const warnings: WarningCode[] = [];
  const companyName = text(details ? details.company : first(container, locators.company));
  const jobTitle = text(titleElement);
  const description = descriptionElement ? descriptionToText(descriptionElement) : '';
  if (!companyName) warnings.push('company_missing');
  if (!jobTitle) warnings.push('title_missing');
  if (!description) warnings.push('description_missing');
  const evidence = application(details ? details.primaryRegion : container, descriptionElement, before.sourceUrl, !!details);
  const after = parseJobSource(currentUrl());
  if (!after || after.jobId !== before.jobId) return { ok: false, error: 'job_changed' };
  const job: JobDraft = {
    companyName, jobTitle, description, sourceUrl: before.sourceUrl, jobId: before.jobId,
    extractedAt: now().toISOString(), applicationType: evidence.applicationType,
    applicationUrl: evidence.applicationUrl, applicationUrlStatus: evidence.applicationUrlStatus,
    atsName: evidence.atsName, warningCodes: uniqueWarnings([...warnings, ...evidence.codes]),
  };
  return { ok: true, job };
}
