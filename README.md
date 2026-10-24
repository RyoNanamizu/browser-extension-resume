# Current Job TXT Exporter

A desktop Manifest V3 extension that extracts the **currently loaded** LinkedIn job only after the user clicks Extract. Review or edit the company, title, application method, application URL, ATS, and description, then download one UTF-8 file named `new-jd-<company-name>.txt`.

The popup uses Chinese UI text. Generated TXT labels, statuses, and extraction notes are English. Company names, titles, descriptions, and user edits retain their source language.

Current version: **1.0.5**. This release increments the package version because 1.0.4 was already occupied. Runtime behavior is unchanged from 1.0.4; the Firefox minimum remains 142. Automatic description-completeness warnings remain removed. Replace or reload the old temporary extension before retrying.

## Load the delivered builds

No dependency installation is needed to load the delivered files.

| Browser | Unpacked directory | ZIP package |
| --- | --- | --- |
| Chromium | `dist/chromium/` | `dist/current-job-txt-chromium-1.0.5.zip` |
| Firefox | `dist/firefox/` | `dist/current-job-txt-firefox-1.0.5.zip` |

**Chromium:** Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose `dist/chromium/`. If using the ZIP, extract it first and choose the directory containing `manifest.json`. Pin the extension for convenient access.

**Firefox:** Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and choose `dist/firefox/manifest.json` or the Firefox ZIP. This is an unsigned development build; the temporary installation disappears when Firefox restarts. For AMO version notes and private reviewer instructions, see [FIREFOX_SUBMISSION.md](FIREFOX_SUBMISSION.md). Signing and publication have not been performed.

`dist/SHA256SUMS` contains the ZIP checksums. Both ZIPs have `manifest.json` at their root.

## Use

1. Open `https://www.linkedin.com/jobs/view/<numeric-job-id>/`. Query parameters and an omitted trailing slash are accepted. Finish loading and manually expand the description if needed.
2. Open the extension and click Extract. Opening the popup alone does not inspect the tab or page.
3. Review the editable preview and any field or application-link warnings. Fill in company name, job title, and description before downloading. If the Apply control has no readable link, enter one manually or export with the English unavailable note.
4. Click Download. The browser saves to its default downloads directory. Open the TXT from the browser's download manager or a text editor. Each action creates a single file; repeated names use the browser's uniquify behavior.

Re-extraction asks before replacing edits that have not been downloaded. Closing the popup clears the preview and edits. Once a download request has reached the background, closing the popup does not own or destroy its download data.

Easy Apply uses the canonical current job URL as an application entry point. Switching to Easy Apply resets the external URL and ATS; switching back clears that entry point. URL edits are revalidated and recompute ATS. A manual ATS edit is retained for the same validated URL and cleared when that URL changes.

## Scope and permissions

Only the exact `https://www.linkedin.com/jobs/view/<numeric-job-id>/` page shape is supported. Extraction is on demand, in the current tab's main frame, and restricted to a recognized job details container. Saved Jobs, lists, and jobs-tracker pages are rejected.

| Permission | Purpose |
| --- | --- |
| `activeTab` | Temporary access granted by the user's extension action. |
| `scripting` | Inject the extraction adapter after the extract action. |
| `downloads` | Save locally generated TXT and observe its download status. |

The manifests request these three permissions only. There are no persistent host permissions, content scripts, tab-reading permission, cookies, webRequest, clipboard access, or ATS permissions. The extension does not click controls, follow redirects, open tabs, enumerate jobs, apply, call LinkedIn/ATS APIs, read private page state, or initiate job-data requests. Runtime code is bundled locally; extension CSP blocks connections.

Processing stays in memory. There is no backend, AI service, telemetry, saved history, raw HTML persistence, or runtime CDN. The downloaded file and the browser's normal download record remain under the user's control. Local processing does not establish LinkedIn authorization or guarantee compliance with platform terms or account safety.

## Install dependencies, test, and build

Use Node.js **22.15 or newer** and pnpm **12.15.0**. Tooling was actually run with Node.js 26.12.1 and pnpm 12.15.0. The committed `pnpm-lock.yaml` fixes dependency resolutions. The workspace permits esbuild's installation script and explicitly declines the unused legacy spawn-sync build script.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm verify:build
pnpm lint:firefox
```

`pnpm check` runs typechecking, the test suite, both builds, and artifact verification. `pnpm build` recreates both loadable directories, both ZIPs, and their checksums. There are no runtime package dependencies.

Optional native browser smoke tests:

```sh
pnpm exec playwright install chromium
pnpm test:browser

# Install Mozilla geckodriver separately, then put it on PATH or provide its path:
GECKODRIVER_PATH=/path/to/geckodriver pnpm test:firefox
```

The Firefox script defaults to `/usr/bin/firefox`; set `FIREFOX_PATH` for another binary. Browser tests launch isolated profiles, serve generated synthetic markup at the supported URL, grant real activeTab access through the browser action, and exercise the unmodified popup document as an extension tab. They do not access a live LinkedIn page. They require an environment that permits browser subprocesses and local automation sockets. Downloads, screenshots, and JSON reports are written under ignored `test-results/`; temporary profiles and Firefox downloads use the OS temporary directory.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/core/application-url.ts` | One-layer safety redirect parsing and HTTP(S) URL validation. |
| `src/core/ats.ts` | Explicit ATS domain rules: Ashby, Greenhouse, Lever, Workday, SmartRecruiters. |
| `src/core/draft.ts` | Required fields, latest edits, application and ATS revalidation, English export notes. |
| `src/core/txt.ts`, `filename.ts` | English TXT formatting, UTF-8 bytes, Unicode-safe filenames. |
| `src/extract/locators.ts`, `sdui.ts` | Centralized selectors and a saved-page-verified signed-in SDUI strategy. |
| `src/extract/adapter.ts`, `plain-text.ts` | Scoped DOM extraction, semantic application evidence, readable paragraphs/lists. |
| `src/platform/extraction.ts` | Active-tab validation and job identity checks across asynchronous injection. |
| `src/popup.ts`, `public/` | Editable preview, progress, overwrite protection, retryable errors. |
| `src/background.ts`, `src/platform/download*.ts` | Browser-owned downloads and background resource cleanup. |
| `manifests/`, `scripts/build.mjs` | Separate MV3 entry points and loadable packages. |

Chromium uses a background service worker and a self-contained `data:text/plain;charset=utf-8;base64,...` URL. Firefox uses a background event page and an extension-owned Blob URL: native Firefox rejected the data URL with this permission set. The Blob lives in the background, not the popup, and is revoked on completion, interruption, or start failure. An immediate status lookup closes the completion-before-listener-tracking race. No offscreen-document or additional permission is required.

TXT uses UTF-8 without a BOM, LF line endings, and an appended final newline. Markup becomes plain text with paragraphs, headings, and `- ` list markers; visible controls and unrelated cards are excluded. User edits are not translated or summarized. The filename's company component preserves Unicode, replaces forbidden/control characters, handles reserved names, and is limited to 180 UTF-8 bytes. An empty sanitized component falls back to `unknown-company-<job-id>`.

## Verified environment and limits

Verification date: **2026-10-24**. Host: Arch Linux x86-64.

| Browser | Declared minimum | Actually tested |
| --- | --- | --- |
| Chromium | 120 | Chrome for Testing 156.0.8078.4, Playwright 1.64.1, headless |
| Firefox desktop | 142.0 | Firefox 158.0.1, geckodriver 0.37.1, headless |

The minimum versions are manifest floors chosen for the APIs and Firefox data declarations; those exact versions were not run. The Firefox minimum is 142 to satisfy validation of the built-in data declaration across Firefox version tables. No gecko_android entry is declared; Android is outside the verified desktop scope.

The **84** pure-function, generated-DOM, popup, and resource-lifecycle tests cover URL parsing, ATS rules, TXT formatting, Unicode filenames, English/Chinese controls, job scoping, loading, missing data, edits, and retry after download failures. Native smoke tests exercise activeTab injection and real local downloads using generated markup.

Tests generate synthetic markup in `tests/pages.mjs`. The SDUI cases cover paragraph titles, company labels, job-specific slots, four lists with 32 synthetic items, and text outside an opening expandable span. No saved website HTML, real job descriptions, or exported JD samples are retained in the repository or source archive. Temporary captures, verification outputs, build packages, and browser results are ignored by Git and excluded from source packaging.

**A live signed-in LinkedIn session has not been tested.** Generated test cases verify the extraction logic but cannot establish compatibility with every account-specific layout.

Automatic description-completeness warnings are omitted per the user's request. A “more” control alone does not prove that extracted DOM text is missing. Missing descriptions still block download until filled. The content is read as present in the DOM; it is not translated, repaired, or rewritten.

Synthetic tests cannot establish compatibility with every live account-specific layout. The absence of a warning does not certify description completeness; extraction reflects the loaded DOM.

Outstanding manual verification: real signed-in English and Chinese listings and layout variants; real foreground toolbar-popup scrolling, focus, and automatic closure; interactive browser cancellation and OS file errors; minimum browser versions; Windows/macOS and other Chromium products. Browser automation reads downloaded UTF-8 files back from disk; opening them in a separate desktop editor was not performed. No server redirect destination is followed or confirmed. For the detailed evidence and acceptance matrix, see [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

## Official documentation consulted

- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): on-demand injection with temporary host access.
- [MDN background manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background): Firefox event pages and Chromium service workers.
- [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads), [MDN downloads.download](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download), and [MDN work with files](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Working_with_files): download options, local Blobs, status, and cleanup.
- [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings): Firefox identity, minimum version, and no-data-collection declaration.
- [Playwright extension testing](https://playwright.dev/docs/chrome-extensions) and [Mozilla geckodriver usage](https://firefox-source-docs.mozilla.org/testing/geckodriver/Usage.html): native browser verification.
