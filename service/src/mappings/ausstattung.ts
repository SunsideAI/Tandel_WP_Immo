import type { PropstackUnit } from '../types/propstack';

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

  for (const [psField, acfLabel] of Object.entries(AUSSTATTUNG_BOOL_TO_ACF)) {
    if ((unit as Record<string, unknown>)[psField] === true) {
      merkmale.add(acfLabel);
    }
  }

  const flooring = unit.flooring_type?.value;
  if (Array.isArray(flooring)) {
    for (const raw of flooring) {
      const label = FLOORING_TO_ACF[raw.trim()];
      if (label) merkmale.add(label);
    }
  }

  return [...merkmale];
}
