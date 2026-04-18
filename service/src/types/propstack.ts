/**
 * Minimal Propstack unit type - only fields we currently read.
 * Propstack actually returns many more fields; we keep this loose with `unknown`
 * for the rest so the mapper can access them without the whole schema.
 */
export interface PropstackUnit {
  id: number;
  unit_id?: string;
  title?: string;

  // Adresse
  city?: string;
  zip_code?: string;
  street?: string;
  house_number?: string;
  hide_address?: boolean;
  address?: string;

  // Typisierung
  object_type?: 'LIVING' | 'COMMERCIAL' | 'INVESTMENT' | string;
  rs_category?: string;
  marketing_type?: 'RENT' | 'BUY' | string;

  // Größe & Zustand
  number_of_rooms?: number | string;
  living_space?: number;
  usable_floor_space?: number;
  plot_area?: number;
  number_of_floors?: number | string;
  construction_year?: number | string;
  free_from?: string;

  // Preise
  base_rent?: number;
  service_charge?: number;
  heating_costs?: number;
  heating_costs_in_service_charge?: boolean;
  total_rent?: number;
  price?: number;
  deposit?: number;

  // Ausstattung (Zimmer)
  number_of_bed_rooms?: number | string;
  number_of_bath_rooms?: number | string;

  // Ausstattung Booleans
  balcony?: boolean;
  guest_toilet?: boolean;
  garden?: boolean;
  built_in_kitchen?: boolean;
  cellar?: boolean;
  lift?: boolean;
  barrier_free?: boolean;
  flat_share_suitable?: boolean;
  storeroom?: boolean;
  loggia?: boolean;

  // Bodenbelag
  flooring_type?: { value?: string[] };

  // Energie
  heating_type?: string;
  energy_efficiency_class?: string;
  energy_efficiency_value?: number;

  // Provision
  courtage?: string;
  courtage_note?: string;

  // Beschreibungen
  description_note?: string;
  furnishing_note?: string;
  location_note?: string;
  other_note?: string;

  // Status (Propstack property_status ID)
  property_status_id?: number;
  archived?: boolean;

  // Bilder
  images?: PropstackImage[];

  // Rest der Felder, die wir noch nicht explizit typisiert haben
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

export interface PropstackWebhookPayload {
  event: 'property_created' | 'property_updated' | string;
  data: { id: number; [key: string]: unknown };
  changed_attributes?: string[];
}
