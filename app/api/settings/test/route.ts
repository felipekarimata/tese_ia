import { NextRequest, NextResponse } from 'next/server';
import { state } from '@/lib/state';
import { executeAI } from '@/lib/ai/executor';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json() as { provider: 'openai' | 'gemini' | 'grok' | 'anthropic' };

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not specified' },
        { status: 400 }
      );
    }

    // Get model for provider
    let model = '';
    switch (provider) {
      case 'openai':
        model = state.settings.models.openai[0];
        break;
      case 'gemini':
        model = state.settings.models.gemini[0];
        break;
      case 'grok':
        model = state.settings.models.grok[0];
        break;
      case 'anthropic':
        model = state.settings.models.anthropic[0];
        break;
    }

    if (!model) {
      return NextResponse.json(
        { error: 'No model configured for provider' },
        { status: 400 }
      );
    }

    // Test with simple ping
    const result = await executeAI(provider, {
      question: 'Responda apenas: OK',
      context: [
        {
          ix: 0,
          pageFrom: 1,
          pageTo: 1,
          text: 'Teste de conexão'
        }
      ],
      model
    });

    return NextResponse.json({
      success: true,
      provider,
      model,
      latencyMs: result.latencyMs
    });
  } catch (error: any) {
    console.error('Settings test error:', error);
    return NextResponse.json(
      { error: `Test failed: ${error.message}` },
      { status: 500 }
    );
  }
}
