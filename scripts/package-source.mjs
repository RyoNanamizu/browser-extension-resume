import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const paths = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
  '.gitignore', 'README.md', 'BUILDING.md', 'IMPLEMENTATION_REPORT.md', 'FIREFOX_SUBMISSION.md',
];
async function collect(directory, extensions) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path, extensions);
    else if (entry.isFile() && extensions.includes(extname(path))) paths.push(path);
    else throw new Error(`Unexpected source entry: ${path}`);
  }
}
for (const [directory, extensions] of Object.entries({
  src: ['.ts'], public: ['.html', '.css'], manifests: ['.json'],
  scripts: ['.mjs'], tests: ['.ts', '.mts', '.mjs'],
})) await collect(directory, extensions);
const entries = {};
for (const path of paths.sort()) {
  entries[path.replaceAll('\\', '/')] = [new Uint8Array(await readFile(path)),
    { mtime: new Date('2024-01-01T00:00:00Z'), level: 9 }];
}
const archive = zipSync(entries);
const filename = `current-job-txt-source-${version}.zip`;
await mkdir('releases', { recursive: true });
await writeFile(`releases/${filename}`, archive);
await writeFile(`releases/${filename}.sha256`, `${createHash('sha256').update(archive).digest('hex')}  ${filename}\n`);
console.log(`Packaged releases/${filename}: ${paths.length} source files, ${archive.length} bytes.`);
