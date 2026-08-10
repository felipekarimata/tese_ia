import assert from 'node:assert/strict';
import test from 'node:test';
import { pollMulti3Session } from '@/lib/agent/multi3-client';

function responseFor(session: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ session }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('keeps polling beyond elapsed time while the session heartbeat advances', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const startedAt = Date.now();
  const sessions = [
    {
      status: 'processing',
      createdAt: new Date(startedAt).toISOString(),
      candidates: [{ status: 'running', updatedAt: new Date(startedAt).toISOString() }],
    },
    {
      status: 'processing',
      createdAt: new Date(startedAt).toISOString(),
      candidates: [{ status: 'running', updatedAt: new Date(startedAt + 1_000).toISOString() }],
    },
    {
      status: 'awaiting_human',
      createdAt: new Date(startedAt).toISOString(),
      candidates: [{ status: 'completed', updatedAt: new Date(startedAt + 2_000).toISOString() }],
    },
  ];
  let calls = 0;
  globalThis.fetch = async () => responseFor(sessions[Math.min(calls++, sessions.length - 1)]);

  const updates: string[] = [];
  const result = await pollMulti3Session(
    '/api/test-session',
    (session) => updates.push(session.status),
    5,
    8
  );

  assert.equal(result.status, 'awaiting_human');
  assert.deepEqual(updates, ['processing', 'processing', 'awaiting_human']);
});

test('times out only after the session stops reporting activity', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const startedAt = new Date().toISOString();
  globalThis.fetch = async () => responseFor({
    status: 'processing',
    createdAt: startedAt,
    candidates: [{ status: 'running', updatedAt: startedAt }],
  });

  await assert.rejects(
    pollMulti3Session('/api/test-session', () => {}, 2, 12),
    /sem progresso/i
  );
});
