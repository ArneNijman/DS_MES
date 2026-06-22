# Changelog

Alle noemenswaardige wijzigingen worden in dit bestand bijgehouden.  
Formaat gebaseerd op [Keep a Changelog](https://keepachangelog.com/nl/1.0.0/).

---

## [Unreleased]

---

## [2026-06-22] — Systeemgezondheid, meerdere postprocessors, scripts audit

### Toegevoegd
- **`doctor.sh`** — health check script: 10 checks (environment, Docker containers, backend HTTP, database, migraties, CNC agent, firewall, machine TCP, schijfruimte, git versie); kleuruitvoer met ✓/⚠/✗; exit code 1 bij fouten. Wordt automatisch aangeroepen aan het einde van `update.sh`
- **`GET /health` in CNC agent** — `cnc-agent.js` geeft nu `{ ok: true, uptime: ... }` terug op `GET /health`, gebruikt door `doctor.sh` en de backend health check
- **Systeemstatus widget in admin sidebar** — gekleurd bolletje (groen/oranje/rood) onderaan de navigatie; klik opent modal met alle checks; vernieuwd elke 5 minuten
- **`GET /api/admin/system-health`** — nieuw endpoint (auth vereist): controleert database, migraties en CNC agent bereikbaarheid; retourneert JSON met per-check status en detail
- **Meerdere postprocessors per machine** — machines.postprocessors is nu een `text[]` array; tag-invoer UI in admin (type + Enter of + knop om toe te voegen, ✕ om te verwijderen); bestaande waarden automatisch gemigreerd; postprocessor-controle in Product Setup matcht op één van de ingestelde waarden (case-insensitive)
- **Postprocessor detectie uit .h bestanden** — parser las de `; Postprocessor:` commentaarregel nooit uit omdat die na de commentaar-skip stond; bugfix: check verplaatst vóór de skip
- **Standaard registratie** — nieuw onderhoudsregistratietype "Standaard registratie": toont alleen "Gecontroleerd: Ja" (geen gebruikersinvoer), jaar/weeknummer automatisch ingevuld, registrerende medewerker is standaard
- **Tooling foto fallback** — artikeldetailmodal in Tooling Beheer toont eigen foto als eerste keuze, daarna de bibliotheekfoto (via `sourceItemId`), daarna placeholder; eigen foto uploaden via klik of Ctrl+V

### Opgelost
- **`docker-compose.override.yml` activeerde dev-modus in productie** — bestand was identiek aan `docker-compose.dev.yml` maar werd automatisch samengevoegd; verwijderd en toegevoegd aan `.gitignore`; `update.sh` en `install.sh` gebruiken nu expliciete `-f docker-compose.yml` vlag
- **`docker compose exec -T db` in `doctor.sh`** — service heet `postgres`, niet `db`; databasechecks faalden altijd stilzwijgend
- **`pg_dump -U mes mes` hardcoded in `backup.sh`** — gebruikt nu `${POSTGRES_USER:-mes}` / `${POSTGRES_DB:-mes}` uit `.env`
- **Stapnummering `update.sh`** — was `[1/4]...[4/4]` gevolgd door `[5/5]`; gecorrigeerd naar consistent `[1/5]...[5/5]`
- **`sleep 5` na herstart in `update.sh`** — vervangen door health-check loop (max 60s) zodat `doctor.sh` pas draait als de backend écht bereikbaar is

### Verbeterd
- `backup.sh` — directorycheck toegevoegd; laadt `.env` voor DB-credentials
- `install.sh` — directorycheck toegevoegd
- `doctor.sh` — redundante sed verwijderd; variabele `MISSING` → `APPLIED_NAMES`

---

## [2026-06-19] — CNC dropdown, product setup tab, HyperMill protocol

### Opgelost
- **CNC machining dropdown toonde alle machinetypen**: dropdown filtert nu uitsluitend op categorie `Freesmachine`.
- **Product setup detailscherm opende op CNC informatie**: bij het selecteren van een stap opent het scherm nu op de tab **Algemene informatie** in plaats van CNC informatie.
- **HyperMill protocol-installatie downloadde HTML in plaats van .reg bestand**: `hypermill-protocol-install.reg` ontbrak in `frontend/public/`. Bestand aangemaakt (UTF-16 LE) dat het `hmopen://` protocol registreert. De registry-command zoekt `hmc.exe` recursief in `C:\Program Files\OPEN MIND\hyperCAD-S\`, waardoor het bij elke versie-update blijft werken.

---

## [2026-06-18] — Deployfix: TypeScript build + migratie 0021 + CNC agent URL

### Opgelost
- **TypeScript TS2454 in `ncr.ts`**: variabele `ncr` werd als niet-gegarandeerd-toegewezen gezien door de compiler omdat de toewijzing in een `try`-blok binnen een retry-loop zat. Opgelost door de loop te herschrijven als een IIFE (`const ncr = await (async () => { ... })()`), zodat `ncr` altijd een `const` met gegarandeerde waarde is.
- **Migratie 0021 (`customer_complaints_v2.sql`) blokkeerde backend**: migratie probeerde `DROP TABLE customer_complaints` maar tabel had afhankelijke objecten (`customer_complaint_documents_ctr_id_fkey`). Opgelost door de migratie idempotent te maken: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` per kolom. Migratie 0068 toegevoegd als vangnet voor bestaande servers.
- **`CNC_AGENT_URL` hardcoded in `docker-compose.yml`**: waarde `http://host.docker.internal:3099` stond vast in de compose file en kon niet via `.env` overschreven worden. Gewijzigd naar `${CNC_AGENT_URL:-http://host.docker.internal:3099}` zodat de URL per omgeving configureerbaar is.

- **Backend → CNC-agent niet bereikbaar** (`502` op `/send-to-machine` en `/trigger-sync`): Windows Defender Firewall blokkeerde inkomende verbindingen op poort 3099. Opgelost door een firewallregel toe te voegen: `New-NetFirewallRule -DisplayName "CNC Agent" -Direction Inbound -Protocol TCP -LocalPort 3099 -Action Allow`.

---

## [2026-06-17] — last-known-good state in CNC agent

### Opgelost
- **Spurious PROGRAM_STARTED na LSV2-blip**: bij een transiënte LSV2-fout (TCP bereikbaar, maar `pgmState=null` en `program=null`) werd de vorige geldige staat overschreven met null. Na herstel dacht `diffState` dat het programma opnieuw gestart was. Fix: `machineGoodState` Map bewaart de laatste echte LSV2-staat en vult `curr` in bij TCP-only fallback. Bij offline wordt de good state gewist zodat overgebleven staat na herverbinding niet gebruikt wordt.

---

## [2026-06-17] — CNC agent stabiliteit + programmastate betrouwbaarheid

### Toegevoegd
- **`programStateKnown` vlag** in `/admin/cnc-downtime/all` API response: `false` als het laatste event `MACHINE_ONLINE` is zonder opvolgende programma-events (herverbinding of te oude software zoals MTE 3200). Dashboard toont dan geen `◼ Gestopt` of `⚠ Onderbroken` badge

### Opgelost
- **Agent miste PROGRAM_STARTED bij eerste detectie**: als de agent opstarte terwijl een programma al draaide, werd dit niet gedetecteerd. `diffState` controleert nu ook bij eerste detectie (`!prev`) of `pgmState === 0` of programmanaam aanwezig is
- **Agent miste PROGRAM_STARTED na offline→online**: zelfde fix toegepast op de offline→online transitie — programma dat al draaide vóór de herverbinding wordt nu alsnog als gestart geregistreerd
- **Valse PROGRAM_STOPPED bij LSV2-blip**: als LSV2 transiënt faalt (TCP bereikbaar maar `pgmState=null` en `program=null`), werd in de fallback-branch toch een `PROGRAM_STOPPED` geëmit. Fix: `PROGRAM_STOPPED` alleen emitteren als `lsv2Reliable` (`pgmState !== null || program !== null`)

### Verbeterd
- **Poll interval**: standaard 10s → 20s (`CNC_STATE_POLL_INTERVAL_MS`) — minder gelijktijdige TCP-verbindingen naar controllers
- **Graceful socket close**: `socket.end()` i.p.v. `socket.destroy()` in `lsv2Command` en `readMachineState` — vermindert RST-pakketten richting controller
- **Sequentieel pollen**: `Promise.allSettled` vervangen door `for`-loop — opent slechts één verbinding tegelijk (was parallel alle machines gelijktijdig)
- **Machine dashboard standaard periode**: "Vandaag" (vanaf 05:30) als standaardweergave

---

## [2026-06-12] — meetmiddelen status "Zoek"

### Toegevoegd
- Nieuwe status **Zoek** bij meetmiddelen: derde radio-knop onder Status (naast Actief en Inactief), amber kleur
- Filterknop **Zoek** in de zijbalk van meetmiddelen
- **Zoek** badge (amber) op lijst-items + amber linkerrand, zelfde systeem als Afgekeurd (rood)
- Migratie `0067`: kolom `zoek boolean DEFAULT false` op `measuring_tools`
- Zoek-tools gedragen zich als Inactief: niet zichtbaar bij filter Actief, tellen niet mee in kalibratie-aantallen

---

## [2026-06-12] — alarm-downtime correctie + machine dashboard badges

### Toegevoegd
- **staleAlarmChecker** job (elke 3 uur): detecteert open alarmen zonder `ALARM_CLEARED` en insereert een synthetisch `ALARM_CLEARED` event zodra er een `PROGRAM_STARTED` na het alarm is gekomen — machine hersteld, alarm voorbij
- **Alarm actief tijdens productie**: nieuw oranje `⚠ Alarm actief` badge op machine-tegels wanneer een alarm triggert terwijl het programma draait; telt niet mee in beschikbaarheid% (was: altijd alarmstilstand)
- **`activeRunningAlarm`** veld in `/admin/cnc-downtime/all` response
- **Tijdstip bij programma-badges**: `▶ Loopt`, `⚠ Onderbroken` en `◼ Gestopt` tonen nu starttijd/eindtijd naast de badge, artikel op de regel eronder
- **`currentProgramStartedAt`** en **`lastRunEndedAt`** velden toegevoegd aan de API response
- **Verspaantijd artikel-badges**: eerste 5 per machine zichtbaar, "+N meer" chip klapt uit naar alle, "Minder" klapt in — per machine apart, zowel in normale weergave als in zoekresultaten

### Opgelost
- **Alarm ≠ alarmstilstand**: `deriveDowntimePeriods` onderscheidt nu alarm tijdens stilstand (echte downtime) vs. alarm tijdens run (informatief). `PROGRAM_STOPPED` tijdens actief alarm start de stilstand op stoptijdstip
- **`PROGRAM_STARTED` sluit open alarm**: als machine een nieuw programma start terwijl een alarm open stond, wordt het alarm automatisch gesloten op dat tijdstip
- **Programma running + open alarmstilstand (tabellen uit de pas)**: als `cnc_program_runs` een open run toont maar `cnc_machine_events` nog een open alarm, wordt de alarmstilstand automatisch gedemoveerd naar `activeRunningAlarm` (geen downtime)
- **Dino max 2 C049 alarm (11-06)**: stale alarm opgeschoond via staleAlarmChecker bij eerste opstart

---

## [2026-06-11] — phantom run cleanup + stale run checker

### Opgelost
- **Verspaantijd inflatie door phantom runs**: 121 runs met duur > 24 uur verwijderd over alle machines (totaal ~28.000 phantom uren). Oorzaak: garbage-namen vóór `sanitizeProgramName` bestond, gecombineerd met ontbrekende auto-close
- FPT Ronin: 6611u → 68u; Dino max 1: 8730u phantom verwijderd

### Verbeterd
- **Stale run checker**: harde grens van 16 uur toegevoegd — elke open run ouder dan 16 uur wordt sowieso gesloten als `interrupted`, ongeacht events. Voorheen alleen bij `MACHINE_OFFLINE`. Voorkomt toekomstige phantom-accumulatie bij machines die stil vallen zonder events te sturen

---

## [2026-06-11] — machine dashboard redesign + program run fixes

### Toegevoegd
- **Machine dashboard — tab-layout**: drie tabs Beschikbaarheid / Spindeluren / Verspaantijd
- **Beschikbaarheid-tegels**: foto, beschikbaarheid%, online/offline-badge, programma-status badge (▶ Loopt / ⚠ Onderbroken / ◼ Gestopt) met artikelnummer, actieve stilstand-badge met tijdstip
- **Detailmodal** bij klik op tegel: totale downtime, waarvan-breakdown (alarm/stilstand/offline/wachttijd), perioden-lijst
- **Vaste tegelgrootte** (h-32 foto + h-52 info = 320px) zodat badges niet verspringen
- **Periodefilter uitgebreid**: nieuw 'Vandaag' (vanaf 05:30), 'Dag' is nu exact 24 uur terug
- **ⓘ info-knop** links van de periodefilter met uitleg per optie
- **assemblyNcNumber-koppeling** in tool-lookup via `toolLibraryAssemblies.ncName` (case-insensitive)
- **Program run auto-afleiding uit event-stroom**: batch-events endpoint maakt/sluit `cnc_program_runs` automatisch op basis van `PROGRAM_STARTED`/`PROGRAM_STOPPED` — mislukken van de aparte runs-POST heeft geen gevolgen meer

### Opgelost
- **`interrupted` vs `stopped` verwarring**: auto-close bij nieuwe PROGRAM_STARTED gebruikte altijd `interrupted`, ook bij normaal afgeronde cycli. Nu `stopped`; `interrupted` gereserveerd voor expliciete agent-signalen (crash/fout). 360+ historische runs gecorrigeerd
- **Phantom runs opgeschoond**: MTE Portaal (9 runs), Dino max 1 en FPT Ronin (nacht-phantoms) gesloten als `interrupted`; threshold-cleanup toegepast over alle machines
- **Backend draaide oude code**: `programRunning`, `currentProgram`, `lastRunStatus`, `photoUrl` ontbraken in API-response door niet-herstarte container — opgelost via expliciete restart
- **Badges naast elkaar**: Online/Offline en programma-status badges stonden inline naast elkaar door ontbrekende `<div>`-wrapper

### Verbeterd
- `tsconfig.json` frontend: `ignoreDeprecations: "6.0"` toegevoegd voor `baseUrl`-waarschuwing

---

## [2026-06-10] — verspaantijd datacorrectie

### Opgelost
- **Phantom program runs (verspaantijd inflatie)**: LSV2-agent stuurde soms binary garbage vóór de programmanaam (`TNC:\...`), waardoor runs nooit gematcht werden met een PROGRAM_STOPPED en onbeperkt doorliepen. Fixes:
  1. `sanitizeProgramName()` strips alles vóór `TNC:\` bij opslag
  2. Bij een nieuwe run worden openstaande runs voor die machine automatisch afgesloten (`interrupted`)
- **Fooke 704 — artikel 22037**: 21 zombie-runs verwijderd (bulk-gesloten op 2026-06-10, ~3.907 uur phantom tijd). Gecorrigeerde verspaantijd: **1.697 uur** (was 5.604 uur)

---

## [2026-06-10] — machines & dashboard fixes

### Verbeterd
- Machine foto in formulier en sidebar: `object-contain` + `bg-gray-50` zodat volledige afbeelding zichtbaar is zonder bijsnijden
- Machine foto in product/meet setup machine-kiezer vergroot (w-24) en op `object-contain` gezet
- Foto-upload beschikbaar voor alle ingelogde medewerkers (was: alleen admin)
- Ctrl+V paste voor machine foto hersteld: listener op capture-fase zodat input-velden het niet blokkeren

### Opgelost
- **Machine dashboard — spook-alarmstilstand bij offline machine**: `deriveDowntimePeriods` emitteerde een lopende `alarmstilstand` naast een lopende `offline` periode als de machine offline ging met een actief alarm zonder tussenkomst van `ALARM_CLEARED`. Fix: (1) lopende alarm alleen tonen als machine niet offline is; (2) actief alarm afsluiten op offline-tijdstip bij `MACHINE_OFFLINE` zodat het niet doorlekt naar de volgende online-sessie. Geverifieerd op Fooke 704 — PASS.

---

## [2026-06-11]

### Toegevoegd
- Meetmiddelen: kalibratie-export als PDF (verlopen / kritisch / beide), filterbaar op locatie
- Meetmiddelen: batch-verzendingen — selecteer meetmiddelen, sla op als batch, beheer status (concept / weggestuurd / terug), download PDF per batch
- Rotatie-logica: vervaldatum normaliseert op `max(kalibratiedatum, oude vervaldag) + interval` zodat vroeg kalibreren het schema niet vervroegt

### Verbeterd
- Machines: sidebar-foto vergroot van 36px naar 56px

---

## [2026-06-10] — avond

### Toegevoegd
- Artikel-zoekfunctie in verspaantijd dashboard: zoek op (deel van) artikelnummer, zie totaal over alle machines + per machine met variant-badges
- Variant-badges in zoekresultaten zijn klikbaar om tijd weg te filteren (zelfde patroon als normale weergave)

---

## [2026-06-10] — vervolg

### Toegevoegd
- Alarmtekst tonen bij actieve alarmstilstand in machine dashboard (onder de rode badge)
- Machines modals vergroot: aanmaken/bewerken en detail-portals voor onderhoud en storingen (~2x breder, minimumhoogte toegevoegd)
- CHANGELOG.md toegevoegd voor bijhouden van wijzigingen

### Verbeterd
- Onderhoudstaak formulier: betere grid-layout (4 kolommen voor status/prioriteit/datums)
- Storing formulier: titel + status + prioriteit in één rij

---

## [2026-06-10]

### Toegevoegd
- Machine contactvelden: e-mailadres en telefoonnummer leverancier + onderhoud fabrikant (1 en 2)
- SMTP-test toont nu specifieke foutmelding bij firewall-blokkade, auth-fout, DNS-fout of TLS-probleem
- Verspaantijd sectie in machine dashboard: totaal per Freesmachine per periode, met progressiebalk, artikel-badges en "halfjaar" filteroptie
- Standaard registratietype per onderhoudstaak: eenmalig instellen, daarna direct openen zonder dropdown

### Verbeterd
- Migratie-runner vervangen: eigen runner op basis van bestandsnaam (niet hash) — lost structureel probleem op waarbij Drizzle migraties silent oversloeg
- Admin-sessie verlengd van 8 uur naar 24 uur

### Opgelost
- **SMTP "Verzending mislukt"** — kolom `interval_taken` ontbrak in de database door gemiste migratie (0062)
- **Product Setup 500-error op VM** — kolom `archived_at` ontbrak door dezelfde migratie-runner bug (0063)
- **Onderhoudstaak opslaan mislukte** — admin-token verlopen na 8 uur waardoor 403 teruggegeven werd

---

## [2026-06-09]

### Toegevoegd
- BUSL-1.1 licentie toegevoegd (eigenaar: Arne Nijman, gebruiker: Dutch Shape B.V.)
- Meet Setup: tegel "Niet vooraf bepaald" zichtbaar in machine-selectiescherm

### Opgelost
- Race condition bij gelijktijdig aanmaken van NCR opgelost via retry-loop
- Machine dashboard toegankelijk gemaakt voor kiosk-gebruikers

---

## [Eerder]

### Toegevoegd
- PIN invoer via toetsenbord (0–9, Backspace, Escape)
- Ctrl+V plakken voor machine- en component-foto's met auto-opslaan na upload
- Kiosk aanmeldscherm toont max 12 medewerkers met "toon meer" knop
- Setup Archief module
- Stale run checker

### Opgelost
- NCR opslaan mislukte door strict enum validatie
- `emailNotificaties` ontbrak in GET /admin/employees response
- Machine dashboard ontbrak in sidebar-modulepermissies
- NavKey namen klopten niet met labels (mijn_taken / mijn_meldingen)
