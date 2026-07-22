import { NextRequest, NextResponse } from 'next/server';
import { createOperationJob, executeAdjustOperation } from '@/lib/thesis/chapter-operations';
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
      instructions,
      creativity = 5,
      provider = 'openai',
      model = 'gpt-5.4-mini',
      useGrounding = false,
      references = [],
      contextVersionIds = []
    }: {
      versionId: string;
      instructions: string;
      creativity?: number;
      provider?: AIProvider;
      model?: string;
      useGrounding?: boolean;
      references?: ReferenceInput[];
      contextVersionIds?: string[];
    } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: 'Missing required field: versionId' },
        { status: 400 }
      );
    }

    if (!instructions || instructions.trim() === '') {
      return NextResponse.json(
        { error: 'Instructions are required' },
        { status: 400 }
      );
    }

    console.log(`[CHAPTER-ADJUST-API] Starting adjust for chapter ${chapterId}, version ${versionId}`);
    console.log(`[CHAPTER-ADJUST-API] Instructions: ${instructions.substring(0, 100)}...`);
    console.log(`[CHAPTER-ADJUST-API] Creativity: ${creativity}`);
    console.log(`[CHAPTER-ADJUST-API] Provider: ${provider}, Model: ${model}`);
    console.log(`[CHAPTER-ADJUST-API] Use Grounding: ${useGrounding}`);
    console.log(`[CHAPTER-ADJUST-API] References provided: ${references.length}`);
    console.log(`[CHAPTER-ADJUST-API] Context chapters: ${contextVersionIds.length}`);

    // Cria job
    const jobId = await createOperationJob(chapterId, versionId, 'adjust');

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
        console.error('[CHAPTER-ADJUST-API] Error storing references:', refError);
      } else {
        console.log(`[CHAPTER-ADJUST-API] Stored ${references.length} references`);
      }
    }

    // Executa em background
    executeAdjustOperation(
      jobId,
      chapterId,
      versionId,
      instructions,
      creativity,
      provider,
      model,
      references,
      useGrounding,
      contextVersionIds
    ).catch(err => {
      console.error('[CHAPTER-ADJUST-API] Background error:', err);
    });

    return NextResponse.json({
      jobId,
      message: 'Adjust operation started',
      chapterId,
      versionId,
      referencesCount: references.length,
      contextChaptersCount: contextVersionIds.length
    });

  } catch (error: any) {
    console.error('[CHAPTER-ADJUST-API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
