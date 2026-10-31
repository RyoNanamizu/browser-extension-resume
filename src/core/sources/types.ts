import type { ApplicationType } from '../model';

export type SourceId = 'linkedin' | 'ashby';

interface SourceBase {
  jobId: string;
  sourceUrl: string;
}

export type JobSource =
  | (SourceBase & { siteId: 'linkedin' })
  | (SourceBase & { siteId: 'ashby'; companySlug: string });

export interface SourceDefinition {
  id: SourceId;
  name: string;
  exampleUrl: string;
  applicationTypes: readonly ApplicationType[];
  parseUrl(url: URL): JobSource | null;
}
