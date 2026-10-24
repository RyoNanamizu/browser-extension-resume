import type { ExtractionError } from '../core/model';
import { isApplicationControl } from './control-semantics';
import { locators } from './locators';

interface SduiDetails {
  root: Element;
  title: Element | null;
  company: Element | null;
  description: Element;
  primaryRegion: Element | null;
}

type SduiResult = { ok: true; details: SduiDetails }
  | { ok: false; error: ExtractionError } | null;

// SDUI uses ordinary paragraphs and generated CSS classes in the supplied saved
// page. Its named DOM slots carry the job ID; they are not private page state.
export function findSduiDetails(document: Document, jobId: string,
  relevant: (element: Element) => boolean): SduiResult {
  const markers = [...document.querySelectorAll(locators.sdui.descriptionMarker)]
    .filter(element => relevant(element) && element.closest(locators.sdui.root));
  if (!markers.length) return null;
  for (const marker of markers) {
    const ids = [marker.id, marker.getAttribute('componentkey')]
      .flatMap(value => /^JobDetails_AboutTheJob_(\d+)$/.exec(value || '')?.[1] || []);
    if (!ids.length || ids.some(id => id !== jobId)) return { ok: false, error: 'job_changed' };
  }
  if (markers.length !== 1) return { ok: false, error: 'ambiguous_container' };
  const description = markers[0]!;
  const root = description.closest(locators.sdui.root)!;
  const beforeDescription = (element: Element) => !element.contains(description)
    && !!(element.compareDocumentPosition(description) & 4); // DOCUMENT_POSITION_FOLLOWING
  const companySlots = [...root.querySelectorAll(locators.sdui.company)]
    .filter(element => relevant(element) && beforeDescription(element));
  const companySlot = companySlots.length === 1 ? companySlots[0]! : null;
  let company: Element | null = null;
  let title: Element | null = null;
  let metadata: Element | null = companySlot;
  if (companySlot) {
    const links = [...companySlot.querySelectorAll(locators.sdui.companyLink)]
      .filter(element => relevant(element) && !!element.textContent?.trim());
    if (links.length === 1) company = links[0]!;
    // In the captured layout, the title paragraph is in the next row after the
    // company/more-options row. Bound this lookup to that sibling, not all <p>s.
    for (let row: Element | null = companySlot; row && row !== root && beforeDescription(row); row = row.parentElement) {
      const next = row.nextElementSibling;
      if (!next || !beforeDescription(next) || !relevant(next)) continue;
      const titles = [...next.querySelectorAll(locators.sdui.title)]
        .filter(element => relevant(element) && !!element.textContent?.trim());
      if (titles.length === 1) {
        title = titles[0]!;
        metadata = row.parentElement;
        break;
      }
      if (titles.length > 1) break;
    }
  }
  let primaryRegion = metadata && beforeDescription(metadata) ? metadata : null;
  for (let scope = metadata; scope && scope !== root && beforeDescription(scope); scope = scope.parentElement) {
    if ([...scope.querySelectorAll(locators.sdui.controls)].some(element => relevant(element) && isApplicationControl(element))) {
      primaryRegion = scope;
      break;
    }
  }
  // The current-job slot can be empty in a saved or partially hydrated page.
  // Keep it empty; do not borrow text from company information or recommendations.
  return { ok: true, details: { root, title, company, description, primaryRegion } };
}
