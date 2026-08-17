import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startBookAssemblyJob } from '@/lib/book-assembly/engine';
import { listAllBookAssemblyJobs, normalizeBookAssemblyJob } from '@/lib/book-assembly/repository';
import { validateGlobalBookAssemblyInput } from '@/lib/book-assembly/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) },
  });
}

export async function GET() {
  try {
    const jobs = await listAllBookAssemblyJobs();
    return noStoreJson({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return noStoreJson({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let targetThesisId: string | null = null;
  let jobCreated = false;

  try {
    const input = await validateGlobalBookAssemblyInput(await request.json());
    const { data: targetThesis, error: targetError } = await (supabase as any)
      .from('theses')
      .insert({
        title: input.title,
        description: `Livro em montagem a partir de ${input.chapterSelections.length} capítulo${input.chapterSelections.length === 1 ? '' : 's'}.`,
      })
      .select('id, title')
      .single();
    if (targetError || !targetThesis) {
      throw new Error(`Falha ao criar o novo livro: ${targetError?.message || 'erro desconhecido'}`);
    }
    targetThesisId = targetThesis.id;

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from('book_assembly_jobs')
      .insert({
        id: jobId,
        thesis_id: targetThesisId,
        title: input.title,
        mode: input.mode,
        status: 'queued',
        provider: input.provider,
        model: input.model,
        custom_instructions: input.customInstructions,
        include_cover_page: input.includeCoverPage,
        chapter_selections: input.chapterSelections,
        progress: 1,
        progress_label: 'Preparando os uploads selecionados',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Falha ao criar a montagem: ${error?.message || 'erro desconhecido'}`);
    }
    jobCreated = true;

    startBookAssemblyJob(jobId);
    return noStoreJson({ job: normalizeBookAssemblyJob(data) }, { status: 202 });
  } catch (error) {
    if (targetThesisId && !jobCreated) {
      await (supabase as any).from('theses').delete().eq('id', targetThesisId);
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = /não encontrad|não pertence/i.test(message) ? 404 : 400;
    return noStoreJson({ error: message }, { status });
  }
}
