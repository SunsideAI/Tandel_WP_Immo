import { request } from 'undici';
import { getConfig } from '../config';
import { logger } from '../utils/logger';
import type {
  BridgeSyncPayload,
  BridgeSyncResponse,
  BridgeImageSyncPayload,
  BridgeImagesResponse,
} from '../types/bridge';

const config = getConfig();

async function bridgePost<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const url = `${config.WP_BRIDGE_BASE_URL}${path}`;
  const payload = JSON.stringify(body);

  const { statusCode, body: resBody } = await request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tandel-Api-Key': config.WP_BRIDGE_API_KEY,
    },
    body: payload,
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
  });

  const text = await resBody.text();

  if (statusCode < 200 || statusCode >= 300) {
    logger.error(
      { statusCode, path, body: text.slice(0, 1000) },
      'WP Bridge error',
    );
    throw new Error(`WP Bridge POST ${path} failed: ${statusCode}`);
  }

  return JSON.parse(text) as TResponse;
}

export function syncPost(payload: BridgeSyncPayload): Promise<BridgeSyncResponse> {
  return bridgePost<BridgeSyncPayload, BridgeSyncResponse>('/sync', payload);
}

export function syncImages(
  payload: BridgeImageSyncPayload,
): Promise<BridgeImagesResponse> {
  return bridgePost<BridgeImageSyncPayload, BridgeImagesResponse>(
    '/sync-images',
    payload,
  );
}

export function syncDelete(propstackId: number): Promise<{ wp_post_id: number | null; status: string }> {
  return bridgePost('/sync/delete', { propstack_id: propstackId });
}
