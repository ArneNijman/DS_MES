# Factory Assistant — MES

**Manufacturing Execution System voor Dutch Shape**

Een event-driven MES dat als operationele intelligentielaag bovenop Microsoft Business Central (BC Online/SaaS) functioneert.

---

## Architectuur — twee onderdelen

De installatie bestaat uit twee onderdelen die op **aparte machines** draaien:

```
  CNC-machines (Heidenhain)              Windows PC (ergens in het netwerk)
  ┌─────────────┐                        ┌──────────────────────────────────┐
  │ BF 3200     │◄──── TNCcmd.exe ──────│  cnc-agent/                      │
  │ FPT Ronin   │                        │  • haalt TOOL.T op per machine   │
  │ ...         │                        │  • synchroniseert WinTool (.db)  │
  └─────────────┘                        │  • stuurt data naar MES backend  │
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

Slaat de database en uploads op in `backups/` op de server. Backups ouder dan 7 dagen worden automatisch verwijderd. Terugzetten:

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

De CNC agent draait op **één Windows PC** in het netwerk — niet op elke CNC-machine afzonderlijk. Die PC hoeft alleen **netwerkbereik** te hebben naar de CNC-machines (ping werkt) en naar de MES-server (poort 8080). De agent haalt de gereedschapstabellen op via TNCcmd.exe en stuurt ze naar het MES.

**Stap 1** — Installeer Node.js 22 LTS via [nodejs.org](https://nodejs.org)

**Stap 2** — Zet de agent-map op de Windows PC:
Kopieer de map `cnc-agent\` vanuit de repo naar de Windows PC, bijvoorbeeld naar:
```
C:\DS_MES\cnc-agent\
```

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

De agent draait nu automatisch op de achtergrond en synchroniseert bij elke Windows-opstart en elke 30 minuten daarna.

> **Volg voor de volledige installatie van de CNC agent het stappenplan in [`cnc-agent\README.md`](cnc-agent/README.md#eerste-installatie).**
> Dat document bevat uitgebreide uitleg per stap, probleemoplossing, de werking van de Sync-knop in de kiosk en het instellen van meerdere agents voor redundantie.

---

## WinTool bibliotheek koppelen

De gereedschapsdatabase uit WinTool synchroniseert automatisch via de CNC agent.

**Instellen:** Vul `WINTOOL_DB_PATH=` in de cnc-agent `.env` in met het volledige pad naar het `.db` bestand op de Windows PC (zie stap 3b hierboven). De agent detecteert wijzigingen automatisch en uploadt naar het MES.

**Bibliotheek herladen:** Admin → CNC Machining → Bibliotheek → knop "Herlaad bibliotheek". Dit forceert een directe upload, ook als het bestand niet gewijzigd is.

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
| Medewerkersbeheer (CRUD, PIN, sync) | Beschikbaar |
| Machines beheer | Beschikbaar |
| CNC Machining (tooling beheer) | Beschikbaar |

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
