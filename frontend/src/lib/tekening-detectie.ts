import { pdfjsLib, extractTextItems, renderPdfPage } from './pdfjs'
import { parseISO286 } from './iso286'
import { apiFetch } from './api'

export interface DetectedBallon {
  paginaNummer: number
  xPct: number
  yPct: number
  nominaalMaat?: string
  tolPlus?: string
  tolMinus?: string
  isoPassing?: string
}

export function detectMaatAnnotaties(str: string, xPct: number, yPct: number, pageNum: number): DetectedBallon | null {
  const clean = str.trim()

  // Symmetrisch: 25.0 ±0.1
  const sym = clean.match(/^(?:O\s*)?(\d+(?:[.,]\d+)?)\s*[±]\s*(\d+(?:[.,]\d+)?)$/)
  if (sym) {
    const tol = sym[2].replace(',', '.')
    return { paginaNummer: pageNum, xPct, yPct, nominaalMaat: sym[1].replace(',', '.'), tolPlus: tol, tolMinus: tol }
  }

  // Asymmetrisch: 25.0 +0.1/-0.05
  const asym = clean.match(/^(?:O\s*)?(\d+(?:[.,]\d+)?)\s*\+(\d+(?:[.,]\d+)?)\s*\/?\s*-(\d+(?:[.,]\d+)?)$/)
  if (asym) {
    return {
      paginaNummer: pageNum, xPct, yPct,
      nominaalMaat: asym[1].replace(',', '.'),
      tolPlus: asym[2].replace(',', '.'),
      tolMinus: asym[3].replace(',', '.'),
    }
  }

  // ISO passing: 25H7
  const iso = clean.match(/^(?:O\s*)?(\d+(?:[.,]\d+)?)\s*([A-Za-z]{1,2}\d+)$/)
  if (iso) {
    const nominaal = parseFloat(iso[1].replace(',', '.'))
    const passing  = iso[2]
    const result   = parseISO286(passing, nominaal)
    return {
      paginaNummer: pageNum, xPct, yPct,
      nominaalMaat: iso[1].replace(',', '.'),
      tolPlus:  result ? String(Math.abs(result.upper).toFixed(3)) : undefined,
      tolMinus: result ? String(Math.abs(result.lower).toFixed(3)) : undefined,
      isoPassing: passing,
    }
  }

  // Enkelvoudige maat ≥ 10
  const simple = clean.match(/^(?:O\s*)?(\d{1,5}(?:[.,]\d{1,3})?)$/)
  if (simple) {
    const val = parseFloat(simple[1].replace(',', '.'))
    if (val >= 10) return { paginaNummer: pageNum, xPct, yPct, nominaalMaat: simple[1].replace(',', '.') }
  }

  return null
}

async function ocrPagina(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ocrWorker: any,
): Promise<DetectedBallon[]> {
  const canvas  = document.createElement('canvas')
  const handle  = renderPdfPage(pdfDoc, pageNum, canvas, 3.5)
  const viewport = await handle.promise

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ocrWorker.recognize(canvas, {}, { hocr: true }) as { data: any }
  canvas.remove()

  const hocrDoc  = new DOMParser().parseFromString(data.hocr ?? '', 'text/html')
  const lineEls  = Array.from(hocrDoc.querySelectorAll('.ocr_line'))
  const ballonnen: DetectedBallon[] = []

  for (const lineEl of lineEls) {
    const words = Array.from(lineEl.querySelectorAll('.ocrx_word'))
    if (!words.length) continue
    const tokens  = words.map(w => w.textContent?.trim() ?? '').filter(Boolean)
    const lineText = tokens.join(' ')
    let sumX = 0, sumY = 0, count = 0
    for (const w of words) {
      const m = (w.getAttribute('title') ?? '').match(/bbox (\d+) (\d+) (\d+) (\d+)/)
      if (!m) continue
      sumX += (+m[1] + +m[3]) / 2; sumY += (+m[2] + +m[4]) / 2; count++
    }
    if (!count) continue
    const lineXPct = (sumX / count / viewport.width)  * 100
    const lineYPct = (sumY / count / viewport.height) * 100
    const lineMatch = detectMaatAnnotaties(lineText, lineXPct, lineYPct, pageNum)
    if (lineMatch) { ballonnen.push(lineMatch); continue }
    for (const w of words) {
      const text = w.textContent?.trim() ?? ''
      if (!text) continue
      const m = (w.getAttribute('title') ?? '').match(/bbox (\d+) (\d+) (\d+) (\d+)/)
      if (!m) continue
      const b = detectMaatAnnotaties(text, ((Number(m[1])+Number(m[3]))/2/viewport.width)*100, ((Number(m[2])+Number(m[4]))/2/viewport.height)*100, pageNum)
      if (b) { ballonnen.push(b); break }
    }
  }
  return ballonnen
}

/** Auto-detecteer ballonnen en sla ze op via bulk-endpoint. Retourneert aantal gevonden. */
export async function autoDetecteerBallonnen(
  setupId: string,
  setupType: 'product' | 'meet',
  drawingDocId: string,
  pdfSource: string | ArrayBuffer,
  onProgress?: (label: string, page: number, total: number) => void,
): Promise<number> {
  const pdfDoc = await pdfjsLib.getDocument(
    typeof pdfSource === 'string'
      ? pdfSource
      : { data: (pdfSource as ArrayBuffer).slice(0) }
  ).promise

  const detectedBallonnen: DetectedBallon[] = []
  let totalTextItems = 0

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    onProgress?.('Pagina', p, pdfDoc.numPages)
    const items = await extractTextItems(pdfDoc, p)
    totalTextItems += items.length
    for (const item of items) {
      const b = detectMaatAnnotaties(item.str, item.xPct, item.yPct, p)
      if (b) detectedBallonnen.push(b)
    }
  }

  // OCR-fallback voor gescande PDF's (lazy import)
  if (totalTextItems === 0) {
    const { createWorker, PSM } = await import('tesseract.js')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ocrWorker = await createWorker('eng', 1, {} as any)
    await ocrWorker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    try {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        onProgress?.('OCR pagina', p, pdfDoc.numPages)
        detectedBallonnen.push(...await ocrPagina(pdfDoc, p, ocrWorker))
      }
    } finally {
      await ocrWorker.terminate()
    }
  }

  const base = setupType === 'product'
    ? `/kiosk/product-setups/${setupId}`
    : `/kiosk/meet-setups/${setupId}`

  if (detectedBallonnen.length > 0) {
    await apiFetch(`${base}/maten/bulk`, {
      method: 'POST',
      body: JSON.stringify({ drawingDocId, ballonnen: detectedBallonnen }),
    })
  }

  return detectedBallonnen.length
}
