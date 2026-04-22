/**
 * Import Tool Library from WinTool-compatible SQLite database into PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/import-tool-library.ts <path-to-db>
 *
 * Example:
 *   npx tsx scripts/import-tool-library.ts "C:/Users/ArneNijman/Documents/Tooldatabase/Dutch-Shape_2025.db"
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { importToolLibraryFromFile } from '../src/cnc/importToolLibrary.js'

// ── .env laden ────────────────────────────────────────────────────────────────

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

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://mes:mes@localhost:5432/mes'

// ── Uitvoeren ─────────────────────────────────────────────────────────────────

const sql = postgres(databaseUrl, { max: 1 })

console.log(`\nTool Library Import`)
console.log(`SQLite:     ${dbPath}`)
console.log(`PostgreSQL: ${databaseUrl.replace(/:([^:@]+)@/, ':***@')}\n`)

try {
  const result = await importToolLibraryFromFile(dbPath, sql)
  console.log('✓ Import voltooid!')
  console.log(`  Items:           ${result.items}`)
  console.log(`  Samenstellingen: ${result.assemblies}`)
  console.log(`  Componenten:     ${result.components}`)
} catch (err: unknown) {
  console.error('\nFout tijdens import:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await sql.end()
}
