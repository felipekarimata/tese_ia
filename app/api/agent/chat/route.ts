import { NextRequest, NextResponse } from 'next/server';
import { chatWithAgent, type SimpleMessage } from '@/lib/ai/agent-chat';
import { AIProvider } from '@/lib/ai/types';
import { buildDocumentContext } from '@/lib/document-processing/context';
import {
  formatBookContextForPrompt,
  resolveBookContextForChapter,
  resolveChapterIdForVersion,
} from '@/lib/books/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Agent chat — classifies the user message into "chat" or "edit" and replies.
 *
 * Returns either:
 *   { kind: 'chat', reply: string }
 *   { kind: 'edit', reply: string, editPrompt: string }
 *
 * The AI is instructed to ALWAYS respond with strict JSON in that shape.
 * If the AI breaks format, we fall back to treating the raw text as a chat reply.
 */

type ChatBody = {
  provider: AIProvider;
  model: string;
  documentTitle?: string;
  documentText: string;
  chapterId?: string;
  versionId?: string;
  documentId?: string;
  history: SimpleMessage[];
  userMessage: string;
};

function buildSystemPrompt(
  documentTitle: string | undefined,
  documentText: string,
  contextMode: string,
  bookContext?: string
): string {
  return `Você é um assistente especializado em ajudar o usuário a trabalhar com um documento acadêmico.

==== DOCUMENTO ATUAL${documentTitle ? `: ${documentTitle}` : ''} (modo: ${contextMode}) ====
${documentText}
==== FIM DO DOCUMENTO ====

${bookContext || ''}

REGRAS DE RESPOSTA — MUITO IMPORTANTE:

Sua tarefa é classificar a mensagem do usuário em uma de duas categorias e responder em JSON estrito.

1) "chat" — quando o usuário faz uma PERGUNTA sobre o documento, pede uma EXPLICAÇÃO, RESUMO ou esclarecimento, conversa sobre o tema, ou faz qualquer interação que NÃO requer modificar o texto do documento. Você responde a pergunta de forma clara, baseada no conteúdo do documento.

2) "edit" — quando o usuário pede para MODIFICAR, REESCREVER, EXPANDIR, REDUZIR, AJUSTAR, ADICIONAR algo ao documento, ou qualquer outra ação que envolva produzir uma NOVA versão do texto. Nesse caso, não execute a edição agora — apenas confirme em "reply" o que entendeu e formule em "editPrompt" uma instrução clara e precisa que será aplicada depois.

Exemplos:
- "qual o tema deste capítulo?" → chat
- "do que se trata?" → chat
- "resuma a introdução" → chat (é uma pergunta sobre conteúdo, não pede mudança no documento)
- "explique o conceito de X" → chat
- "adicione mais exemplos na conclusão" → edit
- "expandir o capítulo 2" → edit
- "tornar a introdução mais clara" → edit
- "remover o jargão técnico" → edit
- "reescrever o parágrafo sobre Y" → edit

FORMATO DE RESPOSTA (responda APENAS este JSON, nada antes ou depois):

{
  "kind": "chat" | "edit",
  "reply": "Sua resposta para o usuário em português. Se for chat, responda a pergunta diretamente. Se for edit, confirme o que entendeu e diga que vai aplicar.",
  "editPrompt": "(somente se kind == 'edit') instrução final, clara e específica para o sistema aplicar — em primeira pessoa do imperativo, ex: 'Adicionar três exemplos práticos na conclusão sobre...' "
}

Não inclua markdown, não use blocos de código. Apenas o JSON cru.`;
}

function safeParseJSON(raw: string): { kind: 'chat' | 'edit'; reply: string; editPrompt?: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = stripped.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && (parsed.kind === 'chat' || parsed.kind === 'edit') && typeof parsed.reply === 'string') {
      return {
        kind: parsed.kind,
        reply: parsed.reply,
        editPrompt: typeof parsed.editPrompt === 'string' ? parsed.editPrompt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatBody = await req.json();
    const {
      provider,
      model,
      documentText,
      documentTitle,
      history,
      userMessage,
      chapterId: requestedChapterId,
      versionId,
      documentId,
    } = body;

    if (!provider || !model) {
      return NextResponse.json({ error: 'Missing provider or model' }, { status: 400 });
    }
    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'Empty user message' }, { status: 400 });
    }

    const ctx = await buildDocumentContext({
      documentText: documentText || '',
      documentTitle,
      versionId,
      documentId,
      query: userMessage.trim(),
    });
    const chapterId = requestedChapterId || (versionId ? await resolveChapterIdForVersion(versionId) : null);
    const related = chapterId
      ? await resolveBookContextForChapter(chapterId, {
          query: userMessage.trim(),
          maxChars: 16_000,
        })
      : null;

    const systemPrompt = buildSystemPrompt(
      documentTitle,
      ctx.text,
      ctx.modeUsed,
      formatBookContextForPrompt(related)
    );

    console.log(
      `[AGENT-CHAT] provider=${provider} model=${model} mode=${ctx.modeUsed} truncated=${ctx.truncated} book=${related?.bookId || 'none'} (msg: "${userMessage.slice(0, 60)}...")`
    );

    let raw = '';
    try {
      raw = await chatWithAgent({
        provider,
        model,
        systemPrompt,
        history: (history || []).slice(-10),
        userMessage: userMessage.trim(),
      });
    } catch (e: any) {
      console.error(`[AGENT-CHAT] provider=${provider} failed:`, e.message);
      return NextResponse.json({ error: e.message || 'AI call failed' }, { status: 500 });
    }

    console.log(`[AGENT-CHAT] provider=${provider} model=${model} responded ${raw.length} chars`);

    const parsed = safeParseJSON(raw);
    if (parsed) {
      return NextResponse.json(parsed);
    }

    return NextResponse.json({ kind: 'chat', reply: raw.trim() || 'Não consegui processar a resposta.' });
  } catch (error: any) {
    console.error('[AGENT-CHAT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
