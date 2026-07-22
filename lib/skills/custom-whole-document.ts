import { applyPlaceholders } from '@/lib/skills/resolver';
import type { SkillPromptVars } from '@/lib/skills/types';

export const WHOLE_DOCUMENT_MARKER_RULES = `
REGRAS OBRIGATÓRIAS:
- Preserve EXATAMENTE os marcadores [[P0000]]...[[/P0000]] na mesma ordem e quantidade
- Não funda nem divida parágrafos
- Não omita nenhum marcador
- Retorne APENAS o documento processado com os marcadores
`;

/** Builds the user message for whole-document AI from a custom skill prompt template. */
export function buildCustomWholeDocumentPrompt(
  promptTemplate: string,
  serializedDocument: string,
  vars: SkillPromptVars = {}
): string {
  const withDocument: SkillPromptVars = {
    ...vars,
    document: serializedDocument,
  };
  const base = applyPlaceholders(promptTemplate, withDocument).trim();

  if (base.includes('[[P') && base.includes('[[/P')) {
    return base;
  }

  if (promptTemplate.includes('{{document}}')) {
    return base;
  }

  return `${base}\n${WHOLE_DOCUMENT_MARKER_RULES}\n\n${serializedDocument}`;
}
