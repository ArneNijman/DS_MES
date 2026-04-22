/**
 * Parser voor Heidenhain TOOL.T bestanden.
 *
 * Heidenhain kent twee regelformaten (0-indexed na whitespace-normalisatie):
 *
 * Named tool (tool met naam in het magazijn):
 *   0=T_NR  1=NAME  2=L  3=R  [4=R2]  5=DL  6=DR  ...  11=TIME2  12=CUR_TIME  ...  DOC  PLC  LOCKED
 *
 * Unnamed tool (lege magazijnpositie, geen naam in het bestand):
 *   0=T_NR  1=L  2=R  [3=R2]  4=DL  5=DR  ...  10=TIME2  11=CUR_TIME  ...  DOC  PLC  LOCKED
 *
 * Detectie: als cols[1] begint met een cijfer, + of - → unnamed format.
 *
 * TIME2 en CUR_TIME staan altijd op vaste posities (11/12 voor named, 10/11 voor unnamed).
 * DOC en LOCKED worden via PLC-patroon (%hexadecimaal) robuust bepaald: DOC is de
 * niet-numerieke tekst direct vóór PLC, LOCKED is de waarde direct ná PLC.
 */

export interface ParsedToolEntry {
  toolNumber: number
  name:       string | null   // null = lege positie (geen tool in het magazijn)
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
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function parseDoc(val: string | undefined): string | null {
  if (!val || val.trim() === '' || val === '-') return null
  if (val.startsWith('%')) return null
  return val.trim()
}

/** Geeft true als de string een Heidenhain getal is (L/R-waarde): alleen cijfers, punt en teken.
 *  Namen zoals "3D-TASTER" of "10MM" bevatten letters en zijn geen getallen. */
function looksNumeric(s: string): boolean {
  return /^[+-]?\d+\.?\d*$/.test(s)
}

/** Geeft true als de string een Heidenhain PLC-veld is (%hexadecimaal). */
function isPLC(s: string): boolean {
  return /^%[0-9A-Fa-f]*$/.test(s)
}

/**
 * Bepaal DOC en LOCKED via PLC-patroonherkenning.
 * searchFrom = eerste index om te zoeken (na de vaste velden).
 */
function parseDocAndLocked(
  cols: string[],
  searchFrom: number,
): { doc: string | null; locked: boolean } {
  // Zoek de PLC-kolom (%hex) van links naar rechts
  let plcIdx = -1
  for (let i = searchFrom; i < cols.length; i++) {
    if (isPLC(cols[i])) { plcIdx = i; break }
  }

  if (plcIdx < 0) {
    // Geen PLC — val terug op de vaste posities van het originele formaat
    const fallbackDocIdx = searchFrom + 7   // col[14] voor named, col[13] voor unnamed
    const fallbackLockIdx = searchFrom + 9  // col[16] voor named, col[15] voor unnamed
    return {
      doc:    parseDoc(cols[fallbackDocIdx]),
      locked: cols[fallbackLockIdx] === '1' || cols[fallbackLockIdx]?.toUpperCase() === 'LOCKED',
    }
  }

  // LOCKED staat direct na PLC
  const locked = cols[plcIdx + 1] === '1' || cols[plcIdx + 1]?.toUpperCase() === 'LOCKED'

  // DOC staat direct vóór PLC als het niet-numerieke tekst is (geen '-', geen '%...')
  const beforePLC = cols[plcIdx - 1] ?? ''
  const doc =
    beforePLC && !looksNumeric(beforePLC) && beforePLC !== '-' && !isPLC(beforePLC)
      ? parseDoc(beforePLC)
      : null

  return { doc, locked }
}

export function parseToolTable(content: string): {
  tools:   ParsedToolEntry[]
  summary: ParseSummary
} {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const tools: ParsedToolEntry[] = []
  let skipped = 0
  let errors   = 0

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

    const cols = trimmed.replace(/\s+/g, ' ').split(' ')
    const toolNumber = parseInt(cols[0], 10)

    if (isNaN(toolNumber) || toolNumber <= 0) {
      skipped++
      continue
    }

    try {
      const col1 = cols[1] ?? ''

      if (!looksNumeric(col1)) {
        // ── Named tool ─────────────────────────────────────────────────────
        const name = col1.trim()
        if (!name) { skipped++; continue }

        const { doc, locked } = parseDocAndLocked(cols, 7)

        tools.push({
          toolNumber,
          name,
          l:       parseNum(cols[2]),
          r:       parseNum(cols[3]),
          dl:      parseNum(cols[5]),
          dr:      parseNum(cols[6]),
          time2:   parseNum(cols[11]),   // vaste positie
          curTime: parseNum(cols[12]),   // vaste positie
          doc,
          locked,
        })
      } else {
        // ── Unnamed tool (lege positie) — kolom-indices schuiven 1 op ──────
        const { doc, locked } = parseDocAndLocked(cols, 6)

        tools.push({
          toolNumber,
          name:    null,
          l:       parseNum(cols[1]),
          r:       parseNum(cols[2]),
          dl:      parseNum(cols[4]),
          dr:      parseNum(cols[5]),
          time2:   parseNum(cols[10]),   // vaste positie
          curTime: parseNum(cols[11]),   // vaste positie
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
