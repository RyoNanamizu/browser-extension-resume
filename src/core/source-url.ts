export { parseJobSource, isSameJobSource } from './sources';
export type { JobSource } from './sources';

export function isLinkedInHost(host: string): boolean {
  return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}
