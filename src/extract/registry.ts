import type { SourceId } from '../core/sources';
import { extractAshbyJob } from './adapters/ashby';
import { extractLinkedInJob } from './adapters/linkedin';
import { extractIndeedJob } from './adapters/indeed';
import type { JobExtractor } from './types';

// A new source ID must have an extractor before the project can typecheck.
export const extractors = {
  linkedin: extractLinkedInJob,
  ashby: extractAshbyJob,
  indeed: extractIndeedJob,
} satisfies Record<SourceId, JobExtractor>;
