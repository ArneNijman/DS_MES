# Factory Assistant — MES

**Manufacturing Execution System voor Dutch Shape**

Een event-driven MES dat als operationele intelligentielaag bovenop Microsoft Business Central (BC Online/SaaS) functioneert.

---

## Architectuur — twee onderdelen

De installatie bestaat uit twee onderdelen die op **aparte machines** draaien:

```
  CNC-machines (Heidenhain)              Windows PC (ergens in het netwerk)
  ┌─────────────┐                        ┌──────────────────────────────────┐
  │ BF 3200     │◄── TNCcmd (TOOL.T) ───│  cnc-agent/                      │
  │ FPT Ronin   │◄── LSV2  (status)  ───│  • haalt TOOL.T op per machine   │
  │ ...         │       read-only        │  • leest machinestatus (LSV2)    │
  └─────────────┘                        │  • leest spindeluren (LSV2)      │
                                         │  • synchroniseert WinTool (.db)  │
                                         │  • stuurt data naar MES backend  │
                                         └────────────────┬─────────────────┘
                                                          │ HTTP naar poort 8080
                                                          ▼
                                         ┌──────────────────────────────────┐
                                         │  Linux server (Ubuntu/Debian)    │
                                         │                                  │
                                         │  Docker Compose:                 │
                                         │  • Frontend  (React + Nginx)     │
                                         │  • Backend   (Fastify + Node)    │
                                         │  • PostgreSQL 16                 │
                                         │  • Redis 7                       │
                                         └──────────────────────────────────┘
```

**Hoe het werkt:**
- De CNC agent draait op **één Windows PC** — dit hoeft niet de server te zijn en ook niet de pc naast de machine. Elke Windows PC met netwerktoegang tot de CNC-machines en de MES-server volstaat.
- De agent verbindt **altijd vanuit Windows naar de machines en de server** — de server hoeft de Windows PC niet te kunnen bereiken.
- De CNC-machines zelf krijgen geen software geïnstalleerd.
- **Redundantie:** de agent kan op meerdere Windows PCs tegelijk draaien. Als één PC uitvalt, neemt een andere het automatisch over. De backend probeert de agents op volgorde; syncs zijn altijd veilig omdat alles via upserts werkt. Zie [`cnc-agent\README.md`](cnc-agent/README.md) voor de configuratie.

> De bestanden in `cnc-agent/` zijn **uitsluitend voor de Windows PC**. Op de Linux server draait alleen Docker.

---

## Installatie — Linux server

### Wat je nodig hebt

- Ubuntu 22.04 / Debian 12 (of nieuwer)
- Docker Engine 24+ en Docker Compose v2
- Git
- Poort 8080 open in de firewall

---

### Stap 1 — Linux server bijwerken

```bash
sudo apt update && sudo apt upgrade -y
```

---

### Stap 2 — Docker installeren

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Log nu uit en weer in** zodat de Docker-rechten actief worden. Controleer daarna:

```bash
docker --version          # bijv. Docker version 26.0.0
docker compose version    # bijv. Docker Compose version v2.x
```

---

### Stap 3 — Git installeren en poort openen

```bash
sudo apt install git -y
sudo ufw allow 8080/tcp
```

---

### Stap 4 — Repo ophalen en installeren

```bash
git clone https://github.com/ArneNijman/DS_MES.git
cd DS_MES
chmod +x install.sh
./install.sh
```

Het script begeleidt je door de rest:
- Secrets worden automatisch gegenereerd
- Docker images bouwen en starten
- Admin-inloggegevens worden aan het einde getoond

**Sla het getoonde wachtwoord op — het wordt niet opnieuw getoond.**

---

### Updates uitrollen

```bash
cd DS_MES
./update.sh
```

Data (database, uploads) blijft altijd behouden.

---

### Back-up maken

```bash
./backup.sh
```

Slaat de database en uploads op in `backups/` op de server. Er worden altijd minimaal 5 backups bewaard; als er meer dan 5 zijn wordt de oudste automatisch verwijderd. Terugzetten:

```bash
gunzip -c backups/db_<datum>.sql.gz | docker compose exec -T postgres psql -U mes mes
```

Automatische wekelijkse back-up via cron (optioneel, elke zondag om 02:00):
```bash
crontab -e
# Voeg toe:
0 2 * * 0 cd /pad/naar/DS_MES && ./backup.sh >> backups/backup.log 2>&1
```

`update.sh` maakt automatisch een back-up vóórdat de update wordt uitgevoerd.

---

## CNC Agent instellen — Windows PC

> **Belangrijk — dit is een aparte, lichte installatie op de Windows PC.**
> Op de Windows machine installeert u **uitsluitend de CNC agent** — u voert `install.sh` daar **niet** uit.
> Geen Docker, geen database, geen Linux. Alleen Node.js + de map `cnc-agent\` uit de repo.
> De volledige MES-server (Docker Compose) draait alleen op de Linux server.

De CNC agent draait op **één Windows PC** in het netwerk — niet op elke CNC-machine afzonderlijk. Die PC hoeft alleen **netwerkbereik** te hebben naar de CNC-machines (ping werkt) en naar de MES-server (poort 8080). De agent doet twee dingen:

- **TOOL.T sync** — haalt gereedschapstabellen op via TNCcmd.exe en stuurt ze naar het MES (elke 30 min)
- **State polling** — bewaakt continu de machinestatus via LSV2 (elke 10 seconden): programmastart/-stop, alarmen, online/offline → CNC Events → automatische stilstandsdetectie in het Machine Dashboard

**Stap 1** — Installeer Node.js 22 LTS via [nodejs.org](https://nodejs.org)

**Stap 2** — Zet de agent-map op de Windows PC:
Kies één van de twee methodes:

*Optie A — repo clonen op de Windows PC (aanbevolen):*
Installeer [Git voor Windows](https://git-scm.com/download/win) en voer uit in Command Prompt:
```
git clone https://github.com/ArneNijman/DS_MES.git C:\DS_MES
```
De cnc-agent map staat dan op `C:\DS_MES\cnc-agent\`.

*Optie B — alleen de map kopiëren:*
Download de repo als ZIP via GitHub (knop **Code → Download ZIP**), pak het archief uit en kopieer alleen de map `cnc-agent\` naar de Windows PC, bijvoorbeeld naar `C:\DS_MES\cnc-agent\`.

**Stap 3** — Maak het configuratiebestand aan:
Ga naar de gekopieerde map (`C:\DS_MES\cnc-agent\`) en maak een kopie van `.env.example`:
```
.env.example  →  .env
```
Open `.env` in Kladblok en vul in:
```
BACKEND_URL=http://<server-ip>:8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<wachtwoord uit de installatie>
TNCCMD_PATH=C:\Program Files (x86)\HEIDENHAIN\TNCremo\TNCcmd.exe
```

**Stap 3b** — WinTool koppelen *(optioneel)*:
Vul ook `WINTOOL_DB_PATH=` in met het volledige pad naar het `.db` bestand op deze Windows PC, bijvoorbeeld:
```
WINTOOL_DB_PATH=R:\Tooldatabase\Dutch-Shape_2025.db
```

**Stap 4** — Test de verbinding:
Dubbelklik `run.bat` in de cnc-agent map.
Het venster toont de sync-voortgang per machine en sluit daarna af:
```
📋  5 machine(s) gevonden, 5 met IP-adres
✅  55 tools geladen voor BF 3200
📊  Klaar: 5 geslaagd, 0 offline, 0 fout(en)
```

**Stap 5** — Installeer als automatische achtergrondtaak:
Open PowerShell als administrator, navigeer naar de cnc-agent map en voer uit:
```
powershell -ExecutionPolicy Bypass -File install-scheduler.ps1
```

De agent draait nu automatisch op de achtergrond: synchroniseert bij elke Windows-opstart en elke 30 minuten daarna, en bewaakt continu de machinestatus.

> **Volg voor de volledige installatie van de CNC agent het stappenplan in [`cnc-agent\README.md`](cnc-agent/README.md#eerste-installatie).**
> Dat document bevat uitgebreide uitleg per stap, probleemoplossing, de werking van de Sync-knop in de kiosk en het instellen van meerdere agents voor redundantie.

---

## WinTool bibliotheek koppelen

De gereedschapsdatabase uit WinTool synchroniseert automatisch via de CNC agent.

**Instellen:** Vul `WINTOOL_DB_PATH=` in de cnc-agent `.env` in met het volledige pad naar het `.db` bestand op de Windows PC (zie stap 3b hierboven). De agent detecteert wijzigingen automatisch en uploadt naar het MES.

**Bibliotheek herladen:** Admin → CNC Machining → Bibliotheek → knop "Herlaad bibliotheek". Dit forceert een directe upload, ook als het bestand niet gewijzigd is.

---

## Eenmalige import — meetmiddelen vanuit FileMaker

Bij de eerste ingebruikname kunnen bestaande meetmiddelen uit FileMaker in één keer worden ingeladen via het script `scripts/import-meetmiddelen.js`. Het script leest een tab-gescheiden export uit FileMaker, maakt alle meetmiddelen aan via de API en koppelt de kalibratie-geschiedenis.

### Stap 1 — FileMaker export maken

Exporteer de meetmiddelen uit FileMaker als **tab-gescheiden tekstbestand** (`.tab`). Sla het op als:
```
C:\Users\<naam>\Documents\FIlemaker export\Kwaliteit\meetmiddel export.tab
```
(of een andere locatie — pas het pad aan in het script, zie stap 2)

### Stap 2 — Script configureren

Open `scripts/import-meetmiddelen.js` en pas de configuratie bovenin aan:

```js
const BACKEND_URL    = 'http://localhost:3000/api'   // dev, of http://<server-ip>:8080/api voor productie
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'jouw-wachtwoord'             // wachtwoord uit install.sh
const FILE_PATH      = 'C:\\pad\\naar\\meetmiddel export.tab'
```

### Stap 3 — Script uitvoeren

Zorg dat de MES-server draait, dan uitvoeren vanaf de repo-root:

```bash
node scripts/import-meetmiddelen.js
```

Het script geeft aan het einde een samenvatting:
```
✓ 321 meetmiddelen aangemaakt
✓ 612 kalibratie-records toegevoegd
✗ 2 overgeslagen (geen artikelnaam én geen afmeting, of fout)
```

> **Let op:** dit script is bedoeld als eenmalige migratie. Meerdere keren draaien maakt duplicaten aan — voer het alleen uit op een lege (of verse) database.

---

## Eenmalige import — NCR-registraties vanuit FileMaker

Bij de eerste ingebruikname kunnen bestaande NCR-records uit FileMaker in één keer worden ingeladen via het script `scripts/import-ncr.js`. Originele `Afwijking_ID` waarden (format `NCR_XXXXXX`) blijven behouden zodat het MES automatisch doorloopt met het eerstvolgende vrije nummer.

Het script is idempotent: meerdere keren uitvoeren is veilig. Elk record wordt bijgewerkt als het al bestaat (`ON CONFLICT DO UPDATE`).

### Stap 1 — FileMaker export maken

Exporteer de NCR-tabel uit FileMaker als **tab-gescheiden tekstbestand** (`.tab`), **zonder headerrij**.

De kolommen moeten in deze volgorde staan (exact, 18 kolommen):

| Kolom | FileMaker veldnaam | MES veld |
|-------|--------------------|----------|
| 0 | `Afwijking_ID` | `ncrId` (bijv. `NCR_100218`) |
| 1 | `ProductieOrder` | `productionOrder` |
| 2 | `ItemRef` | `itemRef` |
| 3 | `ItemNaam` | `itemName` |
| 4 | `AfwijkingOmschrijving` | `description` |
| 5 | `TypeFout` | `faultCode` |
| 6 | `VeroorzaaktDoor_ID` | `causingDepartment` |
| 7 | `AangemaaktDoor_ID` | `writtenByName` |
| 8 | `Status` | `status` |
| 9 | `Oplossing` | `solution` |
| 10 | `Dispositie` | `dispositionType` |
| 11 | `KorteOmschrijving` | `shortDescription` |
| 12 | `OorzaakCode` | `causeCode` |
| 13 | `Afdeling uitschrijver` | `writtenByDepartment` |
| 14 | `DatumAangemaakt` | `createdAt` (formaat `D-M-YYYY`) |
| 15 | `DatumUitgevoerd` | datum statuslog (formaat `D-M-YYYY`) |
| 16 | `MailPE` | `peEmail` |
| 17 | `UitgevoerdDoor` | `changedByName` in statuslog |

De `Status`-waarden worden automatisch genormaliseerd:

| FileMaker | MES |
|-----------|-----|
| `Open` of leeg | `open` |
| `In behandeling` | `in_behandeling` |
| `In uitvoering` | `in_uitvoering` |
| `Gereed` | `gereed` |
| `Gesloten` | `gesloten` |
| `Vervallen` | `vervallen` |

Voor afgesloten NCR's (`gesloten` of `vervallen`) met een `DatumUitgevoerd` maakt het script automatisch een statuslog-entry aan — inclusief de naam uit `UitgevoerdDoor` en de exacte afsluitdatum.

### Stap 2 — Script configureren

Open `scripts/import-ncr.js` en pas de drie regels bovenin aan:

```js
const BACKEND_URL    = 'http://localhost:3000/api'    // dev, of http://<server-ip>:8080/api voor productie
const ADMIN_PASSWORD = 'jouw-wachtwoord'              // wachtwoord uit install.sh
const FILE_PATH      = 'C:\\pad\\naar\\NCR_export.tab'
```

### Stap 3 — Script uitvoeren

Zorg dat de MES-server draait. Voer uit vanaf de repo-root op Windows:

```bash
node scripts/import-ncr.js
```

Verwachte uitvoer:
```
207 records gelezen, 1 overgeslagen (geen NCR_-ID)
Inloggen...
Ingelogd.

✓ 207 NCR-records verwerkt (ingevoegd of bijgewerkt)
✓ 163 statuslog-entries aangemaakt
```

Het script slaat regels zonder geldig `NCR_`-prefix automatisch over (lege regels, koptekst). Meerdere keren uitvoeren is veilig — bestaande records worden bijgewerkt, geen duplicaten.

> **Na de import** loopt de nummering automatisch door: de volgende handmatig aangemaakte NCR krijgt het nummer dat volgt op het hoogste geïmporteerde ID.

---

## Modules

### Kiosk — werkvloer touch-interface

| Module | Status |
|--------|--------|
| Aanmeldscherm (medewerkers + PIN) | Beschikbaar |
| Product Setup | Beschikbaar |
| Meet Setup | Beschikbaar |
| Tooling bibliotheek | Beschikbaar |
| NCR-registraties | Beschikbaar |
| NCR Statistieken | Beschikbaar |
| Preventieve maatregelen | Beschikbaar |
| Klantmeldingen | Beschikbaar |
| Meetmiddelen + kalibratie | Beschikbaar |
| Mijn taken | Beschikbaar |
| Mijn meldingen | Beschikbaar |

### Admin — beheerpaneel

| Module | Status |
|--------|--------|
| BC Configuratie + OAuth2 koppeling | Beschikbaar |
| BC Veldmapping (auto-detectie) | Beschikbaar |
| Medewerkersbeheer (CRUD, PIN, sync, email toggle) | Beschikbaar |
| Machines beheer | Beschikbaar |
| CNC Machining (tooling beheer) | Beschikbaar |
| Machine Dashboard (beschikbaarheid, spindeluren, downtime) | Beschikbaar |
| Email instellingen (SMTP + per-categorie reminder-interval) | Beschikbaar |

---

## E-mail reminders instellen (SMTP)

Het MES stuurt automatisch dagelijkse reminder-e-mails naar medewerkers met openstaande acties. SMTP wordt volledig via de admin UI geconfigureerd — geen aanpassing van `.env` nodig.

### Stap 1 — SMTP configureren

Admin → **Email instellingen** → vul in:

| Veld | Voorbeeld |
|------|-----------|
| SMTP host | `smtp.office365.com` |
| SMTP poort | `587` |
| Gebruikersnaam | `mes@dutchshape.nl` |
| Wachtwoord | `•••••••` |
| Afzendernaam | `Dutch Shape MES` |
| Afzender e-mail | `mes@dutchshape.nl` |

Klik **Verbinding testen** om te controleren of de instellingen werken.

### Stap 2 — Reminder-intervallen instellen

Per categorie is instelbaar na hoeveel dagen een reminder wordt verstuurd:

| Categorie | Standaard |
|-----------|-----------|
| Taken | 3 dagen |
| NCR | 7 dagen |
| Onderhoud | 7 dagen |
| Kalibratie | 14 dagen |
| Kwaliteit | 7 dagen |

Stel in op `0` om reminders voor een categorie uit te zetten.

### Stap 3 — E-mailnotificaties per medewerker

Admin → **Medewerkers** → medewerker openen → schakelaar **E-mailnotificaties** aan/uit.

Alleen medewerkers met een ingevuld e-mailadres én notificaties ingeschakeld ontvangen reminders.

### Wanneer worden reminders verstuurd?

De reminder-cron draait elke werkdag om **07:30**. Een medewerker ontvangt een e-mail als er openstaande items zijn die ouder zijn dan het ingestelde interval voor die categorie.

---

## Postprocessor-validatie (Product Setup)

NC-programma's (.h bestanden) bevatten een regel die aangeeft voor welke machine/postprocessor ze zijn gegenereerd:

```
2 ; Postprocessor: 04-MTE_BF4200_iTNC530
```

Het MES leest deze regel automatisch uit bij het uploaden van een .h bestand en vergelijkt die met de postprocessor die op de machine is ingesteld.

### Instellen per machine

Admin → Machines → machine openen → **CNC configuratie** → veld **Postprocessor** invullen (bijv. `04-MTE_BF4200_iTNC530`) → Opslaan.

Dit hoeft eenmalig per machine ingesteld te worden.

### Meldingen in Product Setup

In de CNC-tab van Product Setup, bij het geselecteerde .h bestand:

| Situatie | Melding | Knop "Stuur naar machine" |
|----------|---------|--------------------------|
| .h bestand heeft geen postprocessor-regel | Geen melding | Actief |
| .h bestand heeft postprocessor, machine heeft **geen** postprocessor ingesteld | Oranje waarschuwing: bestand is voor postprocessor X — stel in via Admin → Machines | Geblokkeerd |
| .h bestand en machine hebben **dezelfde** postprocessor | Geen melding | Actief |
| .h bestand en machine hebben een **andere** postprocessor | Oranje waarschuwing: bestand is voor X, machine verwacht Y | Geblokkeerd |

Een geblokkeerde knop voorkomt dat een operator per ongeluk een NC-programma naar de verkeerde machine stuurt.

---

## Projectstructuur

```
├── backend/          # Fastify API + worker
│   └── src/
│       ├── bc/       # Business Central koppeling (MSAL + poller)
│       ├── cnc/      # CNC tooling (parser + bibliotheek import)
│       ├── db/       # Schema (Drizzle) + migraties
│       ├── routes/   # API routes (admin + kiosk)
│       └── worker/   # BullMQ achtergrondtaken
├── frontend/         # React kiosk + admin interface
│   └── src/
│       └── routes/
│           ├── admin/    # Beheerpagina's
│           └── kiosk/    # Werkvloer touch-interface
├── cnc-agent/        # Windows agent voor CNC-machine koppeling
├── install.sh        # Eerste installatie op Linux server
├── update.sh         # Updates uitrollen
└── docker-compose.yml
```

---

## Omgevingsvariabelen

Zie [.env.example](.env.example) voor een volledig overzicht. `install.sh` genereert de vereiste secrets automatisch. Business Central-credentials kunnen ook via de Admin UI worden ingevuld (versleuteld opgeslagen met AES-256-GCM).
