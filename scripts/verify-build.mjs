import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const sums = await readFile('dist/SHA256SUMS', 'utf8');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
for (const browser of ['chromium', 'firefox']) {
  const root = `dist/${browser}`;
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, version);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'downloads']);
  for (const key of ['host_permissions', 'optional_host_permissions', 'content_scripts', 'externally_connectable']) {
    assert.equal(manifest[key], undefined, `${browser} has unexpected ${key}`);
  }
  if (browser === 'chromium') assert.deepEqual(manifest.background, { service_worker: 'background.js' });
  else {
    assert.deepEqual(manifest.background, { scripts: ['background.js'] });
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '142.0');
    assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
    assert.equal(manifest.browser_specific_settings.gecko_android, undefined, 'Android support has not been verified or declared');
  }
  const filename = `current-job-txt-${browser}-${version}.zip`;
  const archive = await readFile(`dist/${filename}`);
  assert.ok(sums.includes(`${createHash('sha256').update(archive).digest('hex')}  ${filename}`));
  const entries = unzipSync(archive);
  assert.equal(Object.keys(entries).length, 10);
  assert.ok(entries['manifest.json'], 'The manifest must be at the ZIP root');
  for (const [name, contents] of Object.entries(entries)) {
    assert.ok(!name.includes('..') && !name.startsWith('/'));
    assert.deepEqual(Buffer.from(contents), await readFile(`${root}/${name}`), `${name} differs from loadable directory`);
    if (name.endsWith('.js')) {
      new Function(Buffer.from(contents).toString('utf8'));
      assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(Buffer.from(contents).toString('utf8')),
        'Runtime network APIs are outside this extension scope');
    }
  }
  const popup = Buffer.from(entries['popup.html']).toString('utf8');
  assert.ok(!/\bon\w+\s*=/.test(popup), 'Inline event handlers violate extension CSP');
  assert.ok(!/<script[^>]+src=["']https?:/i.test(popup));
  console.log(`Verified ${browser}: MV3, minimal permissions, 10 matching ZIP files, JS syntax, local scripts, SHA-256.`);
}
