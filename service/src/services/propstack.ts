import { request } from 'undici';
import { getConfig } from '../config';
import { logger } from '../utils/logger';
import type { PropstackUnit } from '../types/propstack';

const config = getConfig();

async function propstackGet<T>(path: string): Promise<T> {
  const url = `${config.PROPSTACK_API_BASE}${path}`;
  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers: {
      'X-API-KEY': config.PROPSTACK_API_KEY,
      Accept: 'application/json',
    },
  });

  const text = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    logger.error({ statusCode, path, body: text.slice(0, 500) }, 'Propstack API error');
    throw new Error(`Propstack GET ${path} failed: ${statusCode}`);
  }

  return JSON.parse(text) as T;
}

/**
 * Load full unit data. The webhook body does not always contain every field,
 * so we refetch with ?new=1 to get the complete payload.
 */
export async function getUnit(id: number): Promise<PropstackUnit> {
  return propstackGet<PropstackUnit>(`/units/${id}?new=1`);
}

interface PropstackPagedResponse<T> {
  data: T[];
  meta?: { total_pages?: number; total_count?: number };
}

/**
 * Iterate all units (used for POST /sync/full).
 * Bounded by meta.total_pages to prevent infinite loops.
 */
export async function* iterateAllUnits(
  pageSize = 50,
): AsyncGenerator<PropstackUnit, void, void> {
  let page = 1;
  let totalPages: number | undefined;

  while (true) {
    const response = await propstackGet<PropstackPagedResponse<PropstackUnit>>(
      `/units?page=${page}&per=${pageSize}&archived=-1&with_meta=1`,
    );

    totalPages ??= response.meta?.total_pages;

    if (!response.data || response.data.length === 0) return;

    for (const unit of response.data) yield unit;

    if (totalPages && page >= totalPages) return;
    page++;
  }
}
