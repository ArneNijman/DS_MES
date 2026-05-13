// Eenmalige import van meetmiddelen vanuit FileMaker export
// Gebruik: node scripts/import-meetmiddelen.js

import fs from 'fs'

// ── Configuratie ────────────────────────────────────────────────────────────
const BACKEND_URL   = 'http://localhost:3000'    // of http://<server-ip>:8080 voor productie
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'changeme'                // aanpassen naar het admin wachtwoord
const FILE_PATH      = 'C:\\Users\\ArneNijman\\Documents\\FIlemaker export\\Kwaliteit\\Kwaliteit export.tab'
// ────────────────────────────────────────────────────────────────────────────

function parseDate(ddmmyyyy) {
  if (!ddmmyyyy) return null
  const parts = ddmmyyyy.trim().split('-')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function calcInterval(kalDatumStr, vervalDatumStr) {
  const kal   = parseDate(kalDatumStr)
  const verval = parseDate(vervalDatumStr)
  if (!kal || !verval) return 'jaarlijks'
  const diffMs = new Date(verval).getTime() - new Date(kal).getTime()
  const diffMnd = diffMs / (1000 * 60 * 60 * 24 * 30.44)
  if (diffMnd <= 4)  return 'kwartaal'
  if (diffMnd <= 8)  return 'halfjaarlijks'
  return 'jaarlijks'
}

async function login() {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login mislukt: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.token
}

async function createTool(token, body) {
  const res = await fetch(`${BACKEND_URL}/kiosk/meetmiddelen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tool aanmaken mislukt: ${res.status} ${await res.text()}`)
  return res.json()
}

async function addCalibration(token, toolId, datum, gekalibreerdDoor) {
  const res = await fetch(`${BACKEND_URL}/kiosk/meetmiddelen/${toolId}/calibrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ datum, gekalibreerdDoor }),
  })
  if (!res.ok) throw new Error(`Kalibratie toevoegen mislukt (${toolId}): ${res.status} ${await res.text()}`)
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Bestand niet gevonden: ${FILE_PATH}`)
    console.error('Exporteer eerst de meetmiddelen uit FileMaker en sla op als:')
    console.error(`  ${FILE_PATH}`)
    process.exit(1)
  }

  console.log('Inloggen...')
  const token = await login()
  console.log('Ingelogd.\n')

  const raw = fs.readFileSync(FILE_PATH, 'utf-8')
  const rows = raw.split('\n').map(r => r.split('\t'))

  // Bouw een map van sub-rijen per MeetmiddelID (col[17])
  const subRows = new Map() // meetmiddelId → [{datum, door}]
  for (const cols of rows) {
    const col11 = (cols[11] ?? '').trim()
    const col17 = (cols[17] ?? '').trim()
    if (!col11 && col17) {
      const datum = parseDate((cols[14] ?? '').trim())
      const door  = (cols[15] ?? '').trim() || null
      if (!subRows.has(col17)) subRows.set(col17, [])
      if (datum) subRows.get(col17).push({ datum, door })
    }
  }

  let aangemaakt = 0
  let kalibraties = 0
  let overgeslagen = 0

  for (const cols of rows) {
    const meetmiddelId = (cols[11] ?? '').trim()
    if (!meetmiddelId) continue // sub-rij of lege rij

    const artikelnaam = (cols[1]  ?? '').trim() || null
    const afmeting    = (cols[0]  ?? '').trim() || null

    if (!artikelnaam && !afmeting) {
      overgeslagen++
      continue
    }

    const vervalDatum  = (cols[2]  ?? '').trim()
    const kalDatum     = (cols[14] ?? '').trim()
    const actief       = (cols[9]  ?? '').trim().toLowerCase() === 'ja'
    const heeftKal     = !!kalDatum

    const body = {
      voorraadId:         meetmiddelId,
      artikelnaam,
      afmeting,
      merk:               (cols[12] ?? '').trim() || null,
      locatie:            (cols[10] ?? '').trim() || null,
      emailTeamleider:    (cols[5]  ?? '').trim() || null,
      actief,
      kalibratiePlicht:   actief && heeftKal,
      interneKalibratie:  !!(cols[7]  ?? '').trim(),
      externeKalibratie:  !!(cols[3]  ?? '').trim() || !!(cols[4]  ?? '').trim() || !!(cols[13] ?? '').trim(),
      diepteKalibratie:   !!(cols[3]  ?? '').trim(),
      eindmaatKalibratie: !!(cols[4]  ?? '').trim(),
      ringKalibratie:     !!(cols[13] ?? '').trim(),
      interval:           calcInterval(kalDatum, vervalDatum),
    }

    let created
    try {
      created = await createTool(token, body)
      aangemaakt++
    } catch (err) {
      console.error(`✗ Fout bij ${meetmiddelId} (${artikelnaam ?? afmeting}): ${err.message}`)
      overgeslagen++
      continue
    }

    // Hoofd-rij kalibratie
    const hoofdDatum = parseDate(kalDatum)
    const hoofdDoor  = (cols[15] ?? '').trim() || null
    if (hoofdDatum) {
      await addCalibration(token, created.id, hoofdDatum, hoofdDoor)
      kalibraties++
    }

    // Sub-rij kalibraties
    const extra = subRows.get(meetmiddelId) ?? []
    for (const { datum, door } of extra) {
      await addCalibration(token, created.id, datum, door)
      kalibraties++
    }
  }

  console.log('')
  console.log(`✓ ${aangemaakt} meetmiddelen aangemaakt`)
  console.log(`✓ ${kalibraties} kalibratie-records toegevoegd`)
  if (overgeslagen > 0) {
    console.log(`✗ ${overgeslagen} overgeslagen (geen artikelnaam én geen afmeting, of fout)`)
  }
}

main().catch(err => {
  console.error('Fatale fout:', err.message)
  process.exit(1)
})
