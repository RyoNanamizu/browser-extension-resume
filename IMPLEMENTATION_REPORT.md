# Implementation and Verification Report

Version: **1.0.5**  
Verification date: **2026-10-24**

## Delivery

The desktop Firefox and Chromium extension provides user-triggered extraction of one loaded LinkedIn job, an editable preview, and a local UTF-8 TXT download. Both builds use only activeTab, scripting, and downloads. Firefox requires version 142 or later and declares no data collection. Runtime behavior is unchanged by this repository cleanup.

| Deliverable | Location |
| --- | --- |
| Runtime sources | src/, public/, manifests/ |
| Build and package scripts | scripts/ |
| Automated tests with generated synthetic markup | tests/ |
| Reproducible build instructions | [BUILDING.md](BUILDING.md) |
| Firefox submission notes | [FIREFOX_SUBMISSION.md](FIREFOX_SUBMISSION.md) |
| Firefox package | dist/current-job-txt-firefox-1.0.5.zip |
| Chromium package | dist/current-job-txt-chromium-1.0.5.zip |
| Source archive | releases/current-job-txt-source-1.0.5.zip |

No upload, signing, or publication has been performed.

## Repository cleanup

Saved website HTML, actual job descriptions, exported TXT samples, old source archives, screenshots, download copies, and obsolete verification reports were removed. No saved HTML fixture files remain. Tests generate synthetic legacy and SDUI markup in tests/pages.mjs; the company, role, job ID, destination, description, and list items in the SDUI regression are fictional.

Git ignores temporary captures, browser results, verification outputs, dist/, and releases/. The source packager uses an allowlist of code, tests, build configuration, and documentation. It excludes saved pages, exported samples, reports, dependencies, and browser/build artifacts. Required tests remain runnable from the source archive.

## Behavior

Opening the popup does not inspect the page. An explicit extraction action validates the active job URL, injects the adapter into the main frame, and rechecks job identity. Both legacy and SDUI strategies keep fields within the current job and exclude recommendations. Description formatting retains paragraphs, lists, and text outside an opening expandable span. Missing company, title, or description blocks export until filled. Generic completeness warnings are omitted; absence of a warning does not certify completeness.

The application parser validates direct URLs and one supported LinkedIn safety redirect without making requests. It preserves target parameters and recognizes supported ATS hosts. Unknown application details may be exported with English notes. TXT uses UTF-8, LF newlines, source-language content, and safe Unicode filenames. Downloads use browser collision handling and background-owned data so a started download survives popup closure.

## Verification

Environment: Arch Linux x86-64, Node.js 26.12.1, pnpm 12.15.0, web-ext 10.8.0, addons-linter 10.14.0.

- Type checking and 84 automated tests pass with generated synthetic markup.
- Both loadable builds and ZIPs pass package, manifest, permission, syntax, and checksum checks.
- Firefox validation reports zero errors, warnings, and notices.
- Native headless Firefox 158.0.1 and Chrome for Testing 156.0.8078.4 workflows verify activeTab extraction, edits, UTF-8 downloads, filename collisions, long synthetic descriptions, all 32 synthetic list items, and download integrity after closing the popup document.
- The source ZIP is checked for excluded data and rebuilt in a fresh directory. Its outputs match the delivered browser packages byte-for-byte.

Native automation exercises the popup document as an extension tab after a toolbar action grants activeTab. It does not test the presentation of an anchored foreground toolbar popup or access live LinkedIn.

## Pending verification

Live signed-in LinkedIn and account-specific layouts; foreground toolbar-popup scrolling/focus/closure; interactive download cancellation and OS errors; Firefox 142 and Chromium 120 minimum versions; Android, Windows, macOS, Edge, private browsing, and managed configurations remain unverified. Server redirect destinations are not visited. Any required LinkedIn test-account access must be arranged privately by the publisher with the reviewer.
