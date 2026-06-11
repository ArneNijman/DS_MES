# Changelog

Alle noemenswaardige wijzigingen worden in dit bestand bijgehouden.  
Formaat gebaseerd op [Keep a Changelog](https://keepachangelog.com/nl/1.0.0/).

---

## [Unreleased]

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
