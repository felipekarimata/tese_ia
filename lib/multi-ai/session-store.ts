import { supabase } from '@/lib/supabase';
import {
  Multi3Session,
  Multi3Candidate,
  Multi3SessionStatus,
  Multi3StartRequest,
  Multi3Command,
  DEFAULT_JUDGE_PROVIDER,
} from './types';
import { AIProvider } from '@/lib/ai/types';
import { randomUUID } from 'crypto';
import { multi3DefaultModel } from './models';

function rowToSession(row: Record<string, unknown>): Multi3Session {
  return {
    id: row.id as string,
    targetType: row.target_type as 'chapter' | 'document',
    targetId: row.target_id as string,
    command: row.command as Multi3Command,
    commandArgs: (row.command_args as string) || '',
    providers: row.providers as AIProvider[],
    judgeProvider: (row.judge_provider as AIProvider) || DEFAULT_JUDGE_PROVIDER,
    status: row.status as Multi3SessionStatus,
    candidates: (row.candidates as Multi3Candidate[]) || [],
    winnerProvider: row.winner_provider as AIProvider | undefined,
    winnerVersionId: row.winner_version_id as string | undefined,
    judgeReasoning: row.judge_reasoning as string | undefined,
    judgeScores: row.judge_scores as Record<string, number> | undefined,
    parentVersionId: row.parent_version_id as string | undefined,
    createdAt: row.created_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}

export async function createMulti3Session(
  targetType: 'chapter' | 'document',
  targetId: string,
  req: Multi3StartRequest
): Promise<Multi3Session> {
  const id = randomUUID();
  const candidates: Multi3Candidate[] = req.providers.map((provider, branchIndex) => ({
    provider,
    model: req.models?.[provider] || defaultModel(provider),
    status: 'running',
    branchIndex,
    progress: 0,
  }));

  const row = {
    id,
    target_type: targetType,
    target_id: targetId,
    command: req.command,
    command_args: req.args || '',
    providers: req.providers,
    judge_provider: req.judgeProvider || DEFAULT_JUDGE_PROVIDER,
    status: 'running',
    candidates,
    parent_version_id: req.versionId,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('multi_ai_sessions').insert(row);
  if (error) throw new Error(`Falha ao criar sessão multi-IA: ${error.message}`);
  return rowToSession(row);
}

export async function getMulti3Session(sessionId: string): Promise<Multi3Session | null> {
  const { data, error } = await supabase
    .from('multi_ai_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !data) return null;
  return rowToSession(data);
}

export async function listMulti3Sessions(
  targetType: 'chapter' | 'document',
  targetId: string
): Promise<Multi3Session[]> {
  const { data, error } = await supabase
    .from('multi_ai_sessions')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => rowToSession(row as Record<string, unknown>));
}

export async function updateMulti3Session(
  sessionId: string,
  updates: Partial<{
    status: Multi3SessionStatus;
    candidates: Multi3Candidate[];
    winnerProvider: AIProvider;
    winnerVersionId: string;
    judgeReasoning: string;
    judgeScores: Record<string, number>;
    judgeProvider: AIProvider;
    completedAt: string;
  }>
): Promise<void> {
  const db: Record<string, unknown> = {};
  if (updates.status !== undefined) db.status = updates.status;
  if (updates.candidates !== undefined) db.candidates = updates.candidates;
  if (updates.winnerProvider !== undefined) db.winner_provider = updates.winnerProvider;
  if (updates.winnerVersionId !== undefined) db.winner_version_id = updates.winnerVersionId;
  if (updates.judgeReasoning !== undefined) db.judge_reasoning = updates.judgeReasoning;
  if (updates.judgeScores !== undefined) db.judge_scores = updates.judgeScores;
  if (updates.judgeProvider !== undefined) db.judge_provider = updates.judgeProvider;
  if (updates.completedAt !== undefined) db.completed_at = updates.completedAt;

  const { error } = await supabase.from('multi_ai_sessions').update(db).eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function patchMulti3Candidate(
  sessionId: string,
  branchIndex: number,
  candidate: Multi3Candidate
): Promise<void> {
  const session = await getMulti3Session(sessionId);
  if (!session) return;
  const candidates = session.candidates.map((c) =>
    (c.branchIndex ?? session.providers.indexOf(c.provider)) === branchIndex ? candidate : c
  );
  await updateMulti3Session(sessionId, { candidates });
}

/** Sessão em processing/running sem candidato concluído — provável execução morta. */
export function isMulti3SessionStale(session: Multi3Session, staleMs = 90_000): boolean {
  if (!['running', 'processing'].includes(session.status)) return false;

  const candidates = session.candidates || [];
  const hasTerminal = candidates.some((c) => c.status === 'completed' || c.status === 'failed');
  if (hasTerminal) return false;

  const ageMs = Date.now() - new Date(session.createdAt).getTime();
  return ageMs >= staleMs;
}

/** Evita execução duplicada: running → processing */
export async function claimMulti3Execution(sessionId: string): Promise<boolean> {
  const session = await getMulti3Session(sessionId);
  if (!session) return false;

  if (session.status === 'processing' && !isMulti3SessionStale(session)) {
    return false;
  }

  if (!['running', 'processing'].includes(session.status)) {
    return false;
  }

  const { data, error } = await supabase
    .from('multi_ai_sessions')
    .update({ status: 'processing' })
    .eq('id', sessionId)
    .in('status', ['running', 'processing'])
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

function defaultModel(provider: AIProvider): string {
  return multi3DefaultModel(provider);
}

export { defaultModel as multi3DefaultModel };
