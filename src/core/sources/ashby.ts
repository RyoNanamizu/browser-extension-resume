import type { SourceDefinition } from './types';

export const ashbySource: SourceDefinition = {
  id: 'ashby',
  name: 'Ashby',
  exampleUrl: 'https://jobs.ashbyhq.com/<company>/<job-id>',
  applicationTypes: ['unknown', 'external'],
  parseUrl(url) {
    const match = /^\/([^/]+)\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/?$/.exec(url.pathname);
    if (url.hostname !== 'jobs.ashbyhq.com' || !match?.[1] || !match[2]) return null;
    try {
      const companySlug = decodeURIComponent(match[1]);
      if (!companySlug || /^[.]+$/.test(companySlug)
        || /[/\\?#\u0000-\u0020\u007f]/.test(companySlug)) return null;
      return { siteId: 'ashby', companySlug, jobId: match[2],
        sourceUrl: 'https://jobs.ashbyhq.com/' + encodeURIComponent(companySlug) + '/' + match[2] };
    } catch { return null; }
  },
};
