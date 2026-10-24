import { revalidateDraft } from './core/draft';
import { createFilename } from './core/filename';
import type { ApplicationType, ExtractionError, JobDraft } from './core/model';
import { uiMessages } from './core/warnings';
import { api } from './platform/api';
import type { DownloadReply } from './platform/download';
import { extractFromActiveTab } from './platform/extraction';

function get<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
}

const fields = {
  company: get<HTMLInputElement>('company'), title: get<HTMLInputElement>('title'),
  applicationType: get<HTMLSelectElement>('application-type'),
  applicationUrl: get<HTMLInputElement>('application-url'), ats: get<HTMLInputElement>('ats'),
  description: get<HTMLTextAreaElement>('description'),
};
const extractButton = get<HTMLButtonElement>('extract');
const reextractButton = get<HTMLButtonElement>('reextract');
const downloadButton = get<HTMLButtonElement>('download');
const editor = get<HTMLFormElement>('editor');
const overwrite = get<HTMLDivElement>('overwrite');
const status = get<HTMLParagraphElement>('status');
let draft: JobDraft | null = null;
let dirty = false;
let busy = false;
let downloadId: number | null = null;

const errors: Record<ExtractionError, string> = {
  unsupported_page: '请打开 https://www.linkedin.com/jobs/view/数字职位编号/ 职位详情页，再点击提取。不支持职位列表或已保存职位。',
  login_required: '页面要求登录。请手动登录并加载职位详情后重试。',
  expired_job: '页面显示该职位已过期或停止接受申请。请打开有效的职位详情页。',
  page_loading: '职位内容尚在加载。请等待网页加载完成后重新提取。',
  missing_container: '未识别到当前职位详情布局。请确认打开的是单个职位页面；若已加载完成，请反馈页面示例。',
  ambiguous_container: '页面存在多个无法区分的职位容器，无法安全提取。请打开单个职位详情页。',
  job_changed: '提取期间职位发生变化，结果已丢弃。请在新职位加载完成后重新提取。',
};

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function setBusy(value: boolean) {
  busy = value;
  extractButton.disabled = value;
  reextractButton.disabled = value;
  get<HTMLButtonElement>('confirm-reextract').disabled = value;
  get<HTMLFieldSetElement>('fields').disabled = value;
  downloadButton.disabled = value || !draft || !draft.companyName.trim()
    || !draft.jobTitle.trim() || !draft.description.trim();
}

function render() {
  if (!draft) return;
  editor.hidden = false;
  extractButton.hidden = true;
  reextractButton.hidden = false;
  fields.applicationUrl.readOnly = draft.applicationType === 'easy_apply';
  fields.ats.readOnly = draft.applicationType === 'easy_apply' || draft.applicationUrlStatus !== 'available';
  fields.ats.placeholder = draft.applicationType === 'easy_apply' ? '不适用'
    : draft.applicationUrlStatus !== 'available' ? '填写有效申请链接后可编辑' : '未识别，可手动填写';
  fields.applicationUrl.value = draft.applicationUrl || '';
  fields.ats.value = draft.atsName || '';
  const urlStatuses = { available: '链接可用', missing: '链接缺失；仍可带说明导出', invalid: '链接无效；导出时将标记为 Not Available' };
  get('url-status').textContent = draft.applicationType === 'easy_apply'
    ? '使用当前 LinkedIn 职位链接作为申请入口。' : urlStatuses[draft.applicationUrlStatus];
  get('filename').textContent = createFilename(draft.companyName, draft.jobId);
  get('source').textContent = draft.sourceUrl;
  get('extracted-at').textContent = draft.extractedAt;
  get('warnings').replaceChildren(...draft.warningCodes.map(code => {
    const item = document.createElement('li');
    item.textContent = uiMessages[code];
    return item;
  }));
  setBusy(busy);
}

async function extract() {
  if (busy) return;
  overwrite.hidden = true;
  setBusy(true);
  setStatus('正在读取当前职位的已加载内容…');
  try {
    const result = await extractFromActiveTab(api);
    if (!result.ok) {
      // Do not leave an old job's preview alongside a new extraction error.
      draft = null;
      dirty = false;
      editor.hidden = true;
      extractButton.hidden = false;
      reextractButton.hidden = true;
      setStatus(errors[result.error], true);
      return;
    }
    draft = result.job;
    dirty = false;
    downloadId = null;
    fields.company.value = draft.companyName;
    fields.title.value = draft.jobTitle;
    fields.applicationType.value = draft.applicationType;
    fields.description.value = draft.description;
    render();
    setStatus('已提取。请检查内容并补充带 * 的必填项，再下载。');
  } catch {
    draft = null;
    dirty = false;
    editor.hidden = true;
    extractButton.hidden = false;
    reextractButton.hidden = true;
    setStatus('无法读取页面：可能缺少临时访问权限或页面已关闭。请重新打开扩展并点击提取。', true);
  } finally { setBusy(false); }
}

function requestExtraction() {
  if (busy) return;
  if (dirty) { overwrite.hidden = false; return; }
  void extract();
}
extractButton.addEventListener('click', requestExtraction);
reextractButton.addEventListener('click', requestExtraction);
get('confirm-reextract').addEventListener('click', () => void extract());
get('cancel-reextract').addEventListener('click', () => { overwrite.hidden = true; });

for (const field of Object.values(fields)) {
  field.addEventListener('input', () => {
    if (!draft || busy) return;
    const oldType = draft.applicationType;
    const urlChanged = field === fields.applicationUrl || field === fields.applicationType;
    let applicationUrl = fields.applicationUrl.value;
    if (oldType === 'easy_apply' && fields.applicationType.value !== 'easy_apply') applicationUrl = '';
    draft = { ...draft, companyName: fields.company.value, jobTitle: fields.title.value,
      applicationType: fields.applicationType.value as ApplicationType,
      applicationUrl: applicationUrl || null, description: fields.description.value,
      ...(urlChanged ? { applicationUrlStatus: 'missing' as const, atsOverride: undefined } : {}),
    };
    if (field === fields.ats && draft.applicationUrlStatus === 'available' && draft.applicationUrl) {
      draft.atsOverride = { url: draft.applicationUrl, value: fields.ats.value || null };
    }
    draft = revalidateDraft(draft);
    dirty = true;
    overwrite.hidden = true;
    render();
  });
}

function showDownloadState(item: { state: string; error?: string }) {
  if (item.state === 'complete') {
    dirty = false;
    setStatus('TXT 已下载。请在浏览器下载列表中打开文件。');
    setBusy(false);
  } else if (item.state === 'interrupted') {
    setStatus(item.error === 'USER_CANCELED' ? '下载已取消。内容仍在，可重新下载。'
      : '下载未完成。请检查浏览器下载列表后重试。', true);
    setBusy(false);
  }
}

api.downloads.onChanged.addListener(delta => {
  if (delta.id !== downloadId || !delta.state?.current) return;
  showDownloadState({ state: delta.state.current, error: delta.error?.current });
});

editor.addEventListener('submit', event => {
  event.preventDefault();
  if (!draft || busy || !editor.reportValidity()) return;
  draft = revalidateDraft(draft);
  setBusy(true);
  setStatus('正在准备 UTF-8 文件…');
  void (async () => {
    try {
      const reply: DownloadReply = await api.runtime.sendMessage({ type: 'download-job', job: draft });
      if (!reply?.ok) {
        setStatus(reply?.cancelled ? '下载已取消。内容仍在，可重新下载。' : '无法开始下载。请检查浏览器下载设置后重试。', true);
        setBusy(false);
        return;
      }
      downloadId = reply.id;
      setStatus('下载已开始，可在浏览器下载列表查看进度。关闭弹窗不会停止已发起的下载。');
      const [item] = await api.downloads.search({ id: reply.id });
      if (item) showDownloadState(item);
      // Keep controls available if the browser reports an unusual pending state.
      if (!item) setBusy(false);
    } catch {
      setStatus('下载失败或已取消。内容仍在，请重试。', true);
      setBusy(false);
    }
  })();
});
