import { NextRequest, NextResponse } from 'next/server';
import { searchIndex } from '@/lib/state';
import { executeMultipleAI } from '@/lib/ai/executor';
import { AIProvider } from '@/lib/ai/types';
import { ensureDocumentInMemory } from '@/lib/document-loader';
import { buildMultiChapterContext, determineCitationMode, formatCitation } from '@/lib/thesis/context-builder';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      documentId,
      chapterVersionIds,
      question,
      providers,
      models,
      action
    } = body as {
      documentId?: string;
      chapterVersionIds?: string[];
      question: string;
      providers: AIProvider[];
      models: Partial<Record<AIProvider, string>>;
      action?: 'translate' | 'suggest' | 'adapt' | 'update' | null;
    };

    // Validação: precisa ter ou documentId (sistema antigo) ou chapterVersionIds (sistema novo)
    if ((!documentId && !chapterVersionIds) || !question || !providers || !models) {
      console.error('[CHAT] 400 Error - Missing fields:', {
        documentId: documentId || 'MISSING',
        chapterVersionIds: chapterVersionIds || 'MISSING',
        question: question || 'MISSING',
        providers: providers || 'MISSING',
        models: models || 'MISSING'
      });
      return NextResponse.json(
        { error: 'Missing required fields: (documentId or chapterVersionIds), question, providers, models' },
        { status: 400 }
      );
    }

    let topChunks: any[];
    let citationMode: string | undefined;

    // Sistema novo: múltiplos capítulos
    if (chapterVersionIds && chapterVersionIds.length > 0) {
      console.log(`[CHAT] Multi-chapter mode: ${chapterVersionIds.length} versions`);

      const contextResult = await buildMultiChapterContext(
        { chapter_version_ids: chapterVersionIds, top_k_per_version: 5 },
        question
      );

      if (!contextResult || contextResult.chunks.length === 0) {
        return NextResponse.json(
          { error: 'No relevant context found' },
          { status: 400 }
        );
      }

      // Converte chunks para formato esperado pela AI
      topChunks = contextResult.chunks.map((chunk, index) => ({
        ix: chunk.chunk_index ?? index, // Use chunk_index from database or fallback to array index
        text: chunk.text,
        pageFrom: chunk.page_from,
        pageTo: chunk.page_to,
        metadata: {
          chapterTitle: chunk.chapter_title,
          chapterOrder: chunk.chapter_order,
          versionNumber: chunk.version_number
        }
      }));

      // Determina modo de citação
      citationMode = determineCitationMode(contextResult);

      console.log(`[CHAT] Found ${topChunks.length} chunks from ${contextResult.chapters_included.length} chapters`);
      console.log(`[CHAT] Citation mode: ${citationMode}`);
      console.log(`[CHAT] Sample chunk structure:`, topChunks[0] ? {
        hasIx: 'ix' in topChunks[0],
        hasText: 'text' in topChunks[0],
        hasPageFrom: 'pageFrom' in topChunks[0],
        hasMetadata: 'metadata' in topChunks[0]
      } : 'No chunks');

    }
    // Sistema antigo: documento único
    else if (documentId) {
      console.log(`[CHAT] Single document mode: ${documentId}`);

      const doc = await ensureDocumentInMemory(documentId);

      if (!doc) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }

      topChunks = searchIndex(doc.index, doc.chunks, question, 8);

      if (topChunks.length === 0) {
        return NextResponse.json(
          { error: 'No relevant context found' },
          { status: 400 }
        );
      }
    }

    // Execute AI requests
    console.log(`[CHAT] Executing AI requests with ${topChunks.length} chunks for ${providers.length} provider(s)`);
    
    const answers = await executeMultipleAI(providers, models, {
      question,
      context: topChunks,
      action: action ?? null,
      citationMode
    });

    console.log(`[CHAT] ✅ Received ${answers.length} answer(s) from AI providers`);

    return NextResponse.json({ answers, citationMode });
  } catch (error: any) {
    console.error('[CHAT] Error:', error);
    return NextResponse.json(
      { error: `Chat failed: ${error.message}` },
      { status: 500 }
    );
  }
}
