import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { AIProvider } from '../types';
import { isOpenAIGpt5Family, openaiCompletionTokenLimit } from '../openai-compat';

export type ParsedStructuredJson = {
  value: unknown;
  recovered: boolean;
};

function firstBalancedJsonValue(raw: string): string | undefined {
  const start = raw.search(/[\[{]/);
  if (start < 0) return undefined;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index++) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const opening = stack.pop();
      if ((char === '}' && opening !== '{') || (char === ']' && opening !== '[')) return undefined;
      if (stack.length === 0) return raw.slice(start, index + 1);
    }
  }

  return undefined;
}

/**
 * Providers occasionally append commentary or a second JSON value despite
 * structured-output mode. Preserve the first complete JSON value instead of
 * losing the entire review block.
 */
export function parseStructuredJsonResponse(raw: string): ParsedStructuredJson {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return { value: JSON.parse(trimmed), recovered: false };
  } catch (originalError) {
    const candidate = firstBalancedJsonValue(trimmed);
    if (!candidate) throw originalError;
    return { value: JSON.parse(candidate), recovered: candidate.length !== trimmed.length };
  }
}

export async function generateStructuredJson(params: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const maxTokens = params.maxTokens ?? 8192;

  if (params.provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: params.apiKey });
    const response: any = await ai.models.generateContent({
      model: params.model,
      contents: params.prompt,
      config: {
        systemInstruction: params.system,
        responseMimeType: 'application/json',
        maxOutputTokens: maxTokens,
        temperature: 0.1
      }
    });
    return String(response.text || '{}').trim();
  }

  if (params.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: params.apiKey });
    const response = await client.messages.create({
      model: params.model,
      max_tokens: maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }]
    });
    return response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim() || '{}';
  }

  const client = new OpenAI({
    apiKey: params.apiKey,
    ...(params.provider === 'grok' ? { baseURL: 'https://api.x.ai/v1' } : {})
  });
  const completion = await client.chat.completions.create({
    model: params.model,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt }
    ],
    ...(params.provider === 'openai' && isOpenAIGpt5Family(params.model) ? {} : { temperature: 0.1 }),
    ...(params.provider === 'openai' ? openaiCompletionTokenLimit(params.model, maxTokens) : { max_tokens: maxTokens }),
    response_format: { type: 'json_object' }
  } as any);
  return completion.choices[0]?.message?.content?.trim() || '{}';
}
