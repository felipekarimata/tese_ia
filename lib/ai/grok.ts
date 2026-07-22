import { ChatRequest, AIResponse } from './types';
import { buildSystemPrompt, buildUserPrompt, extractCitations } from './prompts';
import { state } from '../state';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export async function executeGrok(
  request: ChatRequest,
  apiKey: string
): Promise<AIResponse> {
  const startTime = Date.now();

  const systemPrompt = buildSystemPrompt(request.action);
  const userPrompt = buildUserPrompt(request.question, request.context);

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 4096 // Aumentado para máximo do Grok (permite respostas muito detalhadas)
        })
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const text = data.choices?.[0]?.message?.content ?? '';
      const tokensIn = data.usage?.prompt_tokens ?? Math.round(userPrompt.length / 4);
      const tokensOut = data.usage?.completion_tokens ?? Math.round(text.length / 4);

      const pricing = state.settings.pricesUSD[request.model] ?? { in: 0, out: 0 };
      const costEstimatedUsd = (tokensIn / 1000) * pricing.in + (tokensOut / 1000) * pricing.out;

      const citations = extractCitations(text);

      return {
        provider: 'grok',
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
        throw new Error(`Grok error: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Grok execution failed after retries');
}
