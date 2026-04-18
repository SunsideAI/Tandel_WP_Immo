# Tandel Propstack → WordPress Sync Service

## Projektbeschreibung

Echtzeit-Sync-Service für die Tandel Immobilien GmbH (Immobilienmakler in Halle/Saale). Propstack (CRM) ist der Master — Änderungen dort werden per Webhook sofort auf die WordPress-Website (tandel.immobilien) synchronisiert.

## Architektur

```
Propstack Webhook (property_created / property_updated)
    ↓
Railway Service (Node.js/TypeScript, dieses Repo)
    ├── HMAC soft-check (X-Propstack-Signature)
    ├── GET Propstack API /v1/units/{id}?new=1
    ├── Feld-Mapping: Propstack → ACF-Feldnamen
    ├── POST /wp-json/tandel/v1/sync        (Stufe 1: Daten + ACF-Felder)
    └── POST /wp-json/tandel/v1/sync/images  (Stufe 2: Bilder async)
            ↓
WordPress Bridge-Plugin (PHP, im Repo unter wordpress-plugin/)
    ├── API-Key prüfen (X-Tandel-Api-Key)
    ├── wp_insert_post() / wp_update_post()
    ├── update_field() für jedes ACF-Feld
    ├── media_sideload_image() für Bilder
    └── Response: { wp_post_id, status }
```

Kein Supabase, kein Drittanbieter-Tool im Sync-Flow. Nur Propstack → Railway → WordPress.

## Offene Aufgabe: Supabase-Dependency entfernen

Im aktuellen Repo ist Supabase noch als Dependency enthalten. Das muss raus:

1. `src/db/supabase.ts` — löschen
2. Alle Imports von supabase in anderen Dateien entfernen
3. `SUPABASE_URL` + `SUPABASE_KEY` aus `.env.example` und `config.ts` entfernen
4. Supabase-Calls in `sync.ts`, `webhook.ts` etc. durch `logger.info()` / `console.log()` ersetzen
5. `@supabase/supabase-js` aus `package.json` dependencies entfernen
6. `supabase/migrations/` Ordner kann als Doku bleiben, aber nicht referenziert werden

Grund: Das Bridge-Plugin in WordPress übernimmt das gesamte Mapping (propstack_id → wp_post_id) über WordPress post_meta. Der Service braucht keine eigene Datenbank.

## Feld-Mapping (Single Source of Truth)

Siehe `docs/propstack_acf_mapping.md` im Repo. Kritische Feldnamen, die anders heißen als erwartet:

| Beschreibung | FALSCH | RICHTIG (ACF field_name) |
|---|---|---|
| Wohnfläche | wohnflaeche | **spaceqm** |
| Grundstücksfläche | grundstuecksflaeche | **usable_propertie_space_qm** |
| Kaltmiete | kaltmiete | **cold_rent** |
| Gesamtmiete | gesamtmiete | **full_rent** |
| Verfügbar ab | verfuegbar_ab | **verf_gbar** |
| Ausstattungsbeschreibung | ausstattungsbeschreibung | **ausstattung** |
| Provisionshöhe | provisionshoehe | **provisionshohe** |
| Haustyp | haustyp | **haustypen** |
| Hauptenergieträger | hauptenergietraeger | **hauptenergietrager** |

## Propstack API

- Base: `https://api.propstack.de/v1/`
- Auth: Header `X-API-KEY: <key>`
- Objekt lesen: `GET /v1/units/{id}?new=1`
- Webhooks: `property_created`, `property_updated` (auch bei Löschung)
- Kein `property_deleted` Event — bei Löschung kommt `property_updated`, dann liefert `GET /v1/units/{id}` 404
- Webhook-Signatur: Header `X-Propstack-Signature`, HMAC-SHA256 (optional, nur wenn Secret gesetzt)

## WordPress Bridge-Plugin

Liegt unter `wordpress-plugin/tandel-propstack-bridge/`. Registriert:
- `POST /wp-json/tandel/v1/sync` — Objekt anlegen/aktualisieren
- `POST /wp-json/tandel/v1/sync/images` — Bilder nachladen (Stufe 2)
- `POST /wp-json/tandel/v1/sync/delete` — Objekt auf Draft setzen
- `GET /wp-json/tandel/v1/lookup?propstack_id=123` — WP-Post-ID nachschlagen
- Auth: Header `X-Tandel-Api-Key` gegen `TANDEL_SYNC_API_KEY` in wp-config.php

Der Post Type in WordPress heißt `immobilie` (Singular). Ist über das Theme registriert (nicht ACF, nicht Plugin). Das Bridge-Plugin setzt `show_in_rest = true` zur Laufzeit.

## Bilder: 2-Stufen-Ansatz

Stufe 1 (synchron): Post + alle ACF-Felder → schnell (<2s)
Stufe 2 (async): Bilder downloaden + in WP-Mediathek hochladen → langsam (2-5s pro Bild)

ACF-Bild-Felder:
- `field_data_field_upload_image` — Hauptbild (ACF Image, einzelne Media-ID)
- `bild_1` — Galerie (ACF Gallery PRO, Array von Media-IDs)

## Propstack Status-IDs (Account Tandel)

| ID | Name | → WP post_status |
|---|---|---|
| 254059 | Akquise | draft |
| 254060 | Vorbereitung | draft |
| 254061 | Vermarktung | publish |
| 254062 | Reserviert | publish |
| 254063 | Abgeschlossen | publish |

## Enum-Mappings (Propstack → ACF Auswahl-IDs)

### object_type → gewerblich_wohnen
LIVING → "wohnen", COMMERCIAL → "gewerblich", INVESTMENT → "gewerblich"

### rs_category → wohnungstyp (ACF-ID als String)
ROOF_STOREY→"1", LOFT→"2", MAISONETTE→"3", PENTHOUSE→"4", TERRACED_FLAT→"5",
GROUND_FLOOR→"6", APARTMENT→"7", RAISED_GROUND_FLOOR→"8", HALF_BASEMENT→"9"

### rs_category → haustypen (ACF-ID als String)
SINGLE_FAMILY_HOUSE→"6", SEMIDETACHED_HOUSE→"2", MID_TERRACE_HOUSE→"3",
TERRACE_END_HOUSE→"4", VILLA→"5", TWO_FAMILY_HOUSE→"7", MULTI_FAMILY_HOUSE→"8", FARMHOUSE→"10"

### energy_efficiency_class → energieeffizienzklasse
A→"1", B→"2", C→"3", D→"4", E→"5", F→"6", G→"7", H→"8", A+→"11"

### Ausstattungsmerkmale (Propstack boolean → ACF Checkbox-Labels)
balcony→"Balkon/Terrasse", guest_toilet→"Gäste-WC", garden→"Garten/-mitbenutzung",
built_in_kitchen→"Einbauküche", cellar→"Keller", lift→"Personenaufzug",
barrier_free→"Stufenloser Zugang", flat_share_suitable→"WG-geeignet",
storeroom→"Abstellkammer", loggia→"Loggia"

### Bodenbelag (Propstack flooring_type → ACF Checkbox-Labels)
Laminat→"Laminat", Fliesen→"Fliesen", Stein→"Steinzeug",
Parkett→"Parkett", Teppichboden→"textiler Belag", PVC→"PVC Belag"

## Environment Variables (Railway)

```env
PROPSTACK_API_KEY=<propstack-api-v1-key>
PROPSTACK_WEBHOOK_SECRET=<min-32-zeichen>
WP_BRIDGE_URL=https://tandel.immobilien/wp-json/tandel/v1/sync
WP_BRIDGE_API_KEY=<gleicher-key-wie-TANDEL_SYNC_API_KEY-in-wp-config>
PORT=3000
NODE_ENV=production
```

## Endpoints des Railway-Service

- `POST /webhook/propstack` — Webhook-Empfang
- `GET /health` — Health-Check
- `GET /status` — Sync-Statistiken
- `POST /sync/full` — Manueller Voll-Sync aller Propstack-Objekte
- `POST /sync/one/:id` — Einzelnes Objekt syncen

## Testing

Staging-Umgebung: `tandel.immobilien/staging/`
Bridge-Plugin wird dort zuerst installiert und getestet.
Webhook-URLs zeigen initial auf Staging, nach Freigabe auf Live.

## Kontext

- 144 Immobilien sind bereits in Propstack (TI-1000 bis TI-1143)
- WordPress hat ~1.657 Immobilien-Posts (alt, aus der WP-Ära)
- Die WP-Posts werden durch den Sync-Service aktualisiert/neuangelegt
- Propstack flooring_type ist ein Multi-Select-Array mit deutschen Strings
