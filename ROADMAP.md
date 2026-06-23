# DS MES — Roadmap

## Milestones

- ✅ **v1.0 Fundament + Beheer** — Shipped 2026-03-09
- 🚧 **v2.0 Kwaliteitsverdieping** — In progress

---

## ✅ Fase 1–6.1: v1.0 Fundament + Beheer + Kiosk

**Afgerond:** 2026-03-09

- Docker Compose stack (frontend, backend, worker, postgres, redis)
- Kiosk aanmeldtegels + PIN-login
- Admin login + JWT-authenticatie
- BC API koppeling (OAuth2 client credentials, AES-256-GCM encryptie clientSecret)
- Medewerkersbeheer (CRUD, PIN, rol, foto, BC-sync)
- BC Veldmapping (auto-detectie + verificatie UI)
- Machinebeheer (CRUD, categorieën, foto, CNC-configuratie)
- Kiosk dashboard + module-kaarten
- Taken-module (mijn taken, toewijzen)
- NCR basis (non-conformiteit registratie, kanban)
- Tekening Ballonnen module

---

## ✅ Fase 7: v1 Fixes

**Afgerond:** 2026-03-10

- sessionStorage/localStorage inconsistentie kwaliteitsmodule opgelost
- `/manager/timeline` frontend ManagerRoute guard toegevoegd
- BC clientSecret encryptie live gezet

---

## ✅ Fase 8: Tekening Ballonnen

**Afgerond:** 2026-03-14

- Tekening viewer met ballon-annotaties
- Koppeling aan bewerkingsstappen

---

## ✅ Fase 9: NCR Statistieken

**Afgerond:** 2026-03-16

- NCR statistieken dashboard
- Grafieken per categorie, periode, status

---

## ✅ Kwaliteitsverdieping — Preventieve Maatregelen

**Afgerond:** 2026-04-16

- Kanban voor preventieve maatregelen (PCM_XX nummering)
- Detail modal: uitvoerder via EmployeePickerModal, datums, stilstand, omschrijving, resultaat
- Cross-navigatie NCR ↔ Preventief ("Start preventieve maatregel" knop bij NCR)
- EmployeePickerModal als gedeeld component (`frontend/src/components/kiosk/`)

---

## ✅ Kwaliteitsverdieping — Klantmeldingen

**Afgerond:** 2026-04-16

- Kanban voor klantmeldingen (CTR_10001+ nummering)
- Detail modal Tab Melding: klant, ordernummers, contactpersoon, artikel, oorzaak/foutcode, omschrijving

---

## ✅ CNC Machining — Tool tabel

**Afgerond:** 2026-04-21

- Sidebar-entry "CNC Machining" in kiosk dashboard
- Admin-module: upload TOOL.T bestand → parser vult toolmagazijn
- Toolmagazijn per machine met LIFE%-balk, LOCK-status, sync-log
- Samenstellingen tab: wisselplaat-opsplitsing (houder / frees / wisselplaat / schroef)
- Schroef-artikelnummer en foto invulbaar per WP-component
- WinTool XML library import via UI

---

## ✅ Product Setup

**Afgerond:** 2026-04-29

- Product Setup kiosk module: koppeling productieorder → machine → stappen
- Per stap vier tabs: Algemene informatie · CNC informatie · Bijlagen · Overdracht
- NC-bestand parser: TOOL CALL regels extraheren, matching tegen live toolmagazijn (case-insensitive)
- Toolvalidatietabel: dot · TOOL · NAME · DOC · L · DL · DR · TIME2 · CUR.TIME · LIFE% · LOCK

---

## ✅ Product Setup uitbreidingen + Demonteren + multi-format TOOL.T

**Afgerond:** 2026-04-30

- Zoekfunctie op productieorder, artikel én omschrijving
- Setup verwijderen, bewerkingsnummer per stap, InlineEdit
- Tooling Kiosk — Demonteren tab met voorraad aanpassen per locatierij
- `toolTableParser.ts` herschreven: Heidenhain + Fooke/modern format; komma als decimaalscheider
- Per machine instelbaar via `tool_table_format` (null / fooke / ronin / 3200 / portaal)

---

## ✅ NCR verbeteringen — Human Factor

**Afgerond:** mei 2026

- Human factor velden toegevoegd aan NCR registratie
- NCR detail uitgebreid met extra categorisatie-opties

---

## ✅ Meetmiddelen uitbreidingen + Machine categorieën + Meet Setup

**Afgerond:** 2026-05-11

- Twee nieuwe machine-categorieën: Meetapparaat en 3D-meetapparaat
- Meetmiddelen: serie suffix veld (laatste 5 cijfers serienummer)
- Opmerkingen per bewerkingsstap in CNC informatie tab
- Meet Setup module (kopie Product Setup, gericht op 3D-meetapparaten, zonder CNC tab)
- Meet bestanden portaal: upload en parseer XML meetbestanden

---

## ✅ CNC Agent monitoring + Machine Dashboard

**Afgerond:** 2026-05-19

- Continu machinestatus via LSV2 R_RI (elke 10 seconden, geen DNC-licentie nodig)
- Programma-runs: STARTED/STOPPED events, duur berekend, stop-reden per run
- Spindeluren bijgehouden via optelsom programma-looptijden
- `deriveDowntimePeriods()` — event-stroom → stilstandsperioden (OFFLINE_MIN_SEC=300, STILSTAND_THRESHOLD=600)
- Machine Dashboard (admin + kiosk): beschikbaarheid %, downtime-bars, spindeluren lijndiagram
- Periode-filter: Vandaag · 7 dagen · Maand · Kwartaal · Jaar

---

## ✅ Mijn taken & Mijn meldingen

**Afgerond:** 2026-05

- Mijn taken kiosk-pagina (`mijn-taken-todo.tsx`) — persoonlijk takoverzicht met todo-status per medewerker
- Mijn meldingen kiosk-pagina (`mijn-meldingen.tsx`) — samenvatting openstaande NCR-acties + calibratiemeldingen per medewerker

---

## ✅ Fase 10: Meetmiddelen & Kalibratie (uitbreiding)

**Afgerond:** 2026-06

- Overzicht per categorie, vervaldatum-badges, serie suffix veld
- Kalibratielog per meetmiddel
- Documenten (kalibratierapport upload)
- Koppeling aan medewerker (wie heeft gecalibreerd)

---

## 🚧 Fase 10b: Metrologie — Inspectieviewer (Phase 4 gepland)

**Context:** Browser-native inspectie- en metrologieomgeving die direct integreert met de bestaande Product Setup module.

De architectuur scheidt vier lagen:
- **CAD Layer** — STEP-geometrie, scene graph, assemblages
- **Inspection Layer** — PC-DMIS meetdata, features, GD&T
- **Overlay Layer** — gekleurde punten, vectoren, heatmaps, tolerantiezones
- **MES Layer** — productieorders, machinehistorie, cross-project analyse

> **Enkelstuks / projectmatig**: Traditionele SPC (Cp/Cpk) is niet van toepassing — elke opdracht levert 1 meting per feature. Phase 4 is daarom gebaseerd op cross-project machine-intelligentie.

### Phase 1 — MVP Inspectieviewer (✅ Gebouwd)

Gebouwd (2026-05/06):
- Meetmaten tab in Product Setup + Meet Setup (balloon-annotaties op tekening, PDF split-view)
- Balloon positie opslaan in DB (`product_setup_maten`, migratie 0059–0060)
- PDF viewer met sidebar voor maten-overzicht
- "Meet bestanden" portal in Product Setup (naast Tekeningen en CAD bestanden)
- Upload PC-DMIS XML meetbestand met rapportage type
- Feature-tabel met nominaal, gemeten, deviatie en pass/fail per feature
- Gekleurde bollen (groen = OK, rood = FAIL) op het 3D CAD model

**Technisch:**
- PC-DMIS XML parser (`backend/src/cnc/pcdmisParser.ts`) met meerdere format-fallbacks
- `documentType`: `'meting_xml'` en `'meting_rapport'`
- Three.js sphere overlay via `inspectionPoints` prop op CadViewer

### Phase 2 — Geavanceerde metrologie-visualisatie (✅ Gebouwd)

- Smooth kleurheatmap op STEP-oppervlak (blauw / groen / rood)
- Deviatievectoren: pijlen van nominaal naar gemeten oppervlak
- GD&T overlays: vlakheid, positie, loodrechtheid, concentriciteit

### Phase 3 — Volledige scan-vergelijking (✅ Gebouwd)

- Upload puntenwolk (XYZ) of scan mesh (STL/OBJ/PLY)
- Overlay van gemeten mesh op nominaal STEP model
- Profielcurve-analyse per doorsnede

### Phase 4 — Cross-project machine-intelligentie (Gepland — vereist 6–12 maanden data)

- Machine-fingerprinting: systematische drift per machine detecteren
- Feature-type clustering: alle H7-boren ø10–12mm over projecten heen
- Tool-wear over projecten: correlatie slijtage → feature-afwijking
- Revisie-vergelijking: vergelijkbare onderdelen voor dezelfde klant over meerdere projecten

---

## ✅ Verbeteringen juni 2026

**Afgerond:** 2026-06-10

- Machine Dashboard: verspaantijd per Freesmachine per periode (dag/maand/kwartaal/halfjaar/jaar), progressiebalk, klikbare artikel-badges, info-popover
- Halfjaar filteroptie toegevoegd aan machine dashboard periode-filter
- Standaard registratietype per onderhoudstaak: eenmalig instellen, modal opent direct met type vooringevuld
- Machine contactvelden: e-mailadres + telefoonnummer leverancier en onderhoud fabrikant (1 en 2)
- SMTP test toont specifieke foutmelding bij firewall-blokkade, authenticatie, DNS of TLS-problemen
- Migratie-runner vervangen: tracking op bestandsnaam in plaats van hash — lost structureel probleem op waarbij migraties silent werden overgeslagen
- Admin-sessieduur verlengd van 8h naar 24h
- BUSL-1.1 licentie toegevoegd (eigenaar: Arne Nijman, gebruiker: Dutch Shape B.V.)

**Opgelost:**
- SMTP "Verzending mislukt" — kolom `interval_taken` ontbrak door gemiste migratie
- Product Setup 500-error op VM — kolom `archived_at` ontbrak door dezelfde bug
- NCR race condition bij gelijktijdig aanmaken opgelost via retry-loop

---

## ✅ Tooling stocklocaties verbeteringen

**Afgerond:** 2026-06-23

- Lade/vak velden per stocklocatie (migratie 0072)
- Uitboeken/Bijboeken knoppen (rood/groen) met aantalveld in het midden
- Artikel-detail modal vergroot (max-w-6xl, 96vh) met flex-layout
- Mutatielijst met gelabelde kolommen (Locatie · Lade · Vak · Mutatie), onafhankelijk scrolbaar
- Foutafhandeling "Artikel niet gevonden": retry:false + sluitknop

---

## ⬜ Fase 11: CoC-Generatie

**Status:** Not started

- Certificate of Conformance genereren vanuit productieorder
- PDF-export met artikelgegevens, bewerkingen en kwaliteitshandtekening

---

## ⬜ Fase 13: BC Webhooks

**Status:** Not started (lagere prioriteit)

- Vervangt polling door push-events vanuit Business Central
- Snellere orderstatus-updates in kiosk

---

## Optioneel — Informatie uit Business Central


### O1 — Externe BI koppeling (Power BI / Grafana)
PostgreSQL is al toegankelijk; Power BI kan via ODBC direct verbinden zonder extra code. Grafana kan via de bestaande REST API worden gekoppeld.

### O2 — Bi-directioneel ERP → machine
Business Central koppeling is al deels aanwezig (BC_CLIENT_ID). Orders vanuit BC direct naar machines sturen via DNC/FTP (Heidenhain ondersteunt dit). Vereist afstemming met machinepark en netwerkinrichting.

### O3 — Bredere machine-protocollen
- **FANUC** — FOCAS REST API
- **Siemens** — OPC-UA
- **Haas / Mitsubishi** — eigen adapters

Nieuwe agent naast de bestaande LSV2 agent. Architectuur staat dit al toe.

### O4 — Materiaal- en energieverbruik per order
Vereist fysieke meetpunten (energiemeters, voorraadkoppeling). De softwarekant (tijdreeks opslaan per order, dashboard) sluit aan op de bestaande `cnc_machine_metrics` aanpak.

### O5 — Dashboard builder (drag-and-drop)
Visuele dashboards zonder code bouwen op basis van de bestaande data. Meer frontend werk; data is er al.

---

## Progress overzicht

| Fase | Omschrijving | Status | Afgerond |
|------|-------------|--------|----------|
| 1–6.1 | v1.0 Fundament + Beheer + Kiosk | ✅ Shipped | 2026-03-09 |
| 7 | v1 Fixes | ✅ Complete | 2026-03-10 |
| 8 | Tekening Ballonnen | ✅ Complete | 2026-03-14 |
| 9 | NCR Statistieken | ✅ Complete | 2026-03-16 |
| — | Preventieve Maatregelen | ✅ Complete | 2026-04-16 |
| — | Klantmeldingen | ✅ Complete | 2026-04-16 |
| — | CNC Machining — Tool tabel | ✅ Complete | 2026-04-21 |
| — | Product Setup | ✅ Complete | 2026-04-29 |
| — | Product Setup uitbr. + Demonteren + multi-format parser | ✅ Complete | 2026-04-30 |
| — | NCR verbeteringen — Human Factor | ✅ Complete | mei 2026 |
| — | Meetmiddelen uitbr. + Machine cat. + Meet Setup | ✅ Complete | 2026-05-11 |
| — | CNC Agent monitoring + Machine Dashboard | ✅ Complete | 2026-05-19 |
| — | Mijn taken & Mijn meldingen | ✅ Complete | 2026-05 |
| 10 | Meetmiddelen & Kalibratie (uitbreiding) | ✅ Complete | 2026-06 |
| 10b | Metrologie — Inspectieviewer Phase 1–3 | ✅ Complete | 2026-06 |
| 10b | Metrologie — Inspectieviewer Phase 4 | 🚧 Gepland | — |
| — | Verbeteringen juni 2026 (dashboard, contactvelden, migratie-runner) | ✅ Complete | 2026-06-10 |
| — | Tooling stocklocaties verbeteringen (lade/vak, modal redesign) | ✅ Complete | 2026-06-23 |
| 11 | CoC-Generatie | ⬜ Not started | — |
| 13 | BC Webhooks | ⬜ Not started | — |
