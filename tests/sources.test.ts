import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { identifyAts } from '../src/core/ats';
import { isSameJobSource, parseJobSource, sourceDefinitions, supportsApplicationType } from '../src/core/sources';
import { ashbyJobId, ashbySourceUrl } from './pages.mjs';

test('Ashby source URLs retain opaque IDs and normalize query, fragment, and trailing slash', () => {
  assert.deepEqual(parseJobSource(ashbySourceUrl + '/?utm_source=example#overview'), {
    siteId: 'ashby', companySlug: 'example.ai', jobId: ashbyJobId, sourceUrl: ashbySourceUrl,
  });
  assert.equal(parseJobSource(ashbySourceUrl)?.sourceUrl, ashbySourceUrl);
  assert.equal(parseJobSource('https://JOBS.ASHBYHQ.COM/Example-Team/job_AbC-123')?.jobId, 'job_AbC-123');
});

test('company names come from a decoded URL segment without changing case, dots, or hyphens', () => {
  for (const slug of ['relayfi', 'Example-Team', 'company.ai', '星河科技']) {
    const source = parseJobSource('https://jobs.ashbyhq.com/' + encodeURIComponent(slug) + '/' + ashbyJobId);
    assert.equal(source?.siteId, 'ashby');
    if (source?.siteId !== 'ashby') throw new Error('Expected an Ashby source');
    assert.equal(source.companySlug, slug);
  }
});

test('Ashby boards, application forms, misleading hosts, and invalid segments are unsupported', () => {
  for (const raw of [
    'http://jobs.ashbyhq.com/example.ai/' + ashbyJobId,
    'https://jobs.ashbyhq.com',
    'https://jobs.ashbyhq.com/example.ai',
    ashbySourceUrl + '/application',
    ashbySourceUrl + '/unexpected/path',
    'https://jobs.ashbyhq.com//company/' + ashbyJobId,
    'https://jobs.ashbyhq.com.evil.example/company/' + ashbyJobId,
    'https://evil.example/jobs.ashbyhq.com/company/' + ashbyJobId,
    'https://user:pass@jobs.ashbyhq.com/company/' + ashbyJobId,
    'https://jobs.ashbyhq.com:8443/company/' + ashbyJobId,
    ...['%', 'bad%2Fcompany', 'bad%5Ccompany', 'bad%3Fcompany', 'bad%23company', 'bad%00company']
      .map(slug => 'https://jobs.ashbyhq.com/' + slug + '/' + ashbyJobId),
  ]) assert.equal(parseJobSource(raw), null, raw);
});

test('job identity includes the source site and company as well as the job ID', () => {
  const initial = parseJobSource(ashbySourceUrl);
  assert.equal(isSameJobSource(initial, parseJobSource(ashbySourceUrl + '?tracking=1')), true);
  assert.equal(isSameJobSource(initial, parseJobSource(ashbySourceUrl.replace('example.ai', 'another-company'))), false);
  assert.equal(isSameJobSource(parseJobSource('https://www.linkedin.com/jobs/view/123/'),
    parseJobSource('https://jobs.ashbyhq.com/example.ai/123')), false);
  assert.equal(isSameJobSource(initial, null), false);
});

test('source capabilities allow Easy Apply only on LinkedIn', () => {
  const ashby = parseJobSource(ashbySourceUrl)!;
  const linkedin = parseJobSource('https://www.linkedin.com/jobs/view/123/')!;
  assert.equal(supportsApplicationType(ashby, 'external'), true);
  assert.equal(supportsApplicationType(ashby, 'easy_apply'), false);
  assert.equal(supportsApplicationType(linkedin, 'easy_apply'), true);
  assert.ok(sourceDefinitions.ashby.exampleUrl.includes('jobs.ashbyhq.com'));
});

test('ATS identification is independent of supported job-page extraction', () => {
  const url = 'https://jobs.lever.co/example/opaque-id';
  assert.equal(identifyAts(url), 'Lever');
  assert.equal(parseJobSource(url), null);
});

test('popup and background bundles do not depend on DOM extraction adapters', async () => {
  const output = await build({ entryPoints: ['src/popup.ts', 'src/background.ts'], outdir: 'unused',
    bundle: true, write: false, metafile: true });
  assert.ok(Object.keys(output.metafile!.inputs).every(path => !path.startsWith('src/extract/')));
});
