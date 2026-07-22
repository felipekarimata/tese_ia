import { NextRequest, NextResponse } from 'next/server';
import { executeChapterMulti3Session } from '@/lib/multi-ai/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: chapterId, sessionId } = await params;
    const session = await executeChapterMulti3Session(chapterId, sessionId);
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('[MULTI3 RUN]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
