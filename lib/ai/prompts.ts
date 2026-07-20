import { Chunk } from '../state';

const BASE_SYSTEM_PROMPT = `Você é um assistente técnico/editorial. Responda **apenas** com base nos trechos fornecidos.

Regras:
1. Se faltar base, diga: 'informação insuficiente no documento'.
2. Inclua **citações** com página e trecho curto.
3. Entregue: (a) **resumo** em 3–5 bullets e (b) **resposta final** objetiva.`;

const ACTION_PROMPTS = {
  translate: `Traduza PT-BR ↔ EN mantendo sentido e marcações [página:X].`,
  suggest: `Melhore clareza/concisão sem mudar o sentido; liste alterações em bullets.`,
  adapt: `Reestruture em seções lógicas (H2/H3); normalize termos; não invente fatos.`,
  update: `Aponte possíveis trechos desatualizados **com base apenas no texto**; marque o que exige verificação externa.`
};

export function buildSystemPrompt(action?: string | null): string {
  if (action && action in ACTION_PROMPTS) {
    return BASE_SYSTEM_PROMPT + '\n\n' + ACTION_PROMPTS[action as keyof typeof ACTION_PROMPTS];
  }
  return BASE_SYSTEM_PROMPT;
}

export function buildUserPrompt(question: string, context: Chunk[]): string {
  const contextText = context
    .map((chunk, index) => {
      const pageInfo = `[Página: ${chunk.pageFrom}${chunk.pageTo !== chunk.pageFrom ? `-${chunk.pageTo}` : ''}]`;
      const chapterInfo = chunk.metadata?.chapterTitle ? ` [Capítulo: ${chunk.metadata.chapterTitle}]` : '';
      return `${pageInfo}${chapterInfo}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

  return `PERGUNTA:
${question}

CONTEXTO (trechos do documento):
${contextText}`;
}

// Extrai citações do texto da resposta
export function extractCitations(text: string): Array<{ page: number; span: string }> {
  const citations: Array<{ page: number; span: string }> = [];

  // Pattern: [página:X] ou [Página:X-Y]
  const pattern = /\[p[aá]gina:?\s*(\d+)(?:-(\d+))?\]/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const pageFrom = parseInt(match[1]);
    const pageTo = match[2] ? parseInt(match[2]) : pageFrom;
    citations.push({
      page: pageFrom,
      span: pageTo !== pageFrom ? `§${pageFrom}-§${pageTo}` : `§${pageFrom}`
    });
  }

  return citations;
}
