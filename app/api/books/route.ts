import { NextRequest, NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { createBook, listBooks } from '@/lib/books/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(
      { books: await listBooks() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return bookApiError(error, 'Falha ao carregar livros');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const book = await createBook({
      title: typeof body.title === 'string' ? body.title : '',
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    return NextResponse.json({ book }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Informe o título do livro') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return bookApiError(error, 'Falha ao criar livro');
  }
}
