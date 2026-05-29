import { useState, useEffect, useRef, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjsLib, renderPdfPage, extractTextItems, type TextItem } from '@/lib/pdfjs'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

interface PdfViewerProps {
  pdfUrl: string
  currentPage?: number
  canvasContainerRef?: React.RefObject<HTMLDivElement | null>
  onTextExtracted?: (pageNum: number, items: TextItem[]) => void
  onCanvasClick?: (xPct: number, yPct: number) => void
  onPageChange?: (page: number) => void
  children?: React.ReactNode
}

export default function PdfViewer({
  pdfUrl,
  currentPage: controlledPage,
  canvasContainerRef,
  onTextExtracted,
  onCanvasClick,
  onPageChange,
  children,
}: PdfViewerProps) {
  const [pdfDoc, setPdfDoc]         = useState<PDFDocumentProxy | null>(null)
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale]           = useState(1.5)
  const [loading, setLoading]       = useState(true)
  const [rendering, setRendering]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const containerRef   = canvasContainerRef ?? useRef<HTMLDivElement>(null)
  const renderHandle   = useRef<{ cancel: () => void } | null>(null)
  const extractedPages = useRef<Set<number>>(new Set())

  // PDF laden
  useEffect(() => {
    setLoading(true)
    setError(null)
    setPdfDoc(null)
    extractedPages.current.clear()

    const task = pdfjsLib.getDocument(pdfUrl)
    task.promise
      .then(doc => { setPdfDoc(doc); setTotalPages(doc.numPages); setLoading(false) })
      .catch(err => { setError(`Fout bij laden: ${err?.message ?? err}`); setLoading(false) })
    return () => { task.destroy() }
  }, [pdfUrl])

  // Gecontroleerde pagina vanuit parent
  useEffect(() => {
    if (controlledPage && controlledPage !== page) setPage(controlledPage)
  }, [controlledPage])

  // Pagina renderen
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return
    renderHandle.current?.cancel()
    setRendering(true)

    const handle = renderPdfPage(pdfDoc, page, canvasRef.current, scale)
    renderHandle.current = handle
    try {
      await handle.promise
      // Tekst extraheren voor ballon-detectie (eenmalig per pagina)
      if (onTextExtracted && !extractedPages.current.has(page)) {
        extractedPages.current.add(page)
        extractTextItems(pdfDoc, page).then(items => onTextExtracted(page, items))
      }
    } catch { /* geannuleerd */ }
    setRendering(false)
  }, [pdfDoc, page, scale, onTextExtracted])

  useEffect(() => { renderPage() }, [renderPage])

  if (error) return (
    <div className="flex items-center justify-center h-full text-sm text-red-600 p-4">{error}</div>
  )

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 shrink-0">
        <button
          onClick={() => { setPage(p => { const n = Math.max(1, p - 1); onPageChange?.(n); return n }) }}
          disabled={page <= 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs text-gray-600 min-w-[80px] text-center">
          {loading ? '…' : `Pagina ${page} / ${totalPages}`}
        </span>
        <button
          onClick={() => { setPage(p => { const n = Math.min(totalPages, p + 1); onPageChange?.(n); return n }) }}
          disabled={page >= totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <button
          onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
          disabled={scale <= 0.5}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-gray-600 w-10 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale(s => Math.min(3, s + 0.25))}
          disabled={scale >= 3}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
        >
          <ZoomIn size={16} />
        </button>
      </div>

      {/* Canvas container */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-3">
        {loading && (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            Tekening laden…
          </div>
        )}
        <div
          ref={containerRef as React.RefObject<HTMLDivElement>}
          className="relative inline-block"
          style={{ display: loading ? 'none' : 'inline-block', cursor: onCanvasClick ? 'crosshair' : undefined }}
          onClick={onCanvasClick ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onCanvasClick(
              ((e.clientX - rect.left) / rect.width)  * 100,
              ((e.clientY - rect.top)  / rect.height) * 100,
            )
          } : undefined}
        >
          <canvas ref={canvasRef} className="block shadow-md" />
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <span className="text-xs text-gray-500">Renderen…</span>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
