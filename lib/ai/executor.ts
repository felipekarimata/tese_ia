import { AIProvider, AIResponse, ChatRequest } from './types';
import { executeOpenAI } from './openai';
import { executeGemini } from './gemini';
import { executeGrok } from './grok';
import { executeAnthropic } from './anthropic';
import { state } from '../state';

export async function executeAI(
  provider: AIProvider,
  request: ChatRequest
): Promise<AIResponse> {
  let apiKey = '';

  switch (provider) {
    case 'openai':
      apiKey = state.settings.openaiKey;
      if (!apiKey) throw new Error('OpenAI API key not configured');
      return executeOpenAI(request, apiKey);

    case 'gemini':
      apiKey = state.settings.googleKey;
      if (!apiKey) throw new Error('Gemini API key not configured');
      return executeGemini(request, apiKey);

    case 'grok':
      apiKey = state.settings.xaiKey;
      if (!apiKey) throw new Error('Grok API key not configured');
      return executeGrok(request, apiKey);

    case 'anthropic':
      apiKey = state.settings.anthropicKey;
      if (!apiKey) throw new Error('Anthropic API key not configured');
      return executeAnthropic(request, apiKey);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function executeMultipleAI(
  providers: AIProvider[],
  models: Partial<Record<AIProvider, string>>,
  baseRequest: Omit<ChatRequest, 'model'>
): Promise<AIResponse[]> {
  const promises = providers.map(async (provider) => {
    const model = models[provider];
    if (!model) {
      throw new Error(`No model specified for provider: ${provider}`);
    }

    try {
      return await executeAI(provider, { ...baseRequest, model });
    } catch (error: any) {
      // Retorna erro como resposta
      return {
        provider,
        model,
        text: `❌ Erro: ${error.message}`,
        citations: [],
        latencyMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        costEstimatedUsd: 0
      } as AIResponse;
    }
  });

  return Promise.all(promises);
}
