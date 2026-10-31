// Semantic classes and tab attributes verified against the supplied saved Ashby page.
// Generated CSS-module suffixes are deliberately not selectors.
export const ashbyLocators = {
  title: '.ashby-job-posting-heading',
  description: '.ashby-job-posting-description',
  overviewPanel: '.ashby-job-posting-description-container, [role="tabpanel"][aria-labelledby="job-overview"]',
  overviewLink: 'a#job-overview[href], a[role="tab"][aria-controls="overview"][href]',
  boardLink: '.ashby-job-board-back-to-all-jobs-button[href]',
  excluded: 'aside, nav, footer, .ashby-job-posting-left-pane',
  loading: '#root[aria-busy="true"], .ashby-job-posting-right-pane[aria-busy="true"], .ashby-job-posting-right-pane [aria-busy="true"], .ashby-job-posting-right-pane [role="progressbar"]',
  expired: '#root [role="alert"], main [role="alert"]',
} as const;
