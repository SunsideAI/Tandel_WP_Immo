# Tandel Propstack → WordPress Sync

Webhook-basierter Microservice, der Änderungen in Propstack (CRM) in Echtzeit auf die WordPress-Website von Tandel Immobilien (`tandel.immobilien`) synchronisiert.

Kein Supabase, kein Drittanbieter-Datenspeicher im Sync-Flow. Das WordPress
Bridge-Plugin führt das `propstack_id` → `wp_post_id` Mapping selbst über
`post_meta` — der Service ist stateless.

## Repo-Struktur

```
.
├── service/                                  # Node.js/TypeScript Service (Railway)
│   ├── src/
│   │   ├── index.ts                          # Express Bootstrapping
│   │   ├── config.ts                         # ENV-Validation (zod)
│   │   ├── routes/                           # webhook, health, sync
│   │   ├── services/                         # propstack, wordpress-bridge, mapper, sync, stats
│   │   ├── mappings/                         # fields, enums, ausstattung
│   │   ├── middleware/                       # hmac
│   │   ├── types/                            # propstack, bridge
│   │   └── utils/                            # logger
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── railway.json
│   └── .env.example
├── wordpress-plugin/
│   └── tandel-propstack-bridge/              # WP Plugin (manuell als ZIP hochladen)
│       └── tandel-propstack-bridge.php
└── docs/
    ├── tandel_sync_service_plan.md           # Architektur-Plan
    └── propstack_acf_mapping.md              # Feld-/Enum-Mapping (Single Source of Truth)
```

## Architektur

```
Propstack (Master)
    │ property_created / property_updated
    ▼
Railway Service  (Node.js/TypeScript, stateless)
    ├── POST /webhook/propstack  ──  HMAC prüfen (soft mode bis Signatur-Format bestätigt)
    ├── GET  Propstack /v1/units/{id}?new=1
    ├── Feld-/Enum-Mapping
    └── POST  WP Bridge  /wp-json/tandel/v1/sync          (Stage 1: Post + ACF)
             POST  WP Bridge  /wp-json/tandel/v1/sync/images  (Stage 2: Bilder)
             │
             ▼
WP Bridge Plugin  (PHP)
    ├── wp_insert_post / wp_update_post
    ├── update_field() (ACF)
    ├── media_handle_sideload (Bilder)
    ├── propstack_id → wp_post_id Mapping via post_meta (kein externer Store)
    └── Transient-Lock pro propstack_id
```

## Setup

### Bridge-Plugin (WordPress Staging zuerst)

1. Ordner `wordpress-plugin/tandel-propstack-bridge/` als ZIP packen.
2. WP-Admin → Plugins → Plugin hochladen → aktivieren.
3. In `wp-config.php` ergänzen:
   ```php
   define('TANDEL_SYNC_API_KEY', '<min-32-zeichen-zufallsstring>');
   ```
4. Smoke-Test:
   ```bash
   curl -H "X-Tandel-Api-Key: $KEY" \
        "https://tandel.immobilien/staging/wp-json/tandel/v1/lookup?propstack_id=1"
   ```

### Service (lokal)

```bash
cd service
cp .env.example .env   # Keys eintragen
npm install
npm run dev
```

### Service (Railway)

1. Projekt anlegen, Root-Dir auf `service/` setzen.
2. ENV-Vars aus `.env.example` übernehmen.
3. Deploy → Health-Check `/health`.
4. Propstack-Webhook auf `https://<railway-url>/webhook/propstack` zeigen.

## Endpoints

**Service:**
- `POST /webhook/propstack` — Webhook-Empfang (HMAC soft, umschaltbar)
- `GET /health` — Health-Check
- `GET /status` — In-memory Sync-Statistiken seit Boot
- `POST /sync/full` — Voll-Sync aller Propstack-Objekte (Auth: `X-Admin-Key`)
- `POST /sync/one/:id` — Einzelobjekt (Auth: `X-Admin-Key`)

**Bridge-Plugin:**
- `POST /wp-json/tandel/v1/sync` — Stage 1 (Post + ACF)
- `POST /wp-json/tandel/v1/sync/images` — Stage 2 (Bilder)
- `POST /wp-json/tandel/v1/sync/delete` — auf Draft setzen
- `GET  /wp-json/tandel/v1/lookup?propstack_id=…` — Post-ID Lookup

## Rollout

1. **Staging**: Bridge-Plugin + Service + Propstack-Webhook auf Staging.
2. **Soft-HMAC**: `HMAC_ENFORCE=false`, erster Webhook wird geloggt → Signatur-Format verifizieren.
3. **Dry-Run**: `DRY_RUN=true` testen, Mapping kontrollieren.
4. **Full-Sync**: `POST /sync/full` mit `X-Admin-Key`.
5. **Live-Switch**: Plugin auf Live installieren, ENV-Vars umstellen, Webhook umbiegen, HMAC enforce aktivieren.

## Secrets

**Niemals** Keys einchecken. Platzhalter verwenden (`<PROPSTACK_API_KEY>` etc.). Rotationen:
- Propstack: `crm.propstack.de/app/admin/api_keys`
- WP Bridge: neuer Zufallsstring, in `wp-config.php` + Railway gleichzeitig updaten.
