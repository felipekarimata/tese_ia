import { AIProvider } from '@/lib/ai/types';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { Multi3Command, Multi3Candidate, Multi3JudgeResult } from './types';

export type JudgeInput = {
  command: Multi3Command;
  commandArgs: string;
  judgeProvider: AIProvider;
  judgeModel: string;
  candidates: Array<{
    provider: AIProvider;
    text: string;
    label?: string;
  }>;
};

const CRITERIA: Record<Multi3Command, string> = {
  '/ajustar': 'Fidelidade à instrução, qualidade acadêmica, coerência e mínima alteração desnecessária.',
  '/adaptar': 'Adequação ao estilo pedido, clareza e preservação do significado.',
  '/revisar': 'Correção das normas citadas e mínima alteração desnecessária.',
  '/traduzir': 'Fidelidade ao original, fluência no idioma alvo e terminologia correta.',
  '/todos': 'Qualidade global do documento final após tradução, adaptação e revisão.',
  '/perguntar': 'Precisão, clareza e uso correto do contexto do documento.',
};

export async function judgeMulti3Results(input: JudgeInput): Promise<Multi3JudgeResult> {
  const criteria = CRITERIA[input.command] ?? 'Qualidade geral da resposta.';

  const candidateBlock = input.candidates
    .map(
      (c, i) =>
        `### Candidato ${i + 1}: ${c.provider}${c.label ? ` (${c.label})` : ''}\n${c.text.slice(0, 12000)}`
    )
    .join('\n\n');

  const prompt = `Você é um juiz imparcial comparando ${input.candidates.length} respostas de IAs diferentes.

Comando executado: ${input.command}${input.commandArgs ? ` — ${input.commandArgs}` : ''}
Critérios: ${criteria}

Escolha a MELHOR resposta. Responda APENAS com JSON válido:
{
  "winnerProvider": "gemini|openai|anthropic|grok",
  "reasoning": "explicação em português",
  "scores": { "gemini": 0-10, "openai": 0-10, "anthropic": 0-10 }
}

${candidateBlock}`;

  const raw = await chatWithAgent({
    provider: input.judgeProvider,
    model: input.judgeModel,
    systemPrompt: 'Responda apenas com JSON válido. Sem markdown.',
    history: [],
    userMessage: prompt,
  });

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const data = JSON.parse(cleaned);
    const winner = (data.winnerProvider || input.candidates[0]?.provider) as AIProvider;
    return {
      winnerProvider: winner,
      reasoning: data.reasoning || 'Melhor resultado selecionado pelo juiz.',
      scores: data.scores || {},
    };
  } catch {
    return {
      winnerProvider: input.candidates[0]?.provider ?? input.judgeProvider,
      reasoning: 'Juiz não retornou JSON válido; selecionado primeiro candidato disponível.',
      scores: {},
    };
  }
}

export function candidatesToJudgeTexts(
  candidates: Multi3Candidate[],
  textByProvider: Record<string, string>
): JudgeInput['candidates'] {
  return candidates
    .filter((c) => c.status === 'completed')
    .map((c) => ({
      provider: c.provider,
      text: c.text || textByProvider[c.provider] || '',
      label: c.versionId ? `v:${c.versionId.slice(0, 8)}` : undefined,
    }));
}
