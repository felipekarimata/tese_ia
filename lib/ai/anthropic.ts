import Anthropic from '@anthropic-ai/sdk';
import { ChatRequest, AIResponse } from './types';
import { buildSystemPrompt, buildUserPrompt, extractCitations } from './prompts';
import { state } from '../state';

/** Concatena blocos de texto da resposta do assistente. */
export function textFromAnthropicContent(
  content: Anthropic.Messages.ContentBlock[]
): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Uma chamada Messages API (texto). Para JSON, use prompt pedindo só JSON e faça parse no caller.
 */
export async function anthropicChat(params: {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: params.apiKey });
  const response = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    ...(params.system ? { system: params.system } : {}),
    temperature: params.temperature ?? 0.3,
    messages: [{ role: 'user', content: params.user }]
  });
  const text = textFromAnthropicContent(response.content).trim();
  return {
    text,
    inputTokens: response.usage?.input_tokens ?? Math.round(params.user.length / 4),
    outputTokens: response.usage?.output_tokens ?? Math.round(text.length / 4)
  };
}

/**
 * Mensagens com ferramenta web_search (server-side). Um único request costuma bastar (várias pesquisas internas).
 */
export async function anthropicChatWithWebSearch(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  maxWebUses?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: params.apiKey });
  const tools: Anthropic.Messages.ToolUnion[] = [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: params.maxWebUses ?? 10,
      user_location: {
        type: 'approximate',
        country: 'BR',
        timezone: 'America/Sao_Paulo'
      }
    }
  ];
  const response = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    system: params.system,
    tools,
    messages: [{ role: 'user', content: params.user }],
    temperature: 0.2
  });
  const text = textFromAnthropicContent(response.content).trim();
  return {
    text,
    inputTokens: response.usage?.input_tokens ?? Math.round(params.user.length / 4),
    outputTokens: response.usage?.output_tokens ?? Math.round(text.length / 4)
  };
}

export async function executeAnthropic(
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
      const { text, inputTokens, outputTokens } = await anthropicChat({
        apiKey,
        model: request.model,
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 8000,
        temperature: 0.3
      });

      const latencyMs = Date.now() - startTime;
      const pricing = state.settings.pricesUSD[request.model] ?? { in: 0, out: 0 };
      const costEstimatedUsd =
        (inputTokens / 1000) * pricing.in + (outputTokens / 1000) * pricing.out;

      return {
        provider: 'anthropic',
        model: request.model,
        text,
        citations: extractCitations(text),
        latencyMs,
        tokensIn: inputTokens,
        tokensOut: outputTokens,
        costEstimatedUsd
      };
    } catch (error: any) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Anthropic error: ${error.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error('Anthropic execution failed after retries');
}
