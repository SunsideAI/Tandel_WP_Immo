import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { getUnit } from './propstack';
import { syncPost, syncImages, syncDelete } from './wordpress-bridge';
import { toBridgePayload, toImagePayload } from './mapper';
import { upsertMapping, recordSyncResult } from '../db/mappings';

const config = getConfig();

/**
 * Per-propstack-id in-process lock to prevent two concurrent webhook
 * handlers for the same object from racing.
 * Distributed locking (when running multiple Railway replicas) is handled
 * in the Bridge plugin via transient locks.
 */
const locks = new Map<number, Promise<void>>();

async function withLock<T>(propstackId: number, fn: () => Promise<T>): Promise<T> {
  while (locks.has(propstackId)) {
    await locks.get(propstackId);
  }
  let release!: () => void;
  const lock = new Promise<void>((r) => (release = r));
  locks.set(propstackId, lock);
  try {
    return await fn();
  } finally {
    locks.delete(propstackId);
    release();
  }
}

export async function syncProperty(propstackId: number): Promise<void> {
  await withLock(propstackId, async () => {
    const log = logger.child({ propstack_id: propstackId });
    log.info('Starting sync');

    const unit = await getUnit(propstackId);

    if (unit.archived) {
      log.info('Unit archived in Propstack - setting WP post to draft');
      if (config.DRY_RUN) {
        log.info('[DRY_RUN] would delete');
        return;
      }
      await syncDelete(propstackId);
      return;
    }

    const payload = toBridgePayload(unit);
    const imagePayload = toImagePayload(unit);

    if (config.DRY_RUN) {
      log.info({ payload, image_count: imagePayload.images.length }, '[DRY_RUN] would sync');
      return;
    }

    // Stage 1: post + ACF fields (fast)
    const result = await syncPost(payload);
    log.info({ wp_post_id: result.wp_post_id, status: result.status }, 'Stage 1 complete');

    await upsertMapping({
      propstack_id: propstackId,
      wp_post_id: result.wp_post_id,
      propstack_unit_id: unit.unit_id,
    });

    if (result.errors?.length) {
      log.warn({ errors: result.errors }, 'Stage 1 returned field errors');
    }

    // Stage 2: images (slow, sequential in WP)
    if (imagePayload.images.length > 0) {
      try {
        const imgResult = await syncImages(imagePayload);
        log.info(
          { uploaded: imgResult.uploaded, skipped: imgResult.skipped, errors: imgResult.errors?.length ?? 0 },
          'Stage 2 complete',
        );
      } catch (err) {
        log.error({ err }, 'Stage 2 (images) failed - post was created but images not attached');
        // Don't rethrow - the post is valid, images can be retried from the queue
      }
    }

    await recordSyncResult(propstackId, 'success');
  });
}

export async function handleWebhook(
  event: string,
  propstackId: number,
): Promise<void> {
  try {
    await syncProperty(propstackId);
  } catch (err) {
    logger.error({ err, event, propstack_id: propstackId }, 'Webhook processing failed');
    await recordSyncResult(propstackId, 'failed', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
