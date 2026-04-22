/**
 * Gedeelde WinTool import logica.
 * Wordt gebruikt door:
 *   - backend/scripts/import-tool-library.ts (CLI)
 *   - backend/src/routes/admin/cnc.ts (HTTP endpoint)
 */

import { DatabaseSync } from 'node:sqlite'
import type { Sql } from 'postgres'

interface SqliteRow { [key: string]: unknown }

export interface ImportResult {
  items: number
  assemblies: number
  components: number
}

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

export async function importToolLibraryFromFile(
  dbPath: string,
  sql: Sql,
): Promise<ImportResult> {
  const sqlite = new DatabaseSync(dbPath, { open: true, readOnly: true })

  try {
    // ── Stap 1: Lees SQLite brondata ─────────────────────────────────────────

    const holders = sqlite.prepare(`
      SELECT h.id, h.name, h.comment, h.ordering_code, m.name AS manufacturer
      FROM Holders h
      LEFT JOIN Manufacturers m ON h.manufacturer_id = m.manufacturer_id
    `).all() as SqliteRow[]

    const extensions = sqlite.prepare(`
      SELECT e.extension_id AS id, e.name, e.comment, e.ordering_code, m.name AS manufacturer
      FROM Extensions e
      LEFT JOIN Manufacturers m ON e.manufacturer_id = m.manufacturer_id
    `).all() as SqliteRow[]

    const tools = sqlite.prepare(`
      SELECT t.id, t.name, t.comment, t.ordering_code,
             gc.name AS category, m.name AS manufacturer
      FROM Tools t
      LEFT JOIN GeometryClasses gc ON t.tool_type_id = gc.id
      LEFT JOIN Manufacturers m ON t.manufacturer_id = m.manufacturer_id
    `).all() as SqliteRow[]

    const nctoolsRaw = sqlite.prepare(`
      SELECT id, nc_number_str, nc_name, comment,
             tool_length, preset_diameter, tool_id, holder_id
      FROM NCTools
      WHERE nc_name IS NOT NULL AND nc_name != ''
      ORDER BY CAST(nc_number_str AS INTEGER) ASC, id ASC
    `).all() as SqliteRow[]

    // De-dupliceer op nc_name: bewaar eerste (laagste T-nummer) per naam
    const seenNames = new Set<string>()
    const nctools = nctoolsRaw.filter(nc => {
      const name = str(nc.nc_name)
      if (!name || seenNames.has(name)) return false
      seenNames.add(name)
      return true
    })

    const components = sqlite.prepare(`
      SELECT component_id, nctool_id, extension_id, position, reach
      FROM Components
    `).all() as SqliteRow[]

    sqlite.close()

    // ── Stap 2: Wis bestaande library data ───────────────────────────────────

    await sql`DELETE FROM tool_library_assembly_components`
    await sql`DELETE FROM tool_library_assemblies`
    await sql`DELETE FROM tool_library_items`

    // ── Stap 3: Importeer items ───────────────────────────────────────────────

    const holderIdMap    = new Map<number, string>()
    const extensionIdMap = new Map<number, string>()
    const toolIdMap      = new Map<number, string>()

    if (holders.length > 0) {
      const rows = holders.map(h => ({
        source_id:     Number(h.id),
        item_type:     'holder',
        item_category: null,
        name:          String(h.name),
        comment:       str(h.comment),
        ordering_code: str(h.ordering_code),
        manufacturer:  str(h.manufacturer),
      }))
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(rows)} RETURNING id, source_id
      `
      for (const row of inserted) holderIdMap.set(row.source_id, row.id)
    }

    if (extensions.length > 0) {
      const rows = extensions.map(e => ({
        source_id:     Number(e.id),
        item_type:     'extension',
        item_category: null,
        name:          String(e.name),
        comment:       str(e.comment),
        ordering_code: str(e.ordering_code),
        manufacturer:  str(e.manufacturer),
      }))
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(rows)} RETURNING id, source_id
      `
      for (const row of inserted) extensionIdMap.set(row.source_id, row.id)
    }

    if (tools.length > 0) {
      const rows = tools.map(t => ({
        source_id:     Number(t.id),
        item_type:     'tool',
        item_category: str(t.category),
        name:          String(t.name),
        comment:       str(t.comment),
        ordering_code: str(t.ordering_code),
        manufacturer:  str(t.manufacturer),
      }))
      const inserted = await sql<{ id: string; source_id: number }[]>`
        INSERT INTO tool_library_items ${sql(rows)} RETURNING id, source_id
      `
      for (const row of inserted) toolIdMap.set(row.source_id, row.id)
    }

    const totalItems = holderIdMap.size + extensionIdMap.size + toolIdMap.size

    // ── Stap 4: Importeer samenstellingen ────────────────────────────────────

    const assemblyIdMap = new Map<number, string>()
    const assemblyRows = []

    for (const nc of nctools) {
      const ncName = str(nc.nc_name)
      if (!ncName) continue

      assemblyRows.push({
        nc_number:       str(nc.nc_number_str) ? parseInt(String(nc.nc_number_str), 10) || 0 : 0,
        nc_name:         ncName,
        comment:         str(nc.comment),
        tool_length:     num(nc.tool_length),
        preset_diameter: num(nc.preset_diameter),
        tool_item_id:    nc.tool_id != null ? (toolIdMap.get(Number(nc.tool_id)) ?? null) : null,
        holder_item_id:  nc.holder_id != null ? (holderIdMap.get(Number(nc.holder_id)) ?? null) : null,
      })
    }

    if (assemblyRows.length > 0) {
      const BATCH = 200
      let insertedAll: { id: string; nc_name: string }[] = []
      for (let i = 0; i < assemblyRows.length; i += BATCH) {
        const batch = assemblyRows.slice(i, i + BATCH)
        const inserted = await sql<{ id: string; nc_name: string }[]>`
          INSERT INTO tool_library_assemblies ${sql(batch)} RETURNING id, nc_name
        `
        insertedAll = insertedAll.concat(inserted)
      }

      const ncNameMap = new Map<string, string>()
      for (const row of insertedAll) ncNameMap.set(row.nc_name, row.id)
      for (const nc of nctools) {
        const ncName = str(nc.nc_name)
        if (!ncName) continue
        const pgId = ncNameMap.get(ncName)
        if (pgId) assemblyIdMap.set(Number(nc.id), pgId)
      }
    }

    // ── Stap 5: Importeer componenten ────────────────────────────────────────

    const componentRows = []
    for (const comp of components) {
      const assemblyPgId = assemblyIdMap.get(Number(comp.nctool_id))
      const itemPgId     = extensionIdMap.get(Number(comp.extension_id))
      if (!assemblyPgId || !itemPgId) continue
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

    return {
      items:      totalItems,
      assemblies: assemblyIdMap.size,
      components: componentRows.length,
    }
  } catch (err) {
    // Zorg dat SQLite altijd gesloten wordt bij een fout
    try { sqlite.close() } catch { /* al gesloten */ }
    throw err
  }
}
