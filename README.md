# Factory Assistant — MES

**Manufacturing Execution System voor Dutch Shape**

Een event-driven MES dat als operationele intelligentielaag bovenop Microsoft Business Central (BC Online/SaaS) functioneert. Factory Assistant maakt wachttijd, projectflow, kwaliteitsafwijkingen en machinestatus objectief meetbaar — volledig gekoppeld aan BC, zonder extra handmatige invoer van operators.

---

## Tech stack

| Laag | Technologie |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query |
| Backend | Node.js + Fastify + Drizzle ORM + PostgreSQL |
| Worker | BullMQ (Redis-backed job queue) |
| BC-koppeling | Microsoft MSAL (OAuth2 client credentials flow) |
| Deployment | Docker Compose + Nginx |

---

## Installatie

### Vereisten
- Docker + Docker Compose
- Toegang tot een Business Central Online omgeving

### Opstarten

1. Kopieer de omgevingsvariabelen en vul ze in:

```bash
cp .env.example .env
```

Vul minimaal in:
- `POSTGRES_PASSWORD` — kies een wachtwoord
- `JWT_SECRET` — genereer met: `openssl rand -hex 32`
- `BC_ENCRYPTION_KEY` — genereer met: `openssl rand -hex 32`

2. Start alle services:

```bash
docker compose up --build
```

3. Controleer of alles draait:
   - Kiosk: `http://localhost:8080/kiosk`
   - Admin login: `http://localhost:8080/admin/login` *(seed-credentials verschijnen in de backend logs)*

---

## Structuur

```
├── backend/          # Fastify API + worker
│   ├── src/
│   │   ├── bc/       # Business Central koppeling (MSAL + poller)
│   │   ├── db/       # Schema (Drizzle) + migraties
│   │   ├── routes/   # API routes (admin + kiosk)
│   │   └── worker/   # BullMQ achtergrondtaken
├── frontend/         # React kiosk + admin interface
│   └── src/
│       ├── routes/
│       │   ├── admin/    # Beheerpagina's
│       │   └── kiosk/    # Werkvloer touch-interface
├── cnc-agent/        # Lokale agent voor CNC-machine koppeling
└── docker-compose.yml
```

---

## Modules

| Module | Status |
|--------|--------|
| Kiosk aanmeldscherm (medewerkers + PIN) | Beschikbaar |
| Admin: BC Configuratie + OAuth2 koppeling | Beschikbaar |
| Admin: Medewerkersbeheer (CRUD, PIN, sync) | Beschikbaar |
| Admin: BC Veldmapping (auto-detectie) | Beschikbaar |
| Machines: onderhoud, storingen, CNC | Beschikbaar |
| NCR-registraties + preventieve acties | Beschikbaar |
| Klantmeldingen | Beschikbaar |
| Meetmiddelen + kalibratie | Beschikbaar |
| Taken | Beschikbaar |
| CNC tooling bibliotheek | Beschikbaar |

---

## CNC Agent

De `cnc-agent/` map bevat een lokale Node.js agent die op de CNC-machine PC draait en gereedschapstabeldata doorstuurt naar het MES.

```bash
cd cnc-agent
cp .env.example .env
node cnc-agent.js
```

---

## Omgevingsvariabelen

Zie [.env.example](.env.example) voor een volledig overzicht. Business Central-credentials kunnen ook via de Admin UI worden ingevuld (worden versleuteld opgeslagen met AES-256-GCM).
