import { useState } from 'react'

export interface BallonData {
  id: string
  nummer: number
  paginaNummer: number
  xPct: number
  yPct: number
  type: 'dimensional' | 'visual' | 'gauge' | 'marking'
  nominaalMaat: string | null
  tolPlus: string | null
  tolMinus: string | null
  isoPassing: string | null
  meetmiddel: string | null
  gdtType: string | null
  gemetenWaarde: string | null
  status: 'goed' | 'afgekeurd' | null
  stapId: string | null
}

interface BallonOverlayProps {
  ballon: BallonData
  containerRef: React.RefObject<HTMLDivElement | null>
  bewerkmodus: boolean
  selected: boolean
  onSelect: (id: string) => void
  onDragEnd: (id: string, xPct: number, yPct: number) => void
  onDelete: (id: string) => void
}

function getBallonKleur(ballon: BallonData): string {
  if (!ballon.gemetenWaarde) return 'bg-gray-400 border-gray-500 text-white'
  if (ballon.status === 'goed')      return 'bg-green-500 border-green-600 text-white'
  if (ballon.status === 'afgekeurd') return 'bg-red-500 border-red-600 text-white'
  return 'bg-orange-400 border-orange-500 text-white'
}

export default function BallonOverlay({
  ballon, containerRef, bewerkmodus, selected, onSelect, onDragEnd, onDelete,
}: BallonOverlayProps) {
  const [dragging, setDragging] = useState(false)
  const [pos, setPos] = useState({ xPct: ballon.xPct, yPct: ballon.yPct })

  if (!dragging && (pos.xPct !== ballon.xPct || pos.yPct !== ballon.yPct)) {
    setPos({ xPct: ballon.xPct, yPct: ballon.yPct })
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!bewerkmodus) { onSelect(ballon.id); return }
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPos({
      xPct: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width)  * 100)),
      yPct: Math.max(0, Math.min(100, ((e.clientY - rect.top)  / rect.height) * 100)),
    })
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    onDragEnd(ballon.id, pos.xPct, pos.yPct)
    onSelect(ballon.id)
  }

  return (
    <div
      data-ballon={ballon.id}
      style={{
        position: 'absolute',
        left: `${pos.xPct}%`,
        top:  `${pos.yPct}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        cursor: bewerkmodus ? (dragging ? 'grabbing' : 'grab') : 'pointer',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={e => { e.stopPropagation(); onSelect(ballon.id) }}
    >
      <div className={`
        w-7 h-7 rounded-full border-2 flex items-center justify-center
        text-xs font-bold shadow-md transition-transform
        ${getBallonKleur(ballon)}
        ${selected ? 'ring-2 ring-white ring-offset-1' : ''}
        ${dragging ? 'scale-110' : 'hover:scale-105'}
      `}>
        {ballon.nummer}
      </div>

      {/* Delete-knop: alleen in bewerkmodus, als grote tap-target (touch-friendly) */}
      {bewerkmodus && (
        <button
          className="absolute -top-2 -right-2 w-5 h-5 min-w-[20px] min-h-[20px] bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(ballon.id) }}
          title="Ballon verwijderen"
        >
          ×
        </button>
      )}
    </div>
  )
}
