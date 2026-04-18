import type { PropstackUnit } from '../types/propstack';
import { extractValue } from '../utils/propstack';

export const AUSSTATTUNG_BOOL_TO_ACF = {
  balcony: 'Balkon/Terrasse',
  guest_toilet: 'Gäste-WC',
  garden: 'Garten/-mitbenutzung',
  built_in_kitchen: 'Einbauküche',
  cellar: 'Keller',
  lift: 'Personenaufzug',
  barrier_free: 'Stufenloser Zugang',
  flat_share_suitable: 'WG-geeignet',
  storeroom: 'Abstellkammer',
  loggia: 'Loggia',
} as const satisfies Record<string, string>;

export const FLOORING_TO_ACF: Record<string, string> = {
  Laminat: 'Laminat',
  Fliesen: 'Fliesen',
  Stein: 'Steinzeug',
  Parkett: 'Parkett',
  Teppichboden: 'textiler Belag',
  PVC: 'PVC Belag',
};

export function buildAusstattungsmerkmale(unit: PropstackUnit): string[] {
  const merkmale = new Set<string>();
  const raw = unit as unknown as Record<string, unknown>;

  // Boolean-Ausstattungsfelder sind bei Propstack {label, value}-gewrapped.
  for (const [psField, acfLabel] of Object.entries(AUSSTATTUNG_BOOL_TO_ACF)) {
    if (extractValue<boolean>(raw[psField]) === true) {
      merkmale.add(acfLabel);
    }
  }

  const flooring = extractValue<string[]>(unit.flooring_type);
  if (Array.isArray(flooring)) {
    for (const item of flooring) {
      const label = FLOORING_TO_ACF[item.trim()];
      if (label) merkmale.add(label);
    }
  }

  return [...merkmale];
}
