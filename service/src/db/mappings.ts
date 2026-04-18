import { getSupabase } from './supabase';
import { logger } from '../utils/logger';

export interface SyncMapping {
  propstack_id: number;
  wp_post_id: number;
  propstack_unit_id?: string;
}

export async function upsertMapping(mapping: SyncMapping): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('sync_mappings')
    .upsert(
      {
        propstack_id: mapping.propstack_id,
        wp_post_id: mapping.wp_post_id,
        propstack_unit_id: mapping.propstack_unit_id ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'propstack_id' },
    );

  if (error) {
    logger.error({ err: error, mapping }, 'Failed to upsert sync mapping');
  }
}

export async function getWpPostId(propstackId: number): Promise<number | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sync_mappings')
    .select('wp_post_id')
    .eq('propstack_id', propstackId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, propstackId }, 'Failed to fetch mapping');
    return null;
  }
  return data?.wp_post_id ?? null;
}

export async function recordSyncResult(
  propstackId: number,
  status: 'success' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('sync_log').insert({
    propstack_id: propstackId,
    status,
    error_message: errorMessage ?? null,
  });

  if (error) {
    logger.error({ err: error }, 'Failed to write sync_log');
  }
}
