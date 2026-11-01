import type { SourceDefinition } from './types';

export const indeedSource: SourceDefinition = {
  id: 'indeed',
  name: 'Indeed',
  exampleUrl: 'https://ca.indeed.com/viewjob?jk=<job-id>',
  applicationTypes: ['unknown', 'easy_apply', 'external'],
  parseUrl(url) {
    if (url.hostname !== 'ca.indeed.com' || url.pathname !== '/viewjob') return null;
    const ids = url.searchParams.getAll('jk');
    const jobId = ids[0];
    if (ids.length !== 1 || !jobId || !/^[A-Za-z0-9_-]+$/.test(jobId)) return null;
    return { siteId: 'indeed', jobId,
      sourceUrl: 'https://ca.indeed.com/viewjob?jk=' + jobId };
  },
};
