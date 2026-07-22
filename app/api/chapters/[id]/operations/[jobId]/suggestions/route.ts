import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractTextsFromDocx } from '@/lib/translation/docx-translator';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: chapterId, jobId } = await params;

    console.log(`[SUGGESTIONS-API] Fetching suggestions for job: ${jobId}`);

    // Busca job
    const { data: job, error: jobError } = await supabase
      .from('chapter_operation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('chapter_id', chapterId)
      .single();

    if (jobError || !job) {
      console.error('[SUGGESTIONS-API] Job not found:', jobError);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job not completed yet' },
        { status: 400 }
      );
    }

    // Busca versão original
    const { data: version, error: versionError } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', job.version_id)
      .single();

    if (versionError || !version) {
      console.error('[SUGGESTIONS-API] Version not found:', versionError);
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Baixa arquivo original do Storage para extrair texto completo
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(version.file_path);

    if (downloadError || !fileBlob) {
      console.error('[SUGGESTIONS-API] Download error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Salva arquivo temporário
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `${job.version_id}_temp.docx`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    console.log('[SUGGESTIONS-API] Extracting text from DOCX...');

    // Extrai texto completo do documento
    const extractResult = await extractTextsFromDocx(tempPath);
    console.log('[SUGGESTIONS-API] Extract result:', {
      hasTextElements: !!extractResult.textElements,
      textElementsLength: extractResult.textElements?.length,
      firstElement: extractResult.textElements?.[0]
    });

    const { textElements } = extractResult;
    const fullText = textElements
      .map(el => el.originalText)
      .filter(text => text && typeof text === 'string' && text.trim().length > 0)
      .join('\n\n');

    console.log(`[SUGGESTIONS-API] Extracted ${fullText.length} characters from document`);

    // Limpa arquivo temporário
    await fs.unlink(tempPath);

    // Extrai sugestões do metadata do job
    const metadata = job.metadata || {};
    const suggestions = metadata.suggestions || [];

    console.log(`[SUGGESTIONS-API] Found ${suggestions.length} suggestions`);

    // Calcula posição de cada sugestão no texto completo
    const suggestionsWithPositions = suggestions.map((sug: any) => {
      const position = fullText.indexOf(sug.originalText);

      if (position !== -1) {
        return {
          ...sug,
          position: {
            start: position,
            end: position + sug.originalText.length
          }
        };
      }

      // Se não encontrou posição exata, retorna sem position
      console.warn(`[SUGGESTIONS-API] Could not find position for: "${sug.originalText.substring(0, 50)}..."`);
      return sug;
    });

    return NextResponse.json({
      suggestions: suggestionsWithPositions,
      fullText,
      job: {
        id: job.id,
        operation: job.operation,
        status: job.status,
        progress: job.progress
      }
    });

  } catch (error: any) {
    console.error('[SUGGESTIONS-API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
