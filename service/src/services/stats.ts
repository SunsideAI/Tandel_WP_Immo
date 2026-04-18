/**
 * In-memory sync stats. Reset on process restart - good enough for
 * Railway's /status endpoint (no DB, per the CLAUDE_CODE_BRIEF).
 * For historical stats, query Railway logs.
 */
export interface SyncStats {
  total_synced: number;
  successes: number;
  failures: number;
  last_event_at: string | null;
  last_status: 'success' | 'failed' | null;
  last_error: string | null;
  started_at: string;
}

const stats: SyncStats = {
  total_synced: 0,
  successes: 0,
  failures: 0,
  last_event_at: null,
  last_status: null,
  last_error: null,
  started_at: new Date().toISOString(),
};

export function recordResult(status: 'success' | 'failed', errorMessage?: string): void {
  stats.total_synced += 1;
  if (status === 'success') stats.successes += 1;
  else stats.failures += 1;
  stats.last_event_at = new Date().toISOString();
  stats.last_status = status;
  stats.last_error = status === 'failed' ? errorMessage ?? null : null;
}

export function getStats(): SyncStats {
  return { ...stats };
}
