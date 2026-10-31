import type { SourceDefinition } from './types';

export const linkedinSource: SourceDefinition = {
  id: 'linkedin',
  name: 'LinkedIn',
  exampleUrl: 'https://www.linkedin.com/jobs/view/<job-id>/',
  applicationTypes: ['unknown', 'easy_apply', 'external'],
  parseUrl(url) {
    const match = /^\/jobs\/view\/(\d+)\/?$/.exec(url.pathname);
    if (url.hostname !== 'www.linkedin.com' || !match?.[1]) return null;
    return { siteId: 'linkedin', jobId: match[1],
      sourceUrl: 'https://www.linkedin.com/jobs/view/' + match[1] + '/' };
  },
};
