import { toTextDataUrl } from '../core/txt';

export interface TextResource { url: string; release: () => void }
export interface DownloadResources {
  create: (text: string) => TextResource;
  track: (id: number, resource: TextResource) => void;
}

type Monitor = Pick<typeof chrome.downloads, 'onChanged' | 'search'>;
type UrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;

// Firefox's background event page supports Blob URLs but denies data: downloads
// with the minimal permissions. Chromium's service worker has no object URL API.
// Register the monitor at background startup, before any download can be started.
export function createDownloadResources(downloads: Monitor, urlApi: Partial<UrlApi> = URL): DownloadResources {
  const pending = new Map<number, TextResource>();
  function release(id: number) {
    const resource = pending.get(id);
    pending.delete(id);
    resource?.release();
  }
  downloads.onChanged.addListener(delta => {
    if (['complete', 'interrupted'].includes(delta.state?.current || '')) release(delta.id);
  });
  return {
    create(text) {
      if (typeof urlApi.createObjectURL === 'function' && typeof urlApi.revokeObjectURL === 'function') {
        const url = urlApi.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        let released = false;
        return { url, release() {
          if (!released) { released = true; urlApi.revokeObjectURL!(url); }
        } };
      }
      return { url: toTextDataUrl(text), release() {} };
    },
    track(id, resource) {
      pending.set(id, resource);
      // A tiny TXT may complete before download() resolves. Close that event race.
      void downloads.search({ id }).then(([item]) => {
        if (!item || item.state === 'complete' || item.state === 'interrupted') release(id);
      }).catch(() => { /* Retain the URL until its terminal onChanged event. */ });
    },
  };
}
