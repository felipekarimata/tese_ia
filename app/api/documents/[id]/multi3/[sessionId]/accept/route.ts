import { NextRequest, NextResponse } from 'next/server';
import { acceptDocumentMulti3Winner } from '@/lib/multi-ai/document-orchestrator';
import { AIProvider } from '@/lib/ai/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json().catch(() => ({}));
    const session = await acceptDocumentMulti3Winner(sessionId, body.provider as AIProvider | undefined);
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
