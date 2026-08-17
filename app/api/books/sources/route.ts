import { NextResponse } from 'next/server';
import { bookApiError } from '@/lib/books/api';
import { listBookChapterSources } from '@/lib/books/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(
      { chapters: await listBookChapterSources() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return bookApiError(error, 'Falha ao carregar capítulos');
  }
}
