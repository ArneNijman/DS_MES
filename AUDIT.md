# Installatie Audit — Dutch Shape MES

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
