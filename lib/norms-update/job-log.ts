import { supabase } from '@/lib/supabase';

export type NormJobLogLevel = 'info' | 'warn' | 'error';

export type NormJobLogEntry = {
  at: string;
  level: NormJobLogLevel;
  message: string;
};

const MAX_LOG_ENTRIES = 250;

/**
 * Acrescenta uma linha ao activity_log do job (não propaga erro para não abortar o processamento).
 */
export async function appendNormJobLog(
  jobId: string,
  message: string,
  level: NormJobLogLevel = 'info'
): Promise<void> {
  try {
    const { data: row, error: fetchErr } = await supabase
      .from('norm_update_jobs')
      .select('activity_log')
      .eq('id', jobId)
      .single();

    if (fetchErr || !row) return;

    const prev: NormJobLogEntry[] = Array.isArray(row.activity_log)
      ? row.activity_log
      : [];

    const entry: NormJobLogEntry = {
      at: new Date().toISOString(),
      level,
      message
    };

    const next = [...prev, entry].slice(-MAX_LOG_ENTRIES);

    await supabase.from('norm_update_jobs').update({ activity_log: next }).eq('id', jobId);
  } catch {
    /* ignore */
  }
}
