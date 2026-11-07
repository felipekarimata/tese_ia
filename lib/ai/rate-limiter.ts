/**
 * Token-bucket rate limiter para controlar a taxa de chamadas a APIs externas.
 *
 * Objetivo: evitar os 429 (rate limit) na origem, em vez de depender de retry.
 * Cada `acquire()` consome 1 token; se não houver token disponível, a chamada
 * aguarda até o bucket reabastecer. Os tokens reabastecem continuamente a uma
 * taxa de `refillPerSec` por segundo, até o limite `capacity`.
 *
 * Singleton via globalThis para sobreviver a hot-reload em dev e ser
 * compartilhado por todos os call-sites do mesmo provider.
 */

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefill = now;
  }

  /** Aguarda até haver um token disponível e o consome. */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Sem token: calcula quanto falta para 1 token reabastecer e aguarda.
    const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(waitMs, 50)));
    return this.acquire();
  }
}

const REQS_PER_MIN = Number(process.env.GEMINI_RPM ?? '') || 15;

const globalForLimiter = globalThis as unknown as {
  __geminiRateLimiter?: TokenBucket;
};

/**
 * Limiter global do Gemini. Taxa configurável via env `GEMINI_RPM`
 * (requisições por minuto, default 15). `capacity` = burst permitido.
 */
export const geminiRateLimiter: TokenBucket =
  globalForLimiter.__geminiRateLimiter ??
  new TokenBucket(Math.max(1, Math.ceil(REQS_PER_MIN / 4)), REQS_PER_MIN / 60);

if (process.env.NODE_ENV !== 'production') {
  globalForLimiter.__geminiRateLimiter = geminiRateLimiter;
}
