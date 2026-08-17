import { supabase } from '@/lib/supabase';
import type {
  BookChapterSource,
  BookDetails,
  BookSummary,
  ChapterBookContextMetadata,
} from './types';

const db = supabase as any;

export class BooksSchemaMissingError extends Error {
  code = 'BOOKS_SCHEMA_MISSING' as const;

  constructor() {
    super('A estrutura de Livros ainda não foi instalada. Aplique a migration 025 no Supabase.');
    this.name = 'BooksSchemaMissingError';
  }
}

function isMissingBooksSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = error?.message || '';
  return Boolean(
    error
    && (
      error.code === '42P01'
      || error.code === 'PGRST205'
      || error.code === 'PGRST204'
      || error.code === 'PGRST202'
    )
    && /books|book_chapters|assign_chapter_to_book|reorder_book_chapters/i.test(message)
  );
}

function throwRepositoryError(error: any, fallback: string): never {
  if (isMissingBooksSchema(error)) throw new BooksSchemaMissingError();
  throw new Error(error?.message || fallback);
}

function mapBook(row: any, chapterCount = 0): BookSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    chapterCount,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listBooks(): Promise<BookSummary[]> {
  const [{ data: books, error: booksError }, { data: memberships, error: membershipsError }] = await Promise.all([
    db.from('books').select('id, title, description, created_at, updated_at').order('updated_at', { ascending: false }),
    db.from('book_chapters').select('book_id'),
  ]);
  if (booksError) throwRepositoryError(booksError, 'Falha ao carregar livros');
  if (membershipsError) throwRepositoryError(membershipsError, 'Falha ao contar capítulos dos livros');

  const counts = new Map<string, number>();
  for (const membership of memberships || []) {
    const id = String(membership.book_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return (books || []).map((book: any) => mapBook(book, counts.get(String(book.id)) || 0));
}

export async function createBook(input: { title: string; description?: string }): Promise<BookSummary> {
  const title = input.title.trim();
  if (!title) throw new Error('Informe o título do livro');
  const { data, error } = await db
    .from('books')
    .insert({ title, description: input.description?.trim() || null })
    .select('id, title, description, created_at, updated_at')
    .single();
  if (error || !data) throwRepositoryError(error, 'Falha ao criar livro');
  return mapBook(data, 0);
}

export async function updateBook(
  bookId: string,
  input: { title?: string; description?: string | null }
): Promise<BookSummary> {
  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error('Informe o título do livro');
    updates.title = title;
  }
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (Object.keys(updates).length === 0) throw new Error('Nenhuma alteração informada');

  const { data, error } = await db
    .from('books')
    .update(updates)
    .eq('id', bookId)
    .select('id, title, description, created_at, updated_at')
    .single();
  if (error || !data) throwRepositoryError(error, 'Livro não encontrado');

  const { count } = await db
    .from('book_chapters')
    .select('*', { head: true, count: 'exact' })
    .eq('book_id', bookId);
  return mapBook(data, Number(count || 0));
}

export async function deleteBook(bookId: string): Promise<void> {
  const { error } = await db.from('books').delete().eq('id', bookId);
  if (error) throwRepositoryError(error, 'Falha ao excluir livro');
}

export async function listBookChapterSources(): Promise<BookChapterSource[]> {
  const [chaptersResult, thesesResult, membershipsResult, booksResult] = await Promise.all([
    db
      .from('chapters')
      .select('id, thesis_id, title, chapter_order, current_version_id, updated_at')
      .order('updated_at', { ascending: false }),
    db.from('theses').select('id, title'),
    db.from('book_chapters').select('book_id, chapter_id, chapter_order'),
    db.from('books').select('id, title'),
  ]);
  for (const result of [chaptersResult, thesesResult, membershipsResult, booksResult]) {
    if (result.error) throwRepositoryError(result.error, 'Falha ao carregar capítulos disponíveis');
  }

  const chapters = chaptersResult.data || [];
  const currentVersionIds = chapters
    .map((chapter: any) => chapter.current_version_id)
    .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id));
  const { data: versions, error: versionsError } = currentVersionIds.length > 0
    ? await db
        .from('chapter_versions')
        .select('id, version_number, file_path')
        .in('id', currentVersionIds)
    : { data: [], error: null };
  if (versionsError) throwRepositoryError(versionsError, 'Falha ao carregar versões atuais');

  const thesisTitles = new Map<string, string>(
    (thesesResult.data || []).map((row: any) => [String(row.id), String(row.title)])
  );
  const bookTitles = new Map<string, string>(
    (booksResult.data || []).map((row: any) => [String(row.id), String(row.title)])
  );
  const versionsById = new Map<string, any>((versions || []).map((row: any) => [String(row.id), row]));
  const membershipsByChapter = new Map<string, any>(
    (membershipsResult.data || []).map((row: any) => [String(row.chapter_id), row])
  );

  return chapters.map((chapter: any) => {
    const membership: any = membershipsByChapter.get(String(chapter.id));
    const version: any = chapter.current_version_id
      ? versionsById.get(String(chapter.current_version_id))
      : null;
    return {
      id: String(chapter.id),
      title: String(chapter.title),
      sourceId: String(chapter.thesis_id),
      sourceTitle: thesisTitles.get(String(chapter.thesis_id)) || 'Upload',
      sourceOrder: Number(chapter.chapter_order || 1),
      updatedAt: String(chapter.updated_at),
      currentVersionId: chapter.current_version_id ? String(chapter.current_version_id) : null,
      currentVersionNumber: version ? Number(version.version_number || 1) : null,
      currentVersionFilePath: version?.file_path ? String(version.file_path) : null,
      membership: membership
        ? {
            bookId: String(membership.book_id),
            bookTitle: bookTitles.get(String(membership.book_id)) || 'Livro',
            chapterOrder: Number(membership.chapter_order || 1),
          }
        : null,
    } satisfies BookChapterSource;
  });
}

export async function getBook(bookId: string): Promise<BookDetails | null> {
  const { data: row, error } = await db
    .from('books')
    .select('id, title, description, created_at, updated_at')
    .eq('id', bookId)
    .maybeSingle();
  if (error) throwRepositoryError(error, 'Falha ao carregar livro');
  if (!row) return null;

  const sources = await listBookChapterSources();
  const chapters = sources
    .filter((source) => source.membership?.bookId === bookId)
    .sort((a, b) => (a.membership?.chapterOrder || 0) - (b.membership?.chapterOrder || 0));
  return { ...mapBook(row, chapters.length), chapters };
}

export async function assignChapterToBook(bookId: string, chapterId: string): Promise<number> {
  const { data, error } = await db.rpc('assign_chapter_to_book', {
    p_book_id: bookId,
    p_chapter_id: chapterId,
  });
  if (error) throwRepositoryError(error, 'Falha ao adicionar capítulo ao livro');
  return Number(data || 1);
}

export async function reorderBookChapters(bookId: string, chapterIds: string[]): Promise<void> {
  if (new Set(chapterIds).size !== chapterIds.length) {
    throw new Error('A ordem contém capítulos repetidos');
  }
  const { error } = await db.rpc('reorder_book_chapters', {
    p_book_id: bookId,
    p_chapter_ids: chapterIds,
  });
  if (error) throwRepositoryError(error, 'Falha ao reordenar capítulos');
}

export async function removeChapterFromBook(bookId: string, chapterId: string): Promise<void> {
  const { error } = await db
    .from('book_chapters')
    .delete()
    .eq('book_id', bookId)
    .eq('chapter_id', chapterId);
  if (error) throwRepositoryError(error, 'Falha ao retirar capítulo do livro');

  const { data: remaining, error: listError } = await db
    .from('book_chapters')
    .select('chapter_id')
    .eq('book_id', bookId)
    .order('chapter_order', { ascending: true });
  if (listError) throwRepositoryError(listError, 'Capítulo retirado, mas a ordem não pôde ser normalizada');
  await reorderBookChapters(bookId, (remaining || []).map((row: any) => String(row.chapter_id)));
}

export async function getChapterBookContextMetadata(
  chapterId: string
): Promise<ChapterBookContextMetadata | null> {
  const { data: membership, error: membershipError } = await db
    .from('book_chapters')
    .select('book_id, chapter_order')
    .eq('chapter_id', chapterId)
    .maybeSingle();
  if (membershipError) throwRepositoryError(membershipError, 'Falha ao identificar o livro do capítulo');
  if (!membership) return null;

  const [{ data: book, error: bookError }, { data: memberships, error: listError }] = await Promise.all([
    db.from('books').select('id, title').eq('id', membership.book_id).single(),
    db
      .from('book_chapters')
      .select('chapter_id, chapter_order')
      .eq('book_id', membership.book_id)
      .order('chapter_order', { ascending: true }),
  ]);
  if (bookError || !book) throwRepositoryError(bookError, 'Livro não encontrado');
  if (listError) throwRepositoryError(listError, 'Falha ao carregar capítulos do livro');

  const chapterIds = (memberships || []).map((row: any) => String(row.chapter_id));
  const { data: chapters, error: chaptersError } = chapterIds.length > 0
    ? await db
        .from('chapters')
        .select('id, title, current_version_id')
        .in('id', chapterIds)
    : { data: [], error: null };
  if (chaptersError) throwRepositoryError(chaptersError, 'Falha ao carregar contexto do livro');

  const chaptersById = new Map((chapters || []).map((row: any) => [String(row.id), row]));
  return {
    bookId: String(book.id),
    bookTitle: String(book.title),
    currentChapterOrder: Number(membership.chapter_order || 1),
    chapters: (memberships || [])
      .map((row: any) => {
        const chapter: any = chaptersById.get(String(row.chapter_id));
        if (!chapter?.current_version_id) return null;
        return {
          chapterId: String(chapter.id),
          chapterTitle: String(chapter.title),
          chapterOrder: Number(row.chapter_order || 1),
          currentVersionId: String(chapter.current_version_id),
        };
      })
      .filter(Boolean),
  } as ChapterBookContextMetadata;
}

export function isBooksSchemaMissingError(error: unknown): error is BooksSchemaMissingError {
  return error instanceof BooksSchemaMissingError;
}
