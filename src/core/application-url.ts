import type { ApplicationUrlStatus } from './model';
import { isLinkedInHost } from './source-url';
import type { WarningCode } from './warnings';

export interface ParsedApplicationUrl {
  url: string | null;
  status: ApplicationUrlStatus;
  warning: WarningCode | null;
}

function invalid(warning: WarningCode = 'application_url_invalid'): ParsedApplicationUrl {
  return { url: null, status: 'invalid', warning };
}

function validHttp(url: URL): boolean {
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}

// Parse only attributes obtained from a verified primary application control.
// No network requests, recursive redirects, or unconditional decoding.
export function parseApplicationUrl(raw: string | null, sourceUrl: string): ParsedApplicationUrl {
  if (!raw?.trim()) return { url: null, status: 'missing', warning: 'application_url_missing' };
  if (/[\u0000-\u0020\u007f]/.test(raw.trim())) return invalid();
  try {
    const link = new URL(raw.trim(), sourceUrl);
    if (!validHttp(link)) return invalid();
    const isSafety = ['www.linkedin.com', 'linkedin.com'].includes(link.hostname)
      && /^\/safety\/go\/?$/.test(link.pathname);
    if (isSafety) {
      const values = link.searchParams.getAll('url');
      if (values.length !== 1 || !values[0]?.trim()) return invalid('redirect_invalid');
      const value = values[0];
      if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return invalid();
      const target = new URL(value);
      if (!validHttp(target)) return invalid();
      if (isLinkedInHost(target.hostname)) return invalid('internal_redirect');
      return { url: target.href, status: 'available', warning: null };
    }
    if (isLinkedInHost(link.hostname)) return invalid('internal_redirect');
    // Direct links must also be absolute: a relative link resolves to LinkedIn above.
    return { url: link.href, status: 'available', warning: null };
  } catch { return invalid(); }
}
