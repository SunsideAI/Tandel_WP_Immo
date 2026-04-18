import { Router } from 'express';
import { getSupabase } from '../db/supabase';

export const healthRouter = Router();

const bootTime = Date.now();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.floor((Date.now() - bootTime) / 1000),
  });
});

healthRouter.get('/status', async (_req, res) => {
  const supabase = getSupabase();

  const { count: totalSynced } = await supabase
    .from('sync_mappings')
    .select('*', { count: 'exact', head: true });

  const { data: lastSync } = await supabase
    .from('sync_log')
    .select('propstack_id, status, created_at, error_message')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: errors24h } = await supabase
    .from('sync_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', since);

  res.json({
    total_synced: totalSynced ?? 0,
    last_sync: lastSync ?? null,
    errors_last_24h: errors24h ?? 0,
  });
});
