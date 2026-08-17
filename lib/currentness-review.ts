import { randomUUID } from 'crypto';
import type { AIProvider } from '@/lib/ai/types';
import {
  formatResearchEvidence,
  generateStructuredJson,
  parseStructuredJsonResponse,
  researchWithWebSearch,
  type ResearchDepth,
  type ResearchSource
} from '@/lib/ai/research';
import type { NormReference, NormStatus } from '@/lib/norms-update/types';
import { BOOK_RESEARCH_DOMAINS } from '@/lib/book-workflow/prompts';
import { sanitizeEditorialText } from '@/lib/book-workflow/output';
import { getEffectiveCommandPrompt } from '@/lib/book-workflow/prompt-settings';
import { formatBookContextForPrompt } from '@/lib/books/context';

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

export type ReviewDocumentOptions = {
  paragraphs: ReviewParagraph[];
  sections: ReviewSection[];
  provider: AIProvider;
  model: string;
  apiKey: string;
  depth?: ResearchDepth;
  /** Other chapters in the same book; continuity context, never research evidence. */
  bookContext?: string;
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

export function hasEnoughEvidence(verdict: CurrentnessVerdict, evidence: ResearchSource[]): boolean {
  if (verdict === 'uncertain') return evidence.length > 0;
  if (evidence.some(source => source.sourceType === 'official')) return true;
  return new Set(evidence.map(source => {
    // Gemini grounding links commonly use one Google redirect domain for
    // several independent publishers. Count distinct redirect URLs instead of
    // collapsing every source into the same apparent domain.
    if (/vertexaisearch|grounding-api-redirect/i.test(source.domain + source.url)) {
      return `${source.domain}:${source.url}`;
    }
    return source.domain;
  })).size >= 2;
}

export function normalizeReviewText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
    .toLocaleLowerCase();
}

function compactReviewText(value: string): string {
  return normalizeReviewText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function anchorMatches(paragraphText: string, proposedText: string): boolean {
  const paragraph = normalizeReviewText(paragraphText);
  const proposed = normalizeReviewText(proposedText);
  if (!paragraph || !proposed) return false;
  if (paragraph === proposed) return true;

  const compactParagraph = compactReviewText(paragraph);
  const compactProposed = compactReviewText(proposed);
  if (compactProposed.length < 24) return false;

  return compactParagraph.includes(compactProposed)
    || (compactParagraph.length >= 24 && compactProposed.includes(compactParagraph));
}

export function resolveReviewAnchor(
  segment: ReviewSegment,
  proposedText: unknown,
  proposedParagraphIndex: unknown
): { text: string; index: number } | undefined {
  const originalText = typeof proposedText === 'string' ? proposedText.trim() : '';
  if (originalText.length < 30) return undefined;

  const numericIndex = Number(proposedParagraphIndex);
  if (Number.isInteger(numericIndex)) {
    const indexed = segment.paragraphs.find(paragraph => paragraph.index === numericIndex);
    if (indexed && anchorMatches(indexed.text, originalText)) return indexed;
  }

  const matches = segment.paragraphs.filter(paragraph => anchorMatches(paragraph.text, originalText));
  return matches.length === 1 ? matches[0] : undefined;
}

export async function reviewDocumentCurrentness(
  options: ReviewDocumentOptions
): Promise<CurrentnessFinding[]> {
  const segments = buildReviewSegments(options.paragraphs, options.sections);
  const findings: CurrentnessFinding[] = [];
  const depth = options.depth ?? 'deep';
  const reviewInstructions = await getEffectiveCommandPrompt('review');
  const bookContext = formatBookContextForPrompt(options.bookContext || null);

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
      topic: `Revisão de atualidade académica do bloco "${segment.title}".

INSTRUÇÃO EDITORIAL CONFIGURADA
${reviewInstructions.substring(0, 4_000)}

Faça consultas iterativas e procure fontes primárias para as afirmações verificáveis do trecho.`,
      context: segment.text,
      preferredDomains: [
        'doi.org', 'crossref.org', 'openalex.org', 'pubmed.ncbi.nlm.nih.gov',
        'oecd.org', 'worldbank.org', 'europa.eu', 'gov.br', 'planalto.gov.br',
        ...BOOK_RESEARCH_DOMAINS
      ]
    });

    if (!research.sources.length) {
      await options.onLog?.(`Nenhuma fonte auditável devolvida para o bloco ${index + 1}.`);
      await options.onProgress?.(index + 1, segments.length);
      continue;
    }

    const sourceDomains = Array.from(new Set(research.sources.map(source => source.domain)));
    await options.onLog?.(
      `Bloco ${index + 1}: ${research.sources.length} fonte(s), ${sourceDomains.length} domínio(s) e ${research.queries.length} consulta(s).`
    );
    const indexedParagraphs = segment.paragraphs
      .map(paragraph => `[P${paragraph.index}] ${paragraph.text}`)
      .join('\n\n');

    const prompt = `Analise o texto original usando exclusivamente a síntese e as fontes realmente devolvidas pela pesquisa web.

INSTRUÇÃO EDITORIAL CONFIGURADA PARA /REVISAR
${reviewInstructions}

OBJETIVO
Encontrar afirmações factuais relevantes que precisem de atualização. Não faça revisão de estilo. Não altere uma passagem apenas porque existe uma publicação mais nova.

CRITÉRIOS
- "outdated": o facto, número, norma, estado da arte ou descrição já não corresponde ao estado atual.
- "contradicted": evidência confiável posterior contradiz materialmente a afirmação original.
- "new_evidence": a passagem continua parcialmente correta, mas evidência posterior importante muda a conclusão ou exige complemento.
- "uncertain": há sinal relevante, mas evidência insuficiente ou conflitante; não proponha texto substituto.
- Para outdated, contradicted ou new_evidence, exija uma fonte oficial conclusiva ou duas fontes independentes.
- Não apague a análise histórica. Quando algo mudou, recontextualize com fórmulas como "à época, vigorava" ou "até [ano]", preservando o arco passado-presente-futuro.
- Para normas, respeite: texto legal oficial > tribunal/órgão oficial > organismo internacional > doutrina revisada > consultoria. Quando doutrina for tratada como letra da lei, registre [DISTINÇÃO: texto x doutrina] no motivo.
- Confira também a atualidade das séries econômicas citadas. Se a tese central depender de norma revogada ou dado hoje contrariado, registre [RISCO] ou [RISCO ECONÔMICO] no motivo.
- Informe o paragraphIndex exibido em [P123]. Copie o parágrafo original completo e de forma exata, com pelo menos 30 caracteres.
- suggestedText deve ser a versão integral do mesmo parágrafo, já atualizada; não devolva somente a frase alterada.
- Cada conclusão deve citar apenas IDs da lista abaixo.
- Retorne no máximo 6 achados de maior importância neste bloco.

${bookContext ? `${bookContext}\n\nIMPORTANTE: o contexto do livro serve apenas para coerência, terminologia e prevenção de repetição. Ele não é fonte nem evidência factual.` : ''}

SÍNTESE DA PESQUISA
${research.text.substring(0, 12_000)}

FONTES DEVOLVIDAS
${formatResearchEvidence(research.sources)}

TEXTO ORIGINAL
---
${indexedParagraphs}
---

Retorne apenas JSON válido:
{
  "findings": [
    {
      "paragraphIndex": 123,
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
      const structured = parseStructuredJsonResponse(json);
      parsed = structured.value;
      if (structured.recovered) {
        await options.onLog?.(`JSON do bloco ${index + 1} recuperado após conteúdo extra.`);
      }
    } catch (error: any) {
      await options.onLog?.(
        `Não foi possível sintetizar o bloco ${index + 1}: ${error.message || String(error)}`
      );
    }

    const candidates = Array.isArray(parsed?.findings) ? parsed.findings : [];
    const rejected = {
      verdict: 0,
      anchor: 0,
      evidence: 0,
      suggestion: 0
    };
    let accepted = 0;

    for (const raw of candidates) {
      const verdict = normalizeVerdict(raw.verdict);
      if (!verdict) {
        rejected.verdict++;
        continue;
      }

      const anchor = resolveReviewAnchor(segment, raw.originalText, raw.paragraphIndex);
      if (!anchor) {
        rejected.anchor++;
        continue;
      }

      const sourceIds = Array.isArray(raw.sourceIds)
        ? raw.sourceIds.filter((id: unknown): id is string =>
            typeof id === 'string' && research.sources.some(source => source.id === id)
          )
        : [];
      const evidence = research.sources.filter(source => sourceIds.includes(source.id));
      if (!hasEnoughEvidence(verdict, evidence)) {
        rejected.evidence++;
        continue;
      }

      const suggestedText = sanitizeEditorialText(raw.suggestedText);
      if (
        verdict !== 'uncertain'
        && (!suggestedText || normalizeReviewText(suggestedText) === normalizeReviewText(anchor.text))
      ) {
        rejected.suggestion++;
        continue;
      }

      const category = normalizeCategory(raw.category);
      const confidenceNumber = Number(raw.confidence);
      const confidence = Number.isFinite(confidenceNumber)
        ? Math.min(1, Math.max(0, confidenceNumber))
        : 0.8;

      findings.push({
        id: randomUUID(),
        type: category === 'legal' ? 'regulamento' : 'outro',
        number: category,
        fullText: anchor.text,
        context: segment.title,
        paragraphIndex: anchor.index,
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
      accepted++;
    }

    await options.onLog?.(
      `Bloco ${index + 1}: ${candidates.length} candidato(s), ${accepted} aceito(s); descartes — `
      + `veredito ${rejected.verdict}, âncora ${rejected.anchor}, evidência ${rejected.evidence}, sugestão ${rejected.suggestion}.`
    );

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
