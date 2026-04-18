# Propstack → ACF Feld-Mapping (Single Source of Truth)

Letzter Stand: 2026-04-19
Wiederhergestellt aus `tandel_sync_service_plan.md` (Commit 41ef322).

Die Feld- und Enum-Mappings in diesem Dokument sind verbindlich für den
Sync-Service und das Bridge-Plugin. Die TypeScript-Module unter
`service/src/mappings/` müssen strikt diesen Tabellen folgen.

---

## 1. Stolperfallen in den ACF-Feldnamen

Einige ACF-Feldnamen weichen von dem ab, was man intuitiv erwarten würde.
Diese Abweichungen sind beabsichtigt und dürfen **nicht** korrigiert werden.

| ACF-Feld (Label) | Erwarteter Name | Tatsächlicher Name |
|---|---|---|
| Wohnfläche | `wohnflaeche` | `spaceqm` |
| Grundstücksfläche | `grundstuecksflaeche` | `usable_propertie_space_qm` (Tippfehler im Original) |
| Kaltmiete | `kaltmiete` | `cold_rent` |
| Gesamtmiete | `gesamtmiete` | `full_rent` |
| Verfügbar ab | `verfuegbar_ab` | `verf_gbar` |
| Ausstattungsbeschreibung | `ausstattungsbeschreibung` | `ausstattung` |
| Provisionshöhe | `provisionshoehe` | `provisionshohe` (ohne ö) |
| Haustyp | `haustyp` | `haustypen` (mit n) |
| Hauptenergieträger | `hauptenergietraeger` | `hauptenergietrager` (ohne ä) |

---

## 2. Feld-Mapping (Propstack API → ACF field_name)

```typescript
const FIELD_MAP: Record<string, string> = {
  // Gruppe 1: Objekt / Adresse
  'city':                    'city',
  'zip_code':                'plz',
  'street':                  'street',
  'house_number':            'hausnummer',
  'hide_address':            'anonym',

  // Gruppe 2: Größe & Zustand
  'number_of_rooms':         'zimmer',
  'living_space':            'spaceqm',
  'usable_floor_space':      'usable_space_qm',
  'plot_area':               'usable_propertie_space_qm',
  'number_of_floors':        'floors_total',
  'construction_year':       'baujahr',
  'free_from':               'verf_gbar',

  // Gruppe 3: Preise
  'base_rent':               'cold_rent',
  'service_charge':          'service_charge',
  'heating_costs':           'heizkosten',
  'total_rent':              'full_rent',
  'price':                   'kaufpreis',
  'deposit':                 'kaution',

  // Gruppe 4: Ausstattung
  'number_of_bed_rooms':     'bedrooms',
  'number_of_bath_rooms':    'bathrooms',

  // Gruppe 5: Energie
  'energy_efficiency_value': 'endenergiebedarf',

  // Gruppe 6: Provision
  'courtage':                'provisionshohe',
  'courtage_note':           'provisionshinweis',

  // Gruppe 8: Google Maps
  'address':                 'adresse',

  // Gruppe 9: Beschreibungen
  'description_note':        'objektbeschreibung',
  'furnishing_note':         'ausstattung',
  'location_note':           'lagebeschreibung',
  'other_note':              'sonstiges',
};
```

---

## 3. Enum-Mappings

### 3.1 Objekttyp (LIVING/COMMERCIAL → gewerblich_wohnen)

```typescript
const OBJECT_TYPE_MAP: Record<string, string> = {
  'LIVING':     'wohnen',
  'COMMERCIAL': 'gewerblich',
  'INVESTMENT': 'gewerblich',
};
```

### 3.2 Wohnungstyp (rs_category → wohnungstyp ID)

```typescript
const WOHNUNGSTYP_MAP: Record<string, string> = {
  'ROOF_STOREY':        '1',  // Dachgeschoss
  'LOFT':               '2',
  'MAISONETTE':         '3',
  'PENTHOUSE':          '4',
  'TERRACED_FLAT':      '5',  // Terrassenwohnung
  'GROUND_FLOOR':       '6',  // Erdgeschosswohnung
  'APARTMENT':          '7',  // Etagenwohnung
  'RAISED_GROUND_FLOOR':'8',  // Hochparterre
  'HALF_BASEMENT':      '9',  // Souterrain
};
```

### 3.3 Haustyp (rs_category → haustypen ID)

```typescript
const HAUSTYP_MAP: Record<string, string> = {
  'SINGLE_FAMILY_HOUSE':  '6',  // freistehendes EFH
  'SEMIDETACHED_HOUSE':   '2',  // Doppelhaushälfte
  'MID_TERRACE_HOUSE':    '3',  // Reihenmittelhaus
  'TERRACE_END_HOUSE':    '4',  // Reihenendhaus
  'VILLA':                '5',
  'TWO_FAMILY_HOUSE':     '7',  // Zweifamilienhaus
  'MULTI_FAMILY_HOUSE':   '8',  // Mehrfamilienhaus
  'FARMHOUSE':            '10', // Bauernhaus
};
```

### 3.4 Heizungsart (heating_type → heizungsart ID)

```typescript
const HEIZUNGSART_MAP: Record<string, string> = {
  'Zentralheizung':     '4',
  'Etagenheizung':      '2',
  'Ofenheizung':        '3',
  'Blockheizkraftwerk': '5',
  'Elektro-Heizung':    '6',
  'Fernwärme':          '7',
  'Gas-Heizung':        '8',
  'Holz-Pelletheizung': '9',
  'Öl-Heizung':         '11',
  'Solarheizung':       '12',
  'Wärmepumpe':         '13',
};
```

### 3.5 Energieeffizienzklasse (energy_efficiency_class → energieeffizienzklasse ID)

```typescript
const EFFIZIENZ_MAP: Record<string, string> = {
  'A':  '1',
  'B':  '2',
  'C':  '3',
  'D':  '4',
  'E':  '5',
  'F':  '6',
  'G':  '7',
  'H':  '8',
  'I':  '9',
  'J':  '10',
  'A+': '11',
};
```

### 3.6 Heizkosten in Nebenkosten

```typescript
const HK_IN_NK_MAP: Record<string, string> = {
  'true':  '1',  // ja
  'false': '0',  // nein
};
```

### 3.7 Ausstattungs-Booleans → ACF-Auswahlkästchen-Labels

ACF speichert Checkboxen als Array von Labels (nicht IDs).

```typescript
const AUSSTATTUNG_BOOL_TO_ACF: Record<string, string> = {
  'balcony':             'Balkon/Terrasse',
  'guest_toilet':        'Gäste-WC',
  'garden':              'Garten/-mitbenutzung',
  'built_in_kitchen':    'Einbauküche',
  'cellar':              'Keller',
  'lift':                'Personenaufzug',
  'barrier_free':        'Stufenloser Zugang',
  'flat_share_suitable': 'WG-geeignet',
  'storeroom':           'Abstellkammer',
  'loggia':              'Loggia',
};
```

### 3.8 Bodenbelag

```typescript
const FLOORING_TO_ACF: Record<string, string> = {
  'Laminat':      'Laminat',
  'Fliesen':      'Fliesen',
  'Stein':        'Steinzeug',
  'Parkett':      'Parkett',
  'Teppichboden': 'textiler Belag',
  'PVC':          'PVC Belag',
};
```

### 3.9 WordPress-Kategorien

```typescript
const MARKETING_TO_WP_CATEGORY: Record<string, string> = {
  'RENT': 'mieten',
  'BUY':  'kaufen',
};

const OBJEKTART_TO_WP_CATEGORY: Record<string, string> = {
  'APARTMENT':  'eigentumswohnung',
  'HOUSE':      'kaufen',
  'OFFICE':     'gewerbe-kaufen',
  'TRADE_SITE': 'grundstuecke-bauland',
  // TODO: Rest mit tatsächlichen WP-Kategorien abgleichen
};
```

### 3.10 Post-Status

```typescript
const STATUS_MAP: Record<number, 'publish' | 'draft'> = {
  254061: 'publish',  // Vermarktung
  254062: 'publish',  // Reserviert
  254063: 'publish',  // Abgeschlossen (Referenz)
  254059: 'draft',    // Akquise
  254060: 'draft',    // Vorbereitung
};
```

---

## 4. Ausstattungsmerkmale zusammenbauen

```typescript
function buildAusstattungsmerkmale(propstackUnit: PropstackUnit): string[] {
  const merkmale: string[] = [];

  for (const [psField, acfLabel] of Object.entries(AUSSTATTUNG_BOOL_TO_ACF)) {
    if (propstackUnit[psField] === true) {
      merkmale.push(acfLabel);
    }
  }

  const flooring = propstackUnit.flooring_type?.value;
  if (Array.isArray(flooring)) {
    for (const f of flooring) {
      const acfLabel = FLOORING_TO_ACF[f.trim()];
      if (acfLabel) merkmale.push(acfLabel);
    }
  }

  return merkmale;
}
```

---

## 5. Nicht-1:1-Felder (bleiben in Beschreibungstexten)

Propstack hat **keine** dedizierten Felder für:

- Handtuchheizkörper
- Fußbodenheizung
- Kabel TV
- Miniküche, möbliert, teilmöbliert, Küchenmöbel
- Hauswirtschaftsraum
- Dusche, Wanne
- Sat-Anlage

Diese Merkmale bleiben Bestandteil der Freitext-Felder (`objektbeschreibung`,
`ausstattung`, `lagebeschreibung`, `sonstiges`) und werden nicht separat gemappt.
