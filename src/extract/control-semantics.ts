export function controlName(control: Element): string {
  return [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function isEasyApplyControl(control: Element): boolean {
  return /\beasy\s+apply\b|轻松申请|輕鬆申請|简易申请|簡易申請/i.test(controlName(control));
}

export function isExternalApplyControl(control: Element): boolean {
  return /^(apply|apply now|apply on company website|申请|立即申请|申請|立即申請|申请职位|申請職位)(?:\b|\s|$)/i
    .test(controlName(control));
}

export function isApplicationControl(control: Element): boolean {
  return isEasyApplyControl(control) || isExternalApplyControl(control);
}
