# Reproduce version 1.0.5

This source archive matches Current Job TXT Exporter 1.0.5. It contains the TypeScript sources, original popup HTML/CSS, manifests, tests, build scripts, dependency lockfile, and documentation.

## Environment

The release was built on Arch Linux x86-64 using Node.js 26.12.1 and pnpm 12.15.0. Use these versions to reproduce the verified build. The project requires Node.js 22.15 or later; other operating systems and CPU architectures have not been verified.

If pnpm is unavailable, install the specified version with `npm install --global pnpm@12.15.0`. Dependencies are obtained through pnpm from the npm registry. No website account, browser installation, or private credential is needed to build.

## Commands

Extract the source ZIP into an empty directory, open a terminal in the directory containing package.json, and run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm verify:build
```

The Firefox submission is `dist/current-job-txt-firefox-1.0.5.zip`; its unpacked files are in `dist/firefox/`. The same build also produces the Chromium package and `dist/SHA256SUMS`.

The build uses esbuild to transpile and bundle TypeScript, copies the popup HTML/CSS and browser manifests, generates the PNG icons locally, and packages the output. It does not minify or obfuscate the code. The workspace explicitly allows esbuild's installation script and disables the unused legacy spawn-sync build script. The Firefox manifest requires version 142 or later and declares no data collection.

## Optional checks

```sh
pnpm typecheck
pnpm test
NO_UPDATE_NOTIFIER=1 pnpm lint:firefox
```

These checks do not require a live LinkedIn account. Native browser smoke tests are separate and require the browser/automation setup described in README.md. No live signed-in LinkedIn session was used for the recorded automated checks.

## Source packaging

`pnpm package:source` creates `releases/current-job-txt-source-1.0.5.zip` and a separate SHA-256 checksum. Packaging uses an explicit allowlist: source directories, build/test scripts, manifests, documentation, and dependency configuration. Tests generate their own synthetic markup in code. Saved pages, real job descriptions, exported TXT samples, verification reports, browser profiles, node_modules, .git, and built extension packages are excluded.
