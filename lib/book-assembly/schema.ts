import type { SupabaseClient } from '@supabase/supabase-js';

const BOOK_ASSEMBLY_TABLE = 'book_assembly_jobs';

export const BOOK_ASSEMBLY_SCHEMA_ERROR =
  'A estrutura de Montar Livro ainda não foi preparada. Execute a migration 023_book_assembly_jobs.sql no Supabase.';

export function isMissingBookAssemblyTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message || '';
  return candidate?.code === '42P01'
    || candidate?.code === 'PGRST205'
    || /book_assembly_jobs/i.test(message) && /could not find|does not exist|schema cache/i.test(message);
}

export async function checkBookAssemblySchema(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from(BOOK_ASSEMBLY_TABLE)
    .select('id')
    .limit(1);

  if (!error) return;
  if (isMissingBookAssemblyTable(error)) throw new Error(BOOK_ASSEMBLY_SCHEMA_ERROR);
  throw error;
}
