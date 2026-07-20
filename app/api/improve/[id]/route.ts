import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonNoStore } from '@/lib/json-no-store-response';

export const dynamic = 'force-dynamic';
import { extractDocumentStructure, generateGlobalContext } from '@/lib/improvement/document-analyzer';
import { analyzeSectionForImprovements } from '@/lib/improvement/section-analyzer';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// POST /api/improve/[id] - Inicia análise de melhorias
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const {
      provider = 'openai',
      model = 'gpt-5.4-mini',
      sourceDocumentPath // Optional: for pipeline usage
    } = await req.json();

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

    // Cria job no Supabase
    const { data: job, error: jobError } = await supabase
      .from('improvement_jobs')
      .insert({
        document_id: documentId,
        status: 'pending'
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Failed to create improvement job');
    }

    console.log(`[IMPROVE] Created job ${job.id} for document ${documentId}`);

    // Executa análise em background (não bloqueia resposta)
    executeImprovement(job.id, documentId, doc, provider, model, sourceDocumentPath).catch(err => {
      console.error('[IMPROVE] Background error:', err);
    });

    return NextResponse.json({ jobId: job.id });

  } catch (error: any) {
    console.error('[IMPROVE] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// GET /api/improve/[id] - Verifica status da análise
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const { data: job, error } = await supabase
      .from('improvement_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return jsonNoStore({ error: 'Job not found' }, { status: 404 });
    }

    return jsonNoStore({
      jobId: job.id,
      documentId: job.document_id,
      status: job.status,
      progress: {
        currentSection: job.current_section || 0,
        totalSections: job.total_sections || 0,
        percentage: job.progress_percentage || 0
      },
      globalContext: job.global_context || {},
      suggestions: job.suggestions || [],
      error: job.error_message,
      createdAt: job.created_at,
      completedAt: job.completed_at
    });
  } catch (error: any) {
    console.error('[IMPROVE] Error:', error);
    return jsonNoStore({ error: error.message }, { status: 500 });
  }
}

/**
 * Executa análise de melhorias em background
 */
async function executeImprovement(
  jobId: string,
  documentId: string,
  doc: any,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  sourceDocumentPath?: string
) {
  try {
    console.log(`[IMPROVE] Starting analysis for job ${jobId}`);

    // Atualiza status
    await supabase
      .from('improvement_jobs')
      .update({ status: 'analyzing', started_at: new Date().toISOString() })
      .eq('id', jobId);

    let tempPath: string;

    if (sourceDocumentPath) {
      // Pipeline mode - use provided path directly
      console.log(`[IMPROVE] Using source document from pipeline: ${sourceDocumentPath}`);
      tempPath = sourceDocumentPath;
    } else {
      // Standalone mode - download from Storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (downloadError || !fileBlob) {
        throw new Error(`Failed to download: ${downloadError?.message}`);
      }

      const tempDir = os.tmpdir();
      tempPath = path.join(tempDir, `${jobId}_${documentId}_improve.docx`);
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempPath, buffer);
    }

    // Extrai estrutura do documento
    console.log(`[IMPROVE] Extracting structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(tempPath);

    // Gera contexto global
    console.log(`[IMPROVE] Generating global context...`);
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    const contextProvider: 'openai' | 'gemini' | 'anthropic' =
      provider === 'anthropic' ? 'anthropic' : provider === 'openai' ? 'openai' : 'gemini';

    const globalContext = await generateGlobalContext(
      paragraphs,
      structure,
      contextProvider,
      model,
      apiKey
    );

    // Atualiza job com estrutura e contexto
    await supabase
      .from('improvement_jobs')
      .update({
        global_context: globalContext,
        document_structure: structure,
        total_sections: structure.sections.length
      })
      .eq('id', jobId);

    console.log(`[IMPROVE] Analyzing ${structure.sections.length} sections...`);

    // Analisa cada seção
    const allSuggestions: any[] = [];
    const BATCH_SIZE = 20; // Máximo de parágrafos por batch

    for (let i = 0; i < structure.sections.length; i++) {
      const section = structure.sections[i];
      const sectionParagraphs = paragraphs
        .slice(section.startParagraphIndex, section.endParagraphIndex + 1)
        .filter(p => !p.isHeader)
        .map(p => p.text);

      console.log(`[IMPROVE] Analyzing section ${i + 1}/${structure.sections.length}: "${section.title.substring(0, 50)}" (${sectionParagraphs.length} paragraphs)`);

      // Se seção é grande, divide em batches menores
      if (sectionParagraphs.length > BATCH_SIZE) {
        console.log(`[IMPROVE] Section is large, splitting into batches of ${BATCH_SIZE} paragraphs`);

        for (let batchStart = 0; batchStart < sectionParagraphs.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, sectionParagraphs.length);
          const batch = sectionParagraphs.slice(batchStart, batchEnd);

          console.log(`[IMPROVE] Analyzing batch ${batchStart}-${batchEnd} (${batch.length} paragraphs)`);

          const suggestions = await analyzeSectionForImprovements(
            batch,
            globalContext,
            section.title,
            section.startParagraphIndex + batchStart,
            contextProvider,
            model,
            apiKey
          );

          allSuggestions.push(...suggestions);
        }
      } else {
        // Seção pequena, processa de uma vez
        const suggestions = await analyzeSectionForImprovements(
          sectionParagraphs,
          globalContext,
          section.title,
          section.startParagraphIndex,
          contextProvider,
          model,
          apiKey
        );

        allSuggestions.push(...suggestions);
      }

      // Atualiza progresso
      const percentage = Math.round(((i + 1) / structure.sections.length) * 100);
      await supabase
        .from('improvement_jobs')
        .update({
          current_section: i + 1,
          progress_percentage: percentage
        })
        .eq('id', jobId);
    }

    // Finaliza job
    console.log(`[IMPROVE] Analysis completed! ${allSuggestions.length} suggestions found`);
    await supabase
      .from('improvement_jobs')
      .update({
        status: 'completed',
        suggestions: allSuggestions,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Limpa arquivo temporário
    try {
      await fs.unlink(tempPath);
    } catch {}

  } catch (error: any) {
    console.error('[IMPROVE] Error:', error);
    await supabase
      .from('improvement_jobs')
      .update({
        status: 'error',
        error_message: error.message
      })
      .eq('id', jobId);
  }
}
