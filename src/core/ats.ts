const rules = [
  { name: 'Ashby', hosts: ['jobs.ashbyhq.com'], subdomains: false },
  { name: 'Greenhouse', hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'], subdomains: false },
  { name: 'Lever', hosts: ['jobs.lever.co'], subdomains: false },
  { name: 'Workday', hosts: ['myworkdayjobs.com'], subdomains: true },
  { name: 'SmartRecruiters', hosts: ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'], subdomains: false },
] as const;

export function identifyAts(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    for (const rule of rules) {
      if (rule.hosts.some(host => url.hostname === host
        || (rule.subdomains && url.hostname.endsWith(`.${host}`)))) return rule.name;
    }
  } catch { /* Uncertain providers are deliberately left unidentified. */ }
  return null;
}
