# Tandel Propstack → WordPress Sync: Aktualisierter Plan
## Ergänzung zum Hauptplan (tandel_sync_service_plan.md)
## Stand: 19. April 2026

---

## Erkenntnisse aus der Vorab-Prüfung

### 1. Post Type NICHT REST-fähig
`/wp-json/wp/v2/immobilien` gibt 404 zurück.
Der Custom Post Type `immobilie` hat `show_in_rest = false` (oder es fehlt ganz).

### 2. Post Type NICHT über ACF registriert
`/wp-admin/admin.php?page=acf-post-type` → "Nicht berechtigt".
Der Post Type ist vermutlich in der **functions.php des Themes** oder in einem Custom Plugin registriert.
Muss im Theme-Code gefunden und `show_in_rest => true` ergänzt werden.

### 3. Konsequenz: Bridge-Plugin nötig
Die Standard-WP-REST-API kann den Post Type nicht ansprechen.
Selbst wenn wir `show_in_rest` aktivieren, sind ACF-Felder über die Standard-REST-API
nicht zuverlässig schreibbar (ACF-Galerie, Beitrags-Objekt-Felder etc.).
→ **Lösung: Ein eigenes WordPress-Plugin als Brücke.**

---

## Geänderte Architektur

```
Propstack (Webhook: property_created / property_updated)
    │
    ▼
Railway Service (Node.js/TypeScript)
    ├── POST /webhook/propstack empfangen
    ├── HMAC-Signatur prüfen
    ├── GET Propstack API /v1/units/{id}?new=1 (vollständige Daten nachladen)
    ├── Feld-Mapping anwenden (Propstack → ACF field_names)
    ├── Bilder-URLs aus Propstack extrahieren
    └── POST https://tandel.immobilien/wp-json/tandel/v1/sync
            │
            ▼
WordPress Bridge-Plugin (tandel-propstack-bridge.php)
    ├── API-Key aus Header prüfen
    ├── Propstack-ID → bestehenden WP-Post finden (meta_key lookup)
    ├── wp_insert_post() oder wp_update_post()
    ├── update_field() für jedes ACF-Feld
    ├── media_sideload_image() für Bilder
    ├── set_post_thumbnail() für Hauptbild
    ├── wp_set_post_terms() für Kategorien
    └── Response: { wp_post_id: 12345, status: "created" | "updated" }
```

---

## Komponente 1: WordPress Bridge-Plugin

### Datei: tandel-propstack-bridge/tandel-propstack-bridge.php

```php
<?php
/**
 * Plugin Name: Tandel Propstack Bridge
 * Description: REST-Endpoint für Propstack→WordPress Sync
 * Version: 1.0
 */

// ============================================================
// 1. Post Type REST-fähig machen
// ============================================================
add_action('init', function() {
    // Falls der Post Type in functions.php registriert ist,
    // überschreiben wir hier show_in_rest
    global $wp_post_types;
    if (isset($wp_post_types['immobilie'])) {
        $wp_post_types['immobilie']->show_in_rest = true;
        $wp_post_types['immobilie']->rest_base = 'immobilien';
    }
}, 99);

// ============================================================
// 2. REST-Endpoint registrieren
// ============================================================
add_action('rest_api_init', function() {
    register_rest_route('tandel/v1', '/sync', [
        'methods'  => 'POST',
        'callback' => 'tandel_handle_sync',
        'permission_callback' => 'tandel_check_api_key',
    ]);

    register_rest_route('tandel/v1', '/sync/delete', [
        'methods'  => 'POST',
        'callback' => 'tandel_handle_delete',
        'permission_callback' => 'tandel_check_api_key',
    ]);

    register_rest_route('tandel/v1', '/lookup', [
        'methods'  => 'GET',
        'callback' => 'tandel_handle_lookup',
        'permission_callback' => 'tandel_check_api_key',
    ]);
});

// ============================================================
// 3. Auth: API-Key prüfen
// ============================================================
function tandel_check_api_key($request) {
    $key = $request->get_header('X-Tandel-Api-Key');
    $expected = defined('TANDEL_SYNC_API_KEY')
        ? TANDEL_SYNC_API_KEY
        : get_option('tandel_sync_api_key');
    return $key && hash_equals($expected, $key);
}

// ============================================================
// 4. Sync-Handler: Objekt anlegen/aktualisieren
// ============================================================
function tandel_handle_sync($request) {
    $data = $request->get_json_params();

    $propstack_id = intval($data['propstack_id'] ?? 0);
    if (!$propstack_id) {
        return new WP_Error('missing_id', 'propstack_id fehlt', ['status' => 400]);
    }

    // Bestehenden Post finden
    $existing = get_posts([
        'post_type'   => 'immobilie',
        'meta_key'    => 'propstack_id',
        'meta_value'  => $propstack_id,
        'post_status' => 'any',
        'numberposts' => 1,
    ]);

    $post_data = [
        'post_type'    => 'immobilie',
        'post_title'   => sanitize_text_field($data['title'] ?? ''),
        'post_status'  => $data['post_status'] ?? 'publish',
        'post_content' => '',  // Content ist in ACF-Feldern
    ];

    if ($existing) {
        $post_data['ID'] = $existing[0]->ID;
        $post_id = wp_update_post($post_data, true);
    } else {
        $post_id = wp_insert_post($post_data, true);
    }

    if (is_wp_error($post_id)) {
        return $post_id;
    }

    // Propstack-ID als Meta speichern (für Lookup)
    update_post_meta($post_id, 'propstack_id', $propstack_id);
    if (!empty($data['propstack_unit_id'])) {
        update_post_meta($post_id, 'propstack_unit_id', $data['propstack_unit_id']);
    }

    // ACF-Felder updaten
    if (!empty($data['acf_fields']) && function_exists('update_field')) {
        foreach ($data['acf_fields'] as $field_name => $value) {
            update_field($field_name, $value, $post_id);
        }
    }

    // Kategorien setzen
    if (!empty($data['categories'])) {
        wp_set_object_terms($post_id, $data['categories'], 'category');
    }

    // Bilder verarbeiten
    $image_ids = [];
    if (!empty($data['images'])) {
        require_once(ABSPATH . 'wp-admin/includes/media.php');
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        require_once(ABSPATH . 'wp-admin/includes/image.php');

        foreach ($data['images'] as $i => $img) {
            $url = $img['url'];
            $ps_img_id = $img['propstack_image_id'] ?? null;

            // Prüfen ob Bild schon existiert
            if ($ps_img_id) {
                $existing_media = get_posts([
                    'post_type'   => 'attachment',
                    'meta_key'    => 'propstack_image_id',
                    'meta_value'  => $ps_img_id,
                    'numberposts' => 1,
                ]);
                if ($existing_media) {
                    $image_ids[] = $existing_media[0]->ID;
                    continue;
                }
            }

            // Bild herunterladen und in Mediathek laden
            $media_id = media_sideload_image($url, $post_id, '', 'id');
            if (!is_wp_error($media_id)) {
                if ($ps_img_id) {
                    update_post_meta($media_id, 'propstack_image_id', $ps_img_id);
                }
                $image_ids[] = $media_id;
            }
        }

        // Hauptbild setzen (erstes Bild)
        if (!empty($image_ids)) {
            set_post_thumbnail($post_id, $image_ids[0]);
            update_field('field_data_field_upload_image', $image_ids[0], $post_id);

            // Galerie (alle außer dem ersten)
            if (count($image_ids) > 1) {
                update_field('bild_1', array_slice($image_ids, 1), $post_id);
            }
        }
    }

    return rest_ensure_response([
        'wp_post_id'  => $post_id,
        'status'      => $existing ? 'updated' : 'created',
        'images_count' => count($image_ids),
    ]);
}

// ============================================================
// 5. Delete-Handler: Post auf Draft setzen
// ============================================================
function tandel_handle_delete($request) {
    $data = $request->get_json_params();
    $propstack_id = intval($data['propstack_id'] ?? 0);

    $existing = get_posts([
        'post_type'   => 'immobilie',
        'meta_key'    => 'propstack_id',
        'meta_value'  => $propstack_id,
        'post_status' => 'any',
        'numberposts' => 1,
    ]);

    if (!$existing) {
        return rest_ensure_response(['status' => 'not_found']);
    }

    wp_update_post([
        'ID'          => $existing[0]->ID,
        'post_status' => 'draft',
    ]);

    return rest_ensure_response([
        'wp_post_id' => $existing[0]->ID,
        'status'     => 'archived',
    ]);
}

// ============================================================
// 6. Lookup: WP-Post-ID anhand Propstack-ID finden
// ============================================================
function tandel_handle_lookup($request) {
    $propstack_id = intval($request->get_param('propstack_id'));

    $existing = get_posts([
        'post_type'   => 'immobilie',
        'meta_key'    => 'propstack_id',
        'meta_value'  => $propstack_id,
        'post_status' => 'any',
        'numberposts' => 1,
    ]);

    if (!$existing) {
        return rest_ensure_response(['found' => false]);
    }

    return rest_ensure_response([
        'found'      => true,
        'wp_post_id' => $existing[0]->ID,
        'status'     => $existing[0]->post_status,
    ]);
}
```

### wp-config.php Ergänzung (auf Staging + Live)
```php
define('TANDEL_SYNC_API_KEY', 'ein-langer-zufälliger-key-hier-min-32-zeichen');
```

### Installation
1. Plugin-Ordner `tandel-propstack-bridge` in `/wp-content/plugins/` anlegen
2. `tandel-propstack-bridge.php` dort ablegen
3. In WP-Admin → Plugins → Aktivieren
4. `TANDEL_SYNC_API_KEY` in `wp-config.php` setzen

---

## Komponente 2: Railway Service (Node.js)

### Geänderter Scope

Der Railway-Service wird **einfacher** als im Originalplan, weil die WordPress-Logik
jetzt im Bridge-Plugin liegt. Der Service macht nur noch:

1. **Webhook empfangen** + HMAC prüfen
2. **Propstack API** aufrufen (vollständige Daten nachladen)
3. **Feld-Mapping** anwenden (Propstack → ACF field_names)
4. **Einen einzigen POST** an das Bridge-Plugin schicken

### Request-Format an das Bridge-Plugin

```typescript
// POST https://tandel.immobilien/wp-json/tandel/v1/sync
// Header: X-Tandel-Api-Key: <key>

interface SyncPayload {
  propstack_id: number;           // Propstack-Objekt-ID
  propstack_unit_id?: string;     // z.B. "TI-1042"
  title: string;                  // Überschrift
  post_status: 'publish' | 'draft';

  acf_fields: {
    // Gruppe 1: Objekt / Adresse
    city: string;
    plz: string;
    street: string;
    hausnummer: string;
    anonym: boolean;
    gewerblich_wohnen: string;    // "wohnen" oder "gewerblich"
    wohnungstyp: string;          // ACF-ID als String, z.B. "7"
    haustypen: string;            // ACF-ID als String, z.B. "6"
    etage_der_wohnung: string;
    etage_der_gewerbeeinheit: string;

    // Gruppe 2: Größe & Zustand
    zimmer: string;
    spaceqm: number;
    usable_space_qm: number;
    usable_propertie_space_qm: number;
    floors_total: string;
    baujahr: string;
    verf_gbar: string;

    // Gruppe 3: Preise
    cold_rent: number;
    service_charge: number;
    heizkosten: number;
    heizkosten_sind_in_nebenkosten_enthalten: string;  // "1" oder "0"
    full_rent: number;
    kaufpreis: number;
    kaufpreis_anfrage: string;

    // Gruppe 4: Ausstattung
    bedrooms: string;
    bathrooms: string;
    qualitat_der_ausstattung: string;  // ACF-ID
    ausstattungsmerkmale: string[];    // Array von Labels
    garage_stellplatz: string[];       // Array von Labels
    garage_stellplatz_info: string;
    haustiere: string;                 // ACF-ID
    extras: string;

    // Gruppe 5: Energie
    heizungsart: string;               // ACF-ID
    hauptenergietrager: string;        // ACF-ID
    energieausweis: string;            // ACF-ID
    endenergiebedarf: string;
    energieeffizienzklasse: string;    // ACF-ID

    // Gruppe 6: Kaution & Provision
    kaution: number;
    provision: string;                 // ACF-ID
    provisionshohe: string;
    provisionshinweis: string;

    // Gruppe 8: Google Maps
    adresse: string;

    // Gruppe 9: Beschreibungen
    objektbeschreibung: string;        // HTML (WYSIWYG)
    ausstattung: string;               // HTML (WYSIWYG)
    lagebeschreibung: string;          // HTML (WYSIWYG)
    sonstiges: string;                 // HTML (WYSIWYG)

    // Gruppe 11: Intern
    notizen_vermerke: string;
  };

  categories: string[];  // WP-Kategorie-Slugs, z.B. ["mieten"]

  images: Array<{
    url: string;                // Propstack-CDN-URL
    propstack_image_id: number; // Für Duplikat-Erkennung
    is_floorplan: boolean;
    title?: string;
  }>;
}
```

### Projektstruktur (aktualisiert)

```
tandel-propstack-sync/
├── src/
│   ├── index.ts                  # Express App
│   ├── config.ts                 # Env-Vars
│   ├── routes/
│   │   ├── webhook.ts            # POST /webhook/propstack
│   │   ├── health.ts             # GET /health
│   │   └── sync.ts               # POST /sync/full (manueller Trigger)
│   ├── services/
│   │   ├── propstack.ts          # Propstack API Client
│   │   ├── wordpress-bridge.ts   # HTTP-Client für Bridge-Plugin
│   │   └── mapper.ts             # Propstack → SyncPayload Mapping
│   ├── mappings/
│   │   ├── fields.ts             # Feld-Mapping
│   │   └── enums.ts              # Enum-Mappings
│   ├── middleware/
│   │   └── hmac.ts               # Webhook-Signatur prüfen
│   └── utils/
│       └── logger.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

### Environment Variables (Railway)

```env
# Propstack
PROPSTACK_API_KEY=nVqlPh9bChmmYf2OugnG3X85u05v-wa6NNRkXrTv
PROPSTACK_WEBHOOK_SECRET=<min 32 Zeichen>

# WordPress Bridge-Plugin
WP_BRIDGE_URL=https://tandel.immobilien/wp-json/tandel/v1/sync
WP_BRIDGE_DELETE_URL=https://tandel.immobilien/wp-json/tandel/v1/sync/delete
WP_BRIDGE_API_KEY=<gleicher Key wie TANDEL_SYNC_API_KEY in wp-config.php>

# Supabase (für Mapping-Tabelle + Logging)
SUPABASE_URL=https://ctucmljvatphzgnfhycu.supabase.co
SUPABASE_KEY=<anon oder service_role key>

# Service
PORT=3000
NODE_ENV=production
```

---

## Wo den Post Type finden?

Der Post Type `immobilie` ist vermutlich registriert in:
- **Theme functions.php:** `/wp-content/themes/<aktives-theme>/functions.php`
- **Oder einem Custom Plugin**

### So finden wir es (auf Staging per WP-Admin):

1. Gehe zu: `tandel.immobilien/staging/wp-admin/plugins.php`
2. Suche nach einem Plugin mit "Immobilie" oder "Makler" im Namen
3. Falls keins → liegt es im Theme

### Alternative: Über die Bridge-Plugin-Lösung (empfohlen)

Das Bridge-Plugin setzt `show_in_rest = true` automatisch per Hook (Priorität 99).
Wir müssen also NICHT den Originalcode finden und editieren.
Das Plugin überschreibt einfach die Einstellung zur Laufzeit.

---

## Geänderte Zeitschätzung

| Aufgabe | Geschätzt |
|---|---|
| **WordPress Bridge-Plugin** | |
| Plugin-Grundgerüst + Auth | 1h |
| Sync-Handler (wp_insert_post + update_field) | 2h |
| Bilder-Handler (media_sideload_image) | 2h |
| Delete/Archive-Handler | 0.5h |
| Testing auf Staging | 1h |
| **Railway Service** | |
| Projekt-Setup (Express, TS, Docker) | 1h |
| Webhook-Handler + HMAC | 1h |
| Propstack API Client | 1h |
| Mapper (Propstack → Bridge-Payload) | 2h |
| Full-Sync Endpoint | 1h |
| Error Handling + Logging + Supabase | 1.5h |
| Testing | 1.5h |
| **Gesamt** | **~15-16h** |

---

## Deploymentreihenfolge

1. **Bridge-Plugin** auf Staging installieren und testen
   - Plugin hochladen → aktivieren → TANDEL_SYNC_API_KEY in wp-config.php
   - Manuell testen: `curl -X POST .../wp-json/tandel/v1/sync` mit Test-Payload

2. **Railway-Service** deployen
   - Env-Vars setzen (Staging-URLs)
   - Health-Check prüfen

3. **Propstack Webhooks** auf Railway zeigen
   - Hooks registrieren (property_created + property_updated)
   - Test: In Propstack ein Objekt ändern → erscheint auf Staging?

4. **Full-Sync** über Railway auslösen
   - POST /sync/full → alle 144 Objekte abgleichen

5. **Live-Schaltung**
   - Bridge-Plugin auf Live-WP installieren
   - Railway Env-Vars auf Live-URLs umstellen
   - Propstack-Webhook-URLs auf Live umstellen

---

## Noch zu klären (nicht blockierend für Entwicklungsstart)

1. **WP-Kategorien:** Paul muss noch die Kategorie-Slugs auslesen
   Sobald Bridge-Plugin installiert ist, geht das per:
   `curl -H "X-Tandel-Api-Key: ..." .../wp-json/wp/v2/categories?per_page=100`

2. **Post Type Slug:** Ist es `immobilie` (Singular) oder `immobilien` (Plural)?
   Im WP-Admin-URL steht `post_type=immobilie` → es ist `immobilie`.

3. **ACF-Lizenz:** Die ACF PRO Lizenz ist abgelaufen (Banner in den Screenshots).
   `update_field()` funktioniert trotzdem — aber keine Updates/Support mehr.
   Für Galerie-Felder (ACF PRO Feature) sollte die Lizenz idealerweise erneuert werden.
