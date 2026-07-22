import { NextRequest, NextResponse } from 'next/server';
import { createOperationJob, executeImproveOperation } from '@/lib/thesis/chapter-operations';
import { AIProvider } from '@/lib/ai/types';
import { supabase } from '@/lib/supabase';

type ReferenceInput = {
  type: 'link' | 'file';
  title: string;
  description?: string;
  url?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chapterId } = await params;
    const body = await req.json();
    const {
      versionId,
      provider = 'openai',
      model = 'gpt-5.4-mini',
      references = [],
      contextVersionIds = []
    }: {
      versionId: string;
      provider?: AIProvider;
      model?: string;
      references?: ReferenceInput[];
      contextVersionIds?: string[];
    } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'Missing required field: versionId' },
        { status: 400 }
      );
    }

    console.log(`[CHAPTER-IMPROVE-API] Starting improve for chapter ${chapterId}, version ${versionId}`);
    console.log(`[CHAPTER-IMPROVE-API] References provided: ${references.length}`);
    console.log(`[CHAPTER-IMPROVE-API] Context chapters: ${contextVersionIds.length}`);

    // Cria job
    const jobId = await createOperationJob(chapterId, versionId, 'improve');

    // Store references in database
    if (references.length > 0) {
      const referencesToInsert = references.map(ref => ({
        job_id: jobId,
        reference_type: ref.type,
        reference_content: ref.type === 'link' ? ref.url : ref.filePath,
        title: ref.title,
        description: ref.description || null,
        file_name: ref.fileName || null,
        file_size: ref.fileSize || null,
        mime_type: ref.mimeType || null,
      }));

      const { error: refError } = await supabase
        .from('operation_references')
        .insert(referencesToInsert);

      if (refError) {
        console.error('[CHAPTER-IMPROVE-API] Error storing references:', refError);
      } else {
        console.log(`[CHAPTER-IMPROVE-API] Stored ${references.length} references`);
      }
    }

    // Executa em background
    executeImproveOperation(jobId, chapterId, versionId, provider, model, references, contextVersionIds).catch(err => {
      console.error('[CHAPTER-IMPROVE-API] Background error:', err);
    });

    return NextResponse.json({
      jobId,
      message: 'Improvement started',
      chapterId,
      versionId,
      referencesCount: references.length,
      contextChaptersCount: contextVersionIds.length
    });

  } catch (error: any) {
    console.error('[CHAPTER-IMPROVE-API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
