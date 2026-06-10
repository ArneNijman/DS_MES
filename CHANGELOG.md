# Changelog

Alle noemenswaardige wijzigingen worden in dit bestand bijgehouden.  
Formaat gebaseerd op [Keep a Changelog](https://keepachangelog.com/nl/1.0.0/).

---

## [Unreleased]

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
