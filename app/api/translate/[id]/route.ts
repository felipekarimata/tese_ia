import { NextRequest, NextResponse } from 'next/server';
import { SupportedLanguage } from '@/lib/translation/types';
import { AIProvider } from '@/lib/ai/types';
import { supabase } from '@/lib/supabase';
import { createTranslationJob, executeTranslation } from '@/lib/translation/run-translation';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';

// POST /api/translate/[id] - Inicia tradução
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    // Busca documento no Supabase
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    let body: {
      targetLanguage?: SupportedLanguage;
      sourceLanguage?: SupportedLanguage;
      provider?: AIProvider;
      model?: string;
      maxPages?: number;
      sourceDocumentPath?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const {
      targetLanguage,
      sourceLanguage,
      provider,
      model,
      maxPages,
      sourceDocumentPath // Optional: for pipeline usage
    } = body;

    if (!targetLanguage || !provider || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: targetLanguage, provider, model' },
        { status: 400 }
      );
    }

    const jobId = await createTranslationJob(documentId, {
      documentId,
      targetLanguage,
      sourceLanguage,
      provider,
      model,
      maxPages,
      sourceDocumentPath
    });

    // Executa tradução em background (fire-and-forget)
    executeTranslation(jobId, documentId, doc, {
      documentId,
      targetLanguage,
      sourceLanguage,
      provider,
      model,
      maxPages,
      sourceDocumentPath
    }).catch((err) => console.error('[TRANSLATE] Background job error:', err));

    return NextResponse.json({
      jobId,
      message: 'Translation started',
      documentId
    });

  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// GET /api/translate/[id] - Consulta status da tradução (id aqui é o jobId)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Busca job no Supabase
    const { data: job, error } = await supabase
      .from('translation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return jsonNoStore({ error: 'Translation job not found' }, { status: 404 });
    }

    return jsonNoStore({
      jobId: job.id,
      documentId: job.document_id,
      status: job.status,
      error_message: job.error_message,
      progress: {
        status: job.status,
        currentChunk: job.current_chunk,
        totalChunks: job.total_chunks,
        percentage: job.progress_percentage,
        currentSection: job.current_section,
        error: job.error_message,
        estimatedSecondsRemaining: job.estimated_seconds_remaining,
        elapsedSeconds: job.elapsed_seconds,
        stats: job.stats
      },
      outputPath: job.output_path,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}
