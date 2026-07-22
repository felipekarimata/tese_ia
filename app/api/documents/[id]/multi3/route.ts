import { NextRequest, NextResponse } from 'next/server';
import { startDocumentMulti3 } from '@/lib/multi-ai/document-orchestrator';
import { listMulti3Sessions } from '@/lib/multi-ai/session-store';
import { Multi3StartRequest } from '@/lib/multi-ai/types';
import { AIProvider } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const sessions = await listMulti3Sessions('document', documentId);
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
    const { id: documentId } = await params;
    const body = await req.json();

    const startReq: Multi3StartRequest = {
      providers: body.providers as AIProvider[],
      judgeProvider: body.judgeProvider,
      command: body.command,
      args: body.args || '',
      versionId: body.versionId || documentId,
      models: body.models,
    };

    if (!startReq.providers?.length || !startReq.command) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const session = await startDocumentMulti3(documentId, startReq);
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
