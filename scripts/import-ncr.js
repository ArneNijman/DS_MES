// Eenmalige import van NCR-records vanuit FileMaker TAB-export
// Gebruik: node scripts/import-ncr.js

import fs from 'fs'

// ── Configuratie ────────────────────────────────────────────────────────────
const BACKEND_URL    = 'http://localhost:3000/api'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = '%vw84zQ6tObWrAmj'
const FILE_PATH      = 'C:\\Users\\ArneNijman\\Documents\\FIlemaker export\\NCR export\\MES\\NCR_in_ex.tab'
// ────────────────────────────────────────────────────────────────────────────

// Kolom-indeling (18 kolommen, geen header-rij)
const COL = {
  ncrId:               0,
  productionOrder:     1,
  itemRef:             2,
  itemName:            3,
  description:         4,
  faultCode:           5,
  causingDepartment:   6,
  writtenByName:       7,
  status:              8,
  solution:            9,
  dispositionType:    10,
  shortDescription:   11,
  causeCode:          12,
  writtenByDepartment:13,
  datumAangemaakt:    14,
  datumUitgevoerd:    15,
  peEmail:            16,  // MailPE → peEmail
  uitgevoerdDoor:     17,  // naam → changedByName in statuslog
}

// D-M-YYYY of DD-MM-YYYY → ISO-string (of null)
function parseDate(raw) {
  if (!raw) return null
  const parts = (raw ?? '').trim().split('-')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`
}

function normalizeStatus(raw) {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'in behandeling') return 'in_behandeling'
  if (s === 'gesloten')       return 'gesloten'
  if (s === 'vervallen')      return 'vervallen'
  if (s === 'in uitvoering')  return 'in_uitvoering'
  if (s === 'gereed')         return 'gereed'
  return 'open'
}

function col(cols, idx) {
  return (cols[idx] ?? '').trim() || null
}

async function login() {
  const res = await fetch(`${BACKEND_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login mislukt: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

async function importRecords(token, records) {
  const res = await fetch(`${BACKEND_URL}/admin/ncr/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ records }),
  })
  if (!res.ok) throw new Error(`Import mislukt: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Bestand niet gevonden: ${FILE_PATH}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(FILE_PATH, 'utf-8')
  const lines = raw.split('\n').map(l => l.split('\t'))

  const records = []
  let overgeslagen = 0

  for (const cols of lines) {
    const ncrId = (cols[COL.ncrId] ?? '').trim()
    if (!ncrId || !ncrId.startsWith('NCR_')) {
      overgeslagen++
      continue
    }

    records.push({
      ncrId,
      productionOrder:     col(cols, COL.productionOrder),
      itemRef:             col(cols, COL.itemRef),
      itemName:            col(cols, COL.itemName),
      description:         col(cols, COL.description),
      faultCode:           col(cols, COL.faultCode),
      causingDepartment:   col(cols, COL.causingDepartment),
      writtenByName:       col(cols, COL.writtenByName),
      status:              normalizeStatus(cols[COL.status]),
      solution:            col(cols, COL.solution),
      dispositionType:     col(cols, COL.dispositionType),
      shortDescription:    col(cols, COL.shortDescription),
      causeCode:           col(cols, COL.causeCode),
      writtenByDepartment: col(cols, COL.writtenByDepartment),
      peEmail:             col(cols, COL.peEmail),
      uitgevoerdDoor:      col(cols, COL.uitgevoerdDoor),
      createdAt:           parseDate(cols[COL.datumAangemaakt]),
      closedAt:            parseDate(cols[COL.datumUitgevoerd]),
    })
  }

  console.log(`${records.length} records gelezen, ${overgeslagen} overgeslagen (geen NCR_-ID)`)
  console.log('Inloggen...')
  const token = await login()
  console.log('Ingelogd.\n')

  // Stuur in één batch
  const { processed, logs } = await importRecords(token, records)

  console.log(`✓ ${processed} NCR-records verwerkt (ingevoegd of bijgewerkt)`)
  console.log(`✓ ${logs} statuslog-entries aangemaakt`)
}

main().catch(err => {
  console.error('Fatale fout:', err.message)
  process.exit(1)
})
