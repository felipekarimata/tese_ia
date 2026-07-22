import { NextResponse } from 'next/server';

/**
 * JSON para endpoints consultados em polling. Evita cache do Next/CDN que
 * repetia a primeira resposta (ex.: progresso preso em 0%).
 */
export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store, must-revalidate');
  return NextResponse.json(body, { ...init, headers });
}
