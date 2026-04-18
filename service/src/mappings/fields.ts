/**
 * Propstack API field name -> ACF field_name.
 * Authoritative source: docs/propstack_acf_mapping.md.
 *
 * ACHTUNG: Die Ziel-Feldnamen enthalten bewusst Tippfehler aus dem ACF-Setup
 * (z.B. `verf_gbar`, `provisionshohe`, `usable_propertie_space_qm`).
 * NICHT korrigieren.
 */
export const FIELD_MAP = {
  // Gruppe 1: Objekt / Adresse
  city: 'city',
  zip_code: 'plz',
  street: 'street',
  house_number: 'hausnummer',
  hide_address: 'anonym',

  // Gruppe 2: Größe & Zustand
  number_of_rooms: 'zimmer',
  living_space: 'spaceqm',
  usable_floor_space: 'usable_space_qm',
  plot_area: 'usable_propertie_space_qm',
  number_of_floors: 'floors_total',
  construction_year: 'baujahr',
  free_from: 'verf_gbar',

  // Gruppe 3: Preise
  base_rent: 'cold_rent',
  service_charge: 'service_charge',
  heating_costs: 'heizkosten',
  total_rent: 'full_rent',
  price: 'kaufpreis',
  deposit: 'kaution',

  // Gruppe 4: Ausstattung
  number_of_bed_rooms: 'bedrooms',
  number_of_bath_rooms: 'bathrooms',

  // Gruppe 5: Energie
  energy_efficiency_value: 'endenergiebedarf',

  // Gruppe 6: Provision
  courtage: 'provisionshohe',
  courtage_note: 'provisionshinweis',

  // Gruppe 8: Google Maps
  address: 'adresse',

  // Gruppe 9: Beschreibungen
  description_note: 'objektbeschreibung',
  furnishing_note: 'ausstattung',
  location_note: 'lagebeschreibung',
  other_note: 'sonstiges',
} as const satisfies Record<string, string>;

export type PropstackFieldKey = keyof typeof FIELD_MAP;
