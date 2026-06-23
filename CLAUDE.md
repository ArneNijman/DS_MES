# Dutch Shape MES — CLAUDE.md

## Stack

| Laag | Tech |
|------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query v5 |
| Backend | Node.js + Fastify + Drizzle ORM + PostgreSQL 16 |
| Workers | BullMQ op Redis |
| Deployment | Docker Compose (on-premise Windows VM) |

## Dev-omgeving starten

```bash
# Dev modus (hot-reload frontend + tsx watch backend)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Productie / testserver
docker compose up -d --build
```

**Testserver (Dutch Shape — DS-MES01):** draait in dev-modus op poort **5173** (Vite), niet nginx op 8080. `update.sh` gebruikt automatisch de dev-overlay (`-f docker-compose.yml -f docker-compose.dev.yml`) en houdt poort 5173 actief na elke update. Zonder de dev-overlay zou `update.sh` de server terugzetten naar productie-modus (nginx op 8080) waarna de kiosk op 5173 niet meer bereikbaar is.

**Belangrijk:** Na het toevoegen van een nieuw `.ts` bestand aan de backend moet de backend-container herstart worden — `tsx watch` pikt nieuwe bestanden niet automatisch op:
```bash
docker compose restart backend
```

Wijzigingen in bestaande bestanden worden wél automatisch opgepikt via `tsx watch`.

**Productie (zonder dev-override):** `docker compose restart` herstart de container maar rebuildt de image niet. Na code-wijzigingen in productie altijd rebuilden:
```bash
docker compose up -d --build backend   # of: --build frontend
```

**Let op:** `docker-compose.override.yml` bestaat **niet** (verwijderd juni 2026). Dev-modus vereist de expliciete `-f docker-compose.yml -f docker-compose.dev.yml` vlag — zonder deze vlag draait alleen de productie-config (nginx op 8080, geen Vite).

## Database migraties

De eigen migratie-runner (`backend/src/plugins/db.ts`) vervangt Drizzle's `migrate()`. Tracking op **bestandsnaam** (niet hash) — immuniseert tegen silent skips bij bestandswijzigingen.

Werkwijze:

1. Pas `backend/src/db/schema.ts` aan
2. Maak handmatig een nieuw SQL-bestand aan in `backend/src/db/migrations/`:
   - Naamconventie: `0073_beschrijving.sql` (oplopend nummer, huidig laatste: 0072)
   - Gebruik `IF NOT EXISTS` / `IF EXISTS` zodat migraties idempotent zijn
3. De runner past nieuwe bestanden toe bij elke backend-opstart

Voorbeeld migratie:
```sql
ALTER TABLE "machines"
  ADD COLUMN IF NOT EXISTS "supplier_email" text;
```

## Backend structuur

```
backend/src/
  index.ts              # Fastify app entry, registreert routes
  db/
    schema.ts           # Drizzle tabel-definities (single source of truth)
    migrations/         # Handmatige SQL migratiebestanden
  routes/
    admin/              # Admin-panel routes (auth vereist)
    kiosk/              # Kiosk routes (requireAuth middleware)
  cnc/
    toolTableParser.ts  # Parser voor Heidenhain TOOL.T bestanden
    ncProgramParser.ts  # Parser voor NC-programma's (TOOL CALL regels)
  lib/
    mailer.ts           # nodemailer wrapper — SMTP uit DB (5min cache), sendMail, getNotifiableEmployees, mailLayout
    pdf-generator.ts    # pdfkit rapport-generator — genereerRapportPdf(titel, datum, secties[])
  jobs/
    emailReminders.ts   # Dagelijkse reminder cron (07:30 werkdagen) — per-categorie interval, PDF bijlagen
  worker/               # BullMQ job handlers
```

### Auth middleware

```typescript
const auth = { preHandler: [fastify.requireAuth] }
fastify.get('/kiosk/...', auth, async (req, reply) => { ... })
```

`req.user` bevat `{ id, name, role }` van de ingelogde medewerker.

### Uploads

Bestanden worden opgeslagen in het Docker volume `uploads`, gemount op `/app/uploads`.  
Publieke URL: `/uploads/<pad>` (via nginx proxy in productie, Fastify static in dev).

Patroon voor upload-endpoint:
```typescript
const data = await req.file()
const ext  = extname(data.filename)
const name = `${randomUUID()}${ext}`
await pipeline(data.file, createWriteStream(`/app/uploads/${name}`))
const fileUrl = `/uploads/${name}`
```

## Frontend structuur

```
frontend/src/
  routes/
    admin/              # Admin panel pagina's
    kiosk/              # Kiosk pagina's (touch-first UI)
  components/
    kiosk/              # Gedeelde kiosk componenten (EmployeePickerModal, etc.)
  lib/
    api.ts              # apiFetch helper
    utils.ts            # cn() (clsx + tailwind-merge)
```

### apiFetch

```typescript
import { apiFetch } from '@/lib/api'

// GET
const data = await apiFetch('/kiosk/product-setups/...')

// POST JSON
await apiFetch('/kiosk/...', { method: 'POST', body: JSON.stringify(payload) })

// POST FormData (upload)
const fd = new FormData()
fd.append('file', file)
await apiFetch('/kiosk/...', { method: 'POST', body: fd })

// DELETE
await apiFetch('/kiosk/.../id', { method: 'DELETE' })
```

`apiFetch` retourneert `unknown` — cast het resultaat expliciet:
```typescript
const result = await apiFetch('/kiosk/...') as MyType
```

### TanStack Query conventies

```typescript
const { data = [], isLoading } = useQuery<MyType[]>({
  queryKey: ['sleutel', id],
  queryFn:  () => apiFetch(`/kiosk/.../${id}`) as Promise<MyType[]>,
})

const qc = useQueryClient()
// Na mutatie:
qc.invalidateQueries({ queryKey: ['sleutel', id] })
```

## Modules & sleutelbestanden

| Module | Frontend | Backend route |
|--------|----------|---------------|
| Kiosk dashboard | `routes/kiosk/dashboard.tsx` | — |
| Product Setup | `routes/kiosk/product-setup.tsx` | `routes/kiosk/product-setup.ts` |
| Meet Setup | `routes/kiosk/meet-setup.tsx` | `routes/kiosk/meet-setup.ts` |
| CNC Machining (admin) | `routes/admin/cnc-machining.tsx` | `routes/admin/cnc.ts` |
| Tooling Library | `routes/kiosk/tooling.tsx` | `routes/kiosk/tooling.ts` |
| NCR | `routes/kiosk/ncr.tsx` | `routes/kiosk/ncr.ts` |
| Preventieve maatr. | `routes/kiosk/preventief.tsx` | `routes/kiosk/preventief.ts` |
| Klantmeldingen | `routes/kiosk/klantmelding.tsx` | `routes/kiosk/klantmelding.ts` |
| Meetmiddelen | `routes/kiosk/meetmiddelen.tsx` | `routes/kiosk/meetmiddelen.ts` |
| Machines (admin) | `routes/admin/machines.tsx` | `routes/admin/machines.ts` |
| Medewerkers | `routes/admin/employees.tsx` | `routes/admin/employees.ts` |
| Machine Dashboard | `routes/admin/machine-dashboard.tsx` (exporteert ook `MachineDashboardContent` voor kiosk) | `routes/admin/cnc-events.ts` + `cnc-metrics.ts` |
| Email instellingen (admin) | `routes/admin/smtp-settings.tsx` | `routes/admin/smtp.ts` |
| Mijn taken | `routes/kiosk/mijn-taken-todo.tsx` | `routes/kiosk/tasks.ts` |
| Mijn meldingen | `routes/kiosk/mijn-meldingen.tsx` | via `routes/kiosk/ncr.ts` + `meetmiddelen.ts` |
| NCR Statistieken | `routes/kiosk/ncr-statistieken.tsx` | `routes/kiosk/ncr-stats.ts` |
| BC Configuratie (admin) | `routes/admin/bc-config.tsx` | `routes/admin/bc-config.ts` |
| BC Veldmapping (admin) | `routes/admin/bc-field-map.tsx` | `routes/admin/bc-field-map.ts` |

## Sleuteltabellen in de DB

| Tabel | Omschrijving |
|-------|-------------|
| `machines` | Alle machines; `tool_table_format` bepaalt TOOL.T-parser (null=heidenhain, fooke, ronin, 3200, portaal); `spindle_hours` = cumulatief spindeluren; `supplier_email/phone` = leverancier contact; `maintenance_email/phone_1/2` = onderhoud fabrikant contact |
| `employees` | Medewerkers (PIN, rol, inklokstatus); `email` + `email_notificaties` voor reminder-emails |
| `smtp_settings` | Enkelvoudige rij (id=1) met SMTP-config + per-categorie reminder-interval (taken/ncr/onderhoud/kalibratie/kwaliteit) |
| `cnc_tool_entries` | Toolmagazijn per machine (gesynchroniseerd via TOOL.T upload) |
| `cnc_sync_logs` | Log van TOOL.T syncs per machine |
| `cnc_machine_events` | CNC event-stroom (MACHINE_OFFLINE/ONLINE, ALARM_TRIGGERED/CLEARED, PROGRAM_STARTED/STOPPED) per machine |
| `cnc_program_runs` | Programma-uitvoeringen per machine (startedAt, endedAt, durationSeconds, status) |
| `cnc_machine_metrics` | Historische machine-metrics (bijv. spindle_hours) als tijdreeks; index op (machineId, metric_type, recorded_at DESC) |
| `tool_library_assemblies` | Samenstellingen in toolbibliotheek |
| `tool_library_items` | Individuele toolcomponenten |
| `tooling_stock_locations` | Voorraadlocaties per artikel; `location_code` + `quantity` + `lade` + `vak`; unique op `(article_id, location_code)` |
| `tooling_mutations` | Mutatiehistorie (uitboeken/bijboeken) per artikel + locatie; JOIN met `tooling_stock_locations` voor lade/vak |
| `product_setups` | Product/Meet setup; `setup_type` = `'product'` of `'meet'` scheidt de modules |
| `product_setup_steps` | Stappen per setup (machineId, nulpunt X/Y/Z als text, bewerkingNr, opmerkingen) |
| `product_setup_nc_files` | NC-bestanden per stap |
| `product_setup_tool_calls` | Geparseerde TOOL CALL regels uit NC-bestand |
| `product_setup_documents` | Tekeningen, CAD en meetbestanden per setup (documentType: tekening/cad/meting_xml/meting_rapport) |
| `product_setup_overdracht` | Overdrachtlog per stap (vrije tekst + user + timestamp) |
| `product_setup_overdracht_photos` | Foto's per overdrachtentry |
| `measuring_tools` | Meetmiddelen; `serie_suffix` = laatste 5 cijfers serienummer |
| `ncrs` | Non-conformiteit rapporten |
| `preventive_measures` | Preventieve maatregelen (gekoppeld aan NCR) |

## CNC-specifieke kennis

### TOOL.T parser
`backend/src/cnc/toolTableParser.ts` — ondersteunt twee kolomindelingen:

1. **Fooke/modern formaat** (`tool_table_format = 'fooke'` e.d.) — header aanwezig (`T NAME L R DL DR ...`), kolomposities worden uit de header afgeleid.
2. **Klassiek Heidenhain formaat** (default) — geen bruikbare header; named vs. unnamed tool via `looksNumeric(cols[1])`, PLC-patroon (`%hex`) voor DOC/LOCKED-detectie.

Komma als decimaalscheider wordt automatisch omgezet (`parseNum` vervangt `,` → `.`).

### NC-programma parser
`backend/src/cnc/ncProgramParser.ts` — extraheert `TOOL CALL` regels:
```
TOOL CALL "WP83R8-H233" Z S2685  →  toolName = "WP83R8-H233"
TOOL CALL 5 Z S2685               →  toolNumber = 5
```

### Magazijn-matching (validatie)
In `product-setup.ts` is de naam-matching **case-insensitive**:
```typescript
const magazineByName = new Map(
  entries.filter(e => e.name).map(e => [e.name!.toLowerCase(), e])
)
// lookup:
magazineByName.get(tc.toolName.toLowerCase())
```

### CNC Events & Machine Dashboard
`backend/src/routes/admin/cnc-events.ts` — CNC event-stroom, downtime-derivatie en programma-runs.

- `deriveDowntimePeriods(events)` — pure functie: event-stroom → stilstandsperioden
  - `OFFLINE_MIN_SEC = 300` — offline < 5 min wordt genegeerd (monitoring-ruis)
  - `STILSTAND_THRESHOLD_SEC = 600` — stilstand drempel 10 minuten
  - Beschikbaarheid: `Math.floor` (100% alleen bij nul stilstand)
- `extractArticle(programName)` — extraheert derde padsegment als artikelnummer (`TNC:\Program\22073-3201-11\...` → `22073-3201-11`)
- `GET /admin/machines/:id/cnc-downtime?days=N` — downtime-perioden + samenvatting per machine
- `GET /admin/cnc-downtime/all?days=N` — beschikbaarheid % + downtime voor alle Freesmachines
- `GET /admin/machines/:id/cnc-program-runs?article=X` — runs gefilterd op artikelnaam (LIKE)
- `GET /admin/machines/:id/cnc-program-runs/summary` — lifetime totaal seconden + runcount per artikel
- `PATCH /admin/machines/:id/cnc-program-runs/:runId` — run afsluiten (endedAt, status, duur berekend)

`backend/src/routes/admin/cnc-metrics.ts` — spindeluren tijdreeks.

- `POST /admin/machines/:id/cnc-metrics` — agent post `{ spindleHours }` → update `machines.spindle_hours` + insert in `cnc_machine_metrics`
- `GET /admin/machines/:id/cnc-metrics?metric=spindle_hours&days=N` — dagelijkse datapunten (laatste reading per dag)

`frontend/src/routes/admin/machine-dashboard.tsx`:
- Exporteert `MachineDashboardContent` (herbruikbaar in kiosk) en default `MachineDashboard` (admin-pagina met sidebar)
- Periode-opties: 1 / 7 / 30 / 90 / 365 dagen
- Aggregatie: per dag als `days ≤ 14`, per ISO-week als `days > 14`
- Beschikbaarheids-bars met vaste breedte (type-breakdown op tweede regel)

### Wisselplaat-componenten (assembly view)
`parseWisselplaat(comment)` splitst op `WP:` in de comment:
```
1  HOUDER      → houder
2  FREES       → freeslichaam (body)
3  WISSELPLAAT → wisselplaat
4  SCHROEF     → alleen als schroefOrderingCode / schroefPhotoUrl ingevuld
```

## UI-conventies (touch-first kiosk)

- Minimale touch-target: 44px hoogte voor buttons
- Kleurgebruik: teal-600 = primaire actie, red-500 = destructief, orange-400 = waarschuwing
- Lightbox patroon voor afbeeldingen: `useState<{ images: ...; index: number } | null>(null)`
- Portaal patroon: klikbare kaart → modal popup met volledige lijst + upload/acties
- Tabellen met tools: dot · TOOL · NAME · DOC · L · DL · DR · TIME2 · CUR.TIME · LIFE% · LOCK

## Environment variabelen (.env)

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
BC_ENCRYPTION_KEY=...   # AES-256-GCM voor BC clientSecret
BC_TENANT_ID=...
BC_CLIENT_ID=...
BC_CLIENT_SECRET=...
BC_BASE_URL=...
```

## Deployment

```bash
# Eerste keer
git clone <repo>
cp .env.example .env   # invullen
docker compose up -d --build

# Update
./update.sh            # git pull + rebuild + restart
```

Testserver (laptop): `testserver.bat` → poort 8080  
Dev (lokaal): `dev.bat` → Vite op 5173 + backend op 3000
