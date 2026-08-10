import { NextRequest, NextResponse } from 'next/server';
import { executeDocumentMulti3Session } from '@/lib/multi-ai/document-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: documentId, sessionId } = await params;
    void executeDocumentMulti3Session(documentId, sessionId).catch((error) => {
      console.error('[DOC-MULTI3 RUN BACKGROUND]', error);
    });
    return NextResponse.json(
      { message: 'Processamento Multi-IA iniciado', sessionId },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('[DOC-MULTI3 RUN]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
