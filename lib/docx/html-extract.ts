import mammoth from 'mammoth';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';

export type DocxExtractResult = {
  html: string;
  text: string;
  warnings: string[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTextNodesFromXml(obj: unknown): string[] {
  const texts: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record['w:t']) {
      const wt = record['w:t'];
      if (typeof wt === 'string') texts.push(wt);
      else if (Array.isArray(wt)) wt.forEach((t) => typeof t === 'string' && texts.push(t));
      else if (typeof wt === 'object' && wt !== null && '_' in (wt as Record<string, unknown>)) {
        texts.push(String((wt as Record<string, unknown>)['_']));
      }
    }
    Object.values(record).forEach(walk);
  }

  walk(obj);
  return texts;
}

async function xmlPartToHtml(xmlContent: string): Promise<string> {
  try {
    const parsed = await parseStringPromise(xmlContent);
    const texts = extractTextNodesFromXml(parsed);
    if (texts.length === 0) return '';

    const paragraphs: string[] = [];
    let current = '';

    for (const t of texts) {
      if (t.includes('\n') || t.includes('\r')) {
        const parts = t.split(/\r?\n/);
        parts.forEach((part, idx) => {
          if (idx > 0 && current.trim()) {
            paragraphs.push(`<p>${escapeHtml(current.trim())}</p>`);
            current = '';
          }
          current += part;
        });
      } else {
        current += t;
      }
    }
    if (current.trim()) {
      paragraphs.push(`<p>${escapeHtml(current.trim())}</p>`);
    }

    return paragraphs.join('\n');
  } catch {
    return '';
  }
}

async function extractHeaderFooterSections(buffer: Buffer): Promise<{ headers: string; footers: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const allFiles = Object.keys(zip.files);

  const headerPaths = allFiles
    .filter((f) => /^word\/header\d+\.xml$/i.test(f))
    .sort();
  const footerPaths = allFiles
    .filter((f) => /^word\/footer\d+\.xml$/i.test(f))
    .sort();

  const headerParts: string[] = [];
  for (const path of headerPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const inner = await xmlPartToHtml(xml);
    if (inner) headerParts.push(inner);
  }

  const footerParts: string[] = [];
  for (const path of footerPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const inner = await xmlPartToHtml(xml);
    if (inner) footerParts.push(inner);
  }

  const headers = headerParts.length
    ? `<section class="doc-header" data-doc-part="header" contenteditable="false">${headerParts.join('\n')}</section>`
    : '';

  const footers = footerParts.length
    ? `<section class="doc-footer" data-doc-part="footer" contenteditable="false">${footerParts.join('\n')}</section>`
    : '';

  return { headers, footers };
}

export async function extractDocxHtml(buffer: Buffer): Promise<DocxExtractResult> {
  const warnings: string[] = [];

  const [htmlResult, textResult, headerFooter] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
    extractHeaderFooterSections(buffer).catch(() => ({ headers: '', footers: '' })),
  ]);

  htmlResult.messages.forEach((m) => {
    if (m.type === 'warning') warnings.push(m.message);
  });

  const bodyHtml = htmlResult.value;
  const parts = [headerFooter.headers, bodyHtml, headerFooter.footers].filter(Boolean);
  const html = parts.join('\n');

  return {
    html,
    text: textResult.value,
    warnings,
  };
}

/** Strip read-only header/footer sections before HTML→DOCX conversion. */
export function stripNonEditableDocParts(html: string): string {
  return html
    .replace(/<section[^>]*data-doc-part="header"[^>]*>[\s\S]*?<\/section>/gi, '')
    .replace(/<section[^>]*data-doc-part="footer"[^>]*>[\s\S]*?<\/section>/gi, '')
    .trim();
}
