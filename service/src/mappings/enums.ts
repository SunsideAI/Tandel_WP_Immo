/**
 * Enum mappings Propstack -> ACF.
 * Authoritative source: docs/propstack_acf_mapping.md.
 */

export const OBJECT_TYPE_MAP = {
  LIVING: 'wohnen',
  COMMERCIAL: 'gewerblich',
  INVESTMENT: 'gewerblich',
} as const satisfies Record<string, string>;

export const WOHNUNGSTYP_MAP = {
  ROOF_STOREY: '1',
  LOFT: '2',
  MAISONETTE: '3',
  PENTHOUSE: '4',
  TERRACED_FLAT: '5',
  GROUND_FLOOR: '6',
  APARTMENT: '7',
  RAISED_GROUND_FLOOR: '8',
  HALF_BASEMENT: '9',
} as const satisfies Record<string, string>;

export const HAUSTYP_MAP = {
  SINGLE_FAMILY_HOUSE: '6',
  SEMIDETACHED_HOUSE: '2',
  MID_TERRACE_HOUSE: '3',
  TERRACE_END_HOUSE: '4',
  VILLA: '5',
  TWO_FAMILY_HOUSE: '7',
  MULTI_FAMILY_HOUSE: '8',
  FARMHOUSE: '10',
} as const satisfies Record<string, string>;

export const HEIZUNGSART_MAP: Record<string, string> = {
  Zentralheizung: '4',
  Etagenheizung: '2',
  Ofenheizung: '3',
  Blockheizkraftwerk: '5',
  'Elektro-Heizung': '6',
  Fernwärme: '7',
  'Gas-Heizung': '8',
  'Holz-Pelletheizung': '9',
  'Öl-Heizung': '11',
  Solarheizung: '12',
  Wärmepumpe: '13',
};

export const EFFIZIENZ_MAP: Record<string, string> = {
  A: '1',
  B: '2',
  C: '3',
  D: '4',
  E: '5',
  F: '6',
  G: '7',
  H: '8',
  I: '9',
  J: '10',
  'A+': '11',
};

export const HK_IN_NK_MAP = {
  true: '1',
  false: '0',
} as const;

export const MARKETING_TO_WP_CATEGORY = {
  RENT: 'mieten',
  BUY: 'kaufen',
} as const satisfies Record<string, string>;

export const OBJEKTART_TO_WP_CATEGORY: Record<string, string> = {
  APARTMENT: 'eigentumswohnung',
  HOUSE: 'kaufen',
  OFFICE: 'gewerbe-kaufen',
  TRADE_SITE: 'grundstuecke-bauland',
  // TODO: Rest mit tatsächlichen WP-Kategorien abgleichen (siehe docs/propstack_acf_mapping.md §3.9)
};

/**
 * Propstack property_status ID -> WordPress post_status.
 * 254061 Vermarktung, 254062 Reserviert, 254063 Abgeschlossen,
 * 254059 Akquise, 254060 Vorbereitung.
 */
export const STATUS_MAP: Record<number, 'publish' | 'draft'> = {
  254061: 'publish',
  254062: 'publish',
  254063: 'publish',
  254059: 'draft',
  254060: 'draft',
};
