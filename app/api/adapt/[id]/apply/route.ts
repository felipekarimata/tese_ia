import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { applySuggestionsToDocx, type ApplyDocxSuggestion } from '@/lib/translation/docx-translator';

/**
 * POST /api/adapt/[id]/apply - Apply accepted adaptations to document
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { acceptedSuggestionIds }: { acceptedSuggestionIds: string[] } = await req.json();

    if (!acceptedSuggestionIds || acceptedSuggestionIds.length === 0) {
      return NextResponse.json(
        { error: 'No suggestions selected' },
        { status: 400 }
      );
    }

    // Get job from database
    const { data: job, error: jobError } = await supabase
      .from('adapt_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Adapt job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job not completed yet' },
        { status: 400 }
      );
    }

    // Get original document
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', job.document_id)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Filter accepted suggestions
    const allSuggestions: any[] = job.suggestions || [];
    const acceptedSuggestions = allSuggestions.filter((s: any) =>
      acceptedSuggestionIds.includes(s.id)
    );

    console.log(`[ADAPT-APPLY] Applying ${acceptedSuggestions.length} adaptations`);

    // Download original file
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `${jobId}_${job.document_id}_original.docx`);
    const tempOutputPath = path.join(tempDir, `${jobId}_${job.document_id}_adapted.docx`);

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempInputPath, buffer);

    // Apply adaptations using the same function as translations
    const suggestionsForDocx: ApplyDocxSuggestion[] = acceptedSuggestions.map((s: any) => ({
      id: s.id,
      originalText: s.originalText || '',
      improvedText: s.adaptedText || ''
    }));

    const applyResult = await applySuggestionsToDocx(tempInputPath, tempOutputPath, suggestionsForDocx);
    console.log('[ADAPT-APPLY] DOCX apply result:', applyResult);

    // Read adapted file
    const adaptedBuffer = await fs.readFile(tempOutputPath);

    // Clean up temp files
    try {
      await fs.unlink(tempInputPath);
      await fs.unlink(tempOutputPath);
    } catch {}

    // Sanitize filename
    const sanitizedTitle = (doc.title || 'documento')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    return new NextResponse(adaptedBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${sanitizedTitle}_adaptado.docx"`
      }
    });

  } catch (error: any) {
    console.error('[ADAPT-APPLY] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
