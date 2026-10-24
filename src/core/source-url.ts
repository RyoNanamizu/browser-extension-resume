export interface JobSource { jobId: string; sourceUrl: string }

export function parseJobSource(raw: string): JobSource | null {
  try {
    const url = new URL(raw);
    const match = /^\/jobs\/view\/(\d+)\/?$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'www.linkedin.com'
      || url.port || url.username || url.password || !match?.[1]) return null;
    return { jobId: match[1], sourceUrl: `https://www.linkedin.com/jobs/view/${match[1]}/` };
  } catch { return null; }
}

export function isLinkedInHost(host: string): boolean {
  return host === 'linkedin.com' || host.endsWith('.linkedin.com');
}
