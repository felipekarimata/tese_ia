import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { analyzeDocumentForAdjustments } from '@/lib/adjust/processor';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';

/**
 * POST /api/adjust
 * Start adjust operation (can be standalone or part of pipeline)
 */
export async function POST(req: NextRequest) {
  try {
    const {
      documentId,
      sourceDocumentPath, // Optional: for pipeline usage
      instructions,
      creativity = 5,
      provider = 'openai',
      model = 'gpt-5.4-mini',
      useGrounding = false
    }: {
      documentId?: string;
      sourceDocumentPath?: string;
      instructions: string;
      creativity?: number;
      provider?: 'openai' | 'gemini' | 'grok' | 'anthropic';
      model?: string;
      useGrounding?: boolean;
    } = await req.json();

    if (!instructions) {
      return NextResponse.json(
        { error: 'Instructions are required' },
        { status: 400 }
      );
    }

    if (!documentId && !sourceDocumentPath) {
      return NextResponse.json(
        { error: 'Either documentId or sourceDocumentPath is required' },
        { status: 400 }
      );
    }

    // Get document info for standalone mode
    let doc: any = null;
    if (!sourceDocumentPath && documentId) {
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError || !docData) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }
      doc = docData;
    }

    // Create job in database
    const { data: job, error: jobError } = await supabase
      .from('adjust_jobs')
      .insert({
        document_id: documentId || null,
        status: 'pending',
        instructions,
        creativity,
        use_grounding: useGrounding,
        provider,
        model
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Failed to create adjust job');
    }

    console.log(`[ADJUST] Created job ${job.id} for document ${documentId || 'pipeline'}`);

    // Execute in background
    executeAdjust(
      job.id,
      documentId || 'pipeline',
      doc,
      sourceDocumentPath,
      instructions,
      creativity,
      provider,
      model,
      useGrounding
    ).catch(err => {
      console.error('[ADJUST] Background error:', err);
    });

    return NextResponse.json({
      jobId: job.id,
      message: 'Adjust operation started'
    });

  } catch (error: any) {
    console.error('[ADJUST] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Execute adjust operation in background
 */
async function executeAdjust(
  jobId: string,
  documentId: string,
  doc: any,
  sourceDocumentPath: string | undefined,
  instructions: string,
  creativity: number,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string,
  useGrounding: boolean
) {
  try {
    console.log(`[ADJUST ${jobId}] Starting adjustment analysis...`);

    // Update status
    await supabase
      .from('adjust_jobs')
      .update({ status: 'adjusting', started_at: new Date().toISOString() })
      .eq('id', jobId);

    let tempPath: string;

    if (sourceDocumentPath) {
      // Pipeline mode - use provided path directly
      console.log(`[ADJUST ${jobId}] Using source document from pipeline: ${sourceDocumentPath}`);
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
      tempPath = path.join(tempDir, `${jobId}_${documentId}_adjust.docx`);
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempPath, buffer);
    }

    // Extract document structure
    console.log(`[ADJUST ${jobId}] Extracting structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(tempPath);

    // Update job with structure
    await supabase
      .from('adjust_jobs')
      .update({
        document_structure: structure,
        total_sections: structure.sections.length
      })
      .eq('id', jobId);

    console.log(`[ADJUST ${jobId}] Analyzing ${structure.sections.length} sections...`);

    // Get API key
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!
          : provider === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY!
            : process.env.GROK_API_KEY!;

    // Generate adjustment suggestions
    const suggestions = await analyzeDocumentForAdjustments(
      tempPath,
      instructions,
      creativity,
      provider,
      model,
      apiKey,
      useGrounding
    );

    console.log(`[ADJUST ${jobId}] Generated ${suggestions.length} adjustment suggestions`);

    // Save suggestions to database
    await supabase
      .from('adjust_jobs')
      .update({
        status: 'completed',
        suggestions: suggestions,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Clean up temp file if not from pipeline
    if (!tempPath.includes('pipeline_')) {
      try {
        await fs.unlink(tempPath);
      } catch {}
    }

    console.log(`[ADJUST ${jobId}] Completed successfully`);

  } catch (error: any) {
    console.error(`[ADJUST ${jobId}] Error:`, error);
    await supabase
      .from('adjust_jobs')
      .update({
        status: 'error',
        error_message: error.message
      })
      .eq('id', jobId);
  }
}
