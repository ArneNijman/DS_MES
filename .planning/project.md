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
| **Totaal** | | **~30–35 sessies** | **~115 uur** |

*v1.0 (12.661 regels TypeScript/TSX, 186 bestanden) in ~11 werkdagen — gemiddeld ~5 uur/dag.*  
*v2.0 t/m Product Setup: ~60 uur aanvullende ontwikkeling.*

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
  - **Product Setup** — stappen per machine, NC-bestanden, toolvalidatie, overdracht
  - **CNC Machining** — toolmagazijn, samenstellingen, wisselplaten, TOOL.T sync
  - **Tooling Library** — toolbeheer, componentenbeheer, samenstellingen
  - **NCR** — non-conformiteit kanban + detail
  - **Preventieve Maatregelen** — kanban + uitvoerder + datum
  - **Klantmeldingen** — kanban + detail (klant, oorzaak, artikel)
  - **Meetmiddelen** — (in ontwikkeling)
  - **Mijn Taken** — takenlijst per medewerker
  - **Mijn Meldingen** — eigen NCR-overzicht

### Admin (beveiligd, sidebar)
- Dashboard / Overzicht
- Medewerkers (CRUD, PIN, rol, foto, BC-sync)
- Machines (overzicht, CNC-configuratie, IP-adres)
- CNC Machining (toolbeheer, upload TOOL.T, samenstellingen, zoeken)
- BC Configuratie (OAuth2, test)
- Veldmapping (auto-detectie BC-velden)

## Actieve modules — detail

### Product Setup (`routes/kiosk/product-setup.tsx`)
Koppelt productieorders aan machines via opgedeelde stappen.

Per stap:
- **Algemene informatie** — nulpunt X/Y/Z (tekst), beschrijving; portaal voor tekeningen en CAD-bestanden
- **CNC informatie** — NC-bestanden (portaal, hernoemen, actief selecteren), importeer samenstellingen, SYNC + validatietimestamp, toolvalidatietabel
- **Bijlagen** — foto's en documenten per stap met bijschrift, lightbox
- **Overdracht** — vrij-tekst log met naam + timestamp + foto's, lightbox, bewerken/verwijderen

Toolvalidatietabel kolommen: dot · TOOL (T-slot of —) · NAME · DOC · L · DL · DR · TIME2 · CUR.TIME · LIFE% · LOCK

### CNC Machining (`routes/admin/cnc-machining.tsx` + `routes/kiosk/`)
- Upload TOOL.T bestand → parser vult `cnc_tool_entries`
- Toolmagazijn per machine met LIFE%, LOCK-status, sync-log
- Samenstellingen (toolbibliotheek) inclusief wisselplaat/schroef-opsplitsing
- Zoeken over alle machines (MACHINE · TOOL · NAME · DOC · TIME · LIFE% · LOCK)
- Component-instanties: toont in welke machine en op welk slot een component zit

### Tooling Library (`routes/kiosk/tooling.tsx`)
- Toolbeheer: componenten, samenstellingen
- WP-componenten: splits naar houder / freeslichaam / wisselplaat / schroef
- Schroef-artikelnummer en foto direct invoerbaar
- WinTool-import via XML upload

### Kwaliteitsmodule
- **NCR** — kanban (open → gesloten), detail met tabs (Afwijking / Oplossing / Bijlages), PDF rapport, "Start preventieve maatregel" knop
- **Preventieve Maatregelen** — kanban, uitvoerder via EmployeePickerModal, datum + resultaat veld
- **Klantmeldingen** — kanban, detail Tab Melding (klant, ordernummers, contactpersoon, artikel, oorzaak/foutcode)

### Meetmiddelen (`routes/kiosk/meetmiddelen.tsx`)
Kalibratiebeheer van meetgereedschappen — in ontwikkeling (Fase 10).

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

## Deployment

- **Dev:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` — Vite HMR + tsx watch
- **Test:** `testserver.bat` → poort 8080 (laptop als testserver voor collega's)
- **Productie:** VM (nog in te richten) — `git clone` + `.env` invullen + `docker compose up -d --build`
- **Update:** `./update.sh` (git pull + rebuild + restart)
