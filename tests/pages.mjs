// Synthetic markup created for automated tests. No saved website pages or real job descriptions.
const legacyPages = {
  "easy-apply": "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Local job fixture</title></head><body>\n<nav><a href=\"/jobs/collections/saved/\">Saved jobs</a><button>Easy Apply</button></nav>\n<main class=\"job-view-layout\" data-job-id=\"123456789\">\n  <header class=\"jobs-unified-top-card\">\n    <h1>Software Engineer</h1>\n    <div class=\"job-details-jobs-unified-top-card__company-name\"><a href=\"/company/marble-ai/\">Marble AI</a></div>\n    <button class=\"jobs-apply-button\" aria-label=\"Easy Apply to Software Engineer\">Easy Apply</button>\n  </header>\n  <section class=\"jobs-description\">\n    <h2>About the job</h2>\n    <div id=\"job-details\">\n      <h3>Build useful tools</h3><p>We build <strong>reliable</strong> products.</p>\n      <p>Keep the original paragraphs.</p><h4>Responsibilities</h4>\n      <ul><li>Write TypeScript.</li><li>Review code.<ul><li>Share feedback.</li></ul></li></ul>\n      <p>Line one.<br>Line two.</p>\n      <button>Show more</button><script>throw new Error('Not job content');</script>\n      <span hidden>Hidden tracking text</span>\n    </div>\n  </section>\n  <aside data-testid=\"recommended-jobs\"><h1>Unrelated Title</h1><div data-testid=\"company-name\">Wrong Company</div><p>Recommended secret text</p><a class=\"jobs-apply-button\" href=\"https://evil.example/\">Apply</a></aside>\n</main>\n<section data-testid=\"recommended-jobs\"><p>Easy Apply at another company</p></section>\n</body></html>\n",
  "ashby": "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><link rel=\"icon\" href=\"data:,\"><title>Local external job fixture</title></head><body>\n<main class=\"jobs-details\" data-job-id=\"123456789\">\n  <div class=\"jobs-unified-top-card\"><h1>Software Engineer</h1>\n    <a class=\"topcard__org-name-link\" href=\"/company/marble-ai/\">Marble AI</a>\n    <a class=\"jobs-apply-button\" href=\"https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs.ashbyhq.com%2Fmarble.ai%2F6f832eeb-08ff-4fb7-8788-420633a72960%2Fapplication&amp;urlhash=example&amp;isSdui=true\">Apply</a>\n  </div>\n  <section class=\"jobs-description\"><h2>About the job</h2><div id=\"job-details\"><p>Own thoughtful engineering.</p><ul><li>Ship features.</li><li>Help customers.</li></ul></div></section>\n  <a href=\"/safety/go/?url=https%3A%2F%2Fevil.example%2F\">Not the Apply control</a>\n</main></body></html>\n",
  "chinese-collapsed": "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>Chinese local job fixture</title></head><body>\n<main><section aria-label=\"职位详情\" data-job-id=\"123456789\">\n  <header><h1>软件工程师 / 平台</h1><span data-testid=\"company-name\">星河科技 🚀</span><button>轻松申请</button></header>\n  <section class=\"jobs-description\"><h2>职位描述</h2><div id=\"job-details\" style=\"max-height: 10px; overflow: hidden\">\n    <p>我们专注于可靠的软件。</p><p>保留原始语言与段落。</p><ul><li>开发与维护产品。</li><li>与团队合作。</li></ul><p>这段内容在 DOM 中，但在折叠区下方。</p>\n  </div><button aria-expanded=\"false\" onclick=\"throw new Error('The extension must not expand this')\">展开更多</button></section>\n</section></main></body></html>\n",
  "event-apply": "<!doctype html><html><head><meta charset=\"utf-8\"><title>Event-driven Apply fixture</title></head><body>\n<main data-testid=\"job-details\" data-job-id=\"123456789\"><header><h1 data-testid=\"job-title\">Product Engineer</h1><div data-testid=\"company-name\">Local Careers</div><button data-testid=\"apply-button\" onclick=\"throw new Error('The extension must not apply')\">Apply now</button></header>\n<section><h2>About the job</h2><article><p>Make product decisions.</p><ol><li>Discuss the problem.</li><li>Build the solution.</li></ol></article></section>\n<a href=\"https://jobs.ashbyhq.com/unrelated\">Suggested job</a></main></body></html>\n"
};

function sduiPage(loaded) {
  const jobId = '900000001';
  const target = 'https://careers.example.org/jobs/900000001?source=example';
  const lists = Array.from({ length: 4 }, (_, group) => `<ul>${Array.from({ length: 8 }, (_, item) =>
    `<li>Synthetic responsibility ${group * 8 + item + 1}. Maintain an example software component, explain its behavior, review a proposed change, and document a reproducible outcome. This sentence exists only to exercise long descriptions, list preservation, and text extraction in automated tests.</li>`).join('')}</ul>`).join('');
  const description = loaded ? `<h2>About the job</h2><p><span data-testid="expandable-text-box"><strong>Role overview</strong><br>Synthetic engineering role for automated testing.</span></p>${lists}<p>End of the synthetic description.</p><button data-testid="expandable-text-button" aria-hidden="true">… more</button>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Synthetic SDUI test</title></head><body>
<nav><a href="https://careers.example.org/unrelated">Apply</a></nav>
<main id="workspace">
<section><div><div><div aria-label="Company, Example Company." componentkey="example-company"><a href="/company/example/">Example Company</a></div><button>More options</button></div>
<div><div data-display-contents="true"><p>Platform Engineer</p></div></div><p>Example location</p></div>
<a aria-label="Apply on company website" href="https://www.linkedin.com/safety/go/?url=${encodeURIComponent(target)}&amp;urlhash=example&amp;mt=example">Apply</a></section>
<div id="JobDetails_AboutTheJob_${jobId}" componentkey="JobDetails_AboutTheJob_${jobId}">${description}</div>
<div id="JobDetails_AboutTheCompany_${jobId}" componentkey="JobDetails_AboutTheCompany_${jobId}"><p>Unrelated company overview.</p></div>
<div id="JobDetailsSimilarJobsSlot_${jobId}" componentkey="JobDetailsSimilarJobsSlot_${jobId}"><span role="progressbar"></span><div data-job-id="999"><p>Recommended Engineer</p><div aria-label="Company, Another Company."><a href="/company/another/">Another Company</a></div><a aria-label="Apply on company website" href="https://careers.example.org/999">Apply</a></div></div>
</main></body></html>`;
}

export const ashbyJobId = '11111111-2222-4333-8444-555555555555';
export const ashbySourceUrl = `https://jobs.ashbyhq.com/example.ai/${ashbyJobId}`;

function ashbyHostedPage() {
  const lists = [8, 7, 4, 5, 8].map((count, group) => `<p><strong>Synthetic section ${group + 1}</strong></p><ul>${Array.from({ length: count }, (_, item) =>
    `<li><p><strong>Responsibility ${group + 1}.${item + 1}:</strong> Preserve this synthetic list item and its original paragraph.</p></li>`).join('')}</ul>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Synthetic Web Engineer @ Display Company</title></head><body>
<div id="root">
  <div class="ashby-job-posting-header"><a href="https://company.example/"><img alt="Display Company"></a><a class="ashby-job-board-back-to-all-jobs-button" href="/example.ai" aria-label="Back to Display Company’s Job Listings"></a></div>
  <div class="generated-container-v1"><div><h1 class="generated-title-v1 ashby-job-posting-heading">Synthetic Web Engineer</h1></div>
    <div><div class="ashby-job-posting-left-pane"><h2>Location</h2><p>Example City</p><h2>Department</h2><p>Example Team</p></div>
      <div class="ashby-job-posting-right-pane">
        <nav role="tablist"><a id="job-overview" role="tab" aria-controls="overview" aria-selected="true" href="/example.ai/${ashbyJobId}">Overview</a><a id="job-application-form" role="tab" aria-controls="form" href="/example.ai/${ashbyJobId}/application">Application</a></nav>
        <div id="overview" role="tabpanel" aria-labelledby="job-overview" class="generated-panel-v1 ashby-job-posting-description-container">
          <div class="generated-description-v1 ashby-job-posting-description"><p>Synthetic opening paragraph with <strong>original wording</strong>.</p><p></p>${lists}<p>Line one.<br>Line two.</p><p><em>End of the synthetic Ashby description.</em></p></div>
          <a class="apply-link" href="/example.ai/${ashbyJobId}/application"><button>Apply for this Job</button></a>
        </div>
      </div>
    </div>
  </div>
  <aside><h1 class="ashby-job-posting-heading">Recommended Job</h1><div class="ashby-job-posting-description">Unrelated recommended content</div><span role="progressbar"></span></aside>
  <footer><p>Powered by Ashby</p><a href="https://company.example/privacy">Privacy Policy</a></footer>
</div></body></html>`;
}

export function makePage(name) {
  if (name === 'indeed-external' || name === 'indeed-easy') {
    return `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="canonical" href="https://ca.indeed.com/viewjob?jk=abc123def4567890">
    <div data-testid="viewjob-main-content"><div data-testid="desktop-job-header">
    <h5 data-testid="vj-job-title">Synthetic Indeed Engineer</h5>
    <div data-testid="company-info-metadata"><a href="/cmp/example">Indeed Example</a><span>3.6</span><span>Remote</span></div>
    <div data-testid="primary-apply-action"><a data-testid="viewjob-apply" href="/applystart?jk=abc123def4567890">${name === 'indeed-easy' ? 'Apply now' : 'Apply on company site'}</a></div></div>
    <div data-testid="viewjob-job-content"><h4 data-testid="vj-job-description-heading">Full job description</h4>
    <div class="simple-job-description-html"><style>.unused { color: red }</style><p>Synthetic Indeed description.</p><ul><li>Build tools.</li><li>Review code.</li></ul><p>Final Indeed paragraph.</p></div></div></div>`;
  }
  if (name === 'ashby-hosted') return ashbyHostedPage();
  if (name === 'sdui-empty') return sduiPage(false);
  if (name === 'sdui-loaded') return sduiPage(true);
  if (Object.hasOwn(legacyPages, name)) return legacyPages[name];
  throw new Error(`Unknown synthetic test page: ${name}`);
}
