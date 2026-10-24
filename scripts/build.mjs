import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { zipSync } from 'fflate';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));

// Small geometric document icon, generated as PNG without a runtime dependency.
function icon(size) {
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const paper = x > size * .22 && x < size * .77 && y > size * .14 && y < size * .86;
    const line = paper && x > size * .33 && x < size * .67
      && [.36, .5, .64].some(yy => Math.abs(y - size * yy) < Math.max(1, size * .025));
    const color = paper && !line ? [247, 249, 248, 255] : [35, 102, 79, 255];
    pixels.set(color, i);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

async function filesUnder(root, at = root) {
  const entries = await readdir(at, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(at, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else files.push([relative(root, path).replaceAll('\\', '/'), new Uint8Array(await readFile(path))]);
  }
  return files;
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const hashes = [];
for (const browser of ['chromium', 'firefox']) {
  const outdir = `dist/${browser}`;
  await mkdir(`${outdir}/icons`, { recursive: true });
  await build({ entryPoints: ['src/popup.ts', 'src/background.ts'], outdir, bundle: true,
    format: 'iife', target: ['chrome120', 'firefox142'], legalComments: 'none' });
  await build({ entryPoints: ['src/extract/inject.ts'], outfile: `${outdir}/extract.js`, bundle: true,
    format: 'iife', globalName: 'CurrentJobExtraction', target: ['chrome120', 'firefox142'],
    footer: { js: 'CurrentJobExtraction.run();' }, legalComments: 'none' });
  await cp('public/popup.html', `${outdir}/popup.html`);
  await cp('public/popup.css', `${outdir}/popup.css`);
  await cp(`manifests/${browser}.json`, `${outdir}/manifest.json`);
  for (const size of [16, 32, 48, 128]) await writeFile(`${outdir}/icons/icon-${size}.png`, icon(size));
  const entries = await filesUnder(outdir);
  const archive = zipSync(Object.fromEntries(entries.map(([name, data]) => [name, [data,
    { mtime: new Date('2024-01-01T00:00:00Z'), level: 9 }]])));
  const name = `current-job-txt-${browser}-${version}.zip`;
  await writeFile(`dist/${name}`, archive);
  hashes.push(`${createHash('sha256').update(archive).digest('hex')}  ${name}`);
  console.log(`Built ${outdir}/ and dist/${name} (${archive.length} bytes)`);
}
await writeFile('dist/SHA256SUMS', hashes.join('\n') + '\n');
