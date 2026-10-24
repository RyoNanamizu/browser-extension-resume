import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApplicationUrl } from '../src/core/application-url';
import { identifyAts } from '../src/core/ats';
import { revalidateDraft, toJobExport } from '../src/core/draft';
import { createFilename } from '../src/core/filename';
import type { JobDraft } from '../src/core/model';
import { parseJobSource } from '../src/core/source-url';
import { formatTxt, toTextDataUrl } from '../src/core/txt';
import { exportMessages, uiMessages } from '../src/core/warnings';

export const source = 'https://www.linkedin.com/jobs/view/123456789/';
export function job(overrides: Partial<JobDraft> = {}): JobDraft {
  return { companyName: 'Marble AI', jobTitle: 'Software Engineer', applicationType: 'external',
    applicationUrl: 'https://jobs.ashbyhq.com/marble.ai/123/application', applicationUrlStatus: 'available',
    atsName: 'Ashby', description: 'Original paragraph.\n\n- One\n- Two', sourceUrl: source,
    jobId: '123456789', extractedAt: '2026-10-24T12:34:56.000Z', warningCodes: [], ...overrides };
}

test('only explicit current-job URLs are supported and normalized', () => {
  assert.deepEqual(parseJobSource(source + '?tracking=1'), { jobId: '123456789', sourceUrl: source });
  assert.equal(parseJobSource(source.slice(0, -1))?.sourceUrl, source);
  for (const bad of ['http://www.linkedin.com/jobs/view/1/', 'https://linkedin.com/jobs/view/1/',
    'https://www.linkedin.com/jobs/collections/saved/', 'https://www.linkedin.com/jobs-tracker/',
    'https://www.linkedin.com/jobs/view/not-an-id/', 'https://www.linkedin.com.evil.example/jobs/view/1/',
    'https://user:pass@www.linkedin.com/jobs/view/1/', 'https://www.linkedin.com:8443/jobs/view/1/']) {
    assert.equal(parseJobSource(bad), null, bad);
  }
});

test('the specification Ashby redirect resolves exactly without outer parameters', () => {
  const expected = 'https://jobs.ashbyhq.com/marble.ai/6f832eeb-08ff-4fb7-8788-420633a72960/application';
  const raw = 'https://www.linkedin.com/safety/go/?url=' + encodeURIComponent(expected) + '&urlhash=example&isSdui=true&lipi=private&mt=private';
  assert.equal(parseApplicationUrl(raw, source).url, expected);
  assert.equal(identifyAts(parseApplicationUrl(raw, source).url), 'Ashby');
});

for (const target of [
  'https://careers.example/jobs/123?a=1&b=2',
  'https://careers.example/jobs/a%2Fb?token=%25&plus=%2B&literal=a+b&src=LinkedIn',
  'https://careers.example/jobs/1?redirect=https%3A%2F%2Felsewhere.example%2F&x=%252F',
]) {
  test(`preserves target encoding and parameters: ${target}`, () => {
    assert.equal(parseApplicationUrl(target, source).url, target);
    assert.equal(parseApplicationUrl('/safety/go?url=' + encodeURIComponent(target) + '&urlhash=private', source).url, target);
  });
}

for (const tail of ['', '?url=', '?url=%20', '?url=https%3A%2F%2Fexample.com&url=https%3A%2F%2Fother.example', '?url=&url=https%3A%2F%2Fexample.com']) {
  test(`rejects missing/empty/duplicate safety parameter ${tail}`, () => {
    const result = parseApplicationUrl('https://www.linkedin.com/safety/go/' + tail, source);
    assert.equal(result.status, 'invalid');
    assert.equal(result.warning, 'redirect_invalid');
    assert.equal(result.url, null);
  });
}

for (const target of ['javascript:alert(1)', 'data:text/plain,bad', 'file:///tmp/job', '/relative',
  '//example.com/job', 'https://u:p@example.com/job', 'https://example.com/\njob', 'https://', 'https%3A%2F%2Fexample.com']) {
  test(`rejects invalid redirected target ${JSON.stringify(target)}`, () => {
    assert.equal(parseApplicationUrl('/safety/go/?url=' + encodeURIComponent(target), source).status, 'invalid');
  });
}

test('does not follow nested or unsupported internal LinkedIn redirects', () => {
  for (const url of ['/redir/redirect?url=https://example.com', '/jobs/view/123456789/',
    '/safety/go/?url=' + encodeURIComponent('https://www.linkedin.com/safety/go/?url=https://example.com'),
    'https://careers.linkedin.com/jobs/123']) {
    assert.equal(parseApplicationUrl(url, source).warning, 'internal_redirect');
  }
  const evil = 'https://www.linkedin.com.evil.example/safety/go/?url=https%3A%2F%2Fjobs.ashbyhq.com';
  assert.equal(parseApplicationUrl(evil, source).url, evil);
  assert.equal(identifyAts(evil), null);
});

test('direct unknown providers remain valid without inventing an ATS', () => {
  const result = parseApplicationUrl('https://careers.example/team?job=123&token=a%2Fb', source);
  assert.equal(result.status, 'available');
  assert.equal(identifyAts(result.url), null);
  assert.equal(parseApplicationUrl(null, source).status, 'missing');
});

test('ATS rules use exact hosts or dot-delimited supported subdomains', () => {
  for (const [url, expected] of [
    ['https://JOBS.ASHBYHQ.COM/x', 'Ashby'], ['https://boards.greenhouse.io/x', 'Greenhouse'],
    ['https://job-boards.greenhouse.io/x', 'Greenhouse'], ['https://jobs.lever.co/x', 'Lever'],
    ['https://company.wd5.myworkdayjobs.com/x', 'Workday'], ['https://jobs.smartrecruiters.com/x', 'SmartRecruiters'],
    ['https://jobs.ashbyhq.com.evil.example/x', null], ['https://evilmyworkdayjobs.com/x', null],
    ['https://ashbyhq.com/x', null], ['https://user:pass@jobs.ashbyhq.com/x', null],
  ] as const) assert.equal(identifyAts(url), expected, url);
});

test('edited URLs recompute ATS; Easy Apply replaces stale external values', () => {
  const edited = revalidateDraft(job({ applicationUrl: 'https://jobs.lever.co/company/1' }));
  assert.equal(edited.atsName, 'Lever');
  const invalid = toJobExport(job({ applicationUrl: 'javascript:alert(1)' }));
  assert.equal(invalid.atsName, null);
  assert.equal(invalid.applicationUrl, null);
  assert.ok(invalid.warnings.includes(exportMessages.application_url_invalid));
  const easy = toJobExport(job({ applicationType: 'easy_apply' }));
  assert.equal(easy.applicationUrl, source);
  assert.equal(easy.atsName, null);
  assert.match(formatTxt(easy), /ATS: Not Applicable/);
});

test('manual ATS edits are kept for the same URL and removed when it changes', () => {
  const draft = job();
  draft.atsOverride = { url: draft.applicationUrl!, value: 'User supplied ATS' };
  assert.equal(toJobExport(draft).atsName, 'User supplied ATS');
  draft.applicationUrl = 'https://jobs.lever.co/other/123';
  assert.equal(toJobExport(draft).atsName, 'Lever');
});

test('English export notes are independent of Chinese UI warnings', () => {
  const output = formatTxt(toJobExport(job({ companyName: '星河科技 🚀', jobTitle: '软件工程师',
    description: '原始内容。\n\n- 第一项\n- 第二项', applicationType: 'unknown',
    applicationUrl: null, applicationUrlStatus: 'missing', warningCodes: [] })));
  assert.match(output, /Company Name: 星河科技 🚀\nJob Title: 软件工程师/);
  assert.match(output, /Application Type: Unknown\nApplication URL: Not Available\nATS: Unrecognized/);
  assert.match(output, /原始内容。\n\n- 第一项\n- 第二项/);
  assert.ok(output.includes(exportMessages.application_url_missing));
  assert.ok(!output.includes(uiMessages.application_url_missing));
  assert.equal(Buffer.from(toTextDataUrl(output).split(',')[1]!, 'base64').toString('utf8'), output);
});

test('latest field edits are preserved, with LF newlines and no empty notes section', () => {
  const output = formatTxt(toJobExport(job({ companyName: 'Edited Company', jobTitle: 'Edited Title', description: '  User spacing\r\n\r\n- Bullet\r\n' })));
  assert.match(output, /^Company Name: Edited Company\nJob Title: Edited Title/);
  assert.ok(output.includes('  User spacing\n\n- Bullet\n'));
  assert.ok(!output.includes('\r'));
  assert.ok(!output.includes('Extraction Notes:'));
  assert.ok(output.endsWith('\n'));
});

test('required fields block export, but unknown application method does not', () => {
  for (const field of ['companyName', 'jobTitle', 'description']) {
    assert.throws(() => toJobExport(job({ [field]: ' ' })));
  }
  assert.doesNotThrow(() => toJobExport(job({ applicationType: 'unknown' })));
});

test('TXT application states follow the required output table', () => {
  const cases: { draft: Partial<JobDraft>; type: string; url: string; ats: string }[] = [
    { draft: { applicationType: 'easy_apply' }, type: 'LinkedIn Easy Apply', url: source, ats: 'Not Applicable' },
    { draft: {}, type: 'External Application', url: 'https://jobs.ashbyhq.com/marble.ai/123/application', ats: 'Ashby' },
    { draft: { applicationUrl: 'https://careers.example/123' }, type: 'External Application', url: 'https://careers.example/123', ats: 'Unrecognized' },
    { draft: { applicationUrl: null, applicationUrlStatus: 'missing' }, type: 'External Application', url: 'Not Available', ats: 'Unrecognized' },
    { draft: { applicationType: 'unknown' }, type: 'Unknown', url: 'https://jobs.ashbyhq.com/marble.ai/123/application', ats: 'Ashby' },
    { draft: { applicationType: 'unknown', applicationUrl: null, applicationUrlStatus: 'missing' }, type: 'Unknown', url: 'Not Available', ats: 'Unrecognized' },
  ];
  for (const item of cases) {
    const text = formatTxt(toJobExport(job(item.draft)));
    assert.ok(text.includes(`Application Type: ${item.type}\nApplication URL: ${item.url}\nATS: ${item.ats}`));
  }
});

test('invalid extracted redirect details stay explained without leaking the redirect', () => {
  const exported = toJobExport(job({ applicationUrl: null, applicationUrlStatus: 'invalid', warningCodes: ['redirect_invalid'] }));
  assert.equal(exported.applicationUrlStatus, 'invalid');
  assert.ok(exported.warnings.includes(exportMessages.redirect_invalid));
});

test('filenames preserve Unicode, avoid unsafe/reserved names, and fit filesystem limits', () => {
  assert.equal(createFilename('星河科技 🚀', '123'), 'new-jd-星河科技 🚀.txt');
  assert.equal(createFilename('A<>:"/\\|?*B\u0000. ', '123'), 'new-jd-A---------B-.txt');
  assert.equal(createFilename('CON', '123'), 'new-jd-_CON.txt');
  assert.equal(createFilename('..', '123'), 'new-jd-unknown-company-123.txt');
  assert.ok(Buffer.byteLength(createFilename('星'.repeat(200), '123')) <= 255);
  assert.ok(!createFilename('🚀'.repeat(200), '123').includes('\ufffd'));
});
