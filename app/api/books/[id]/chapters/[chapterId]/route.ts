import { NextRequest, NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { removeChapterFromBook } from '@/lib/books/repository';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id, chapterId } = await params;
    await removeChapterFromBook(id, chapterId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return bookApiError(error, 'Falha ao retirar capítulo do livro');
  }
}
