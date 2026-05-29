// ISO 286-1:2010 — IT grades en fundamentele afwijkingen
const SIZE_RANGES = [
  [0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50],
  [50, 80], [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500]
] as const

const IT_GRADES: Record<number, readonly number[]> = {
  5:  [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6:  [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7:  [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8:  [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9:  [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
}

const FUNDAMENTAL_DEVIATIONS: Record<string, readonly number[]> = {
  'H':  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'JS': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'K':  [-2, -2, -2, -3, -4, -4, -5, -6, -8, -10, -12, -13, -15],
  'M':  [-2, -4, -6, -7, -8, -9, -11, -13, -15, -17, -20, -21, -23],
  'N':  [-4, -5, -7, -9, -11, -13, -16, -19, -22, -25, -28, -29, -33],
  'P':  [-6, -9, -12, -15, -18, -22, -26, -32, -37, -43, -50, -56, -62],
  'f':  [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  'g':  [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  'h':  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'js': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'k':  [0, 1, 1, 1, 2, 2, 2, 3, 4, 4, 4, 4, 5],
  'm':  [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  'n':  [4, 8, 9, 11, 14, 16, 20, 23, 27, 31, 34, 37, 40],
  'p':  [6, 12, 15, 18, 22, 26, 32, 37, 45, 51, 57, 62, 68],
  'r':  [10, 15, 19, 23, 28, 34, 41, 48, 58, 68, 77, 87, 95],
  's':  [14, 19, 23, 28, 35, 43, 53, 59, 71, 83, 89, 97, 103],
}

function getSizeRangeIndex(nominalMm: number): number {
  for (let i = 0; i < SIZE_RANGES.length; i++) {
    const [lo, hi] = SIZE_RANGES[i]
    if (nominalMm > lo && nominalMm <= hi) return i
    if (i === 0 && nominalMm <= hi) return 0
  }
  return -1
}

export interface ISO286Result {
  upper: number
  lower: number
}

export function parseISO286(notation: string, nominalMm: number): ISO286Result | null {
  const match = notation.trim().match(/^([A-Za-z]{1,2})(\d+)$/)
  if (!match) return null
  const letter = match[1]
  const grade  = parseInt(match[2])
  const itValues    = IT_GRADES[grade]
  const fundamentals = FUNDAMENTAL_DEVIATIONS[letter]
  if (!itValues || !fundamentals) return null
  const idx = getSizeRangeIndex(nominalMm)
  if (idx === -1) return null
  const IT   = itValues[idx]   / 1000
  const fund = fundamentals[idx] / 1000
  const isUppercase = letter === letter.toUpperCase()
  const isJS = letter.toUpperCase() === 'JS'
  if (isJS) return { upper: IT / 2, lower: -(IT / 2) }
  if (isUppercase) return { upper: fund + IT, lower: fund }
  if (letter === 'h') return { upper: 0, lower: -IT }
  return { upper: fund, lower: fund - IT }
}
