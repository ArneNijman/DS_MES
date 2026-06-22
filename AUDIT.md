# Installatie Audit — Dutch Shape MES

## Audit 2026-06-22

Volledige regelanalyse van alle vier `.sh` scripts. Twee kritieke fouten gevonden en opgelost; drie openstaande minpunten genoteerd.

### Bevindingen per script

#### `backup.sh`
| Regel | Bevinding | Status |
|-------|-----------|--------|
| — | Geen directorycheck | ✅ Opgelost |
| 40 | `pg_dump -U mes mes` hardcoded — negeert `.env` | ✅ Opgelost |
| 93 | Restore-hint in echo heeft nog hardcoded `mes mes` | ⚪ Cosmetic |

#### `install.sh`
| Regel | Bevinding | Status |
|-------|-----------|--------|
| — | Geen directorycheck | ✅ Opgelost |
| 82 | `docker compose up --build -d` zonder `-f` → override actief | ✅ Opgelost |
| 94–101 | Wacht-loop pollt `docker compose logs` elke 2s — functioneel, licht zwaar | ⚪ Aanvaard |
| 111–117 | Admin-wachtwoord via multi-stage sed op JSON-logs — fragiel maar functioneel | ⚪ Aanvaard |
| 120 | `hostname -I` — Linux-specifiek, werkt op doelplatform (Ubuntu/Debian) | ⚪ Aanvaard |

#### `update.sh`
| Regel | Bevinding | Status |
|-------|-----------|--------|
| 30 | Stapnummering `[1/4]...[5/5]` inconsistent | ✅ Opgelost → `[1/5]...[5/5]` |
| 45 | `docker compose build` zonder `-f` → override actief | ✅ Opgelost |
| 52 | `docker compose up -d` zonder `-f` → override actief | ✅ Opgelost |
| 55 | `sleep 5` — geen health check, vals negatief in doctor.sh mogelijk | ✅ Opgelost → health-check loop |
| 75 | `hostname -I` — Linux-specifiek, aanvaard | ⚪ Aanvaard |

#### `doctor.sh`
| Regel | Bevinding | Status |
|-------|-----------|--------|
| 63 | `sed 's/messysteem-//'` redundant na eerste sed | ✅ Opgelost |
| 85, 93, 99, 144 | `docker compose exec -T db` — service heet `postgres`, niet `db` → databasechecks faalden altijd | ✅ Opgelost |
| 99 | Variabele `MISSING` bevatte applied-namen (misleidend) | ✅ Opgelost → `APPLIED_NAMES` |

### Hoofdoorzaak installatieproblemen

**`docker-compose.override.yml`** stond in de repo en werd niet genegeerd door `.gitignore`. Docker Compose voegt dit bestand automatisch samen bij elke `docker compose up/build` zonder expliciete `-f` vlag. Gevolg: elke productie-update activeerde stiekem de dev-modus:

- `backend`: `npx tsx watch src/index.ts` i.p.v. `node dist/index.js`
- `backend`: volume-mount `./backend:/app` (broncode i.p.v. gecompileerde image)
- `frontend`: build-target `builder` + `npm run dev` i.p.v. nginx + productie-build
- Alle services: `NODE_ENV: development`

### Fixes doorgevoerd

- `docker-compose.override.yml` **verwijderd** (was identiek aan `docker-compose.dev.yml`)
- `docker-compose.override.yml` toegevoegd aan `.gitignore`
- `update.sh` en `install.sh`: expliciete `-f docker-compose.yml` vlag bij alle `build`/`up` commando's
- `update.sh`: stapnummering gecorrigeerd naar `[1/5]...[5/5]`
- `update.sh`: `sleep 5` → health-check loop (max 60s, controleert `/health`)
- `backup.sh`: directorycheck + `.env` laden + `${POSTGRES_USER:-mes}` / `${POSTGRES_DB:-mes}`
- `install.sh`: directorycheck toegevoegd
- `doctor.sh`: `exec -T db` → `exec -T postgres` (service naam gecorrigeerd)
- `doctor.sh`: redundante sed verwijderd; `MISSING` → `APPLIED_NAMES`

### Nieuwe toevoegingen (zelfde sessie)

- `doctor.sh` — nieuw health check script (10 checks, kleuruitvoer, exit code 0/1)
- `cnc-agent/cnc-agent.js` — `GET /health` endpoint toegevoegd
- `backend/src/routes/admin/system-health.ts` — JSON health endpoint voor admin widget
- `frontend/src/components/AdminSidebar.tsx` — status-dot widget (groen/oranje/rood, klik → modal)

---

## Audit 2026-05-13

Volledige audit van beide README's en alle installatiescripts. Één kritieke fix doorgevoerd.

| Onderdeel | Status | Opmerking |
|-----------|--------|-----------|
| `README.md` | ✅ | Correct en actueel — architectuur, CNC agent stappen, WinTool sectie |
| `cnc-agent/README.md` | ✅ | Correct en volledig |
| `install.sh` | ✅ | Verouderde WinTool share stap verwijderd, stappen hernummerd naar 4 |
| `update.sh` | ✅ | Correct — git pull + build + restart |
| `cnc-agent/install-scheduler.ps1` | ✅ | Correct — taakplanner, AtStartup + AtLogOn, herstart bij fout |
| `cnc-agent/run.bat` | ✅ | Correct — `--once` flag, .env controle |
| `.env.example` | ✅ | Alle variabelen aanwezig |
| `cnc-agent/.env.example` | ✅ | Alle variabelen aanwezig, `WINTOOL_DB_PATH=` actief (niet uitgecommentarieerd) |

### Fix doorgevoerd tijdens audit

- `install.sh` — Stap 3 (WinTool CIFS netwerkshare mounten) volledig verwijderd. Dit was de oude aanpak; WinTool sync loopt nu via de cnc-agent `.env`. Stappen hernummerd van `[1/5]…[5/5]` naar `[1/4]…[4/4]`.

---

## Audit 2026-05-12

Volledige installatie-audit uitgevoerd. Geen kritieke fouten gevonden.

| Onderdeel | Status | Opmerking |
|-----------|--------|-----------|
| `install.sh` | ✅ | Veilig, correct, genereert secrets via openssl |
| `update.sh` | ✅ | Correct — git pull + rebuild + restart |
| `dev.bat` | ✅ | Correct — poort 5173 |
| `testserver.bat` | ✅ | Correct — heeft `--build` flag, poort 8080 |
| `cnc-agent/run.bat` | ✅ | Correct — `--once` flag |
| `docker-compose.yml` | ✅ | Alle services correct geconfigureerd |
| `docker-compose.dev.yml` | ✅ | Hot-reload correct voor frontend, backend en worker |
| `.env.example` | ✅ | Alle variabelen aanwezig met invulhints |
| `CLAUDE.md` | ✅ | Volledig en actueel |
| Database migraties | ✅ | Oplopend zonder gaten — 0000 t/m 0050 |
| Poorten consistent | ✅ | 8080 / 3000 / 5173 / 3099 / 5432 overal consistent |
| `cnc-agent/README.md` | ✅ | Alle endpoints, flows en configuratie kloppen met de code |
| `cnc-agent/.env.example` | ✅ | Alle variabelen gedocumenteerd, inclusief `WINTOOL_DB_PATH` |

### Fixes doorgevoerd tijdens audit

- `docker-compose.yml` — comment toegevoegd bij `CNC_AGENT_URL` voor multi-agent configuratie
- `cnc-agent/README.md` — `curl` voorbeeld verduidelijkt met vermelding van de agent-poort

---

*Voeg toekomstige audits toe als nieuwe sectie bovenaan.*
