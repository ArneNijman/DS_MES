# Factory Assistant — Project Context

## Wat is dit

Een event-driven Manufacturing Execution System (MES) dat als **operationele intelligentielaag** bovenop Business Central (BC Online/SaaS) functioneert. Factory Assistant maakt wachttijd, projectflow, kwaliteitsafwijkingen en machinestatus objectief meetbaar — volledig op basis van events uit BC, zonder extra handmatige invoer van operators.

**Naam in UI:** Factory Assistant  
**Subtitle:** Manufacturing Execution System  
**Programma-eigenaar:** Arne Nijman (Dutch Shape)  
**Versie:** v2.0 Kwaliteitsverdieping (gestart 2026-03-09)

## Tijdsinvestering (schatting)

> Gebaseerd op bekende opleverdata, git history (vanaf 2026-04-22) en het feit dat v1.0 in 11 werkdagen is gebouwd. Sessies zijn Claude-ondersteund — traditionele ontwikkeltijd zou 5–10× hoger liggen.

| Fase / Module | Periode | Geschatte sessies | Uren (ca.) |
|---------------|---------|-------------------|------------|
| v1.0 Fundament + Beheer (Fase 1–6.1) | feb–mrt 2026 | ~11 dagen | ~55 uur |
| v1 Fixes (Fase 7) | 2026-03-10 | 1 sessie | ~2 uur |
| Tekening Ballonnen (Fase 8) | 2026-03-10 t/m 03-14 | 2–3 sessies | ~8 uur |
| NCR Statistieken (Fase 9) | 2026-03-14 t/m 03-16 | 1–2 sessies | ~4 uur |
| Preventieve Maatregelen | mrt–apr 2026 | 2–3 sessies | ~8 uur |
| Klantmeldingen | apr 2026 | 1–2 sessies | ~4 uur |
| CNC Machining — Tool tabel | 2026-04-16 t/m 04-21 | 3–4 sessies | ~12 uur |
| CNC — Wisselplaat, schroef, tooling kiosk | 2026-04-22 t/m 04-23 | 2 sessies | ~6 uur |
| Product Setup (volledig) | 2026-04-23 t/m 04-29 | 4–5 sessies | ~16 uur |
| Product Setup uitbr. + Demonteren + multi-format parser | 2026-04-30 | 1–2 sessies | ~5 uur |
| NCR verbeteringen (human factor velden) | mei 2026 | 1 sessie | ~3 uur |
| Machine categorieën + Meetmiddelen serie + opmerkingen stap | 2026-05-11 | 1 sessie | ~3 uur |
| Meet Setup module | 2026-05-11 | 1 sessie | ~4 uur |
| CNC Agent monitoring + Machine Dashboard | 2026-05-18 | 2 sessies | ~8 uur |
| **Totaal** | **feb 2026 – mei 2026** | **~39–46 sessies** | **~138 uur** |

*v1.0 (12.661 regels TypeScript/TSX, 186 bestanden) in ~11 werkdagen — gemiddeld ~5 uur/dag.*  
*v2.0 t/m Meet Setup: ~75 uur aanvullende ontwikkeling over ~26–33 sessies.*  
*Gemiddeld per sessie: ~3–4 uur. Totale doorlooptijd: ~10 weken (2026-03-09 t/m 2026-05-11).*

## Bredere visie

Factory Assistant is het volledige bedrijfsbesturingssysteem voor de werkvloer:
- Werkbonnen, productieplanning, kwaliteitsregistraties
- Machinebeheer: onderhoud, storingen, CNC-configuratie, energie
- Koppeling met ERP (Business Central), machines
- Bereikbaar via browser op iPad, telefoon, pc
- Wekelijks verder uitgebouwd

## Wie gebruikt het

| Rol | Wat ze nodig hebben |
|-----|---------------------|
| **Operators (werkvloer)** | Grote touch-interface, zien direct hun werkopdrachten |
| **Werkvoorbereiders** | Productsetups, NC-bestanden, toolvalidatie |
| **Kwaliteitsverantwoordelijke** | NCR-registratie, preventieve acties, klantmeldingen |
| **CNC-medewerkers** | Toolmagazijn per machine, samenstellingen, wisselplaten |
| **Management** | Dashboards: wachttijd, planningbetrouwbaarheid, bottlenecks |
| **Beheerder** | Medewerkers, rollen, BC-koppeling, machinebeheer |

## Tech stack

| Laag | Technologie |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query v5 |
| Backend | Node.js + Fastify + Drizzle ORM + PostgreSQL 16 |
| Worker | BullMQ (Redis-backed job queue) |
| BC-koppeling | Microsoft MSAL (OAuth2 client credentials flow) |
| Deployment | Docker Compose + Nginx |

## Navigatiestructuur

### Kiosk (touch-first, operators)
- Medewerkerstegels + PIN-login
- Dashboard met module-kaarten:
  - **Product Setup** — stappen per machine, NC-bestanden, toolvalidatie, opmerkingen, overdracht
  - **Meet Setup** — meetstappen per 3D-meetapparaat, meetbestanden (XML/rapport), CAD, overdracht
  - **CNC Machining** — toolmagazijn, samenstellingen, wisselplaten, TOOL.T sync
  - **Tooling Library** — toolbeheer, componentenbeheer, samenstellingen
  - **NCR** — non-conformiteit kanban + detail
  - **Preventieve Maatregelen** — kanban + uitvoerder + datum
  - **Klantmeldingen** — kanban + detail (klant, oorzaak, artikel)
  - **Meetmiddelen** — kalibratiebeheer, serie suffix, vervaldatum melding
  - **Machine Dashboard** — beschikbaarheid % per Freesmachine, downtime-verdeling, spindeluren (voor management)
  - **Mijn Taken** — takenlijst per medewerker
  - **Mijn Meldingen** — eigen NCR-overzicht

### Admin (beveiligd, sidebar)
- Dashboard / Overzicht
- Medewerkers (CRUD, PIN, rol, foto, BC-sync)
- Machines (overzicht, CNC-configuratie, IP-adres)
- CNC Machining (toolbeheer, upload TOOL.T, samenstellingen, zoeken)
- Machine Dashboard (beschikbaarheid %, downtime, spindeluren per Freesmachine)
- BC Configuratie (OAuth2, test)
- Veldmapping (auto-detectie BC-velden)

## Actieve modules — detail

### Product Setup (`routes/kiosk/product-setup.tsx`)
Koppelt productieorders aan machines via opgedeelde stappen.

Lijst-niveau:
- Zoek op productieorder, artikel of omschrijving
- Aanmaken met optioneel omschrijvingsveld; productieorder is de enige verplichte invoer
- Setup verwijderen (met bevestigingsdialoog)

Per stap:
- **Bewerkingsnummer** — optioneel bewerkingsnr. naast de stapnaam (bewerkingNr in DB)
- **Algemene informatie** — nulpunt X/Y/Z (tekst), beschrijving; portaal voor tekeningen en CAD-bestanden
- **CNC informatie** — NC-bestanden (portaal, hernoemen, actief selecteren), importeer samenstellingen, SYNC + validatietimestamp, toolvalidatietabel; **opmerkingen** veld naast nulpunt
- **Bijlagen** — foto's en documenten per stap met bijschrift, lightbox
- **Overdracht** — vrij-tekst log met naam + timestamp + foto's, lightbox, bewerken/verwijderen

Toolvalidatietabel kolommen: dot · TOOL (T-slot of —) · NAME · DOC · L · DL · DR · TIME2 · CUR.TIME · LIFE% · LOCK

### CNC Machining (`routes/admin/cnc-machining.tsx` + `routes/kiosk/`)
- Upload TOOL.T bestand → parser vult `cnc_tool_entries`; formaat per machine instelbaar
- Toolmagazijn per machine met LIFE%, LOCK-status, sync-log, TIME2 / CUR.TIME kolommen
- Samenstellingen (toolbibliotheek) inclusief wisselplaat/schroef-opsplitsing
- Zoeken over alle machines (MACHINE · TOOL · NAME · DOC · TIME · LIFE% · LOCK)
- Component-instanties: toont in welke machine en op welk slot een component zit

### Tooling Library (`routes/kiosk/tooling.tsx`)
Twee tabs: **Artikelen** en **Demonteren**.

- **Artikelen** — toolbeheer: componenten, samenstellingen, WinTool XML import
  - WP-componenten: splits naar houder / freeslichaam / wisselplaat / schroef
  - Schroef-artikelnummer en foto direct invoerbaar
- **Demonteren** — zoek een assemblage op naam/ncName, zie alle componenten (houder / frees / wisselplaat) met voorraadlocaties; pas voorraad direct aan per locatie-knop (+/−)

### Kwaliteitsmodule
- **NCR** — kanban (open → gesloten), detail met tabs (Afwijking / Oplossing / Bijlages), PDF rapport, "Start preventieve maatregel" knop
- **Preventieve Maatregelen** — kanban, uitvoerder via EmployeePickerModal, datum + resultaat veld
- **Klantmeldingen** — kanban, detail Tab Melding (klant, ordernummers, contactpersoon, artikel, oorzaak/foutcode)

### Meet Setup (`routes/kiosk/meet-setup.tsx`)
Identiek aan Product Setup maar gericht op 3D-meetapparaten. Geen CNC-tab.

- Toont alleen machines met categorie `3D-meetapparaat`
- Data gescheiden via `setup_type = 'meet'` op de gedeelde `product_setups` tabel
- Per stap drie tabs: **Algemene informatie** (nulpunt, opmerkingen), **Bijlagen**, **Overdracht**
- **Meet bestanden** portaal: XML meetbestanden uploaden + parsen (features, deviaties, pass/fail), rapporten (PDF/HTML)
- **Tekeningen** en **CAD** portaal identiek aan Product Setup
- Rapportage types: Inmeten · Controle · Eindmeting (geen "Frezen")

### Machine Dashboard (`routes/admin/machine-dashboard.tsx`)
Beschikbaarheids- en stilstandsoverzicht voor alle Freesmachines. Beschikbaar in admin-panel én kiosk (via geëxporteerde `MachineDashboardContent`).

- Periode-filter: Vandaag / 7 dagen / Maand / Kwartaal / Jaar
- Beschikbaarheids-bars per machine (groen/amber/rood afhankelijk van uptime %)
- Gecombineerde downtime-tabel: alle machines, nieuwste perioden eerst
- Spindeluren lijndiagram per machine (per dag ≤14 dagen, per ISO-week bij langere perioden)
- Downtime-perioden worden on-the-fly afgeleid uit `cnc_machine_events` (geen extra tabel)
- Drempelwaarde stilstand: 30 minuten gap tussen PROGRAM_STOPPED en PROGRAM_STARTED

Per machine ook in Admin > Machines: tab "Downtime" met samenvatting + periodentabel.

### Meetmiddelen (`routes/kiosk/meetmiddelen.tsx`)
Kalibratiebeheer van meetgereedschappen.

- Overzicht per categorie, vervaldatum-badges (verlopen = rood, binnenkort = oranje)
- Velden: naam, serienummer, **serie suffix** (laatste 5 cijfers), afmeting, locatie, kalibratie-interval
- Categorieën machines: Meetapparaat en 3D-meetapparaat beschikbaar

## Key Decisions

| Beslissing | Redenering |
|------------|-----------|
| BC Online via REST API + polling | Polling elke 5 min; webhooks uitgesteld naar later |
| On-premise Docker Compose | Data blijft lokaal, IT beheert zelf |
| PostgreSQL + Drizzle ORM | Open-source, gefaseerd uitbreidbaar schema |
| Fastify backend | Lichtgewicht, plugin-based, native TypeScript |
| Touch-first kiosk | Operators hebben minimale IT-ervaring — grote knoppen, weinig tekst |
| AES-256-GCM voor BC clientSecret | Geen plain-text credentials in database |
| Handmatige Drizzle migraties | Volledige controle over SQL; geen auto-generate risico's |
| Lichte toolvalidatie in Product Setup | NC-bestand vergelijken met live toolmagazijn zonder extra invoer van operators |
| Case-insensitive toolnaam-matching | Voorkomt valse negatieven bij TOOL CALL vs. toolbibliotheek naamverschillen |
| Event-stream derivatie voor downtime | Geen extra DB-tabel; stilstandsperioden worden on-the-fly berekend uit bestaande `cnc_machine_events` — werkt direct met handmatig geposte test-events |
| LSV2 read-only voor state polling | TNCcmd is voor bestandsoverdracht; LSV2 is het lees-protocol voor machinestatus (ingebouwd in TNCremo, geen extra licentie) |
| Exponential backoff voor offline machines | Voorkomt onnodige netwerklast bij uitgeschakelde machines; reset bij eerste succesvolle respons |

## Deployment

- **Dev:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` — Vite HMR + tsx watch
- **Test:** `testserver.bat` → poort 8080 (laptop als testserver voor collega's)
- **Productie:** VM (nog in te richten) — `git clone` + `.env` invullen + `docker compose up -d --build`
- **Update:** `./update.sh` (git pull + rebuild + restart)
