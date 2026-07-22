import { throwIfCancelled, isCancelledError, JobCancelledError } from '@/lib/job-cancellation';

export function multi3CancelCheck(sessionId: string): () => void {
  return () => throwIfCancelled(sessionId);
}

export { isCancelledError, JobCancelledError };
