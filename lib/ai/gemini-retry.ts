/**
 * Helpers for Gemini API 429 (quota/rate limit) retry.
 * Google returns "Please retry in X.XXXs" in the error message.
 */

const DEFAULT_RETRY_DELAY_MS = 30_000; // 30s for free tier (5 req/min)

export function isGemini429(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as any).message ?? '');
  return (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('quota') ||
    msg.includes('Quota exceeded') ||
    (error as any).status === 429
  );
}

/**
 * Parse "Please retry in 29.114197034s" from Gemini error.
 * Returns delay in milliseconds (default 30s).
 */
export function parseGeminiRetryDelayMs(error: unknown): number {
  if (!error || typeof error !== 'object') return DEFAULT_RETRY_DELAY_MS;
  const msg = String((error as any).message ?? '');
  const match = msg.match(/retry\s+in\s+([\d.]+)\s*s/i) || msg.match(/([\d.]+)\s*seconds?/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return DEFAULT_RETRY_DELAY_MS;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
