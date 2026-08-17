import { NextResponse } from 'next/server';
import { isBooksSchemaMissingError } from './repository';

export function bookApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = isBooksSchemaMissingError(error) ? 503 : 500;
  return NextResponse.json(
    {
      error: message || fallback,
      ...(isBooksSchemaMissingError(error) ? { code: error.code } : {}),
    },
    { status }
  );
}
