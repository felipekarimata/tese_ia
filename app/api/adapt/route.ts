import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { analyzeDocumentForAdaptation } from '@/lib/adapt/processor';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';

/**
 * POST /api/adapt
 * Start adapt operation (adapt document to different style/audience)
 * Can be standalone or part of pipeline
 */
export async function POST(req: NextRequest) {
  try {
    const {
      documentId,
      sourceDocumentPath, // Optional: for pipeline usage
      style = 'simplified',
      targetAudience,
      provider = 'openai',
      model = 'gpt-5.4-mini'
    }: {
      documentId?: string;
      sourceDocumentPath?: string;
      style?: 'academic' | 'professional' | 'simplified' | 'custom';
      targetAudience?: string;
      provider?: 'openai' | 'gemini' | 'grok' | 'anthropic';
      model?: string;
    } = await req.json();

    if (!documentId && !sourceDocumentPath) {
      return NextResponse.json(
        { error: 'Either documentId or sourceDocumentPath is required' },
        { status: 400 }
      );
    }

    if (style === 'custom' && !targetAudience) {
      return NextResponse.json(
        { error: 'targetAudience is required when style is "custom"' },
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
      .from('adapt_jobs')
      .insert({
        document_id: documentId || null,
        status: 'pending',
        style,
        target_audience: targetAudience || null,
        provider,
        model
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Failed to create adapt job');
    }

    console.log(`[ADAPT] Created job ${job.id} for document ${documentId || 'pipeline'}`);

    // Execute in background
    executeAdapt(
      job.id,
      documentId || 'pipeline',
      doc,
      sourceDocumentPath,
      style,
      targetAudience,
      provider,
      model
    ).catch(err => {
      console.error('[ADAPT] Background error:', err);
    });

    return NextResponse.json({
      jobId: job.id,
      message: 'Adapt operation started'
    });

  } catch (error: any) {
    console.error('[ADAPT] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Execute adapt operation in background
 */
async function executeAdapt(
  jobId: string,
  documentId: string,
  doc: any,
  sourceDocumentPath: string | undefined,
  style: 'academic' | 'professional' | 'simplified' | 'custom',
  targetAudience: string | undefined,
  provider: 'openai' | 'gemini' | 'grok' | 'anthropic',
  model: string
) {
  try {
    console.log(`[ADAPT ${jobId}] Starting adaptation analysis...`);

    // Update status
    await supabase
      .from('adapt_jobs')
      .update({ status: 'adapting', started_at: new Date().toISOString() })
      .eq('id', jobId);

    let tempPath: string;

    if (sourceDocumentPath) {
      // Pipeline mode - use provided path directly
      console.log(`[ADAPT ${jobId}] Using source document from pipeline: ${sourceDocumentPath}`);
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
      tempPath = path.join(tempDir, `${jobId}_${documentId}_adapt.docx`);
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempPath, buffer);
    }

    // Extract document structure
    console.log(`[ADAPT ${jobId}] Extracting structure...`);
    const { structure, paragraphs } = await extractDocumentStructure(tempPath);

    // Update job with structure
    await supabase
      .from('adapt_jobs')
      .update({
        document_structure: structure,
        total_sections: structure.sections.length
      })
      .eq('id', jobId);

    console.log(`[ADAPT ${jobId}] Analyzing ${structure.sections.length} sections...`);

    // Get API key
    const apiKey =
      provider === 'openai'
        ? process.env.OPENAI_API_KEY!
        : provider === 'gemini'
          ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!
          : provider === 'anthropic'
            ? process.env.ANTHROPIC_API_KEY!
            : process.env.GROK_API_KEY!;

    // Generate adaptation suggestions
    const suggestions = await analyzeDocumentForAdaptation(
      tempPath,
      style,
      targetAudience,
      provider,
      model,
      apiKey
    );

    console.log(`[ADAPT ${jobId}] Generated ${suggestions.length} adaptation suggestions`);

    // Save suggestions to database
    await supabase
      .from('adapt_jobs')
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

    console.log(`[ADAPT ${jobId}] Completed successfully`);

  } catch (error: any) {
    console.error(`[ADAPT ${jobId}] Error:`, error);
    await supabase
      .from('adapt_jobs')
      .update({
        status: 'error',
        error_message: error.message
      })
      .eq('id', jobId);
  }
}
