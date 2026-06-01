# DS MES — Metrologieplatform Roadmap

## Context

Dutch Shape werkt projectmatig met enkelstuks precisie-onderdelen. Het MES wordt uitgebreid met een browser-native inspectie- en metrologieomgeving die direct integreert met de bestaande Product Setup module.

De architectuur scheidt vier lagen:
- **CAD Layer** — STEP-geometrie, scene graph, assemblages
- **Inspection Layer** — PC-DMIS meetdata, features, GD&T
- **Overlay Layer** — gekleurde punten, vectoren, heatmaps, tolerantiezones
- **MES Layer** — productieorders, machinehistorie, cross-project analyse

> **Enkelstuks / projectmatig**: Traditionele SPC (Cp/Cpk) is niet van toepassing — elke opdracht levert 1 meting per feature. Phase 4 is daarom gebaseerd op cross-project machine-intelligentie in plaats van batch-statistieken.

---

## Phase 1 — MVP Inspectieviewer

**Status: Gedeeltelijk gebouwd**

Gebouwd (2026-05/06):
- Meetmaten tab in Product Setup + Meet Setup (balloon-annotaties op tekening, PDF split-view)
- Balloon positie opslaan in DB (`product_setup_maten`, migration 0059–0060)
- PDF viewer met sidebar voor maten-overzicht

Nog te bouwen:

### Wat de gebruiker ziet
- "Meet bestanden" portal in Product Setup (naast Tekeningen en CAD bestanden)
- Upload PC-DMIS XML meetbestand met rapportage type (frezen / controle / eindmeting)
- Upload PDF rapport
- Feature-tabel met nominaal, gemeten, deviatie en pass/fail per feature
- Gekleurde bollen (groen = OK, rood = FAIL) op het 3D CAD model
- Hover-tooltip met feature details

### Technische implementatie
- PC-DMIS XML parser (`backend/src/cnc/pcdmisParser.ts`) met meerdere format-fallbacks
- Nieuw `documentType`: `'meting_xml'` en `'meting_rapport'`
- Nieuw `rapportageType` kolom in `product_setup_documents`
- Three.js sphere overlay via `inspectionPoints` prop op CadViewer
- Centeroffset van STEP model automatisch toegepast op meetpunten

### Risico's
- PC-DMIS XML format varieert per versie en configuratie — parser gebouwd met meerdere fallback-strategieën
- Coördinatenstelsel-uitlijning tussen CAD model en PC-DMIS kan afwijken — handmatige offset als fallback

### Data die al wordt opgeslagen (voor Phase 4)
Per meetrun: `machineId` (via Product Setup stap), `rapportageType`, `operator`, `datum`

---

## Phase 2 — Geavanceerde metrologie-visualisatie

**Status: Gepland**

### Wat de gebruiker ziet
- Smooth kleurheatmap op STEP-oppervlak (blauw = te weinig materiaal, groen = nominaal, rood = te veel)
- Deviatievectoren: pijlen van nominaal naar gemeten oppervlak
- Dynamische snijvlakken met nominaal vs. gemeten doorsnede
- GD&T overlays: vlakheid, positie, loodrechtheid, concentriciteit

### Technische uitdagingen
- Surface heatmaps vereisen face-to-point mapping via STEP topologie-analyse (occt-import-js)
- Begin met vertex-coloring benadering; smoothe gradient heatmaps zijn de volgende stap
- Deviatievectoren: normaalvector-gebaseerde pijlen, schaalbaar, togglebaar

### Aanbeveling
Pas aanpakken nadat Phase 1 live is en echte PC-DMIS meetdata beschikbaar is voor testen.

---

## Phase 3 — Volledige scan-vergelijking

**Status: Gepland**

### Wat de gebruiker ziet
- Upload puntenwolk (XYZ) of scan mesh (STL/OBJ/PLY)
- Overlay van gemeten mesh op nominaal STEP model
- Deviatieheatmap over het volledige oppervlak
- Profielcurve-analyse per doorsnede

### Technische implementatie
- Three.js `Points` + `BufferGeometry` voor puntenwolken (GPU-rendering)
- Signed distance field voor deviation cloud (WebGL shader)
- STL overlay: Two.js al deels aanwezig (STLLoader)
- LOD/chunking voor grote puntenwolken (miljoenen punten)

---

## Phase 4 — Cross-project machine-intelligentie

**Status: Gepland — vereist 6–12 maanden opgebouwde meetdata**

> Traditionele SPC werkt niet bij enkelstuks. Phase 4 analyseert patronen over projecten en machines heen.

### Functionaliteit

**Machine-fingerprinting**
Verzamel afwijkingen van alle enkelstuks-projecten per machine. Detecteer systematische drift:
- "Machine 3 heeft structureel +0.02mm op nauwkeurige boren na 150 spindeluren"
- Deviaties direct op 3D model geprojecteerd, gegroepeerd per machine

**Feature-type clustering**
Groepeer gelijksoortige features over alle projecten heen:
- Alle H7-boren ø10–12mm op machine 3 → statistisch volume ondanks enkelstuks
- Tolerantieklasse-gebaseerde clustering

**Tool-wear over projecten**
Hetzelfde gereedschap verschijnt in meerdere projecten:
- Wear-progressie meetbaar over projecten heen
- Correlatie: toolslijtage → feature-afwijking

**Revisie-vergelijking**
Vergelijk meetresultaten van vergelijkbare onderdelen voor dezelfde klant over meerdere projecten:
- "Dit onderdeel lijkt op wat we in 2024 maakten — afwijkingen zijn anders op deze vlakken"

### Technische vereisten
- Alle meetresultaten per feature opgeslagen in DB (wordt al gedaan vanaf Phase 1)
- Feature-type classificatie en geometrische clustering
- Tijdreeks-analyse per machine/toolcombinatie
- AI/anomalie-detectie als latere uitbreiding

### Datastructuur (al vanaf Phase 1 opgebouwd)
```
meetrun: { machineId, toolId, operator, rapportageType, datum }
feature:  { naam, type, nominalXYZ, measuredXYZ, deviatie, tolerantie, status }
```

---

## Technische stack

| Laag | Technologie |
|------|-------------|
| 3D rendering | Three.js, WebGL |
| STEP parsing | occt-import-js (WASM) |
| STL/mesh | Three.js STLLoader |
| XML parsing | Node.js DOMParser / fast-xml-parser |
| Puntenwolk | Three.js BufferGeometry + ShaderMaterial |
| Backend | Fastify + Drizzle ORM + PostgreSQL |
| Frontend | React 18 + TanStack Query + Tailwind CSS |

---

## Implementatievolgorde

```
Phase 1 (nu)
  └─ Meet bestanden portal
  └─ PC-DMIS XML parser
  └─ 3D sphere overlay

Phase 2 (na Phase 1 live + echte meetdata)
  └─ Vertex-coloring heatmap
  └─ Deviatievectoren
  └─ Snijvlakken

Phase 3 (na Phase 2)
  └─ Puntenwolk upload + rendering
  └─ Scan mesh overlay
  └─ Deviation cloud

Phase 4 (6–12 maanden na Phase 1)
  └─ Cross-project dashboard
  └─ Machine-fingerprinting
  └─ Feature-type SPC
```
