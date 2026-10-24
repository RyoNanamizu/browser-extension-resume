# Firefox submission notes — 1.0.5

Prepared on 2026-10-24. These are submission materials; no upload, signing, or publication has been performed.

The AMO source-code upload is `releases/current-job-txt-source-1.0.5.zip`, generated with `pnpm package:source`. Upload it in the Source code field after choosing Yes for generated/bundled code. The runnable add-on upload remains `dist/current-job-txt-firefox-1.0.5.zip`. Build instructions are included in [BUILDING.md](BUILDING.md).

## Version notes

Copy the following into the version notes field:

> Version-only repackage: the previous version number was already occupied. Version 1.0.5 contains the same runtime behavior as 1.0.4. The Firefox minimum remains 142, the add-on remains desktop-only, and the no-data-collection declaration and permissions are unchanged.
>
> The add-on extracts one loaded LinkedIn job after an explicit user action, provides an editable preview, and downloads a local UTF-8 TXT file. Source code and reproducible build instructions accompany this version.

## Notes to Reviewer

Copy this section into the private Notes to Reviewer field, then provide working test-account access there if needed for the live LinkedIn workflow:

> Current Job TXT Exporter is a desktop extension for saving one currently loaded LinkedIn job as a local TXT file. It has no extension-specific account or backend. Full testing of signed-in LinkedIn layouts requires access to a working LinkedIn account; public job pages may be restricted by LinkedIn.
>
> Test account access: the publisher must provide the dedicated LinkedIn test username, password, and any necessary login instructions privately in this reviewer field before final submission when account access is required. Credentials have not been supplied with these source files.
>
> To test: sign in to LinkedIn, open an available individual job at https://www.linkedin.com/jobs/view/ followed by its numeric job ID, wait for the title and description to load, and expand the description manually if needed. Open the toolbar action and click “提取当前职位” (Extract current job). Review or edit the company, title, application method, application URL, ATS, and description. Click “下载 TXT” (Download TXT). Confirm that new-jd-&lt;company-name&gt;.txt contains the previewed fields and description. The popup UI is Chinese; generated file labels and notes are English, and source content keeps its original language.
>
> Opening the popup alone does not read the page. activeTab grants temporary access following the user's action; scripting reads the current tab's main-frame DOM only after Extract; downloads saves the locally generated file and reports completion. The add-on does not read cookies or credentials, click application controls, follow redirects, request job/ATS data, transmit extracted content, or load remote code. Preview data remains in memory; closing the popup clears it. The downloaded file remains on the user's device. data_collection_permissions.required is ["none"].
>
> The source uses TypeScript bundled locally with esbuild, without minification. Use Node.js 22.15 or later and pnpm 12.15.0, then run pnpm install --frozen-lockfile and pnpm check. The Firefox output is dist/firefox/ and dist/current-job-txt-firefox-1.0.5.zip. pnpm lint:firefox runs the pinned Mozilla validator. scripts/firefox-smoke.mjs and scripts/browser-smoke.mjs serve generated synthetic markup under the supported URL in isolated profiles using native extension APIs; they do not access a live LinkedIn account. Automated tests generate synthetic markup, including long descriptions, four lists, and 32 list items. No saved LinkedIn page or real job description is included in the sources. Live signed-in operation and foreground toolbar-popup presentation still require manual verification.

## Compatibility and verification

The Firefox manifest declares `gecko.strict_min_version: "142.0"` and no `gecko_android` entry. Select desktop Firefox platforms in AMO; Android operation has not been tested. Firefox 142 itself has not been run; the native test environment is documented in [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

The old manifest's warning was reproduced with web-ext 10.8.0 / addons-linter 10.14.0: `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`. The final package passed this same validator with warnings treated as errors: zero errors, warnings, and notices; run `NO_UPDATE_NOTIFIER=1 pnpm lint:firefox` to reproduce validation. Generated validation reports are kept outside the source archive.

The generic reminders about version notes and accounts are review preparation guidance, separate from the manifest warning. Account access remains a publisher-provided part of the private review submission. Do not put personal credentials in this document, public version notes, source archives, or the extension package.

References: [Mozilla's data consent versions and declaration](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), [desktop and Android manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings), and [AMO submission fields](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).
