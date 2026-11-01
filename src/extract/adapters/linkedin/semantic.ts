import type { ExtractionError } from '../../../core/model';
import { descriptionToText } from '../../plain-text';
import { isApplicationControl } from './control-semantics';
import type { LinkedInDetails } from './details';
import { locators } from './locators';

const descriptionHeading = /^(about the job|job description|职位描述|職位描述|关于此职位|關於此職位)$/i;
const titleSelector = 'h1, [role="heading"][aria-level="1"]';
const companySelector = [...locators.company, 'a[href*="/company/"]'].join(',');

// Last resort after all supported layouts. Require a unique, bounded description
// plus a title and company in the same content area; never use whole-page text.
export function findSemanticDetails(document: Document, relevant: (element: Element) => boolean):
  { ok: true; details: LinkedInDetails } | { ok: false; error: ExtractionError } | null {
  const descriptions = new Set<Element>();
  for (const root of [...document.querySelectorAll(locators.sdui.root)].filter(relevant)) {
    for (const selector of locators.description) {
      const matches = [...root.querySelectorAll(selector)].filter(relevant);
      if (matches.length) { matches.forEach(element => descriptions.add(element)); break; }
    }
    for (const heading of [...root.querySelectorAll('h2, h3')].filter(element => relevant(element)
      && descriptionHeading.test((element.textContent || '').trim()))) {
      // An explicit description already supplies the full region for this card.
      if ([...descriptions].some(element => element.contains(heading)
        || heading.closest('section, article')?.contains(element))) continue;
      for (let scope = heading.parentElement; scope && scope !== root; scope = scope.parentElement) {
        if ([...descriptions].some(element => scope!.contains(element))) break;
        if (scope.querySelector(titleSelector) || scope.querySelector(companySelector)
          || [...scope.querySelectorAll('a, button, [role="button"]')].some(isApplicationControl)) break;
        const headings = [...scope.querySelectorAll('h2, h3')].filter(relevant);
        if (headings.length !== 1) break;
        if (scope.querySelector('p, ul, ol, [data-testid="expandable-text-box"]')
          && descriptionToText(scope, locators.excluded).length > (heading.textContent || '').trim().length) {
          descriptions.add(scope);
          break;
        }
      }
    }
  }
  if (!descriptions.size) return null;
  if (descriptions.size > 1) return { ok: false, error: 'ambiguous_container' };
  const description = [...descriptions][0]!;
  const root = description.closest(locators.sdui.root)!;
  const beforeDescription = (element: Element) => relevant(element) && !element.contains(description)
    && !!(element.compareDocumentPosition(description) & 4);
  const titles = [...root.querySelectorAll(titleSelector)].filter(beforeDescription);
  const companies = [...root.querySelectorAll(companySelector)].filter(element => beforeDescription(element)
    && !!element.textContent?.trim());
  // A known company wrapper and its child link are one piece of evidence.
  const uniqueCompanies = companies.filter(element => !companies.some(other => other !== element && element.contains(other)));
  if (titles.length > 1 || uniqueCompanies.length > 1) return { ok: false, error: 'ambiguous_container' };
  if (titles.length !== 1 || uniqueCompanies.length !== 1) return null;
  const title = titles[0]!;
  const company = uniqueCompanies[0]!;
  let primaryRegion: Element | null = null;
  for (let scope = title.parentElement; scope && scope !== root && beforeDescription(scope); scope = scope.parentElement) {
    if (!scope.contains(company)) continue;
    primaryRegion = scope;
    if ([...scope.querySelectorAll(locators.sdui.controls)].some(element => relevant(element) && isApplicationControl(element))) break;
  }
  if (!primaryRegion) return null;
  return { ok: true, details: { strategy: 'semantic-fallback', root, title, company, description, primaryRegion } };
}
