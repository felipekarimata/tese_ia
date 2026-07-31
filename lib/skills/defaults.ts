import type { AdaptStyle, SkillKey, SkillPromptVars } from './types';

function creativityHint(creativity: number): string {
  if (creativity < 3) {
    return '(Conservative - apply instructions with minimal changes, stay as close as possible to the original text)';
  }
  if (creativity < 7) {
    return '(Moderate - apply instructions with some flexibility in rephrasing, but ONLY make changes related to the instructions)';
  }
  return '(Creative - apply instructions with freedom to rephrase significantly, but ONLY make changes that fulfill the instructions)';
}

const ADAPT_STYLE_DESCRIPTIONS: Record<AdaptStyle, string> = {
  academic: 'formal academic style with precise terminology, citations, and scholarly tone',
  professional: 'professional business style with clear, concise language suitable for corporate environments',
  simplified: 'simplified language accessible to general audiences, avoiding jargon and complex terms',
};

export function defaultAdjustBatchPrompt(vars: SkillPromptVars): string {
  const instructions = vars.args || '';
  const sectionTitle = vars.section || '';
  const paragraphsText = vars.paragraphs || '';
  const creativity = vars.creativity ?? 5;

  return `You are an expert document editor. You have been given the following instructions by the user:

INSTRUCTIONS:
${instructions}

SECTION: "${sectionTitle}"

PARAGRAPHS:
${paragraphsText}

TASK:
Analyze the paragraphs and suggest adjustments that follow the user's instructions EXACTLY AND ONLY. Do NOT suggest improvements, clarifications, or changes that are not explicitly requested in the instructions above.

Creativity level: ${creativity}/10
${creativityHint(creativity)}

Return your response as JSON in this exact format:
{
  "adjustments": [
    {
      "paragraphIndex": 0,
      "originalText": "exact original text",
      "adjustedText": "your adjusted version that addresses the instructions",
      "reason": "why this change was made to fulfill the instructions",
      "instructionReference": "which part of the instructions this addresses"
    }
  ]
}

CRITICAL RULES:
- ONLY make changes that directly address the user's instructions
- Do NOT improve clarity, grammar, style, or anything else unless explicitly instructed to do so
- Only include paragraphs that need adjustment to fulfill the instructions
- Match the originalText EXACTLY as it appears
- The creativity level controls HOW you apply the instructions, NOT whether to make additional improvements
- If creativity is 0, make minimal changes (only those absolutely required by instructions)
`;
}

export function defaultAdaptBatchPrompt(style: AdaptStyle, vars: SkillPromptVars): string {
  const styleDescription = ADAPT_STYLE_DESCRIPTIONS[style];
  const audienceText = vars.audience ? ` for ${vars.audience}` : '';
  const sectionTitle = vars.section || '';
  const paragraphs = vars.paragraphs || '';

  return `You are a document adaptation expert. Analyze the following text from section "${sectionTitle}" and suggest adaptations to ${styleDescription}${audienceText}.

For each paragraph that needs adaptation, provide:
- originalText: the exact original text (unchanged)
- adaptedText: the adapted version in the target style
- reason: brief explanation of the adaptation (why this change improves style/audience fit)
- adaptationType: one of: "style", "tone", "terminology", "structure"

Focus on paragraphs that would significantly benefit from adaptation. Skip paragraphs that are already appropriate for the target style.

Paragraphs to analyze:
${paragraphs}

Respond with ONLY a JSON object in this format:
{
  "suggestions": [
    {
      "originalText": "...",
      "adaptedText": "...",
      "reason": "...",
      "adaptationType": "..."
    }
  ]
}`;
}

const MARKER_RULES = `
REGRAS OBRIGATÓRIAS:
- Preserve EXATAMENTE os marcadores [[P0000]]...[[/P0000]] na mesma ordem e quantidade
- Não funda nem divida parágrafos
- Não omita nenhum marcador
- Retorne APENAS o documento processado com os marcadores
`;

export function defaultWholeDocumentTranslatePrompt(vars: SkillPromptVars): string {
  const lang = vars.language || 'português';
  const document = vars.document || '';
  return `Traduza o documento abaixo para ${lang}.
${MARKER_RULES}

${document}`;
}

export function defaultWholeDocumentAdaptPrompt(vars: SkillPromptVars): string {
  const styleLabel = vars.style || 'personalizado';
  const audience = vars.audience ? `\nPúblico-alvo: ${vars.audience}` : '';
  const document = vars.document || '';
  return `Adapte o documento abaixo para estilo ${styleLabel}.${audience}
Mantenha o significado; altere tom, vocabulário e estrutura conforme o estilo.
${MARKER_RULES}

${document}`;
}

export function defaultWholeDocumentAdjustPrompt(vars: SkillPromptVars): string {
  const instructions = vars.args || 'Melhore o documento';
  const document = vars.document || '';
  return `Aplique as seguintes instruções ao documento abaixo:
"${instructions}"

${MARKER_RULES}

${document}`;
}

export function defaultReviewPrompt(): string {
  return `Analise o documento e identifique referências a leis, normas e regulamentos. Verifique vigência e sugira atualizações quando necessário.`;
}

type DefaultPromptBuilder = (vars: SkillPromptVars) => string;

export function getDefaultPromptBuilder(key: SkillKey): DefaultPromptBuilder {
  if (key === 'adjust') return defaultAdjustBatchPrompt;
  if (key.startsWith('adapt:') && !key.startsWith('todos:')) {
    const style = key.split(':')[1] as AdaptStyle;
    return (vars) => defaultAdaptBatchPrompt(style, vars);
  }
  if (key === 'translate' || key === 'todos:translate') {
    return defaultWholeDocumentTranslatePrompt;
  }
  if (key.startsWith('todos:adapt:')) {
    return defaultWholeDocumentAdaptPrompt;
  }
  if (key === 'review' || key === 'todos:review') return () => defaultReviewPrompt();
  return defaultWholeDocumentAdjustPrompt;
}

export function resolveSkillKeyForContext(
  baseKey: SkillKey,
  context: 'direct' | 'todos' | 'book'
): SkillKey {
  if (context === 'direct' || context === 'book') return baseKey;
  if (baseKey === 'translate') return 'todos:translate';
  if (baseKey === 'review') return 'todos:review';
  if (baseKey === 'adjust') return 'adjust';
  if (baseKey.startsWith('adapt:')) {
    const style = baseKey.split(':')[1];
    return `todos:adapt:${style}` as SkillKey;
  }
  return baseKey;
}
