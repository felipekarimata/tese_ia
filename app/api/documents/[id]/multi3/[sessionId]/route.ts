import { NextRequest, NextResponse } from 'next/server';
import { getMulti3Session } from '@/lib/multi-ai/session-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await getMulti3Session(sessionId);
    if (!session) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
