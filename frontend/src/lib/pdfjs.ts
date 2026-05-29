/// <reference types="vite/client" />
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

// Vite bundelt de worker-URL lokaal — geen CDN nodig
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }

export interface TextItem {
  str: string
  xPct: number
  yPct: number
  widthPct: number
  heightPct: number
}

export interface RenderHandle {
  promise: Promise<{ width: number; height: number }>
  cancel: () => void
}

/** Render één PDF-pagina naar een canvas. Retourneert een annuleerbaar handle. */
export function renderPdfPage(
  pdfDoc: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale = 1.5,
): RenderHandle {
  let cancelled = false
  let renderTask: ReturnType<PDFPageProxy['render']> | null = null

  const promise = (async () => {
    const page = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale })
    canvas.width  = viewport.width
    canvas.height = viewport.height
    if (cancelled) return { width: viewport.width, height: viewport.height }

    const ctx = canvas.getContext('2d')!
    renderTask = page.render({ canvasContext: ctx, viewport })
    await renderTask.promise
    return { width: viewport.width, height: viewport.height }
  })()

  return {
    promise,
    cancel: () => {
      cancelled = true
      renderTask?.cancel()
    },
  }
}

/** Extraheer tekst-items met percentage-posities (0–100) t.o.v. paginagrootte. */
export async function extractTextItems(
  pdfDoc: PDFDocumentProxy,
  pageNum: number,
): Promise<TextItem[]> {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()

  return content.items
    .filter((item): item is (typeof item & { str: string; transform: number[]; width: number; height: number }) =>
      'str' in item && typeof (item as any).str === 'string' && (item as any).str.trim().length > 0
    )
    .map(item => {
      const tx = item.transform
      // PDF-coördinaten: origine linksonder → omzetten naar linksboven
      const x = tx[4]
      const y = viewport.height - tx[5] - (item.height ?? 0)
      return {
        str:       item.str.trim(),
        xPct:      (x / viewport.width)  * 100,
        yPct:      (y / viewport.height) * 100,
        widthPct:  ((item.width  ?? 0) / viewport.width)  * 100,
        heightPct: ((item.height ?? 0) / viewport.height) * 100,
      }
    })
}
