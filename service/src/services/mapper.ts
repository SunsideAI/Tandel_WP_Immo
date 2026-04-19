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
  STATUS_MAP,
  resolveWpCategories,
} from '../mappings/enums';
import { buildAusstattungsmerkmale } from '../mappings/ausstattung';
import { extractValue } from '../utils/propstack';

/**
 * Build the Bridge sync payload (without images - see toImagePayload).
 * Handles both flat and {label, value}-wrapped fields via extractValue().
 */
export function toBridgePayload(unit: PropstackUnit): BridgeSyncPayload {
  const acf: Record<string, string | number | boolean | string[] | null> = {};
  const raw = unit as unknown as Record<string, unknown>;

  // 1:1 field mapping - extractValue handles both flat and wrapped forms
  for (const [psField, acfField] of Object.entries(FIELD_MAP)) {
    const value = extractValue<string | number | boolean>(raw[psField]);
    if (value === undefined || value === null) continue;
    acf[acfField] = value;
  }

  // Enum mappings - flat fields (no extraction needed)
  if (unit.object_type && OBJECT_TYPE_MAP[unit.object_type as keyof typeof OBJECT_TYPE_MAP]) {
    acf['gewerblich_wohnen'] = OBJECT_TYPE_MAP[unit.object_type as keyof typeof OBJECT_TYPE_MAP];
  }

  if (unit.rs_category) {
    const wohnung = WOHNUNGSTYP_MAP[unit.rs_category as keyof typeof WOHNUNGSTYP_MAP];
    if (wohnung) acf['wohnungstyp'] = wohnung;
    const haus = HAUSTYP_MAP[unit.rs_category as keyof typeof HAUSTYP_MAP];
    if (haus) acf['haustypen'] = haus;
  }

  // Enum mappings - wrapped fields
  const heatingType = extractValue<string>(unit.heating_type);
  if (heatingType) {
    const heizungsart = HEIZUNGSART_MAP[heatingType];
    if (heizungsart) acf['heizungsart'] = heizungsart;
  }

  const effizienzClass = extractValue<string>(unit.energy_efficiency_class);
  if (effizienzClass) {
    const effizienz = EFFIZIENZ_MAP[effizienzClass];
    if (effizienz) acf['energieeffizienzklasse'] = effizienz;
  }

  const hkInNk = extractValue<boolean>(unit.heating_costs_in_service_charge);
  if (typeof hkInNk === 'boolean') {
    acf['heizkosten_sind_in_nebenkosten_enthalten'] =
      HK_IN_NK_MAP[String(hkInNk) as 'true' | 'false'];
  }

  acf['ausstattungsmerkmale'] = buildAusstattungsmerkmale(unit);

  // Categories (flat fields). Hierarchisch: Eltern + Unter + ggf. Referenzen.
  const categories = resolveWpCategories({
    marketing_type: unit.marketing_type,
    rs_type: unit.rs_type,
    object_type: unit.object_type,
    property_status_id: unit.property_status?.id,
  });

  // Post status: property_status is a flat object {id, name}
  let postStatus: 'publish' | 'draft' = 'draft';
  if (unit.archived) {
    postStatus = 'draft';
  } else if (typeof unit.property_status?.id === 'number') {
    postStatus = STATUS_MAP[unit.property_status.id] ?? 'draft';
  } else {
    postStatus = 'publish';
  }

  const title = extractValue<string>(unit.title);

  return {
    propstack_id: unit.id,
    propstack_unit_id: unit.unit_id,
    title: title ?? `Propstack #${unit.id}`,
    post_status: postStatus,
    acf_fields: acf,
    categories,
  };
}

/**
 * Build the image payload for the second-stage sync-images call.
 * `images` at the Propstack root is a flat array - no label/value wrapper.
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
