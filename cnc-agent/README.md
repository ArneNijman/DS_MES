# CNC Agent — Dutch Shape MES

> **Dit is de enige component die op de Windows PC geïnstalleerd wordt.**
> De volledige MES-server (frontend, backend, database) draait op een aparte Linux server via Docker.
> `install.sh` en Docker zijn uitsluitend bedoeld voor de Linux server — voer die **niet** uit op Windows.
>
> **Wat u op de Windows PC doet — in drie stappen:**
>
> 1. **Node.js installeren** — download en installeer Node.js 22 LTS via [nodejs.org](https://nodejs.org)
> 2. **Map neerzetten** — zet de map `cnc-agent\` op de Windows PC via één van deze methodes:
>    - *Optie A (aanbevolen):* installeer [Git voor Windows](https://git-scm.com/download/win) en voer uit: `git clone https://github.com/ArneNijman/DS_MES.git C:\DS_MES` — de agent staat dan op `C:\DS_MES\cnc-agent\`
>    - *Optie B:* download de repo als ZIP via GitHub (knop **Code → Download ZIP**), pak uit en kopieer alleen de map `cnc-agent\` naar bijv. `C:\DS_MES\cnc-agent\`
> 3. **Configureren** — maak een kopie van `.env.example`, noem die `.env`, en vul in:
>    ```
>    BACKEND_URL=http://<ip-van-de-linux-server>:8080
>    ADMIN_USERNAME=admin
>    ADMIN_PASSWORD="wachtwoord-uit-install.sh"
>    TNCCMD_PATH=C:\Program Files (x86)\HEIDENHAIN\TNCremo\TNCcmd.exe
>    ```
>
> Daarna dubbelklikken op `run.bat` om te testen, en `install-scheduler.ps1` uitvoeren (als Administrator) om de agent automatisch te laten starten bij Windows-opstart. Zie [Eerste installatie](#eerste-installatie) voor de volledige uitleg.

Haalt automatisch TOOL.T bestanden op van Heidenhain CNC-machines via TNCcmd.exe
en stuurt ze naar de MES backend. Detecteert ook wijzigingen in de WinTool database
en synchroniseert deze automatisch. Biedt een HTTP server zodat de Sync-knop
in de MES kiosk een directe sync kan triggeren.

Bewaakt daarnaast continu de machinestatus via LSV2 R_RI (programmanaam, programmastatus,
alarm) en TCP ping (online/offline). Op machines zonder LSV2 R_RI ondersteuning (bijv. oudere
Heidenhain TNC426/430M) is het TNCremo logboek beschikbaar als alternatief.
Events worden opgeslagen als CNC Events en omgezet naar automatische stilstandsperioden
en programma-runs in het Machine Dashboard.

---

## Inhoudsopgave

1. [Vereisten](#vereisten)
2. [Eerste installatie](#eerste-installatie)
3. [Automatisch starten bij Windows-login](#automatisch-starten-bij-windows-login)
4. [Handmatig starten](#handmatig-starten)
5. [Sync-knop in de kiosk](#sync-knop-in-de-kiosk)
6. [WinTool synchronisatie](#wintool-synchronisatie)
7. [CNC Events & machinestatus](#cnc-events--machinestatus)
8. [TNCremo logboek monitoring](#tncremo-logboek-monitoring)
9. [HyperMill bestanden openen vanuit het MES](#hypermill-bestanden-openen-vanuit-het-mes)
10. [Hoe werkt de sync?](#hoe-werkt-de-sync)
11. [Probleemoplossing](#probleemoplossing)

---

## Vereisten

De agent draait op **één of meerdere Windows machines** in het netwerk — een vaste PC, Windows server of Windows VM.
Deze machine hoeft **niet** dezelfde te zijn als de server waarop de MES backend draait (die draait op Linux/Docker).

> **Meerdere agents (optioneel — voor redundantie):**
> Je kunt de agent op meerdere Windows machines installeren. Als één machine uitvalt, neemt een andere het over.
> Geef alle agents dezelfde `.env` (zelfde `WINTOOL_DB_PATH`, zelfde `BACKEND_URL`).
> Stel op de MES-server de `CNC_AGENT_URL` in als komma-gescheiden lijst:
> ```
> CNC_AGENT_URL=http://pc1:3099,http://pc2:3099
> ```
> De backend probeert de agents op volgorde — de eerste die reageert wordt gebruikt.
> Draaien meerdere agents tegelijk? Dat is veilig: TOOL.T en WinTool syncs zijn idempotent (upsert).

**De Windows machine moet voldoen aan:**

| Vereiste | Toelichting |
|----------|-------------|
| Windows 10/11 of Windows Server | TNCcmd.exe en de Taakplanner werken alleen op Windows |
| Node.js 22 of hoger | Controleer met `node --version` — [nodejs.org](https://nodejs.org) |
| HEIDENHAIN TNCremo geïnstalleerd | Bevat `TNCcmd.exe` — nodig voor communicatie met Heidenhain-machines |
| Netwerktoegang tot de CNC-machines | Zelfde subnet of routing naar de machines (ping moet werken) |
| Netwerktoegang tot de MES-server | Voor `BACKEND_URL` in `.env` — bv. `http://192.168.1.10:8080` |
| Toegang tot de WinTool netwerkschijf | Bv. `R:\` gemount als de WinTool database op een fileserver staat |
| Altijd ingeschakeld | Agent moet draaien voor automatische sync en de knoppen in de kiosk |

**CNC-machines met een IP-adres ingesteld in het MES** (Admin > Machines) zijn vereist voor de TOOL.T sync.

---

## Eerste installatie

### Stap 1 — .env aanmaken

Maak een kopie van `.env.example` en noem het `.env`:

```
Kopieer .env.example → .env
```

Open `.env` in Kladblok en vul de gegevens in:

```
BACKEND_URL=http://<server-ip>:8080     ← IP-adres van de MES-server (zie install.sh output)
ADMIN_USERNAME=admin
ADMIN_PASSWORD="jouw_wachtwoord"        ← wachtwoord uit de install.sh output; quotes verplicht als het een # bevat

TNCCMD_PATH=C:\Program Files (x86)\HEIDENHAIN\TNCremo\TNCcmd.exe
TNCCMD_TIMEOUT_MS=30000                 ← max wachttijd per machine (milliseconden)

SYNC_INTERVAL_MIN=30                    ← automatische sync elke 30 minuten
AGENT_PORT=3099                         ← HTTP poort voor de Sync-knop in de kiosk

WINTOOL_DB_PATH=R:\Arne\tooldatabase\Dutch-Shape_2025.db   ← pad naar WinTool .db bestand (optioneel)

CNC_STATE_POLL_ENABLED=true           ← continu machinestatus bewaken (Freesmachines)
CNC_STATE_POLL_INTERVAL_MS=10000      ← polling interval in ms (standaard 10 seconden)
```

Het server-IP en het admin-wachtwoord zijn getoond aan het einde van het `install.sh` script op de server.

> **Belangrijk — BACKEND_URL:** De agent verbindt altijd **vanuit de Windows machine naar de MES-server**.
> De MES-server hoeft de agent niet te kunnen bereiken, alleen andersom.
> Zolang de Windows machine het opgegeven adres kan bereiken, werkt de agent ongeacht waar hij draait.
>
> | Situatie | BACKEND_URL |
> |----------|-------------|
> | Dev (lokaal op laptop) | `http://localhost:3000` |
> | Testserver / productie | `http://192.168.1.x:8080` |
> | Windows VM op zelfde server | `http://host-ip:8080` |

### Stap 2 — Testen of de agent werkt

Open een Command Prompt in deze map en voer uit:

```
node --env-file=.env cnc-agent.js --once
```

Je ziet dan zoiets als:

```
🔄  Sync gestart: 21-4-2026, 08:25:00

🗄️   WinTool:
   📤  WinTool gewijzigd — uploaden naar backend…
   ✅  WinTool gesynchroniseerd: 284 items, 96 samenstellingen

📋  5 machine(s) gevonden, 5 met IP-adres

🔌  BF 3200  (192.168.1.201)
   📥  TNCcmd: -i 192.168.1.201 "GET TOOL.T ..."
   ✅  55 tools geladen voor BF 3200

🔌  FPT Ronin  (192.168.1.205)
   ✅  112 tools geladen voor FPT Ronin

📊  Klaar: 5 geslaagd, 0 offline, 0 fout(en)
```

Als `WINTOOL_DB_PATH` niet is ingesteld wordt de WinTool-regel niet getoond.

Als alles werkt, ga dan door naar stap 3.

### Stap 3 — Taakplanner installeren (eenmalig, als Administrator)

Zodat de agent automatisch start bij Windows-opstart en bij inloggen:

1. Open **PowerShell als administrator**
   (Startmenu → zoek "PowerShell" → rechtsklik → "Als administrator uitvoeren")
2. Navigeer naar de cnc-agent map:
   ```
   cd "C:\pad\naar\DS_MES\cnc-agent"
   ```
3. Voer het installatiescript uit:
   ```
   powershell -ExecutionPolicy Bypass -File install-scheduler.ps1
   ```
4. Je ziet de bevestiging:
   ```
   Taak 'DutchShape-CNC-Agent' geinstalleerd - start bij inloggen, draait continu
   ```
5. Herstart de PC — de agent start nu automatisch op de achtergrond

De taak is te beheren via **Taakplanner > Taakplanner-bibliotheek > DutchShape-CNC-Agent**.

---

## Automatisch starten bij Windows-opstart

Na de taakplanner-installatie (stap 3 hierboven) gebeurt het volgende bij elke opstart én bij inloggen:

- Agent start automatisch op de achtergrond
- Direct een eerste sync van alle CNC-machines
- Daarna elke 30 minuten automatisch opnieuw
- HTTP server op poort 3099 blijft actief voor de Sync-knop

De agent draait ook na een onbeheerde herstart (bijv. na stroomstoring) zonder dat iemand hoeft in te loggen. Je hoeft verder niets te doen.

---

## Handmatig starten

Als de taakplanner niet geïnstalleerd is, kun je de agent handmatig starten.

### Continue modus (aanbevolen — voor de Sync-knop)

Open een Command Prompt in deze map:

```
node --env-file=.env cnc-agent.js
```

- Agent blijft draaien zolang het venster open is
- Synct elke 30 minuten automatisch
- HTTP server op poort 3099 actief → Sync-knop in de kiosk werkt

### Eenmalige sync

Dubbelklik op `run.bat`, of via Command Prompt:

```
node --env-file=.env cnc-agent.js --once
```

- Synct één keer alle machines
- Sluit daarna af
- HTTP server start **niet** → Sync-knop in de kiosk werkt **niet**

---

## Sync-knop in de kiosk

De MES kiosk heeft een **Sync-knop** op de CNC Machining pagina.

**Wat gebeurt er als je op Sync drukt:**

1. Kiosk stuurt een verzoek naar de MES backend
2. Backend stuurt een verzoek naar de agent op poort 3099
3. Agent start direct een sync van alle CNC-machines via TNCcmd
4. Kiosk vernieuwt automatisch de data elke 4 seconden (maximaal 20 seconden)
5. Zodra de nieuwe data binnenkomt, verschijnt de bijgewerkte timestamp

**Doorlooptijd:** 5–30 seconden afhankelijk van het aantal machines en de netwerksnelheid.

**Vereiste:** de agent moet draaien in continue modus. Als de agent niet draait
verschijnt de melding _"CNC agent niet bereikbaar"_.

---

## WinTool synchronisatie

Als `WINTOOL_DB_PATH` is ingesteld in `.env`, synchroniseert de agent automatisch de WinTool toolbibliotheek met het MES.

Het pad wordt **alleen in `.env` van de agent** ingesteld — er is geen instelling nodig in de MES admin UI.

**Hoe het werkt:**

- Bij elke sync-ronde vergelijkt de agent de wijzigingsdatum (`mtime`) van het `.db` bestand met de vorige sync
- Alleen als het bestand gewijzigd is wordt het geüpload naar de MES backend
- De backend importeert de tools, samenstellingen en componenten rechtstreeks uit het bestand
- Werkt direct via `R:\`, `\\server\share\` of elk ander Windows-pad — geen kopie nodig

**Handmatige WinTool sync forceren:**

Via de knop **"Herlaad bibliotheek"** in het MES (Admin → CNC Machining), of direct op de Windows machine via de command line (poort 3099 = de agent-poort, ingesteld via `AGENT_PORT` in `.env`):

```
curl -X POST http://localhost:3099/sync-wintool
```

Bij een geforceerde sync wordt het bestand altijd geüpload, ook als het niet gewijzigd is.

---

## CNC Events & machinestatus

Naast de periodieke TOOL.T sync bewaakt de agent **continu** de machinestatus via LSV2 (lees-protocol van Heidenhain, ingebouwd in TNCremo — geen extra software nodig).

### Wat wordt bewaakt

Elke `CNC_STATE_POLL_INTERVAL_MS` milliseconden (standaard 10 seconden) leest de agent per Freesmachine via LSV2 R_RI:

| Signaal | LSV2 bron | CNC Event |
|---------|-----------|-----------|
| Machine niet bereikbaar | TCP verbinding mislukt | `MACHINE_OFFLINE` |
| Machine weer bereikbaar | TCP verbinding geslaagd | `MACHINE_ONLINE` |
| Programma gestart | R_RI PGM_STATE: IDLE→STARTED | `PROGRAM_STARTED` (incl. programmanaam) |
| Programma afgerond | R_RI PGM_STATE: STARTED→FINISHED | `PROGRAM_STOPPED` (status: completed) |
| Programma handmatig gestopt | R_RI PGM_STATE: STARTED→STOPPED | `PROGRAM_STOPPED` (status: stopped) |
| Programma onderbroken | R_RI PGM_STATE: STARTED→INTERRUPTED | `PROGRAM_STOPPED` (status: interrupted) |
| Alarm actief | R_RI PGM_STATE: →ERROR | `ALARM_TRIGGERED` |
| Alarm gewist | R_RI PGM_STATE: ERROR→overig | `ALARM_CLEARED` |

Op machines die R_RI niet ondersteunen (bijv. TNC426/430M) detecteert de agent alleen online/offline via TCP ping. Gebruik het TNCremo logboek als aanvulling.

### Programma-runs

Bij elke PROGRAM_STARTED maakt de agent een run-record aan (`cnc_program_runs`) met programmanaam en starttijd. Bij PROGRAM_STOPPED wordt de run afgesloten met eindtijd, duur en de juiste status (afgerond/gestopt/onderbroken/fout).

Programmanamen worden gelezen via R_RI SELECTED_PGM (parameter 24) — typisch `TNC:\Program\<artikel>\<bewerking>\<bestand>.H`.

### Automatische stilstandsdetectie

De MES backend berekent op basis van deze events automatisch stilstandsperioden:

| Type | Kleur | Detectie | Min. duur |
|------|-------|---------|-----------|
| **Offline** | Grijs | MACHINE_OFFLINE → MACHINE_ONLINE | ≥ 5 minuten |
| **Alarmstilstand** | Rood | ALARM_TRIGGERED → ALARM_CLEARED | — |
| **Stilstand** | Amber | PROGRAM_STOPPED → PROGRAM_STARTED (machine online) | ≥ 10 minuten |

Korte offline-perioden (< 5 min) worden genegeerd als monitoring-ruis (bijv. agent-herstart).

Deze perioden zijn zichtbaar in:
- **Machine Detail** (Admin > Machines > Downtime tab) — historisch per machine
- **Machine Dashboard** (Admin > Machine Dashboard, kiosk) — beschikbaarheid % per Freesmachine

### Spindeluren

Spindeluren worden bijgehouden door de looptijd van programma-runs op te tellen (geen DNC-licentie nodig). Bij elke PROGRAM_STOPPED wordt de verstreken tijd opgeteld bij het cumulatieve totaal en opgeslagen via `POST /admin/machines/:id/cnc-metrics`.

### Backoff voor offline machines

Als een machine niet reageert, verdubbelt de agent het polling-interval per poging (10s → 20s → 40s → … → max 5 minuten). Zodra de machine weer reageert, reset het interval terug naar 10 seconden.

### Configuratie

In `.env`:

```
CNC_STATE_POLL_ENABLED=true           ← zet op false om state polling uit te schakelen
CNC_STATE_POLL_INTERVAL_MS=10000      ← polling interval in milliseconden (standaard 10s)
```

State polling werkt alleen voor machines met categorie **Freesmachine** en een geldig IP-adres in het MES.

---

## TNCremo logboek monitoring

Als TNCremo op dezelfde Windows PC draait als de agent, kan de agent het TNCremo-logboek uitlezen om alarm- en programma-events te extraheren. Dit werkt zonder DNC-licentie en geeft rijkere data dan de TCP-ping alleen.

### Wat wordt gelezen

TNCremo schrijft events naar `%TEMP%\TNCremo\Logbook\`. De agent leest dit bestand elke 60 seconden en verwerkt alleen nieuw toegevoegde regels (via byte-positie tracking — het bestand wordt niet verwijderd of aangepast).

| Logboek-entry | CNC Event |
|--------------|-----------|
| `Stib: ON` + `Info: MAIN PGM` | `PROGRAM_STARTED` (met programmanaam) |
| `Info: MAIN PGMEND` + Stop reason | `PROGRAM_STOPPED` (met reden) |
| `Error:` (niet gefilterd) | `ALARM_TRIGGERED` |
| `Info: MAIN ERRCLEARED` | `ALARM_CLEARED` |
| `Reset` | `MACHINE_OFFLINE` |
| `Info: MAIN START` | `MACHINE_ONLINE` |
| `Info: CTRL REG` + EMERGENCY STOP | `ALARM_TRIGGERED` |

**Gefilterde alarm-codes** (geen productiestoring):
- `N938` — Toets zonder functie (toetsdruk in verkeerde modus)
- `P99` — Melding in PLC venster (periodiek PLC-statusbericht op Fooke-machines)

Daarnaast worden identieke alarmen van dezelfde machine binnen 5 minuten automatisch gededupliceerd.

### Machine-identificatie

TNCremo logt `Info: REMO A_LG` bij elke verbinding met een machine, inclusief het IP-adres (`Addr:0xC0A801B3` → `192.168.1.179`). De agent koppelt alle opvolgende events aan die machine op basis van dit IP-adres.

### Configuratie

In `.env`:

```
TNCREMO_LOGBOOK_ENABLED=true
TNCREMO_LOGBOOK_PATH=C:\Users\ArneNijman\AppData\Local\Temp\TNCremo\Logbook
TNCREMO_POLL_INTERVAL_MS=60000
```

> **Opmerking:** het logboekpad verschilt per Windows-gebruiker. Als de agent onder een ander account draait, pas het pad aan. Standaard wordt `%TEMP%\TNCremo\Logbook` gebruikt.

---

## HyperMill bestanden openen vanuit het MES

In het MES kun je per product setup een HyperMill bestand koppelen (netwerkpad naar een `.hmc` of `.hmr` bestand).
Klikken op het pijltje-icoon opent het bestand **direct in HyperMill op jouw eigen PC** — zonder downloaden, zonder kopiëren.

Dit werkt via een Windows custom URL-protocol (`hmopen://`). De installatie is éénmalig per PC en vereist **geen beheerdersrechten**.

### Éénmalige installatie per PC

1. Open de gedeelde map van het MES-project
2. Dubbelklik op **`tools\hypermill-protocol-install.reg`**
3. Klik **Ja** bij de Windows-bevestiging
4. Klaar — het protocol is geregistreerd

> De `.reg` schrijft uitsluitend naar `HKEY_CURRENT_USER\Software\Classes\hmopen` — alleen voor de huidige gebruiker, geen systeembrede wijzigingen, geen beheerdersrechten nodig.

### Hoe het werkt

Wanneer je op een HyperMill-link klikt in het MES:

1. De browser ziet een `hmopen://` link en vraagt Windows om het bijbehorende programma
2. Windows zoekt in de registry: `HKCU\Software\Classes\hmopen\shell\open\command`
3. Windows voert het geregistreerde commando uit:
   ```
   powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command
     "$p = [Uri]::UnescapeDataString($args[0] -replace '^hmopen://', '') -replace '/', '\\'; Start-Process $p"
   ```
4. PowerShell decodeert het netwerkpad (bijv. `\\server\share\project\bestand.hmc`)
5. Windows opent het bestand met het gekoppelde programma — HyperMill

### Vereisten

| Vereiste | Toelichting |
|----------|-------------|
| HyperMill geïnstalleerd op de PC | De `.hmc`/`.hmr` bestandsextensie moet gekoppeld zijn aan HyperMill — dit doet de HyperMill-installatie automatisch |
| Netwerkpad bereikbaar | De PC moet het opgegeven UNC-pad kunnen bereiken (bijv. `\\server\share\...`) |
| `.reg` geïnstalleerd | Éénmalig per Windows-gebruikersaccount op die PC |

### Bestand koppelen in het MES

1. Open een product setup in het MES
2. Klik op **HyperMill** (naast de andere documenttypes)
3. Voer het volledige netwerkpad in, bijv.: `\\server\CAM\projecten\onderdeel.hmc`
4. Opslaan — het pijltje-icoon verschijnt
5. Klikken op het icoon opent het bestand direct in HyperMill

> **Let op:** het pad wordt opgeslagen zoals ingevoerd. Gebruik altijd UNC-paden (`\\server\share\...`) zodat het pad werkt vanaf elke PC in het netwerk.

---

## Hoe werkt de sync?

Voor elke CNC-machine die een IP-adres heeft in het MES:

1. Agent vraagt de machinelijst op bij de MES backend
2. Per machine roept de agent TNCcmd.exe aan:
   ```
   TNCcmd.exe -i <ip-adres> "GET TOOL.T C:\Temp\TOOL_<id>.T"
   ```
3. Het TOOL.T bestand wordt uitgelezen en geparseerd
4. De tools worden geüpload naar de MES backend
5. Het tijdelijke bestand wordt verwijderd
6. De MES backend slaat de tools op in de database en logt de sync

Machines die niet bereikbaar zijn (offline of verkeerd IP) worden overgeslagen.
De overige machines worden gewoon gesynchroniseerd.

---

## Probleemoplossing

| Fout | Oorzaak | Oplossing |
|------|---------|-----------|
| `TNCcmd.exe niet gevonden` | Verkeerd pad | Controleer `TNCCMD_PATH` in `.env` |
| `Inloggen mislukt` | Verkeerde inloggegevens | Controleer `ADMIN_USERNAME` en `ADMIN_PASSWORD`. Wachtwoorden met `#` moeten tussen dubbele aanhalingstekens staan: `"wacht#woord"` |
| `EADDRINUSE: port 3099` | Agent draait al | Er is al een instantie actief. Sluit die eerst, of wijzig `AGENT_PORT` in `.env` |
| `CNC agent niet bereikbaar` | Agent draait niet | Start de agent in continue modus: `node --env-file=.env cnc-agent.js` |
| Machine niet in dropdown | Geen IP ingesteld | Voeg een IP-adres toe via Admin > Machines in het MES |
| Machine offline | Netwerk/machine uit | Controleer of de machine aan staat en bereikbaar is op het netwerk |
| `WinTool bestand niet gevonden` | Verkeerd pad of share niet gemount | Controleer `WINTOOL_DB_PATH` in `.env`; zorg dat de netwerkschijf gemount is |
| `WinTool ongewijzigd` | Bestand niet aangepast | Normaal gedrag — agent slaat sync over. Gebruik `/sync-wintool` om te forceren |
| Geen CNC Events in dashboard | State polling uitgeschakeld of geen Freesmachines | Controleer `CNC_STATE_POLL_ENABLED=true` in `.env`; zorg dat machines categorie "Freesmachine" hebben |
| Machine toont altijd "offline" | IP-adres fout of machine niet bereikbaar | Ping het IP-adres van de machine vanuit de Windows PC |
| Spindeluren worden niet bijgewerkt | Geen DNC-licentie (optie #18) | Normaal gedrag op iTNC 530 zonder licentie; spindeluren handmatig in te stellen in het MES |
| Logboek events worden niet verwerkt | Logboek monitoring uitgeschakeld of verkeerd pad | Controleer `TNCREMO_LOGBOOK_ENABLED=true` en `TNCREMO_LOGBOOK_PATH` in `.env`; zorg dat TNCremo op dezelfde PC draait |
| Machine IP niet gevonden in logboek | REMO A_LG entry ontbreekt | Open TNCremo en maak verbinding met de machine — TNCremo logt het IP bij de eerste verbinding |
