export const exportMessages = {
  company_missing: 'Company name was not found in the loaded job details.',
  title_missing: 'Job title was not found in the loaded job details.',
  description_missing: 'Job description was not found in the loaded job details.',
  application_unknown: 'The application method could not be determined. Review it before exporting.',
  application_conflict: 'Conflicting or ambiguous primary application controls were found. Review the application method and URL.',
  application_url_missing: 'Application URL is not available in the loaded page.',
  application_url_invalid: 'Application URL is invalid. Enter an absolute HTTP or HTTPS URL without credentials.',
  redirect_invalid: 'The LinkedIn safety redirect has a missing, empty, or duplicate url parameter.',
  internal_redirect: 'The application link is an unsupported LinkedIn internal link or nested redirect. Enter the external application URL manually.',
} as const;

export type WarningCode = keyof typeof exportMessages;

export const uiMessages: Record<WarningCode, string> = {
  company_missing: '未找到公司名称，请手动补充。',
  title_missing: '未找到职位名称，请手动补充。',
  description_missing: '当前页面中没有可读的职位描述。请滚动到描述区域并手动展开后重新提取，或手动补充。',
  application_unknown: '申请方式尚不明确，请检查。',
  application_conflict: '主要申请控件存在冲突或歧义，请检查申请方式和链接。',
  application_url_missing: '当前页面没有可读取的申请链接，可手动填写。',
  application_url_invalid: '申请链接无效，请输入不含用户名或密码的完整 HTTP / HTTPS 地址。',
  redirect_invalid: 'LinkedIn 跳转链接的 url 参数缺失、为空或重复，请手动填写外部链接。',
  internal_redirect: '该链接是未支持的站内链接或嵌套跳转，请手动填写外部申请链接。',
};

export function uniqueWarnings(codes: WarningCode[]): WarningCode[] {
  return [...new Set(codes)];
}
