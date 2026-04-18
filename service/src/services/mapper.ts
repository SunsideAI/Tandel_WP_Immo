import type { PropstackUnit, PropstackImage } from '../types/propstack';
import type { BridgeSyncPayload, BridgeImageSyncPayload } from '../types/bridge';
import { FIELD_MAP } from '../mappings/fields';
import {
  OBJECT_TYPE_MAP,
  WOHNUNGSTYP_MAP,
  HAUSTYP_MAP,
  HEIZUNGSART_MAP,
  EFFIZIENZ_MAP,
  HK_IN_NK_MAP,
  MARKETING_TO_WP_CATEGORY,
  OBJEKTART_TO_WP_CATEGORY,
  STATUS_MAP,
} from '../mappings/enums';
import { buildAusstattungsmerkmale } from '../mappings/ausstattung';

/**
 * Build the Bridge sync payload (without images - see toImagePayload).
 */
export function toBridgePayload(unit: PropstackUnit): BridgeSyncPayload {
  const acf: Record<string, string | number | boolean | string[] | null> = {};

  // 1:1 field mapping
  for (const [psField, acfField] of Object.entries(FIELD_MAP)) {
    const raw = (unit as Record<string, unknown>)[psField];
    if (raw === undefined || raw === null) continue;
    acf[acfField] = raw as string | number | boolean;
  }

  // Enum mappings
  if (unit.object_type && OBJECT_TYPE_MAP[unit.object_type as keyof typeof OBJECT_TYPE_MAP]) {
    acf['gewerblich_wohnen'] = OBJECT_TYPE_MAP[unit.object_type as keyof typeof OBJECT_TYPE_MAP];
  }

  if (unit.rs_category) {
    const wohnung = WOHNUNGSTYP_MAP[unit.rs_category as keyof typeof WOHNUNGSTYP_MAP];
    if (wohnung) acf['wohnungstyp'] = wohnung;
    const haus = HAUSTYP_MAP[unit.rs_category as keyof typeof HAUSTYP_MAP];
    if (haus) acf['haustypen'] = haus;
  }

  if (unit.heating_type) {
    const heizungsart = HEIZUNGSART_MAP[unit.heating_type];
    if (heizungsart) acf['heizungsart'] = heizungsart;
  }

  if (unit.energy_efficiency_class) {
    const effizienz = EFFIZIENZ_MAP[unit.energy_efficiency_class];
    if (effizienz) acf['energieeffizienzklasse'] = effizienz;
  }

  if (typeof unit.heating_costs_in_service_charge === 'boolean') {
    acf['heizkosten_sind_in_nebenkosten_enthalten'] =
      HK_IN_NK_MAP[String(unit.heating_costs_in_service_charge) as 'true' | 'false'];
  }

  acf['ausstattungsmerkmale'] = buildAusstattungsmerkmale(unit);

  // Categories
  const categories: string[] = [];
  if (unit.marketing_type === 'RENT' || unit.marketing_type === 'BUY') {
    categories.push(MARKETING_TO_WP_CATEGORY[unit.marketing_type]);
  }
  if (unit.rs_category) {
    const objektart = OBJEKTART_TO_WP_CATEGORY[unit.rs_category];
    if (objektart) categories.push(objektart);
  }

  // Post status
  let postStatus: 'publish' | 'draft' = 'draft';
  if (unit.archived) {
    postStatus = 'draft';
  } else if (typeof unit.property_status_id === 'number') {
    postStatus = STATUS_MAP[unit.property_status_id] ?? 'draft';
  } else {
    postStatus = 'publish';
  }

  return {
    propstack_id: unit.id,
    propstack_unit_id: unit.unit_id,
    title: unit.title ?? `Propstack #${unit.id}`,
    post_status: postStatus,
    acf_fields: acf,
    categories,
  };
}

/**
 * Build the image payload for the second-stage sync-images call.
 * Prefers the largest URL available, falls back progressively.
 */
export function toImagePayload(unit: PropstackUnit): BridgeImageSyncPayload {
  const images = (unit.images ?? [])
    .map((img, index) => ({
      url: pickImageUrl(img),
      propstack_image_id: img.id,
      is_floorplan: img.is_floorplan === true,
      title: img.title,
      position: img.position ?? index,
    }))
    .filter((img): img is NonNullable<typeof img> & { url: string } => !!img.url);

  return {
    propstack_id: unit.id,
    images,
  };
}

function pickImageUrl(img: PropstackImage): string | undefined {
  return img.original ?? img.large ?? img.url ?? img.medium ?? img.small;
}
