import { sanitizeEditorialText } from '@/lib/book-workflow/output';
import type {
  BookChapterSummary,
  BookEditorialPlan,
  BookSuggestion,
  BookSuggestionKind,
} from './types';

function extractJsonPayload(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(candidate.slice(objectStart, objectEnd + 1));
    }
    throw new Error('A IA não retornou JSON válido');
  }
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

export function parseChapterSummary(
  response: string,
  fallback: Pick<BookChapterSummary, 'chapterId' | 'title' | 'order'>
): BookChapterSummary {
  try {
    const parsed = extractJsonPayload(response) as Record<string, unknown>;
    return {
      ...fallback,
      role: stringValue(parsed.role, 'Capítulo integrante da obra'),
      summary: stringValue(parsed.summary, response.trim().slice(0, 1800)),
      openingFocus: stringValue(parsed.openingFocus),
      endingFocus: stringValue(parsed.endingFocus),
      keyConcepts: stringArray(parsed.keyConcepts).slice(0, 20),
    };
  } catch {
    return {
      ...fallback,
      role: 'Capítulo integrante da obra',
      summary: response.trim().slice(0, 1800),
      openingFocus: '',
      endingFocus: '',
      keyConcepts: [],
    };
  }
}

export function parseEditorialPlan(
  response: string,
  chapterSummaries: BookChapterSummary[]
): BookEditorialPlan {
  try {
    const parsed = extractJsonPayload(response) as Record<string, unknown>;
    const terminology = Array.isArray(parsed.terminology)
      ? parsed.terminology.map((entry: any) => ({
          preferred: stringValue(entry?.preferred),
          avoid: stringArray(entry?.avoid),
          note: stringValue(entry?.note),
        })).filter((entry) => entry.preferred)
      : [];
    const globalIssues = Array.isArray(parsed.globalIssues)
      ? parsed.globalIssues.map((entry: any) => ({
          type: ['repetition', 'continuity', 'terminology', 'gap', 'structure'].includes(entry?.type)
            ? entry.type
            : 'other',
          description: stringValue(entry?.description),
          chapters: stringArray(entry?.chapters),
        })).filter((entry) => entry.description)
      : [];
    const chapterGuidance = Array.isArray(parsed.chapterGuidance)
      ? parsed.chapterGuidance.map((entry: any) => ({
          chapterId: stringValue(entry?.chapterId),
          title: stringValue(entry?.title),
          role: stringValue(entry?.role),
          preserve: stringArray(entry?.preserve),
          recommendedChanges: stringArray(entry?.recommendedChanges),
          transitionIn: stringValue(entry?.transitionIn),
          transitionOut: stringValue(entry?.transitionOut),
        })).filter((entry) => entry.chapterId)
      : [];

    return {
      overview: stringValue(parsed.overview, 'Plano editorial gerado para a obra.'),
      centralThesis: stringValue(parsed.centralThesis),
      proposedStructure: stringValue(parsed.proposedStructure),
      terminology,
      globalIssues,
      chapterGuidance,
      proposedAdditions: stringArray(parsed.proposedAdditions),
      chapterSummaries,
    };
  } catch {
    return {
      overview: response.trim().slice(0, 4000) || 'Plano editorial gerado para a obra.',
      centralThesis: '',
      proposedStructure: '',
      terminology: [],
      globalIssues: [],
      chapterGuidance: chapterSummaries.map((chapter) => ({
        chapterId: chapter.chapterId,
        title: chapter.title,
        role: chapter.role,
        preserve: [],
        recommendedChanges: [],
        transitionIn: '',
        transitionOut: '',
      })),
      proposedAdditions: [],
      chapterSummaries,
      rawResponse: response.trim().slice(0, 12000),
    };
  }
}

const SUGGESTION_KINDS = new Set<BookSuggestionKind>([
  'transition',
  'terminology',
  'repetition',
  'cohesion',
  'structure',
  'addition',
  'language',
]);

export function parseBookSuggestions(params: {
  response: string;
  chapterId: string;
  chapterTitle: string;
  paragraphs: Array<{ index: number; text: string; isHeader: boolean }>;
}): BookSuggestion[] {
  const parsed = extractJsonPayload(params.response) as { suggestions?: unknown };
  if (!Array.isArray(parsed.suggestions)) return [];

  const paragraphsByIndex = new Map(params.paragraphs.map((paragraph) => [paragraph.index, paragraph]));
  const seen = new Set<number>();
  const suggestions: BookSuggestion[] = [];

  for (const raw of parsed.suggestions as any[]) {
    const paragraphIndex = Number(raw?.paragraphIndex);
    const paragraph = paragraphsByIndex.get(paragraphIndex);
    if (!Number.isInteger(paragraphIndex) || !paragraph || paragraph.isHeader || seen.has(paragraphIndex)) {
      continue;
    }

    const improvedText = sanitizeEditorialText(raw?.revisedText);
    if (!improvedText || improvedText === paragraph.text.trim()) continue;

    const kind = SUGGESTION_KINDS.has(raw?.kind) ? raw.kind : 'cohesion';
    suggestions.push({
      id: `${params.chapterId}:p-${paragraphIndex}`,
      chapterId: params.chapterId,
      chapterTitle: params.chapterTitle,
      paragraphIndex,
      occurrenceIndex: 0,
      originalText: paragraph.text,
      improvedText,
      reason: stringValue(raw?.reason, 'Ajuste editorial para a coesão do livro.'),
      kind,
    });
    seen.add(paragraphIndex);
  }

  return suggestions;
}
