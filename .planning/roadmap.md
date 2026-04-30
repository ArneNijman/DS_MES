# Roadmap: Factory Assistant MES

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
- Verdere tabs (bijlagen, opvolging) beschikbaar op aanvraag

---

## ✅ CNC Machining — Tool tabel

**Afgerond:** 2026-04-21

- Sidebar-entry "CNC Machining" in kiosk dashboard
- Admin-module: upload TOOL.T bestand → parser vult toolmagazijn
- Toolmagazijn per machine met LIFE%-balk, LOCK-status, sync-log
- Statistieken: totaal tools, at-risk, critical, expired, locked
- Samenstellingen tab: wisselplaat-opsplitsing (houder / frees / wisselplaat / schroef)
- Schroef-artikelnummer en foto invulbaar per WP-component
- Zoeken over alle machines (globale tabel)
- CNC-machines filter: machines met `cnc_ip_address` of `cnc_controller` ingevuld
- WinTool XML library import via UI

---

## ✅ Product Setup

**Afgerond:** 2026-04-29

- Product Setup kiosk module: koppeling productieorder → machine → stappen
- Per stap vier tabs:
  - **Algemene informatie** — nulpunt X/Y/Z (tekst), beschrijving; portaal Tekeningen + CAD
  - **CNC informatie** — NC-bestandsportaal (hernoemen, actief selecteren, timestamp), importeer samenstellingen, SYNC + validatie timestamp, toolvalidatietabel
  - **Bijlagen** — foto's en documenten, bijschrift, lightbox bij klik op thumbnail
  - **Overdracht** — vrij-tekst log (naam + timestamp), foto's toevoegen, lightbox, bewerken/verwijderen
- Toolvalidatietabel: dot · TOOL (T-slot of —) · NAME · DOC · L · DL · DR · TIME2 · CUR.TIME · LIFE% · LOCK
- Tool-status: "in machine" (groen dot) of "—" als tool nog opgebouwd moet worden
- NC-bestand parser: TOOL CALL regels extraheren, matching tegen live toolmagazijn (case-insensitive)
- Samenstelling per tool: houder / frees / wisselplaat / schroef met foto's
- Welke machine/slot een component bezet: popup met instanties

---

## ✅ Product Setup uitbreidingen + Demonteren + multi-format TOOL.T

**Afgerond:** 2026-04-30

### Product Setup verbeteringen
- Zoekfunctie op productieorder, artikel én omschrijving
- Aanmaken setup: omschrijvingsveld toegevoegd; `article_name` is niet langer verplicht
- Setup verwijderen (met bevestigingsdialoog)
- Bewerkingsnummer (`bewerking_nr`) per stap: optioneel veld naast de stapnaam
- InlineEdit voor productieorder en artikelnummer in setup-detailpaneel

### Tooling Kiosk — Demonteren tab
- Nieuwe tab "Demonteren" naast "Artikelen" in de kiosk Tooling module
- Zoek een assemblage op ncName, toolnaam of houdernaam
- Toon alle componenten (houder / frees / wisselplaat) met voorraadlocaties per component
- Pas voorraad direct aan per locatierij (+/− knoppen) zonder terug te hoeven naar het artikeloverzicht

### CNC Machining — multi-format TOOL.T parser
- `toolTableParser.ts` herschreven: ondersteunt nu zowel klassiek Heidenhain als Fooke/modern format (header-gebaseerde kolomdetectie)
- Komma als decimaalscheider wordt automatisch omgezet
- Per machine instelbaar via `tool_table_format` veld (null = Heidenhain, `fooke`, `ronin`, `3200`, `portaal`)
- Admin Machines-scherm: dropdown "TOOL.T formaat" per machine
- CNC-admin tabel: TIME2 en CUR.TIME kolommen zichtbaar; CUR.TIME rood als ≥ TIME2

### Migraties
- `0039_product_setup_order_required.sql` — `article_name` nullable gemaakt
- `0040_step_bewerking_nr.sql` — `bewerking_nr` kolom op `product_setup_steps`
- `0041_machine_tool_table_format.sql` — `tool_table_format` kolom op `machines`

---

## 🚧 Fase 10: Meetmiddelen & Kalibratie

**Status:** Not started

**Scope (gepland):**
- Overzicht van alle meetmiddelen per categorie
- Kalibratieschema + vervaldatum melding
- Kalibratielog per meetmiddel
- Documenten (kalibratierapport upload)
- Koppeling aan medewerker (wie heeft gecalibreerd)

---

## ⬜ Fase 11: CoC-Generatie

**Status:** Not started

**Scope (gepland):**
- Certificate of Conformance genereren vanuit productieorder
- PDF-export met artikelgegevens, bewerkingen en kwaliteitshandtekening

---

## ⬜ Fase 12: Stilstandregistratie

**Status:** Not started (lagere prioriteit)

**Scope (gepland):**
- Registratie van ongeplande stilstand per machine
- Oorzaakcategorieën, duur, koppeling aan NCR

---

## ⬜ Fase 13: BC Webhooks

**Status:** Not started (lagere prioriteit)

**Scope (gepland):**
- Vervangt polling door push-events vanuit Business Central
- Snellere orderstatus-updates in kiosk

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
| 10 | Meetmiddelen & Kalibratie | ⬜ Not started | — |
| 11 | CoC-Generatie | ⬜ Not started | — |
| 12 | Stilstandregistratie | ⬜ Not started | — |
| 13 | BC Webhooks | ⬜ Not started | — |
