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

/**
 * WP_BRIDGE_URL ends in `/sync` (Stage-1-Endpoint). Die anderen Routen
 * liegen im gleichen Plugin-Namespace `tandel/v1`, werden aber nicht
 * unterhalb von `/sync` registriert. Deshalb leiten wir die Namespace-Basis
 * ab und bauen die einzelnen Pfade explizit zusammen.
 *
 * Plugin-Registrierung (siehe wordpress-plugin/tandel-propstack-bridge):
 *   POST /tandel/v1/sync          (Stage 1: Post + ACF)
 *   POST /tandel/v1/sync-images   (Stage 2: Bilder, Bindestrich!)
 *   POST /tandel/v1/sync/delete
 *   GET  /tandel/v1/lookup
 */
function namespaceBase(): string {
  return config.WP_BRIDGE_URL.replace(/\/sync\/?$/, '').replace(/\/+$/, '');
}

function bridgeUrl(path: string): string {
  return namespaceBase() + path;
}

async function bridgePost<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const url = bridgeUrl(path);
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
    logger.error({ statusCode, url, body: text.slice(0, 1000) }, 'WP Bridge error');
    throw new Error(`WP Bridge POST ${url} failed: ${statusCode}`);
  }

  return JSON.parse(text) as TResponse;
}

export function syncPost(payload: BridgeSyncPayload): Promise<BridgeSyncResponse> {
  return bridgePost<BridgeSyncPayload, BridgeSyncResponse>('/sync', payload);
}

export function syncImages(payload: BridgeImageSyncPayload): Promise<BridgeImagesResponse> {
  return bridgePost<BridgeImageSyncPayload, BridgeImagesResponse>('/sync-images', payload);
}

export function syncDelete(
  propstackId: number,
): Promise<{ wp_post_id: number | null; status: string }> {
  return bridgePost('/sync/delete', { propstack_id: propstackId });
}

export async function bridgeLookup(propstackId: number): Promise<number | null> {
  const url = bridgeUrl(`/lookup?propstack_id=${propstackId}`);

  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: { 'X-Tandel-Api-Key': config.WP_BRIDGE_API_KEY },
  });

  const text = await body.text();
  if (statusCode < 200 || statusCode >= 300) {
    logger.warn({ statusCode, url, body: text.slice(0, 500) }, 'Bridge lookup failed');
    return null;
  }

  const json = JSON.parse(text) as { found?: boolean; wp_post_id?: number };
  return json.found && json.wp_post_id ? json.wp_post_id : null;
}
