import { supabase } from '@/lib/supabase';
import mammoth from 'mammoth';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export type ReferenceInput = {
  type: 'link' | 'file';
  title: string;
  description?: string;
  url?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

export type ProcessedReference = {
  title: string;
  type: 'link' | 'file';
  content: string;
  error?: string;
};

/**
 * Fetches content from a URL
 */
async function fetchLinkContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChapterAnalyzer/1.0)',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Basic HTML to text conversion (remove tags)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit to first 10000 characters to avoid overwhelming the context
    return text.substring(0, 10000);
  } catch (error: any) {
    throw new Error(`Failed to fetch URL: ${error.message}`);
  }
}

/**
 * Extracts text from a PDF file
 */
async function extractPdfText(filePath: string): Promise<string> {
  // For now, return a placeholder
  // In production, you'd use a library like pdf-parse or pdfjs-dist
  return '[Conteúdo PDF - extração não implementada nesta versão]';
}

/**
 * Extracts text from a DOCX file
 */
async function extractDocxText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.substring(0, 10000); // Limit length
  } catch (error: any) {
    throw new Error(`Failed to extract DOCX text: ${error.message}`);
  }
}

/**
 * Extracts text from a TXT or MD file
 */
async function extractTextFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.substring(0, 10000); // Limit length
  } catch (error: any) {
    throw new Error(`Failed to read text file: ${error.message}`);
  }
}

/**
 * Downloads and extracts content from a file reference
 */
async function processFileReference(
  storagePath: string,
  fileName: string,
  mimeType?: string
): Promise<string> {
  try {
    // Download file from Supabase Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('reference-materials')
      .download(storagePath);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Save to temp file
    const tempDir = os.tmpdir();
    const ext = path.extname(fileName);
    const tempPath = path.join(tempDir, `ref_${Date.now()}${ext}`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    let content: string;

    try {
      // Extract based on file type
      if (mimeType === 'application/pdf' || ext === '.pdf') {
        content = await extractPdfText(tempPath);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ext === '.docx'
      ) {
        content = await extractDocxText(tempPath);
      } else if (mimeType === 'text/plain' || ext === '.txt' || ext === '.md') {
        content = await extractTextFile(tempPath);
      } else {
        throw new Error(`Unsupported file type: ${mimeType || ext}`);
      }
    } finally {
      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});
    }

    return content;
  } catch (error: any) {
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

/**
 * Processes all references and extracts their content
 */
export async function processReferences(
  references: ReferenceInput[]
): Promise<ProcessedReference[]> {
  if (!references || references.length === 0) {
    return [];
  }

  console.log(`[REFERENCE-PROCESSOR] Processing ${references.length} references...`);

  const results: ProcessedReference[] = [];

  for (const ref of references) {
    try {
      let content: string;

      if (ref.type === 'link' && ref.url) {
        console.log(`[REFERENCE-PROCESSOR] Fetching link: ${ref.url}`);
        content = await fetchLinkContent(ref.url);
      } else if (ref.type === 'file' && ref.filePath) {
        console.log(`[REFERENCE-PROCESSOR] Processing file: ${ref.fileName}`);
        content = await processFileReference(ref.filePath, ref.fileName!, ref.mimeType);
      } else {
        throw new Error('Invalid reference: missing required fields');
      }

      results.push({
        title: ref.title,
        type: ref.type,
        content,
      });

      console.log(`[REFERENCE-PROCESSOR] ✓ Processed: ${ref.title}`);
    } catch (error: any) {
      console.error(`[REFERENCE-PROCESSOR] ✗ Failed to process ${ref.title}:`, error.message);
      results.push({
        title: ref.title,
        type: ref.type,
        content: '',
        error: error.message,
      });
    }
  }

  const successCount = results.filter((r) => !r.error).length;
  console.log(`[REFERENCE-PROCESSOR] Completed: ${successCount}/${references.length} successful`);

  return results;
}

/**
 * Formats processed references into a context string for AI prompts
 */
export function formatReferencesForContext(references: ProcessedReference[]): string {
  if (!references || references.length === 0) {
    return '';
  }

  const validReferences = references.filter((r) => !r.error && r.content);
  if (validReferences.length === 0) {
    return '';
  }

  let contextText = '\n\n## MATERIAL DE REFERÊNCIA ADICIONAL\n\n';
  contextText += 'O usuário forneceu os seguintes materiais de referência para contextualizar a análise:\n\n';

  for (const ref of validReferences) {
    contextText += `### ${ref.title} (${ref.type === 'link' ? 'Link Externo' : 'Arquivo'})\n\n`;
    contextText += `${ref.content}\n\n`;
    contextText += '---\n\n';
  }

  return contextText;
}
