import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { normalizeSources } from './source-utils';
import type { ResearchRequest, ResearchResult } from './types';

export * from './types';
export * from './source-utils';
export * from './structured';

const RESEARCH_SYSTEM = `Você é um pesquisador académico rigoroso. Pesquise na web antes de responder.
Priorize fontes oficiais, artigos científicos, editoras académicas e documentos primários.
Diferencie a data do evento da data de publicação. Não invente URL, DOI, título, autor ou conclusão.
Quando a evidência for insuficiente ou conflitante, declare isso explicitamente.`;

function researchPrompt(request: ResearchRequest): string {
  const domains = request.preferredDomains?.length
    ? `\nPriorize também estes domínios: ${request.preferredDomains.join(', ')}.`
    : '';
  return `TEMA A VERIFICAR:\n${request.topic}\n\nCONTEXTO:\n${request.context || 'Não fornecido.'}${domains}\n\nFaça pesquisas suficientes para verificar alegações potencialmente desatualizadas. Produza uma síntese factual e cite as fontes usadas.`;
}

function getOutputText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text.trim();
  const texts: string[] = [];
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string') texts.push(part.text);
    }
  }
  return texts.join('\n').trim();
}

export function parseResponsesApi(response: any) {
  const sourceInputs: any[] = [];
  const queries: string[] = [];
  let searchCalls = 0;

  for (const item of response?.output || []) {
    if (item?.type === 'web_search_call') {
      searchCalls++;
      if (typeof item?.action?.query === 'string') queries.push(item.action.query);
      for (const source of item?.action?.sources || []) {
        sourceInputs.push({ title: source.title || source.name, url: source.url, publishedAt: source.published_at });
      }
    }
    for (const part of item?.content || []) {
      for (const annotation of part?.annotations || []) {
        if (annotation?.type === 'url_citation' || annotation?.url) {
          sourceInputs.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
  }

  return {
    text: getOutputText(response),
    sources: normalizeSources(sourceInputs),
    queries: Array.from(new Set(queries)),
    searchCalls
  };
}

export function parseGeminiGrounding(response: any) {
  const metadata = response?.candidates?.[0]?.groundingMetadata || response?.groundingMetadata || {};
  const queries = (metadata.webSearchQueries || []).filter(
    (query: unknown): query is string => typeof query === 'string'
  );
  return {
    text: String(response?.text || '').trim(),
    queries: Array.from(new Set<string>(queries)),
    sources: normalizeSources((metadata.groundingChunks || []).map((chunk: any) => ({
      title: chunk?.web?.title,
      url: chunk?.web?.uri
    })))
  };
}

export function parseAnthropicResearchContent(content: any[]) {
  const texts: string[] = [];
  const sourceInputs: any[] = [];
  const queries: string[] = [];
  let searchCalls = 0;
  for (const block of content || []) {
    if (block.type === 'text') {
      texts.push(block.text);
      for (const citation of block.citations || []) {
        sourceInputs.push({ title: citation.title, url: citation.url, citedText: citation.cited_text });
      }
    } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
      searchCalls++;
      if (typeof block.input?.query === 'string') queries.push(block.input.query);
    } else if (block.type === 'web_search_tool_result') {
      for (const item of block.content || []) {
        sourceInputs.push({ title: item.title, url: item.url, excerpt: item.page_content });
      }
    }
  }
  return {
    text: texts.join('\n').trim(),
    queries: Array.from(new Set(queries)),
    sources: normalizeSources(sourceInputs),
    searchCalls
  };
}

async function researchOpenAICompatible(request: ResearchRequest): Promise<ResearchResult> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    ...(request.provider === 'grok' ? { baseURL: 'https://api.x.ai/v1' } : {})
  });
  const isOpenAI = request.provider === 'openai';
  const response: any = await (client.responses.create as any)({
    model: request.model,
    input: [
      { role: 'system', content: RESEARCH_SYSTEM },
      { role: 'user', content: researchPrompt(request) }
    ],
    tools: [{ type: 'web_search', ...(isOpenAI ? { search_context_size: 'high' } : {}) }],
    ...(isOpenAI ? {
      tool_choice: 'required',
      reasoning: { effort: request.depth === 'deep' ? 'xhigh' : 'high' },
      include: ['web_search_call.action.sources']
    } : {})
  });
  const parsed = parseResponsesApi(response);
  return {
    provider: request.provider,
    model: request.model,
    text: parsed.text,
    queries: parsed.queries,
    sources: parsed.sources,
    usage: {
      inputTokens: response?.usage?.input_tokens,
      outputTokens: response?.usage?.output_tokens,
      searchCalls: parsed.searchCalls
    }
  };
}

async function researchGemini(request: ResearchRequest): Promise<ResearchResult> {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });
  const response: any = await ai.models.generateContent({
    model: request.model,
    contents: researchPrompt(request),
    config: {
      systemInstruction: RESEARCH_SYSTEM,
      tools: [{ googleSearch: {} }],
      maxOutputTokens: request.depth === 'deep' ? 16384 : 8192,
      temperature: 0.2
    }
  });
  const metadata = response?.candidates?.[0]?.groundingMetadata || response?.groundingMetadata || {};
  const parsed = parseGeminiGrounding(response);
  return {
    provider: request.provider,
    model: request.model,
    text: parsed.text,
    queries: parsed.queries,
    sources: parsed.sources,
    usage: {
      inputTokens: response?.usageMetadata?.promptTokenCount,
      outputTokens: response?.usageMetadata?.candidatesTokenCount,
      searchCalls: metadata.searchEntryPoint ? 1 : undefined
    }
  };
}

async function researchAnthropic(request: ResearchRequest): Promise<ResearchResult> {
  const client = new Anthropic({ apiKey: request.apiKey });
  const response: any = await client.messages.create({
    model: request.model,
    max_tokens: request.depth === 'deep' ? 16384 : 8192,
    system: RESEARCH_SYSTEM,
    tools: [{
      type: 'web_search_20260318',
      name: 'web_search',
      max_uses: request.depth === 'deep' ? 12 : 5,
      allowed_callers: ['direct'],
      user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' }
    }],
    messages: [{ role: 'user', content: researchPrompt(request) }]
  } as any);

  const parsed = parseAnthropicResearchContent(response.content || []);
  return {
    provider: request.provider,
    model: request.model,
    text: parsed.text,
    queries: parsed.queries,
    sources: parsed.sources,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      searchCalls: parsed.searchCalls
    }
  };
}

export async function researchWithWebSearch(request: ResearchRequest): Promise<ResearchResult> {
  if (request.provider === 'gemini') return researchGemini(request);
  if (request.provider === 'anthropic') return researchAnthropic(request);
  return researchOpenAICompatible(request);
}
