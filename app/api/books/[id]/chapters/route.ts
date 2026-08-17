import { NextRequest, NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { assignChapterToBook, getBook, reorderBookChapters } from '@/lib/books/repository';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (typeof body.chapterId !== 'string' || !body.chapterId.trim()) {
      return NextResponse.json({ error: 'Informe o capítulo' }, { status: 400 });
    }
    const chapterOrder = await assignChapterToBook(id, body.chapterId);
    return NextResponse.json({ success: true, chapterOrder });
  } catch (error) {
    return bookApiError(error, 'Falha ao adicionar capítulo');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!Array.isArray(body.chapterIds) || body.chapterIds.some((value: unknown) => typeof value !== 'string')) {
      return NextResponse.json({ error: 'Ordem de capítulos inválida' }, { status: 400 });
    }
    await reorderBookChapters(id, body.chapterIds);
    return NextResponse.json({ book: await getBook(id) });
  } catch (error) {
    if (error instanceof Error && /ordem|repetidos/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return bookApiError(error, 'Falha ao reordenar capítulos');
  }
}
