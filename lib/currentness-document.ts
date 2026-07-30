import fs from 'fs/promises';
import mammoth from 'mammoth';

type ReviewParagraph = {
  text: string;
  isHeader: boolean;
  headerLevel?: number;
  index: number;
};

type ReviewSection = {
  title: string;
  level: number;
  startParagraphIndex: number;
  endParagraphIndex: number;
  paragraphCount: number;
};

export type CurrentnessDocumentStructure = {
  sections: ReviewSection[];
  totalParagraphs: number;
  totalChapters: number;
};

const BLOCK_PATTERN = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const FOOTNOTE_PATTERN = /<li\b[^>]*\bid=["']footnote-[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith('#x') || token.startsWith('#X')) {
      const codePoint = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (token.startsWith('#')) {
      const codePoint = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return named[token.toLowerCase()] ?? entity;
  });
}

function htmlFragmentToText(fragment: string): string {
  return decodeHtmlEntities(
    fragment
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .normalize('NFC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Many academic DOCX files use numbered paragraphs as visual headings without
 * assigning a Word heading style. Recognize those headings conservatively so
 * that research blocks retain their real subject instead of inheriting a stale
 * title for dozens of pages.
 */
export function inferNumberedHeadingLevel(text: string): number | undefined {
  const withoutFootnoteMarker = text.replace(/(?:\s*\[\d+\])+\s*$/, '').trim();
  if (!withoutFootnoteMarker || withoutFootnoteMarker.length > 220) return undefined;

  const match = withoutFootnoteMarker.match(/^(\d+(?:\.\d+){0,5})(\.?)\s*(?=\p{L})/u);
  if (!match) return undefined;

  const parts = match[1].split('.').map(Number);
  if (parts.some(part => !Number.isFinite(part)) || parts[0] > 99) return undefined;
  if (parts.length === 1 && match[2] !== '.') return undefined;

  return Math.min(6, Math.max(1, parts.length));
}

export function parseMammothReviewHtml(html: string): {
  structure: CurrentnessDocumentStructure;
  paragraphs: ReviewParagraph[];
} {
  const paragraphs: ReviewParagraph[] = [];
  const sanitizedHtml = html.replace(FOOTNOTE_PATTERN, '');

  for (const match of sanitizedHtml.matchAll(BLOCK_PATTERN)) {
    const tag = match[1].toLowerCase();
    const text = htmlFragmentToText(match[2]);
    if (!text) continue;

    const styledLevel = tag.startsWith('h') ? Number.parseInt(tag.slice(1), 10) : undefined;
    const inferredLevel = styledLevel ?? inferNumberedHeadingLevel(text);

    paragraphs.push({
      text,
      isHeader: inferredLevel !== undefined,
      ...(inferredLevel !== undefined ? { headerLevel: inferredLevel } : {}),
      index: paragraphs.length
    });
  }

  const sections: ReviewSection[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.isHeader || !paragraph.headerLevel) continue;

    const previous = sections[sections.length - 1];
    if (previous) {
      previous.endParagraphIndex = paragraph.index - 1;
      previous.paragraphCount = previous.endParagraphIndex - previous.startParagraphIndex + 1;
    }

    sections.push({
      title: paragraph.text,
      level: paragraph.headerLevel,
      startParagraphIndex: paragraph.index,
      endParagraphIndex: paragraph.index,
      paragraphCount: 1
    });
  }

  if (sections.length === 0 && paragraphs.length > 0) {
    sections.push({
      title: paragraphs[0].text.substring(0, 100) || 'Documento',
      level: 1,
      startParagraphIndex: 0,
      endParagraphIndex: paragraphs.length - 1,
      paragraphCount: paragraphs.length
    });
  } else if (sections.length > 0) {
    const last = sections[sections.length - 1];
    last.endParagraphIndex = paragraphs.length - 1;
    last.paragraphCount = last.endParagraphIndex - last.startParagraphIndex + 1;
  }

  return {
    structure: {
      sections,
      totalParagraphs: paragraphs.length,
      totalChapters: sections.filter(section => section.level === 1).length
    },
    paragraphs
  };
}

/** Extracts review text through Mammoth, matching the document shown in the UI. */
export async function extractCurrentnessDocument(filePath: string): Promise<{
  structure: CurrentnessDocumentStructure;
  paragraphs: ReviewParagraph[];
}> {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.convertToHtml({ buffer });
  return parseMammothReviewHtml(result.value);
}
