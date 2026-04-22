/**
 * Import Tool Library from WinTool-compatible SQLite database into PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/import-tool-library.ts <path-to-db>
 *
 * Example:
 *   npx tsx scripts/import-tool-library.ts "C:/Users/ArneNijman/Documents/Tooldatabase/Dutch-Shape_2025.db"
 *
 * Uses Node.js 22+ built-in node:sqlite (geen externe dependencies).
 * DATABASE_URL wordt gelezen uit .env of uit de omgeving.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import postgres from 'postgres'

// ── .env laden (als geen DATABASE_URL in omgeving staat) ──────────────────────

function loadEnv() {
  const envPath = resolve(import.meta.dirname, '../../.env')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim()
    }
  }
}

loadEnv()

// ── Argumenten ────────────────────────────────────────────────────────────────

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Gebruik: npx tsx scripts/import-tool-library.ts <pad-naar-.db>')
  process.exit(1)
}
if (!existsSync(dbPath)) {
  console.error(`Bestand niet gevonden: ${dbPath}`)
  process.exit(1)
}

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://mes:mes@localhost:5432/mes'

// ── SQLite types (node:sqlite geeft plain objects terug) ──────────────────────

interface SqliteRow { [key: string]: unknown }

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' || s === '-' ? null : s
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// ── Hoofd import ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTool Library Import`)
  console.log(`SQLite: ${dbPath}`)
  console.log(`PostgreSQL: ${databaseUrl.replace(/:([^:@]+)@/, ':***@')}\n`)

  // Open SQLite (strikt alleen lezen — schrijven is geblokkeerd op databaseniveau)
  const sqlite = new DatabaseSync(dbPath, { open: true, readOnly: true })

  // PostgreSQL verbinding
  const sql = postgres(databaseUrl, { max: 1 })

  try {
    // ── Stap 1: Lees SQLite brondata ─────────────────────────────────────────

    console.log('Lezen uit SQLite...')

    const manufacturers = sqlite
      .prepare('SELECT manufacturer_id, name FROM Manufacturers')
      .all() as SqliteRow[]

    const geometryClasses = sqlite
      .prepare('SELECT id, name FROM GeometryClasses')
      .all() as SqliteRow[]

    const holders = sqlite
      .prepare(`
        SELECT h.id, h.name, h.comment, h.ordering_code, m.name AS manufacturer
        FROM Holders h
        LEFT JOIN Manufacturers m ON h.manufacturer_id = m.manufacturer_id
      `)
      .all() as SqliteRow[]

    const extensions = sqlite
      .prepare(`
        SELECT e.extension_id AS id, e.name, e.comment, e.ordering_code, m.name AS manufacturer
        FROM Extensions e
        LEFT JOIN Manufacturers m ON e.manufacturer_id = m.manufacturer_id
      `)
      .all() as SqliteRow[]

    const tools = sqlite
      .prepare(`
        SELECT t.id, t.name, t.comment, t.ordering_code,
               gc.name AS category, m.name AS manufacturer
        FROM Tools t
        LEFT JOIN GeometryClasses gc ON t.tool_type_id = gc.id
        LEFT JOIN Manufacturers m ON t.manufacturer_id = m.manufacturer_id
      `)
      .all() as SqliteRow[]

    const nctoolsRaw = sqlite
      .prepare(`
        SELECT id, nc_number_str, nc_name, comment,
               tool_length, preset_diameter, tool_id, holder_id
        FROM NCTools
        WHERE nc_name IS NOT NULL AND nc_name != ''
        ORDER BY CAST(nc_number_str AS INTEGER) ASC, id ASC
      `)
      .all() as SqliteRow[]

    // De-dupliceer op nc_name: bewaar eerste (laagste T-nummer) per naam
    const seenNames = new Set<string>()
    const nctools = nctoolsRaw.filter(nc => {
      const name = str(nc.nc_name)
      if (!name || seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })

    const components = sqlite
      .prepare(`
        SELECT component_id, nctool_id, extension_id, position, reach
        FROM Components
      `)
      .all() as SqliteRow[]

    console.log(`  Houders:        ${holders.length}`)
    console.log(`  Verlengstukken: ${extensions.length}`)
    console.log(`  Snijgereedschap: ${tools.length}`)
    console.log(`  Samenstellingen: ${nctools.length}`)
    console.log(`  Componenten:    ${components.length}`)

    sqlite.close()

    // ── Stap 2: Wis bestaande library data ───────────────────────────────────

    console.log('\nBestaande library data wissen...')
    await sql`DELETE FROM tool_library_assembly_components`
    await sql`DELETE FROM tool_library_assemblies`
    await sql`DELETE FROM tool_library_items`
    console.log('  Gewist.')

    // ── Stap 3: Importeer items ───────────────────────────────────────────────

    console.log('\nItems importeren...')

    // Map: SQLite source_id + type → PostgreSQL uuid
    const holderIdMap   = new Map<number, string>()
    const extensionIdMap = new Map<number, string>()
    const toolIdMap     = new Map<number, string>()

    // Batch insert helpers
    async function insertItems(rows: object[]) {
      if (rows.length === 0) return
      await sql`INSERT INTO tool_library_items ${sql(rows)}`
    }

    // Houders
    const holderRows = holders.map(h => ({
      source_id:      Number(h.id),
      item_type:      'holder',
      item_category:  null,
      name:           String(h.name),
      comment:        str(h.comment),
      ordering_code:  str(h.ordering_code),
      manufacturer:   str(h.manufacturer),
    }))
    if (holderRows.length > 0) {
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(holderRows)}
        RETURNING id, source_id
      `
      for (const row of inserted) holderIdMap.set(row.source_id, row.id)
    }

    // Verlengstukken/adapters
    const extensionRows = extensions.map(e => ({
      source_id:      Number(e.id),
      item_type:      'extension',
      item_category:  null,
      name:           String(e.name),
      comment:        str(e.comment),
      ordering_code:  str(e.ordering_code),
      manufacturer:   str(e.manufacturer),
    }))
    if (extensionRows.length > 0) {
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(extensionRows)}
        RETURNING id, source_id
      `
      for (const row of inserted) extensionIdMap.set(row.source_id, row.id)
    }

    // Snijgereedschap
    const toolRows = tools.map(t => ({
      source_id:      Number(t.id),
      item_type:      'tool',
      item_category:  str(t.category),
      name:           String(t.name),
      comment:        str(t.comment),
      ordering_code:  str(t.ordering_code),
      manufacturer:   str(t.manufacturer),
    }))
    if (toolRows.length > 0) {
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(toolRows)}
        RETURNING id, source_id
      `
      for (const row of inserted) toolIdMap.set(row.source_id, row.id)
    }

    const totalItems = holderIdMap.size + extensionIdMap.size + toolIdMap.size
    console.log(`  ${totalItems} items geïmporteerd (${holderIdMap.size} houders, ${extensionIdMap.size} adapters, ${toolIdMap.size} gereedschappen)`)

    // ── Stap 4: Importeer samenstellingen ────────────────────────────────────

    console.log('\nSamenstellingen importeren...')

    // Map: SQLite NCTools.id → PostgreSQL uuid
    const assemblyIdMap = new Map<number, string>()

    let skippedAssemblies = 0
    const assemblyRows = []

    for (const nc of nctools) {
      const ncId      = Number(nc.id)
      const toolId    = nc.tool_id   != null ? toolIdMap.get(Number(nc.tool_id))   : undefined
      const holderId  = nc.holder_id != null ? holderIdMap.get(Number(nc.holder_id)) : undefined
      const ncName    = str(nc.nc_name)
      const ncNumStr  = str(nc.nc_number_str)

      if (!ncName) { skippedAssemblies++; continue }

      assemblyRows.push({
        nc_number:       ncNumStr ? parseInt(ncNumStr, 10) || 0 : 0,
        nc_name:         ncName,
        comment:         str(nc.comment),
        tool_length:     num(nc.tool_length),
        preset_diameter: num(nc.preset_diameter),
        tool_item_id:    toolId ?? null,
        holder_item_id:  holderId ?? null,
      })
    }

    if (assemblyRows.length > 0) {
      // Insert per batch van 200 om query-grootte te beperken
      const BATCH = 200
      let insertedAll: { id: string; nc_name: string }[] = []
      for (let i = 0; i < assemblyRows.length; i += BATCH) {
        const batch = assemblyRows.slice(i, i + BATCH)
        const inserted = await sql<{ id: string; nc_name: string }[]>`
          INSERT INTO tool_library_assemblies ${sql(batch)}
          RETURNING id, nc_name
        `
        insertedAll = insertedAll.concat(inserted)
      }

      // Bouw id map: nc_name → pg uuid
      const ncNameMap = new Map<string, string>()
      for (const row of insertedAll) ncNameMap.set(row.nc_name, row.id)

      // Vul assemblyIdMap op basis van SQLite id (via nc_name koppeling)
      for (const nc of nctools) {
        const ncName = str(nc.nc_name)
        if (!ncName) continue
        const pgId = ncNameMap.get(ncName)
        if (pgId) assemblyIdMap.set(Number(nc.id), pgId)
      }
    }

    console.log(`  ${assemblyIdMap.size} samenstellingen geïmporteerd${skippedAssemblies > 0 ? ` (${skippedAssemblies} overgeslagen — geen naam)` : ''}`)

    // ── Stap 5: Importeer componenten ────────────────────────────────────────

    console.log('\nComponenten importeren...')

    let skippedComponents = 0
    const componentRows = []

    for (const comp of components) {
      const assemblyPgId = assemblyIdMap.get(Number(comp.nctool_id))
      const itemPgId     = extensionIdMap.get(Number(comp.extension_id))

      if (!assemblyPgId || !itemPgId) { skippedComponents++; continue }

      componentRows.push({
        assembly_id: assemblyPgId,
        item_id:     itemPgId,
        position:    Number(comp.position),
        reach:       num(comp.reach),
      })
    }

    if (componentRows.length > 0) {
      await sql`INSERT INTO tool_library_assembly_components ${sql(componentRows)}`
    }

    console.log(`  ${componentRows.length} componenten geïmporteerd${skippedComponents > 0 ? ` (${skippedComponents} overgeslagen)` : ''}`)

    // ── Klaar ─────────────────────────────────────────────────────────────────

    console.log('\n✓ Import voltooid!')
    console.log(`  Items:           ${totalItems}`)
    console.log(`  Samenstellingen: ${assemblyIdMap.size}`)
    console.log(`  Componenten:     ${componentRows.length}`)

  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error('\nFout tijdens import:', err.message)
  process.exit(1)
})
