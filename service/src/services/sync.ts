import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { getUnit } from './propstack';
import { syncPost, syncImages, syncDelete } from './wordpress-bridge';
import { toBridgePayload, toImagePayload } from './mapper';
import { recordResult } from './stats';

const config = getConfig();

/**
 * Per-propstack-id in-process lock to prevent two concurrent webhook
 * handlers for the same object from racing.
 * For multiple Railway replicas, the Bridge plugin's transient lock kicks in
 * as a second safety net.
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

    let unit;
    try {
      unit = await getUnit(propstackId);
    } catch (err) {
      // 404 from Propstack -> object was deleted. Propstack does not fire
      // a property_deleted event, so we treat a missing unit as a delete.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404')) {
        log.info('Propstack returned 404 - treating as delete');
        if (!config.DRY_RUN) {
          try {
            await syncDelete(propstackId);
          } catch (delErr) {
            log.warn({ err: delErr }, 'Delete call to bridge failed');
          }
        }
        recordResult('success');
        return;
      }
      throw err;
    }

    if (unit.archived) {
      log.info('Unit archived in Propstack - setting WP post to draft');
      if (config.DRY_RUN) {
        log.info('[DRY_RUN] would delete');
        recordResult('success');
        return;
      }
      await syncDelete(propstackId);
      recordResult('success');
      return;
    }

    const payload = toBridgePayload(unit);
    const imagePayload = toImagePayload(unit);

    if (config.DRY_RUN) {
      log.info({ payload, image_count: imagePayload.images.length }, '[DRY_RUN] would sync');
      recordResult('success');
      return;
    }

    // Stage 1: post + ACF fields (fast)
    const result = await syncPost(payload);
    log.info({ wp_post_id: result.wp_post_id, status: result.status }, 'Stage 1 complete');

    if (result.errors?.length) {
      log.warn({ errors: result.errors }, 'Stage 1 returned field errors');
    }

    // Stage 2: images (slow, sequential in WP)
    if (imagePayload.images.length > 0) {
      try {
        const imgResult = await syncImages(imagePayload);
        log.info(
          {
            uploaded: imgResult.uploaded,
            skipped: imgResult.skipped,
            errors: imgResult.errors?.length ?? 0,
          },
          'Stage 2 complete',
        );
      } catch (err) {
        log.error(
          { err },
          'Stage 2 (images) failed - post was created but images not attached',
        );
        // Don't rethrow - the post is valid; images can be retried via /sync/one/:id.
      }
    }

    recordResult('success');
  });
}

export async function handleWebhook(event: string, propstackId: number): Promise<void> {
  try {
    await syncProperty(propstackId);
  } catch (err) {
    logger.error({ err, event, propstack_id: propstackId }, 'Webhook processing failed');
    recordResult('failed', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
