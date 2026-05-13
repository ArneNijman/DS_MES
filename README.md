# Factory Assistant — MES

**Manufacturing Execution System voor Dutch Shape**

Een event-driven MES dat als operationele intelligentielaag bovenop Microsoft Business Central (BC Online/SaaS) functioneert.

---

## Architectuur — twee machines

De installatie bestaat uit twee onderdelen die op **aparte machines** draaien:

```
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│  Linux server (Ubuntu/Debian)    │     │  Windows PC bij CNC-machines     │
│                                  │     │                                  │
│  Docker Compose:                 │◄────│  cnc-agent/                      │
│  • Frontend  (React + Nginx)     │     │  • cnc-agent.js                  │
│  • Backend   (Fastify + Node)    │     │  • install-scheduler.ps1         │
│  • PostgreSQL 16                 │     │  • run.bat                       │
│  • Redis 7                       │     │                                  │
│                                  │     │  Vereist: Node.js 22 + TNCremo   │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

> **Let op:** de bestanden in `cnc-agent/` (`.ps1`, `.bat`) zijn **uitsluitend voor de Windows PC** en hoeven niet op de Linux server te staan. Op de Linux server draait alleen Docker.

---

## Installatie — Linux server

### Wat je nodig hebt

- Ubuntu 22.04 / Debian 12 (of nieuwer)
- Docker Engine 24+ en Docker Compose v2
- Git
- Poort 8080 open in de firewall
- Netwerktoegang naar de Windows share met WinTool database (optioneel)

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
- WinTool sync instellen via `WINTOOL_DB_PATH` in de cnc-agent `.env` (optioneel)
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

## CNC Agent instellen — Windows PC bij de machines

De CNC agent draait op de **Windows PC** die verbinding heeft met de Heidenhain CNC-machines. Hij haalt automatisch de gereedschapstabel op en stuurt die naar het MES.

**Stap 1** — Installeer Node.js 22 LTS via [nodejs.org](https://nodejs.org)

**Stap 2** — Kopieer het configuratiebestand:
```
cnc-agent\.env.example  →  cnc-agent\.env
```
Open `.env` in Kladblok en vul in:
```
BACKEND_URL=http://<server-ip>:8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<wachtwoord uit de installatie>
TNCCMD_PATH=C:\Program Files (x86)\HEIDENHAIN\TNCremo\TNCcmd.exe
```

**Stap 3** — Test de verbinding:
Dubbelklik `cnc-agent\run.bat`
Het venster moet "Sync voltooid" tonen en daarna sluiten.

**Stap 4** — Installeer als automatische achtergrondtaak:
Open PowerShell als administrator en voer uit:
```
powershell -ExecutionPolicy Bypass -File cnc-agent\install-scheduler.ps1
```

De agent draait nu automatisch op de achtergrond en synchroniseert bij elke Windows-opstart en elke 30 minuten daarna.

> Zie `cnc-agent\README.md` voor uitgebreide documentatie, probleemoplossing en de werking van de Sync-knop in de kiosk.

---

## WinTool bibliotheek koppelen

De gereedschapsdatabase uit WinTool kan worden gekoppeld via een netwerkshare.

**Eenmalig tijdens installatie:** `install.sh` vraagt of je de share wilt configureren.

**Later aanpassen:** Admin → Dashboard → sectie "Systeem" → WinTool database pad instellen.

**Bibliotheek herladen:** Admin → CNC Machining → Bibliotheek → knop "Herlaad bibliotheek".

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
