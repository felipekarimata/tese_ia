import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startBookAssemblyJob } from '@/lib/book-assembly/engine';
import { listBookAssemblyJobs, normalizeBookAssemblyJob } from '@/lib/book-assembly/repository';
import { validateBookAssemblyInput } from '@/lib/book-assembly/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;
    const jobs = await listBookAssemblyJobs(thesisId);
    return noStoreJson({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return noStoreJson({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: thesisId } = await params;
    const input = await validateBookAssemblyInput(thesisId, await request.json());
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from('book_assembly_jobs')
      .insert({
        id: jobId,
        thesis_id: thesisId,
        title: input.title,
        mode: input.mode,
        status: 'queued',
        provider: input.provider,
        model: input.model,
        custom_instructions: input.customInstructions,
        include_cover_page: input.includeCoverPage,
        chapter_selections: input.chapterSelections,
        progress: 1,
        progress_label: 'Preparando a montagem do livro',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Falha ao criar a montagem: ${error?.message || 'erro desconhecido'}`);
    }

    startBookAssemblyJob(jobId);
    return noStoreJson({ job: normalizeBookAssemblyJob(data) }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /não encontrada|não pertence/i.test(message) ? 404 : 400;
    return noStoreJson({ error: message }, { status });
  }
}
