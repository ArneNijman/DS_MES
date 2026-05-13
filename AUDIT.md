# Installatie Audit — Dutch Shape MES

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
