import { useState, useRef, useEffect, ChangeEvent, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ChevronLeft, Plus, Upload, Trash2, X, Check,
  FileText, Cpu, Paperclip, Info,
  ExternalLink, RefreshCw, Wrench, PackageSearch, Layers,
  Download, FolderOpen, Lock, Unlock, GitCompare, Ruler,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const CadViewer = lazy(() => import('@/components/viewer/CadViewer'))

// ── Types ─────────────────────────────────────────────────────────────────────

interface BcOrder {
  no: string
  description: string
  articleNo: string
  status: string
}

interface BcRouting {
  operationNo: string
  description: string
  workCenterNo: string
}

interface FresMachine {
  id:          string
  machineId:   string | null
  name:        string
  category:    string
  photoUrl:    string | null
  isActive:    boolean
  stepCount:   number
}

interface SetupSummary {
  id:                string
  productionOrderNo: string | null
  articleNo:         string | null
  articleName:       string | null
  description:       string | null
  origin:            string
  createdAt:         string
  totalSteps:        number
  stepsOnMachine:    number
}

interface Step {
  id:              string
  setupId:         string
  stepNumber:      number
  bewerkingNr:     number | null
  stepName:        string
  machineId:       string | null
  machineName:     string | null
  machinePhotoUrl: string | null
  zeroX:           string | null
  zeroY:           string | null
  zeroZ:           string | null
  stepDescription: string | null
  ncFiles:         NcFile[]
  attachments:     Attachment[]
}

interface NcFile {
  id:            string
  stepId:        string
  fileName:      string
  programName:   string | null
  toolCallCount: number
  uploadedAt:    string
  toolCalls:     StoredToolCall[]
}

interface StoredToolCall {
  id:           string
  ncFileId:     string
  sequence:     number
  toolNumber:   number | null
  toolName:     string | null
  axis:         string | null
  spindleSpeed: number | null
}

interface Attachment {
  id:        string
  stepId:    string
  fileUrl:   string
  fileName:  string
  caption:   string | null
  mimeType:  string | null
  createdAt: string
}

interface Document {
  id:             string
  documentType:   string
  fileUrl:        string
  fileName:       string
  versionNote:    string | null
  mimeType:       string | null
  rapportageType: string | null
  uploadedAt:     string
  uploadedByName: string | null
}

interface InspectionFeature {
  id: string
  name: string
  type: string
  nominalX: number
  nominalY: number
  nominalZ: number
  measuredX: number
  measuredY: number
  measuredZ: number
  deviation: number
  tolerancePlus: number
  toleranceMinus: number
  status: 'pass' | 'fail'
}

interface InspectionResult {
  partName: string | null
  programName: string | null
  operator: string | null
  machine: string | null
  dateTime: string | null
  serialNumber: string | null
  features: InspectionFeature[]
  summary: { total: number; pass: number; fail: number }
}

interface SetupDetail {
  id:                string
  productionOrderNo: string | null
  articleNo:         string | null
  articleName:       string | null
  description:       string | null
  origin:            string
  createdAt:         string
  updatedAt:         string
  steps:             Step[]
  documents:         Document[]
}

interface ValidationToolCall {
  sequence:     number
  toolNumber:   number | null
  toolName:     string | null
  axis:         string | null
  spindleSpeed: number | null
  status:       'aanwezig' | 'ontbreekt' | 'onbekend'
  magazineEntry?: {
    toolNumber: number | null
    name:       string | null
    doc:        string | null
    l:          string | null
    r:          string | null
    dl:         string | null
    dr:         string | null
    time2:      string | null
    curTime:    string | null
    locked:     boolean | null
  }
  assembly?: {
    id:             string
    ncName:         string
    toolLength:     number | null
    presetDiameter: number | null
    components:     {
      itemId: string | null
      type: string; name: string; comment: string | null; category: string | null; reach: number | null
      orderingCode: string | null; manufacturer: string | null; photoUrl: string | null
      wisselplaatPhotoUrl: string | null; schroefOrderingCode: string | null; schroefPhotoUrl: string | null
    }[]
  } | null
  inOtherMachines?:   { machineId: string; machineName: string; toolNumber: number; count: number }[]
  componentsInStock?: { itemId: string; itemName: string; itemType: string; locations: { locId: string; locationCode: string; quantity: number }[] }[]
}

interface ValidationResult {
  ncFileId:    string
  programName: string | null
  machineId:   string | null
  machineName: string | null
  summary:     { total: number; present: number; missing: number }
  toolCalls:   ValidationToolCall[]
  lastSyncAt:  string | null
  validatedAt: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lifePercent(time2: string | null, curTime: string | null): number | null {
  const t2  = time2   ? parseFloat(time2)   : 0
  const cur = curTime ? parseFloat(curTime) : 0
  if (t2 <= 0) return null
  return Math.min((cur / t2) * 100, 100)
}

function lifeColor(pct: number | null): string {
  if (pct === null) return ''
  if (pct >= 100) return 'bg-red-700'
  if (pct >= 90)  return 'bg-red-500'
  if (pct >= 70)  return 'bg-orange-400'
  return 'bg-green-500'
}

function lifeDotColor(time2: string | null, curTime: string | null): string {
  const pct = lifePercent(time2, curTime)
  if (pct === null) {
    const cur = curTime ? parseFloat(curTime) : 0
    return cur > 0 ? 'bg-green-500' : 'bg-gray-300'
  }
  if (pct >= 100) return 'bg-red-700'
  if (pct >= 90)  return 'bg-red-500'
  if (pct >= 70)  return 'bg-orange-400'
  return 'bg-green-500'
}

function fmt(val: string | null): string {
  if (!val) return '—'
  const n = parseFloat(val)
  return isNaN(n) ? '—' : n.toFixed(3)
}

function fmtTime(val: string | null): string {
  if (!val) return '—'
  const n = parseFloat(val)
  return isNaN(n) ? '—' : n.toFixed(0)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function isImage(mimeType: string | null, fileName: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|svg)$/i.test(fileName)
}

// ── LifeBar (mini) ────────────────────────────────────────────────────────────

function LifeBarMini({ time2, curTime }: { time2: string | null; curTime: string | null }) {
  const pct = lifePercent(time2, curTime)
  if (pct === null) return <span className="text-gray-400 text-xs">—</span>
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', lifeColor(pct))} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── InlineEdit ────────────────────────────────────────────────────────────────

function InlineEdit({
  value, onSave, placeholder = '', className = '', textarea = false,
}: {
  value: string; onSave: (v: string) => void; placeholder?: string; className?: string; textarea?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (!editing) {
    return (
      <span
        className={cn('cursor-text hover:bg-gray-50 rounded px-1 -mx-1 transition-colors', className)}
        onClick={() => { setDraft(value); setEditing(true) }}
      >
        {value || <span className="text-gray-400 italic">{placeholder}</span>}
      </span>
    )
  }

  if (textarea) {
    return (
      <textarea
        autoFocus
        className={cn('w-full border border-teal-400 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-teal-400', className)}
        rows={3}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <input
      autoFocus
      className={cn('border border-teal-400 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400', className)}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
    />
  )
}

// ── Assembly helpers (zelfde logica als CNC machining) ────────────────────────

function parseWisselplaat(comment: string | null): { body: string; wisselplaat: string } | null {
  if (!comment) return null
  const idx = comment.indexOf('WP:')
  if (idx === -1) return null
  const body = comment.slice(0, idx).trim()
  const wisselplaat = comment.slice(idx + 3).trim()
  return body && wisselplaat ? { body, wisselplaat } : null
}

function componentLabel(type: string, category: string | null): string {
  if (type === 'holder') return 'Houder'
  if (type === 'extension') return 'Adapter'
  if (!category) return 'Onderdeel'
  if (['Endmill', 'Radiusmill', 'Ballmill', 'Lollipop', 'TSlotCutter', 'Woodruff', 'IndexableHighFeedCutter', 'IndexableRoundInsertCutter'].includes(category)) return 'Frees'
  if (['Drilltool', 'GunDrill'].includes(category)) return 'Boor'
  if (category === 'Tap') return 'Tap'
  if (category === 'Reamer') return 'Ruimer'
  if (category === 'ThreadMill') return 'Draadsnijder'
  if (category === 'BoringBar') return 'Uitboorder'
  return 'Gereedschap'
}

function componentBadgeColor(type: string, category: string | null): string {
  const label = componentLabel(type, category)
  return type === 'holder'    ? 'bg-blue-100 text-blue-700'   :
         type === 'extension' ? 'bg-gray-100 text-gray-600'   :
         label === 'Frees'    ? 'bg-green-100 text-green-700' :
         label === 'Boor'     ? 'bg-orange-100 text-orange-700' :
         label === 'Tap'      ? 'bg-purple-100 text-purple-700' :
         'bg-gray-100 text-gray-600'
}

interface DisplayRow {
  itemId: string | null
  label: string; labelColor: string; name: string
  photoUrl: string | null; orderingCode: string | null; manufacturer: string | null; reach: number | null
}

type AssemblyComponent = {
  itemId: string | null
  type: string; name: string; comment: string | null; category: string | null; reach: number | null
  orderingCode: string | null; manufacturer: string | null; photoUrl: string | null
  wisselplaatPhotoUrl: string | null; schroefOrderingCode: string | null; schroefPhotoUrl: string | null
}

function expandComponents(components: AssemblyComponent[]): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const c of components) {
    const wp = parseWisselplaat(c.comment)
    if (wp) {
      rows.push({ itemId: c.itemId, label: componentLabel(c.type, c.category), labelColor: componentBadgeColor(c.type, c.category), name: wp.body, photoUrl: c.photoUrl, orderingCode: c.orderingCode, manufacturer: c.manufacturer, reach: c.reach })
      rows.push({ itemId: null, label: 'Wisselplaat', labelColor: 'bg-yellow-100 text-yellow-700', name: wp.wisselplaat, photoUrl: c.wisselplaatPhotoUrl, orderingCode: null, manufacturer: null, reach: null })
      if (c.schroefOrderingCode || c.schroefPhotoUrl) {
        rows.push({ itemId: null, label: 'Schroef', labelColor: 'bg-gray-100 text-gray-500', name: c.schroefOrderingCode ?? '—', photoUrl: c.schroefPhotoUrl, orderingCode: null, manufacturer: null, reach: null })
      }
    } else {
      rows.push({ itemId: c.itemId, label: componentLabel(c.type, c.category), labelColor: componentBadgeColor(c.type, c.category), name: c.name, photoUrl: c.photoUrl, orderingCode: c.orderingCode, manufacturer: c.manufacturer, reach: c.reach })
    }
  }
  return rows
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'aanwezig' | 'ontbreekt' | 'onbekend' }) {
  if (status === 'aanwezig')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><Check size={10} />in machine</span>
  if (status === 'ontbreekt') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700"><Wrench size={10} />opbouwen</span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">onbekend</span>
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHERM 1 — Machine selectie
// ══════════════════════════════════════════════════════════════════════════════

function MachineGrid({ onSelect }: { onSelect: (m: FresMachine) => void }) {
  const { data: machines = [], isLoading } = useQuery<FresMachine[]>({
    queryKey: ['product-setup-machines'],
    queryFn:  () => apiFetch('/kiosk/product-setups/machines'),
  })

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-gray-400">Laden…</div>

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Product Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Selecteer een freesmachine om setups te bekijken of aan te maken</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {machines.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={cn(
              'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all text-left',
              m.isActive
                ? 'border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm'
                : 'border-gray-100 bg-gray-50 opacity-60',
            )}
          >
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
              {m.photoUrl
                ? <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
                : <Cpu size={28} className="text-gray-400" />
              }
            </div>
            <div className="w-full text-center">
              <p className="font-semibold text-sm text-gray-800 truncate">{m.name}</p>
              {m.machineId && <p className="text-xs text-gray-400 truncate">{m.machineId}</p>}
              <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-medium">
                {m.stepCount} {m.stepCount === 1 ? 'stap' : 'stappen'}
              </span>
            </div>
          </button>
        ))}
        {machines.length === 0 && (
          <p className="col-span-full text-gray-400 text-sm">Geen freesmachines gevonden. Voeg machines toe met categorie 'Freesmachine'.</p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHERM 2 — Product lijst
// ══════════════════════════════════════════════════════════════════════════════

function SetupList({
  machine, onBack, onSelect,
}: {
  machine: FresMachine
  onBack: () => void
  onSelect: (s: SetupSummary) => void
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newOrder, setNewOrder] = useState('')
  const [newArticle, setNewArticle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [showBcMsg, setShowBcMsg] = useState(false)
  const [isFromBc, setIsFromBc] = useState(false)
  const [bcOrderSearch, setBcOrderSearch] = useState('')

  const { data: bcOrders = [], isLoading: bcOrdersLoading } = useQuery<BcOrder[]>({
    queryKey: ['bc-production-orders'],
    queryFn:  () => apiFetch<BcOrder[]>('/kiosk/bc/production-orders'),
    enabled:  showBcMsg,
    staleTime: 60_000,
  })

  const { data: setups = [], isLoading } = useQuery<SetupSummary[]>({
    queryKey: ['product-setups', machine.id, search],
    queryFn:  () => apiFetch(`/kiosk/product-setups?machineId=${machine.id}&search=${encodeURIComponent(search)}`),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch<{ ok: boolean; setupId: string }>('/kiosk/product-setups', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setups', machine.id] })
      setShowNew(false); setNewOrder(''); setNewArticle(''); setNewDescription(''); setShowBcMsg(false); setIsFromBc(false); setBcOrderSearch('')
    },
  })

  function handleCreate() {
    if (!newOrder.trim()) return
    createMutation.mutate({ productionOrderNo: newOrder.trim(), articleNo: newArticle.trim() || undefined, description: newDescription.trim() || undefined, origin: isFromBc ? 'bc' : 'manual' })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
            {machine.photoUrl ? <img src={machine.photoUrl} alt="" className="w-full h-full object-cover" /> : <Cpu size={16} className="text-gray-400" />}
          </div>
          <span className="font-semibold text-gray-800">{machine.name}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={14} /> Nieuwe setup
        </button>
      </div>

      {/* Zoekbalk */}
      <div className="px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
            placeholder="Zoek op productieorder, artikel of omschrijving…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tegel-grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading && <p className="text-gray-400 text-sm">Laden…</p>}
        {!isLoading && setups.length === 0 && (
          <p className="text-gray-400 text-sm">Geen setups gevonden{search ? ' voor deze zoekopdracht' : ''}.</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {setups.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm transition-all text-left"
            >
              <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">
                {s.productionOrderNo ?? '—'}
              </p>
              {s.articleNo && (
                <p className="text-xs text-gray-500 truncate">{s.articleNo}</p>
              )}
              {s.description && (
                <p className="text-xs text-gray-400 truncate">{s.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                  {s.totalSteps} {s.totalSteps === 1 ? 'stap' : 'stappen'}
                </span>
                {s.stepsOnMachine > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    {s.stepsOnMachine} hier
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Nieuwe setup modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg text-gray-800">Nieuwe product setup</h2>
              <button onClick={() => setShowNew(false)} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
            </div>

            {/* Keuze */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                className={cn('flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-colors', !showBcMsg ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300')}
                onClick={() => { setShowBcMsg(false); setIsFromBc(false) }}
              >
                <FileText size={22} className={!showBcMsg ? 'text-teal-600' : 'text-gray-400'} />
                <span className={cn('text-sm font-medium', !showBcMsg ? 'text-teal-700' : 'text-gray-500')}>Handmatig</span>
              </button>
              <button
                className={cn('flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-colors', showBcMsg ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300')}
                onClick={() => setShowBcMsg(true)}
              >
                <ExternalLink size={22} className={showBcMsg ? 'text-teal-600' : 'text-gray-400'} />
                <span className={cn('text-sm font-medium', showBcMsg ? 'text-teal-700' : 'text-gray-500')}>Vanuit Business Central</span>
              </button>
            </div>

            {/* BC productieorder picker */}
            {showBcMsg && (
              <div className="mb-4 space-y-2">
                <input
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  placeholder="Zoek op ordernummer of omschrijving…"
                  value={bcOrderSearch}
                  onChange={e => setBcOrderSearch(e.target.value)}
                />
                {bcOrdersLoading ? (
                  <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-sm">
                    <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    Laden uit Business Central…
                  </div>
                ) : bcOrders.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-400">Geen productieorders gevonden in Business Central</p>
                ) : (
                  <ul className="max-h-56 overflow-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                    {bcOrders
                      .filter(o => {
                        const q = bcOrderSearch.toLowerCase()
                        return !q || o.no.toLowerCase().includes(q) || o.description.toLowerCase().includes(q) || o.articleNo.toLowerCase().includes(q)
                      })
                      .map(order => (
                        <li
                          key={order.no}
                          onClick={() => {
                            setNewOrder(order.no)
                            setNewArticle(order.articleNo)
                            setNewDescription(order.description)
                            setIsFromBc(true)
                            setShowBcMsg(false)
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-teal-50 cursor-pointer transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{order.no}</p>
                            <p className="text-xs text-gray-500 truncate">{order.articleNo}{order.description ? ` · ${order.description}` : ''}</p>
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0">{order.status}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {/* Handmatig formulier (ook getoond na BC-selectie voor controle/bewerking) */}
            {!showBcMsg && (
              <div className="space-y-3">
                {isFromBc && (
                  <p className="text-xs text-teal-600 flex items-center gap-1">
                    <Check size={12} />
                    Ingevuld vanuit Business Central — pas indien nodig aan
                  </p>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Productieorder <span className="text-red-500">*</span></label>
                  <input
                    autoFocus={!isFromBc}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. PO-2024-001"
                    value={newOrder}
                    onChange={e => setNewOrder(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Artikel</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. ART-0042"
                    value={newArticle}
                    onChange={e => setNewArticle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Omschrijving</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. Deksel 12345"
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                  />
                </div>
                <button
                  disabled={!newOrder.trim() || createMutation.isPending}
                  onClick={handleCreate}
                  className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Aanmaken…' : 'Aanmaken'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHERM 3 — Product detail
// ══════════════════════════════════════════════════════════════════════════════

function SetupDetail({
  setupId, machineId, onBack,
}: {
  setupId: string
  machineId: string
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [selectedStepId, setSelectedStepId]     = useState<string | null>(null)
  const [activeTab, setActiveTab]               = useState<'info' | 'cnc' | 'bijlagen' | 'overdracht'>('cnc')
  const [showAddStep, setShowAddStep]           = useState(false)
  const [newStepName, setNewStepName]           = useState('')
  const [newBewerkingNr, setNewBewerkingNr]     = useState('')
  const [showBcStepPicker, setShowBcStepPicker] = useState(false)
  const [bcStepSearch, setBcStepSearch]         = useState('')
  const [showMachinePicker, setShowMachinePicker] = useState(false)
  const [openPortal, setOpenPortal] = useState<'tekening' | 'cad' | 'meting' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedCadUrl, setSelectedCadUrl] = useState<string | null>(null)
  const [compareCadUrl, setCompareCadUrl]   = useState<string | null>(null)
  const [inspectionPoints, setInspectionPoints] = useState<InspectionFeature[]>([])

  const { data: setup, isLoading } = useQuery<SetupDetail>({
    queryKey: ['product-setup', setupId],
    queryFn:  () => apiFetch(`/kiosk/product-setups/${setupId}`),
  })


  const patchSetup = useMutation({
    mutationFn: (body: object) => apiFetch(`/kiosk/product-setups/${setupId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const deleteSetup = useMutation({
    mutationFn: () => apiFetch(`/kiosk/product-setups/${setupId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product-setups'] }); onBack() },
  })

  const patchStep = useMutation({
    mutationFn: ({ stepId, ...body }: { stepId: string } & Record<string, unknown>) =>
      apiFetch(`/kiosk/product-setups/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const addStep = useMutation({
    mutationFn: (body: object) => apiFetch<{ stepId: string }>(`/kiosk/product-setups/${setupId}/steps`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setSelectedStepId(res.stepId)
      setActiveTab('cnc')
      setShowAddStep(false); setNewStepName(''); setNewBewerkingNr(''); setShowBcStepPicker(false)
    },
  })

  const orderNo = setup?.productionOrderNo ?? null
  const { data: bcRoutings = [], isLoading: bcRoutingsLoading } = useQuery<BcRouting[]>({
    queryKey: ['bc-routings', orderNo],
    queryFn:  () => apiFetch<BcRouting[]>(`/kiosk/bc/production-orders/${encodeURIComponent(orderNo!)}/routings`),
    enabled:  showBcStepPicker && !!orderNo,
    staleTime: 120_000,
  })

  const deleteStep = useMutation({
    mutationFn: (stepId: string) => apiFetch(`/kiosk/product-setups/steps/${stepId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      if (selectedStepId) setSelectedStepId(null)
    },
  })

  const { data: machines = [] } = useQuery<FresMachine[]>({
    queryKey: ['product-setup-machines'],
    queryFn:  () => apiFetch('/kiosk/product-setups/machines'),
    enabled:  showMachinePicker,
  })

  if (isLoading || !setup) return <div className="flex-1 flex items-center justify-center text-gray-400">Laden…</div>

  const selectedStep = setup.steps.find(s => s.id === selectedStepId) ?? null

  // ── Stap detail view ──────────────────────────────────────────────────────
  if (selectedStep) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <button onClick={() => setSelectedStepId(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400">#{selectedStep.stepNumber}</span>
              <input
                type="number"
                min="1"
                className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="Bew."
                value={selectedStep.bewerkingNr ?? ''}
                onChange={e => patchStep.mutate({ stepId: selectedStep.id, bewerkingNr: e.target.value ? parseInt(e.target.value) : null })}
              />
              <InlineEdit
                value={selectedStep.stepName}
                onSave={v => patchStep.mutate({ stepId: selectedStep.id, stepName: v })}
                className="font-semibold text-gray-800"
                placeholder="Stapnaam"
              />
            </div>
            {selectedStep.machineName ? (
              <button onClick={() => setShowMachinePicker(true)} className="text-xs text-teal-600 hover:underline mt-0.5">
                {selectedStep.machineName} · wijzigen
              </button>
            ) : (
              <button onClick={() => setShowMachinePicker(true)} className="text-xs text-gray-400 hover:text-teal-600 mt-0.5">
                + Machine koppelen
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-gray-100 bg-white shrink-0">
          {(['info', 'cnc', 'bijlagen', 'overdracht'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {tab === 'info' ? 'Algemene informatie' : tab === 'cnc' ? 'CNC informatie' : tab === 'bijlagen' ? 'Bijlagen' : 'Overdracht'}
            </button>
          ))}
        </div>

        {/* Tab inhoud */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'info' && (() => {
            const cadFiles = setup.documents.filter(d => d.documentType === 'cad')
            const viewableCad = cadFiles.filter(d => /\.(stp|step|stl|cad)$/i.test(d.fileName))
            return (
              <div className="p-6 h-full flex gap-6 min-h-0">
                {/* Linker kolom: velden + document mappen */}
                <div className="w-72 shrink-0 space-y-5 overflow-auto">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Productieorder</label>
                    <InlineEdit
                      value={setup.productionOrderNo ?? ''}
                      onSave={v => patchSetup.mutate({ productionOrderNo: v || null })}
                      className="text-sm text-gray-800"
                      placeholder="Voer productieorder in…"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Artikel</label>
                    <InlineEdit
                      value={setup.articleNo ?? ''}
                      onSave={v => patchSetup.mutate({ articleNo: v || null })}
                      className="text-sm text-gray-800"
                      placeholder="Voer artikelnummer in…"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Bewerkingstap</label>
                    <p className="text-sm text-gray-800">
                      {selectedStep?.bewerkingNr != null ? `${selectedStep.bewerkingNr} – ` : ''}{selectedStep?.stepName ?? '—'}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Omschrijving</label>
                    <InlineEdit
                      value={setup.description ?? ''}
                      onSave={v => patchSetup.mutate({ description: v || null })}
                      className="text-sm text-gray-800"
                      placeholder="Voeg omschrijving toe…"
                      textarea
                    />
                  </div>

                  {/* Document portaal kaarten */}
                  <div className="grid grid-cols-2 gap-3">
                    {(['tekening', 'cad'] as const).map(type => {
                      const docs  = setup.documents.filter(d => d.documentType === type)
                      const label = type === 'tekening' ? 'Tekeningen' : 'CAD bestanden'
                      return (
                        <button
                          key={type}
                          onClick={() => setOpenPortal(type)}
                          className="flex flex-col items-start gap-1.5 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-teal-300 hover:shadow-sm transition-all text-left"
                        >
                          <div className="flex items-center justify-between w-full">
                            <FolderOpen size={16} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                              {docs.length}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">{label}</p>
                          <p className="text-[10px] text-gray-400">
                            {docs.length === 0
                              ? 'Nog niets toegevoegd'
                              : `Laatste: ${new Date(docs[0].uploadedAt).toLocaleDateString('nl-NL')}`}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                  {/* Meet bestanden kaart */}
                  {(() => {
                    const metingXml = setup.documents.filter(d => d.documentType === 'meting_xml')
                    const metingRap = setup.documents.filter(d => d.documentType === 'meting_rapport')
                    const hasPoints = inspectionPoints.length > 0
                    return (
                      <button
                        onClick={() => setOpenPortal('meting')}
                        className="flex flex-col items-start gap-1.5 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-teal-300 hover:shadow-sm transition-all text-left w-full"
                      >
                        <div className="flex items-center justify-between w-full">
                          <Ruler size={16} className={hasPoints ? 'text-teal-500' : 'text-gray-400'} />
                          <div className="flex items-center gap-1">
                            {metingXml.length > 0 && (
                              <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                                {metingXml.length} XML
                              </span>
                            )}
                            {metingRap.length > 0 && (
                              <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                                {metingRap.length} PDF
                              </span>
                            )}
                            {metingXml.length === 0 && metingRap.length === 0 && (
                              <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">0</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-medium text-gray-700">Meet bestanden</p>
                        <p className="text-[10px] text-gray-400">
                          {metingXml.length === 0 && metingRap.length === 0
                            ? 'Nog niets toegevoegd'
                            : hasPoints ? 'Meetpunten actief in viewer' : `${metingXml.length} XML · ${metingRap.length} rapport`}
                        </p>
                      </button>
                    )
                  })()}

                  {/* Bewerkingstappen */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Bewerkingstappen</label>
                    {setup.steps.length === 0 ? (
                      <p className="text-xs text-gray-400">Nog geen stappen aangemaakt</p>
                    ) : (
                      <ul className="space-y-1">
                        {setup.steps.map(step => (
                          <li key={step.id}>
                            <button
                              onClick={() => { setSelectedStepId(step.id); setActiveTab('cnc') }}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                selectedStepId === step.id
                                  ? 'bg-teal-50 border border-teal-200 text-teal-800'
                                  : 'hover:bg-gray-100 text-gray-700 border border-transparent',
                              )}
                            >
                              <span className="text-xs font-mono text-gray-400 shrink-0">#{step.stepNumber}</span>
                              {step.bewerkingNr != null && (
                                <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 shrink-0">
                                  {step.bewerkingNr}
                                </span>
                              )}
                              <span className="truncate font-medium">{step.stepName}</span>
                              {step.machineName && (
                                <span className="text-[10px] text-gray-400 shrink-0 ml-auto">{step.machineName}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Actief CAD bestand indicator */}
                  {selectedCadUrl && viewableCad.length > 0 && (
                    <div className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Layers size={10} className="text-teal-500" />
                      <span className="truncate">{viewableCad.find(f => f.fileUrl === selectedCadUrl)?.fileName ?? 'Model actief'}</span>
                    </div>
                  )}
                </div>

                {/* Rechter kolom: 3D viewer */}
                <div className="flex-1 min-w-0 min-h-0 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex flex-col" style={{ minHeight: 400 }}>
                  {viewableCad.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
                      <Layers size={32} />
                      <p className="text-sm">Geen CAD bestand beschikbaar</p>
                      <p className="text-xs text-gray-400">Upload een .stp of .stl bestand via CAD bestanden</p>
                    </div>
                  ) : (
                    <Suspense fallback={
                      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
                        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm">Viewer laden…</p>
                      </div>
                    }>
                      <CadViewer
                        url={selectedCadUrl ?? viewableCad[0].fileUrl}
                        fileName={cadFiles.find(f => f.fileUrl === (selectedCadUrl ?? viewableCad[0].fileUrl))?.fileName}
                        compareUrl={compareCadUrl ?? undefined}
                        compareFileName={cadFiles.find(f => f.fileUrl === compareCadUrl)?.fileName}
                        allCadFiles={viewableCad.map(f => ({ fileUrl: f.fileUrl, fileName: f.fileName }))}
                        inspectionPoints={inspectionPoints.length > 0 ? inspectionPoints : undefined}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            )
          })()}
          {activeTab === 'cnc'        && <CncInfoTab step={selectedStep} setupId={setupId} />}
          {activeTab === 'bijlagen'   && <BijlagenTab step={selectedStep} />}
          {activeTab === 'overdracht' && (
            <OverdrachtTab stepId={selectedStep.id} />
          )}
        </div>

        {/* Document portaal modal */}
        {(openPortal === 'tekening' || openPortal === 'cad') && (
          <DocumentPortalModal
            type={openPortal}
            docs={setup.documents.filter(d => d.documentType === openPortal)}
            setupId={setupId}
            onClose={() => setOpenPortal(null)}
            onSelectForViewer={openPortal === 'cad' ? (url) => { setSelectedCadUrl(url); setCompareCadUrl(null) } : undefined}
            onSelectForCompare={openPortal === 'cad' ? (url) => setCompareCadUrl(url) : undefined}
          />
        )}
        {openPortal === 'meting' && (
          <MeetPortalModal
            docs={setup.documents.filter(d => d.documentType === 'meting_xml' || d.documentType === 'meting_rapport')}
            setupId={setupId}
            onClose={() => setOpenPortal(null)}
            onShowOnModel={(features) => { setInspectionPoints(features); setOpenPortal(null) }}
          />
        )}

        {/* Machine picker modal */}
        {showMachinePicker && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowMachinePicker(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg text-gray-800">Machine selecteren</h2>
                <button onClick={() => setShowMachinePicker(false)} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
              </div>
              <div className="overflow-auto grid grid-cols-2 gap-3">
                {selectedStep.machineId && (
                  <button
                    onClick={() => { patchStep.mutate({ stepId: selectedStep.id, machineId: null }); setShowMachinePicker(false) }}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-red-300 hover:bg-red-50 transition-colors text-left col-span-2"
                  >
                    <X size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-500">Machine ontkoppelen</span>
                  </button>
                )}
                {machines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { patchStep.mutate({ stepId: selectedStep.id, machineId: m.id }); setShowMachinePicker(false) }}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                      {m.photoUrl ? <img src={m.photoUrl} alt="" className="w-full h-full object-cover" /> : <Cpu size={18} className="text-gray-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      {m.machineId && <p className="text-xs text-gray-400 truncate">{m.machineId}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Setup overzicht view ──────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={setup.productionOrderNo ?? ''}
            onSave={v => patchSetup.mutate({ productionOrderNo: v || null })}
            className="font-bold text-base text-gray-900"
            placeholder="Productieorder"
          />
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
            {setup.articleNo && <span>Art: {setup.articleNo}</span>}
            {setup.description && <span className="truncate max-w-xs">{setup.description}</span>}
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          title="Setup verwijderen"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-gray-800 mb-2">Setup verwijderen?</h2>
            <p className="text-sm text-gray-500 mb-6">
              Alle stappen, NC-bestanden en bijlagen worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => deleteSetup.mutate()}
                disabled={deleteSetup.isPending}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleteSetup.isPending ? 'Verwijderen…' : 'Verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content: Bewerkingstappen */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {setup.steps.map(step => (
              <div key={step.id} className="group relative">
                <button
                  onClick={() => { setSelectedStepId(step.id); setActiveTab('cnc') }}
                  className="w-full flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm transition-all text-left"
                >
                  <span className="text-xs font-mono text-gray-400">
                    #{step.stepNumber}{step.bewerkingNr != null ? ` · Bew. ${step.bewerkingNr}` : ''}
                  </span>
                  <p className="text-sm font-semibold text-gray-800 leading-snug">{step.stepName}</p>
                  {step.machineName && <p className="text-xs text-gray-500 truncate">{step.machineName}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                    {step.ncFiles.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                        {step.ncFiles.length} NC
                      </span>
                    )}
                    {step.attachments.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {step.attachments.length} bijlagen
                      </span>
                    )}
                    {step.machineId === machineId && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Hier</span>
                    )}
                  </div>
                </button>
                {/* Verwijder-knop */}
                <button
                  onClick={() => { if (confirm(`Bewerkingsstap "${step.stepName}" verwijderen?`)) deleteStep.mutate(step.id) }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-white/90 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  title="Stap verwijderen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {/* + Nieuwe stap tegel */}
            {!showAddStep ? (
              <button
                onClick={() => setShowAddStep(true)}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-teal-400 hover:text-teal-600 text-gray-400 transition-all min-h-[110px] col-span-full"
              >
                <Plus size={20} />
                <span className="text-sm font-medium">Nieuwe stap</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2 p-4 rounded-xl border-2 border-teal-400 bg-teal-50 min-h-[110px]">
                {/* BC-picker (alleen als er een productieorder bekend is) */}
                {orderNo && (
                  <div className="relative">
                    <button
                      onClick={() => setShowBcStepPicker(v => !v)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-teal-300 rounded-lg text-xs text-teal-700 hover:bg-teal-50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5"><ExternalLink size={11} />Kies bewerking uit Business Central</span>
                      <span className="text-gray-400">{showBcStepPicker ? '▲' : '▼'}</span>
                    </button>
                    {showBcStepPicker && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                            placeholder="Zoek op nr. of omschrijving…"
                            value={bcStepSearch}
                            onChange={e => setBcStepSearch(e.target.value)}
                          />
                        </div>
                        {bcRoutingsLoading ? (
                          <div className="flex items-center justify-center py-4 gap-2 text-gray-400 text-xs">
                            <div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                            Laden…
                          </div>
                        ) : bcRoutings.length === 0 ? (
                          <p className="py-3 text-center text-xs text-gray-400">Geen bewerkingen gevonden voor {orderNo}</p>
                        ) : (
                          <ul className="max-h-40 overflow-auto divide-y divide-gray-50">
                            {bcRoutings
                              .filter(r => {
                                const q = bcStepSearch.toLowerCase()
                                return !q || r.operationNo.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
                              })
                              .map(r => (
                                <li
                                  key={r.operationNo}
                                  onClick={() => {
                                    setNewBewerkingNr(r.operationNo)
                                    setNewStepName(r.description)
                                    setShowBcStepPicker(false)
                                    setBcStepSearch('')
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-teal-50 cursor-pointer transition-colors"
                                >
                                  <span className="text-xs font-mono font-semibold text-teal-700 w-10 shrink-0">{r.operationNo}</span>
                                  <span className="text-xs text-gray-700 flex-1 truncate">{r.description}</span>
                                  {r.workCenterNo && <span className="text-[10px] text-gray-400 shrink-0">{r.workCenterNo}</span>}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="w-14 border border-teal-400 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white text-center"
                    placeholder="Bew."
                    type="number"
                    min="1"
                    value={newBewerkingNr}
                    onChange={e => setNewBewerkingNr(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && (setShowAddStep(false), setNewStepName(''), setNewBewerkingNr(''), setShowBcStepPicker(false))}
                  />
                  <input
                    autoFocus={!orderNo}
                    className="flex-1 border border-teal-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                    placeholder="Stapnaam"
                    value={newStepName}
                    onChange={e => setNewStepName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newStepName.trim()) addStep.mutate({ stepName: newStepName.trim(), bewerkingNr: newBewerkingNr ? parseInt(newBewerkingNr) : undefined, machineId })
                      if (e.key === 'Escape') { setShowAddStep(false); setNewStepName(''); setNewBewerkingNr(''); setShowBcStepPicker(false) }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    disabled={!newStepName.trim() || addStep.isPending}
                    onClick={() => newStepName.trim() && addStep.mutate({ stepName: newStepName.trim(), bewerkingNr: newBewerkingNr ? parseInt(newBewerkingNr) : undefined, machineId })}
                    className="flex-1 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    {addStep.isPending ? 'Aanmaken…' : 'Aanmaken'}
                  </button>
                  <button onClick={() => { setShowAddStep(false); setNewStepName(''); setNewBewerkingNr(''); setShowBcStepPicker(false); setBcStepSearch('') }} className="p-1.5 rounded-lg hover:bg-white text-gray-500">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// TAB: CNC informatie
// ══════════════════════════════════════════════════════════════════════════════

function CncInfoTab({ step, setupId }: { step: Step; setupId: string }) {
  const qc = useQueryClient()
  const [selectedNcFileId, setSelectedNcFileId] = useState<string | null>(
    step.ncFiles.length > 0 ? step.ncFiles[step.ncFiles.length - 1].id : null
  )
  const [openTcSeq, setOpenTcSeq]     = useState<number | null>(null)
  const [showNcPortal, setShowNcPortal] = useState(false)
  const [syncStatus, setSyncStatus]   = useState<'idle' | 'syncing' | 'error'>('idle')
  const [syncError, setSyncError]     = useState<string | null>(null)

  async function handleSyncAndValidate() {
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      await apiFetch('/kiosk/cnc/trigger-sync', { method: 'POST' })
      await new Promise(r => setTimeout(r, 8000))
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Agent niet bereikbaar — alleen hervalideerd')
    }
    await validate()
    setSyncStatus('idle')
  }

  const patchStep = useMutation({
    mutationFn: (body: object) => apiFetch(`/kiosk/product-setups/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const { data: validation, isFetching: validating, refetch: validate } = useQuery<ValidationResult>({
    queryKey: ['nc-validate', selectedNcFileId],
    queryFn:  () => apiFetch(`/kiosk/product-setups/nc-files/${selectedNcFileId}/validate`),
    enabled:  false,
  })

  return (
    <div className="p-5 space-y-6 max-w-4xl">
      {/* Nulpunt */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nulpunt (Work Zero)</h3>
        <div className="flex gap-4">
          {(['zeroX', 'zeroY', 'zeroZ'] as const).map(axis => (
            <div key={axis}>
              <label className="text-xs text-gray-500 block mb-1">{axis.replace('zero', '')}</label>
              <input
                type="text"
                className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                defaultValue={step[axis] ?? ''}
                onBlur={e => patchStep.mutate({ [axis]: e.target.value.trim() || null })}
              />
            </div>
          ))}
        </div>
      </section>

      {/* NC bestanden */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">NC-programmabestanden (.h)</h3>

        {/* Portaal kaart */}
        {(() => {
          const activeFile = step.ncFiles.find(f => f.id === selectedNcFileId)
          return (
            <button
              onClick={() => setShowNcPortal(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-teal-300 hover:shadow-sm transition-all text-left mb-4"
            >
              <FolderOpen size={18} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                {activeFile ? (
                  <>
                    <p className="text-sm font-medium text-gray-800 truncate">{activeFile.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeFile.programName && <span className="mr-2">{activeFile.programName}</span>}
                      {activeFile.toolCallCount} tool calls · {fmtDate(activeFile.uploadedAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Geen bestand geselecteerd</p>
                )}
              </div>
              <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                {step.ncFiles.length}
              </span>
            </button>
          )
        })()}

        {/* Importeer / Sync knop voor actief bestand */}
        {selectedNcFileId && (
          <div className="flex items-center gap-2 mb-4">
            {!validation ? (
              <button
                onClick={() => validate()}
                disabled={validating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                <RefreshCw size={12} className={validating ? 'animate-spin' : ''} />
                Importeer samenstellingen
              </button>
            ) : (
              <button
                onClick={() => handleSyncAndValidate()}
                disabled={syncStatus === 'syncing' || validating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                <RefreshCw size={12} className={syncStatus === 'syncing' || validating ? 'animate-spin' : ''} />
                {syncStatus === 'syncing' ? 'Syncing…' : 'Sync & hervalideer'}
              </button>
            )}
            {syncError && <span className="text-xs text-red-500 max-w-[200px] truncate">{syncError}</span>}
          </div>
        )}

        {/* Tijdstempels */}
        {validation && (
          <div className="flex gap-4 mb-2 text-[11px] text-gray-400">
            {validation.validatedAt && (
              <span>
                Gevalideerd: <span className="font-medium text-gray-500">
                  {new Date(validation.validatedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </span>
            )}
            {validation.lastSyncAt ? (
              <span>
                Laatste sync: <span className="font-medium text-gray-500">
                  {new Date(validation.lastSyncAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </span>
            ) : (
              <span className="text-gray-300">Nog niet gesynchroniseerd</span>
            )}
          </div>
        )}

        {/* NC portal modal */}
        {showNcPortal && (
          <NcFilePortalModal
            files={step.ncFiles}
            stepId={step.id}
            setupId={setupId}
            activeId={selectedNcFileId}
            onSelect={id => { setSelectedNcFileId(id) }}
            onClose={() => setShowNcPortal(false)}
          />
        )}

        {/* Validatietabel */}
        {validation && (
          <div>
            {/* Summary */}
            <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm font-medium text-gray-700">
                {validation.programName && <span className="mr-2 text-gray-500">{validation.programName}</span>}
                Validatie: <span className="text-green-600">{validation.summary.present} in machine</span>
                {validation.summary.missing > 0 && <span className="text-orange-600"> · {validation.summary.missing} opbouwen</span>}
                <span className="text-gray-400"> van {validation.summary.total}</span>
              </div>
            </div>

            {/* Tabel */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-4 px-2 py-2" />
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">TOOL</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">NAME</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">DOC</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">L</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">DL</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">DR</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">TIME2</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">CUR.TIME</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 w-24">LIFE %</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">LOCK</th>
                    <th className="px-2 py-2 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {validation.toolCalls.map(tc => {
                    const me = tc.magazineEntry
                    return (
                      <tr key={tc.sequence} className={cn('group', tc.status === 'ontbreekt' && 'bg-red-50/40')}>
                        <td className="px-2 py-2">
                          <div className={cn('w-2 h-2 rounded-full', me
                            ? lifeDotColor(me.time2, me.curTime)
                            : tc.status === 'ontbreekt' ? 'bg-red-300' : 'bg-gray-200'
                          )} />
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-gray-800">
                          {me ? `T${me.toolNumber}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {me?.name ?? tc.toolName ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{me?.doc ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.l ?? null)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.dl ?? null)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.dr ?? null)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtTime(me?.time2 ?? null)}</td>
                        <td className={cn('px-3 py-2 text-right font-mono', (() => {
                          const t2 = me?.time2 ? parseFloat(me.time2) : 0
                          const ct = me?.curTime ? parseFloat(me.curTime) : 0
                          return t2 > 0 && ct >= t2 ? 'text-red-600 font-semibold' : 'text-gray-600'
                        })())}>{fmtTime(me?.curTime ?? null)}</td>
                        <td className="px-3 py-2">
                          <LifeBarMini time2={me?.time2 ?? null} curTime={me?.curTime ?? null} />
                        </td>
                        <td className="px-3 py-2">
                          {me ? (me.locked
                            ? <Lock size={13} className="text-gray-500" />
                            : <Unlock size={13} className="text-gray-300" />
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setOpenTcSeq(tc.sequence)}
                            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 transition-colors"
                          >
                            <Info size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Tool detail modal */}
      {openTcSeq !== null && validation && (() => {
        const tc = validation.toolCalls.find(t => t.sequence === openTcSeq)
        return tc ? <ToolDetailModal tc={tc} onClose={() => setOpenTcSeq(null)} /> : null
      })()}
    </div>
  )
}

// ── Overdracht portaal modal ──────────────────────────────────────────────────

interface OverdrachtPhoto {
  id:       string
  fileUrl:  string
  fileName: string
}

interface OverdrachtEntry {
  id:            string
  tekst:         string
  createdByName: string | null
  createdAt:     string
  photos:        OverdrachtPhoto[]
}

function OverdrachtTab({ stepId }: { stepId: string }) {
  const qc = useQueryClient()
  const [tekst, setTekst]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [lightbox, setLightbox]         = useState<{ photos: OverdrachtPhoto[]; index: number } | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editTekst, setEditTekst]       = useState('')
  const [savingEdit, setSavingEdit]     = useState(false)
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const { data: entries = [], isLoading } = useQuery<OverdrachtEntry[]>({
    queryKey: ['overdracht', stepId],
    queryFn:  () => apiFetch(`/kiosk/product-setups/steps/${stepId}/overdracht`),
  })

  async function handleSave() {
    if (!tekst.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/kiosk/product-setups/steps/${stepId}/overdracht`, {
        method: 'POST',
        body:   JSON.stringify({ tekst }),
      })
      setTekst('')
      qc.invalidateQueries({ queryKey: ['overdracht', stepId] })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editTekst.trim()) return
    setSavingEdit(true)
    try {
      await apiFetch(`/kiosk/product-setups/overdracht/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify({ tekst: editTekst }),
      })
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['overdracht', stepId] })
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Overdracht verwijderen?')) return
    await apiFetch(`/kiosk/product-setups/overdracht/${id}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['overdracht', stepId] })
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>, overdrachtId: string) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadingFor(overdrachtId)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/kiosk/product-setups/overdracht/${overdrachtId}/photos`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['overdracht', stepId] })
    } finally {
      setUploadingFor(null)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Log entries */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Laden…</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Info size={36} className="mb-2" />
            <p className="text-sm">Nog geen overdrachten gelogd</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map(e => (
              <li key={e.id} className="px-6 py-4 group">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-gray-700">{e.createdByName ?? 'Onbekend'}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(e.createdAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingId(e.id); setEditTekst(e.tekst) }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      title="Bewerken"
                    ><ExternalLink size={13} /></button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      title="Verwijderen"
                    ><Trash2 size={13} /></button>
                  </div>
                </div>

                {editingId === e.id ? (
                  <div className="mb-3">
                    <textarea
                      autoFocus
                      value={editTekst}
                      onChange={ev => setEditTekst(ev.target.value)}
                      rows={3}
                      className="w-full text-sm border border-teal-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-200"
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => handleSaveEdit(e.id)}
                        disabled={savingEdit || !editTekst.trim()}
                        className="px-3 py-1 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                      >{savingEdit ? 'Opslaan…' : 'Opslaan'}</button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                      >Annuleren</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{e.tekst}</p>
                )}

                {/* Thumbnails */}
                {e.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {e.photos.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => setLightbox({ photos: e.photos, index: idx })}
                        className="rounded-lg overflow-hidden border border-gray-200 hover:border-teal-400 transition-colors shrink-0"
                        style={{ width: 72, height: 72 }}
                      >
                        <img src={p.fileUrl} alt={p.fileName} style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Foto toevoegen */}
                <button
                  onClick={() => photoRefs.current[e.id]?.click()}
                  disabled={uploadingFor === e.id}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 disabled:opacity-50 transition-colors"
                >
                  <Plus size={12} />
                  {uploadingFor === e.id ? 'Uploaden…' : 'Foto toevoegen'}
                </button>
                <input
                  ref={el => { photoRefs.current[e.id] = el }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={ev => handlePhotoUpload(ev, e.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Nieuw bericht */}
      <div className="border-t border-gray-100 px-6 py-4 shrink-0">
        <textarea
          value={tekst}
          onChange={e => setTekst(e.target.value)}
          placeholder="Schrijf een overdracht…"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSave}
            disabled={saving || !tekst.trim()}
            className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setLightbox(null)}
          ><X size={20} /></button>

          {lightbox.index > 0 && (
            <button
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, index: l.index - 1 })) }}
            >‹</button>
          )}

          <img
            src={lightbox.photos[lightbox.index].fileUrl}
            alt={lightbox.photos[lightbox.index].fileName}
            className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />

          {lightbox.index < lightbox.photos.length - 1 && (
            <button
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, index: l.index + 1 })) }}
            >›</button>
          )}

          <div className="absolute bottom-4 text-white/60 text-xs">
            {lightbox.index + 1} / {lightbox.photos.length}
          </div>
        </div>
      )}
    </div>
  )
}

// ── NC bestand portaal modal ─────────────────────────────────────────────────

interface NcFile {
  id: string
  fileName: string
  programName: string | null
  toolCallCount: number
  uploadedAt: string
}

function NcFilePortalModal({
  files, stepId, setupId, activeId, onSelect, onClose,
}: {
  files: NcFile[]
  stepId: string
  setupId: string
  activeId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const deleteNcFile = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/product-setups/nc-files/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const renameNcFile = useMutation({
    mutationFn: ({ id, fileName }: { id: string; fileName: string }) =>
      apiFetch(`/kiosk/product-setups/nc-files/${id}`, { method: 'PATCH', body: JSON.stringify({ fileName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setRenamingId(null)
    },
  })

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ ncFileId: string }>(`/kiosk/product-setups/steps/${stepId}/nc-files`, {
        method: 'POST', body: fd,
      })
      await qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      onSelect(res.ncFileId)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const sorted = [...files].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-gray-400" />
            <p className="font-bold text-gray-800">NC-programmabestanden</p>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{files.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {uploading ? 'Bezig…' : 'Uploaden'}
            </button>
            <input ref={fileRef} type="file" accept=".h" className="hidden" onChange={handleUpload} />
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
          </div>
        </div>

        {uploadError && (
          <div className="mx-5 mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 shrink-0">{uploadError}</div>
        )}

        {/* Bestandslijst */}
        <div className="flex-1 overflow-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <FileText size={36} className="mb-2" />
              <p className="text-sm">Nog geen NC-bestanden geüpload</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {sorted.map(f => {
                const isActive = f.id === activeId
                const isRenaming = renamingId === f.id
                return (
                  <li
                    key={f.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3 group cursor-pointer',
                      isActive ? 'bg-teal-50' : 'hover:bg-gray-50',
                    )}
                    onClick={() => { if (!isRenaming) { onSelect(f.id); onClose() } }}
                  >
                    <FileText size={15} className={isActive ? 'text-teal-500 shrink-0' : 'text-gray-300 shrink-0'} />
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameNcFile.mutate({ id: f.id, fileName: renameValue })
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          className="text-sm border border-teal-300 rounded px-2 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-teal-200"
                        />
                      ) : (
                        <p className={cn('text-sm font-medium truncate', isActive ? 'text-teal-700' : 'text-gray-800')}>
                          {f.fileName}
                          {isActive && <span className="ml-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wide">actief</span>}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {f.programName && <span className="mr-2">{f.programName}</span>}
                        {f.toolCallCount} tool calls ·{' '}
                        {new Date(f.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {isRenaming ? (
                        <>
                          <button
                            onClick={() => renameNcFile.mutate({ id: f.id, fileName: renameValue })}
                            className="px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700"
                          >Opslaan</button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                          >Annuleren</button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setRenamingId(f.id); setRenameValue(f.fileName) }}
                          className="p-1.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Hernoemen"
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('NC bestand verwijderen?')) deleteNcFile.mutate(f.id) }}
                        className="p-1.5 rounded text-gray-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      ><Trash2 size={13} /></button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Document portaal modal ────────────────────────────────────────────────────

// ── MeetPortalModal ───────────────────────────────────────────────────────────

const RAPPORTAGE_LABELS: Record<string, string> = {
  frezen:     'Frezen',
  inmeten:    'Inmeten',
  controle:   'Controle',
  eindmeting: 'Eindmeting',
}

const RAPPORTAGE_COLORS: Record<string, string> = {
  frezen:     'text-teal-700 bg-teal-50 border-teal-200',
  inmeten:    'text-blue-700 bg-blue-50 border-blue-200',
  controle:   'text-orange-700 bg-orange-50 border-orange-200',
  eindmeting: 'text-green-700 bg-green-50 border-green-200',
}

function MeetPortalModal({
  docs, setupId, onClose, onShowOnModel,
}: {
  docs: Document[]
  setupId: string
  onClose: () => void
  onShowOnModel: (features: InspectionFeature[]) => void
}) {
  const qc = useQueryClient()
  const xmlFileRef = useRef<HTMLInputElement>(null)
  const rapFileRef = useRef<HTMLInputElement>(null)
  const [innerTab, setInnerTab] = useState<'xml' | 'rapport'>('xml')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedRapportageType, setSelectedRapportageType] = useState<string>('frezen')
  const [selectedRapType, setSelectedRapType] = useState<string>('controle')
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  const xmlDocs = docs.filter(d => d.documentType === 'meting_xml')
  const rapDocs = docs.filter(d => d.documentType === 'meting_rapport')

  const { data: inspectionData, isLoading: inspLoading } = useQuery<InspectionResult>({
    queryKey: ['inspection-data', selectedDocId],
    queryFn: () => apiFetch(`/kiosk/product-setups/documents/${selectedDocId}/inspection-data`) as Promise<InspectionResult>,
    enabled: !!selectedDocId,
  })

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setSelectedDocId(null)
    },
  })

  async function handleUpload(file: File, documentType: string, rapportageType?: string) {
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('documentType', documentType)
      if (rapportageType) fd.append('rapportageType', rapportageType)
      await apiFetch(`/kiosk/product-setups/${setupId}/documents`, { method: 'POST', body: fd })
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(`Upload mislukt: ${msg}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Ruler size={16} className="text-teal-500" />
            <p className="font-bold text-gray-800">Meet bestanden</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        {/* Inner tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {(['xml', 'rapport'] as const).map(t => (
            <button
              key={t}
              onClick={() => setInnerTab(t)}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                innerTab === t
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t === 'xml' ? `XML bestanden (${xmlDocs.length})` : `Rapporten (${rapDocs.length})`}
            </button>
          ))}
        </div>

        {uploadError && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100 shrink-0">{uploadError}</div>
        )}

        {/* XML tab */}
        {innerTab === 'xml' && (
          <div className="flex-1 overflow-auto flex flex-col">
            {/* Upload strip */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
              <select
                value={selectedRapportageType}
                onChange={e => setSelectedRapportageType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
              >
                <option value="frezen">Frezen</option>
                <option value="controle">Controle</option>
                <option value="eindmeting">Eindmeting</option>
              </select>
              <button
                onClick={() => xmlFileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={13} />
                {uploading ? 'Bezig…' : 'XML uploaden'}
              </button>
              <input
                ref={xmlFileRef}
                type="file"
                className="hidden"
                accept=".xml,.dmis"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f, 'meting_xml', selectedRapportageType)
                  e.target.value = ''
                }}
              />
            </div>

            {/* XML lijst */}
            {xmlDocs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-300">
                <Ruler size={32} className="mb-2" />
                <p className="text-sm">Nog geen XML meetbestanden toegevoegd</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {xmlDocs.map(doc => (
                  <li key={doc.id} className={cn('flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors', selectedDocId === doc.id && 'bg-teal-50')}>
                    <FileText size={16} className="text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(doc.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                        {doc.uploadedByName && <span className="ml-1">· {doc.uploadedByName}</span>}
                      </p>
                    </div>
                    {doc.rapportageType && (
                      <span className={cn('shrink-0 text-[10px] font-semibold border rounded-full px-2 py-0.5', RAPPORTAGE_COLORS[doc.rapportageType] ?? 'text-gray-600 bg-gray-50 border-gray-200')}>
                        {RAPPORTAGE_LABELS[doc.rapportageType] ?? doc.rapportageType}
                      </span>
                    )}
                    <button
                      onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                      className="p-1.5 rounded hover:bg-teal-50 text-gray-300 hover:text-teal-600 shrink-0 transition-colors"
                      title="Bekijk rapport"
                    >
                      <Info size={14} />
                    </button>
                    <button
                      onClick={() => deleteDoc.mutate(doc.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-200 hover:text-red-500 shrink-0 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Inspectie data tabel */}
            {selectedDocId && (
              <div className="border-t border-gray-100 shrink-0">
                {inspLoading ? (
                  <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
                    <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    Bezig met parsen…
                  </div>
                ) : inspectionData ? (
                  <div className="p-4 space-y-3">
                    {/* Samenvatting header */}
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 space-x-3">
                        {inspectionData.operator && <span>Operator: <strong>{inspectionData.operator}</strong></span>}
                        {inspectionData.dateTime && <span>Datum: <strong>{inspectionData.dateTime}</strong></span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className="text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          {inspectionData.summary.pass} OK
                        </span>
                        {inspectionData.summary.fail > 0 && (
                          <span className="text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                            {inspectionData.summary.fail} FAIL
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Feature tabel */}
                    {inspectionData.features.length > 0 && (
                      <div className="overflow-auto max-h-52 rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-gray-500">Feature</th>
                              <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Deviatie</th>
                              <th className="text-right px-3 py-2 font-semibold text-gray-500">Tol.</th>
                              <th className="text-center px-3 py-2 font-semibold text-gray-500">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {inspectionData.features.map(f => (
                              <tr key={f.id} className={f.status === 'fail' ? 'bg-red-50' : ''}>
                                <td className="px-3 py-1.5 font-medium text-gray-800 truncate max-w-[120px]">{f.name}</td>
                                <td className="px-3 py-1.5 text-gray-500">{f.type}</td>
                                <td className={cn('px-3 py-1.5 text-right font-mono', f.deviation > 0 ? 'text-orange-600' : f.deviation < 0 ? 'text-blue-600' : 'text-gray-500')}>
                                  {f.deviation >= 0 ? '+' : ''}{f.deviation.toFixed(3)}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-400 font-mono">±{f.tolerancePlus.toFixed(3)}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {f.status === 'pass'
                                    ? <Check size={12} className="inline text-green-500" />
                                    : <X size={12} className="inline text-red-500" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {inspectionData.features.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Geen features gevonden in dit XML bestand.</p>
                    ) : (
                      <button
                        onClick={() => onShowOnModel(inspectionData.features)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                      >
                        <Layers size={14} />
                        Toon meetpunten op 3D model
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Rapport tab */}
        {innerTab === 'rapport' && (
          <div className="flex-1 overflow-auto flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
              <select
                value={selectedRapType}
                onChange={e => setSelectedRapType(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
              >
                <option value="inmeten">Inmeten</option>
                <option value="controle">Controle</option>
                <option value="eindmeting">Eindmeting</option>
              </select>
              <button
                onClick={() => rapFileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={13} />
                {uploading ? 'Bezig…' : 'Rapport uploaden'}
              </button>
              <input
                ref={rapFileRef}
                type="file"
                className="hidden"
                accept=".pdf,.html"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f, 'meting_rapport', selectedRapType)
                  e.target.value = ''
                }}
              />
            </div>
            {rapDocs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-300">
                <FileText size={32} className="mb-2" />
                <p className="text-sm">Nog geen rapporten toegevoegd</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {rapDocs.map(doc => (
                  <li key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <FileText size={16} className="text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(doc.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                        {doc.uploadedByName && <span className="ml-1">· {doc.uploadedByName}</span>}
                      </p>
                    </div>
                    {doc.rapportageType && (
                      <span className={cn('shrink-0 text-[10px] font-semibold border rounded-full px-2 py-0.5', RAPPORTAGE_COLORS[doc.rapportageType] ?? 'text-gray-600 bg-gray-50 border-gray-200')}>
                        {RAPPORTAGE_LABELS[doc.rapportageType] ?? doc.rapportageType}
                      </span>
                    )}
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 shrink-0"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => deleteDoc.mutate(doc.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-200 hover:text-red-500 shrink-0 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DocumentPortalModal ───────────────────────────────────────────────────────

function DocumentPortalModal({
  type, docs, setupId, onClose, onSelectForViewer, onSelectForCompare,
}: {
  type: 'tekening' | 'cad'
  docs: Document[]
  setupId: string
  onClose: () => void
  onSelectForViewer?: (url: string) => void
  onSelectForCompare?: (url: string) => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('documentType', type)
      const result = await apiFetch(`/kiosk/product-setups/${setupId}/documents`, { method: 'POST', body: fd }) as { fileUrl: string; fileName: string }
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      if (type === 'cad' && onSelectForViewer && /\.(stp|step|stl|cad)$/i.test(result.fileName)) {
        onSelectForViewer(result.fileUrl)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadError(`Upload mislukt: ${msg}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const title = type === 'tekening' ? 'Tekeningen' : 'CAD bestanden'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-gray-400" />
            <p className="font-bold text-gray-800">{title}</p>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{docs.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {uploading ? 'Bezig…' : 'Uploaden'}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={type === 'tekening' ? 'application/pdf,image/*' : '.stp,.step,.stl,.cad,.dwg,.dxf,.iges,.igs'}
              onChange={handleUpload}
            />
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Foutmelding */}
        {uploadError && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100 shrink-0">
            {uploadError}
          </div>
        )}

        {/* Bestandslijst */}
        <div className="flex-1 overflow-auto">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <FolderOpen size={36} className="mb-2" />
              <p className="text-sm">Nog geen {title.toLowerCase()} toegevoegd</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-gray-50">
                  <FileText size={16} className="text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(doc.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                      {doc.uploadedByName && <span className="ml-1">· {doc.uploadedByName}</span>}
                    </p>
                  </div>
                  {type === 'cad' && /\.(stp|step|stl)$/i.test(doc.fileName) && (
                    <>
                      {onSelectForViewer && (
                        <button
                          onClick={() => { onSelectForViewer(doc.fileUrl); onClose() }}
                          className="p-1.5 rounded hover:bg-teal-50 text-gray-300 hover:text-teal-600 shrink-0 transition-colors"
                          title="Toon in 3D viewer"
                        >
                          <Layers size={14} />
                        </button>
                      )}
                      {onSelectForCompare && (
                        <button
                          onClick={() => { onSelectForCompare(doc.fileUrl); onClose() }}
                          className="p-1.5 rounded hover:bg-purple-50 text-gray-300 hover:text-purple-500 shrink-0 transition-colors"
                          title="Vergelijk met huidig model"
                        >
                          <GitCompare size={14} />
                        </button>
                      )}
                    </>
                  )}
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 shrink-0"
                  >
                    <Download size={14} />
                  </a>
                  <button
                    onClick={() => deleteDoc.mutate(doc.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-200 hover:text-red-500 shrink-0 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tool detail modal (Samenstelling · In machines · Voorraad) ────────────────

function ToolDetailModal({ tc, onClose }: { tc: ValidationToolCall; onClose: () => void }) {
  const [tab, setTab] = useState<'samenstelling' | 'machines' | 'voorraad'>('samenstelling')
  const qc = useQueryClient()

  // Machine-gebruik per component ophalen zodra de samenstelling-tab actief is
  const [componentMachines, setComponentMachines] = useState<Map<string, { machineName: string; toolNumber: number }[]>>(new Map())
  const [openMachinePopover, setOpenMachinePopover] = useState<string | null>(null)
  useEffect(() => {
    if (tab !== 'samenstelling' || !tc.assembly) return
    const itemIds = [...new Set(tc.assembly.components.map(c => c.itemId).filter((id): id is string => !!id))]
    if (itemIds.length === 0) return
    Promise.all(
      itemIds.map(id =>
        apiFetch(`/kiosk/cnc/components/${id}`)
          .then((d: unknown) => {
            const data = d as { assemblies: { instances: { machineName: string; toolNumber: number }[] }[] }
            return { id, instances: data.assemblies.flatMap(a => a.instances) }
          })
          .catch(() => ({ id, instances: [] }))
      )
    ).then(results => {
      const map = new Map<string, { machineName: string; toolNumber: number }[]>()
      for (const { id, instances } of results) {
        // Dedupliceer op machineName + toolNumber
        const seen = new Set<string>()
        map.set(id, instances.filter(inst => {
          const key = `${inst.machineName}:${inst.toolNumber}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }))
      }
      setComponentMachines(map)
    })
  }, [tab, tc.assembly])

  const uitnemen = useMutation({
    mutationFn: (locId: string) => apiFetch(`/kiosk/tooling/stock-locations/${locId}/mutate`, {
      method: 'POST',
      body: JSON.stringify({ delta: -1 }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nc-validate'] }),
  })

  const toolLabel = tc.assembly?.ncName ?? tc.toolName ?? (tc.toolNumber != null ? `T${tc.toolNumber}` : '—')
  const needsAssembly = tc.status === 'ontbreekt'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => { e.stopPropagation(); setOpenMachinePopover(null) }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-gray-800 truncate">{toolLabel}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {tc.assembly && (
                <span className="text-xs text-gray-400">
                  {tc.assembly.toolLength != null && `L ${tc.assembly.toolLength} mm`}
                  {tc.assembly.presetDiameter != null && ` · Ø ${tc.assembly.presetDiameter} mm`}
                </span>
              )}
              {needsAssembly && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  <Wrench size={10} /> Opbouwen vereist
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-gray-100 shrink-0">
          {([
            { key: 'samenstelling', label: 'Samenstelling', icon: <Layers size={13} /> },
            { key: 'machines',      label: `In machines (${tc.inOtherMachines?.length ?? 0})`, icon: <Cpu size={13} /> },
            { key: 'voorraad',      label: 'Voorraad', icon: <PackageSearch size={13} /> },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === t.key ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">

          {/* ── Samenstelling ── */}
          {tab === 'samenstelling' && (
            <div>
              {!tc.assembly || tc.assembly.components.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Geen samenstelling gevonden in de bibliotheek.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {expandComponents(tc.assembly.components).map((row, i) => (
                    <div key={i} className="flex items-start gap-3 py-3">
                      <span className="text-xs text-gray-300 w-5 text-right shrink-0 mt-1">{i + 1}</span>
                      <div className="shrink-0">
                        {row.photoUrl ? (
                          <div className="rounded bg-gray-100 overflow-hidden border border-gray-100" style={{ width: 80, height: 80 }}>
                            <img src={row.photoUrl} alt="" style={{ width: 80, height: 80, objectFit: 'contain', display: 'block' }} />
                          </div>
                        ) : (
                          <div className="rounded bg-gray-50 border border-gray-100" style={{ width: 80, height: 80 }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', row.labelColor)}>
                            {row.label}
                          </span>
                          <span className="text-sm font-medium text-gray-800 truncate">{row.name}</span>
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                          {row.manufacturer && <span>{row.manufacturer}</span>}
                          {row.orderingCode && <span className="font-mono">{row.orderingCode}</span>}
                          {row.reach != null && <span>Bereik: {row.reach.toFixed(1)} mm</span>}
                        </div>
                        {row.itemId && (() => {
                          const instances = componentMachines.get(row.itemId)
                          if (!instances) return null
                          const popoverId = `${row.itemId}-${i}`
                          const isOpen = openMachinePopover === popoverId
                          return (
                            <div className="relative mt-1">
                              <button
                                onClick={e => { e.stopPropagation(); setOpenMachinePopover(isOpen ? null : popoverId) }}
                                className={cn(
                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors',
                                  instances.length > 0
                                    ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                                    : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100',
                                )}
                              >
                                <Cpu size={9} />
                                {instances.length === 0 ? 'Niet in machine' : `${instances.length} machine${instances.length !== 1 ? 's' : ''}`}
                              </button>
                              {isOpen && instances.length > 0 && (
                                <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
                                  onClick={e => e.stopPropagation()}>
                                  {instances.map((inst, j) => (
                                    <div key={j} className="flex items-center justify-between gap-4 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                      <span className="font-medium truncate">{inst.machineName}</span>
                                      <span className="font-mono text-gray-400 shrink-0">T{inst.toolNumber}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── In machines ── */}
          {tab === 'machines' && (
            <div>
              {!tc.inOtherMachines?.length ? (
                <p className="text-sm text-gray-400 italic">Niet aangetroffen in andere machines.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                      <th className="text-left pb-2 font-semibold">Machine</th>
                      <th className="text-left pb-2 font-semibold">Positie</th>
                      <th className="text-right pb-2 font-semibold">Aantal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tc.inOtherMachines.map((m, i) => (
                      <tr key={i}>
                        <td className="py-2 font-medium text-gray-700">{m.machineName}</td>
                        <td className="py-2 text-gray-500 font-mono">T{m.toolNumber}</td>
                        <td className="py-2 text-right text-gray-500">{m.count}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Voorraad ── */}
          {tab === 'voorraad' && (
            <div>
              {!tc.componentsInStock?.length ? (
                <p className="text-sm text-gray-400 italic">Geen componenten op voorraad gevonden.</p>
              ) : (
                <div className="space-y-4">
                  {tc.componentsInStock.map(item => (
                    <div key={item.itemId}>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                        {item.itemName} <span className="font-normal text-gray-400">({item.itemType})</span>
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-100">
                            <th className="text-left pb-1.5 font-semibold">Locatie</th>
                            <th className="text-right pb-1.5 font-semibold">Aantal</th>
                            <th className="pb-1.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {item.locations.map(loc => (
                            <tr key={loc.locId}>
                              <td className="py-2 font-mono text-gray-700">{loc.locationCode}</td>
                              <td className="py-2 text-right text-gray-600">{loc.quantity} st.</td>
                              <td className="py-2 pl-3">
                                <button
                                  disabled={uitnemen.isPending || loc.quantity === 0}
                                  onClick={() => uitnemen.mutate(loc.locId)}
                                  className="px-2.5 py-1 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors"
                                >
                                  Uitnemen
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Bijlagen
// ══════════════════════════════════════════════════════════════════════════════

function BijlagenTab({ step }: { step: Step }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null)

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/product-setups/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', step.setupId] }),
  })

  const updateCaption = useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string }) =>
      apiFetch(`/kiosk/product-setups/attachments/${id}`, { method: 'PATCH', body: JSON.stringify({ caption }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', step.setupId] }),
  })

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/kiosk/product-setups/steps/${step.id}/attachments`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['product-setup', step.setupId] })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bijlagen</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          <Paperclip size={13} /> {uploading ? 'Uploaden…' : 'Bijlage toevoegen'}
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>

      {step.attachments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nog geen bijlagen voor deze stap</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {step.attachments.map(att => {
            const isImg = isImage(att.mimeType, att.fileName)
            const imageAttachments = step.attachments.filter(a => isImage(a.mimeType, a.fileName))
            const imgIndex = imageAttachments.findIndex(a => a.id === att.id)
            return (
              <div key={att.id} className="group relative flex flex-col gap-1.5">
                {/* Thumbnail / icoon */}
                <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center relative">
                  {isImg ? (
                    <button
                      className="w-full h-full"
                      onClick={() => setLightbox({ images: imageAttachments.map(a => ({ url: a.fileUrl, name: a.fileName })), index: imgIndex })}
                    >
                      <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-1 p-2">
                      <FileText size={28} className="text-gray-400" />
                      <p className="text-xs text-gray-500 text-center break-all leading-tight">{att.fileName}</p>
                      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline">Download</a>
                    </div>
                  )}
                  {/* Delete overlay */}
                  <button
                    onClick={() => { if (confirm('Bijlage verwijderen?')) deleteAttachment.mutate(att.id) }}
                    className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow"
                  ><X size={12} /></button>
                </div>
                {/* Caption */}
                <InlineEdit
                  value={att.caption ?? ''}
                  onSave={caption => updateCaption.mutate({ id: att.id, caption })}
                  placeholder="Bijschrift toevoegen…"
                  className="text-xs text-gray-600 w-full"
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={() => setLightbox(null)}
          ><X size={20} /></button>

          {lightbox.index > 0 && (
            <button
              className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl"
              onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, index: l.index - 1 })) }}
            >‹</button>
          )}

          <img
            src={lightbox.images[lightbox.index].url}
            alt={lightbox.images[lightbox.index].name}
            className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />

          {lightbox.index < lightbox.images.length - 1 && (
            <button
              className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl"
              onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, index: l.index + 1 })) }}
            >›</button>
          )}

          <div className="absolute bottom-4 text-white/60 text-xs">
            {lightbox.index + 1} / {lightbox.images.length}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export function ProductSetupContent() {
  const [machine, setMachine]   = useState<FresMachine | null>(null)
  const [setup, setSetup]       = useState<SetupSummary | null>(null)

  if (!machine) return <MachineGrid onSelect={setMachine} />

  if (!setup) return (
    <SetupList
      machine={machine}
      onBack={() => setMachine(null)}
      onSelect={setSetup}
    />
  )

  return (
    <SetupDetail
      setupId={setup.id}
      machineId={machine.id}
      onBack={() => setSetup(null)}
    />
  )
}
