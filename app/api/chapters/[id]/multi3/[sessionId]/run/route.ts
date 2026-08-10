import { NextRequest, NextResponse } from 'next/server';
import { executeChapterMulti3Session } from '@/lib/multi-ai/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: chapterId, sessionId } = await params;
    void executeChapterMulti3Session(chapterId, sessionId).catch((error) => {
      console.error('[MULTI3 RUN BACKGROUND]', error);
    });
    return NextResponse.json(
      { message: 'Processamento Multi-IA iniciado', sessionId },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('[MULTI3 RUN]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
