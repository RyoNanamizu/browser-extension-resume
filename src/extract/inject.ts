import { extractCurrentJob } from './adapter';

export function run() {
  return extractCurrentJob(document, () => location.href);
}
