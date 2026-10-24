import { locators } from './locators';

export function isVisible(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}

const blocks = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'DL', 'DT', 'DD', 'PRE']);
const excluded = `script, style, template, noscript, svg, iframe, button, [role="button"], ${locators.excluded}`;

export function descriptionToText(root: Element): string {
  function read(node: Node): string {
    if (node.nodeType === 3) return (node.nodeValue || '').replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const element = node as Element;
    if (element.matches(excluded) || !isVisible(element)) return '';
    if (element.tagName === 'BR') return '\n';
    const content = [...element.childNodes].map(read).join('');
    if (element.tagName === 'LI') return `\n- ${content.trim()}\n`;
    if (blocks.has(element.tagName)) return `\n\n${content.trim()}\n\n`;
    return content;
  }
  return read(root).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
