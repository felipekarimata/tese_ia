/**
 * Document-level Multi-IA orchestrator (projects agent).
 * Stores candidate outputs in storage; accept persists winner as document version.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { persistDocumentVersion, archiveDocumentCandidate } from '@/lib/document-versioning';
import {
  createMulti3Session,
  getMulti3Session,
  updateMulti3Session,
  patchMulti3Candidate,
  claimMulti3Execution,
  multi3DefaultModel,
  isMulti3SessionStale,
} from './session-store';
import { judgeMulti3Results } from './judge';
import { Multi3StartRequest, Multi3Session, Multi3Candidate } from './types';
import { AIProvider } from '@/lib/ai/types';
import { chatWithAgent } from '@/lib/ai/agent-chat';
import { buildDocumentContext } from '@/lib/document-processing/context';
import { runTransformWithMode } from '@/lib/document-processing/run-transform';
import { extractDocumentStructure } from '@/lib/improvement/document-analyzer';
import { runTodosPipeline as runDocumentTodosPipeline } from '@/lib/todos/run-document-todos-pipeline';
import { multi3CancelCheck, isCancelledError } from './cancel';
import { getMulti3FailureMessage } from './errors';
import { sanitizeMulti3Models } from './models';
import { CANCELLATION_MARKER } from '@/lib/job-cancellation';

async function downloadDocumentFile(documentId: string, filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').download(filePath);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  const tmp = path.join(os.tmpdir(), `${documentId}_${randomUUID()}.docx`);
  await fs.writeFile(tmp, Buffer.from(await data.arrayBuffer()));
  return tmp;
}

export async function startDocumentMulti3(
  documentId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  const models = sanitizeMulti3Models(req.providers, req.models || {});

  const session = await createMulti3Session('document', documentId, { ...req, models });
  return session;
}

export async function executeDocumentMulti3Session(
  documentId: string,
  sessionId: string
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  if (['accepted', 'failed', 'awaiting_human'].includes(session.status)) {
    return session;
  }

  const claimed = await claimMulti3Execution(sessionId);
  if (!claimed) {
    const current = await getMulti3Session(sessionId);
    if (!current) throw new Error('Sessão não encontrada');

    if (isMulti3SessionStale(current)) {
      await updateMulti3Session(sessionId, { status: 'running' });
      const reclaimed = await claimMulti3Execution(sessionId);
      if (!reclaimed) throw new Error('Não foi possível retomar o processamento Multi-IA travado');
    } else if (['processing', 'candidates_ready', 'judging'].includes(current.status)) {
      return current;
    } else {
      throw new Error('Não foi possível iniciar o processamento Multi-IA');
    }
  }

  const req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> } = {
    providers: session.providers,
    judgeProvider: session.judgeProvider,
    command: session.command,
    args: session.commandArgs,
    versionId: session.parentVersionId || documentId,
    models: Object.fromEntries(
      session.candidates.map((c) => [c.provider, c.model])
    ) as Partial<Record<AIProvider, string>>,
  };

  try {
    await runDocumentMulti3Pipeline(documentId, sessionId, req);
  } catch (err) {
    console.error(`[DOC-MULTI3 ${sessionId}]`, err);
    if (isCancelledError(err)) {
      await updateMulti3Session(sessionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        judgeReasoning: `${CANCELLATION_MARKER} Cancelado pelo usuário.`,
      });
    } else {
      await updateMulti3Session(sessionId, { status: 'failed', completedAt: new Date().toISOString() });
    }
    throw err;
  }

  const updated = await getMulti3Session(sessionId);
  return updated!;
}

async function runDocumentMulti3Pipeline(
  documentId: string,
  sessionId: string,
  req: Multi3StartRequest & { models: Partial<Record<AIProvider, string>> }
): Promise<void> {
  const { data: doc } = await supabase.from('documents').select('*').eq('id', documentId).single();
  if (!doc) throw new Error('Document not found');

  const candidates = await Promise.all(
    req.providers.map(async (provider, branchIndex) => {
      multi3CancelCheck(sessionId)();
      const model = req.models?.[provider] || multi3DefaultModel(provider);
      await patchMulti3Candidate(sessionId, branchIndex, {
        provider,
        model,
        status: 'running',
        branchIndex,
        progress: 5,
        progressLabel: 'Iniciando...',
      });

      const done = async (candidate: Multi3Candidate) => {
        await patchMulti3Candidate(sessionId, branchIndex, candidate);
        return candidate;
      };

      try {
        if (req.command === '/perguntar') {
          const tmp = await downloadDocumentFile(documentId, doc.file_path);
          let docText = '';
          try {
            const { paragraphs } = await extractDocumentStructure(tmp);
            docText = paragraphs.map((p) => p.text).join('\n\n');
          } finally {
            await fs.unlink(tmp).catch(() => {});
          }
          const ctx = await buildDocumentContext({
            documentText: docText,
            documentId,
            query: req.args || '',
          });
          const text = await chatWithAgent({
            provider,
            model,
            systemPrompt: `Responda perguntas sobre o documento em português. Modo de contexto: ${ctx.modeUsed}.`,
            history: [],
            userMessage: `Documento:\n${ctx.text}\n\nPergunta: ${req.args}`,
          });
          return done({ provider, model, status: 'completed' as const, text, branchIndex, progress: 100 });
        }

        if (req.command === '/todos') {
          const todosResult = await runDocumentTodosPipeline(documentId, doc, {
            provider,
            model,
            targetLanguage: 'pt',
            adaptStyle: 'simplified',
            multi3Meta: { multi3SessionId: sessionId, multi3Provider: provider, multi3BranchIndex: branchIndex },
            deferPersist: true,
          });
          if (todosResult.finalPath) {
            const buffer = await fs.readFile(todosResult.finalPath);
            const archivedPath = await archiveDocumentCandidate(
              documentId,
              buffer,
              `multi3_todos_${provider}`
            );
            return done({
              provider,
              model,
              status: 'completed' as const,
              text: todosResult.previewText,
              branchIndex,
              progress: 100,
              versionIds: todosResult.stepPaths,
              versionId: archivedPath,
            });
          }
          return done({
            provider,
            model,
            status: 'failed' as const,
            branchIndex,
            error: 'Pipeline /todos não gerou arquivo final',
          });
        }

        const inputPath = await downloadDocumentFile(documentId, doc.file_path);
        const outputPath = path.join(os.tmpdir(), `${randomUUID()}_doc_multi3.docx`);
        try {
          const task = req.command === '/adaptar' ? 'adapt' as const
            : req.command === '/traduzir' ? 'translate' as const
            : 'adjust' as const;

          const transform = await runTransformWithMode(inputPath, outputPath, {
            task,
            provider,
            model,
            adaptStyle: 'simplified',
            adjustInstructions: req.args,
            targetLanguage: 'pt',
          });

          if (transform.runBatches) {
            await fs.copyFile(inputPath, outputPath);
          } else if (!transform.usedWhole) {
            throw new Error(transform.wholeError || 'Falha no processamento');
          }

          const buffer = await fs.readFile(outputPath);
          const archivedPath = await archiveDocumentCandidate(
            documentId,
            buffer,
            `multi3_${req.command.replace('/', '')}_${provider}`
          );

          const { paragraphs } = await extractDocumentStructure(outputPath);
          const preview = paragraphs.map((p) => p.text).join('\n\n').slice(0, 8000);

          return done({
            provider,
            model,
            status: 'completed' as const,
            text: preview,
            branchIndex,
            progress: 100,
            versionId: archivedPath,
          });
        } finally {
          await fs.unlink(inputPath).catch(() => {});
          await fs.unlink(outputPath).catch(() => {});
        }
      } catch (error: any) {
        if (isCancelledError(error)) {
          return done({
            provider,
            model,
            status: 'failed' as const,
            branchIndex,
            error: `${CANCELLATION_MARKER} Cancelado pelo usuário.`,
          });
        }
        return done({ provider, model, status: 'failed' as const, branchIndex, error: error.message });
      }
    })
  );

  await updateMulti3Session(sessionId, { candidates, status: 'candidates_ready' });

  const completed = candidates.filter((c) => c.status === 'completed');
  if (completed.length === 0) {
    await updateMulti3Session(sessionId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      judgeReasoning: getMulti3FailureMessage({ candidates, status: 'failed' }),
    });
    return;
  }

  await updateMulti3Session(sessionId, { status: 'judging' });
  const judgeProvider = req.judgeProvider || 'gemini';
  const judgeModel = req.models?.[judgeProvider] || multi3DefaultModel(judgeProvider);

  const judgeResult = await judgeMulti3Results({
    command: req.command,
    commandArgs: req.args || '',
    judgeProvider,
    judgeModel,
    candidates: completed.map((c) => ({ provider: c.provider, text: c.text || '' })),
  });

  const winner = completed.find((c) => c.provider === judgeResult.winnerProvider) || completed[0];

  await updateMulti3Session(sessionId, {
    winnerProvider: winner.provider,
    winnerVersionId: winner.versionId,
    judgeReasoning: judgeResult.reasoning,
    judgeScores: judgeResult.scores,
    completedAt: new Date().toISOString(),
  });

  await acceptDocumentMulti3Winner(sessionId, winner.provider);
}

export async function acceptDocumentMulti3Winner(
  sessionId: string,
  provider?: AIProvider
): Promise<Multi3Session> {
  const session = await getMulti3Session(sessionId);
  if (!session) throw new Error('Sessão não encontrada');

  const chosen = provider || session.winnerProvider;
  const winner = session.candidates.find((c) => c.provider === chosen && c.status === 'completed');
  if (!winner) throw new Error('Candidato não encontrado');

  if (session.command === '/perguntar' || !winner.versionId) {
    await updateMulti3Session(sessionId, {
      status: 'accepted',
      winnerProvider: chosen,
      completedAt: new Date().toISOString(),
    });
    return (await getMulti3Session(sessionId))!;
  }

  const { data: doc } = await supabase.from('documents').select('*').eq('id', session.targetId).single();
  if (!doc) throw new Error('Document not found');

  const { data: fileBlob } = await supabase.storage.from('documents').download(winner.versionId);
  if (!fileBlob) throw new Error('Arquivo candidato não encontrado');

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  await persistDocumentVersion({
    documentId: session.targetId,
    title: doc.title,
    projectId: doc.project_id,
    buffer,
    operation: `multi3_${session.command.replace('/', '')}`,
  });

  await updateMulti3Session(sessionId, {
    status: 'accepted',
    winnerProvider: chosen,
    completedAt: new Date().toISOString(),
  });

  return (await getMulti3Session(sessionId))!;
}
