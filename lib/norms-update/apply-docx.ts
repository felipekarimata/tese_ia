import fs from 'fs/promises';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { NormReference } from '@/lib/norms-update/types';

export type NormUpdateApplyFailure = {
  referenceId: string;
  paragraphIndex: number;
  reason: 'missing-suggested-text' | 'text-not-found' | 'invalid-xml';
};

export type NormUpdateApplyResult = {
  appliedCount: number;
  totalCount: number;
  appliedReferenceIds: string[];
  failures: NormUpdateApplyFailure[];
  changedParagraphIndexes: number[];
};

type ParagraphMatch = {
  start: number;
  end: number;
  xml: string;
  text: string;
  visibleIndex: number;
};

type TextNodeMatch = {
  start: number;
  end: number;
  openTag: string;
  closeTag: string;
  text: string;
  textStart: number;
  textEnd: number;
};

const PARAGRAPH_PATTERN = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
// A self-closing <w:t .../> is an empty Word text node, not an opening tag.
// Treating it as open consumes markup up to a later </w:t> and corrupts the DOCX.
const TEXT_NODE_PATTERN = /(<w:t(?![^>]*\/>)\b(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const NOTE_REFERENCE_PATTERN = /<w:(?:footnoteReference|endnoteReference)\b[^>]*\bw:id=["'](-?\d+)["'][^>]*\/?\s*>/g;
const FLEXIBLE_WHITESPACE = '[\\s\\u00a0\\u2007\\u202f]+';

async function isWellFormedXml(value: string): Promise<boolean> {
  // xml2js/sax can be permissive with XML 1.0 control characters, while Word is not.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return false;
  try {
    await parseStringPromise(value);
    return true;
  } catch {
    return false;
  }
}

async function isWellFormedParagraphXml(value: string): Promise<boolean> {
  return isWellFormedXml(`<validation-root>${value}</validation-root>`);
}

function decodeXmlText(value: string): string {
  return value.replace(
    /&(#x?[0-9a-f]+|amp|apos|gt|lt|quot);/gi,
    (entity, token: string) => {
      const normalized = token.toLowerCase();
      if (normalized === 'amp') return '&';
      if (normalized === 'apos') return "'";
      if (normalized === 'gt') return '>';
      if (normalized === 'lt') return '<';
      if (normalized === 'quot') return '"';

      const radix = normalized.startsWith('#x') ? 16 : 10;
      const rawCodePoint = normalized.startsWith('#x')
        ? normalized.slice(2)
        : normalized.slice(1);
      const codePoint = Number.parseInt(rawCodePoint, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
  );
}

function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextPattern(value: string): RegExp | null {
  const pieces = value
    .normalize('NFC')
    .trim()
    .split(/[\s\u00a0\u2007\u202f]+/)
    .filter(Boolean)
    .map(escapeRegExp);

  return pieces.length > 0
    ? new RegExp(pieces.join(FLEXIBLE_WHITESPACE))
    : null;
}

type NoteMarkerResolution = {
  text: string;
  removedLabels: string[];
};

function noteReferenceCount(paragraphXml: string): number {
  return [...paragraphXml.matchAll(NOTE_REFERENCE_PATTERN)]
    .filter(match => !match[1].startsWith('-'))
    .length;
}

function removeMarkerIndexes(
  value: string,
  markers: Array<{ start: number; end: number; label: string }>,
  indexes: number[]
): NoteMarkerResolution {
  const selected = indexes.map(index => markers[index]).sort((a, b) => b.start - a.start);
  let text = value;
  for (const marker of selected) {
    text = `${text.slice(0, marker.start)}${text.slice(marker.end)}`;
  }
  return {
    text,
    removedLabels: indexes.map(index => markers[index].label)
  };
}

function markerIndexCombinations(total: number, choose: number, limit = 64): number[][] {
  const combinations: number[][] = [];
  const current: number[] = [];

  const visit = (start: number) => {
    if (combinations.length >= limit) return;
    if (current.length === choose) {
      combinations.push([...current]);
      return;
    }
    for (let index = start; index < total; index++) {
      current.push(index);
      visit(index + 1);
      current.pop();
      if (combinations.length >= limit) return;
    }
  };

  visit(0);
  return combinations;
}

function resolveNoteMarkers(
  value: string,
  paragraphXml: string,
  paragraphText: string
): NoteMarkerResolution | null {
  const exactPattern = buildTextPattern(value);
  if (exactPattern?.test(paragraphText)) return { text: value, removedLabels: [] };

  const referenceCount = noteReferenceCount(paragraphXml);
  if (referenceCount === 0) return null;

  const markers = [...value.matchAll(/\s*\[(\d+)\]/g)].flatMap(match =>
    match.index === undefined
      ? []
      : [{
          start: match.index,
          end: match.index + match[0].length,
          label: match[1]
        }]
  );
  if (markers.length < referenceCount) return null;

  const combinations = markerIndexCombinations(markers.length, referenceCount);
  for (const indexes of combinations) {
    const resolution = removeMarkerIndexes(value, markers, indexes);
    if (buildTextPattern(resolution.text)?.test(paragraphText)) return resolution;
  }

  return null;
}

function removeResolvedMarkers(value: string, labels: string[]): string {
  let result = value;
  for (const label of labels) {
    result = result.replace(new RegExp(`\\s*\\[${escapeRegExp(label)}\\]`), '');
  }
  return result;
}

function extractTextNodes(paragraphXml: string): TextNodeMatch[] {
  const nodes: TextNodeMatch[] = [];
  let accumulatedLength = 0;

  for (const match of paragraphXml.matchAll(TEXT_NODE_PATTERN)) {
    if (match.index === undefined) continue;

    const text = decodeXmlText(match[2]).normalize('NFC');
    const fullMatch = match[0];
    nodes.push({
      start: match.index,
      end: match.index + fullMatch.length,
      openTag: match[1],
      closeTag: match[3],
      text,
      textStart: accumulatedLength,
      textEnd: accumulatedLength + text.length
    });
    accumulatedLength += text.length;
  }

  return nodes;
}

function extractParagraphs(xmlContent: string): ParagraphMatch[] {
  const paragraphs: ParagraphMatch[] = [];
  let visibleIndex = 0;

  for (const match of xmlContent.matchAll(PARAGRAPH_PATTERN)) {
    if (match.index === undefined) continue;

    const xml = match[0];
    const text = extractTextNodes(xml).map(node => node.text).join('');
    if (!text.trim()) continue;

    paragraphs.push({
      start: match.index,
      end: match.index + xml.length,
      xml,
      text,
      visibleIndex
    });
    visibleIndex++;
  }

  return paragraphs;
}

function ensureWhitespacePreservation(openTag: string, text: string): string {
  if (!/^\s|\s$/.test(text) || /\bxml:space=/.test(openTag)) return openTag;
  return openTag.replace(/>$/, ' xml:space="preserve">');
}

function replaceAcrossTextNodes(
  paragraphXml: string,
  originalText: string,
  suggestedText: string
): string | null {
  const nodes = extractTextNodes(paragraphXml);
  const joinedText = nodes.map(node => node.text).join('');
  const noteResolution = resolveNoteMarkers(originalText, paragraphXml, joinedText);
  if (!noteResolution) return null;
  const matchableSuggestedText = removeResolvedMarkers(
    suggestedText,
    noteResolution.removedLabels
  );
  const pattern = buildTextPattern(noteResolution.text);
  const match = pattern?.exec(joinedText);
  if (!match || match.index === undefined) return null;

  const replacementStart = match.index;
  const replacementEnd = replacementStart + match[0].length;
  const startNodeIndex = nodes.findIndex(
    node => replacementStart >= node.textStart && replacementStart < node.textEnd
  );
  const endNodeIndex = nodes.findIndex(
    node => replacementEnd > node.textStart && replacementEnd <= node.textEnd
  );
  if (startNodeIndex < 0 || endNodeIndex < 0) return null;

  const updatedTexts = nodes.map(node => node.text);
  const startNode = nodes[startNodeIndex];
  const endNode = nodes[endNodeIndex];
  const prefix = startNode.text.slice(0, replacementStart - startNode.textStart);
  const suffix = endNode.text.slice(replacementEnd - endNode.textStart);

  if (startNodeIndex === endNodeIndex) {
    updatedTexts[startNodeIndex] = `${prefix}${matchableSuggestedText.normalize('NFC')}${suffix}`;
  } else {
    updatedTexts[startNodeIndex] = `${prefix}${matchableSuggestedText.normalize('NFC')}`;
    for (let index = startNodeIndex + 1; index < endNodeIndex; index++) {
      updatedTexts[index] = '';
    }
    updatedTexts[endNodeIndex] = suffix;
  }

  let updatedXml = paragraphXml;
  for (let index = nodes.length - 1; index >= 0; index--) {
    if (updatedTexts[index] === nodes[index].text) continue;

    const openTag = ensureWhitespacePreservation(nodes[index].openTag, updatedTexts[index]);
    const replacement = `${openTag}${encodeXmlText(updatedTexts[index])}${nodes[index].closeTag}`;
    updatedXml = `${updatedXml.slice(0, nodes[index].start)}${replacement}${updatedXml.slice(nodes[index].end)}`;
  }

  return updatedXml;
}

function locateParagraph(
  paragraphs: ParagraphMatch[],
  reference: NormReference
): ParagraphMatch | undefined {
  const containsReference = (paragraph: ParagraphMatch): boolean => {
    return resolveNoteMarkers(reference.fullText, paragraph.xml, paragraph.text) !== null;
  };

  const preferred = paragraphs[reference.paragraphIndex];
  if (preferred && containsReference(preferred)) return preferred;

  const candidates = paragraphs.filter(containsReference);
  if (candidates.length <= 1) return candidates[0];

  return candidates.reduce((closest, candidate) => {
    const closestDistance = Math.abs(closest.visibleIndex - reference.paragraphIndex);
    const candidateDistance = Math.abs(candidate.visibleIndex - reference.paragraphIndex);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

export async function applyNormUpdatesToDocx(
  inputPath: string,
  outputPath: string,
  references: NormReference[]
): Promise<NormUpdateApplyResult> {
  const data = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(data);

  const file = zip.file('word/document.xml');
  if (!file) throw new Error('document.xml not found');

  let xmlContent = (await file.async('string')).normalize('NFC');
  if (!(await isWellFormedXml(xmlContent))) {
    throw new Error('O DOCX de origem contém um document.xml inválido');
  }
  const sortedReferences = [...references].sort((a, b) => b.paragraphIndex - a.paragraphIndex);
  const appliedReferenceIds: string[] = [];
  const failures: NormUpdateApplyFailure[] = [];
  const changedParagraphIndexes = new Set<number>();

  for (const reference of sortedReferences) {
    if (!reference.suggestedText) {
      failures.push({
        referenceId: reference.id,
        paragraphIndex: reference.paragraphIndex,
        reason: 'missing-suggested-text'
      });
      continue;
    }

    const paragraphs = extractParagraphs(xmlContent);
    const paragraph = locateParagraph(paragraphs, reference);
    if (!paragraph) {
      failures.push({
        referenceId: reference.id,
        paragraphIndex: reference.paragraphIndex,
        reason: 'text-not-found'
      });
      continue;
    }

    const updatedParagraphXml = replaceAcrossTextNodes(
      paragraph.xml,
      reference.fullText,
      reference.suggestedText
    );
    if (!updatedParagraphXml) {
      failures.push({
        referenceId: reference.id,
        paragraphIndex: reference.paragraphIndex,
        reason: 'text-not-found'
      });
      continue;
    }

    if (!(await isWellFormedParagraphXml(updatedParagraphXml))) {
      failures.push({
        referenceId: reference.id,
        paragraphIndex: reference.paragraphIndex,
        reason: 'invalid-xml'
      });
      continue;
    }

    xmlContent = `${xmlContent.slice(0, paragraph.start)}${updatedParagraphXml}${xmlContent.slice(paragraph.end)}`;
    appliedReferenceIds.push(reference.id);
    changedParagraphIndexes.add(paragraph.visibleIndex);
  }

  if (!(await isWellFormedXml(xmlContent))) {
    throw new Error('As alterações produziram um document.xml inválido; o arquivo não foi salvo');
  }

  zip.file('word/document.xml', Buffer.from(xmlContent, 'utf-8'));
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  await fs.writeFile(outputPath, outputBuffer);

  return {
    appliedCount: appliedReferenceIds.length,
    totalCount: sortedReferences.length,
    appliedReferenceIds,
    failures,
    changedParagraphIndexes: [...changedParagraphIndexes].sort((a, b) => a - b)
  };
}
