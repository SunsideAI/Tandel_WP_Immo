# Tandel Propstack → WordPress Sync Service
## Detaillierter Entwicklungsplan für Claude Code / Railway

---

## 1. Projektübersicht

### Ziel
Ein Webhook-basierter Microservice, der Änderungen in Propstack (CRM) in Echtzeit auf die WordPress-Website von Tandel Immobilien (tandel.immobilien) synchronisiert. Propstack ist der Master, WordPress zeigt die Daten an.

### Architektur
```
Propstack (Master)
    │
    ├── property_created  ──┐
    ├── property_updated  ──┼── POST Webhook ──→  Railway Service  ──→  WordPress REST API
    └── (property deleted) ─┘                     (Node.js/Express)      (ACF Custom Fields)
                                                       │
                                                       ├── Bilder von Propstack CDN laden
                                                       ├── WP-Mediathek befüllen
                                                       ├── ACF-Felder updaten
                                                       └── Logs + Health-Endpoint
```

### Tech Stack
- **Runtime:** Node.js (TypeScript empfohlen)
- **Framework:** Express.js oder Fastify
- **Hosting:** Railway.app
- **WordPress-Anbindung:** WP REST API + Application Passwords
- **Propstack-Anbindung:** Propstack API V1 + Webhooks
- **Logging:** Railway Logs (stdout/stderr) + optional Sentry

---

## 2. Voraussetzungen & Zugangsdaten

### Propstack
- **API Key (V1):** `nVqlPh9bChmmYf2OugnG3X85u05v-wa6NNRkXrTv`
- **API Base:** `https://api.propstack.de/v1/`
- **Auth:** Header `X-API-KEY: <key>` oder URL-Parameter `api_key=<key>`
- **Webhook Secret:** Frei wählbar, wird beim Hook-Registrieren in Propstack UI hinterlegt

### WordPress
- **Site URL:** `https://tandel.immobilien` (Live) / `https://tandel.immobilien/staging` (Test)
- **REST API Base:** `https://tandel.immobilien/wp-json/wp/v2/`
- **Post Type:** `immobilie` (Custom Post Type, registriert via ACF)
- **Auth:** WordPress Application Passwords (Benutzer: Nico Tandel → Profil → Application Passwords → neues Passwort generieren)
- **ACF REST:** Muss aktiviert sein (in ACF Feldgruppen-Einstellungen: "In REST-API anzeigen" = Ja)

### Environment Variables (Railway)
```env
# Propstack
PROPSTACK_API_KEY=nVqlPh9bChmmYf2OugnG3X85u05v-wa6NNRkXrTv
PROPSTACK_WEBHOOK_SECRET=<frei wählbar, min 32 Zeichen>

# WordPress
WP_BASE_URL=https://tandel.immobilien
WP_USERNAME=<wp-admin-username>
WP_APP_PASSWORD=<application-password aus wp-admin>
WP_POST_TYPE=immobilie

# Service
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

---

## 3. Endpoints des Services

### POST /webhook/propstack
Empfängt Webhooks von Propstack.

**Request:**
```json
{
  "event": "property_updated",
  "data": {
    "id": 5297296,
    "title": "Luxuriöse 4 Raumwohnung...",
    "street": "Jacobstraße",
    "house_number": "23",
    // ... alle Propstack-Felder
  },
  "changed_attributes": ["price", "title"]  // nur bei updates
}
```

**Headers:**
- `X-Propstack-Signature`: HMAC-SHA256 des Body mit dem Secret Key
- `Content-Type: application/json`

**Response:**
- `200 OK` + `{"status": "synced", "wp_post_id": 12345}`
- `401 Unauthorized` bei ungültiger Signatur
- `500 Internal Server Error` bei WP-Fehlern

### GET /health
Health-Check für Railway.
```json
{"status": "ok", "uptime": 12345, "last_sync": "2026-04-18T12:00:00Z"}
```

### GET /status
Zeigt Sync-Statistiken.
```json
{
  "total_synced": 144,
  "last_event": "property_updated",
  "last_event_time": "2026-04-18T12:00:00Z",
  "errors_last_24h": 0
}
```

### POST /sync/full (optional, Auth-geschützt)
Manueller Trigger für Voll-Sync aller Propstack-Objekte → WordPress.
Nützlich für den initialen Abgleich und Notfälle.

---

## 4. Kernlogik: Propstack → ACF Mapping

### 4.1 Feld-Mapping (Propstack API → WordPress ACF)

```typescript
// Propstack API Feld → ACF field_name
const FIELD_MAP: Record<string, string> = {
  // Gruppe 1: Objekt / Adresse
  'city':                    'city',
  'zip_code':                'plz',
  'street':                  'street',
  'house_number':            'hausnummer',
  'hide_address':            'anonym',           // boolean → true/false

  // Gruppe 2: Größe & Zustand
  'number_of_rooms':         'zimmer',
  'living_space':            'spaceqm',          // ACHTUNG: nicht "wohnflaeche"!
  'usable_floor_space':      'usable_space_qm',
  'plot_area':               'usable_propertie_space_qm',  // ACHTUNG: Tippfehler im Original!
  'number_of_floors':        'floors_total',
  'construction_year':       'baujahr',
  'free_from':               'verf_gbar',        // ACHTUNG: nicht "verfuegbar"!

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
  'courtage':                'provisionshohe',    // ACHTUNG: ohne "ö"!
  'courtage_note':           'provisionshinweis',

  // Gruppe 8: Google Maps
  'address':                 'adresse',

  // Gruppe 9: Beschreibungen
  'description_note':        'objektbeschreibung',
  'furnishing_note':         'ausstattung',       // ACHTUNG: nicht "ausstattungsbeschreibung"!
  'location_note':           'lagebeschreibung',
  'other_note':              'sonstiges',
};
```

### 4.2 Enum-Mappings (Propstack-Werte → ACF-Auswahl-IDs)

```typescript
// Propstack object_type → ACF gewerblich_wohnen
const OBJECT_TYPE_MAP: Record<string, string> = {
  'LIVING':     'wohnen',
  'COMMERCIAL': 'gewerblich',
  'INVESTMENT': 'gewerblich',  // Kapitalanlage = gewerblich in WP
};

// Propstack rs_category → ACF wohnungstyp (ID als String)
const WOHNUNGSTYP_MAP: Record<string, string> = {
  'ROOF_STOREY':       '1',   // Dachgeschoss
  'LOFT':              '2',
  'MAISONETTE':        '3',
  'PENTHOUSE':         '4',
  'TERRACED_FLAT':     '5',   // Terrassenwohnung
  'GROUND_FLOOR':      '6',   // Erdgeschosswohnung
  'APARTMENT':         '7',   // Etagenwohnung
  'RAISED_GROUND_FLOOR':'8',  // Hochparterre
  'HALF_BASEMENT':     '9',   // Souterrain
};

// Propstack rs_category → ACF haustypen (ID als String)
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

// Propstack heating_type → ACF heizungsart (ID als String)
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

// Propstack energy_efficiency_class → ACF energieeffizienzklasse (ID)
const EFFIZIENZ_MAP: Record<string, string> = {
  'A': '1', 'B': '2', 'C': '3', 'D': '4', 'E': '5',
  'F': '6', 'G': '7', 'H': '8', 'I': '9', 'J': '10', 'A+': '11',
};

// Propstack heating_costs_in_service_charge → ACF Auswahl
const HK_IN_NK_MAP: Record<string, string> = {
  'true':  '1',  // ja
  'false': '0',  // nein
};

// Propstack boolean Ausstattungsfelder → ACF Auswahlkästchen-Werte
// ACF speichert Checkboxen als Array von Labels (nicht IDs)
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

// Propstack flooring_type Werte → ACF Auswahlkästchen-Werte
const FLOORING_TO_ACF: Record<string, string> = {
  'Laminat':      'Laminat',
  'Fliesen':      'Fliesen',
  'Stein':        'Steinzeug',
  'Parkett':      'Parkett',
  'Teppichboden': 'textiler Belag',
  'PVC':          'PVC Belag',
};
```

### 4.3 Ausstattungsmerkmale zusammenbauen

```typescript
function buildAusstattungsmerkmale(propstackUnit: any): string[] {
  const merkmale: string[] = [];

  // Boolean-Felder → Auswahlkästchen-Labels
  for (const [psField, acfLabel] of Object.entries(AUSSTATTUNG_BOOL_TO_ACF)) {
    if (propstackUnit[psField] === true) {
      merkmale.push(acfLabel);
    }
  }

  // Bodenbelag-Werte → Auswahlkästchen-Labels
  const flooring = propstackUnit.flooring_type?.value;
  if (Array.isArray(flooring)) {
    for (const f of flooring) {
      const acfLabel = FLOORING_TO_ACF[f.trim()];
      if (acfLabel) merkmale.push(acfLabel);
    }
  }

  // Zusätzliche erkennbare Ausstattungsmerkmale
  // Propstack hat keine 1:1 Felder für: Handtuchheizkörper, Fußbodenheizung,
  // Kabel TV, Miniküche, möbliert, teilmöbliert, Küchenmöbel, Hauswirtschaftsraum,
  // Dusche, Wanne, Sat Anlage, Aufzug (=lift, schon oben)
  // Diese bleiben in den Beschreibungstexten.

  return merkmale;
}
```

### 4.4 WordPress-Kategorien

Propstack `marketing_type` → WordPress-Kategorie:
```typescript
// Kategorien müssen vorher in WP existieren (per Slug)
const MARKETING_TO_WP_CATEGORY: Record<string, string> = {
  'RENT': 'mieten',       // WP-Kategorie-Slug
  'BUY':  'kaufen',       // WP-Kategorie-Slug
};

// Objektart → zusätzliche WP-Kategorie (optional)
const OBJEKTART_TO_WP_CATEGORY: Record<string, string> = {
  'APARTMENT':              'eigentumswohnung',
  'HOUSE':                  'kaufen',       // oder eigene Kategorie
  'OFFICE':                 'gewerbe-kaufen',
  'TRADE_SITE':             'grundstuecke-bauland',
  // etc. — muss mit den tatsächlichen WP-Kategorien abgeglichen werden
};
```

### 4.5 Post-Status-Mapping

```typescript
// Propstack Status → WordPress Post-Status
const STATUS_MAP: Record<number, string> = {
  254061: 'publish',    // Vermarktung → veröffentlicht
  254062: 'publish',    // Reserviert → veröffentlicht (mit Hinweis im Titel)
  254063: 'publish',    // Abgeschlossen → veröffentlicht (als Referenz)
  254059: 'draft',      // Akquise → Entwurf
  254060: 'draft',      // Vorbereitung → Entwurf
};
```

---

## 5. Bilder-Synchronisation

### Logik
1. Beim Webhook: Propstack liefert `images`-Array mit URLs
2. Service vergleicht mit aktuell in WP hinterlegten Bild-IDs
3. Neue Bilder: Von Propstack-CDN herunterladen → WP-Mediathek hochladen → ACF-Feld aktualisieren
4. Gelöschte Bilder: Aus WP-Mediathek entfernen (optional, oder nur ACF-Referenz löschen)

### WP Media Upload via REST API
```typescript
// Bild von Propstack runterladen
const imageBuffer = await fetch(propstackImageUrl).then(r => r.buffer());

// An WP-Mediathek hochladen
const formData = new FormData();
formData.append('file', imageBuffer, { filename: 'bild.jpg', contentType: 'image/jpeg' });

const wpMedia = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/media`, {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + btoa(`${WP_USERNAME}:${WP_APP_PASSWORD}`),
    'Content-Disposition': 'attachment; filename="bild.jpg"',
  },
  body: imageBuffer,
});

const { id: wpMediaId } = await wpMedia.json();
// wpMediaId wird dann im ACF-Feld referenziert
```

### ACF-Bild-Felder
```typescript
// Hauptbild (einzelnes Bild, ACF type "image")
update_field('field_data_field_upload_image', wpMediaId_hauptbild);

// Galerie (ACF type "gallery", Array von Media-IDs)
update_field('bild_1', [wpMediaId_1, wpMediaId_2, ...]);
```

### Empfehlung zur Bild-Strategie
Beim initialen Sync: Alle Bilder übertragen.
Bei Updates: Nur geänderte Bilder (anhand der Propstack-Bild-ID tracken).
Dafür eine kleine Mapping-Tabelle führen: `propstack_image_id → wp_media_id` (in Railway als JSON-File oder SQLite).

---

## 6. Webhook-Registrierung bei Propstack

### Per API (einmalig ausführen)
```bash
# property_created Hook
curl -X POST "https://api.propstack.de/v1/hooks?api_key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://your-railway-app.railway.app/webhook/propstack", "event": "property_created"}'

# property_updated Hook
curl -X POST "https://api.propstack.de/v1/hooks?api_key=YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://your-railway-app.railway.app/webhook/propstack", "event": "property_updated"}'
```

### Oder in der Propstack UI
Verwaltung → Webhooks → Neuen Webhook anlegen:
- URL: `https://your-railway-app.railway.app/webhook/propstack`
- Event: `property_created` (einen Hook)
- Event: `property_updated` (zweiten Hook)
- Secret Key: Der Wert aus `PROPSTACK_WEBHOOK_SECRET`

### HMAC-Verifizierung (im Service)
```typescript
import crypto from 'crypto';

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

// Im Express Handler:
app.post('/webhook/propstack', (req, res) => {
  const signature = req.headers['x-propstack-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifyWebhook(rawBody, signature, process.env.PROPSTACK_WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Webhook ist authentisch → verarbeiten
});
```

---

## 7. WordPress-Konfiguration (Voraussetzungen)

### 7.1 Application Password erstellen
1. WordPress Admin → Benutzer → Profil von Nico Tandel
2. Runterscrollen zu "Application Passwords"
3. Name eingeben: `Propstack Sync`
4. "Neues Application Password hinzufügen" klicken
5. Das generierte Passwort kopieren → in Railway als `WP_APP_PASSWORD` hinterlegen

### 7.2 ACF REST API aktivieren
Für jede der 11 ACF-Feldgruppen:
1. ACF → Feldgruppen → Feldgruppe bearbeiten
2. Einstellungen → "In REST-API anzeigen" = Ja
3. Speichern

### 7.3 Custom Post Type REST aktivieren
Der Post Type "immobilie" muss `show_in_rest = true` haben.
Falls nicht bereits der Fall, in der functions.php oder dem Plugin, das den Post Type registriert:
```php
register_post_type('immobilie', [
    // ...bestehende Einstellungen...
    'show_in_rest' => true,
    'rest_base'    => 'immobilien',  // URL-Slug für die REST API
]);
```

---

## 8. Sync-Ablauf im Detail

### 8.1 Webhook empfangen
```
1. POST /webhook/propstack empfangen
2. HMAC-Signatur prüfen → 401 wenn ungültig
3. Event-Typ auslesen (property_created / property_updated)
4. Propstack-ID aus Body extrahieren
```

### 8.2 Vollständige Daten von Propstack holen
```
5. GET /v1/units/{id}?new=1 aufrufen (der Webhook-Body enthält nicht immer alle Felder)
6. Vollständiges Property-Objekt empfangen inkl. Bilder, Status, Custom Fields
```

### 8.3 WordPress-Post finden oder erstellen
```
7. In WP suchen: GET /wp-json/wp/v2/immobilien?meta_key=propstack_id&meta_value={id}
   → Wenn gefunden: bestehenden Post updaten (PUT)
   → Wenn nicht gefunden: neuen Post erstellen (POST)
8. Optional: Propstack unit_id (z.B. "TI-1042") als meta_key "propstack_unit_id" speichern
```

### 8.4 ACF-Felder updaten
```
9. Feld-Mapping anwenden (siehe Abschnitt 4)
10. Enum-Mappings anwenden (Propstack-Werte → ACF-Auswahl-IDs)
11. Ausstattungsmerkmale-Array zusammenbauen
12. WP-Kategorien zuweisen (Miete/Kauf + Objektart)
13. PUT /wp-json/wp/v2/immobilien/{post_id} mit ACF-Feldern
```

### 8.5 Bilder synchronisieren
```
14. Bilder-Array aus Propstack-Response lesen
15. Für jedes Bild:
    a. Prüfen ob bereits in WP-Mediathek (via propstack_image_id Meta)
    b. Wenn nicht: herunterladen → POST /wp-json/wp/v2/media → WP-Media-ID merken
16. Hauptbild (erstes Bild) → ACF field_data_field_upload_image
17. Restliche Bilder → ACF bild_1 (Galerie-Array)
18. Altes Beitragsbild (Featured Image) → auf Hauptbild setzen
```

### 8.6 Post-Status setzen
```
19. Propstack property_status → WP post_status (publish/draft)
20. Bei "Abgeschlossen" (Referenz): Post bleibt publish, aber ggf. Kategorie "Referenz" zuweisen
```

### 8.7 Löschung behandeln
```
21. Propstack feuert property_updated auch beim Löschen
22. Wenn das Objekt in Propstack archived=true hat: WP-Post auf status=draft setzen
23. NICHT in WP löschen (Daten bleiben als Sicherheitskopie)
```

---

## 9. Persistenz (Mapping-Tabelle)

Der Service braucht eine kleine Datenbank für:
- `propstack_id → wp_post_id` Mapping
- `propstack_image_id → wp_media_id` Mapping
- Letzter Sync-Zeitstempel pro Objekt

### Option A: SQLite auf Railway Volume
```
Railway Volume mounten → SQLite-Datei persistiert zwischen Deploys
Einfach, keine externe Abhängigkeit
```

### Option B: Supabase (bereits vorhanden)
```
Neue Tabelle in ctucmljvatphzgnfhycu:
CREATE TABLE sync_mappings (
  propstack_id INTEGER PRIMARY KEY,
  wp_post_id INTEGER,
  propstack_unit_id TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_image_mappings (
  propstack_image_id INTEGER PRIMARY KEY,
  wp_media_id INTEGER,
  propstack_property_id INTEGER
);
```

### Empfehlung: Option B
Supabase existiert bereits, keine zusätzliche Infrastruktur nötig, und wir haben dort schon die Migrationsdaten (wp_id ↔ propstack_id aus state/import_state.json).

---

## 10. Fehlerbehandlung & Retry

### Strategie
```typescript
// Webhook-Empfang: sofort 200 antworten, Verarbeitung async
app.post('/webhook/propstack', async (req, res) => {
  // Signatur prüfen
  // ...

  // Sofort antworten (Propstack wartet max 10s)
  res.status(200).json({ status: 'accepted' });

  // Async verarbeiten
  try {
    await processWebhook(req.body);
  } catch (error) {
    logger.error('Webhook processing failed', { error, body: req.body });
    // In Queue für Retry speichern
    await saveToRetryQueue(req.body, error);
  }
});
```

### Retry-Mechanismus
- Fehlgeschlagene Webhooks in eine Queue (Supabase-Tabelle oder In-Memory)
- Alle 5 Minuten Queue prüfen und max 3 Retries pro Eintrag
- Nach 3 Fehlversuchen: Alert (z.B. E-Mail oder Slack-Nachricht)

---

## 11. Initialer Sync (Voll-Sync)

Für den allerersten Lauf oder bei Inkonsistenzen:

```typescript
// Alle Objekte aus Propstack holen (paginiert)
async function fullSync() {
  let page = 1;
  while (true) {
    const data = await propstackGet(`/units?page=${page}&per=50&archived=-1&with_meta=1`);
    for (const unit of data.data) {
      await syncPropertyToWordPress(unit);
    }
    if (data.data.length === 0) break;
    page++;
  }
}
```

### Trigger
- `POST /sync/full` Endpoint (Auth-geschützt mit einem API-Key)
- Oder einmalig manuell nach dem Deploy

---

## 12. Projektstruktur

```
tandel-propstack-sync/
├── src/
│   ├── index.ts                 # Express App, Route-Setup
│   ├── config.ts                # Env-Vars laden + validieren
│   ├── routes/
│   │   ├── webhook.ts           # POST /webhook/propstack
│   │   ├── health.ts            # GET /health, GET /status
│   │   └── sync.ts              # POST /sync/full
│   ├── services/
│   │   ├── propstack.ts         # Propstack API Client
│   │   ├── wordpress.ts         # WordPress REST API Client
│   │   ├── sync.ts              # Kernlogik: Propstack→WP Mapping + Sync
│   │   └── images.ts            # Bilder-Download + WP-Upload
│   ├── mappings/
│   │   ├── fields.ts            # Propstack → ACF Feld-Mapping
│   │   ├── enums.ts             # Enum-Mappings (Status, Typen, Energie)
│   │   └── ausstattung.ts       # Ausstattungsmerkmale-Logik
│   ├── db/
│   │   └── supabase.ts          # Supabase Client für Mapping-Tabelle
│   ├── middleware/
│   │   └── hmac.ts              # HMAC-Signatur-Verifizierung
│   └── utils/
│       └── logger.ts            # Logging
├── package.json
├── tsconfig.json
├── railway.json                 # Railway Config
├── Dockerfile                   # Optional, Railway kann auch Nixpacks
├── .env.example
└── README.md
```

---

## 13. Testplan

### Auf Staging testen (tandel.immobilien/staging/)

#### Phase 1: Grundfunktion
1. Service auf Railway deployen
2. Webhook-URL in Propstack auf Staging zeigen lassen (separater Hook)
3. Ein Objekt in Propstack ändern (z.B. Preis von 1300 auf 1350)
4. Prüfen: Wurde der Preis auf der Staging-Website aktualisiert?

#### Phase 2: Vollständigkeit
5. Neues Objekt in Propstack anlegen
6. Prüfen: Erscheint es auf Staging mit allen Feldern?
7. Bilder in Propstack hinzufügen
8. Prüfen: Erscheinen die Bilder in der WP-Mediathek und auf der Seite?

#### Phase 3: Edge Cases
9. Objekt in Propstack archivieren → WP-Post wird Draft
10. Objekt ohne Bilder anlegen → läuft ohne Fehler durch
11. Propstack-Webhook schnell hintereinander (2x in 1 Sekunde) → kein Duplikat

#### Phase 4: Live-Schaltung
12. Webhook-URL auf Live-Domain umstellen
13. `POST /sync/full` auslösen für initialen Vollabgleich
14. Laufend: Monitoring über /status Endpoint

---

## 14. Zeitschätzung

| Aufgabe | Geschätzt |
|---|---|
| Projekt-Setup (Express, TS, Railway Config) | 1h |
| Propstack API Client + Webhook Handler + HMAC | 2h |
| WordPress REST API Client + ACF-Felder schreiben | 3h |
| Feld-Mapping + Enum-Mapping komplett | 2h |
| Bilder-Sync (Download + WP Upload + Galerie) | 3h |
| Supabase Mapping-Tabelle + Persistenz | 1h |
| Full-Sync Endpoint | 1h |
| Error Handling + Retry + Logging | 1.5h |
| Testing auf Staging | 2h |
| **Gesamt** | **~16-17h** |

---

## 15. Offene Entscheidungen

1. **ACF REST API:** Muss geprüft werden, ob die ACF-Felder tatsächlich über die REST API schreibbar sind. Falls nicht, gibt es einen alternativen Weg über `wp_remote_post` mit einem Mini-Plugin in WP, das einen eigenen Endpoint bereitstellt.

2. **WordPress Application Passwords:** Muss Nico in seinem WP-Profil erstellen. Ohne das geht keine REST-API-Authentifizierung.

3. **Kategorie-Slugs:** Die exakten WP-Kategorie-Slugs (mieten, kaufen, eigentumswohnung etc.) müssen aus der WP-Installation ausgelesen werden. Am besten per: `GET /wp-json/wp/v2/categories?per_page=100`

4. **Post-Type REST-Base:** Muss geprüft werden ob der Custom Post Type "immobilie" bereits `show_in_rest = true` hat. Falls nicht, muss das im WP-Code ergänzt werden.

5. **Staging vs. Live:** Beim Testen auf Staging die Webhook-URL auf den Railway-Service zeigen lassen. Für Live dann umstellen.

---

## 16. Referenz-Dokumente

- `tandel_feld_referenz.md` — Komplette Datenstruktur über alle Systeme
- `propstack_acf_mapping.md` — Detailliertes ACF-Feld-Mapping
- `state/import_state.json` — wp_id ↔ propstack_id Mappings aus der Migration
- Propstack API Docs: https://docs.propstack.de/
- Propstack Webhooks: https://docs.propstack.de/reference/webhooks
- WP REST API Handbook: https://developer.wordpress.org/rest-api/
- ACF REST API: https://www.advancedcustomfields.com/resources/wp-rest-api-integration/
