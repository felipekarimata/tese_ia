import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';

export type ParseResult = {
  text: string;
  pages: number;
};

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  const data = await pdf(buffer);

  return {
    text: data.text,
    pages: data.numpages
  };
}

export async function parseDOCX(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  // Estimativa de páginas (aproximadamente 500 palavras por página)
  const wordCount = text.split(/\s+/).length;
  const estimatedPages = Math.max(1, Math.ceil(wordCount / 500));

  return {
    text,
    pages: estimatedPages
  };
}

export async function parseTXT(buffer: Buffer): Promise<ParseResult> {
  const text = buffer.toString('utf-8');

  // Estimativa de páginas (aproximadamente 500 palavras por página)
  const wordCount = text.split(/\s+/).length;
  const estimatedPages = Math.max(1, Math.ceil(wordCount / 500));

  return {
    text,
    pages: estimatedPages
  };
}

/**
 * Parse document from Buffer.
 * Accepts buffer + fileName to determine file type.
 */
export async function parseDocument(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const ext = path.extname(fileName).toLowerCase();

  switch (ext) {
    case '.pdf':
      return parsePDF(buffer);
    case '.docx':
      return parseDOCX(buffer);
    case '.txt':
      return parseTXT(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
