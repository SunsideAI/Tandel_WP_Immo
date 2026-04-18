import type { LabeledValue } from '../utils/propstack';

/**
 * Propstack webhook body / unit payload.
 *
 * Grundsatz:
 *   - Flache Felder stehen direkt als primitiver Wert.
 *   - Alle anderen Felder sind `{label, value}` gewrappt.
 *
 * Wir vereinheitlichen den Lesezugriff ueber `extractValue()` aus
 * `utils/propstack.ts`. Das hier ist eine pragmatische Typisierung -
 * die Realitaet bei Propstack ist breiter, wir modellieren nur was wir nutzen.
 */

type Maybe<T> = T | LabeledValue<T>;

export interface PropstackUnit {
  // --- FLACHE FELDER ---
  id: number;
  unit_id?: string;
  city?: string;
  zip_code?: string;
  street?: string;
  house_number?: string;
  country?: string;
  rs_type?: string;
  rs_category?: string;
  object_type?: 'LIVING' | 'COMMERCIAL' | 'INVESTMENT' | string;
  marketing_type?: 'RENT' | 'BUY' | string;
  archived?: boolean;
  project_id?: number;
  broker_id?: number;
  address?: string;
  short_address?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;

  /** Status-Objekt, nicht gewrappt. Beispiel: `{id: 254061, name: 'Vermarktung'}` */
  property_status?: { id: number; name?: string };

  /** Bilder: Array von Objekten direkt im Root (flache Sub-Objekte). */
  images?: PropstackImage[];

  // --- GEWRAPPTE FELDER ({label, value}) ---
  title?: Maybe<string>;

  // Groesse & Zustand
  number_of_rooms?: Maybe<number | string>;
  living_space?: Maybe<number>;
  usable_floor_space?: Maybe<number>;
  plot_area?: Maybe<number>;
  number_of_floors?: Maybe<number | string>;
  construction_year?: Maybe<number | string>;
  free_from?: Maybe<string>;
  hide_address?: Maybe<boolean>;

  // Preise
  base_rent?: Maybe<number>;
  service_charge?: Maybe<number>;
  heating_costs?: Maybe<number>;
  heating_costs_in_service_charge?: Maybe<boolean>;
  total_rent?: Maybe<number>;
  price?: Maybe<number>;
  deposit?: Maybe<number>;

  // Zimmer (Ausstattung)
  number_of_bed_rooms?: Maybe<number | string>;
  number_of_bath_rooms?: Maybe<number | string>;

  // Ausstattungs-Booleans
  balcony?: Maybe<boolean>;
  guest_toilet?: Maybe<boolean>;
  garden?: Maybe<boolean>;
  built_in_kitchen?: Maybe<boolean>;
  cellar?: Maybe<boolean>;
  lift?: Maybe<boolean>;
  barrier_free?: Maybe<boolean>;
  flat_share_suitable?: Maybe<boolean>;
  storeroom?: Maybe<boolean>;
  loggia?: Maybe<boolean>;

  flooring_type?: Maybe<string[]>;

  // Energie
  heating_type?: Maybe<string>;
  energy_efficiency_class?: Maybe<string>;
  energy_efficiency_value?: Maybe<number>;

  // Provision
  courtage?: Maybe<string>;
  courtage_note?: Maybe<string>;

  // Beschreibungen
  description_note?: Maybe<string>;
  furnishing_note?: Maybe<string>;
  location_note?: Maybe<string>;
  other_note?: Maybe<string>;

  // alles andere
  [key: string]: unknown;
}

export interface PropstackImage {
  id: number;
  url?: string;
  original?: string;
  large?: string;
  medium?: string;
  small?: string;
  is_floorplan?: boolean;
  title?: string;
  position?: number;
}
