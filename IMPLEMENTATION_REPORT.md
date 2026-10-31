# Implementation and Verification Report

Version: **1.1.0**

Verification date: **2026-10-29**

## Delivery

The desktop Firefox and Chromium extension provides user-triggered extraction of one loaded LinkedIn or Ashby job, an editable preview, and a local UTF-8 TXT download. Both builds use only activeTab, scripting, and downloads. Firefox requires version 142 or later and declares no data collection. Version 1.1.0 adds hosted Ashby extraction, typed source/DOM registries, full-source identity checks, a generic Source URL export label, and hyphenated filename whitespace.

| Deliverable | Location |
| --- | --- |
| Runtime sources | src/, public/, manifests/ |
| Build and package scripts | scripts/ |
| Automated tests with generated synthetic markup | tests/ |
| Reproducible build instructions | [BUILDING.md](BUILDING.md) |
| Firefox submission notes | [FIREFOX_SUBMISSION.md](FIREFOX_SUBMISSION.md) |
| Firefox package | dist/current-job-txt-firefox-1.1.0.zip |
| Chromium package | dist/current-job-txt-chromium-1.1.0.zip |
| Source archive | releases/current-job-txt-source-1.1.0.zip |

No upload, signing, or publication has been performed.

## Repository cleanup

Committed tests generate synthetic LinkedIn legacy/SDUI and hosted Ashby markup in tests/pages.mjs. Saved website pages, real JD text, browser outputs, and build artifacts are excluded from Git and source archives. The supplied local tmp/ashbyhq.html remains ignored and was used only for local DOM verification.

Git ignores temporary captures, browser results, verification outputs, dist/, and releases/. The source packager uses an allowlist of code, tests, build configuration, and documentation. It excludes saved pages, exported samples, reports, dependencies, and browser/build artifacts. Required tests remain runnable from the source archive.

## Behavior

Opening the popup does not inspect the page. An explicit extraction action validates the active job URL, injects the adapter into the main frame, and rechecks job identity. Both LinkedIn legacy and SDUI strategies keep fields within the current job and exclude recommendations. Description formatting retains paragraphs, lists, and text outside an opening expandable span. Missing company, title, or description blocks export until filled. Generic completeness warnings are omitted; absence of a warning does not certify completeness.

Pure URL definitions and DOM extractors use separate typed registries. Source metadata drives popup application options and download validation. New sites add a source definition, extractor, registration, and tests; the popup and background do not depend on DOM adapter modules. Ashby extracts company from the URL, title and description from semantic Ashby classes, and uses the canonical job page as its application URL. Its Overview and board links are checked against the current source to reject stale job/company DOM. Generic identity checks also reject source or company changes even when job IDs match.

The application parser validates direct URLs and one supported LinkedIn safety redirect without making requests. It preserves target parameters and recognizes supported ATS hosts. Unknown application details may be exported with English notes. TXT uses UTF-8, LF newlines, source-language content, and safe Unicode filenames. Downloads use browser collision handling and background-owned data so a started download survives popup closure.

## Verification

Environment: Arch Linux x86-64, Node.js 26.12.1, pnpm 12.15.0, web-ext 10.8.0, addons-linter 10.14.0.

- Type checking and 111 automated tests pass with generated synthetic markup.
- Both loadable builds and ZIPs pass package, manifest, permission, syntax, and checksum checks.
- Firefox validation reports zero errors, warnings, and notices.
- Native headless Firefox 159.0 and Chrome for Testing 156.0.8078.4 workflows verify activeTab extraction, edits, UTF-8 downloads, filename collisions, long synthetic descriptions, all 32 synthetic LinkedIn list items, hosted Ashby extraction and downloads with five lists and 32 items, and download integrity after closing the popup document. Both tests observed only the four fixture navigations and no extension-initiated job/ATS requests.
- The source ZIP is checked for excluded data and rebuilt in a fresh directory. Its outputs match the delivered browser packages byte-for-byte.

Local verification of the supplied Ashby HTML produced company relayfi, title Senior Web Developer I, the canonical job URL as application entry, 9,942 description characters, all 32 list items, and the final notice, without controls/footer text or warnings. The capture was parsed without running page scripts or loading resources.

Native automation exercises the popup document as an extension tab after a toolbar action grants activeTab. It does not test the presentation of an anchored foreground toolbar popup or access live LinkedIn/Ashby.

## Pending verification

Live signed-in LinkedIn and other Ashby company/layout variants; foreground toolbar-popup scrolling/focus/closure; interactive download cancellation and OS errors; Firefox 142 and Chromium 120 minimum versions; Android, Windows, macOS, Edge, private browsing, and managed configurations remain unverified. Server redirect destinations are not visited. Any required LinkedIn test-account access must be arranged privately by the publisher with the reviewer.
