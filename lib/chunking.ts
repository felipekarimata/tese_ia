import { Chunk } from './state';

export type ChunkingOptions = {
  minSize?: number;
  maxSize?: number;
  overlap?: number;
};

// Faz chunking do texto com overlap
export function chunkText(
  text: string,
  totalPages: number,
  options: ChunkingOptions = {}
): Chunk[] {
  const { minSize = 900, maxSize = 1200, overlap = 200 } = options;

  const chunks: Chunk[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + maxSize, text.length);

    // Tenta quebrar em uma quebra de linha ou espaço
    if (endPos < text.length) {
      const lastNewline = text.lastIndexOf('\n', endPos);
      const lastSpace = text.lastIndexOf(' ', endPos);

      if (lastNewline > currentPos + minSize) {
        endPos = lastNewline;
      } else if (lastSpace > currentPos + minSize) {
        endPos = lastSpace;
      }
    }

    const chunkText = text.substring(currentPos, endPos).trim();

    if (chunkText.length > 0) {
      // Estimativa simples de página baseada na posição
      const pageProgress = currentPos / text.length;
      const pageFrom = Math.max(1, Math.floor(pageProgress * totalPages) + 1);
      const pageTo = Math.min(totalPages, Math.ceil((endPos / text.length) * totalPages) + 1);

      chunks.push({
        ix: chunkIndex++,
        pageFrom,
        pageTo,
        text: chunkText
      });
    }

    currentPos = endPos - overlap;
    if (currentPos <= 0 || endPos >= text.length) break;
  }

  return chunks;
}
