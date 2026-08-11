import type { PromptParagraph } from '@/lib/document-processing/whole-document';
import type { BookAssemblyMode, BookSuggestion } from './types';

export function buildChapterDigest(
  paragraphs: PromptParagraph[],
  maxChars = 16000
): string {
  if (paragraphs.length === 0) return '(capítulo sem texto extraível)';

  const chosen = new Map<number, PromptParagraph>();
  const add = (paragraph: PromptParagraph | undefined) => {
    if (paragraph) chosen.set(paragraph.index, paragraph);
  };

  paragraphs.filter((paragraph) => paragraph.isHeader).forEach(add);
  paragraphs.slice(0, 8).forEach(add);
  paragraphs.slice(-8).forEach(add);

  const targetSamples = Math.min(18, paragraphs.length);
  for (let i = 0; i < targetSamples; i++) {
    const index = Math.round((i / Math.max(1, targetSamples - 1)) * (paragraphs.length - 1));
    add(paragraphs[index]);
  }

  const ordered = [...chosen.values()].sort((a, b) => a.index - b.index);
  let result = '';
  for (const paragraph of ordered) {
    const line = `[[P${paragraph.index}]] ${paragraph.text}\n\n`;
    if (result.length + line.length > maxChars) break;
    result += line;
  }
  return result.trim();
}

export function chunkBookParagraphs(
  paragraphs: PromptParagraph[],
  maxChars = 18000
): PromptParagraph[][] {
  const chunks: PromptParagraph[][] = [];
  let current: PromptParagraph[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    const serializedLength = paragraph.text.length + 24;
    if (current.length > 0 && currentLength + serializedLength > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(paragraph);
    currentLength += serializedLength;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function serializeBookParagraphs(paragraphs: PromptParagraph[]): string {
  return paragraphs
    .map((paragraph) => `[[P${paragraph.index}]] ${paragraph.text}`)
    .join('\n\n');
}

const OBVIOUS_SPANISH_INTRUSIONS = [
  'inclusión', 'información', 'investigación', 'legislación', 'administración',
  'situación', 'relación', 'también', 'aunque', 'derecho', 'impuestos',
];

export function introducesObviousSpanish(originalText: string, improvedText: string): boolean {
  const original = originalText.toLocaleLowerCase('pt-BR');
  const improved = improvedText.toLocaleLowerCase('pt-BR');
  return OBVIOUS_SPANISH_INTRUSIONS.some(
    (term) => improved.includes(term) && !original.includes(term)
  );
}

export function constrainSuggestions(
  suggestions: BookSuggestion[],
  paragraphCount: number,
  mode: Exclude<BookAssemblyMode, 'compile'>
): { accepted: BookSuggestion[]; warnings: string[] } {
  const warnings: string[] = [];
  const languageSafe = suggestions.filter((suggestion) => {
    if (introducesObviousSpanish(suggestion.originalText, suggestion.improvedText)) {
      warnings.push(`A sugestão ${suggestion.id} foi descartada porque introduziria texto em espanhol.`);
      return false;
    }
    return true;
  });

  const maximum = mode === 'structural'
    ? Math.min(250, Math.max(8, Math.ceil(paragraphCount * 0.6)))
    : Math.min(120, Math.max(4, Math.ceil(paragraphCount * 0.25)));
  if (languageSafe.length <= maximum) return { accepted: languageSafe, warnings };

  warnings.push(
    `A IA propôs ${languageSafe.length} alterações; o modo ${mode === 'structural' ? 'estrutural' : 'conservador'} manteve somente ${maximum}.`
  );
  return { accepted: languageSafe.slice(0, maximum), warnings };
}

function normalizeParagraphText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function attachOccurrenceIndexes(
  suggestions: BookSuggestion[],
  paragraphs: PromptParagraph[]
): BookSuggestion[] {
  const occurrences = new Map<number, number>();
  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const key = normalizeParagraphText(paragraph.text);
    const occurrence = counts.get(key) ?? 0;
    occurrences.set(paragraph.index, occurrence);
    counts.set(key, occurrence + 1);
  }
  return suggestions.map((suggestion) => ({
    ...suggestion,
    occurrenceIndex: occurrences.get(suggestion.paragraphIndex) ?? 0,
  }));
}
