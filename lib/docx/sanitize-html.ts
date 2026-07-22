/** Allowlist sanitizer for document HTML edited in contenteditable. */

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'br', 'hr', 'a',
  'section', 'span', 'div', 'blockquote',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  section: new Set(['class', 'data-doc-part', 'contenteditable']),
  a: new Set(['href']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  br: new Set(['style']),
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof DOMParser !== 'undefined';
}

export function sanitizeDocumentHtml(html: string): string {
  if (!html.trim()) return '';
  if (!isBrowser()) return stripScripts(html);

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return '';

  sanitizeNode(root);
  return root.innerHTML;
}

function sanitizeNode(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child);
      continue;
    }

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      while (el.firstChild) {
        el.parentNode?.insertBefore(el.firstChild, el);
      }
      el.parentNode?.removeChild(el);
      continue;
    }

    const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (!allowed.has(name) && name !== 'class')) {
        el.removeAttribute(attr.name);
      }
    });

    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (/^javascript:/i.test(href)) el.removeAttribute('href');
    }

    sanitizeNode(el);
  }
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

export function htmlToPlainText(html: string): string {
  if (!isBrowser()) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
