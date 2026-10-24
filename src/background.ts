import { api } from './platform/api';
import { startDownload } from './platform/download';
import { createDownloadResources } from './platform/download-resources';

const resources = createDownloadResources(api.downloads);

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('popup.html')
    || message?.type !== 'download-job') return false;
  void startDownload(message.job, api.downloads, resources).then(sendResponse);
  // Keep the message event alive while the browser accepts the download. Firefox
  // owns its Blob in this background page; Chromium uses self-contained data.
  return true;
});
