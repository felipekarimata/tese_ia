import OpenAI from 'openai';
import { ChatRequest, AIResponse } from './types';
import { buildSystemPrompt, buildUserPrompt, extractCitations } from './prompts';
import { state } from '../state';
import { isOpenAIGpt5Family } from './openai-compat';

export async function executeOpenAI(
  request: ChatRequest,
  apiKey: string
): Promise<AIResponse> {
  const startTime = Date.now();

  const openai = new OpenAI({ apiKey });

  const systemPrompt = buildSystemPrompt(request.action);
  const userPrompt = buildUserPrompt(request.question, request.context);

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const response = await openai.chat.completions.create({
        model: request.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        ...(isOpenAIGpt5Family(request.model) ? {} : { temperature: 0.3 }),
        max_tokens: 8000 // Aumentado para permitir respostas muito detalhadas no chat
      });

      const latencyMs = Date.now() - startTime;
      const text = response.choices[0]?.message?.content ?? '';
      const tokensIn = response.usage?.prompt_tokens ?? Math.round(userPrompt.length / 4);
      const tokensOut = response.usage?.completion_tokens ?? Math.round(text.length / 4);

      const pricing = state.settings.pricesUSD[request.model] ?? { in: 0, out: 0 };
      const costEstimatedUsd = (tokensIn / 1000) * pricing.in + (tokensOut / 1000) * pricing.out;

      const citations = extractCitations(text);

      return {
        provider: 'openai',
        model: request.model,
        text,
        citations,
        latencyMs,
        tokensIn,
        tokensOut,
        costEstimatedUsd
      };
    } catch (error: any) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`OpenAI error: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('OpenAI execution failed after retries');
}
