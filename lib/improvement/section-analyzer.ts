import { GlobalContext, ImprovementSuggestion, ImprovementType } from './types';
import { isGemini429, parseGeminiRetryDelayMs, sleep } from '@/lib/ai/gemini-retry';
import { isOpenAIGpt5Family } from '@/lib/ai/openai-compat';
import { randomUUID } from 'crypto';

/**
 * Analisa uma seção do documento e gera sugestões de melhoria
 */
export async function analyzeSectionForImprovements(
  paragraphs: string[], // Parágrafos da seção atual
  globalContext: GlobalContext,
  chapterTitle: string,
  paragraphStartIndex: number,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  apiKey: string
): Promise<ImprovementSuggestion[]> {

  const fullText = paragraphs.join('\n\n');

  // Formata resumos dos capítulos para contexto
  const chapterContext = globalContext.chapterSummaries && globalContext.chapterSummaries.length > 0
    ? '\n\nESTRUTURA DO DOCUMENTO:\n' + globalContext.chapterSummaries
        .map((ch, i) => `${i + 1}. ${ch.title}\n   → ${ch.summary}`)
        .join('\n')
    : '';

  const prompt = `Você é um revisor acadêmico especializado. Analise o texto abaixo e sugira melhorias APENAS quando houver real necessidade.

CONTEXTO DO DOCUMENTO:
- Tema: ${globalContext.theme}
- Objetivo: ${globalContext.objective || 'Não especificado'}
- Capítulo atual: ${chapterTitle}${chapterContext}

ÁREAS DE ANÁLISE:
1. GRAMÁTICA: Erros gramaticais, concordância, pontuação
2. CLAREZA: Frases confusas ou ambíguas que podem ser simplificadas
3. ESTILO ACADÊMICO: Linguagem informal, voz passiva excessiva, falta de precisão
4. COERÊNCIA: Falta de coesão entre ideias, transições abruptas
5. CONCISÃO: Redundâncias, verbosidade desnecessária

REGRAS IMPORTANTES:
❌ NÃO sugira mudanças apenas por estilo pessoal
❌ NÃO mude termos técnicos corretos
❌ NÃO altere significados ou fatos
✅ APENAS sugira quando houver melhoria CLARA e OBJETIVA
✅ Mantenha o tom acadêmico e formal
✅ Preserve a voz do autor

TEXTO PARA ANÁLISE:
---
${fullText}
---

Para cada melhoria sugerida, retorne JSON no formato:
{
  "suggestions": [
    {
      "paragraphIndex": 0,
      "originalText": "texto original exato da frase ou trecho (mínimo 30 caracteres)",
      "improvedText": "texto melhorado",
      "reason": "explicação clara do motivo (1-2 frases)",
      "type": "grammar|style|clarity|coherence|conciseness",
      "confidence": 0.95
    }
  ]
}

IMPORTANTE:
- "paragraphIndex" deve ser 0 para o primeiro parágrafo da seção, 1 para o segundo, etc
- "originalText" deve ser um trecho COMPLETO e EXATO do texto (mínimo 30 caracteres, incluindo pontuação)
- NÃO truncar ou resumir o "originalText" - deve ser copiado EXATAMENTE como está
- Se não houver melhorias necessárias, retorne: {"suggestions": []}
- Confidence: 1.0 = certeza absoluta, 0.7 = sugestão moderada
- Foque em 3-5 sugestões mais importantes (não precisa sugerir tudo)

Retorne APENAS o JSON, sem texto adicional.`;

  let response = '';

  try {
    if (provider === 'openai') {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });

      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...(isOpenAIGpt5Family(model) ? {} : { temperature: 0.3 }),
        max_tokens: 12000, // Aumentado para permitir respostas muito detalhadas
        response_format: { type: 'json_object' }
      });

      response = completion.choices[0]?.message?.content?.trim() || '{"suggestions":[]}';
    } else if (provider === 'anthropic') {
      const { anthropicChat } = await import('@/lib/ai/anthropic');
      const { text } = await anthropicChat({
        apiKey,
        model,
        system:
          'Responda apenas com um objeto JSON válido conforme o formato pedido. Sem markdown.',
        user: prompt,
        maxTokens: 12000,
        temperature: 0.3
      });
      response = text || '{"suggestions":[]}';
    } else {
      // Gemini with 429 retry
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        }
      });
      const maxRetries = 4;
      let lastErr: any;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await geminiModel.generateContent(prompt);
          response = result.response.text().trim();
          lastErr = undefined;
          break;
        } catch (err: any) {
          lastErr = err;
          if (isGemini429(err) && attempt < maxRetries) {
            const delayMs = parseGeminiRetryDelayMs(err);
            console.warn(`[IMPROVE] Gemini 429 (tentativa ${attempt}/${maxRetries}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
            await sleep(delayMs);
          } else {
            throw err;
          }
        }
      }
      if (lastErr) throw lastErr;
    }

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[IMPROVE] AI returned non-JSON response:', response.substring(0, 200));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const suggestions = parsed.suggestions || [];

    // Valida e processa sugestões
    const validSuggestions: ImprovementSuggestion[] = [];

    for (const sug of suggestions) {
      // Valida campos obrigatórios
      if (!sug.originalText || !sug.improvedText || !sug.reason || !sug.type) {
        console.warn('[IMPROVE] Skipping invalid suggestion:', sug);
        continue;
      }

      // Verifica se o texto original existe no parágrafo
      const localIndex = sug.paragraphIndex || 0;
      if (localIndex < 0 || localIndex >= paragraphs.length) {
        console.warn('[IMPROVE] Invalid paragraph index:', localIndex);
        continue;
      }

      const originalTextTrimmed = sug.originalText.trim();
      const paragraph = paragraphs[localIndex];

      // Tenta match exato primeiro
      let found = paragraph.includes(originalTextTrimmed);

      // Se não encontrou exato, tenta match parcial (útil se IA truncou)
      if (!found && originalTextTrimmed.length > 20) {
        // Pega primeiras 20 chars do texto sugerido
        const prefix = originalTextTrimmed.substring(0, 20);
        found = paragraph.includes(prefix);

        if (found) {
          console.log(`[IMPROVE] Partial match found with prefix: "${prefix}"`);
        }
      }

      if (!found) {
        console.warn(`[IMPROVE] Text not found in paragraph ${localIndex}:`);
        console.warn(`  Expected: "${originalTextTrimmed.substring(0, 80)}"`);
        console.warn(`  Paragraph: "${paragraph.substring(0, 80)}"`);
        continue;
      }

      validSuggestions.push({
        id: randomUUID(),
        paragraphIndex: paragraphStartIndex + localIndex,
        chapterTitle,
        originalText: sug.originalText.trim(),
        improvedText: sug.improvedText.trim(),
        reason: sug.reason,
        type: sug.type as ImprovementType,
        confidence: sug.confidence || 0.8
      });
    }

    return validSuggestions;

  } catch (error: any) {
    console.error('[IMPROVE] Error analyzing section:', error.message);
    return [];
  }
}

/**
 * Divide uma seção grande em sub-seções menores para análise
 */
export function splitLargeSection(
  paragraphs: string[],
  maxParagraphsPerBatch: number = 5
): string[][] {
  const batches: string[][] = [];

  for (let i = 0; i < paragraphs.length; i += maxParagraphsPerBatch) {
    batches.push(paragraphs.slice(i, i + maxParagraphsPerBatch));
  }

  return batches;
}
