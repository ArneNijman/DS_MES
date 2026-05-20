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
import { readFile, writeFile, unlink, mkdir, stat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'http'
import net from 'net'

const execFileAsync = promisify(execFile)

// ── Configuratie (uit .env) ───────────────────────────────────────────────────

const TNCCMD           = process.env.TNCCMD_PATH              ?? 'C:\\Program Files (x86)\\HEIDENHAIN\\TNCremo\\TNCcmd.exe'
const BACKEND_URL      = (process.env.BACKEND_URL             ?? 'http://localhost:3000').replace(/\/$/, '')
const USERNAME         = process.env.ADMIN_USERNAME
const PASSWORD         = process.env.ADMIN_PASSWORD
const INTERVAL_MIN     = parseInt(process.env.SYNC_INTERVAL_MIN         ?? '30', 10)
const TIMEOUT_MS       = parseInt(process.env.TNCCMD_TIMEOUT_MS         ?? '30000', 10)
const AGENT_PORT       = parseInt(process.env.AGENT_PORT                ?? '3099', 10)
const WINTOOL_DB_PATH  = process.env.WINTOOL_DB_PATH          ?? null
const STATE_POLL_MS    = parseInt(process.env.CNC_STATE_POLL_INTERVAL_MS ?? '10000', 10)
const STATE_POLL_ENABLED = (process.env.CNC_STATE_POLL_ENABLED ?? 'true') === 'true'
const STARTUP_GRACE_MS = parseInt(process.env.STARTUP_GRACE_MS ?? String(10 * 60 * 1000), 10)

const agentStartTime = Date.now()

// TNCremo logboek — pad naar de Logbook map (per PC anders; standaard %TEMP%\TNCremo\Logbook)
const LOGBOOK_DIR     = process.env.TNCREMO_LOGBOOK_PATH
  ?? join(process.env.TEMP ?? process.env.TMP ?? tmpdir(), 'TNCremo', 'Logbook')
const LOGBOOK_ENABLED = (process.env.TNCREMO_LOGBOOK_ENABLED ?? 'false') === 'true'
const LOGBOOK_POLL_MS = parseInt(process.env.TNCREMO_POLL_INTERVAL_MS ?? '60000', 10)

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

    // Spindeluren uitlezen en opslaan (read-only via LSV2)
    const spindleHours = await readSpindleHours(machine).catch(() => null)
    if (spindleHours !== null) {
      await fetch(`${BACKEND_URL}/api/admin/machines/${id}/cnc-metrics`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ spindleHours }),
      }).catch(err => console.error(`   ⚠️   Spindeluren opslaan mislukt: ${err.message}`))
      console.log(`   🔄  Spindeluren: ${spindleHours}u`)
    }

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

// ── WinTool sync ──────────────────────────────────────────────────────────────

let lastWintoolMtime = 0

async function syncWintoolIfChanged({ force = false } = {}) {
  if (!WINTOOL_DB_PATH) return null

  let mtimeMs
  try {
    ;({ mtimeMs } = await stat(WINTOOL_DB_PATH))
  } catch {
    const err = new Error(`WinTool bestand niet gevonden: ${WINTOOL_DB_PATH}`)
    console.error(`   ❌  ${err.message}`)
    throw err
  }

  if (!force && mtimeMs <= lastWintoolMtime) {
    console.log(`   ⏭️   WinTool ongewijzigd`)
    return { ok: true, unchanged: true }
  }

  console.log(`   📤  WinTool gewijzigd — uploaden naar backend…`)
  const content = await readFile(WINTOOL_DB_PATH)

  const form = new FormData()
  form.append('file', new Blob([content], { type: 'application/octet-stream' }), 'wintool.db')

  const res = await fetch(`${BACKEND_URL}/api/admin/cnc/sync-wintool`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  const result = await res.json()
  lastWintoolMtime = mtimeMs
  console.log(`   ✅  WinTool gesynchroniseerd: ${result.items} items, ${result.assemblies} samenstellingen`)
  return result
}

// ── LSV2 protocol (Heidenhain, poort 19000) ───────────────────────────────────
//
// LSV2 is het read-only communicatieprotocol van Heidenhain (zelfde als TNCremo
// gebruikt voor de statusbalk). Volledig read-only — er wordt niets naar de
// machine geschreven.
//
// Telegram-formaat: [type:2 BE][length:2 BE][data:length bytes]
//   type 0x0000 = T_CMD (client→machine)
//   type 0x0001 = T_ANS (machine→client, OK)
//   type 0x0002 = T_ERR (machine→client, fout)

const LSV2_PORT = 19000

function lsv2Tgm(cmd) {
  const data = Buffer.from(cmd, 'latin1')
  const hdr  = Buffer.alloc(4)
  hdr.writeUInt16BE(0, 0)
  hdr.writeUInt16BE(data.length, 2)
  return Buffer.concat([hdr, data])
}

/**
 * Verbindt met een Heidenhain machine via LSV2, logt in (geen wachtwoord),
 * stuurt één commando en retourneert de response-payload als Buffer.
 * Gooit een Error als de verbinding mislukt, timeout optreedt, of de machine
 * een T_ERR teruggeeft.
 */
function lsv2Command(ip, command, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket  = new net.Socket()
    let   rxBuf   = Buffer.alloc(0)
    let   phase   = 0   // 0 = wacht op login-ack, 1 = wacht op command-ack
    let   settled = false

    const done = (fn, val) => {
      if (settled) return
      settled = true
      socket.destroy()
      fn(val)
    }

    socket.setTimeout(timeoutMs)
    socket.connect(LSV2_PORT, ip, () => socket.write(lsv2Tgm('LOGN\0')))

    socket.on('data', chunk => {
      rxBuf = Buffer.concat([rxBuf, chunk])
      while (rxBuf.length >= 4) {
        const type = rxBuf.readUInt16BE(0)
        const len  = rxBuf.readUInt16BE(2)
        if (rxBuf.length < 4 + len) break
        const payload = rxBuf.slice(4, 4 + len)
        rxBuf = rxBuf.slice(4 + len)

        if (phase === 0) {
          if (type === 2) return done(reject, new Error('LSV2 login geweigerd'))
          phase = 1
          socket.write(lsv2Tgm(command + '\0'))
        } else {
          if (type === 2) return done(reject, new Error(`LSV2 ${command} fout`))
          done(resolve, payload)
        }
      }
    })

    socket.on('timeout', () => done(reject, new Error('LSV2 timeout')))
    socket.on('error',   err => done(reject, err))
    socket.on('close',   ()  => done(reject, new Error('LSV2 verbinding verbroken door machine')))
  })
}

// ── Machine state polling ─────────────────────────────────────────────────────

/** @type {Map<string, { online: boolean; program: string|null; pgmState: number|null; tool: number|null; alarm: boolean; spindleRunning: boolean|null }>} */
const machineState = new Map()

/**
 * Backoff tracking voor offline machines.
 * Na elke mislukte poll wordt de wachttijd verdubbeld (max 5 min).
 * @type {Map<string, { failCount: number; nextPollAt: number }>}
 */
const machineBackoff = new Map()

// ── LSV2 R_RI constanten (pyLSV2) ─────────────────────────────────────────────
const LSV2_A_LGINSPECT = Buffer.from('00000008415f4c47494e5350454354 00'.replace(/\s/g,''), 'hex')
const LSV2_C_CC_03     = Buffer.from('00000002435f434300 03'.replace(/\s/g,''), 'hex')
const LSV2_C_CC_06     = Buffer.from('00000002435f434300 06'.replace(/\s/g,''), 'hex')

// PgmState enum (pyLSV2): 0=STARTED 1=STOPPED 2=FINISHED 3=CANCELLED 4=INTERRUPTED 5=ERROR 6=ERROR_CLEARED 7=IDLE
const PGM_STATE_STARTED = 0
const PGM_STATE_ERROR   = 5

function mkRRI(paramId) {
  const hdr = Buffer.alloc(4); hdr.writeUInt16BE(0, 0); hdr.writeUInt16BE(2, 2)
  const p = Buffer.alloc(2);   p.writeUInt16BE(paramId, 0)
  return Buffer.concat([hdr, Buffer.from('R_RI', 'latin1'), p])
}

/** TCP-ping: kan de poort bereikt worden? Gebruikt als fallback als LSV2 faalt. */
function tcpPing(ip, port, timeoutMs = 2000) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(timeoutMs)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('error',   () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

/**
 * Leest machine-staat via LSV2 R_RI (geen DNC-licentie nodig).
 * Geeft { online, program, pgmState, alarm, tool, spindleRunning } of null bij offline.
 */
async function readMachineState(machine) {
  return new Promise(resolve => {
    const ip = machine.cncIpAddress
    const s  = new net.Socket()
    let rxBuf = Buffer.alloc(0)
    let step = 0
    let program = null, pgmState = null
    let timer

    const commands = [
      LSV2_A_LGINSPECT,
      LSV2_C_CC_03,
      LSV2_C_CC_06,
      mkRRI(23),  // EXEC_STATE
      mkRRI(24),  // SELECTED_PGM
      mkRRI(26),  // PGM_STATE
    ]

    const finish = (online) => {
      clearTimeout(timer)
      s.destroy()
      if (!online) return resolve(null)
      resolve({ online: true, program, pgmState, tool: null, alarm: pgmState === PGM_STATE_ERROR, spindleRunning: null })
    }

    const sendNext = () => {
      if (step >= commands.length) return finish(true)
      s.write(commands[step++])
      clearTimeout(timer)
      timer = setTimeout(() => finish(true), 1500)
    }

    s.setTimeout(Math.min(TIMEOUT_MS, 3000))
    s.connect(LSV2_PORT, ip, () => sendNext())

    s.on('data', chunk => {
      rxBuf = Buffer.concat([rxBuf, chunk])
      clearTimeout(timer)
      timer = setTimeout(() => {
        const body = rxBuf.slice(4)
        const cmd  = body.slice(0, 4).toString('latin1')
        if (cmd === 'S_RI') {
          const cmdIdx = step - 1
          if (cmdIdx === 4) {
            // SELECTED_PGM — null-terminated path na S_RI + eventuele padding-bytes
            const data = body.slice(4)
            let start = 0
            while (start < data.length && data[start] === 0) start++
            if (start < data.length) {
              const raw = data.slice(start).toString('latin1')
              const end = raw.indexOf('\0')
              const path = (end >= 0 ? raw.slice(0, end) : raw).trim()
              if (path.length > 0) program = path
            }
          } else if (cmdIdx === 5) {
            // PGM_STATE — 2-byte uint16 na S_RI
            if (body.length >= 6) pgmState = body.readUInt16BE(4)
          }
        }
        rxBuf = Buffer.alloc(0)
        sendNext()
      }, 200)
    })

    s.on('error',   () => finish(false))
    s.on('timeout', () => finish(false))
    s.on('close',   () => { if (!s.destroyed) finish(true) })
  })
}

async function readSpindleHours(_machine) {
  return null  // Niet meer nodig — spindeluren worden bijgehouden via programma-looptijden
}

// ── Spindeluren via programma-looptijd tracking ───────────────────────────────
// Cache: machineId → huidige cumulatieve uren (geseeded vanuit backend)
const spindleHoursCache = new Map()

// Bijhouden wanneer een programma gestart is: machineId → Date.now()
const programRunStartAt = new Map()

// Run ID van de lopende programma-run: machineId → uuid (om later te PATCHen)
const programRunId = new Map()

async function seedSpindleHours(machineId) {
  if (spindleHoursCache.has(machineId)) return
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/machines/${machineId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { spindleHoursCache.set(machineId, 0); return }
    const data = await res.json()
    spindleHoursCache.set(machineId, parseFloat(data.spindleHours ?? '0') || 0)
  } catch {
    spindleHoursCache.set(machineId, 0)
  }
}

async function addSpindleRunTime(machine, durationMs) {
  await seedSpindleHours(machine.id)
  const addedHours = durationMs / 3_600_000
  const newTotal   = (spindleHoursCache.get(machine.id) ?? 0) + addedHours
  spindleHoursCache.set(machine.id, newTotal)
  const rounded = Math.round(newTotal * 100) / 100
  await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-metrics`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ spindleHours: rounded }),
  }).catch(err => console.error(`   ⚠️   Spindeluren opslaan mislukt: ${err.message}`))
  console.log(`   ⏱️   ${machine.name}: +${(addedHours * 60).toFixed(1)}min looptijd → ${rounded}u totaal`)
}

// ── TNCremo logboek parser ────────────────────────────────────────────────────
//
// TNCremo schrijft machine-events naar %TEMP%\TNCremo\Logbook\.
// Eén bestand bevat events van alle verbonden machines.
//
// We lezen alleen nieuwe content via byte-positie tracking (geen bestandswijziging
// nodig, geen race-condition met TNCremo die tegelijk schrijft).

const logbookPosFile = join(tmpdir(), 'cnc-agent', 'logbook-pos.json')
let   logbookPositions = {}   // { filename: byteOffset }
let   logbookLastActivity = 0 // epoch ms — laatste keer dat nieuwe content gevonden werd
let   logbookWarnedStale  = false

async function loadLogbookPositions() {
  try {
    logbookPositions = JSON.parse(await readFile(logbookPosFile, 'utf8'))
  } catch {
    logbookPositions = {}
  }
}

async function saveLogbookPositions() {
  await mkdir(join(tmpdir(), 'cnc-agent'), { recursive: true })
  await writeFile(logbookPosFile, JSON.stringify(logbookPositions), 'utf8')
}

/** 0xC0A801B3 → "192.168.1.179" */
function hexToIp(hex) {
  const n = parseInt(hex, 16)
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF].join('.')
}

/**
 * "06:28:01 Tue May 19 2026" → ISO-string.
 * new Date() accepteert "Tue May 19 2026 06:28:01" maar niet de TNCremo volgorde.
 */
function parseLogTimestamp(s) {
  const m = (s ?? '').trim().match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/)
  if (m) {
    try { return new Date(`${m[2]} ${m[1]}`).toISOString() } catch { /* fall through */ }
  }
  return new Date().toISOString()
}

/** Extraheert timestamp uit de rechterkant van een logboek-regel. */
function extractLogTimestamp(line) {
  const m = line.match(/(\d{2}:\d{2}:\d{2}\s+\w+\s+\w+\s+\d+\s+\d{4})\s*$/)
  return m ? parseLogTimestamp(m[1]) : null
}

// Alarm codes die geen productierelevante informatie bevatten en gefilterd worden
const IGNORED_ALARM_CODES = new Set([
  'N938',   // Toets zonder functie — toetsdruk in verkeerde modus, geen alarm
  'P99',    // Melding in PLC venster — periodiek PLC-statusbericht (Fooke), geen storing
])

/**
 * Parseert TNCremo logboek-content en retourneert gevonden events.
 * Machine-IP wordt afgeleid uit "Info: REMO A_LG" regels (verbinding met machine).
 *
 * Ondersteunde controllers:
 *  - iTNC 530 (MTE 4200): Error/ERRCLEARED/Reset/MAIN START/CTRL REG
 *  - TNC 640 Ronin: bovenstaande + Stib: ON/OFF + Info: MAIN PGMEND
 *
 * @param {string} content
 * @returns {{ machineIp: string|null, eventType: string, occurredAt: string, data?: object }[]}
 */
function parseLogbookContent(content) {
  const lines = content.split('\n')
  const events = []
  let currentMachineIp = null
  let i = 0

  // Deduplicatie: zelfde alarm van zelfde machine binnen 5 min → overslaan
  // Voorkomt dat een persistente fout honderden identieke events oplevert.
  const recentAlarmTs = new Map()  // key: `${ip}:${msg}` → ISO-timestamp

  const isDuplicateAlarm = (ip, msg, ts) => {
    const key  = `${ip ?? ''}:${msg}`
    const last = recentAlarmTs.get(key)
    if (last && (new Date(ts) - new Date(last)) < 5 * 60 * 1000) return true
    recentAlarmTs.set(key, ts)
    return false
  }

  /** Leest alle ingesprongen regels na de huidige positie als één blok. */
  const readBlock = (startIdx) => {
    const block = []
    let j = startIdx
    while (j < lines.length && (lines[j].trim() === '' || /^\s/.test(lines[j]))) {
      block.push(lines[j].trim())
      j++
    }
    return { block, endIdx: j }
  }

  while (i < lines.length) {
    const line    = lines[i]
    const trimmed = line.trim()

    if (!trimmed || /^_+Date:/.test(trimmed)) { i++; continue }

    // Key: → operator-toetsdruk, negeren
    if (/^Key:/.test(trimmed)) { i++; continue }

    // Info: SOKY / Info: PLC → intern TNCremo-bericht, negeren
    if (/^Info:\s+(SOKY|PLC)\b/.test(trimmed)) {
      i++; if (/^\s/.test(lines[i] ?? '')) i++; continue
    }

    // REMO A_LG → TNCremo verbindt met machine; achterhaal IP
    if (/^Info:\s+REMO\s+A_LG/.test(trimmed)) {
      const next = lines[i + 1]?.trim() ?? ''
      const m = next.match(/Addr:(0x[0-9a-fA-F]+)/)
      if (m) currentMachineIp = hexToIp(m[1])
      i += 2; continue
    }

    // Stib: ON → PROGRAM_STARTED (TNC 640)
    // Vlak daarna volgt "Info: MAIN PGM" met de programmanaam
    if (/^Stib:\s+ON/.test(trimmed)) {
      const ts = extractLogTimestamp(line)
      let programName = null
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^Info:\s+MAIN\s+PGM\b/.test(lines[j].trim())) {
          programName = lines[j + 1]?.trim() || null
          break
        }
      }
      events.push({ machineIp: currentMachineIp, eventType: 'PROGRAM_STARTED', occurredAt: ts ?? new Date().toISOString(), data: { programName } })
      i++; continue
    }

    // Stib: OFF / BLINK → aankondiging; echte stop wordt via PGMEND verwerkt
    if (/^Stib:/.test(trimmed)) { i++; continue }

    // Info: MAIN PGMEND → PROGRAM_STOPPED (TNC 640)
    // TNCremo logt twee PGMEND blokken: eerste met hex, tweede met "Stop reason:"
    if (/^Info:\s+MAIN\s+PGMEND/.test(trimmed)) {
      const ts = extractLogTimestamp(line)
      const { block, endIdx } = readBlock(i + 1)
      i = endIdx
      const reasonLine = block.find(l => l.startsWith('Stop reason:'))
      if (reasonLine) {
        const reason = reasonLine.replace(/^Stop reason:\s*/, '').trim()
        events.push({ machineIp: currentMachineIp, eventType: 'PROGRAM_STOPPED', occurredAt: ts ?? new Date().toISOString(), data: { reason } })
      }
      continue
    }

    // Error: → ALARM_TRIGGERED
    if (/^Error:/.test(trimmed)) {
      const ts  = extractLogTimestamp(line)
      const msg = lines[i + 1]?.trim() ?? ''
      const codeMatch = msg.match(/^([A-Z]\d+)\b/)
      const isIgnored = codeMatch && IGNORED_ALARM_CODES.has(codeMatch[1])
      const occurredAt = ts ?? new Date().toISOString()
      if (!isIgnored && !isDuplicateAlarm(currentMachineIp, msg, occurredAt)) {
        events.push({ machineIp: currentMachineIp, eventType: 'ALARM_TRIGGERED', occurredAt, data: { message: msg } })
      }
      i++; if (/^\s/.test(lines[i] ?? '')) i++; continue
    }

    // MAIN ERRCLEARED → ALARM_CLEARED
    if (/^Info:\s+MAIN\s+ERRCLEARED/.test(trimmed)) {
      const ts  = extractLogTimestamp(line)
      const msg = lines[i + 1]?.trim() ?? ''
      const codeMatch = msg.match(/^([A-Z]\d+)\b/)
      if (!(codeMatch && IGNORED_ALARM_CODES.has(codeMatch[1]))) {
        events.push({ machineIp: currentMachineIp, eventType: 'ALARM_CLEARED', occurredAt: ts ?? new Date().toISOString() })
      }
      i++; if (/^\s/.test(lines[i] ?? '')) i++; continue
    }

    // CTRL REG → EMERGENCY STOP als ALARM_TRIGGERED
    if (/^Info:\s+CTRL\s+REG/.test(trimmed)) {
      const ts   = extractLogTimestamp(line)
      const next = lines[i + 1]?.trim() ?? ''
      if (/EMERGENCY STOP/i.test(next)) {
        events.push({ machineIp: currentMachineIp, eventType: 'ALARM_TRIGGERED', occurredAt: ts ?? new Date().toISOString(), data: { message: next } })
      }
      i += 2; continue
    }

    // Reset → MACHINE_OFFLINE (herstart)
    if (/^Reset/.test(trimmed)) {
      const ts = extractLogTimestamp(line)
      events.push({ machineIp: currentMachineIp, eventType: 'MACHINE_OFFLINE', occurredAt: ts ?? new Date().toISOString(), data: { reason: 'reset' } })
      i++; continue
    }

    // MAIN START → MACHINE_ONLINE (controller opgestart)
    if (/^Info:\s+MAIN\s+START/.test(trimmed)) {
      const ts = extractLogTimestamp(line)
      events.push({ machineIp: currentMachineIp, eventType: 'MACHINE_ONLINE', occurredAt: ts ?? new Date().toISOString() })
      i++; if (/^\s/.test(lines[i] ?? '')) i++; continue
    }

    i++
  }

  return events
}

/**
 * Leest alle logboekbestanden in LOGBOOK_DIR, verwerkt alleen nieuw toegevoegde
 * content en post gevonden events naar de backend.
 */
async function processLogbook(machines) {
  // IP → machine-object map
  const ipToMachine = new Map(
    machines.filter(m => m.cncIpAddress).map(m => [m.cncIpAddress, m])
  )

  let files
  try {
    files = (await readdir(LOGBOOK_DIR)).filter(f => !f.startsWith('.'))
  } catch {
    console.warn(`⚠️   TNCremo logboek map niet gevonden: ${LOGBOOK_DIR}`)
    console.warn(`     → Start TNCremo en maak verbinding met de machines om events te ontvangen`)
    return
  }

  if (files.length === 0) {
    console.warn(`⚠️   TNCremo logboek map is leeg — TNCremo heeft nog niet ingelogd op een machine`)
    console.warn(`     → Open TNCremo en maak verbinding met de machines`)
    return
  }

  let totalEvents = 0

  for (const filename of files) {
    const filepath = join(LOGBOOK_DIR, filename)
    let newContent
    let newSize

    try {
      const buf = await readFile(filepath)
      newSize = buf.length
      const lastPos = logbookPositions[filename] ?? 0

      // Bestand opnieuw aangemaakt (kleiner dan vorige pos) → reset
      if (newSize < lastPos) logbookPositions[filename] = 0

      const startPos = logbookPositions[filename] ?? 0
      if (newSize <= startPos) continue   // Geen nieuwe content

      // latin1 voor Windows-logbestanden (handelt speciale tekens veilig af)
      newContent = buf.slice(startPos).toString('latin1')
      logbookPositions[filename] = newSize
    } catch {
      continue
    }

    const parsed = parseLogbookContent(newContent)
    if (!parsed.length) continue

    for (const ev of parsed) {
      if (!ev.machineIp) {
        console.log(`   ⚠️   Logboek event zonder machine-IP (${ev.eventType}) — overgeslagen`)
        continue
      }
      const machine = ipToMachine.get(ev.machineIp)
      if (!machine) {
        console.log(`   ⚠️   Logboek: machine ${ev.machineIp} niet gevonden — overgeslagen`)
        continue
      }

      try {
        await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-events`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ events: [{ eventType: ev.eventType, occurredAt: ev.occurredAt, eventData: ev.data ?? null }] }),
        })
        console.log(`   📋  ${machine.name}: ${ev.eventType} @ ${ev.occurredAt.slice(11, 19)}`)
        totalEvents++
      } catch (err) {
        console.error(`   ❌  Logboek event posten mislukt: ${err.message}`)
      }
    }
  }

  if (totalEvents > 0) {
    console.log(`📋  Logboek: ${totalEvents} event(s) verwerkt`)
    logbookLastActivity = Date.now()
    logbookWarnedStale  = false
  } else {
    // Controleer of de logbestanden al lang niet meer zijn bijgewerkt
    const STALE_MS = Math.max(30 * 60_000, LOGBOOK_POLL_MS * 3)
    if (logbookLastActivity > 0 && Date.now() - logbookLastActivity > STALE_MS && !logbookWarnedStale) {
      const minutesAgo = Math.round((Date.now() - logbookLastActivity) / 60_000)
      console.warn(`⚠️   Logboek inactief: geen nieuwe events in de afgelopen ${minutesAgo} minuten`)
      console.warn(`     → Controleer of TNCremo verbonden is met de machines`)
      logbookWarnedStale = true
    }
  }
  await saveLogbookPositions()
}

let logbookPollInProgress = false

async function pollLogbook() {
  if (logbookPollInProgress) return
  logbookPollInProgress = true
  try {
    await authenticate()
    const machines = await getCncMachines()
    await processLogbook(machines)
  } catch (err) {
    console.error(`❌  Logboek verwerking mislukt: ${err.message}`)
  } finally {
    logbookPollInProgress = false
  }
}

/** Vergelijkt vorige en huidige staat en retourneert gegenereerde events. */
function diffState(prev, curr, machineOnline) {
  const events = []
  const now = new Date().toISOString()

  if (!prev && machineOnline) {
    // Eerste keer gezien als online
    events.push({ eventType: 'MACHINE_ONLINE', occurredAt: now })
  } else if (prev && !machineOnline) {
    events.push({ eventType: 'MACHINE_OFFLINE', occurredAt: now })
    return events
  } else if (!machineOnline) {
    return events
  }

  if (!prev) return events

  // Online → offline
  if (prev.online && !curr.online) {
    events.push({ eventType: 'MACHINE_OFFLINE', occurredAt: now })
    return events
  }
  // Offline → online
  if (!prev.online && curr.online) {
    events.push({ eventType: 'MACHINE_ONLINE', occurredAt: now })
  }

  // Programma start/stop via pgmState (R_RI) of fallback op programmanaam-wissel
  if (curr.pgmState !== null && prev.pgmState !== null) {
    const wasRunning = prev.pgmState === PGM_STATE_STARTED
    const isRunning  = curr.pgmState === PGM_STATE_STARTED
    if (!wasRunning && isRunning) {
      events.push({ eventType: 'PROGRAM_STARTED', programName: curr.program ?? null, occurredAt: now })
    } else if (wasRunning && !isRunning) {
      // pgmState 2=FINISHED (normaal einde), 1=STOPPED, 3=CANCELLED, 4=INTERRUPTED, 5=ERROR
      events.push({ eventType: 'PROGRAM_STOPPED', programName: prev.program ?? null, occurredAt: now, pgmStateAtStop: curr.pgmState })
    }
  } else if (prev.program !== curr.program) {
    if (!prev.program && curr.program) {
      events.push({ eventType: 'PROGRAM_STARTED', programName: curr.program, occurredAt: now })
    } else if (prev.program && !curr.program) {
      events.push({ eventType: 'PROGRAM_STOPPED', programName: prev.program, occurredAt: now })
    }
  }

  // Gereedschapwissel
  if (curr.tool !== null && prev.tool !== null && prev.tool !== curr.tool) {
    events.push({
      eventType:  'TOOL_CHANGED',
      eventData:  { from: prev.tool, to: curr.tool },
      programName: curr.program ?? null,
      occurredAt: now,
    })
  }

  // Alarm via pgmState (R_RI) of fallback op alarm-vlag
  if (curr.pgmState !== null && prev.pgmState !== null) {
    if (prev.pgmState !== PGM_STATE_ERROR && curr.pgmState === PGM_STATE_ERROR) {
      events.push({ eventType: 'ALARM_TRIGGERED', programName: curr.program ?? null, occurredAt: now })
    } else if (prev.pgmState === PGM_STATE_ERROR && curr.pgmState !== PGM_STATE_ERROR) {
      events.push({ eventType: 'ALARM_CLEARED', programName: curr.program ?? null, occurredAt: now })
    }
  } else {
    if (!prev.alarm && curr.alarm) {
      events.push({ eventType: 'ALARM_TRIGGERED', programName: curr.program ?? null, occurredAt: now })
    } else if (prev.alarm && !curr.alarm) {
      events.push({ eventType: 'ALARM_CLEARED', programName: curr.program ?? null, occurredAt: now })
    }
  }

  // Spindel (wachttijd-detectie — actief zodra readMachineState() spindleRunning levert)
  if (prev.spindleRunning === true && curr.spindleRunning === false && curr.program) {
    events.push({ eventType: 'SPINDLE_OFF', programName: curr.program, occurredAt: now })
  } else if (prev.spindleRunning === false && curr.spindleRunning === true) {
    events.push({ eventType: 'SPINDLE_ON', programName: curr.program ?? null, occurredAt: now })
  }

  return events
}

async function pollMachineState(machine) {
  // Backoff: sla offline machines over tot de volgende geplande retry
  const backoff = machineBackoff.get(machine.id)
  if (backoff && Date.now() < backoff.nextPollAt) return

  const prev = machineState.get(machine.id) ?? null

  let curr = null
  let online = false
  try {
    curr = await readMachineState(machine)
    online = curr !== null
  } catch {
    online = false
  }

  // LSV2 faalt maar machine is wel bereikbaar via TCP → niet als offline markeren
  if (!online && machine.cncIpAddress) {
    const reachable = await tcpPing(machine.cncIpAddress, LSV2_PORT, 2000)
    if (reachable) {
      online = true
      curr = { online: true, program: null, pgmState: null, tool: null, alarm: false, spindleRunning: null }
    }
  }

  if (online) {
    // Machine bereikbaar — reset backoff
    machineBackoff.delete(machine.id)
  } else {
    // Verdubbel wachttijd: 10s → 20s → 40s → ... max 5 min
    const failCount    = (backoff?.failCount ?? 0) + 1
    const delaySec     = Math.min(STATE_POLL_MS / 1000 * Math.pow(2, failCount - 1), 300)
    machineBackoff.set(machine.id, { failCount, nextPollAt: Date.now() + delaySec * 1000 })
  }

  const state = online
    ? { online: true, program: curr.program ?? null, pgmState: curr.pgmState ?? null, tool: curr.tool ?? null, alarm: curr.alarm ?? false, spindleRunning: curr.spindleRunning ?? null }
    : { online: false, program: null, pgmState: null, tool: null, alarm: false, spindleRunning: null }

  let events = diffState(prev, state, online)
  machineState.set(machine.id, state)

  // Onderdruk MACHINE_OFFLINE events tijdens de startup grace period (opstart-ruis)
  if (Date.now() - agentStartTime < STARTUP_GRACE_MS) {
    events = events.filter(e => e.eventType !== 'MACHINE_OFFLINE')
  }

  if (!events.length) return

  try {
    await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-events`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ events }),
    })

    // Programma-run beheren
    const startEv = events.find(e => e.eventType === 'PROGRAM_STARTED')
    const stopEv  = events.find(e => e.eventType === 'PROGRAM_STOPPED')

    if (startEv) {
      programRunStartAt.set(machine.id, Date.now())
      const pgmName = startEv.programName ?? 'onbekend'
      try {
        const res = await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-program-runs`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ programName: pgmName, startedAt: startEv.occurredAt, status: 'running' }),
        })
        if (res.ok) {
          const run = await res.json()
          if (run?.id) programRunId.set(machine.id, run.id)
        }
      } catch { /* ignore — run start niet kritiek */ }
    }
    if (stopEv) {
      const startMs = programRunStartAt.get(machine.id)
      if (startMs) {
        programRunStartAt.delete(machine.id)
        await addSpindleRunTime(machine, Date.now() - startMs).catch(() => {})
      }
      const runId = programRunId.get(machine.id)
      programRunId.delete(machine.id)
      // pgmState 2=FINISHED → completed, 4=INTERRUPTED → interrupted, 5=ERROR → error, overige → stopped
      const pgmStateAtStop = stopEv.pgmStateAtStop ?? null
      const stopStatus = pgmStateAtStop === 2 ? 'completed'
        : pgmStateAtStop === 4 ? 'interrupted'
        : pgmStateAtStop === 5 ? 'error'
        : 'stopped'
      if (runId) {
        // Update de bestaande run met echte eindtijd en duur
        await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-program-runs/${runId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ endedAt: stopEv.occurredAt, status: stopStatus }),
        }).catch(err => console.error(`   ⚠️   Run afsluiten mislukt: ${err.message}`))
      } else {
        // Geen bekende runId (agent herstart tijdens een lopend programma) — maak alsnog een entry
        await fetch(`${BACKEND_URL}/api/admin/machines/${machine.id}/cnc-program-runs`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ programName: stopEv.programName ?? 'onbekend', startedAt: stopEv.occurredAt, endedAt: stopEv.occurredAt, status: stopStatus }),
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error(`   ❌  Events posten mislukt voor ${machine.name}: ${err.message}`)
  }
}

let statePollInProgress = false

async function pollAllMachineStates() {
  if (statePollInProgress) return
  statePollInProgress = true
  try {
    await authenticate()
    const machines = await getCncMachines()
    const freesmachines = machines.filter(m => m.cncIpAddress && m.category === 'Freesmachine')
    await Promise.allSettled(freesmachines.map(m => pollMachineState(m)))
  } catch (err) {
    console.error(`❌  State poll mislukt: ${err.message}`)
  } finally {
    statePollInProgress = false
  }
}

// ── Hoofd sync loop ───────────────────────────────────────────────────────────

async function syncAll() {
  console.log(`\n🔄  Sync gestart: ${new Date().toLocaleString('nl-NL')}`)

  try {
    await authenticate()

    // WinTool sync (alleen als WINTOOL_DB_PATH is ingesteld)
    if (WINTOOL_DB_PATH) {
      console.log(`\n🗄️   WinTool:`)
      await syncWintoolIfChanged().catch(err => console.error(`   ❌  WinTool sync mislukt: ${err.message}`))
    }

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

const runOnce    = process.argv.includes('--once')
const runDiag    = process.argv.includes('--diag')

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

if (runDiag) {
  // Diagnose-modus: test TCP + LSV2 per machine zonder backend
  console.log('🔍  LSV2 diagnose-modus — geen backend nodig\n')
  await authenticate()
  const machines = await getCncMachines()
  const freesmachines = machines.filter(m => m.cncIpAddress)
  if (!freesmachines.length) {
    console.log('⚠️   Geen machines met IP-adres gevonden')
    process.exit(0)
  }

  // TCP ping: kan de poort bereikt worden?
  const tcpPing = (ip, port, timeoutMs = 2000) => new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(timeoutMs)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })

  for (const m of freesmachines) {
    console.log(`🔌  ${m.name}  (${m.cncIpAddress})`)

    // Stap 1: TCP bereikbaarheid op poort 19000
    const portOpen = await tcpPing(m.cncIpAddress, LSV2_PORT, 2000)
    if (!portOpen) {
      console.log(`    ❌  TCP poort ${LSV2_PORT} niet bereikbaar`)
      console.log(`        → Machine offline, firewall blokkeert de poort, of LSV2 uitgeschakeld`)
      console.log(`        → Controleer: ping ${m.cncIpAddress} werkt?`)
      console.log(`        → Heidenhain: MOD → Machine-parameters → Netwerk → LSV2 aanzetten`)
      console.log()
      continue
    }
    console.log(`    ✅  TCP poort ${LSV2_PORT} bereikbaar`)

    // Stap 1b: welke poorten zijn open? (helpt bepalen welk protocol beschikbaar is)
    const knownPorts = [
      { port: 19000, label: 'LSV2 / FileServer (Heidenhain)' },
      { port: 5001,  label: 'FileServer alternatief' },
      { port: 8080,  label: 'REST API (TNC 7 / nieuwere controllers)' },
      { port: 443,   label: 'HTTPS' },
      { port: 4840,  label: 'OPC-UA' },
    ]
    const openPorts = []
    for (const { port, label } of knownPorts) {
      const open = await tcpPing(m.cncIpAddress, port, 1000)
      if (open) { openPorts.push(port); console.log(`    ✅  Poort ${port} open  (${label})`) }
    }
    console.log()

    // Stap 1c: machine stuurt iets bij connect? (server-speaks-first check)
    const banner = await new Promise(resolve => {
      const s = new net.Socket()
      const chunks = []
      s.setTimeout(1500)
      s.connect(LSV2_PORT, m.cncIpAddress)
      s.on('data', d => { chunks.push(d); s.destroy() })
      s.on('timeout', () => { s.destroy(); resolve(Buffer.concat(chunks)) })
      s.on('error',   () => resolve(Buffer.concat(chunks)))
      s.on('close',   () => resolve(Buffer.concat(chunks)))
    })
    if (banner.length > 0) {
      console.log(`    📡  Machine stuurt banner bij connect (${banner.length} bytes): ${banner.toString('hex').match(/../g).join(' ')}`)
    }

    // Stap 1c: probeer alle bekende LOGN-formaten, toon welke een response geeft
    const rawSend = (data, tMs = 1500) => new Promise(resolve => {
      const s = new net.Socket()
      const chunks = []
      s.setTimeout(tMs)
      s.connect(LSV2_PORT, m.cncIpAddress, () => s.write(data))
      s.on('data', d => { chunks.push(d); s.destroy() })
      s.on('timeout', () => { s.destroy(); resolve(Buffer.concat(chunks)) })
      s.on('error',   () => resolve(Buffer.concat(chunks)))
      s.on('close',   () => resolve(Buffer.concat(chunks)))
    })

    // Helper: zelfde als lsv2Tgm maar length in little-endian
    const tgmLE = (cmd) => {
      const data = Buffer.from(cmd, 'latin1')
      const hdr  = Buffer.alloc(4)
      hdr.writeUInt16BE(0, 0)
      hdr.writeUInt16LE(data.length, 2)  // LE ipv BE
      return Buffer.concat([hdr, data])
    }
    // Volledig raw (geen header)
    const tgmRaw = (cmd) => Buffer.from(cmd, 'latin1')

    const loginFormats = [
      // Big-endian length (huidig)
      { label: 'BE  LOGN\\0              [00 00 00 05 ...]', buf: lsv2Tgm('LOGN\0') },
      { label: 'BE  LOGN\\0\\0\\0          [00 00 00 07 ...]', buf: lsv2Tgm('LOGN\0\0\0') },
      { label: 'BE  LOGN\\0INSPECT\\0\\0', buf: lsv2Tgm('LOGN\0INSPECT\0\0') },
      { label: 'BE  LOGN\\0MONITOR\\0\\0', buf: lsv2Tgm('LOGN\0MONITOR\0\0') },
      // Little-endian length
      { label: 'LE  LOGN\\0              [00 00 05 00 ...]', buf: tgmLE('LOGN\0') },
      { label: 'LE  LOGN\\0\\0\\0',                           buf: tgmLE('LOGN\0\0\0') },
      { label: 'LE  LOGN\\0INSPECT\\0\\0',                    buf: tgmLE('LOGN\0INSPECT\0\0') },
      { label: 'LE  LOGN\\0MONITOR\\0\\0',                    buf: tgmLE('LOGN\0MONITOR\0\0') },
      // Volledig raw (geen header)
      { label: 'RAW LOGN\\0 (geen header)',                   buf: tgmRaw('LOGN\0') },
    ]
    let workingFormat = null
    for (const fmt of loginFormats) {
      const resp = await rawSend(fmt.buf)
      const hex = resp.length > 0 ? resp.toString('hex').match(/../g).join(' ') : '(geen)'
      console.log(`    ${resp.length > 0 ? '✅' : '✗ '} ${fmt.label} → ${hex}`)
      if (resp.length > 0 && !workingFormat) workingFormat = fmt
    }
    if (!workingFormat) {
      console.log(`    ❌  LSV2 monitoring niet beschikbaar (DNC-licentie vereist)`)
      console.log(`    💡  Probeer logbestanden via TNCcmd (FileServer)...\n`)

      // Probeer mappen te listen om te zien wat beschikbaar is
      const dirsToCheck = ['TNC:\\', 'TNC:\\SYSLOG', 'TNC:\\LOG', 'TNC:\\prot', 'TNC:\\runtime']
      for (const dir of dirsToCheck) {
        try {
          const tempDir  = join(tmpdir(), 'cnc-agent')
          await mkdir(tempDir, { recursive: true })
          const { stdout } = await runTncCmd(m.cncIpAddress, `DIR ${dir}`)
          const lines = stdout.split('\n').filter(l => l.trim()).slice(0, 8)
          console.log(`    📁  DIR ${dir}:`)
          lines.forEach(l => console.log(`        ${l.trim()}`))
        } catch {
          console.log(`    ✗   ${dir} niet toegankelijk`)
        }
      }

      // Probeer specifieke statusbestanden te lezen
      const filesToCheck = [
        'TNC:\\SYSLOG\\SYSLOG.SYS',
        'TNC:\\prot\\errorlog.txt',
        'TNC:\\LOG\\error.log',
      ]
      for (const filePath of filesToCheck) {
        const tempFile = join(tmpdir(), 'cnc-agent', `diag_${Date.now()}.tmp`)
        try {
          await runTncCmd(m.cncIpAddress, `GET ${filePath} ${tempFile}`)
          const content = await readFile(tempFile, 'utf8').catch(() => readFile(tempFile, 'latin1'))
          console.log(`\n    📄  ${filePath} (eerste 5 regels):`)
          content.split('\n').slice(0, 5).forEach(l => console.log(`        ${l}`))
          await unlink(tempFile).catch(() => {})
        } catch {
          console.log(`    ✗   ${filePath} niet beschikbaar`)
        }
      }
      console.log()
      continue
    }
    console.log(`    → Werkend formaat: ${workingFormat.label}`)

    // Stap 2: LSV2 login + R_RI (met echte foutmelding)
    let state = null
    try {
      const data = await lsv2Command(m.cncIpAddress, 'R_RI', 3000)
      if (data.length >= 272) {
        const progStatus = data.readInt32LE(4)
        const pgmName    = data.slice(8, 264).toString('latin1').replace(/\0.*$/, '').trim()
        const toolNr     = data.readInt32LE(264)
        const errCode    = data.readInt32LE(268)
        state = { program: progStatus > 0 && pgmName ? pgmName : null, tool: toolNr > 0 ? toolNr : null, alarm: errCode !== 0 }
      } else {
        state = { program: null, tool: null, alarm: false }
      }
    } catch (err) {
      console.log(`    ❌  LSV2 protocol fout: ${err.message}`)
      console.log(`        → Controleer of het LSV2-wachtwoord leeg is op de controller`)
      console.log(`        → Heidenhain: MOD → Machine-parameters → Wachtwoorden`)
      console.log()
      continue
    }
    console.log(`    ✅  LSV2 R_RI OK`)
    console.log(`    Programma : ${state.program ?? '(geen actief programma)'}`)
    console.log(`    Tool      : ${state.tool ?? '(geen)'}`)
    console.log(`    Alarm     : ${state.alarm ? '⚠️  JA' : 'nee'}`)

    // Stap 3: R_OT (spindeluren)
    const hours = await readSpindleHours(m)
    if (hours !== null) {
      console.log(`    Spindel   : ${hours} uur  (R_OT OK)`)
    } else {
      console.log(`    Spindel   : (R_OT niet beschikbaar op deze controller)`)
    }
    console.log()
  }
  process.exit(0)
} else if (runOnce) {
  await syncAll()
  process.exit(0)
} else {
  console.log(`🚀  CNC Agent gestart — sync elke ${INTERVAL_MIN} minuten`)
  console.log(`    Backend:    ${BACKEND_URL}`)
  console.log(`    TNCcmd:     ${TNCCMD}`)
  console.log(`    HTTP poort: ${AGENT_PORT}\n`)

  // HTTP server voor on-demand sync vanuit de MES kiosk
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'POST' && req.url === '/sync') {
      syncAllGuarded()  // fire-and-forget
      res.end(JSON.stringify({ ok: true, message: 'Sync gestart' }))

    } else if (req.method === 'POST' && req.url === '/sync-wintool') {
      if (!WINTOOL_DB_PATH) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'WINTOOL_DB_PATH niet ingesteld in .env' }))
      } else {
        try {
          await authenticate()
          const result = await syncWintoolIfChanged({ force: true })
          res.end(JSON.stringify(result))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      }

    } else if (req.method === 'POST' && req.url === '/send-nc-file') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        try {
          const { ip, articleNo, bewerkingNr, fileName, fileContent } = JSON.parse(body)
          if (!ip || !articleNo || !bewerkingNr || !fileName || !fileContent) {
            res.statusCode = 400
            return res.end(JSON.stringify({ error: 'ip, articleNo, bewerkingNr, fileName en fileContent zijn verplicht' }))
          }

          const tempDir  = join(tmpdir(), 'cnc-agent')
          await mkdir(tempDir, { recursive: true })
          const tempFile = join(tempDir, `send_${Date.now()}.h`)

          try {
            await writeFile(tempFile, fileContent, 'utf8')

            const rootPath  = `Program`
            const artPath   = `${rootPath}\\${articleNo}`
            const stepPath  = `${artPath}\\Bewerking ${bewerkingNr}`
            const destPath  = `${stepPath}\\${fileName}`

            // Maak mappen aan — fouten worden genegeerd (map bestaat al)
            for (const dir of [rootPath, artPath, stepPath]) {
              try {
                console.log(`   📁  MKDIR ${dir} op ${ip}`)
                await runTncCmd(ip, `MKDIR ${dir}`)
              } catch { /* map bestaat al */ }
            }

            // Stuur bestand
            console.log(`   📤  PUT → ${destPath} op ${ip}`)
            await runTncCmd(ip, `PUT ${tempFile} ${destPath}`)

            console.log(`   ✅  ${fileName} verstuurd naar ${ip}:${destPath}`)
            res.end(JSON.stringify({ ok: true, path: destPath }))
          } finally {
            await unlink(tempFile).catch(() => {})
          }
        } catch (err) {
          console.error('❌  send-nc-file fout:', err.message)
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })

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

  if (STATE_POLL_ENABLED) {
    console.log(`📡  Online/offline monitoring actief — TCP ping elke ${STATE_POLL_MS / 1000}s`)
    await pollAllMachineStates()
    setInterval(pollAllMachineStates, STATE_POLL_MS)
  }

  if (LOGBOOK_ENABLED) {
    await loadLogbookPositions()
    console.log(`📋  TNCremo logboek monitoring actief — elke ${LOGBOOK_POLL_MS / 1000}s`)
    console.log(`    Logboek pad: ${LOGBOOK_DIR}`)

    // Directe check: waarschuw als de map (nog) niet bestaat
    const dirExists = await stat(LOGBOOK_DIR).then(() => true).catch(() => false)
    if (!dirExists) {
      console.warn(`\n⚠️   Logboek map bestaat nog niet: ${LOGBOOK_DIR}`)
      console.warn(`     → Start TNCremo en maak verbinding met de machines`)
      console.warn(`     → De agent blijft proberen elke ${LOGBOOK_POLL_MS / 1000}s\n`)
    }

    await pollLogbook()
    setInterval(pollLogbook, LOGBOOK_POLL_MS)
  }
}
