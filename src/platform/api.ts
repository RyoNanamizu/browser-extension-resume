// Firefox exposes promise-based browser.*, Chromium supports promises on the
// subset of chrome.* APIs used here. The supported floors are in the manifests.
export const api: typeof chrome = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser
  ?? chrome;
