import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { detectNormsInDocument } from '@/lib/norms-update/norm-detector';
import { verifyMultipleNorms } from '@/lib/norms-update/norm-verifier';
import { NormReference } from '@/lib/norms-update/types';
import { appendNormJobLog } from '@/lib/norms-update/job-log';

// POST /api/norms-update - Inicia análise de normas
export async function POST(req: NextRequest) {
  try {
    const {
      documentId,
      provider = 'gemini',
      model = 'gemini-2.5-flash',
      sourceDocumentPath // Optional: for pipeline usage
    } = await req.json();

    if (!documentId && !sourceDocumentPath) {
      return NextResponse.json(
        { error: 'Document ID or sourceDocumentPath is required' },
        { status: 400 }
      );
    }

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
    const jobId = randomUUID();
    const { error: insertError } = await supabase
      .from('norm_update_jobs')
      .insert({
        id: jobId,
        document_id: documentId,
        status: 'pending',
        norm_references: [],
        total_references: 0,
        vigentes: 0,
        alteradas: 0,
        revogadas: 0,
        substituidas: 0,
        manual_review: 0,
        current_reference: 0,
        progress_percentage: 0,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[NORMS] Error creating job:', insertError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // Inicia processamento em background
    processNormsUpdate(jobId, doc, provider, model, sourceDocumentPath).catch(err => {
      console.error('[NORMS] Background processing error:', err);
    });

    return NextResponse.json({ jobId });

  } catch (error: any) {
    console.error('[NORMS] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Processa atualização de normas em background
 */
async function processNormsUpdate(
  jobId: string,
  doc: any,
  provider: 'openai' | 'gemini' | 'anthropic',
  model: string,
  sourceDocumentPath?: string
) {
  try {
    // Atualiza status para analyzing
    await supabase
      .from('norm_update_jobs')
      .update({
        status: 'analyzing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    await appendNormJobLog(jobId, 'Início da análise de normas');
    console.log(`[NORMS] Starting analysis for job ${jobId}`);

    let tempFilePath: string;

    if (sourceDocumentPath) {
      // Pipeline mode - use provided path
      console.log(`[NORMS] Using source document from pipeline: ${sourceDocumentPath}`);
      await appendNormJobLog(jobId, 'Usando documento do pipeline');
      tempFilePath = sourceDocumentPath;
    } else {
      // Standalone mode - download from Storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (downloadError || !fileBlob) {
        throw new Error(`Failed to download: ${downloadError?.message}`);
      }

      const tempDir = os.tmpdir();
      tempFilePath = path.join(tempDir, `${jobId}_${doc.id}_norms.docx`);
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempFilePath, buffer);
    }

    // Extrai estrutura do documento
    console.log('[NORMS] Extracting document structure...');
    await appendNormJobLog(jobId, 'Extraindo estrutura do documento…');
    const { structure, paragraphs } = await extractDocumentStructure(tempFilePath);

    // Prepara parágrafos com contexto
    const paragraphsWithContext = paragraphs
      .filter(p => !p.isHeader) // Remove headers
      .map((p, idx) => ({
        text: p.text,
        index: p.index,
        chapterTitle: getCurrentChapter(paragraphs, p.index, structure)
      }));

    // Detecta normas no documento
    console.log('[NORMS] Detecting norms...');
    await appendNormJobLog(
      jobId,
      `Detectando normas em ${paragraphsWithContext.length} parágrafo(s)…`
    );
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY!
          : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;

    let references = await detectNormsInDocument(
      paragraphsWithContext,
      provider,
      model,
      apiKey
    );

    console.log(`[NORMS] Found ${references.length} references`);
    await appendNormJobLog(
      jobId,
      references.length === 0
        ? 'Nenhuma referência normativa detectada.'
        : `Detectadas ${references.length} referência(s) normativa(s).`
    );

    // Atualiza job com referências encontradas
    await supabase
      .from('norm_update_jobs')
      .update({
        total_references: references.length,
        progress_percentage: 10
      })
      .eq('id', jobId);

    if (references.length === 0) {
      // Nenhuma norma encontrada
      await supabase
        .from('norm_update_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress_percentage: 100
        })
        .eq('id', jobId);

      await appendNormJobLog(jobId, 'Análise finalizada (sem normas a verificar).');
      await fs.unlink(tempFilePath).catch(() => {});
      return;
    }

    // Verifica status: primeiro LexML/Senado (fontes oficiais), depois IA se necessário
    console.log('[NORMS] Verifying norm statuses (official sources + Gemini/OpenAI)...');
    await appendNormJobLog(
      jobId,
      'Verificando status (fontes oficiais LexML/Senado e IA, se necessário)…'
    );

    let lastLoggedProgressBracket = -1;
    const verifiedReferences = await verifyMultipleNorms(
      references,
      provider,
      model,
      apiKey,
      undefined, // Gemini não precisa de função de web search externa
      async (current: number, total: number) => {
        // Callback de progresso
        const percentage = 10 + Math.floor((current / total) * 90);
        const bracket = Math.floor(percentage / 15);
        if (bracket > lastLoggedProgressBracket || current === total) {
          lastLoggedProgressBracket = bracket;
          await appendNormJobLog(
            jobId,
            `Verificação: ${current}/${total} referências (~${percentage}%)`
          );
        }
        await supabase
          .from('norm_update_jobs')
          .update({
            current_reference: current,
            progress_percentage: percentage
          })
          .eq('id', jobId);
      }
    );

    // Calcula estatísticas
    const stats = calculateStats(verifiedReferences);

    // Salva resultado final
    await supabase
      .from('norm_update_jobs')
      .update({
        status: 'completed',
        norm_references: verifiedReferences,
        vigentes: stats.vigentes,
        alteradas: stats.alteradas,
        revogadas: stats.revogadas,
        substituidas: stats.substituidas,
        manual_review: stats.manual_review,
        progress_percentage: 100,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Limpa arquivo temporário
    await fs.unlink(tempFilePath).catch(() => {});

    await appendNormJobLog(jobId, 'Análise concluída. Revise os resultados e aplique as alterações desejadas.');
    console.log(`[NORMS] Analysis completed for job ${jobId}`);

  } catch (error: any) {
    console.error('[NORMS] Processing error:', error);

    await appendNormJobLog(
      jobId,
      `Erro: ${error.message || String(error)}`,
      'error'
    );
    await supabase
      .from('norm_update_jobs')
      .update({
        status: 'error',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

/**
 * Encontra o capítulo atual para um parágrafo
 */
function getCurrentChapter(
  paragraphs: any[],
  paragraphIndex: number,
  structure: any
): string | undefined {
  const section = structure.sections.find((s: any) =>
    paragraphIndex >= s.startParagraphIndex &&
    paragraphIndex <= s.endParagraphIndex &&
    s.level === 1
  );
  return section?.title;
}

/**
 * Calcula estatísticas das normas
 */
function calculateStats(references: NormReference[]) {
  return {
    vigentes: references.filter(r => r.status === 'vigente').length,
    alteradas: references.filter(r => r.status === 'alterada').length,
    revogadas: references.filter(r => r.status === 'revogada').length,
    substituidas: references.filter(r => r.status === 'substituida').length,
    manual_review: references.filter(r => r.updateType === 'manual').length
  };
}
