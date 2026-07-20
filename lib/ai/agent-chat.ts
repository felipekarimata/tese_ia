/**
 * Lightweight chat helper for the agent's conversational mode.
 * Takes a system prompt + user message and returns the AI's text response.
 * Used to distinguish "ask a question about the document" from "edit the document".
 */

import { state } from '../state';
import { AIProvider } from './types';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { isOpenAIGpt5Family } from './openai-compat';

export type SimpleMessage = { role: 'user' | 'assistant'; content: string };

export type AgentChatRequest = {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  history: SimpleMessage[];
  userMessage: string;
};

function getApiKey(provider: AIProvider): string {
  switch (provider) {
    case 'openai':    return state.settings.openaiKey;
    case 'gemini':    return state.settings.googleKey;
    case 'grok':      return state.settings.xaiKey;
    case 'anthropic': return state.settings.anthropicKey;
  }
}

export async function chatWithAgent(req: AgentChatRequest): Promise<string> {
  const apiKey = getApiKey(req.provider);
  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${req.provider}`);
  }

  switch (req.provider) {
    case 'openai':
      return chatOpenAI(req, apiKey);
    case 'gemini':
      return chatGemini(req, apiKey);
    case 'anthropic':
      return chatAnthropic(req, apiKey);
    case 'grok':
      return chatGrok(req, apiKey);
  }
}

async function chatOpenAI(req: AgentChatRequest, apiKey: string): Promise<string> {
  const client = new OpenAI({ apiKey });
  const messages: any[] = [
    { role: 'system', content: req.systemPrompt },
    ...req.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: req.userMessage },
  ];

  const response = await client.chat.completions.create({
    model: req.model,
    messages,
    ...(isOpenAIGpt5Family(req.model) ? {} : { temperature: 0.3 }),
    max_tokens: 4000,
  });
  return response.choices[0]?.message?.content ?? '';
}

async function chatGemini(req: AgentChatRequest, apiKey: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: req.model, systemInstruction: req.systemPrompt });

  // Gemini wants alternating user/model turns; assistant -> model.
  const history = req.history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  });
  const result = await chat.sendMessage(req.userMessage);
  return result.response.text();
}

async function chatAnthropic(req: AgentChatRequest, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: req.model,
    max_tokens: 4000,
    system: req.systemPrompt,
    messages: [
      ...req.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: req.userMessage },
    ],
  });
  const block = response.content.find((c: any) => c.type === 'text');
  return (block as any)?.text ?? '';
}

async function chatGrok(req: AgentChatRequest, apiKey: string): Promise<string> {
  // xAI Grok uses an OpenAI-compatible API
  const client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const response = await client.chat.completions.create({
    model: req.model,
    messages: [
      { role: 'system', content: req.systemPrompt },
      ...req.history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: req.userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });
  return response.choices[0]?.message?.content ?? '';
}
