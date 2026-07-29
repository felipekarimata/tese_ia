import { NextRequest, NextResponse } from 'next/server';
import { state } from '@/lib/state';
import OpenAI from 'openai';
import { RECOMMENDED_MODELS } from '@/lib/ai/model-registry';
export const runtime = 'nodejs';
export const maxDuration = 30;

async function listOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    const openai = new OpenAI({ apiKey });
    const models = await openai.models.list();

    // Filtrar apenas modelos GPT úteis para chat
    const gptModels = models.data
      .filter(m =>
        m.id.startsWith('gpt-') &&
        !m.id.includes('instruct') &&
        !m.id.includes('vision')
      )
      .map(m => m.id)
      .sort();

    return Array.from(new Set([...RECOMMENDED_MODELS.openai, ...gptModels]));
  } catch (error: any) {
    throw new Error(`OpenAI: ${error.message}`);
  }
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  try {
    // Fazer requisição direta à API do Gemini para listar modelos
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      // Se falhar, retornar modelos conhecidos que funcionam
      return RECOMMENDED_MODELS.gemini;
    }

    const data = await response.json();

    // Filtrar apenas modelos que suportam generateContent
    const models = data.models
      ?.filter((m: any) =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        m.name.includes('gemini') &&
        !m.name.includes('embedding') &&
        !m.name.includes('image-generation') &&
        !m.name.includes('robotics') &&
        !m.name.includes('computer-use')
      )
      .map((m: any) => m.name.replace('models/', ''))
      .sort() || [];

    return models.length > 0
      ? Array.from(new Set([...RECOMMENDED_MODELS.gemini, ...models]))
      : RECOMMENDED_MODELS.gemini;
  } catch (error: any) {
    // Retornar modelos conhecidos em caso de erro
    return RECOMMENDED_MODELS.gemini;
  }
}

function listAnthropicModelsStatic(): string[] {
  return RECOMMENDED_MODELS.anthropic;
}

async function listGrokModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.x.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Se falhar, retornar modelos conhecidos
      return RECOMMENDED_MODELS.grok;
    }

    const data = await response.json();
    const models = data.data?.map((m: any) => m.id) || [];

    return models.length > 0
      ? Array.from(new Set([...RECOMMENDED_MODELS.grok, ...models]))
      : RECOMMENDED_MODELS.grok;
  } catch (error: any) {
    // Retornar modelos conhecidos em caso de erro
    return RECOMMENDED_MODELS.grok;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json() as { provider: 'openai' | 'gemini' | 'grok' | 'anthropic' };

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not specified' },
        { status: 400 }
      );
    }

    let models: string[] = [];
    let apiKey = '';

    switch (provider) {
      case 'openai':
        apiKey = state.settings.openaiKey;
        if (!apiKey) throw new Error('OpenAI API key not configured');
        models = await listOpenAIModels(apiKey);
        break;

      case 'gemini':
        apiKey = state.settings.googleKey;
        if (!apiKey) throw new Error('Gemini API key not configured');
        models = await listGeminiModels(apiKey);
        break;

      case 'grok':
        apiKey = state.settings.xaiKey;
        if (!apiKey) throw new Error('Grok API key not configured');
        models = await listGrokModels(apiKey);
        break;

      case 'anthropic':
        apiKey = state.settings.anthropicKey;
        if (!apiKey) throw new Error('Anthropic API key not configured');
        models = listAnthropicModelsStatic();
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid provider' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      provider,
      models
    });
  } catch (error: any) {
    console.error('List models error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list models' },
      { status: 500 }
    );
  }
}
