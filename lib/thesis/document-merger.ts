import DocxMerger from 'docx-merger';
import { supabase } from '@/lib/supabase';

export type ChapterSelection = {
  chapterId: string;
  versionId: string;
  chapterOrder: number;
  chapterTitle: string;
  filePath: string;
};

export type MergeOptions = {
  includeCoverPage?: boolean;
  thesisTitle?: string;
  customTitle?: string;
};

/**
 * Downloads a DOCX file from Supabase Storage and returns its buffer
 */
async function downloadDocument(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(filePath);

  if (error || !data) {
    throw new Error(`Failed to download document: ${filePath}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Merges DOCX files using docx-merger to preserve all formatting, images, and structure
 */
async function mergeDocxFiles(buffers: Buffer[]): Promise<Buffer> {
  try {
    console.log(`[DOCUMENT-MERGER] Merging ${buffers.length} documents with docx-merger...`);

    return new Promise((resolve, reject) => {
      const docxMerger = new DocxMerger({}, buffers);

      docxMerger.save('nodebuffer', (data: Buffer) => {
        if (!data) {
          reject(new Error('Failed to generate merged document'));
          return;
        }
        console.log('[DOCUMENT-MERGER] Merge successful, document size:', data.length, 'bytes');
        resolve(data);
      });
    });
  } catch (error) {
    console.error('[DOCUMENT-MERGER] Error merging documents:', error);
    throw new Error('Failed to merge documents');
  }
}

/**
 * Creates a simple cover page DOCX buffer
 */
async function createCoverPageBuffer(thesisTitle: string): Promise<Buffer> {
  const { Document, Paragraph, HeadingLevel, AlignmentType, Packer, PageBreak } = await import('docx');

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: thesisTitle,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: {
            before: 4000,
            after: 2000,
          },
        }),
        new Paragraph({
          text: `Compilado em ${new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}`,
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 4000,
          },
        }),
        new Paragraph({
          children: [new PageBreak()],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Downloads chapter document buffer
 */
async function downloadChapterBuffer(selection: ChapterSelection): Promise<Buffer> {
  console.log(`[DOCUMENT-MERGER] Downloading chapter: ${selection.chapterTitle}`);
  return await downloadDocument(selection.filePath);
}

/**
 * Merges multiple chapter versions into a single DOCX document
 */
export async function mergeChapterVersions(
  selections: ChapterSelection[],
  options: MergeOptions = {}
): Promise<Buffer> {
  console.log('[DOCUMENT-MERGER] Starting merge process...');
  console.log(`[DOCUMENT-MERGER] Merging ${selections.length} chapters`);

  try {
    const buffers: Buffer[] = [];

    // Add cover page if requested
    if (options.includeCoverPage && (options.thesisTitle || options.customTitle)) {
      const title = options.customTitle || options.thesisTitle || 'Tese';
      console.log('[DOCUMENT-MERGER] Creating cover page...');
      const coverBuffer = await createCoverPageBuffer(title);
      buffers.push(coverBuffer);
    }

    // Sort selections by chapter order
    const sortedSelections = [...selections].sort((a, b) => a.chapterOrder - b.chapterOrder);

    // Download all chapter documents
    console.log('[DOCUMENT-MERGER] Downloading chapter documents...');
    for (const selection of sortedSelections) {
      const buffer = await downloadChapterBuffer(selection);
      buffers.push(buffer);
    }

    console.log(`[DOCUMENT-MERGER] Downloaded ${buffers.length} documents`);

    // Merge documents
    console.log('[DOCUMENT-MERGER] Merging documents...');
    const mergedBuffer = await mergeDocxFiles(buffers);

    console.log('[DOCUMENT-MERGER] Merge completed successfully');

    return mergedBuffer;
  } catch (error) {
    console.error('[DOCUMENT-MERGER] Merge failed:', error);
    throw error;
  }
}

/**
 * Uploads merged document to Supabase Storage
 */
export async function uploadMergedDocument(
  buffer: Buffer,
  thesisId: string,
  versionId: string
): Promise<string> {
  const storagePath = `theses/${thesisId}/compiled/${versionId}.docx`;

  const { error } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });

  if (error) {
    console.error('[DOCUMENT-MERGER] Upload error:', error);
    throw new Error(`Failed to upload merged document: ${error.message}`);
  }

  console.log(`[DOCUMENT-MERGER] Uploaded to: ${storagePath}`);
  return storagePath;
}

/**
 * Estimates total pages from merged chapters
 */
export function estimateTotalPages(selections: ChapterSelection[]): number {
  // This is a simple estimation based on the sum of individual chapter pages
  // In reality, page numbers might change due to formatting adjustments
  return selections.reduce((total, sel) => {
    // We'll need to pass page count in the selection
    return total;
  }, 0);
}
