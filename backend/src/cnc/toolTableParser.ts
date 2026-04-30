/**
 * Parser voor Heidenhain TOOL.T bestanden.
 *
 * Ondersteunt twee kolomindelingen:
 *
 * 1. Fooke/modern formaat (header aanwezig: "T NAME L R DL DR R2 DR2 PLC RT TIME1 TIME2 CUR.TIME ..."):
 *    Kolomposities worden uit de header afgeleid. TIME2 en CUR.TIME staan ná PLC.
 *
 * 2. Klassiek Heidenhain formaat (geen bruikbare header):
 *    Named:   0=T_NR 1=NAME 2=L 3=R 4=R2 5=DL 6=DR ... TIME2 CUR.TIME DOC PLC LOCKED
 *    Unnamed: 0=T_NR 1=L 2=R 3=R2 4=DL 5=DR ...       TIME2 CUR.TIME DOC PLC LOCKED
 *    PLC-patroonherkenning (%hex) wordt gebruikt voor TIME2/CUR.TIME/DOC/LOCKED.
 *
 * Lege magazijnposities (alleen toolnummer, geen naam of waarden) worden opgenomen
 * als entries met name=null en alle waarden null.
 */

export interface ParsedToolEntry {
  toolNumber: number
  name:       string | null
  l:          number | null
  r:          number | null
  dl:         number | null
  dr:         number | null
  time2:      number | null
  curTime:    number | null
  doc:        string | null
  locked:     boolean
}

export interface ParseSummary {
  parsed:  number
  skipped: number
  errors:  number
}

function parseNum(val: string | undefined): number | null {
  if (!val || val.trim() === '' || val === '-') return null
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseDoc(val: string | undefined): string | null {
  if (!val || val.trim() === '' || val === '-') return null
  if (val.startsWith('%')) return null
  return val.trim()
}

function looksNumeric(s: string): boolean {
  return /^[+-]?\d+\.?\d*$/.test(s)
}

function isPLC(s: string): boolean {
  return /^%[0-9A-Fa-f]*$/.test(s)
}

/**
 * Klassieke PLC-patroonherkenning voor formaten zonder bruikbare header.
 * Volgorde: ... TIME2  CUR.TIME  [DOC]  PLC  [LOCKED]
 */
function parseDocAndLocked(
  cols: string[],
  searchFrom: number,
): { doc: string | null; locked: boolean; time2: number | null; curTime: number | null } {
  let plcIdx = -1
  for (let i = searchFrom; i < cols.length; i++) {
    if (isPLC(cols[i])) { plcIdx = i; break }
  }

  if (plcIdx < 0) {
    const fallbackDocIdx  = searchFrom + 7
    const fallbackLockIdx = searchFrom + 9
    return {
      doc:     parseDoc(cols[fallbackDocIdx]),
      locked:  cols[fallbackLockIdx] === '1' || cols[fallbackLockIdx]?.toUpperCase() === 'LOCKED',
      time2:   null,
      curTime: null,
    }
  }

  const locked = cols[plcIdx + 1] === '1' || cols[plcIdx + 1]?.toUpperCase() === 'LOCKED'

  const beforePLC  = cols[plcIdx - 1] ?? ''
  const docPresent = !!beforePLC && !looksNumeric(beforePLC) && !isPLC(beforePLC)
  const doc        = docPresent && beforePLC !== '-' ? parseDoc(beforePLC) : null

  const curTimeIdx = docPresent ? plcIdx - 2 : plcIdx - 1
  const time2Idx   = docPresent ? plcIdx - 3 : plcIdx - 2

  return { doc, locked, curTime: parseNum(cols[curTimeIdx]), time2: parseNum(cols[time2Idx]) }
}

export type ToolTableFormat = 'heidenhain' | 'fooke' | 'ronin' | '3200' | 'portaal'

export function parseToolTable(content: string, format: ToolTableFormat = 'heidenhain'): {
  tools:   ParsedToolEntry[]
  summary: ParseSummary
} {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const tools: ParsedToolEntry[] = []
  let skipped = 0
  let errors  = 0
  // colMap: kolomnaam (uppercase) → index in de header (= index voor named tools)
  let colMap: Map<string, number> | null = null

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (
      trimmed === '' ||
      trimmed.startsWith(';') ||
      trimmed.toUpperCase().startsWith('BEGIN') ||
      trimmed.toUpperCase().startsWith('END')
    ) {
      skipped++
      continue
    }

    // Header-regel detecteren — alleen voor Fooke, want andere machines hebben
    // lege velden (bv. TL, CUR.TIME) die na whitespace-normalisatie verdwijnen
    // en de header-gebaseerde indices onbetrouwbaar maken.
    if (format === 'fooke' && !colMap && /^T\s+NAME\b/i.test(trimmed)) {
      const hcols = trimmed.replace(/\s+/g, ' ').split(' ')
      colMap = new Map(hcols.map((c, i) => [c.toUpperCase(), i]))
      skipped++
      continue
    }

    const cols = trimmed.replace(/\s+/g, ' ').split(' ')
    const toolNumber = parseInt(cols[0], 10)

    if (isNaN(toolNumber) || toolNumber <= 0) {
      skipped++
      continue
    }

    try {
      const col1 = cols[1] ?? ''

      // Lege magazijnpositie: geen data na toolnummer → overslaan
      if (!col1) { skipped++; continue }

      const isNamed = !looksNumeric(col1)

      if (colMap) {
        // ── Header-gebaseerde parsing ──────────────────────────────────────
        // Voor unnamed tools ontbreekt de NAME-kolom, dus alle indices schuiven -1
        const offset = isNamed ? 0 : -1

        const get = (name: string): string | undefined => {
          const idx = colMap!.get(name.toUpperCase())
          if (idx === undefined) return undefined
          const realIdx = idx + offset
          return realIdx >= 0 ? cols[realIdx] : undefined
        }

        // LOCKED: expliciete kolom of de kolom direct na PLC (oud formaat)
        let locked = false
        if (colMap.has('LOCKED')) {
          const v = get('LOCKED') ?? ''
          locked = v === '1' || v.toUpperCase() === 'LOCKED'
        } else {
          const plcColIdx = colMap.get('PLC')
          if (plcColIdx !== undefined) {
            const afterPLC = cols[plcColIdx + offset + 1] ?? ''
            locked = afterPLC === '1' || afterPLC.toUpperCase() === 'LOCKED'
          }
        }

        tools.push({
          toolNumber,
          name:    isNamed ? col1 : null,
          l:       parseNum(get('L')),
          r:       parseNum(get('R')),
          dl:      parseNum(get('DL')),
          dr:      parseNum(get('DR')),
          // Fooke: TIME2-kolom bevat geaccumuleerde tijd (curTime), CUR.TIME bevat de limiet (time2).
          curTime: parseNum(get(format === 'fooke' ? 'TIME2' : 'CUR.TIME')),
          time2:   parseNum(get(format === 'fooke' ? 'CUR.TIME' : 'TIME2')),
          doc:     parseDoc(get('DOC')),
          locked,
        })
      } else if (format === 'ronin' || format === '3200' || format === 'portaal') {
        // ── Ronin: PLC-anker, TIME2 staat altijd 5 posities vóór PLC ─────────
        // Vaste tokens tussen TIME2 en PLC (altijd aanwezig): CUT. LTOL RTOL DIRECT.('-')
        // CUR.TIME en DOC zijn altijd leeg (onzichtbaar na normalisatie).
        let plcIdx = -1
        const searchFrom = isNamed ? 7 : 6
        for (let i = searchFrom; i < cols.length; i++) {
          if (isPLC(cols[i])) { plcIdx = i; break }
        }
        const locked = plcIdx >= 0 && (cols[plcIdx + 1] === '1' || cols[plcIdx + 1]?.toUpperCase() === 'LOCKED')

        tools.push({
          toolNumber,
          name:    isNamed ? col1 : null,
          l:       parseNum(cols[isNamed ? 2 : 1]),
          r:       parseNum(cols[isNamed ? 3 : 2]),
          dl:      parseNum(cols[isNamed ? 5 : 4]),
          dr:      parseNum(cols[isNamed ? 6 : 5]),
          curTime: plcIdx >= 0 ? parseNum(cols[plcIdx - 5]) : null,
          time2:   null,
          doc:     null,
          locked,
        })
      } else {
        // ── Klassieke PLC-patroonherkenning (geen header) ──────────────────
        const searchFrom = isNamed ? 7 : 6
        const { doc, locked, curTime, time2 } = parseDocAndLocked(cols, searchFrom)

        tools.push({
          toolNumber,
          name: isNamed ? col1 : null,
          l:    parseNum(cols[isNamed ? 2 : 1]),
          r:    parseNum(cols[isNamed ? 3 : 2]),
          dl:   parseNum(cols[isNamed ? 5 : 4]),
          dr:   parseNum(cols[isNamed ? 6 : 5]),
          curTime,
          time2,
          doc,
          locked,
        })
      }
    } catch {
      errors++
    }
  }

  return {
    tools,
    summary: { parsed: tools.length, skipped, errors },
  }
}
