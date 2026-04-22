/**
 * CNC Agent — Dutch Shape MES
 *
 * Haalt automatisch TOOL.T bestanden op van Heidenhain CNC-machines
 * via TNCcmd.exe en stuurt ze naar de MES backend.
 *
 * Gebruik:
 *   node --env-file=.env cnc-agent.js          → draait continu op interval
 *   node --env-file=.env cnc-agent.js --once   → eenmalige sync, dan afsluiten
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'http'

const execFileAsync = promisify(execFile)

// ── Configuratie (uit .env) ───────────────────────────────────────────────────

const TNCCMD       = process.env.TNCCMD_PATH    ?? 'C:\\Program Files (x86)\\HEIDENHAIN\\TNCremo\\TNCcmd.exe'
const BACKEND_URL  = (process.env.BACKEND_URL   ?? 'http://localhost:3000').replace(/\/$/, '')
const USERNAME     = process.env.ADMIN_USERNAME
const PASSWORD     = process.env.ADMIN_PASSWORD
const INTERVAL_MIN = parseInt(process.env.SYNC_INTERVAL_MIN ?? '30', 10)
const TIMEOUT_MS   = parseInt(process.env.TNCCMD_TIMEOUT_MS ?? '30000', 10)
const AGENT_PORT   = parseInt(process.env.AGENT_PORT ?? '3099', 10)

if (!USERNAME || !PASSWORD) {
  console.error('❌  ADMIN_USERNAME en ADMIN_PASSWORD zijn verplicht in .env')
  process.exit(1)
}

if (!existsSync(TNCCMD)) {
  console.error(`❌  TNCcmd.exe niet gevonden op: ${TNCCMD}`)
  console.error('   Pas TNCCMD_PATH aan in .env')
  process.exit(1)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

let token = null
let tokenExpiry = 0

async function authenticate() {
  if (token && Date.now() < tokenExpiry) return

  const res = await fetch(`${BACKEND_URL}/api/admin/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: USERNAME, password: PASSWORD }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Inloggen mislukt: ${err.error ?? res.status}`)
  }

  const data = await res.json()
  token       = data.token
  tokenExpiry = Date.now() + 7 * 60 * 60 * 1000  // ververs na 7 uur (token loopt na 8u af)
  console.log('🔐 Ingelogd bij backend')
}

// ── Machines ophalen ──────────────────────────────────────────────────────────

async function getCncMachines() {
  const res = await fetch(`${BACKEND_URL}/api/kiosk/cnc/machines`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Machines ophalen mislukt: HTTP ${res.status}`)
  return res.json()
}

// ── TNCcmd aanroepen ──────────────────────────────────────────────────────────

/**
 * Voert TNCcmd uit met de opgegeven IP en commando.
 * Command wordt als één argument doorgegeven (zoals getest door gebruiker):
 *   TNCcmd.exe -i 192.168.1.205 "GET TOOL.T C:\Temp\TOOL.T"
 */
async function runTncCmd(ip, command) {
  return execFileAsync(TNCCMD, ['-i', ip, command], {
    timeout: TIMEOUT_MS,
    windowsHide: true,
  })
}

// ── TOOL.T ophalen en uploaden ────────────────────────────────────────────────

async function syncToolTable(machine) {
  const { id, name, cncIpAddress: ip } = machine
  const tempDir  = join(tmpdir(), 'cnc-agent')
  const tempFile = join(tempDir, `TOOL_${id}.T`)

  // Zorg dat temp map bestaat
  await mkdir(tempDir, { recursive: true })

  try {
    // TNCcmd aanroepen — zelfde formaat als handmatig getest
    const command = `GET TOOL.T ${tempFile}`
    console.log(`   📥  TNCcmd: -i ${ip} "${command}"`)

    await runTncCmd(ip, command)

    // Bestand lezen
    const content = await readFile(tempFile)
    if (!content.length) throw new Error('Leeg bestand ontvangen')

    // Uploaden naar backend
    const form = new FormData()
    form.append('file', new Blob([content], { type: 'text/plain' }), 'TOOL.T')

    const res = await fetch(`${BACKEND_URL}/api/kiosk/cnc/machines/${id}/upload-tool-file`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
      body:    form,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }

    const result = await res.json()
    console.log(`   ✅  ${result.toolsCount} tools geladen voor ${name}`)
    return { ok: true, toolsCount: result.toolsCount }

  } catch (err) {
    // Exit code 5 = machine niet bereikbaar
    const offline = err.code === 5 || (err.message ?? '').includes('No connection')
    if (offline) {
      console.log(`   ⚠️   ${name} (${ip}): niet bereikbaar (offline?)`)
    } else {
      console.error(`   ❌  ${name} (${ip}): ${err.message}`)
    }
    return { ok: false, offline, error: err.message }

  } finally {
    try { await unlink(tempFile) } catch { /* ignore */ }
  }
}

// ── Hoofd sync loop ───────────────────────────────────────────────────────────

async function syncAll() {
  console.log(`\n🔄  Sync gestart: ${new Date().toLocaleString('nl-NL')}`)

  try {
    await authenticate()
    const machines = await getCncMachines()

    if (!machines.length) {
      console.log('⚠️   Geen CNC-machines gevonden in het MES')
      return
    }

    const withIp = machines.filter(m => m.cncIpAddress)
    console.log(`📋  ${machines.length} machine(s) gevonden, ${withIp.length} met IP-adres\n`)

    const results = []
    for (const machine of withIp) {
      console.log(`🔌  ${machine.name}  (${machine.cncIpAddress})`)
      const result = await syncToolTable(machine)
      results.push({ machine: machine.name, ...result })
    }

    // Samenvatting
    const ok      = results.filter(r => r.ok).length
    const offline = results.filter(r => r.offline).length
    const errors  = results.filter(r => !r.ok && !r.offline).length
    console.log(`\n📊  Klaar: ${ok} geslaagd, ${offline} offline, ${errors} fout(en)`)

  } catch (err) {
    console.error(`❌  Sync mislukt: ${err.message}`)
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

const runOnce = process.argv.includes('--once')

let syncInProgress = false

async function syncAllGuarded() {
  if (syncInProgress) {
    console.log('⏭️   Sync overgeslagen — vorige sync nog bezig')
    return
  }
  syncInProgress = true
  try {
    await syncAll()
  } finally {
    syncInProgress = false
  }
}

if (runOnce) {
  await syncAll()
  process.exit(0)
} else {
  console.log(`🚀  CNC Agent gestart — sync elke ${INTERVAL_MIN} minuten`)
  console.log(`    Backend:    ${BACKEND_URL}`)
  console.log(`    TNCcmd:     ${TNCCMD}`)
  console.log(`    HTTP poort: ${AGENT_PORT}\n`)

  // HTTP server voor on-demand sync vanuit de MES kiosk
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'POST' && req.url === '/sync') {
      syncAllGuarded()  // fire-and-forget
      res.end(JSON.stringify({ ok: true, message: 'Sync gestart' }))
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Not found' }))
    }
  })

  server.listen(AGENT_PORT, '0.0.0.0', () => {
    console.log(`🌐  HTTP trigger actief op poort ${AGENT_PORT}`)
  })

  await syncAllGuarded()
  setInterval(syncAllGuarded, INTERVAL_MIN * 60 * 1000)
}
