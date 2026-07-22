import { NextRequest, NextResponse } from 'next/server';
import { state } from '@/lib/state';
import fs from 'fs/promises';
import path from 'path';

// GET /api/translate/download/[jobId] - Download do documento traduzido
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = state.translations.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Translation job not found' },
        { status: 404 }
      );
    }

    if (job.progress.status !== 'completed' || !job.outputPath) {
      return NextResponse.json(
        { error: 'Translation not completed yet' },
        { status: 400 }
      );
    }

    // Verifica se o arquivo existe
    try {
      await fs.access(job.outputPath);
    } catch {
      return NextResponse.json(
        { error: 'Translated file not found' },
        { status: 404 }
      );
    }

    // Lê o arquivo
    const fileBuffer = await fs.readFile(job.outputPath);
    const fileName = path.basename(job.outputPath);

    // Retorna o arquivo
    return new NextResponse(fileBuffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`
      }
    });

  } catch (error: any) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
