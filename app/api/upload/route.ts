import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const documentId = randomUUID();

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const ext = path.extname(file.name).toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF, DOCX, and TXT are allowed.' },
        { status: 400 }
      );
    }

    // Prepare file for upload
    const fileName = `${documentId}${ext}`;
    const storagePath = `uploads/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log(`[Upload] File uploaded to Storage: ${storagePath}`);

    return NextResponse.json({
      documentId,
      fileName: file.name,
      filePath: storagePath, // Agora é caminho do Storage, não filesystem
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }
}
