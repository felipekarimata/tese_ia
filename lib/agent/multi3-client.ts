import { parseMulti3Input, ParsedMulti3Command, explainMulti3ParseFailure } from '@/lib/multi-ai/parser';
import { Multi3Command } from '@/lib/multi-ai/types';
import { AIProvider } from '@/lib/ai/types';
import { formatMulti3ProgressLine, getMulti3FailureMessage } from '@/lib/multi-ai/errors';
import { normalizeMulti3Settings } from '@/lib/multi-ai/models';
import type { Multi3Settings } from '@/lib/multi-ai/types';

export type Multi3LaunchParams = {
  providers: AIProvider[];
  judgeProvider: AIProvider;
  command: Multi3Command;
  args: string;
};

export function parseMulti3Command(
  raw: string,
  settings?: {
    models?: Partial<Record<AIProvider, string[]>>;
    multi3?: Partial<Multi3Settings>;
  } | null
): ParsedMulti3Command {
  const multi3 = normalizeMulti3Settings(settings?.multi3, settings?.models);
  return parseMulti3Input(raw, {
    providers: multi3.defaultProviders,
    judgeProvider: multi3.judgeProvider,
  });
}

export { explainMulti3ParseFailure };

export function buildMulti3ApiBody(
  parsed: Extract<ParsedMulti3Command, { kind: 'start' }>,
  versionId: string,
  models?: Partial<Record<AIProvider, string>>
) {
  return {
    providers: parsed.providers,
    judgeProvider: parsed.judgeProvider,
    command: parsed.command,
    args: parsed.args,
    versionId,
    models,
  };
}

function formatMulti3Progress(session: any): string {
  return formatMulti3ProgressLine(session);
}

export async function cancelMulti3Session(sessionId: string): Promise<boolean> {
  const res = await fetch('/api/jobs/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: sessionId, type: 'multi3' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha ao cancelar Multi-IA');
  }
  return true;
}

/** Cria sessão e dispara execução no servidor (endpoint /run). */
export async function startMulti3WithRun(
  createUrl: string,
  body: Record<string, unknown>
): Promise<string> {
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData.error || 'Falha ao iniciar Multi-IA');

  const sessionId = createData.session.id as string;
  const runUrl = `${createUrl}/${sessionId}/run`;

  // Do not await the long-running request: polling must start immediately so the
  // user can see persisted progress while the three candidates are executing.
  void fetch(runUrl, { method: 'POST' })
    .then(async (runRes) => {
      if (!runRes.ok) {
        const err = await runRes.json().catch(() => ({}));
        console.warn('[multi3 run trigger]', err.error || runRes.status);
      }
    })
    .catch((err) => console.error('[multi3 run trigger]', err));

  return sessionId;
}

function latestSessionActivity(session: any): number {
  const createdAt = new Date(session?.createdAt || 0).getTime();
  return (session?.candidates || []).reduce((latest: number, candidate: any) => {
    const updatedAt = candidate.updatedAt ? new Date(candidate.updatedAt).getTime() : 0;
    return Math.max(latest, Number.isFinite(updatedAt) ? updatedAt : 0);
  }, Number.isFinite(createdAt) ? createdAt : 0);
}

function isSessionStuck(session: any): boolean {
  if (!session) return false;
  if (!['running', 'processing'].includes(session.status)) return false;
  const done = session.candidates?.filter((c: any) => c.status === 'completed' || c.status === 'failed').length ?? 0;
  if (done > 0) return false;
  return Date.now() - latestSessionActivity(session) > 180_000;
}

export async function pollMulti3Session(
  basePath: string,
  onUpdate: (session: any) => void,
  intervalMs = 3000,
  timeoutMs = 45 * 60 * 1000,
  runUrl?: string
): Promise<any> {
  const start = Date.now();
  let lastRunTrigger = 0;

  const maybeTriggerRun = (session: any) => {
    if (!runUrl) return;
    if (!['running', 'processing'].includes(session?.status)) return;
    const done = session.candidates?.filter((c: any) => c.status === 'completed').length ?? 0;
    const age = Date.now() - new Date(session.createdAt).getTime();
    const now = Date.now();
    const needsInitialTrigger = session.status === 'running' && age > 4000;
    const needsRecoveryTrigger = session.status === 'processing' && isSessionStuck(session);
    if (done === 0 && (needsInitialTrigger || needsRecoveryTrigger) && now - lastRunTrigger > 15_000) {
      lastRunTrigger = now;
      void fetch(runUrl, { method: 'POST' }).catch(() => {});
    }
  };

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(basePath, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const session = data.session;
      onUpdate(session);

      maybeTriggerRun(session);

      if (isSessionStuck(session) && !runUrl) {
        throw new Error(
          'Multi-IA travou em 0/3 — clique em Reprocessar Multi-IA no histórico ou tente o comando novamente.'
        );
      }

      const status = session?.status;
      if (['awaiting_human', 'accepted', 'failed'].includes(status)) {
        return session;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timeout aguardando sessão Multi-IA');
}

export { formatMulti3Progress, getMulti3FailureMessage };
