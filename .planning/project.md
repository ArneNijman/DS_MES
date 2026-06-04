# DS MES — Systeembeschrijving

**Dutch Shape Manufacturing Execution System**  
Programma-eigenaar: Arne Nijman | Versie: v2.0 | Status: actief in gebruik

---

## Visie

Dutch Shape werkt met enkelstuks precisie-onderdelen. Elk order is uniek, elke machine heeft zijn eigen gereedschapsopstelling, en elke operator moet exact weten wat er van hem verwacht wordt — zonder dat hij daarvoor een ERP-systeem hoeft te begrijpen.

De kern van het probleem: **Business Central (ERP) beheert orders en financiën, maar spreekt de taal van de werkvloer niet.** Operators werken met machines, gereedschappen, bewerkingsstappen en kwaliteitsregistraties — niet met boekingen en inkooporders.

Het DS MES vult precies die ruimte op. Het is geen vervanger van Business Central, maar een **operationele intelligentielaag erboven**: het haalt relevante informatie uit BC, combineert dat met machine-data en geeft de werkvloer een interface die aansluit op hoe ze werken.

**Doel:** elke medewerker op de werkvloer — van operator tot kwaliteitsmedewerker tot CNC-programmeur — heeft altijd de juiste informatie op het juiste moment, zonder afhankelijk te zijn van papier, e-mail of mondelinge overdracht.

---

## Wat het systeem doet

Het MES bestaat uit drie informatiestromen die samenkomen:

**1. ERP-data (Business Central)**  
Productieorders, artikelen en medewerkersinformatie worden periodiek gesynchroniseerd vanuit BC. Operators hoeven geen ordernummer over te typen — ze kiezen uit een lijst van actieve orders die het systeem automatisch bijhoudt.

**2. Machine-data (CNC Agent)**  
Een lichte Windows-applicatie (de CNC Agent) bewaakt continu alle CNC-machines via het LSV2-protocol. Het registreert wanneer een machine start, stopt, een alarm geeft of offline gaat. Ook haalt het automatisch de gereedschapstabellen (TOOL.T) op. Alles wordt doorgestuurd naar het MES zonder dat er iemand iets handmatig hoeft te doen.

**3. Werkvloer-data (operators)**  
Wat operators zelf invoeren: productiesetups, kwaliteitsregistraties, overdrachtsnotities, meetresultaten. Dit is de data die nergens anders vandaan komt — het is de kennis van de werkvloer vastgelegd in het systeem.

---

## Hoe het is opgebouwd

### Twee interfaces

Het systeem heeft twee ingangen die voor verschillende doelgroepen zijn bedoeld:

**Kiosk** — de werkvloer-interface  
Touch-first, grote knoppen, minimale tekst. Ontworpen voor gebruik met handschoenen, op een tablet of industrieel scherm naast de machine. Operators loggen in met hun PIN-code op een persoonlijke tegel. Alles wat ze nodig hebben is binnen twee tikken bereikbaar.

**Admin** — het beheerpaneel  
Standaard web-interface met sidebar. Bedoeld voor beheerders, werkvoorbereiders en management. Hier worden medewerkers en machines beheerd, BC-koppelingen geconfigureerd en dashboards bekeken.

### Technische lagen

```
Browser (React + TypeScript)
    │
    ▼
Backend API (Fastify + Node.js)
    │
    ├── PostgreSQL 16 (alle data)
    ├── Redis (achtergrondtaken via BullMQ)
    └── Business Central (REST API via MSAL OAuth2)

CNC Agent (Windows PC, apart proces)
    │
    ├── LSV2 → machinestatus elke 10 sec
    └── TNCcmd → TOOL.T bestanden elke 30 min
```

De server draait volledig in Docker Compose en is bereikbaar via poort 8080 in de browser. De CNC Agent draait op een gewone Windows PC in het netwerk — niet op de machine zelf, geen speciale software op de CNC-controllers.

---

## Modules — wat ze doen en waarom

### Product Setup

**Waarvoor:** werkvoorbereiders leggen hier vast hoe een productieorder uitgevoerd moet worden. Operators raadplegen dit tijdens de productie.

**Hoe het werkt:**  
Een setup is gekoppeld aan een productieorder en bestaat uit één of meerdere stappen. Elke stap staat voor een bewerking op een specifieke machine. Per stap zijn er vier tabs:

- *Algemene informatie* — nulpunten (X/Y/Z als vrije tekst), omschrijving, tekeningen en CAD-bestanden
- *CNC informatie* — NC-programmabestanden, automatische toolvalidatie (zie hieronder), opmerkingen
- *Bijlagen* — foto's en documenten met bijschrift
- *Overdracht* — vrij-tekst logboek zodat ploegwisselingen soepel verlopen

**Toolvalidatie — hoe het werkt:**  
Bij het uploaden van een NC-programma (.h bestand) parseert het systeem automatisch alle `TOOL CALL` regels. Die worden vergeleken met het live toolmagazijn van de machine (gesynchroniseerd via TOOL.T). De operator ziet direct welke tools al in de machine zitten (groene dot) en welke nog opgebouwd moeten worden (streepje). Matching is case-insensitive om naamverschillen te voorkomen.

**Postprocessor-validatie:**  
Per machine is een postprocessor ingesteld (bijv. `04-MTE_BF4200_iTNC530`). Als een NC-bestand voor een andere postprocessor is gegenereerd, toont het systeem een oranje waarschuwing en blokkeert de "Stuur naar machine" knop. Dit voorkomt dat een operator per ongeluk een NC-bestand naar de verkeerde machine stuurt.

---

### Meet Setup

**Waarvoor:** hetzelfde principe als Product Setup, maar dan voor 3D-meetapparaten. Meetstappen per opdracht vastleggen, inclusief meetbestanden en resultaten.

**Hoe het werkt:**  
Identieke structuur als Product Setup, maar zonder CNC-tab. Toont alleen machines met categorie *3D-meetapparaat*. De data zit in dezelfde databasetabellen als Product Setup, gescheiden via een `setup_type` veld — zo hoeft er geen dubbele infrastructuur te zijn.

Het meet bestanden portaal accepteert PC-DMIS XML exports. Het systeem parseert deze automatisch naar een feature-tabel met nominale waarden, gemeten waarden, deviatie en pass/fail status per feature.

---

### Metrologie — 3D Inspectieviewer

**Waarvoor:** meetresultaten visueel terugzien op het 3D CAD model. Niet alleen een tabel, maar direct zien waar op het onderdeel afwijkingen zitten.

**Hoe het werkt:**  
Het systeem laadt het STEP-model van het onderdeel en projecteert de meetpunten erop. De visualisatie is opgebouwd in vier lagen die stap voor stap zijn uitgebouwd:

- *Phase 1* — Gekleurde bollen op de meetpunten (groen = OK, rood = FAIL), hover-tooltip met details
- *Phase 2* — Kleurheatmap over het STEP-oppervlak (blauw/groen/rood), deviatievectoren als pijlen, GD&T overlays
- *Phase 3* — Puntenwolk (XYZ) en scan mesh (STL/OBJ) overlay op het nominale STEP model
- *Phase 4 (gepland)* — Cross-project analyse: drift per machine, tool-wear correlatie, revisievergelijking over meerdere projecten

**Waarom deze aanpak:**  
Traditionele SPC (Cp/Cpk) werkt niet bij enkelstuks productie — je hebt maar één meting per feature per project. Phase 4 lost dit op door over projecten heen te analyseren: dezelfde feature op dezelfde machine over 20 projecten geeft wél statistische waarde.

---

### CNC Machining — Toolmagazijn

**Waarvoor:** operators en CNC-medewerkers zien exact welke gereedschappen er in elke machine zitten, wat de slijtage is en welke wisselplaten er gebruikt worden.

**Hoe het werkt:**  
De CNC Agent haalt automatisch het TOOL.T bestand op van elke machine (elke 30 minuten). Het backend parseert dit bestand naar individuele toolregels. De kiosk-interface toont per machine een overzicht met LIFE%-balk, LOCK-status en levensduurkolommen (TIME2 / CUR.TIME).

De parser ondersteunt meerdere TOOL.T formaten (Heidenhain klassiek, Fooke/modern, Ronin, 3200, Portaal) omdat verschillende machines een andere kolomindeling gebruiken. Per machine is het formaat instelbaar in de admin.

**Samenstellingen:**  
Wisselplaattools bestaan uit meerdere componenten (houder, freeslichaam, wisselplaat, schroef). Het systeem splitst deze op via het WP:-patroon in de tool-comment. Per component is een artikelnummer en foto opslaan, zodat operators direct weten wat ze moeten bestellen.

---

### Tooling Library

**Waarvoor:** het volledige toolbeheer los van de CNC-machines. Componentenregistratie, voorraadlocaties en demonteren.

**Hoe het werkt:**  
Twee tabs:
- *Artikelen* — alle toolcomponenten en samenstellingen, inclusief WinTool XML import
- *Demonteren* — zoek een assemblage op naam, zie alle componenten met voorraadlocaties en pas de voorraad direct aan

De WinTool koppeling werkt via de CNC Agent: als een WinTool .db bestand is ingesteld, detecteert de agent wijzigingen en synchroniseert automatisch naar het MES.

---

### Kwaliteitsmodules (NCR / Preventief / Klantmeldingen)

**Waarvoor:** het registreren, opvolgen en analyseren van kwaliteitsafwijkingen — intern (NCR), extern (klantmeldingen) en structureel (preventieve maatregelen).

**Hoe het werkt:**  
Alle drie werken als kanban-bord. De koppeling tussen modules is bewust ingebouwd: vanuit een NCR kan direct een preventieve maatregel worden gestart. Zo blijft de opvolgketen zichtbaar en aantoonbaar.

- *NCR* — registratie met foutcode, oorzaak, human factor velden; PDF rapport genereren; statuslog per NCR
- *Preventieve Maatregelen* — PCM_XX nummering, uitvoerder toewijzen, resultaat vastleggen
- *Klantmeldingen* — CTR_10001+ nummering, klantgegevens, oorzaak/foutcode

**NCR Statistieken:**  
Aparte pagina met grafieken over NCR-trends: per categorie, per periode, per status. Geeft inzicht in welke afwijkingen terugkeren.

---

### Meetmiddelen & Kalibratie

**Waarvoor:** alle meetgereedschappen beheren en de kalibratieplanning bewaken.

**Hoe het werkt:**  
Elk meetmiddel heeft een kalibratie-interval. Het systeem berekent automatisch wanneer de kalibratie verloopt en toont badges: rood bij verlopen, oranje bij binnenkort. Kalibratierapport uploaden, kalibratielog per instrument, koppeling aan de medewerker die heeft gecalibreerd.

Het *serie suffix* veld (laatste 5 cijfers serienummer) maakt het snel scannen en terugvinden van instrumenten op de werkvloer mogelijk.

---

### Machine Dashboard

**Waarvoor:** management en productiecoördinatie zien in één oogopslag hoe beschikbaar de CNC-machines zijn geweest.

**Hoe het werkt:**  
De CNC Agent stuurt continu machinestatus-events naar het MES. Het backend leidt hieruit stilstandsperioden af (on-the-fly, geen aparte tabel nodig):

- Offline perioden korter dan 5 minuten worden genegeerd (monitoring-ruis)
- Een gap van meer dan 10 minuten tussen programma-stop en volgende start telt als stilstand
- Beschikbaarheid % wordt berekend met `Math.floor` — 100% alleen bij letterlijk nul stilstand

Het dashboard toont beschikbaarheids-bars per machine, een gecombineerde downtime-tabel en een spindeluren lijndiagram. Aggregatie is per dag (≤14 dagen) of per ISO-week (langere perioden).

Het dashboard is beschikbaar in zowel de kiosk als het admin-panel via een gedeeld React-component.

---

### Mijn Taken & Mijn Meldingen

**Waarvoor:** elke operator ziet zijn eigen taken en meldingen direct na inloggen, zonder door het hele systeem te zoeken.

- *Mijn Taken* — persoonlijk takoverzicht, aangemaakt en toegewezen via het takenbeheer
- *Mijn Meldingen* — openstaande NCR-acties en kalibratiemeldingen die aan de ingelogde medewerker zijn gekoppeld

---

### Admin — Medewerkers & Machines

**Medewerkers:**  
CRUD met PIN-beheer, roltoewijzing (operator / kwaliteit / admin), profielfoto en e-mail voor reminders. BC-synchronisatie haalt namen en functies automatisch op uit Business Central.

**Machines:**  
CRUD met categorie (Freesmachine, Meetapparaat, 3D-meetapparaat, etc.), CNC IP-adres, controller-type, TOOL.T formaat en postprocessor. Per machine is een downtime-tab en programma-runs tab beschikbaar.

---

### BC Configuratie & Veldmapping

**Waarvoor:** de koppeling met Business Central instellen en beheren.

**Hoe het werkt:**  
OAuth2 client credentials flow via Microsoft MSAL. Het client secret wordt versleuteld opgeslagen (AES-256-GCM) — nooit plain-text in de database. De verbinding is testbaar via een knop in de admin UI.

De veldmapping detecteert automatisch welke BC-velden beschikbaar zijn en laat de beheerder configureren welk veld de medewerkersnaam en functie bevat. Dit is nodig omdat BC-installaties per klant kunnen verschillen.

---

### Email / SMTP

**Waarvoor:** automatische reminder-e-mails sturen naar medewerkers met openstaande acties.

**Hoe het werkt:**  
SMTP-configuratie is volledig via de admin UI instelbaar (geen .env aanpassing nodig). Per categorie is een reminder-interval instelbaar: taken, NCR, onderhoud, kalibratie en kwaliteit kunnen elk een eigen frequentie hebben. De dagelijkse cron draait om 07:30 op werkdagen en stuurt PDF bijlagen mee waar relevant.

---

## CNC Agent — hoe het werkt

De CNC Agent is een lichte Node.js applicatie die op één Windows PC in het netwerk draait. Hij doet twee dingen tegelijkertijd:

**TOOL.T synchronisatie (elke 30 minuten):**  
Verbindt via TNCcmd.exe met elke CNC-machine, haalt het TOOL.T bestand op en stuurt het naar het MES. Het MES parseert het bestand en werkt het toolmagazijn bij via upserts (veilig bij duplicaat-uitvoering).

**State polling (elke 10 seconden):**  
Verbindt via LSV2 met elke machine en leest de programmastatus (R_RI parameter 26: STARTED/FINISHED/STOPPED/INTERRUPTED/ERROR/IDLE) en de geselecteerde programmanaam. Bij statuswijzigingen worden events gepost naar het MES backend. Dit gebeurt zonder DNC-licentie — LSV2 is het ingebouwde leesprotocol van Heidenhain-controllers.

**Exponential backoff:**  
Als een machine offline is, verlengt de agent automatisch het poll-interval (10s → 20s → 40s → … → max 5 min). Bij reconnect reset het interval direct naar 10 seconden. Dit voorkomt onnodige netwerklast bij uitgeschakelde machines.

**Redundantie:**  
Meerdere agents op verschillende Windows PCs kunnen tegelijk draaien. De backend verwerkt syncs via upserts, dus dubbel uitvoeren is altijd veilig.

---

## Belangrijke ontwerpkeuzes

**On-premise, geen cloud**  
Data blijft lokaal op de server van Dutch Shape. Geen abonnementskosten, geen afhankelijkheid van externe diensten, volledige controle over backups en toegang.

**BC via polling, niet via webhooks**  
BC Online ondersteunt webhooks, maar dat vereist een publiek bereikbaar endpoint. Met polling elke 5 minuten is de verversing snel genoeg voor productiegebruik en is er geen infrastructuurwijziging nodig. Webhooks zijn gepland als toekomstige optimalisatie.

**Touch-first kiosk**  
Operators werken met handschoenen op een tablet of industrieel touchscherm. Minimale touch-target is 44px hoogte. Weinig tekst, grote knoppen, directe navigatie. De interface werkt zonder muis.

**Handmatige database-migraties**  
Drizzle ORM genereert geen migraties automatisch. Elke schemawijziging is een handgeschreven SQL-bestand met een oplopend nummer. Dit geeft volledige controle over wat er in productie wordt uitgevoerd en voorkomt verrassingen bij auto-gegenereerde migraties op een live database.

**Event-stream derivatie voor downtime**  
Stilstandsperioden worden niet opgeslagen in een aparte tabel maar on-the-fly berekend uit de event-stroom in `cnc_machine_events`. Voordeel: de brondata is altijd correct en herberekenable; nadeel: iets langzamer bij grote datasets. Voor de schaal van Dutch Shape is dit geen issue.

**Enkelstuks productie — geen traditionele SPC**  
Standaard kwaliteitsstatistieken (Cp/Cpk) vereisen een steekproef van tientallen identieke onderdelen. Dutch Shape maakt elk onderdeel één keer. De metrologie-module is daarom gebouwd op cross-project analyse: patronen worden zichtbaar over tientallen verschillende projecten heen, op dezelfde machine, met dezelfde feature-types.

---

## Deployment

| Omgeving | Commando | Poort |
|----------|----------|-------|
| Development | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` | 5173 (Vite) + 3000 (backend) |
| Testserver (laptop) | `testserver.bat` | 8080 |
| Productie | `./install.sh` → `docker compose up -d --build` | 8080 |
| Update | `./update.sh` (maakt automatisch backup) | — |

---

## Tijdsinvestering

| Module | Periode | Uren (ca.) |
|--------|---------|------------|
| v1.0 Fundament + Beheer (Fase 1–6.1) | feb–mrt 2026 | ~55 uur |
| NCR, Preventieve Maatr., Klantmeldingen | mrt–apr 2026 | ~16 uur |
| CNC Machining — Tool tabel + samenstellingen | apr 2026 | ~18 uur |
| Product Setup (volledig) | apr 2026 | ~21 uur |
| NCR Human Factor, Meetmiddelen, Meet Setup | mei 2026 | ~10 uur |
| CNC Agent + Machine Dashboard | mei 2026 | ~8 uur |
| Metrologie Inspectieviewer Phase 1–3 | mei–jun 2026 | ~20 uur |
| **Totaal** | **feb–jun 2026** | **~148 uur** |
