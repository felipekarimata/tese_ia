import { NextRequest, NextResponse } from 'next/server';
import { executeDocumentMulti3Session } from '@/lib/multi-ai/document-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: documentId, sessionId } = await params;
    const session = await executeDocumentMulti3Session(documentId, sessionId);
    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('[DOC-MULTI3 RUN]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
