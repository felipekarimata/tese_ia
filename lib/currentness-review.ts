import { randomUUID } from 'crypto';
import type { AIProvider } from '@/lib/ai/types';
import {
  formatResearchEvidence,
  generateStructuredJson,
  researchWithWebSearch,
  type ResearchDepth,
  type ResearchSource
} from '@/lib/ai/research';
import type { NormReference, NormStatus } from '@/lib/norms-update/types';

export type ReviewScope = 'norms' | 'currentness';

export type CurrentnessCategory =
  | 'statistic'
  | 'academic'
  | 'legal'
  | 'guideline'
  | 'technology'
  | 'factual'
  | 'other';

export type CurrentnessVerdict =
  | 'outdated'
  | 'contradicted'
  | 'new_evidence'
  | 'uncertain';

export type CurrentnessFinding = NormReference & {
  reviewScope: 'currentness';
  category: CurrentnessCategory;
  verdict: CurrentnessVerdict;
};

type ReviewParagraph = {
  text: string;
  isHeader: boolean;
  headerLevel?: number;
  index: number;
};

type ReviewSection = {
  title: string;
  startParagraphIndex: number;
  endParagraphIndex: number;
};

export type ReviewSegment = {
  title: string;
  text: string;
  paragraphs: Array<{ text: string; index: number }>;
};

type ReviewDocumentOptions = {
  paragraphs: ReviewParagraph[];
  sections: ReviewSection[];
  provider: AIProvider;
  model: string;
  apiKey: string;
  depth?: ResearchDepth;
  onProgress?: (current: number, total: number) => Promise<void> | void;
  onLog?: (message: string) => Promise<void> | void;
};

const MAX_SEGMENT_CHARS = 14_000;

function splitParagraphs(
  paragraphs: Array<{ text: string; index: number }>,
  maxChars = MAX_SEGMENT_CHARS
): Array<Array<{ text: string; index: number }>> {
  const chunks: Array<Array<{ text: string; index: number }>> = [];
  let current: Array<{ text: string; index: number }> = [];
  let currentSize = 0;

  for (const paragraph of paragraphs) {
    const nextSize = currentSize + paragraph.text.length + 2;
    if (current.length > 0 && nextSize > maxChars) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(paragraph);
    currentSize += paragraph.text.length + 2;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Constrói blocos de pesquisa sem perder a ligação com o parágrafo original.
 * Secções curtas são agregadas para evitar uma chamada web por subtítulo.
 */
export function buildReviewSegments(
  paragraphs: ReviewParagraph[],
  sections: ReviewSection[],
  maxChars = MAX_SEGMENT_CHARS
): ReviewSegment[] {
  const units: ReviewSegment[] = [];
  const usableSections = sections.length > 0
    ? sections
    : [{ title: 'Documento', startParagraphIndex: 0, endParagraphIndex: paragraphs.length - 1 }];

  for (const section of usableSections) {
    const sectionParagraphs = paragraphs
      .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
      .filter(paragraph => !paragraph.isHeader && paragraph.text.trim().length > 0)
      .map(paragraph => ({ text: paragraph.text.trim(), index: paragraph.index }));

    for (const chunk of splitParagraphs(sectionParagraphs, maxChars)) {
      if (!chunk.length) continue;
      units.push({
        title: section.title || 'Documento',
        text: chunk.map(paragraph => paragraph.text).join('\n\n'),
        paragraphs: chunk
      });
    }
  }

  const packed: ReviewSegment[] = [];
  for (const unit of units) {
    const previous = packed[packed.length - 1];
    if (previous && previous.text.length + unit.text.length + 2 <= maxChars) {
      if (!previous.title.split(' · ').includes(unit.title)) {
        previous.title += ` · ${unit.title}`;
      }
      previous.text += `\n\n${unit.text}`;
      previous.paragraphs.push(...unit.paragraphs);
    } else {
      packed.push({ ...unit, paragraphs: [...unit.paragraphs] });
    }
  }

  return packed.filter(segment => segment.text.length >= 30);
}

function normalizeCategory(value: unknown): CurrentnessCategory {
  const allowed: CurrentnessCategory[] = [
    'statistic', 'academic', 'legal', 'guideline', 'technology', 'factual', 'other'
  ];
  return allowed.includes(value as CurrentnessCategory) ? value as CurrentnessCategory : 'other';
}

function normalizeVerdict(value: unknown): CurrentnessVerdict | undefined {
  const allowed: CurrentnessVerdict[] = ['outdated', 'contradicted', 'new_evidence', 'uncertain'];
  return allowed.includes(value as CurrentnessVerdict) ? value as CurrentnessVerdict : undefined;
}

function verdictStatus(verdict: CurrentnessVerdict): NormStatus {
  if (verdict === 'outdated') return 'alterada';
  if (verdict === 'contradicted') return 'revogada';
  if (verdict === 'new_evidence') return 'substituida';
  return 'desconhecido';
}

function hasEnoughEvidence(verdict: CurrentnessVerdict, evidence: ResearchSource[]): boolean {
  if (verdict === 'uncertain') return evidence.length > 0;
  if (evidence.some(source => source.sourceType === 'official')) return true;
  return new Set(evidence.map(source => source.domain)).size >= 2;
}

function paragraphIndexFor(segment: ReviewSegment, originalText: string): number {
  return segment.paragraphs.find(paragraph => paragraph.text.includes(originalText))?.index
    ?? segment.paragraphs[0]?.index
    ?? 0;
}

export async function reviewDocumentCurrentness(
  options: ReviewDocumentOptions
): Promise<CurrentnessFinding[]> {
  const segments = buildReviewSegments(options.paragraphs, options.sections);
  const findings: CurrentnessFinding[] = [];
  const depth = options.depth ?? 'deep';

  await options.onLog?.(
    `Documento dividido em ${segments.length} bloco(s) para pesquisa aprofundada.`
  );

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    await options.onLog?.(
      `Pesquisando bloco ${index + 1}/${segments.length}: ${segment.title.substring(0, 100)}`
    );

    const research = await researchWithWebSearch({
      provider: options.provider,
      model: options.model,
      apiKey: options.apiKey,
      depth,
      topic: `Revisão de atualidade académica do bloco "${segment.title}". Identifique apenas afirmações verificáveis que estejam desatualizadas, tenham sido contraditas ou devam incorporar evidência mais recente. Pesquise legislação, dados, literatura científica, diretrizes e factos conforme o conteúdo. Faça consultas iterativas e procure fontes primárias.`,
      context: segment.text,
      preferredDomains: [
        'doi.org', 'crossref.org', 'openalex.org', 'pubmed.ncbi.nlm.nih.gov',
        'oecd.org', 'worldbank.org', 'europa.eu', 'gov.br', 'planalto.gov.br'
      ]
    });

    if (!research.sources.length) {
      await options.onLog?.(`Nenhuma fonte auditável devolvida para o bloco ${index + 1}.`);
      await options.onProgress?.(index + 1, segments.length);
      continue;
    }

    const prompt = `Analise o texto original usando exclusivamente a síntese e as fontes realmente devolvidas pela pesquisa web.

OBJETIVO
Encontrar afirmações factuais relevantes que precisem de atualização. Não faça revisão de estilo. Não altere uma passagem apenas porque existe uma publicação mais nova.

CRITÉRIOS
- "outdated": o facto, número, norma, estado da arte ou descrição já não corresponde ao estado atual.
- "contradicted": evidência confiável posterior contradiz materialmente a afirmação original.
- "new_evidence": a passagem continua parcialmente correta, mas evidência posterior importante muda a conclusão ou exige complemento.
- "uncertain": há sinal relevante, mas evidência insuficiente ou conflitante; não proponha texto substituto.
- Para outdated, contradicted ou new_evidence, exija uma fonte oficial conclusiva ou duas fontes independentes.
- O trecho original deve ser copiado de forma exata e ter pelo menos 30 caracteres.
- Cada conclusão deve citar apenas IDs da lista abaixo.
- Retorne no máximo 6 achados de maior importância neste bloco.

SÍNTESE DA PESQUISA
${research.text.substring(0, 12_000)}

FONTES DEVOLVIDAS
${formatResearchEvidence(research.sources)}

TEXTO ORIGINAL
---
${segment.text}
---

Retorne apenas JSON válido:
{
  "findings": [
    {
      "originalText": "trecho exato do texto",
      "suggestedText": "redação factual atualizada; vazio quando uncertain",
      "reason": "explicação objetiva da mudança e da evidência",
      "category": "statistic|academic|legal|guideline|technology|factual|other",
      "verdict": "outdated|contradicted|new_evidence|uncertain",
      "confidence": 0.9,
      "sourceIds": ["S1", "S2"]
    }
  ]
}`;

    let parsed: any = { findings: [] };
    try {
      const json = await generateStructuredJson({
        provider: options.provider,
        model: options.model,
        apiKey: options.apiKey,
        system: 'Responda somente com JSON válido. Não invente fontes nem altere o texto original citado.',
        prompt,
        maxTokens: 12_000
      });
      parsed = JSON.parse(json);
    } catch (error: any) {
      await options.onLog?.(
        `Não foi possível sintetizar o bloco ${index + 1}: ${error.message || String(error)}`
      );
    }

    for (const raw of Array.isArray(parsed.findings) ? parsed.findings : []) {
      const originalText = typeof raw.originalText === 'string' ? raw.originalText.trim() : '';
      const verdict = normalizeVerdict(raw.verdict);
      const sourceIds = Array.isArray(raw.sourceIds)
        ? raw.sourceIds.filter((id: unknown): id is string =>
            typeof id === 'string' && research.sources.some(source => source.id === id)
          )
        : [];
      const evidence = research.sources.filter(source => sourceIds.includes(source.id));
      const suggestedText = typeof raw.suggestedText === 'string' ? raw.suggestedText.trim() : '';

      if (!verdict || originalText.length < 30 || !segment.text.includes(originalText)) continue;
      if (!hasEnoughEvidence(verdict, evidence)) continue;
      if (verdict !== 'uncertain' && (!suggestedText || suggestedText === originalText)) continue;

      const category = normalizeCategory(raw.category);
      const confidenceNumber = Number(raw.confidence);
      const confidence = Number.isFinite(confidenceNumber)
        ? Math.min(1, Math.max(0, confidenceNumber))
        : 0.8;

      findings.push({
        id: randomUUID(),
        type: category === 'legal' ? 'regulamento' : 'outro',
        number: category,
        fullText: originalText,
        context: segment.title,
        paragraphIndex: paragraphIndexFor(segment, originalText),
        chapterTitle: segment.title,
        status: verdictStatus(verdict),
        updateDescription: typeof raw.reason === 'string' ? raw.reason.trim() : '',
        updateType: verdict === 'uncertain' ? 'manual' : 'auto',
        ...(verdict === 'uncertain' ? {} : { suggestedText }),
        evidence,
        sourceIds,
        researchQueries: research.queries,
        confidence,
        reviewScope: 'currentness',
        category,
        verdict
      });
    }

    await options.onProgress?.(index + 1, segments.length);
  }

  const deduplicated = new Map<string, CurrentnessFinding>();
  for (const finding of findings) {
    const key = finding.fullText.normalize('NFC').toLocaleLowerCase();
    const existing = deduplicated.get(key);
    if (!existing || (finding.confidence || 0) > (existing.confidence || 0)) {
      deduplicated.set(key, finding);
    }
  }

  return Array.from(deduplicated.values());
}
