// The component is capped in UTF-8 bytes, so the full filename stays below 255 bytes.
const MAX_COMPANY_BYTES = 180;
export function sanitizeCompanyName(name: string): string {
  let value = name.trim().replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, '-').replace(/[. ]+$/g, '');
  if (/^\.+$/.test(value)) value = '';
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) value = `_${value}`;
  let result = '';
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const character of value) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_COMPANY_BYTES) break;
    result += character;
  }
  return result.replace(/[. ]+$/g, '');
}

export function createFilename(companyName: string, jobId: string): string {
  const company = sanitizeCompanyName(companyName);
  const fallbackId = jobId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown';
  return `new-jd-${company || `unknown-company-${fallbackId}`}.txt`;
}
