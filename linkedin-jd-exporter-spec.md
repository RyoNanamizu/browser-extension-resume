# LinkedIn Current Job TXT Exporter — Codex Implementation Specification

Version: 1.1

## 1. Task for Codex

Implement a desktop browser extension compatible with Firefox and Chromium. Deliver source code, build configuration, meaningful tests, installation instructions, and loadable build artifacts. Inspect existing project conventions first; initialize a standalone project if the directory is empty. Make routine implementation decisions independently. Clearly distinguish verified behavior from behavior requiring a real, signed-in LinkedIn page.

The user explicitly activates the extension on an already loaded LinkedIn job details page, reviews and optionally edits the extracted information, and downloads a UTF-8 TXT file named `new-jd-<company-name>.txt`.

### Language requirements

- Write this specification, README, implementation report, and other generated project documentation in English.
- All extension-generated labels, status values, placeholders, and warnings saved in TXT files must be in English.
- Preserve company names, job titles, and job descriptions in their original source language. Do not translate or rewrite extracted content. User edits must also be preserved.
- Use English names for project files and artifacts. Keep the required `new-jd-` prefix and `.txt` extension; the company-name component preserves the source company name after filename sanitization. It may contain Unicode. Do not invent an English company name or transliteration.
- Extension UI language is a separate concern: the initial UI may remain Chinese. Map UI messages to English export messages; never copy a Chinese UI warning directly into an exported file.

## 2. Scope

- Support Firefox and Chromium desktop browsers.
- Support only `https://www.linkedin.com/jobs/view/<numeric-job-id>/`, allowing query parameters and an omitted trailing slash.
- Read the page only after the user opens the extension and clicks the extract action.
- Process only the currently loaded job in the current tab.
- Do not process Saved Jobs or `jobs-tracker` pages.
- Do not enumerate jobs, open tabs automatically, apply for jobs, or click Apply or expansion controls.
- Do not call private LinkedIn APIs, request additional job or ATS data, read cookies, or monitor network traffic.
- Process data locally without a backend, AI API, analytics, or telemetry.
- Export one TXT file per user action. No ZIP export, batch export, or history in the initial version.

These constraints describe technical behavior, not LinkedIn authorization. Do not claim that local processing exempts the extension from platform terms or guarantees account safety. Do not add a confirmation dialog to every export solely for this issue.

## 3. User workflow

1. The user opens and loads a LinkedIn job details page and manually expands the description if needed.
2. The user opens the extension popup and clicks the extract action.
3. The extension validates the page and extracts structured information from its current DOM.
4. The popup displays editable company name, job title, application type, application URL, ATS name, and description.
5. The popup identifies missing or uncertain information without guessing values.
6. The user clicks the download action. Generate the TXT using the latest edited values and invoke the downloads API.

Provide extract, re-extract, and download controls with progress and error feedback. Put long descriptions in a scrollable multiline editor. Extraction alone must not trigger a download.

## 4. Data model and TXT output

Use TypeScript where practical. The model must include at least:

```ts
type ApplicationType = 'easy_apply' | 'external' | 'unknown';
type ApplicationUrlStatus = 'available' | 'missing' | 'invalid';

interface JobExport {
  companyName: string;
  jobTitle: string;
  applicationType: ApplicationType;
  applicationUrl: string | null;
  applicationUrlStatus: ApplicationUrlStatus;
  atsName: string | null;
  description: string;
  sourceUrl: string;
  jobId: string;
  extractedAt: string; // ISO 8601 with timezone information
  warnings: string[]; // English export messages; UI localization is separate
}
```

TXT template:

```text
Company Name: Marble AI
Job Title: Software Engineer

Application Type: External Application
Application URL: https://jobs.ashbyhq.com/marble.ai/6f832eeb-08ff-4fb7-8788-420633a72960/application
ATS: Ashby

LinkedIn URL: https://www.linkedin.com/jobs/view/123456789/
Job ID: 123456789
Extracted At: <ISO 8601 timestamp>

Job Description:
<Original description, preserving paragraphs and lists>

Extraction Notes:
<English warnings, one per line; omit this entire section if there are none>
```

Output rules:

| Condition | Application Type | Application URL | ATS |
| --- | --- | --- | --- |
| Easy Apply | LinkedIn Easy Apply | Canonical current job URL | Not Applicable |
| External application with recognized ATS | External Application | Valid extracted target URL | Recognized ATS name |
| External application with unrecognized ATS | External Application | Valid extracted target URL | Unrecognized |
| External application without a readable URL | External Application | Not Available | Unrecognized |
| Application method cannot be determined | Unknown | Valid external URL if independently established, otherwise Not Available | Recognized name if established, otherwise Unrecognized |

- For Easy Apply, the saved job URL is an application entry point, not an external ATS URL.
- Normalize the LinkedIn source URL to `/jobs/view/<job-id>/` without tracking parameters.
- Do not translate, summarize, or rewrite the job description.
- Do not export outer redirect parameters such as `urlhash`, `mt`, or `lipi`; do not log the full redirect URL.
- Prefer warning codes internally and map them to English export messages and separately localized UI messages.
- Example exported warnings: `Application URL is not available in the loaded page.` and `The job description may be incomplete. Expand it manually and extract again.`

## 5. Apply URL parsing

An external Apply link may be a LinkedIn safety redirect:

```text
https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.ashbyhq.com%2Fmarble.ai%2F6f832eeb-08ff-4fb7-8788-420633a72960%2Fapplication&urlhash=example&isSdui=true
```

Expected exported application URL:

```text
https://jobs.ashbyhq.com/marble.ai/6f832eeb-08ff-4fb7-8788-420633a72960/application
```

Requirements:

1. Read candidate links only from verifiable link attributes, such as `href`, belonging to the current job's primary application control. Do not choose an arbitrary page link containing `url`.
2. Parse absolute or relative links with `new URL(rawHref, sourceUrl)`.
3. Treat a link as a supported safety redirect only when its hostname is exactly `www.linkedin.com` or `linkedin.com`, and its pathname is `/safety/go/` or `/safety/go`.
4. Use `searchParams.getAll('url')` and require exactly one nonempty value. Missing, empty, or duplicate values are errors.
5. `URLSearchParams` already decodes the query parameter. Do not unconditionally apply `decodeURIComponent` again. Do not slice everything after `url=` or use a regex as the query parser.
6. Require the extracted target to be a valid absolute HTTP or HTTPS URL. Reject relative targets, unsupported protocols such as `javascript:`, `data:`, and `file:`, and URLs containing username/password credentials.
7. Accept valid direct external HTTP/HTTPS application links. Do not misclassify other LinkedIn internal links as external applications.
8. Preserve meaningful query parameters and encoding inside the target URL, including job identifiers, tokens, and source parameters. Do not repeatedly decode or re-encode the entire target.
9. For nested redirects, unsupported internal redirects, or malformed URLs, report an English export warning and permit manual correction. Do not recursively visit or follow redirects.
10. If Apply is an event-driven button whose URL exists only after a click, report that the URL is unavailable in the loaded page. Do not click it or intercept requests.

The extracted target URL is not guaranteed to be the ultimate landing page after additional server-side redirects. URL parsing must not initiate network requests.

Identify ATS providers using explicit domain rules. Support at least Ashby at `jobs.ashbyhq.com`. Greenhouse, Lever, Workday, and SmartRecruiters may be added with explicit rules and tests. Return null when uncertain. Match exact hostnames or valid dot-delimited subdomains; `jobs.ashbyhq.com.evil.example` must not match Ashby. A company-owned careers site need not have an identifiable ATS.

Revalidate manually edited application URLs and recompute ATS identification. Do not retain stale ATS values. Switching to Easy Apply resets the application URL to the canonical current job URL.

## 6. DOM extraction and incomplete data

- Locate the current job details container before extracting fields. Exclude recommended jobs, sidebar cards, navigation, advertisements, and unrelated company descriptions.
- Keep extraction strategies in a dedicated adapter module with maintainable candidate locators. Do not scatter volatile CSS class names throughout the codebase.
- Combine semantic elements, heading structure, links, accessible names, and stable attributes where practical. Do not claim unverified selectors are verified.
- Read only relevant job data already present in the DOM. Do not inspect private page variables, undocumented caches, or framework internals.
- Convert description markup to plain text while preserving paragraphs and lists. List items may use `- `. Collapse excessive blank lines and exclude control labels.
- If the complete description is already in the DOM and merely CSS-collapsed, it may be extracted. Do not invent content absent from the DOM. If an expansion control suggests incomplete content, ask the user to check completeness and expand manually. Do not claim completeness when it cannot be determined reliably.
- Detect Easy Apply from the primary application control and semantic context, supporting relevant English and Chinese page text. Do not match arbitrary page text containing Easy Apply.
- Conflicting application evidence or ambiguous primary controls must produce an unknown state and a review warning.
- Handle loading pages, expired listings, login walls, and missing job containers explicitly. Never use the entire page text as a fallback description.
- Avoid fixed long waits. Ask the user to finish loading and extract again when appropriate.
- Recheck the URL and job ID for each extraction. If the job ID changes during extraction, discard the result and ask the user to extract again. Do not mix data from jobs A and B.

Company name, job title, and description are required before download; the user may fill missing fields manually. Unknown application type or a missing application URL may be exported with English warnings. Do not fill missing fields using recommended jobs.

## 7. Permissions and architecture

Use Manifest V3 with a shared TypeScript core and separate Firefox and Chromium manifests/builds. Adapt background entry points to each browser. During implementation, consult official documentation and record the minimum supported and actually verified versions in the README.

Prefer user-triggered temporary permissions:

- `activeTab`: access to the user-activated current tab.
- `scripting`: on-demand DOM extraction injection.
- `downloads`: TXT download.

Do not request `<all_urls>`, persistent LinkedIn host access, cookies, webRequest, clipboard access, broad tab-reading permission, or ATS host permissions in the initial version. If an additional permission is genuinely necessary, explain it and first look for an implementation within the existing permission set.

Suggested responsibilities:

- Popup: actions, preview, editing, and status display.
- Extract adapter: job DOM extraction and application evidence.
- Core: URL validation/parsing, ATS identification, TXT formatting, and filename sanitization.
- Background/platform adapter: only where required by the chosen download implementation.

A popup can create a TXT Blob and object URL, invoke the downloads API, and revoke the URL at an appropriate time. Do not assume a service worker has DOM APIs or `URL.createObjectURL`. Verify the download lifecycle in both browsers, including popup closure, to avoid empty files or aborted downloads.

Use text bindings or textareas for previews; do not render page content through `innerHTML`. Keep initial-version data in memory. Do not persist browsing history or raw HTML, and do not load remote code or runtime CDN assets.

## 8. Filenames and encoding

- Default: `new-jd-<company-name>.txt`; do not automatically append job title or job ID.
- The prefix, extension, project filenames, and generated documentation filenames use English. Preserve the original company name, including Chinese or other Unicode characters, unless the user edits it. Do not auto-translate or transliterate company names.
- Replace `<>:"/\\|?*` and control characters. Remove trailing dots/spaces and handle reserved names, empty results, and excessive length.
- If the sanitized company name is empty, use `unknown-company-<job-id>`.
- Limit the company-name component to avoid common filesystem limits.
- Use the downloads API's uniquify behavior for collisions; never silently overwrite. Browser-generated suffixes such as `(1)` are acceptable.
- Update the filename when the user edits the company name.
- Generate UTF-8 `text/plain` content and document the newline policy. A UTF-8 BOM is acceptable for editor compatibility.

## 9. Errors and state

Handle unsupported pages, injection/permission failure, incomplete loading, missing job content, missing/invalid application URLs, job navigation during extraction, and download failure.

Disable relevant buttons while extracting or downloading. Warn before re-extraction overwrites unsaved edits. Initial popup errors may be Chinese and should explain the user's next action; corresponding messages written to TXT must be English. User cancellation of a download is not an extension crash.

## 10. Verification and acceptance criteria

Use meaningful pure-function tests and local HTML fixture tests for critical logic. Do not add implementation-mirroring tests merely to raise coverage.

| Scenario | Expected result |
| --- | --- |
| User has not clicked extract | No page extraction, download, or extension-initiated request |
| Saved Jobs or unsupported page | Explain supported pages; do not scan lists |
| Complete Easy Apply listing | Correct core fields; application entry is the current job URL |
| Ashby safety redirect | Exact target from the example; ATS is Ashby |
| Direct external application URL | Valid URL preserved even if ATS is unrecognized |
| Target contains `?a=1&b=2` | Both target parameters preserved; outer urlhash excluded |
| Target contains `%2F`, `%25`, or encoded plus signs | No double decoding or URL corruption |
| Relative safety redirect | Resolved against the current page and parsed correctly |
| Missing, empty, or duplicate url parameter | Explicit error, no guessed URL |
| Unsupported protocol, credentials, or misleading hostname | Invalid targets rejected; domain identification remains correct |
| Apply URL generated only after clicking | Mark unavailable; do not click or monitor network |
| Description contains headings, paragraphs, and lists | Readable TXT structure; no recommended-job text |
| Description may be incomplete | Clear warning; no false completeness claim |
| Page changes from job A to job B | No mixed result; re-extract B |
| User edits fields | TXT, ATS, and filename reflect latest edits |
| Chinese/Unicode company name or description | Source text preserved; generated labels remain English |
| Chinese popup warning | Export uses the equivalent English message |
| Invalid filename characters, long names, or collisions | Valid UTF-8 file; no silent overwrite |
| Download failure or cancellation | Recoverable state and retry |

Manually verify loading, extraction, editing, downloading, and opening TXT in Firefox and at least one Chromium browser. Inspect extension behavior to ensure it does not request job/ATS data. Distinguish LinkedIn page requests from extension-initiated requests.

When a signed-in real page is unavailable, deliver fixture tests and loadable builds and list outstanding DOM/download verification. Fixture tests alone do not establish real LinkedIn compatibility.

## 11. Deliverables

1. Complete source code and dependency lockfile.
2. Documented dependency installation, test, and build commands.
3. Loadable `dist/chromium/` and `dist/firefox/` directories and corresponding ZIP packages.
4. English README covering scope, permission rationale, build commands, Chromium unpacked loading, Firefox temporary loading, limitations, and actual test environments.
5. Dedicated application URL parsing and ATS identification modules.
6. DOM fixtures and critical tests, identifying selectors actually checked against real pages.
7. English implementation report covering completed work, test results, and outstanding verification.

Do not include extension-store submission, signing/publishing, backend deployment, or LinkedIn automation.

## 12. Implementation order

1. Initialize the minimal cross-browser project and build configuration.
2. Implement and test URL parsing, ATS identification, English TXT formatting, and filename handling.
3. Implement user-triggered DOM extraction with fixtures and completeness warnings.
4. Implement editable preview and download.
5. Build both variants and verify them in available browsers.
6. Deliver code, packages, and a clear verified/unverified report.

Proceed within this scope. Do not reintroduce Saved Jobs traversal or add automatic clicks, requests, or navigation to obtain external URLs.
