# Factory Assistant — Project Context

## Wat is dit

Een event-driven Manufacturing Execution System (MES) dat als **operationele intelligentielaag** bovenop Business Central (BC Online/SaaS) functioneert. Factory Assistant maakt wachttijd, projectflow, kwaliteitsafwijkingen en machinestatus objectief meetbaar — volledig op basis van events uit BC, zonder extra handmatige invoer van operators.

**Naam in UI:** Factory Assistant  
**Subtitle:** Manufacturing Execution System  
**Programma-eigenaar:** Arne Nijman (AI engineer, Dutch Shape )

## Bredere visie

Factory Assistant is het volledige bedrijfsbesturingssysteem voor de werkvloer:
- Werkbonnen, productieplanning, kwaliteitsregistraties
- Machinebeheer: onderhoud, storingen, CNC-configuratie, energie
- Koppeling met ERP (Business Central), machines
- Bereikbaar via browser op iPad, telefoon, pc
- Wekelijks verder uitgebouwd

## Wie gebruikt het

| Rol | Wat ze nodig hebben |
|-----|---------------------|
| **Operators (werkvloer)** | Grote touch-interface, zien direct hun werkopdrachten |
| **Werkvoorbereiders** | Projectstatus, documenten per onderdeel |
| **Kwaliteitsverantwoordelijke** | NCR-registratie, preventieve acties |
| **Management** | Dashboards: wachttijd, planningbetrouwbaarheid, bottlenecks |
| **Beheerder** | Medewerkers, rollen, BC-koppeling, machinebeheer |

## Tech stack

| Laag | Technologie |
|------|-------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query |
| Backend | Node.js + Fastify + Drizzle ORM + PostgreSQL |
| Worker | BullMQ (Redis-backed job queue) |
| BC-koppeling | Microsoft MSAL (OAuth2 client credentials flow) |
| Deployment | Docker Compose + Nginx |

## Navigatiestructuur

- **Kiosk** (publiek): medewerkerstegels + PIN-login → kiosk dashboard
- **Admin** (beveiligd): sidebar-navigatie links met iconen + labels
  - Dashboard / Overzicht
  - Medewerkers
  - BC Configuratie
  - Veldmapping
  - *(later: Productie, Machines, Kwaliteit, etc.)*

## Key Decisions

| Beslissing | Redenering |
|------------|-----------|
| BC Online via REST API + polling | Polling elke 5 min; webhooks uitgesteld naar later |
| On-premise Docker Compose | Data blijft lokaal, IT beheert zelf |
| PostgreSQL + Drizzle ORM | Open-source, gefaseerd uitbreidbaar schema |
| Fastify backend | Lichtgewicht, plugin-based, native TypeScript |
| Touch-first kiosk | Operators hebben minimale IT-ervaring — grote knoppen, weinig tekst |
| AES-256-GCM voor BC clientSecret | Geen plain-text credentials in database |
| fieldPicker utility | BC API inconsistent in veldnamen — automatische detectie + verificatie UI |
| Sidebar navigatie (admin) | Schaalbaar naar veel modules; past bij de richting van Factory Assistant |

## Toekomstige modules (visuele referentie beschikbaar)

### Module: Productie
- 3 tabs: Orders | Bewerkingen | Capaciteit
- Linkerpaneel: orderlijst met zoekbalk + filter
- Rechterpaneel: ordernummer, artikel, materialen, bewerkingen (met status Gepland/Gereed/Extern), tijdregistratie
- Gereedmelden-knop per regel

### Module: Machines / Assets
- 4 tabs: Machines | Onderhoud | Storingen | Energy
- Linkerpaneel: machinelijst met categorie-badge + status filter
- Rechterpaneel: Basisgegevens, Elektrische aansluiting, CNC Configuratie, tabbladen voor onderhoud/storingen/facturen/documenten
- Actief/Inactief toggle per machine
