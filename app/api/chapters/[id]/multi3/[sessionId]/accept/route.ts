import { NextRequest, NextResponse } from 'next/server';
import { acceptMulti3Winner } from '@/lib/multi-ai/orchestrator';
import { AIProvider } from '@/lib/ai/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json().catch(() => ({}));
    const provider = body.provider as AIProvider | undefined;

    const session = await acceptMulti3Winner(sessionId, provider);
    return NextResponse.json({ session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
