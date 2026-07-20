import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

/**
 * GET /api/extract-text?bucket=documents&path=file.docx
 * Extrai texto de um DOCX no Supabase Storage
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const bucket = searchParams.get('bucket');
    const filePath = searchParams.get('path');

    if (!bucket || !filePath) {
      return NextResponse.json(
        { error: 'Missing bucket or path parameter' },
        { status: 400 }
      );
    }

    console.log(`[EXTRACT] Fetching ${filePath} from bucket ${bucket}`);

    // Download do Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (error || !data) {
      console.error('[EXTRACT] Error:', error);
      return NextResponse.json(
        { error: `Failed to download file: ${error?.message}` },
        { status: 404 }
      );
    }

    // Converte Blob para Buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const format = searchParams.get('format') || 'text'; // 'text' or 'html'

    if (format === 'html') {
      // Extrai como HTML mantendo formatação
      const result = await mammoth.convertToHtml({ buffer });
      const html = result.value;
      const text = result.value.replace(/<[^>]*>/g, ''); // Remove tags para stats

      console.log(`[EXTRACT] Extracted as HTML`);

      return NextResponse.json({
        html,
        text,
        stats: {
          totalChars: text.length,
          totalWords: text.split(/\s+/).filter(w => w.length > 0).length
        }
      });
    }

    // Extrai texto usando mammoth
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // Divide em parágrafos (separados por quebras de linha duplas ou simples)
    const paragraphs = text
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    console.log(`[EXTRACT] Extracted ${paragraphs.length} paragraphs`);

    return NextResponse.json({
      text,
      paragraphs,
      stats: {
        totalChars: text.length,
        totalWords: text.split(/\s+/).filter(w => w.length > 0).length,
        totalParagraphs: paragraphs.length
      }
    });

  } catch (error: any) {
    console.error('Extract text error:', error);
    return NextResponse.json(
      { error: `Extraction failed: ${error.message}` },
      { status: 500 }
    );
  }
}
