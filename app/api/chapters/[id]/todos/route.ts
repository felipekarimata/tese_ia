import { NextRequest, NextResponse } from 'next/server';
import { runTodosPipeline } from '@/lib/todos/run-todos-pipeline';
import { AIProvider } from '@/lib/ai/types';
import { SupportedLanguage } from '@/lib/translation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TodosBody = {
  provider?: AIProvider;
  model?: string;
  targetLanguage?: SupportedLanguage;
  adaptStyle?: 'academic' | 'professional' | 'simplified' | 'custom';
  targetAudience?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body: TodosBody = await req.json().catch(() => ({}));

    const provider = body.provider || 'gemini';
    const model = body.model || 'gemini-2.5-flash';

    runTodosPipeline(chapterId, {
      provider,
      model,
      targetLanguage: body.targetLanguage || 'pt',
      adaptStyle: body.adaptStyle || 'simplified',
      targetAudience: body.targetAudience,
    }).catch((error) => {
      console.error(`[CHAPTER-TODOS ${chapterId}] Background error:`, error);
    });

    return NextResponse.json({
      message: '/todos iniciado',
      sequence: ['translate', 'adapt', 'update'],
    });
  } catch (error: any) {
    console.error('[CHAPTER-TODOS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
