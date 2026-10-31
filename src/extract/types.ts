import type { ExtractionResult } from '../core/model';
import type { JobSource } from '../core/sources';

export interface ExtractionContext {
  document: Document;
  source: JobSource;
  now: () => Date;
}

export type JobExtractor = (context: ExtractionContext) => ExtractionResult;
