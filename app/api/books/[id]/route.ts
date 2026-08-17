import { NextRequest, NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { deleteBook, getBook, updateBook } from '@/lib/books/repository';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const book = await getBook(id);
    if (!book) return NextResponse.json({ error: 'Livro não encontrado' }, { status: 404 });
    return NextResponse.json({ book }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return bookApiError(error, 'Falha ao carregar livro');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const book = await updateBook(id, {
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(typeof body.description === 'string' || body.description === null
        ? { description: body.description }
        : {}),
    });
    return NextResponse.json({ book });
  } catch (error) {
    if (error instanceof Error && /Informe o título|Nenhuma alteração/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return bookApiError(error, 'Falha ao atualizar livro');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteBook(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return bookApiError(error, 'Falha ao excluir livro');
  }
}
