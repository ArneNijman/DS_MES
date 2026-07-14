export type EntryType = 'feat' | 'fix' | 'improvement'

export interface ChangelogEntry {
  type: EntryType
  text: string
}

export interface ChangelogVersion {
  version: string
  date: string
  title: string
  entries: ChangelogEntry[]
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '1.8',
    date: '2026-07-14',
    title: 'Projectanalyse KPI-uitleg & phantom run opschoning',
    entries: [
      { type: 'feat',        text: 'Info (i) knoppen op alle 5 KPI-kaarten in artikeldetail — klik toont uitleg per metric' },
      { type: 'fix',         text: '9 phantom runs van exact 24:00:00 (oude stale-checker) verwijderd uit Onderbroken statistiek' },
      { type: 'fix',         text: 'Stale run checker: grens verlaagd van 24u naar 8u; phantom runs krijgen nu duration=0 zodat ze nooit meetellen' },
      { type: 'feat',        text: 'Vijfde KPI-kaart "Onderbroken" toegevoegd aan projectanalyse artikeldetail' },
      { type: 'fix',         text: '0-seconde phantom runs uitgesloten van verspaantijd, run-count en Onderbroken KPI via duration_seconds > 0 filter' },
    ],
  },
  {
    version: '1.7',
    date: '2026-06-23',
    title: 'Deployment fix update.sh + Tooling stocklocaties lade/vak',
    entries: [
      { type: 'fix',         text: 'update.sh schakelde server terug naar productie-modus (nginx 8080) na elke update — dev-overlay nu altijd meegegeven' },
      { type: 'fix',         text: 'doctor.sh machine TCP-checks gaven altijd 7 valse waarschuwingen — verwijderd, vervangen door DB-telling' },
      { type: 'fix',         text: 'doctor.sh CNC agent check faalde vanaf server — check verplaatst naar backend container (zelfde netwerkpad als admin panel)' },
      { type: 'fix',         text: 'CNC agent: duidelijke foutmelding bij upload naar TNC 426/430M (bestandsnaam invalid)' },
      { type: 'feat',        text: 'Lade en Vak velden per stocklocatie (migratie 0072)' },
      { type: 'feat',        text: 'Uitboeken / Bijboeken knoppen in tooling stocklocaties' },
      { type: 'improvement', text: 'Artikel-detail modal vergroot (max-w-6xl, 96vh); locaties scrollbaar' },
    ],
  },
  {
    version: '1.6',
    date: '2026-06-22',
    title: 'Systeemgezondheid, meerdere postprocessors, scripts audit',
    entries: [
      { type: 'feat',        text: 'doctor.sh — health check script met 10 checks (Docker, backend, database, migraties, CNC agent, schijf)' },
      { type: 'feat',        text: 'Systeemstatus widget in admin sidebar — groen/oranje/rood bolletje, klik voor detail' },
      { type: 'feat',        text: 'Meerdere postprocessors per machine (text[] array, tag-invoer UI)' },
      { type: 'feat',        text: 'Standaard registratie als nieuw onderhoudstype' },
      { type: 'feat',        text: 'Tooling foto fallback: eigen foto → bibliotheekfoto → placeholder' },
      { type: 'fix',         text: 'docker-compose.override.yml activeerde dev-modus in productie — verwijderd' },
    ],
  },
  {
    version: '1.5',
    date: '2026-06-19',
    title: 'CNC dropdown, product setup tab, HyperMill protocol',
    entries: [
      { type: 'fix',         text: 'CNC machining dropdown toonde alle machinetypen — filtert nu op Freesmachine' },
      { type: 'fix',         text: 'Product setup detailscherm opende op CNC informatie — opent nu op Algemene informatie' },
      { type: 'fix',         text: 'HyperMill protocol-installatie downloadde HTML in plaats van .reg bestand' },
    ],
  },
  {
    version: '1.4',
    date: '2026-06-18',
    title: 'TypeScript build fix, migratie 0021, CNC agent URL',
    entries: [
      { type: 'fix',         text: 'Migratie 0021 blokkeerde backend op servers met bestaande tabel (FK-afhankelijkheden)' },
      { type: 'fix',         text: 'CNC_AGENT_URL nu configureerbaar via .env (was hardcoded)' },
      { type: 'fix',         text: 'Windows Firewall blokkeerde backend → CNC agent verbinding op poort 3099' },
    ],
  },
  {
    version: '1.3',
    date: '2026-06-17',
    title: 'CNC agent stabiliteit & programmastate betrouwbaarheid',
    entries: [
      { type: 'fix',         text: 'Spurious PROGRAM_STARTED na LSV2-blip opgelost via last-known-good state' },
      { type: 'fix',         text: 'Valse PROGRAM_STOPPED bij LSV2-blip — alleen emitteren als lsv2Reliable' },
      { type: 'feat',        text: 'programStateKnown vlag — dashboard toont geen badge bij onzekere staat (bijv. MTE 3200)' },
      { type: 'improvement', text: 'Poll interval 10s → 20s; sequentieel pollen i.p.v. parallel' },
    ],
  },
  {
    version: '1.2',
    date: '2026-06-12',
    title: 'Alarm-downtime correctie + machine dashboard badges',
    entries: [
      { type: 'feat',        text: 'staleAlarmChecker: detecteert open alarmen zonder ALARM_CLEARED en sluit ze automatisch' },
      { type: 'feat',        text: 'Oranje "Alarm actief" badge op machine-tegels bij alarm tijdens productie' },
      { type: 'feat',        text: 'Starttijd/eindtijd naast programma-badges (▶ Loopt, ⚠ Onderbroken, ◼ Gestopt)' },
      { type: 'feat',        text: 'Verspaantijd artikel-badges: eerste 5 zichtbaar, "+N meer" klapt uit' },
      { type: 'fix',         text: 'Alarm ≠ alarmstilstand: alarm tijdens run telt als informatief, niet als downtime' },
    ],
  },
  {
    version: '1.1',
    date: '2026-06-11',
    title: 'Machine dashboard redesign + phantom run cleanup',
    entries: [
      { type: 'feat',        text: 'Machine dashboard tab-layout: Beschikbaarheid / Spindeluren / Verspaantijd' },
      { type: 'feat',        text: 'Beschikbaarheid-tegels met foto, beschikbaarheid%, online/offline-badge en programma-status' },
      { type: 'feat',        text: 'Detailmodal bij klik op tegel: downtime breakdown + perioden-lijst' },
      { type: 'fix',         text: '121 phantom runs met duur > 24u verwijderd (~28.000 phantom uren over alle machines)' },
      { type: 'fix',         text: 'Stale run checker: harde grens 16u toegevoegd als vangnet' },
    ],
  },
]

export const LATEST_VERSION = CHANGELOG[0].version
