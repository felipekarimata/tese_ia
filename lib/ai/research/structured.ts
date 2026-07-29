import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type { AIProvider } from '../types';
import { isOpenAIGpt5Family, openaiCompletionTokenLimit } from '../openai-compat';

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
