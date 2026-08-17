import { NextRequest, NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { getChapterBookContextMetadata } from '@/lib/books/repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    const context = await getChapterBookContextMetadata(chapterId);
    return NextResponse.json(
      { context },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return bookApiError(error, 'Falha ao carregar contexto do livro');
  }
}
