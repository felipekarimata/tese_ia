import { NextRequest, NextResponse } from 'next/server';
import { startChapterMulti3 } from '@/lib/multi-ai/orchestrator';
import { listMulti3Sessions } from '@/lib/multi-ai/session-store';
import { Multi3StartRequest } from '@/lib/multi-ai/types';
import { AIProvider } from '@/lib/ai/types';
import { isValidTodosProviderSelection } from '@/lib/multi-ai/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const sessions = await listMulti3Sessions('chapter', chapterId);
    return NextResponse.json({ sessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body = await req.json();

    const startReq: Multi3StartRequest = {
      providers: body.providers as AIProvider[],
      judgeProvider: body.judgeProvider,
      command: body.command,
      args: body.args || '',
      versionId: body.versionId,
      models: body.models,
    };

    if (!startReq.versionId || !startReq.command) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (startReq.command !== '/todos' || !isValidTodosProviderSelection(startReq.providers)) {
      return NextResponse.json(
        { error: 'O comando /todos exige exatamente 3 provedores diferentes.' },
        { status: 400 }
      );
    }

    const session = await startChapterMulti3(chapterId, startReq);
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('[MULTI3 POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
