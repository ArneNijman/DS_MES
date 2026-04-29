/**
 * Parser voor HyperMill/Heidenhain .h NC-programmabestanden.
 *
 * Heidenhain TOOL CALL formaten:
 *   TOOL CALL 5 Z S3000
 *   TOOL CALL 5 Z S3000 DL+0.000 DR+0.000
 *   TOOL CALL "NC00456" Z S3000
 *   TOOL CALL 0            ← spindelstop, toolNumber=0
 *
 * Programmanaam uit header:
 *   BEGIN PGM 12345 MM
 */

export interface ParsedToolCall {
  sequence:     number
  toolNumber:   number | null
  toolName:     string | null
  axis:         string | null
  spindleSpeed: number | null
  dl:           number | null
  dr:           number | null
  rawLine:      string
}

export interface ParseSummary {
  parsed:  number
  skipped: number
  errors:  number
}

export interface ParsedNcProgram {
  programName: string | null
  toolCalls:   ParsedToolCall[]
  summary:     ParseSummary
}

const RE_BLOCK_NUM  = /^N?\d+\s+/i
const RE_BEGIN_PGM  = /^BEGIN\s+PGM\s+(\S+)/i
const RE_TOOL_CALL  = /^TOOL\s+CALL\s+/i
const RE_BY_NAME    = /^"([^"]+)"/
const RE_BY_NUMBER  = /^(\d+)\b/
const RE_AXIS       = /^[XYZABC]$/i
const RE_SPEED      = /^S(\d+(?:\.\d+)?)$/i
const RE_DL         = /^DL([+-]\d+(?:\.\d+)?)$/i
const RE_DR         = /^DR([+-]\d+(?:\.\d+)?)$/i

function parseNum(val: string): number | null {
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

export function parseNcProgram(content: string): ParsedNcProgram {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  let programName: string | null = null
  const toolCalls: ParsedToolCall[] = []
  let skipped = 0
  let errors   = 0
  let sequence = 0

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (trimmed === '' || trimmed.startsWith(';')) {
      skipped++
      continue
    }

    // Bloknummer aan het begin van de regel verwijderen (bv. "5 " of "N10 ")
    const line = trimmed.replace(RE_BLOCK_NUM, '')

    const beginMatch = line.match(RE_BEGIN_PGM)
    if (beginMatch) {
      programName = beginMatch[1]
      skipped++
      continue
    }

    if (!RE_TOOL_CALL.test(line)) {
      skipped++
      continue
    }

    // Verwijder "TOOL CALL " prefix (hoofdletterongevoelig)
    const rest = line.replace(RE_TOOL_CALL, '').trim()
    const tokens = rest.split(/\s+/)

    try {
      let toolNumber:   number | null = null
      let toolName:     string | null = null
      let axis:         string | null = null
      let spindleSpeed: number | null = null
      let dl:           number | null = null
      let dr:           number | null = null

      let startIdx = 0

      const nameMatch = rest.match(RE_BY_NAME)
      if (nameMatch) {
        toolName = nameMatch[1]
        startIdx = 1
      } else {
        const numMatch = tokens[0]?.match(RE_BY_NUMBER)
        if (numMatch) {
          toolNumber = parseInt(numMatch[1], 10)
          startIdx = 1
        } else {
          errors++
          continue
        }
      }

      for (let i = startIdx; i < tokens.length; i++) {
        const t = tokens[i]
        if (RE_AXIS.test(t)) {
          axis = t.toUpperCase()
        } else if (RE_SPEED.test(t)) {
          spindleSpeed = parseNum(t.slice(1))
        } else if (RE_DL.test(t)) {
          dl = parseNum(t.slice(2))
        } else if (RE_DR.test(t)) {
          dr = parseNum(t.slice(2))
        }
      }

      sequence++
      toolCalls.push({ sequence, toolNumber, toolName, axis, spindleSpeed, dl, dr, rawLine: trimmed })
    } catch {
      errors++
    }
  }

  return {
    programName,
    toolCalls,
    summary: { parsed: toolCalls.length, skipped, errors },
  }
}
