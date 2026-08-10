export type PortugueseDocumentAssessment = {
  shouldSkipTranslation: boolean;
  reason:
    | 'already-portuguese'
    | 'insufficient-text'
    | 'low-portuguese-confidence'
    | 'foreign-content-detected'
    | 'portugal-portuguese-detected';
  totalWords: number;
  portugueseScore: number;
  portugueseScoreRatio: number;
  foreignParagraphCount: number;
  portugalPortugueseSignals: string[];
};

const MIN_DOCUMENT_WORDS = 60;
const MIN_FOREIGN_PARAGRAPH_WORDS = 12;

const PORTUGUESE_COMMON = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sobre', 'entre',
  'que', 'quem', 'como', 'quando', 'onde', 'qual', 'quais', 'e', 'ou', 'mas', 'se',
  'não', 'mais', 'também', 'já', 'ainda', 'foi', 'foram', 'era', 'eram', 'é', 'são',
  'ser', 'ter', 'tem', 'têm', 'pode', 'podem', 'deve', 'devem', 'pelo', 'pela',
  'pelos', 'pelas', 'ao', 'aos', 'à', 'às', 'seu', 'sua', 'seus', 'suas', 'este',
  'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'isso', 'isto', 'muito',
  'muita', 'muitos', 'muitas', 'há', 'até', 'assim', 'porém', 'contudo', 'porque',
]);

const PORTUGUESE_DISTINCT = new Set([
  'não', 'uma', 'umas', 'uns', 'do', 'da', 'dos', 'das', 'em', 'ao', 'aos', 'à',
  'às', 'são', 'também', 'já', 'ainda', 'seu', 'sua', 'seus', 'suas', 'pelo', 'pela',
  'pelos', 'pelas', 'quem', 'onde', 'quando', 'qual', 'quais', 'porém', 'contudo',
  'assim', 'então', 'havia', 'foram', 'será', 'serão', 'pode', 'podem', 'deve',
  'devem', 'muito', 'muita', 'muitos', 'muitas', 'até',
]);

const FOREIGN_WORDS = [
  new Set([
    'the', 'and', 'of', 'to', 'in', 'for', 'with', 'that', 'is', 'are', 'as', 'by',
    'on', 'from', 'this', 'these', 'those', 'was', 'were', 'be', 'been', 'has', 'have',
    'not', 'which', 'their', 'its', 'between', 'through', 'under', 'over', 'such',
  ]),
  new Set([
    'el', 'los', 'del', 'al', 'y', 'con', 'sin', 'muy', 'pero', 'aunque', 'hay',
    'puede', 'pueden', 'derecho', 'tributación', 'países', 'según', 'desde', 'hacia',
    'cuyo', 'cuya', 'también', 'fue', 'son', 'tiene', 'tienen',
  ]),
  new Set([
    'le', 'la', 'les', 'du', 'des', 'et', 'avec', 'sans', 'pour', 'dans', 'sur',
    'est', 'sont', 'été', 'être', 'cette', 'ces', 'leur', 'leurs', 'entre', 'selon',
    'droit', 'pays', 'peut', 'peuvent',
  ]),
  new Set([
    'der', 'die', 'das', 'und', 'ist', 'sind', 'mit', 'für', 'von', 'den', 'dem',
    'ein', 'eine', 'einer', 'nicht', 'werden', 'wird', 'zwischen', 'durch',
  ]),
];

const PORTUGAL_PORTUGUESE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'vocabulário de Portugal',
    pattern: /\b(?:ficheiros?|utilizadores?|telemóveis?|autocarros?|comboios?|concelhos?|freguesias?|ecrãs?|raparigas?)\b/gu,
  },
  {
    label: 'acentuação de Portugal',
    pattern: /\b(?:económic[oa]s?|académic[oa]s?|fenómen[oa]s?|autónom[oa]s?|ónus)\b/gu,
  },
  {
    label: 'ortografia pré-Acordo/Portugal',
    pattern: /\b(?:acção|acções|projecto|projectos|objectivo|objectivos|recepção|direcção|actual|actualmente)\b/gu,
  },
  {
    label: 'construção verbal de Portugal',
    pattern: /\b(?:está|estão|estava|estavam|esteve|estiveram)\s+a\s+\p{L}+(?:ar|er|ir)\b/gu,
  },
];

function words(text: string): string[] {
  return (text.toLocaleLowerCase('pt-BR').normalize('NFC').match(/\p{L}+(?:['’]\p{L}+)?/gu) || []);
}

function countMatches(tokens: string[], dictionary: Set<string>): number {
  let count = 0;
  for (const token of tokens) {
    if (dictionary.has(token)) count += 1;
  }
  return count;
}

function portugueseMorphologyCount(tokens: string[]): number {
  return tokens.reduce((count, token) => (
    /(?:ção|ções|dade|dades|ência|ências|ável|íveis|eiro|eira|eiros|eiras)$/.test(token)
      ? count + 1
      : count
  ), 0);
}

function scoreTokens(tokens: string[]): {
  portugueseScore: number;
  portugueseStrongSignals: number;
  foreignScore: number;
} {
  const common = countMatches(tokens, PORTUGUESE_COMMON);
  const distinct = countMatches(tokens, PORTUGUESE_DISTINCT);
  const morphology = portugueseMorphologyCount(tokens);
  const foreignScore = Math.max(...FOREIGN_WORDS.map((dictionary) => countMatches(tokens, dictionary)));

  return {
    portugueseScore: common + distinct + morphology,
    portugueseStrongSignals: distinct + morphology,
    foreignScore,
  };
}

function findPortugalPortugueseSignals(text: string): string[] {
  const normalized = text.toLocaleLowerCase('pt-BR').normalize('NFC');
  return PORTUGAL_PORTUGUESE_PATTERNS
    .filter(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(normalized);
    })
    .map(({ label }) => label);
}

export function assessPortugueseDocument(paragraphs: readonly string[]): PortugueseDocumentAssessment {
  const substantiveParagraphs = paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
  const allText = substantiveParagraphs.join('\n\n');
  const allTokens = words(allText);
  const totalWords = allTokens.length;
  const overall = scoreTokens(allTokens);
  const portugueseScoreRatio = totalWords > 0 ? overall.portugueseScore / totalWords : 0;
  const portugalPortugueseSignals = findPortugalPortugueseSignals(allText);

  if (totalWords < MIN_DOCUMENT_WORDS) {
    return {
      shouldSkipTranslation: false,
      reason: 'insufficient-text',
      totalWords,
      portugueseScore: overall.portugueseScore,
      portugueseScoreRatio,
      foreignParagraphCount: 0,
      portugalPortugueseSignals,
    };
  }

  if (portugalPortugueseSignals.length > 0) {
    return {
      shouldSkipTranslation: false,
      reason: 'portugal-portuguese-detected',
      totalWords,
      portugueseScore: overall.portugueseScore,
      portugueseScoreRatio,
      foreignParagraphCount: 0,
      portugalPortugueseSignals,
    };
  }

  const foreignParagraphCount = substantiveParagraphs.reduce((count, paragraph) => {
    const paragraphTokens = words(paragraph);
    if (paragraphTokens.length < MIN_FOREIGN_PARAGRAPH_WORDS) return count;
    const score = scoreTokens(paragraphTokens);
    const foreignRatio = score.foreignScore / paragraphTokens.length;
    const likelyForeign = score.foreignScore >= 4
      && foreignRatio >= 0.12
      && score.foreignScore > score.portugueseScore * 1.2;
    return likelyForeign ? count + 1 : count;
  }, 0);

  if (foreignParagraphCount > 0) {
    return {
      shouldSkipTranslation: false,
      reason: 'foreign-content-detected',
      totalWords,
      portugueseScore: overall.portugueseScore,
      portugueseScoreRatio,
      foreignParagraphCount,
      portugalPortugueseSignals,
    };
  }

  const minimumStrongSignals = Math.max(5, Math.floor(totalWords * 0.025));
  const confidentlyPortuguese = overall.portugueseScore >= 18
    && portugueseScoreRatio >= 0.18
    && overall.portugueseStrongSignals >= minimumStrongSignals;

  return {
    shouldSkipTranslation: confidentlyPortuguese,
    reason: confidentlyPortuguese ? 'already-portuguese' : 'low-portuguese-confidence',
    totalWords,
    portugueseScore: overall.portugueseScore,
    portugueseScoreRatio,
    foreignParagraphCount,
    portugalPortugueseSignals,
  };
}
