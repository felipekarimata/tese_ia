import { NextRequest, NextResponse } from 'next/server';
import { createOperationJob, executeTranslateOperation } from '@/lib/thesis/chapter-operations';
import { AIProvider } from '@/lib/ai/types';
import { SupportedLanguage } from '@/lib/translation/types';
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
      targetLanguage,
      sourceLanguage,
      provider = 'openai',
      model = 'gpt-5.4-mini',
      maxPages,
      references = []
    }: {
      versionId: string;
      targetLanguage: SupportedLanguage;
      sourceLanguage?: SupportedLanguage;
      provider?: AIProvider;
      model?: string;
      maxPages?: number;
      references?: ReferenceInput[];
    } = body;

    if (!versionId || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing required fields: versionId, targetLanguage' },
        { status: 400 }
      );
    }

    console.log(`[CHAPTER-TRANSLATE-API] Starting translation for chapter ${chapterId}, version ${versionId} to ${targetLanguage}`);
    console.log(`[CHAPTER-TRANSLATE-API] References provided: ${references.length}`);

    // Cria job
    const jobId = await createOperationJob(chapterId, versionId, 'translate');

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
        console.error('[CHAPTER-TRANSLATE-API] Error storing references:', refError);
      } else {
        console.log(`[CHAPTER-TRANSLATE-API] Stored ${references.length} references`);
      }
    }

    // Executa em background
    executeTranslateOperation(
      jobId,
      chapterId,
      versionId,
      targetLanguage,
      sourceLanguage,
      provider,
      model,
      maxPages,
      references
    ).catch(err => {
      console.error('[CHAPTER-TRANSLATE-API] Background error:', err);
    });

    return NextResponse.json({
      jobId,
      message: 'Translation started',
      chapterId,
      versionId,
      targetLanguage,
      referencesCount: references.length
    });

  } catch (error: any) {
    console.error('[CHAPTER-TRANSLATE-API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
