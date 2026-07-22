import { NextRequest, NextResponse } from 'next/server';
import { createOperationJob, executeAdaptOperation } from '@/lib/thesis/chapter-operations';
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
      style = 'simplified',
      targetAudience,
      provider = 'openai',
      model = 'gpt-5.4-mini',
      references = [],
      contextVersionIds = []
    }: {
      versionId: string;
      style?: 'academic' | 'professional' | 'simplified' | 'custom';
      targetAudience?: string;
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

    if (style === 'custom' && !targetAudience) {
      return NextResponse.json(
        { error: 'Target audience is required when style is custom' },
        { status: 400 }
      );
    }

    console.log(`[CHAPTER-ADAPT-API] Starting adapt for chapter ${chapterId}, version ${versionId}`);
    console.log(`[CHAPTER-ADAPT-API] Style: ${style}, Target audience: ${targetAudience || 'general'}`);
    console.log(`[CHAPTER-ADAPT-API] References provided: ${references.length}`);
    console.log(`[CHAPTER-ADAPT-API] Context chapters: ${contextVersionIds.length}`);

    // Cria job
    const jobId = await createOperationJob(chapterId, versionId, 'adapt');

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
        console.error('[CHAPTER-ADAPT-API] Error storing references:', refError);
      } else {
        console.log(`[CHAPTER-ADAPT-API] Stored ${references.length} references`);
      }
    }

    // Executa em background
    executeAdaptOperation(
      jobId,
      chapterId,
      versionId,
      style,
      targetAudience,
      provider,
      model,
      references,
      contextVersionIds
    ).catch(err => {
      console.error('[CHAPTER-ADAPT-API] Background error:', err);
    });

    return NextResponse.json({
      jobId,
      message: 'Adapt operation started',
      chapterId,
      versionId,
      style,
      targetAudience,
      referencesCount: references.length,
      contextChaptersCount: contextVersionIds.length
    });

  } catch (error: any) {
    console.error('[CHAPTER-ADAPT-API] Error:', error);
    console.error('[CHAPTER-ADAPT-API] Error stack:', error.stack);
    console.error('[CHAPTER-ADAPT-API] Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
    return NextResponse.json(
      { 
        error: error.message || 'Failed to start adapt operation',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
