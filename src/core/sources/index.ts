import type { ApplicationType } from '../model';
import { ashbySource } from './ashby';
import { linkedinSource } from './linkedin';
import type { JobSource, SourceDefinition, SourceId } from './types';

export type { JobSource, SourceDefinition, SourceId } from './types';

// This registry is pure URL/metadata code. Popup/background bundles never import DOM adapters.
export const sourceDefinitions: Record<SourceId, SourceDefinition> = {
  linkedin: linkedinSource,
  ashby: ashbySource,
};

export function parseJobSource(raw: string): JobSource | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    for (const definition of Object.values(sourceDefinitions)) {
      const source = definition.parseUrl(url);
      if (source) return source;
    }
  } catch { /* Unrecognized URLs are unsupported, without accessing the page. */ }
  return null;
}

export function isSameJobSource(left: JobSource | null, right: JobSource | null): boolean {
  return !!left && !!right && left.siteId === right.siteId
    && left.jobId === right.jobId && left.sourceUrl === right.sourceUrl;
}

export function supportsApplicationType(source: JobSource, type: ApplicationType): boolean {
  return sourceDefinitions[source.siteId].applicationTypes.includes(type);
}
