import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import JSZip from 'jszip';
import { parseStringPromise, Builder } from 'xml2js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ImprovementSuggestion } from '@/lib/improvement/types';

// POST /api/improve/[id]/apply - Aplica melhorias aceitas ao documento
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

    // Busca job no Supabase
    const { data: job, error: jobError } = await supabase
      .from('improvement_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Improvement job not found' },
        { status: 404 }
      );
    }

    // Busca documento original
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

    // Filtra apenas sugestões aceitas
    const allSuggestions: ImprovementSuggestion[] = job.suggestions || [];
    const acceptedSuggestions = allSuggestions.filter(s =>
      acceptedSuggestionIds.includes(s.id)
    );

    console.log(`[IMPROVE-APPLY] Applying ${acceptedSuggestions.length} improvements`);

    // Download arquivo original
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download: ${downloadError?.message}`);
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `${jobId}_${job.document_id}_original.docx`);
    const tempOutputPath = path.join(tempDir, `${jobId}_${job.document_id}_improved.docx`);

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempInputPath, buffer);

    // Aplica melhorias
    await applyImprovementsToDocx(
      tempInputPath,
      tempOutputPath,
      acceptedSuggestions
    );

    // Retorna arquivo melhorado
    const improvedBuffer = await fs.readFile(tempOutputPath);

    // Limpa arquivos temporários
    try {
      await fs.unlink(tempInputPath);
      await fs.unlink(tempOutputPath);
    } catch {}

    // Sanitize filename to avoid ByteString errors with Unicode characters
    const sanitizedTitle = (doc.title || 'documento')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    return new NextResponse(improvedBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${sanitizedTitle}_melhorado.docx"`
      }
    });

  } catch (error: any) {
    console.error('[IMPROVE-APPLY] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Aplica melhorias ao documento DOCX
 */
async function applyImprovementsToDocx(
  inputPath: string,
  outputPath: string,
  suggestions: ImprovementSuggestion[]
): Promise<void> {
  const data = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(data);

  const file = zip.file('word/document.xml');
  if (!file) throw new Error('document.xml not found');

  let xmlContent = await file.async('string');

  // Ordena sugestões por índice de parágrafo (maior para menor)
  // Isso evita problemas de índices mudando após substituições
  const sortedSuggestions = [...suggestions].sort((a, b) =>
    b.paragraphIndex - a.paragraphIndex
  );

  console.log(`[IMPROVE-APPLY] Applying ${sortedSuggestions.length} suggestions`);

  // Normaliza o XML inteiro primeiro
  xmlContent = xmlContent.normalize('NFC');

  // Aplica cada substituição
  let appliedCount = 0;
  for (const suggestion of sortedSuggestions) {
    // Normaliza os textos das sugestões
    const normalizedOriginal = suggestion.originalText.normalize('NFC');
    const normalizedImproved = suggestion.improvedText.normalize('NFC');

    // Escapa caracteres especiais para regex
    const escapedOriginal = normalizedOriginal
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Procura pelo texto original e substitui
    const regex = new RegExp(escapedOriginal, 'g');
    const matches = xmlContent.match(regex);

    if (matches && matches.length > 0) {
      // Substitui primeira ocorrência (mais seguro)
      xmlContent = xmlContent.replace(regex, normalizedImproved);
      appliedCount++;
      console.log(`[IMPROVE-APPLY] ✓ Applied suggestion ${appliedCount}/${sortedSuggestions.length}`);
    } else {
      console.warn(`[IMPROVE-APPLY] ⚠ Text not found: "${normalizedOriginal.substring(0, 50)}..."`);
    }
  }

  console.log(`[IMPROVE-APPLY] Successfully applied ${appliedCount}/${sortedSuggestions.length} improvements`);

  // Atualiza o XML no ZIP
  zip.file('word/document.xml', Buffer.from(xmlContent, 'utf-8'));

  // Gera novo DOCX
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });
  await fs.writeFile(outputPath, outputBuffer);
}
