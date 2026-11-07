import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatRequest, AIResponse } from './types';
import { buildSystemPrompt, buildUserPrompt, extractCitations } from './prompts';
import { state } from '../state';
import { isGemini429, parseGeminiRetryDelayMs, sleep, backoffDelayMs, MAX_RETRY_ATTEMPTS } from './gemini-retry';
import { geminiRateLimiter } from './rate-limiter';

export async function executeGemini(
  request: ChatRequest,
  apiKey: string
): Promise<AIResponse> {
  const startTime = Date.now();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: request.model });

  const systemPrompt = buildSystemPrompt(request.action);
  const userPrompt = buildUserPrompt(request.question, request.context);

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const maxAttempts = MAX_RETRY_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Rate limit global: evita 429 na origem antes de cada chamada.
      await geminiRateLimiter.acquire();
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192 // Aumentado para máximo do Gemini (permite respostas muito detalhadas)
        }
      });

      const latencyMs = Date.now() - startTime;
      const response = result.response;
      const text = response.text();

      // Estimativa de tokens
      const tokensIn = Math.round(fullPrompt.length / 4);
      const tokensOut = Math.round(text.length / 4);

      const pricing = state.settings.pricesUSD[request.model] ?? { in: 0, out: 0 };
      const costEstimatedUsd = (tokensIn / 1000) * pricing.in + (tokensOut / 1000) * pricing.out;

      const citations = extractCitations(text);

      return {
        provider: 'gemini',
        model: request.model,
        text,
        citations,
        latencyMs,
        tokensIn,
        tokensOut,
        costEstimatedUsd
      };
    } catch (error: any) {
      if (attempt >= maxAttempts) {
        throw new Error(`Gemini error: ${error.message}`);
      }
      const hintMs = isGemini429(error) ? parseGeminiRetryDelayMs(error) : undefined;
      const delayMs = backoffDelayMs(attempt, hintMs);
      console.warn(`[GEMINI] ${hintMs ? '429 quota/rate limit' : 'erro transitório'} (tentativa ${attempt}/${maxAttempts}), aguardando ${(delayMs / 1000).toFixed(1)}s...`);
      await sleep(delayMs);
    }
  }

  throw new Error('Gemini execution failed after retries');
}
