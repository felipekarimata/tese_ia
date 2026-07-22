import fs from 'fs/promises';
import JSZip from 'jszip';
import { NormReference } from '@/lib/norms-update/types';

export async function applyNormUpdatesToDocx(
  inputPath: string,
  outputPath: string,
  references: NormReference[]
): Promise<{ appliedCount: number; totalCount: number }> {
  const data = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(data);

  const file = zip.file('word/document.xml');
  if (!file) throw new Error('document.xml not found');

  let xmlContent = (await file.async('string')).normalize('NFC');
  const sortedReferences = [...references].sort((a, b) => b.paragraphIndex - a.paragraphIndex);

  let appliedCount = 0;
  for (const ref of sortedReferences) {
    if (!ref.suggestedText) continue;

    const escapedOriginal = ref.fullText
      .normalize('NFC')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedOriginal, 'g');

    if (regex.test(xmlContent)) {
      xmlContent = xmlContent.replace(regex, ref.suggestedText.normalize('NFC'));
      appliedCount++;
    }
  }

  zip.file('word/document.xml', Buffer.from(xmlContent, 'utf-8'));
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  await fs.writeFile(outputPath, outputBuffer);

  return { appliedCount, totalCount: sortedReferences.length };
}
