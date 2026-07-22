import { NextRequest, NextResponse } from 'next/server';
import { rejudgeMulti3Session } from '@/lib/multi-ai/orchestrator';
import { AIProvider } from '@/lib/ai/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const judgeProvider = body.judgeProvider as AIProvider;
    const judgeModel = body.judgeModel as string | undefined;

    if (!judgeProvider) {
      return NextResponse.json({ error: 'judgeProvider required' }, { status: 400 });
    }

    const session = await rejudgeMulti3Session(sessionId, judgeProvider, judgeModel);
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
