/**
 * In-memory cancellation tracking for background jobs.
 *
 * The Node process keeps running after the HTTP response returns, so the
 * pipeline functions can check this Set between AI calls and bail out
 * before making the next (paid) request.
 *
 * The DB status column has a CHECK constraint that does not include
 * 'cancelled', so we mark cancelled jobs by writing status='error' with
 * `errorMessage = CANCELLATION_MARKER`. The UI recognizes the marker and
 * renders a friendly "Cancelado" state instead of an error.
 */

const cancelled = new Set<string>();

export const CANCELLATION_MARKER = '__CANCELLED_BY_USER__';

export function requestCancellation(jobId: string): void {
  cancelled.add(jobId);
}

export function isCancellationRequested(jobId: string): boolean {
  return cancelled.has(jobId);
}

export function clearCancellation(jobId: string): void {
  cancelled.delete(jobId);
}

/** Throw a sentinel error if cancellation has been requested for this job. */
export class JobCancelledError extends Error {
  constructor(public readonly jobId: string) {
    super(`Job ${jobId} cancelled by user`);
    this.name = 'JobCancelledError';
  }
}

export function throwIfCancelled(jobId: string): void {
  if (cancelled.has(jobId)) {
    throw new JobCancelledError(jobId);
  }
}

export function isCancelledError(err: unknown): err is JobCancelledError {
  return err instanceof JobCancelledError;
}

/** Read-side helper: did this job error out because the user cancelled? */
export function isCancellationErrorMessage(msg?: string | null): boolean {
  return !!msg && msg.includes(CANCELLATION_MARKER);
}
