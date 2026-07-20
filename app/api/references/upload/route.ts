import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
  'text/markdown',
];

export async function POST(req: NextRequest) {
  try {

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 50MB' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não suportado. Use PDF, DOCX, TXT ou MD' },
        { status: 400 }
      );
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `refs/${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reference-materials')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[REFERENCE-UPLOAD] Storage error:', uploadError);
      return NextResponse.json(
        { error: 'Falha ao fazer upload do arquivo' },
        { status: 500 }
      );
    }

    // Return file metadata
    return NextResponse.json({
      success: true,
      file: {
        path: uploadData.path,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        title: title || file.name,
        description: description || null,
      },
    });
  } catch (error: any) {
    console.error('[REFERENCE-UPLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao fazer upload' },
      { status: 500 }
    );
  }
}
