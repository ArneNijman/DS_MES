# Roadmap: Factory Assistant MES

## Milestones

- 🚧 **v1.0 Fundament + Beheer** — Fase 1 (in progress)

## Phases

### 🚧 Fase 1: Fundament + Beheer + Aanmeldtegels (In Progress)

**Goal:** Werkende Docker-stack met kiosk aanmeldscherm, admin sidebar, BC-koppeling, medewerkersbeheer en veldmapping-verificatie.

**Scope:**
- Docker Compose (frontend, backend, worker, postgres, redis)
- Kiosk aanmeldtegels (employee grid + PIN-login)
- Admin login (gebruikersnaam + wachtwoord)
- Beheer: BC API koppeling (OAuth2 + test)
- Beheer: Medewerkers (CRUD, PIN, rol, foto, BC-sync)
- Beheer: Rollen toewijzen
- Beheer: BC Veldmapping (auto-detectie + verificatie UI)
- Sidebar navigatie (uitbreidbaar)

**Plans:**
- [ ] 01-01-PLAN.md — Root scaffold + .planning docs + Docker Compose + .env
- [ ] 01-02-PLAN.md — Backend fundament: schema, plugins, utilities, BC-integratie, routes
- [ ] 01-03-PLAN.md — Frontend: lib, componenten, pagina's, router

**Success Criteria:**
1. `docker compose up --build` → alle 5 services starten zonder errors
2. `http://localhost/kiosk` → medewerkerstegels zichtbaar
3. `http://localhost/admin/login` → inloggen met seed-credentials (in backend logs)
4. Admin → BC Configuratie → test → groene checkmarks
5. Admin → Medewerkers → PIN instellen, rol wijzigen
6. Admin → Veldmapping → na sync gevonden varianten zichtbaar
7. Kiosk → medewerker selecteren → PIN → redirect naar dashboard

## Progress

| Fase | Plans | Status | Afgerond |
|------|-------|--------|----------|
| 1. Fundament + Beheer | 0/3 | 🚧 In progress | — |
