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

/**
 * Sub-Kategorien (slug) fuer marketing_type=RENT, abgeleitet aus rs_type.
 * OFFICE/STORE/GASTRONOMY/INDUSTRY teilen sich die gleiche Gewerbe-Kategorie.
 */
export const RENT_SUB_CATEGORY: Record<string, string> = {
  APARTMENT: 'wohnung-mieten',
  HOUSE: 'haus-mieten',
  OFFICE: 'gewerbe-mieten',
  STORE: 'gewerbe-mieten',
  GASTRONOMY: 'gewerbe-mieten',
  INDUSTRY: 'gewerbe-mieten',
  TRADE_SITE: 'grundstueck-mieten-pachten',
  GARAGE: 'stellplatz-garage',
  SHORT_TERM_ACCOMODATION: 'moebliertes-zimmer-wohnng',
};

/**
 * Sub-Kategorien (slug) fuer marketing_type=BUY, abgeleitet aus rs_type.
 * Sonderfall: object_type=INVESTMENT ueberschreibt und mappt auf 'kapitalanlage'
 * (siehe resolveWpCategories).
 */
export const BUY_SUB_CATEGORY: Record<string, string> = {
  APARTMENT: 'eigentumswohnung',
  HOUSE: 'haeuser-kaufen',
  OFFICE: 'gewerbe-kaufen',
  STORE: 'gewerbe-kaufen',
  GASTRONOMY: 'gewerbe-kaufen',
  INDUSTRY: 'gewerbe-kaufen',
  TRADE_SITE: 'grundstuecke-kaufen',
};

/** Propstack property_status.id fuer "Abgeschlossen" - zieht zusaetzlich die Referenzen-Kategorie. */
export const REFERENZEN_STATUS_ID = 254063;
export const REFERENZEN_CATEGORY = 'referenzen';
export const KAPITALANLAGE_CATEGORY = 'kapitalanlage';

/** Propstack property_status.id fuer "Abgeschlossen" - Objekt wird aus WP geloescht. */
export const ABGESCHLOSSEN_STATUS_ID = 254063;

/**
 * Liefert die Liste der WP-Kategorie-Slugs (Eltern + Unter + ggf. Referenzen).
 * Kategorien sind hierarchisch, wir setzen beide Ebenen explizit.
 */
export function resolveWpCategories(input: {
  marketing_type?: string;
  rs_type?: string;
  object_type?: string;
  property_status_id?: number;
}): string[] {
  const categories: string[] = [];
  const { marketing_type: mt, rs_type: rt, object_type: ot, property_status_id: sid } = input;

  if (mt === 'RENT') {
    categories.push(MARKETING_TO_WP_CATEGORY.RENT);
    const sub = rt ? RENT_SUB_CATEGORY[rt] : undefined;
    if (sub) categories.push(sub);
  } else if (mt === 'BUY') {
    categories.push(MARKETING_TO_WP_CATEGORY.BUY);
    if (ot === 'INVESTMENT') {
      categories.push(KAPITALANLAGE_CATEGORY);
    } else {
      const sub = rt ? BUY_SUB_CATEGORY[rt] : undefined;
      if (sub) categories.push(sub);
    }
  }

  if (sid === REFERENZEN_STATUS_ID) {
    categories.push(REFERENZEN_CATEGORY);
  }

  return categories;
}

/**
 * Propstack property_status ID -> WordPress post_status.
 * 254061 Vermarktung, 254062 Reserviert, 254059 Akquise, 254060 Vorbereitung.
 * 254063 Abgeschlossen wird separat behandelt (Delete, siehe ABGESCHLOSSEN_STATUS_ID).
 */
export const STATUS_MAP: Record<number, 'publish' | 'draft'> = {
  254061: 'publish',
  254062: 'publish',
  254059: 'draft',
  254060: 'draft',
};
