import { useState, useRef, useEffect, ChangeEvent, lazy, Suspense, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ChevronLeft, Plus, Upload, Trash2, X, Check, Pencil,
  FileText, Cpu, Paperclip, Info,
  ExternalLink, RefreshCw, Wrench, PackageSearch, Layers,
  Download, FolderOpen, Lock, Unlock, GitCompare, Ruler, Send, AlertTriangle,
  ClipboardCheck, CheckCircle2, ListChecks, ChevronDown,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import PdfViewer from '@/components/PdfViewer'
import BallonOverlay, { type BallonData } from '@/components/BallonOverlay'
import { type TextItem } from '@/lib/pdfjs'
import { detectMaatAnnotaties } from '@/lib/tekening-detectie'

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
  id:                   string
  setupId:              string
  stepNumber:           number
  bewerkingNr:          number | null
  stepName:             string
  machineId:            string | null
  machineName:          string | null
  machinePhotoUrl:      string | null
  machinePostprocessors: string[]
  zeroX:                string | null
  zeroY:                string | null
  zeroZ:                string | null
  stepDescription:      string | null
  opmerkingen:          string | null
  checklistCompleted:   boolean
  ncFiles:              NcFile[]
  attachments:          Attachment[]
}

interface NcFile {
  id:            string
  stepId:        string
  fileName:      string
  programName:   string | null
  postprocessor: string | null
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
  beschrijving:   string | null
  mimeType:       string | null
  rapportageType: string | null
  uploadedAt:     string
  uploadedByName: string | null
}

interface InspectionAxis {
  axis: string
  nominal: number
  measured: number
  deviation: number
  tolerancePlus: number
  toleranceMinus: number
  outOfTol: boolean
  min?: number
  max?: number
}

interface InspectionFeature {
  id: string
  name: string
  type: string
  dimensionType: string
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
  axes?: InspectionAxis[]
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
  matenNiveau:       string
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

interface FileValidationResult {
  ncFileId:    string
  fileName:    string
  programName: string | null
  summary:     { total: number; present: number; missing: number }
  toolCalls:   ValidationToolCall[]
  validatedAt: string
}

interface StepValidationResult {
  files:       FileValidationResult[]
  aggregate:   { total: number; present: number; missing: number }
  machineId:   string | null
  machineName: string | null
  lastSyncAt:  string | null
  validatedAt: string
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
            <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
              {m.photoUrl
                ? <img src={m.photoUrl} alt={m.name} className="block w-full h-full object-contain" />
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
        {/* Niet vooraf bepaalde machine */}
        <button
          onClick={() => onSelect({ id: 'none', machineId: null, name: 'Niet vooraf bepaalde machine', category: 'Freesmachine', photoUrl: null, isActive: true, stepCount: 0 })}
          className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm transition-all text-left"
        >
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
            <FolderOpen size={28} className="text-gray-400" />
          </div>
          <div className="w-full text-center">
            <p className="font-semibold text-sm text-gray-800">Niet vooraf bepaalde machine</p>
            <p className="text-xs text-gray-400 mt-0.5">Machine later te kiezen</p>
          </div>
        </button>
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
  const [editSetup, setEditSetup] = useState<SetupSummary | null>(null)
  const [editOrder, setEditOrder] = useState('')
  const [editArticle, setEditArticle] = useState('')
  const [editDescription, setEditDescription] = useState('')

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
    onSuccess: (res, variables) => {
      const v = variables as { productionOrderNo: string; articleNo?: string; description?: string; origin?: string }
      setShowNew(false); setNewOrder(''); setNewArticle(''); setNewDescription(''); setShowBcMsg(false); setIsFromBc(false); setBcOrderSearch('')
      onSelect({
        id:                res.setupId,
        productionOrderNo: v.productionOrderNo,
        articleNo:         v.articleNo ?? null,
        articleName:       null,
        description:       v.description ?? null,
        origin:            v.origin ?? 'manual',
        createdAt:         new Date().toISOString(),
        totalSteps:        0,
        stepsOnMachine:    0,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; productionOrderNo: string; articleNo: string; description: string }) =>
      apiFetch(`/kiosk/product-setups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setups', machine.id] })
      setEditSetup(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/product-setups/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setups', machine.id] }),
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
            <div key={s.id} className="relative group">
              <button
                onClick={() => onSelect(s)}
                className="w-full flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm transition-all text-left"
              >
                <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug pr-10">
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
              {/* Acties op hover */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setEditSetup(s); setEditOrder(s.productionOrderNo ?? ''); setEditArticle(s.articleNo ?? ''); setEditDescription(s.description ?? '') }}
                  className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-colors"
                  title="Bewerken"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); if (confirm(`Setup "${s.productionOrderNo}" verwijderen? Alle stappen en bestanden gaan verloren.`)) deleteMutation.mutate(s.id) }}
                  className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
                  title="Verwijderen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
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
                    placeholder="bijv. 2604129"
                    value={newOrder}
                    onChange={e => setNewOrder(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Artikel</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. 26013-1300-00"
                    value={newArticle}
                    onChange={e => setNewArticle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Omschrijving</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. WING BODY W INSTRUMENTATION"
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

      {/* Edit setup modal */}
      {editSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditSetup(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg text-gray-800">Setup bewerken</h2>
              <button onClick={() => setEditSetup(null)} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Productieorder <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  value={editOrder}
                  onChange={e => setEditOrder(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Artikel</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  value={editArticle}
                  onChange={e => setEditArticle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Omschrijving</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditSetup(null)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  disabled={!editOrder.trim() || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: editSetup.id, productionOrderNo: editOrder.trim(), articleNo: editArticle.trim(), description: editDescription.trim() })}
                  className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {updateMutation.isPending ? 'Opslaan…' : 'Opslaan'}
                </button>
              </div>
            </div>
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
  const [activeTab, setActiveTab]               = useState<'info' | 'cnc' | 'bijlagen' | 'overdracht' | 'maten'>('info')
  const [showAddStep, setShowAddStep]           = useState(false)
  const [newStepName, setNewStepName]           = useState('')
  const [newBewerkingNr, setNewBewerkingNr]     = useState('')
  const [showBcStepPicker, setShowBcStepPicker] = useState(false)
  const [bcStepSearch, setBcStepSearch]         = useState('')
  const [showMachinePicker, setShowMachinePicker] = useState(false)
  const [openPortal, setOpenPortal] = useState<'tekening' | 'cad' | 'meting' | 'hypermill' | 'aanpak_frezen' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [matenPanelOpen, setMatenPanelOpen] = useState(false)
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
                key={`bew-${selectedStep.id}-${selectedStep.bewerkingNr}`}
                type="number"
                min="1"
                className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="Bew."
                defaultValue={selectedStep.bewerkingNr ?? ''}
                onBlur={e => patchStep.mutate({ stepId: selectedStep.id, bewerkingNr: e.target.value ? parseInt(e.target.value) : null })}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
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
          <button
            disabled
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-300 cursor-not-allowed"
            title="Binnenkort beschikbaar"
          >
            Maten
          </button>
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


                  {/* Hypermill & Aanpak frezen kaarten */}
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: 'hypermill',     label: 'Hypermill bestanden' },
                      { key: 'aanpak_frezen', label: 'Aanpak frezen' },
                    ] as const).map(({ key, label }) => {
                      const count = setup.documents.filter(d => d.documentType === key).length
                      const last  = setup.documents.filter(d => d.documentType === key)[0]
                      return (
                        <button
                          key={key}
                          onClick={() => setOpenPortal(key)}
                          className="flex flex-col items-start gap-1.5 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-teal-300 hover:shadow-sm transition-all text-left"
                        >
                          <div className="flex items-center justify-between w-full">
                            <FolderOpen size={16} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                              {count}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">{label}</p>
                          <p className="text-[10px] text-gray-400">
                            {count === 0
                              ? 'Nog niets toegevoegd'
                              : `Laatste: ${new Date(last.uploadedAt).toLocaleDateString('nl-NL')}`}
                          </p>
                        </button>
                      )
                    })}
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
          {activeTab === 'maten' && (
            <MatenTab setupId={setupId} setupType="product" matenNiveau={setup.matenNiveau} onNiveauChange={v => patchSetup.mutate({ matenNiveau: v })} />
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
            docs={setup.documents.filter(d => ['meting_xml', 'meting_rapport', 'iges'].includes(d.documentType))}
            setupId={setupId}
            onClose={() => setOpenPortal(null)}
            onShowOnModel={(features) => { setInspectionPoints(features); setOpenPortal(null) }}
          />
        )}
        {openPortal === 'hypermill' && (
          <HypermillModal
            docs={setup.documents.filter(d => d.documentType === 'hypermill')}
            setupId={setupId}
            onClose={() => setOpenPortal(null)}
          />
        )}
        {openPortal === 'aanpak_frezen' && (
          <AanpakFrezenModal
            docs={setup.documents.filter(d => d.documentType === 'aanpak_frezen')}
            setupId={setupId}
            onClose={() => setOpenPortal(null)}
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
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                      {m.photoUrl ? <img src={m.photoUrl} alt="" className="block w-full h-full object-contain" /> : <Cpu size={18} className="text-gray-400" />}
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
        {/* Setup-niveau maten sectie — tijdelijk uitgeschakeld */}
        {false && (
          <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setMatenPanelOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ListChecks size={15} className="text-teal-600" />
                <span className="text-sm font-semibold text-gray-700">Maten (setup-niveau)</span>
              </div>
              <ChevronDown size={15} className={cn('text-gray-400 transition-transform', matenPanelOpen && 'rotate-180')} />
            </button>
            {matenPanelOpen && (
              <div className="bg-white">
                <MatenTab setupId={setupId} setupType="product" matenNiveau={setup?.matenNiveau} onNiveauChange={v => patchSetup.mutate({ matenNiveau: v })} />
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {setup.steps.map(step => (
              <div key={step.id} className="group relative">
                <button
                  onClick={() => { setSelectedStepId(step.id); setActiveTab('info') }}
                  className="w-full flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-teal-400 hover:bg-teal-50 hover:shadow-sm transition-all text-left"
                >
                  <span className="text-xs font-mono text-gray-400">#{step.stepNumber}</span>
                  {step.bewerkingNr != null && (
                    <div className="text-xs text-gray-500">Bewerkstap: <span className="font-semibold text-teal-600">{step.bewerkingNr}</span></div>
                  )}
                  <div className="text-xs text-gray-500">Stapnaam: <span className="text-sm font-semibold text-gray-800">{step.stepName}</span></div>
                  {step.machineName && <div className="text-xs text-gray-500 truncate">{step.machineName}</div>}
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
                    {(machineId === 'none' ? step.machineId === null : step.machineId === machineId) && (
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
                      if (e.key === 'Enter' && newStepName.trim()) addStep.mutate({ stepName: newStepName.trim(), bewerkingNr: newBewerkingNr ? parseInt(newBewerkingNr) : undefined, machineId: machineId === 'none' ? undefined : machineId })
                      if (e.key === 'Escape') { setShowAddStep(false); setNewStepName(''); setNewBewerkingNr(''); setShowBcStepPicker(false) }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    disabled={!newStepName.trim() || addStep.isPending}
                    onClick={() => newStepName.trim() && addStep.mutate({ stepName: newStepName.trim(), bewerkingNr: newBewerkingNr ? parseInt(newBewerkingNr) : undefined, machineId: machineId === 'none' ? undefined : machineId })}
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
  const [openTcKey, setOpenTcKey]     = useState<string | null>(null)
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

  const CHECKLIST_ITEMS = [
    'Alle tools uit tooltabel aanwezig in machine (groen)',
    'Nulpunt (Work Zero) correct ingesteld',
    'NC-programma in machine geladen',
    'Juist NC-programma geselecteerd',
    'DL / DR waarden op 0 in tooltabel',
  ]
  const [checks, setChecks] = useState<boolean[]>(Array(5).fill(false))
  const allChecked = checks.every(Boolean)

  const [showEditor, setShowEditor]         = useState(false)
  const [editorContent, setEditorContent]   = useState('')
  const [editorOriginal, setEditorOriginal] = useState('')
  const [editorConfirm, setEditorConfirm]   = useState<'save' | 'discard' | null>(null)

  const [editorError, setEditorError] = useState<string | null>(null)

  async function openEditor() {
    if (!selectedNcFileId) return
    setEditorError(null)
    try {
      const res = await apiFetch<{ fileContent: string; fileName: string }>(`/kiosk/product-setups/nc-files/${selectedNcFileId}/content`)
      setEditorContent(res.fileContent ?? '')
      setEditorOriginal(res.fileContent ?? '')
      setShowEditor(true)
    } catch (err: any) {
      setEditorError(err.message ?? 'Laden mislukt')
    }
  }

  function closeEditor() {
    if (editorContent !== editorOriginal) {
      setEditorConfirm('discard')
    } else {
      setShowEditor(false)
    }
  }

  const saveContent = useMutation({
    mutationFn: () => apiFetch(`/kiosk/product-setups/nc-files/${selectedNcFileId}/content`, {
      method: 'PATCH',
      body: JSON.stringify({ fileContent: editorContent }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      qc.invalidateQueries({ queryKey: ['step-validate-all', step.id] })
      setEditorOriginal(editorContent)
      setEditorConfirm(null)
      setShowEditor(false)
    },
  })

  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const sendToMachine = useMutation({
    mutationFn: (ncFileId: string) =>
      apiFetch(`/kiosk/product-setups/nc-files/${ncFileId}/send-to-machine`, { method: 'POST' }),
    onSuccess: (res: any) => {
      setSendResult({ ok: true, msg: `Bestand verstuurd naar machine` })
      setTimeout(() => setSendResult(null), 5000)
    },
    onError: (err: any) => setSendResult({ ok: false, msg: err.message ?? 'Versturen mislukt' }),
  })

  const { data: stepValidation, isFetching: validating, refetch: validate } = useQuery<StepValidationResult>({
    queryKey: ['step-validate-all', step.id],
    queryFn:  () => apiFetch(`/kiosk/product-setups/steps/${step.id}/validate-all`) as Promise<StepValidationResult>,
  })

  return (
    <div className="p-5 space-y-6 max-w-4xl">
      {/* Nulpunt + Opmerkingen + Checklist */}
      <div className="flex gap-8 items-start">
        <section className="shrink-0">
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
        <div className="flex-1 grid gap-12 items-start" style={{ gridTemplateColumns: '1fr 200px' }}>
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Opmerkingen</h3>
          <textarea
            key={step.id}
            className="w-full h-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-1 focus:ring-teal-400"
            placeholder="Opmerkingen voor deze stap…"
            defaultValue={step.opmerkingen ?? ''}
            onBlur={e => patchStep.mutate({ opmerkingen: e.target.value.trim() || null })}
          />
        </section>
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <ClipboardCheck size={13} />
            Checklist
          </h3>
          {step.checklistCompleted ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-green-700 font-medium">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                Checklist voltooid
              </div>
              <button
                onClick={() => { patchStep.mutate({ checklistCompleted: false }); setChecks(Array(5).fill(false)) }}
                className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0"
              >
                Opnieuw
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checks[i]}
                    onChange={e => setChecks(c => c.map((v, j) => j === i ? e.target.checked : v))}
                    className="mt-0.5 accent-teal-600"
                  />
                  <span className="text-xs text-gray-700 leading-snug">{item}</span>
                </label>
              ))}
              <button
                disabled={!allChecked || patchStep.isPending}
                onClick={() => patchStep.mutate({ checklistCompleted: true })}
                className={cn(
                  'mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  allChecked
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                )}
              >
                <Check size={12} />
                Bevestig checklist
              </button>
            </div>
          )}
        </section>
        </div>
      </div>

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

        {/* Knoppen */}
        {step.ncFiles.length > 0 && (() => {
          const selFile = selectedNcFileId ? step.ncFiles.find(f => f.id === selectedNcFileId) : null
          const filePp = selFile?.postprocessor ?? null
          const machinePps = step.machinePostprocessors ?? []
          const ppBlocked = !!filePp && machinePps.length > 0 &&
            !machinePps.some(pp => pp.toLowerCase() === filePp.toLowerCase())
          const canSend = !!(step.machineId && step.bewerkingNr != null && selectedNcFileId)
          const sendBlocked = ppBlocked || !step.checklistCompleted
          return (
            <div className="space-y-2 mb-4">
              {/* Postprocessor waarschuwing */}
              {filePp && canSend && (
                <div className="flex items-start gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-500" />
                  {ppBlocked ? (
                    <span>Dit .h bestand is voor <strong>{filePp}</strong>, maar deze machine ondersteunt: <strong>{machinePps.join(', ')}</strong>.</span>
                  ) : (
                    <span>Dit .h bestand is gegenereerd voor postprocessor <strong>{filePp}</strong>. Stel de postprocessor(s) in op de machine (Admin → Machines) om te verifiëren.</span>
                  )}
                </div>
              )}
              {/* Knoppenrij */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleSyncAndValidate()}
                  disabled={syncStatus === 'syncing' || validating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={syncStatus === 'syncing' || validating ? 'animate-spin' : ''} />
                  {syncStatus === 'syncing' ? 'Syncing…' : 'Sync & hervalideer'}
                </button>
                {syncError && <span className="text-xs text-red-500 max-w-[200px] truncate">{syncError}</span>}

                {selectedNcFileId && (
                  <>
                    <button
                      onClick={openEditor}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700"
                    >
                      <FileText size={12} />
                      Bewerken
                    </button>
                    {editorError && <span className="text-xs text-red-500">✗ {editorError}</span>}

                    {canSend && (
                      <button
                        onClick={() => { setSendResult(null); sendToMachine.mutate(selectedNcFileId) }}
                        disabled={sendToMachine.isPending || sendBlocked}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                          sendBlocked
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                        )}
                        title="Stuur naar machine via TNCcmd"
                      >
                        <Send size={12} className={sendToMachine.isPending ? 'animate-pulse' : ''} />
                        {sendToMachine.isPending ? 'Versturen…' : 'Stuur naar machine'}
                      </button>
                    )}
                    {sendResult && (
                      <span className={cn(
                        'text-xs font-medium px-2 py-1 rounded-md',
                        sendResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                      )}>
                        {sendResult.ok ? '✓' : '✗'} {sendResult.msg}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {/* Tijdstempels */}
        {stepValidation && (
          <div className="flex gap-4 mb-2 text-[11px] text-gray-400">
            <span>
              Gevalideerd: <span className="font-medium text-gray-500">
                {new Date(stepValidation.validatedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </span>
            {stepValidation.lastSyncAt ? (
              <span>
                Laatste sync: <span className="font-medium text-gray-500">
                  {new Date(stepValidation.lastSyncAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
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

        {/* NC bestand editor modal */}
        {showEditor && (
          <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60">
            <div className="flex flex-col w-full max-w-4xl bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
                <div>
                  <p className="text-sm font-semibold text-gray-800">NC-bestand bewerken</p>
                  {step.ncFiles.find(f => f.id === selectedNcFileId)?.fileName && (
                    <p className="text-xs text-gray-400 mt-0.5">{step.ncFiles.find(f => f.id === selectedNcFileId)!.fileName}</p>
                  )}
                </div>
                <button onClick={closeEditor} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              {/* Textarea */}
              <textarea
                className="flex-1 w-full p-4 font-mono text-xs text-gray-800 resize-none focus:outline-none border-0"
                value={editorContent}
                onChange={e => setEditorContent(e.target.value)}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
                <button
                  onClick={closeEditor}
                  className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  onClick={() => setEditorConfirm('save')}
                  disabled={saveContent.isPending || editorContent === editorOriginal}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
                >
                  {saveContent.isPending ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                  Opslaan
                </button>
              </div>
            </div>

            {/* Bevestigingsdialoog */}
            {editorConfirm && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full">
                  {editorConfirm === 'save' ? (
                    <>
                      <p className="text-base font-semibold text-gray-800 mb-1">Opslaan?</p>
                      <p className="text-sm text-gray-500 mb-5">Het NC-bestand wordt overschreven en tool calls worden opnieuw ingelezen.</p>
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setEditorConfirm(null)}
                          className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          Terug
                        </button>
                        <button
                          onClick={() => saveContent.mutate()}
                          disabled={saveContent.isPending}
                          className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
                        >
                          {saveContent.isPending ? 'Bezig…' : 'Ja, opslaan'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-gray-800 mb-1">Wijzigingen annuleren?</p>
                      <p className="text-sm text-gray-500 mb-5">Je aanpassingen gaan verloren.</p>
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setEditorConfirm(null)}
                          className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          Terug
                        </button>
                        <button
                          onClick={() => { setEditorConfirm(null); setShowEditor(false) }}
                          className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                        >
                          Ja, annuleren
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validatietabel */}
        {stepValidation && (
          <div>
            {/* Summary */}
            <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm font-medium text-gray-700">
                Validatie: <span className="text-green-600">{stepValidation.aggregate.present} in machine</span>
                {stepValidation.aggregate.missing > 0 && <span className="text-orange-600"> · {stepValidation.aggregate.missing} opbouwen</span>}
                <span className="text-gray-400"> van {stepValidation.aggregate.total}</span>
                <span className="ml-2 text-xs font-normal text-gray-400">({stepValidation.files.length} bestanden)</span>
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
                  {stepValidation.files.map(fileResult => (
                    <Fragment key={fileResult.ncFileId}>
                      {/* Bestandsheader */}
                      <tr>
                        <td colSpan={12} className="bg-gray-100 px-3 py-1.5 border-t-2 border-gray-300">
                          <span className="font-semibold font-mono text-gray-700 text-xs">{fileResult.fileName}</span>
                          <span className="ml-3 text-[11px] font-normal text-gray-500">
                            {fileResult.summary.present}/{fileResult.summary.total} aanwezig
                            {fileResult.summary.missing > 0 && (
                              <span className="ml-1.5 text-red-600 font-medium">{fileResult.summary.missing} opbouwen</span>
                            )}
                          </span>
                        </td>
                      </tr>
                      {fileResult.toolCalls.map(tc => {
                        const me = tc.magazineEntry
                        const tcKey = `${fileResult.ncFileId}:${tc.sequence}`
                        return (
                          <tr key={tcKey} className={cn('group', tc.status === 'ontbreekt' && 'bg-red-50/40')}>
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
                                onClick={() => setOpenTcKey(tcKey)}
                                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 transition-colors"
                              >
                                <Info size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Tool detail modal */}
      {openTcKey !== null && stepValidation && (() => {
        const [fileId, seqStr] = openTcKey.split(':')
        const seq = parseInt(seqStr)
        const fileResult = stepValidation.files.find(f => f.ncFileId === fileId)
        const tc = fileResult?.toolCalls.find(t => t.sequence === seq)
        return tc ? <ToolDetailModal tc={tc} onClose={() => setOpenTcKey(null)} /> : null
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

// ── Maten tab ────────────────────────────────────────────────────────────────

interface Maat {
  id: string
  balloonNr: number
  kenmerk: string
  nominaal: string
  tolerantie: string | null
  tolPlus: string | null
  tolMin: string | null
  omschrijving: string | null
  gemetenWaarde: string | null
  status: 'goed' | 'afgekeurd' | null
  gemetenOp: string | null
  gemetenDoorNaam: string | null
  aangemaaktDoorNaam: string | null
  sortOrder: number
  xPct: number | null
  yPct: number | null
  paginaNummer: number | null
  drawingDocId: string | null
  balloonType: string | null
  gdtType: string | null
}

function parseTolerantie(tolerantie: string | null): { min: number; max: number } | null {
  if (!tolerantie) return null
  const pm = tolerantie.match(/^[±]\s*([\d.,]+)$/)
  if (pm) { const v = parseFloat(pm[1].replace(',', '.')); return { min: -v, max: v } }
  const asym = tolerantie.match(/^[+]([\d.,]+)\s*\/\s*[-]([\d.,]+)$/)
  if (asym) return { min: -parseFloat(asym[2].replace(',', '.')), max: parseFloat(asym[1].replace(',', '.')) }
  return null
}

function berekenStatus(m: Pick<Maat, 'nominaal' | 'tolerantie' | 'tolPlus' | 'tolMin'>, gemeten: string): 'goed' | 'afgekeurd' | null {
  const nom = parseFloat(m.nominaal.replace(',', '.').replace(/[^0-9.,\-]/g, ''))
  const gem = parseFloat(gemeten.replace(',', '.'))
  if (isNaN(nom) || isNaN(gem)) return null
  if (m.tolPlus !== null && m.tolMin !== null) {
    const p = parseFloat(m.tolPlus), n = parseFloat(m.tolMin)
    if (!isNaN(p) && !isNaN(n)) return (gem >= nom - n && gem <= nom + p) ? 'goed' : 'afgekeurd'
  }
  const tol = parseTolerantie(m.tolerantie)
  if (!tol) return null
  return (gem >= nom + tol.min && gem <= nom + tol.max) ? 'goed' : 'afgekeurd'
}

function StatusBadgeMaat({ status }: { status: 'goed' | 'afgekeurd' | null }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', status === 'goed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
      {status === 'goed' ? 'Goed' : 'Afgekeurd'}
    </span>
  )
}

const GDT_OPTIES = [
  { value: 'straightness',     label: '⏤ Rechtheid' },
  { value: 'flatness',         label: '⏥ Vlakheid' },
  { value: 'circularity',      label: '○ Rondheid' },
  { value: 'cylindricity',     label: '⌭ Cilindriciteit' },
  { value: 'profile_line',     label: '⌒ Profielzuiverheid lijn' },
  { value: 'profile_surface',  label: '⌓ Profielzuiverheid vlak' },
  { value: 'parallelism',      label: '∥ Parallelliteit' },
  { value: 'perpendicularity', label: '⊥ Loodrechtheid' },
  { value: 'angularity',       label: '∠ Hoekigheid' },
  { value: 'position',         label: '⊕ Positie' },
  { value: 'concentricity',    label: '◎ Concentriciteit' },
  { value: 'symmetry',         label: '⌯ Symmetrie' },
  { value: 'circular_runout',  label: '↗ Radiale uitslag' },
  { value: 'total_runout',     label: '⌰ Totale uitslag' },
] as const

function maatToBallonData(m: Maat): BallonData {
  return {
    id:           m.id,
    nummer:       m.balloonNr,
    paginaNummer: m.paginaNummer ?? 1,
    xPct:         m.xPct ?? 50,
    yPct:         m.yPct ?? 50,
    type:         (m.balloonType as BallonData['type']) ?? 'dimensional',
    nominaalMaat: m.nominaal || null,
    tolPlus:      m.tolPlus,
    tolMinus:     m.tolMin,
    isoPassing:   null,
    meetmiddel:   null,
    gdtType:      null,
    gemetenWaarde: m.gemetenWaarde,
    status:       m.status,
    stapId:       null,
  }
}

export function MatenTab({ setupId, setupType, matenNiveau, onNiveauChange }: {
  setupId: string
  setupType: 'product' | 'meet'
  matenNiveau?: string
  onNiveauChange?: (niveau: string) => void
}) {
  const qc = useQueryClient()
  const base = setupType === 'product' ? `/kiosk/product-setups/${setupId}` : `/kiosk/meet-setups/${setupId}`

  const { data: maten = [], isLoading } = useQuery<Maat[]>({
    queryKey: ['setup-maten', setupId],
    queryFn: () => apiFetch(`${base}/maten`) as Promise<Maat[]>,
  })

  const { data: setupData } = useQuery<{ documents: { id: string; documentType: string; fileName: string; fileUrl: string }[] }>({
    queryKey: [setupType === 'product' ? 'product-setup' : 'meet-setup', setupId],
    queryFn:  () => apiFetch(setupType === 'product' ? `/kiosk/product-setups/${setupId}` : `/kiosk/meet-setups/${setupId}`) as Promise<any>,
    staleTime: 60_000,
  })
  const tekeningen = (setupData?.documents ?? []).filter(d => d.documentType === 'tekening')

  const [selectedDrawingId, setSelectedDrawingId] = useState<string>('')
  const [selectedId, setSelectedId]               = useState<string | null>(null)
  const [bewerkmodus, setBewerkmodus]             = useState(false)
  const [currentPage, setCurrentPage]             = useState(1)
  const [autoDetecting, setAutoDetecting]         = useState(false)
  const [autoProgress, setAutoProgress]           = useState('')
  const [editGemeten, setEditGemeten]             = useState<Record<string, string>>({})
  const [splitPct, setSplitPct]                   = useState(55)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const isDividerDragging = useRef(false)
  const canvasContainerRef = useRef<HTMLDivElement | null>(null)
  const listRef            = useRef<HTMLDivElement | null>(null)

  // Text-overlay selectie
  const [pageTextItems, setPageTextItems] = useState<Record<number, TextItem[]>>({})
  const [selectedTextKeys, setSelectedTextKeys] = useState<Set<string>>(new Set())
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const dragStartRef    = useRef<{ x: number; y: number } | null>(null)
  const wasDraggingRef  = useRef(false)

  // Auto-selecteer eerste tekening
  useEffect(() => {
    if (!selectedDrawingId && tekeningen.length > 0) setSelectedDrawingId(tekeningen[0].id)
  }, [tekeningen, selectedDrawingId])

  const selectedDrawing       = tekeningen.find(d => d.id === selectedDrawingId)
  const ballonnenOpTekening   = selectedDrawingId
    ? maten.filter(m => m.drawingDocId === selectedDrawingId && m.xPct !== null)
    : []

  const addMaat = useMutation({
    mutationFn: (body: Partial<Maat> & { xPct?: number; yPct?: number; paginaNummer?: number; drawingDocId?: string }) =>
      apiFetch(`${base}/maten`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['setup-maten', setupId] })
      setSelectedId(data?.id ?? null)
    },
  })

  const updateMaat = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Maat> }) =>
      apiFetch(`${base}/maten/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup-maten', setupId] }),
  })

  const deleteMaat = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/maten/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['setup-maten', setupId] }); setSelectedId(null) },
  })

  const handleCanvasClick = (xPct: number, yPct: number) => {
    if (bewerkmodus || !selectedDrawingId) return
    addMaat.mutate({ xPct, yPct, paginaNummer: currentPage, drawingDocId: selectedDrawingId, kenmerk: '', nominaal: '' })
  }

  const handleDragEnd = (id: string, xPct: number, yPct: number) => {
    updateMaat.mutate({ id, data: { xPct, yPct } })
  }

  const handleGemetenBlur = (m: Maat, val: string) => {
    if (val === (m.gemetenWaarde ?? '')) return
    const status = val ? berekenStatus(m, val) : null
    updateMaat.mutate({ id: m.id, data: { gemetenWaarde: val || null, status } })
  }

  const handleAutoDetect = async () => {
    if (!selectedDrawing) return
    setAutoDetecting(true)
    setAutoProgress('Laden…')
    try {
      const { autoDetecteerBallonnen } = await import('@/lib/tekening-detectie')
      const count = await autoDetecteerBallonnen(
        setupId, setupType,
        selectedDrawingId,
        selectedDrawing.fileUrl,
        (label, page, total) => setAutoProgress(`${label} ${page}/${total}`),
      )
      qc.invalidateQueries({ queryKey: ['setup-maten', setupId] })
      setAutoProgress(`${count} gevonden`)
      setTimeout(() => setAutoProgress(''), 3000)
    } catch (err: any) {
      setAutoProgress(`Fout: ${err?.message ?? 'onbekend'}`)
    } finally {
      setAutoDetecting(false)
    }
  }

  const handleResetDrawing = async () => {
    if (!selectedDrawingId || !confirm('Alle ballonnen van deze tekening verwijderen?')) return
    await apiFetch(`${base}/maten/byDrawing/${selectedDrawingId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['setup-maten', setupId] })
    setSelectedId(null)
  }

  // Tekst-items per pagina bijhouden
  const handleTextExtracted = (pageNum: number, items: TextItem[]) => {
    setPageTextItems(prev => ({ ...prev, [pageNum]: items }))
  }

  // Reset text items en selectie bij nieuw tekening
  useEffect(() => {
    setPageTextItems({})
    setSelectedTextKeys(new Set())
    setSelectionBox(null)
  }, [selectedDrawingId])

  // Drag-to-select handlers (op de canvas container)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bewerkmodus || !selectedDrawingId) return
    // Alleen als NIET op een tekst-item of ballon geklikt wordt (die stoppen propagation)
    const rect = e.currentTarget.getBoundingClientRect()
    dragStartRef.current = {
      x: ((e.clientX - rect.left) / rect.width)  * 100,
      y: ((e.clientY - rect.top)  / rect.height) * 100,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const curX = ((e.clientX - rect.left) / rect.width)  * 100
    const curY = ((e.clientY - rect.top)  / rect.height) * 100
    const dx = curX - dragStartRef.current.x
    const dy = curY - dragStartRef.current.y
    if (Math.abs(dx) > 0.8 || Math.abs(dy) > 0.8) {
      wasDraggingRef.current = true
      setSelectionBox({
        x: Math.min(dragStartRef.current.x, curX),
        y: Math.min(dragStartRef.current.y, curY),
        w: Math.abs(dx),
        h: Math.abs(dy),
      })
    }
  }

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    const wasDragging = wasDraggingRef.current
    wasDraggingRef.current = false

    if (wasDragging) {
      // Selecteer alle tekst-items in het geselecteerde kader
      setSelectionBox(prev => {
        if (!prev) return null
        const items = pageTextItems[currentPage] ?? []
        const keys = items.reduce<string[]>((acc, item, i) => {
          const cx = item.xPct + item.widthPct / 2
          const cy = item.yPct + item.heightPct / 2
          if (cx >= prev.x && cx <= prev.x + prev.w && cy >= prev.y && cy <= prev.y + prev.h) {
            acc.push(`${currentPage}-${i}`)
          }
          return acc
        }, [])
        if (keys.length > 0) {
          setSelectedTextKeys(existing => {
            const next = new Set(existing)
            keys.forEach(k => next.add(k))
            return next
          })
        }
        return null
      })
    } else {
      setSelectionBox(null)
      const rect = e.currentTarget.getBoundingClientRect()
      handleCanvasClick(
        ((e.clientX - rect.left) / rect.width)  * 100,
        ((e.clientY - rect.top)  / rect.height) * 100,
      )
    }
  }

  // Voeg geselecteerde tekst-items toe als ballonnen
  const handleAddFromSelection = async () => {
    if (selectedTextKeys.size === 0 || !selectedDrawingId) return
    const items = Array.from(selectedTextKeys).flatMap(key => {
      const [pageStr, idxStr] = key.split('-')
      const item = pageTextItems[parseInt(pageStr)]?.[parseInt(idxStr)]
      if (!item) return []
      return [{ item, page: parseInt(pageStr) }]
    })

    // Groepeer dicht bij elkaar liggende items (binnen 3% y-afstand) per maat
    const grouped: Array<{ items: TextItem[]; page: number }> = []
    const used = new Set<number>()
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue
      const group = [items[i].item]
      used.add(i)
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j) || items[j].page !== items[i].page) continue
        if (Math.abs(items[j].item.yPct - items[i].item.yPct) < 3) {
          group.push(items[j].item)
          used.add(j)
        }
      }
      grouped.push({ items: group, page: items[i].page })
    }

    const ballonnen = grouped.map(({ items: grp, page }) => {
      const combinedStr = grp.map(t => t.str).join(' ')
      const centerX = grp.reduce((s, t) => s + t.xPct + t.widthPct / 2, 0) / grp.length
      const centerY = grp.reduce((s, t) => s + t.yPct + t.heightPct / 2, 0) / grp.length
      const detected = detectMaatAnnotaties(combinedStr, centerX, centerY, page)
      return {
        paginaNummer: page,
        xPct: centerX,
        yPct: centerY,
        nominaalMaat: detected?.nominaalMaat ?? combinedStr,
        tolPlus:  detected?.tolPlus,
        tolMinus: detected?.tolMinus,
      }
    })

    await apiFetch(`${base}/maten/bulk`, {
      method: 'POST',
      body: JSON.stringify({ drawingDocId: selectedDrawingId, ballonnen }),
    })
    qc.invalidateQueries({ queryKey: ['setup-maten', setupId] })
    setSelectedTextKeys(new Set())
  }

  // Scroll geselecteerde ballon in beeld
  useEffect(() => {
    if (selectedId && listRef.current) {
      const el = listRef.current.querySelector(`[data-maat-id="${selectedId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

  const gemeten    = maten.filter(m => m.gemetenWaarde)
  const goedCount  = gemeten.filter(m => m.status === 'goed').length
  const afgekeurd  = gemeten.filter(m => m.status === 'afgekeurd').length

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Laden…</div>

  return (
    <div className="flex flex-col" style={{ minHeight: 520 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white flex-wrap shrink-0">
        <ListChecks size={15} className="text-teal-600 shrink-0" />
        <span className="text-sm font-medium text-gray-700 mr-1">{maten.length} maten</span>
        {gemeten.length > 0 && (
          <span className="text-xs text-gray-500">
            {gemeten.length} gemeten · <span className="text-green-600 font-medium">{goedCount} goed</span>
            {afgekeurd > 0 && <> · <span className="text-red-600 font-medium">{afgekeurd} afgekeurd</span></>}
          </span>
        )}
        <div className="flex-1" />
        {tekeningen.length > 0 && (
          <select
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white min-w-[150px] min-h-[36px]"
            value={selectedDrawingId}
            onChange={e => { setSelectedDrawingId(e.target.value); setSelectedId(null) }}
          >
            <option value="">Geen tekening</option>
            {tekeningen.map(d => <option key={d.id} value={d.id}>{d.fileName}</option>)}
          </select>
        )}
        {selectedDrawingId && (
          <>
            <button
              onClick={() => setBewerkmodus(b => !b)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors min-h-[36px]',
                bewerkmodus ? 'bg-orange-100 border-orange-300 text-orange-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}
            >
              {bewerkmodus ? <Lock size={12} /> : <Unlock size={12} />}
              {bewerkmodus ? 'Bewerken' : 'Weergave'}
            </button>
            <button
              onClick={handleAutoDetect}
              disabled={autoDetecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-40 min-h-[36px]"
            >
              <Search size={12} />
              {autoDetecting ? (autoProgress || 'Detecteren…') : (autoProgress || 'Auto-detect')}
            </button>
            {selectedTextKeys.size > 0 && (
              <button
                onClick={handleAddFromSelection}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[36px] animate-pulse"
              >
                <Plus size={12} />
                {selectedTextKeys.size} toevoegen
              </button>
            )}
            {/* Layout presets */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
              {([
                { pct: 80, icon: '◧', title: 'Tekening groot' },
                { pct: 55, icon: '▣', title: 'Gelijk'         },
                { pct: 20, icon: '◨', title: 'Lijst groot'    },
              ] as const).map(({ pct, icon, title }) => (
                <button
                  key={pct}
                  onClick={() => setSplitPct(pct)}
                  title={title}
                  className={cn(
                    'px-2.5 py-1.5 text-sm min-h-[36px] transition-colors',
                    splitPct === pct
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            {ballonnenOpTekening.length > 0 && (
              <button
                onClick={handleResetDrawing}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg min-h-[36px]"
                title="Reset ballonnen van deze tekening"
              >
                <Trash2 size={14} />
              </button>
            )}
          </>
        )}
        {onNiveauChange && (
          <button
            onClick={() => onNiveauChange(matenNiveau === 'setup' ? 'stap' : 'setup')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500 min-h-[36px]"
            title={matenNiveau === 'setup' ? 'Schakel naar stap-niveau' : 'Schakel naar setup-niveau'}
          >
            <Layers size={12} />
            {matenNiveau === 'setup' ? 'Setup' : 'Stap'}
          </button>
        )}
        <button
          onClick={() => addMaat.mutate({ kenmerk: '', nominaal: '', drawingDocId: selectedDrawingId || undefined })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 min-h-[36px]"
        >
          <Plus size={12} /> Maat
        </button>
      </div>

      {/* Body: split-view (tekening gekozen) of eenvoudige tabel */}
      {selectedDrawing ? (
        <div
          ref={splitContainerRef}
          className="flex flex-1 overflow-hidden select-none"
          style={{ minHeight: 460 }}
        >
          {/* Links: PDF viewer */}
          <div
            className="min-h-0 overflow-hidden flex flex-col"
            style={{ width: `${splitPct}%`, minWidth: '15%', maxWidth: '85%' }}
          >
            <PdfViewer
              pdfUrl={selectedDrawing.fileUrl}
              currentPage={currentPage}
              canvasContainerRef={canvasContainerRef}
              onPageChange={setCurrentPage}
              onTextExtracted={handleTextExtracted}
            >
              {/* Tekst-selectie overlay: drag-to-select + klik op tekst-items */}
              {!bewerkmodus && (
                <div
                  className="absolute inset-0"
                  style={{ zIndex: 2, cursor: 'crosshair', touchAction: 'none' }}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                >
                  {(pageTextItems[currentPage] ?? []).map((item, i) => {
                    const key = `${currentPage}-${i}`
                    const isSelected = selectedTextKeys.has(key)
                    return (
                      <div
                        key={key}
                        style={{
                          position: 'absolute',
                          left:   `${item.xPct}%`,
                          top:    `${item.yPct}%`,
                          width:  `${Math.max(item.widthPct, 1.5)}%`,
                          height: `${Math.max(item.heightPct, 1.2)}%`,
                          cursor: 'pointer',
                        }}
                        className={cn(
                          'border transition-colors',
                          isSelected
                            ? 'bg-blue-400/40 border-blue-500'
                            : 'bg-transparent border-transparent hover:bg-blue-100/30 hover:border-blue-300/60',
                        )}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedTextKeys(prev => {
                            const next = new Set(prev)
                            next.has(key) ? next.delete(key) : next.add(key)
                            return next
                          })
                        }}
                      />
                    )
                  })}
                  {/* Drag selectie-kader */}
                  {selectionBox && (
                    <div
                      className="absolute border-2 border-blue-500 bg-blue-400/20 pointer-events-none"
                      style={{
                        left:   `${selectionBox.x}%`,
                        top:    `${selectionBox.y}%`,
                        width:  `${selectionBox.w}%`,
                        height: `${selectionBox.h}%`,
                      }}
                    />
                  )}
                </div>
              )}

              {/* Balloon overlays: boven de tekst-overlay (z-index 10+) */}
              {ballonnenOpTekening
                .filter(m => (m.paginaNummer ?? 1) === currentPage)
                .map(m => (
                  <BallonOverlay
                    key={m.id}
                    ballon={maatToBallonData(m)}
                    containerRef={canvasContainerRef}
                    bewerkmodus={bewerkmodus}
                    selected={selectedId === m.id}
                    onSelect={setSelectedId}
                    onDragEnd={handleDragEnd}
                    onDelete={id => { if (confirm('Ballon verwijderen?')) deleteMaat.mutate(id) }}
                  />
                ))}
            </PdfViewer>
          </div>

          {/* Versleepbare scheiding */}
          <div
            className="w-2 shrink-0 bg-gray-100 hover:bg-teal-200 active:bg-teal-400 cursor-col-resize flex items-center justify-center group transition-colors"
            onPointerDown={e => {
              isDividerDragging.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!isDividerDragging.current || !splitContainerRef.current) return
              const rect = splitContainerRef.current.getBoundingClientRect()
              const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100)
              setSplitPct(Math.min(85, Math.max(15, pct)))
            }}
            onPointerUp={() => { isDividerDragging.current = false }}
          >
            <div className="w-0.5 h-8 bg-gray-300 group-hover:bg-teal-400 rounded-full transition-colors" />
          </div>

          {/* Rechts: ballon lijst */}
          <div
            ref={listRef}
            className="overflow-y-auto bg-white flex flex-col flex-1"
          >
            {maten.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-6 text-center">
                Klik op de tekening om ballonnen te plaatsen
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {maten.map(m => {
                  const isSelected = selectedId === m.id
                  const tolLabel   = m.tolPlus !== null && m.tolMin !== null
                    ? `+${m.tolPlus} / −${m.tolMin}`
                    : (m.tolerantie ?? '—')
                  const gemetenVal = editGemeten[m.id] ?? (m.gemetenWaarde ?? '')
                  return (
                    <div
                      key={m.id}
                      data-maat-id={m.id}
                      className={cn('px-3 py-2.5 cursor-pointer transition-colors', isSelected ? 'bg-teal-50' : 'hover:bg-gray-50')}
                      onClick={() => {
                        setSelectedId(id => id === m.id ? null : m.id)
                        if (m.paginaNummer) setCurrentPage(m.paginaNummer)
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5',
                          !m.gemetenWaarde ? 'bg-gray-400' :
                          m.status === 'goed' ? 'bg-green-500' :
                          m.status === 'afgekeurd' ? 'bg-red-500' : 'bg-orange-400',
                        )}>
                          {m.balloonNr}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-gray-800 text-sm">{m.nominaal || <span className="text-gray-400 italic text-xs">—</span>}</span>
                            <span className="text-xs text-gray-500 font-mono">{tolLabel}</span>
                            {m.gdtType && <span className="text-xs text-gray-500">{GDT_OPTIES.find(o => o.value === m.gdtType)?.label ?? m.gdtType}</span>}
                            {m.kenmerk && !m.gdtType && <span className="text-xs text-gray-500 truncate">{m.kenmerk}</span>}
                            {m.xPct === null && <span className="text-[10px] text-gray-400 italic">geen pos.</span>}
                          </div>
                          {m.gemetenWaarde && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm font-medium text-gray-700">{m.gemetenWaarde}</span>
                              <StatusBadgeMaat status={m.status} />
                              {m.gemetenDoorNaam && <span className="text-[10px] text-gray-400">{m.gemetenDoorNaam}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-2.5 ml-8 space-y-2" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-2 flex-wrap">
                            <div className="flex flex-col gap-0.5 min-w-[90px]">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase">Nominaal</label>
                              <input
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-h-[36px] w-full"
                                defaultValue={m.nominaal}
                                onBlur={e => { if (e.target.value !== m.nominaal) updateMaat.mutate({ id: m.id, data: { nominaal: e.target.value } }) }}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-[70px]">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase">Tol +</label>
                              <input
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-h-[36px] w-full"
                                defaultValue={m.tolPlus ?? ''}
                                placeholder="0.05"
                                onBlur={e => updateMaat.mutate({ id: m.id, data: { tolPlus: e.target.value || null } })}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-[70px]">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase">Tol −</label>
                              <input
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-h-[36px] w-full"
                                defaultValue={m.tolMin ?? ''}
                                placeholder="0.05"
                                onBlur={e => updateMaat.mutate({ id: m.id, data: { tolMin: e.target.value || null } })}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <div className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase">Kenmerk</label>
                              <input
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-h-[36px] w-full"
                                defaultValue={m.kenmerk}
                                placeholder="diameter, lengte…"
                                onBlur={e => { if (e.target.value !== m.kenmerk) updateMaat.mutate({ id: m.id, data: { kenmerk: e.target.value } }) }}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-[160px]">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase">GD&amp;T type</label>
                              <select
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-h-[36px] bg-white"
                                defaultValue={m.gdtType ?? ''}
                                onBlur={e => updateMaat.mutate({ id: m.id, data: { gdtType: e.target.value || null } })}
                                onChange={e => updateMaat.mutate({ id: m.id, data: { gdtType: e.target.value || null } })}
                              >
                                <option value="">— Geen —</option>
                                {GDT_OPTIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase">Gemeten waarde</label>
                            <input
                              className="border border-gray-300 rounded px-2 py-1.5 text-base min-h-[44px]"
                              value={gemetenVal}
                              placeholder="voer in…"
                              onChange={e => setEditGemeten(v => ({ ...v, [m.id]: e.target.value }))}
                              onBlur={e => handleGemetenBlur(m, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            />
                          </div>
                          {m.aangemaaktDoorNaam && (
                            <p className="text-[10px] text-gray-400">Aangemaakt door: {m.aangemaaktDoorNaam}</p>
                          )}
                          {bewerkmodus && (
                            <button
                              onClick={() => { if (confirm('Ballon verwijderen?')) deleteMaat.mutate(m.id) }}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 min-h-[36px]"
                            >
                              <Trash2 size={12} /> Verwijderen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Geen tekening gekozen: eenvoudige tabel */
        <div className="flex-1 overflow-auto p-4">
          {maten.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Nog geen maten. Voeg er een toe of upload een tekening voor balloon-annotaties.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Nominaal</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Tol + / −</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Kenmerk</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Gemeten</th>
                    <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Status</th>
                    <th className="py-2 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {maten.map(m => (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-400 font-mono">{m.balloonNr}</td>
                      <td className="py-2 px-2 font-medium text-gray-800">{m.nominaal || '—'}</td>
                      <td className="py-2 px-2 text-gray-600 font-mono text-xs">
                        {m.tolPlus !== null && m.tolMin !== null ? `+${m.tolPlus} / −${m.tolMin}` : (m.tolerantie ?? '—')}
                      </td>
                      <td className="py-2 px-2 text-gray-700">{m.kenmerk || <span className="text-gray-400 italic">—</span>}</td>
                      <td className="py-2 px-2">
                        {m.gemetenWaarde
                          ? <div><span className="font-medium text-gray-800">{m.gemetenWaarde}</span>
                              {m.gemetenDoorNaam && <div className="text-[10px] text-gray-400">{m.gemetenDoorNaam}</div>}
                            </div>
                          : <span className="text-gray-400 text-xs">niet gemeten</span>}
                      </td>
                      <td className="py-2 px-2"><StatusBadgeMaat status={m.status} /></td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => { if (confirm('Maat verwijderen?')) deleteMaat.mutate(m.id) }}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      qc.invalidateQueries({ queryKey: ['step-validate-all', stepId] })
    },
  })

  const renameNcFile = useMutation({
    mutationFn: ({ id, fileName }: { id: string; fileName: string }) =>
      apiFetch(`/kiosk/product-setups/nc-files/${id}`, { method: 'PATCH', body: JSON.stringify({ fileName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setRenamingId(null)
    },
  })

  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true); setUploadError(null)
    let lastId: string | null = null
    try {
      for (let i = 0; i < files.length; i++) {
        if (files.length > 1) setUploadProgress(`${i + 1}/${files.length}`)
        const fd = new FormData()
        fd.append('file', files[i])
        const res = await apiFetch<{ ncFileId: string }>(`/kiosk/product-setups/steps/${stepId}/nc-files`, {
          method: 'POST', body: fd,
        })
        lastId = res.ncFileId
      }
      await qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      await qc.invalidateQueries({ queryKey: ['step-validate-all', stepId] })
      if (lastId) onSelect(lastId)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      e.target.value = ''
    }
  }

  const sorted = [...files].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' }))

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
              {uploading ? (uploadProgress ? `${uploadProgress} bezig…` : 'Bezig…') : 'Uploaden'}
            </button>
            <input ref={fileRef} type="file" accept=".h" multiple className="hidden" onChange={handleUpload} />
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
  const xmlFileRef  = useRef<HTMLInputElement>(null)
  const rapFileRef  = useRef<HTMLInputElement>(null)
  const igesFileRef = useRef<HTMLInputElement>(null)
  const [innerTab, setInnerTab] = useState<'xml' | 'rapport' | 'iges'>('xml')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedRapportageType, setSelectedRapportageType] = useState<string>('inmeten')
  const [selectedRapType, setSelectedRapType] = useState<string>('controle')
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  const xmlDocs  = docs.filter(d => d.documentType === 'meting_xml')
  const rapDocs  = docs.filter(d => d.documentType === 'meting_rapport')
  const igesDocs = docs.filter(d => d.documentType === 'iges')

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
          {(['xml', 'rapport', 'iges'] as const).map(t => (
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
              {t === 'xml' ? `XML bestanden (${xmlDocs.length})` : t === 'rapport' ? `Rapporten (${rapDocs.length})` : `IGES bestanden (${igesDocs.length})`}
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
                <option value="inmeten">Inmeten</option>
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
                      <div className="overflow-auto max-h-64 rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-gray-500">Feature</th>
                              <th className="text-left px-2 py-2 font-semibold text-gray-500">Dimensie</th>
                              <th className="text-center px-2 py-2 font-semibold text-gray-500">T</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">+Tol</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">-Tol</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">Nom</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">MEAS</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">DEV</th>
                              <th className="text-center px-2 py-2 font-semibold text-gray-500">OOT</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">MIN</th>
                              <th className="text-right px-2 py-2 font-semibold text-gray-500">MAX</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspectionData.features.map(f => {
                              const isFail = f.status === 'fail'
                              const dimLabel = f.dimensionType || '—'
                              if (f.axes && f.axes.length > 0) {
                                return f.axes.map((ax, ai) => {
                                  const axFail = ax.outOfTol
                                  const devColor = axFail ? 'text-red-600' : ax.deviation > 0 ? 'text-orange-500' : ax.deviation < 0 ? 'text-blue-500' : 'text-gray-400'
                                  const isT = ax.axis === 'T'
                                  return (
                                    <tr key={`${f.id}-${ax.axis}`} className={cn(
                                      'border-t border-gray-50',
                                      axFail ? 'bg-red-50' : isT ? 'bg-gray-50' : ''
                                    )}>
                                      <td className={cn('px-3 py-1 font-medium text-gray-800 max-w-[120px] truncate', ai > 0 && 'text-transparent select-none')}>
                                        {ai === 0 ? f.name : '│'}
                                      </td>
                                      <td className={cn('px-2 py-1 text-xs text-gray-500 max-w-[100px] truncate', ai > 0 && 'text-transparent select-none')}>
                                        {ai === 0 ? dimLabel : ''}
                                      </td>
                                      <td className={cn('px-2 py-1 text-center font-semibold', isT ? 'text-gray-600' : 'text-teal-700')}>{ax.axis}</td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-400">{ax.tolerancePlus >= 0 ? '+' : ''}{ax.tolerancePlus.toFixed(4)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-400">{ax.toleranceMinus > 0 ? '+' : ''}{ax.toleranceMinus.toFixed(4)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-500">{isT && ax.nominal === 0 ? '0' : ax.nominal.toFixed(4)}</td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-800">{ax.measured.toFixed(4)}</td>
                                      <td className={cn('px-2 py-1 text-right font-mono font-semibold', devColor)}>
                                        {ax.deviation >= 0 ? '+' : ''}{ax.deviation.toFixed(4)}
                                      </td>
                                      <td className="px-2 py-1 text-center">
                                        {axFail
                                          ? <X size={11} className="inline text-red-500" />
                                          : <Check size={11} className="inline text-green-500" />}
                                      </td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-400">{ax.min != null ? ax.min.toFixed(4) : '—'}</td>
                                      <td className="px-2 py-1 text-right font-mono text-gray-400">{ax.max != null ? ax.max.toFixed(4) : '—'}</td>
                                    </tr>
                                  )
                                })
                              }
                              const nominal  = f.nominalX !== 0 ? f.nominalX : null
                              const measured = f.measuredX !== 0 ? f.measuredX : null
                              const devColor = isFail ? 'text-red-600' : f.deviation > 0 ? 'text-orange-500' : f.deviation < 0 ? 'text-blue-500' : 'text-gray-400'
                              return (
                                <tr key={f.id} className={cn('border-t border-gray-50', isFail ? 'bg-red-50' : '')}>
                                  <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[120px] truncate">{f.name}</td>
                                  <td className="px-2 py-1.5 text-xs text-gray-500 max-w-[100px] truncate">{dimLabel}</td>
                                  <td className="px-2 py-1.5 text-center font-semibold text-teal-700">—</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">+{f.tolerancePlus.toFixed(4)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">-{f.toleranceMinus.toFixed(4)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-500">{nominal != null ? nominal.toFixed(4) : '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-800">{measured != null ? measured.toFixed(4) : '—'}</td>
                                  <td className={cn('px-2 py-1.5 text-right font-mono font-semibold', devColor)}>
                                    {f.deviation >= 0 ? '+' : ''}{f.deviation.toFixed(4)}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {isFail
                                      ? <X size={11} className="inline text-red-500" />
                                      : <Check size={11} className="inline text-green-500" />}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">—</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-gray-400">—</td>
                                </tr>
                              )
                            })}
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

        {/* IGES tab */}
        {innerTab === 'iges' && (
          <div className="flex-1 overflow-auto flex flex-col">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
              <button
                onClick={() => igesFileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={13} />
                {uploading ? 'Bezig…' : 'IGES uploaden'}
              </button>
              <input
                ref={igesFileRef}
                type="file"
                className="hidden"
                accept=".igs,.iges"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f, 'iges')
                  e.target.value = ''
                }}
              />
            </div>
            {igesDocs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-300">
                <FileText size={32} className="mb-2" />
                <p className="text-sm">Nog geen IGES bestanden toegevoegd</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {igesDocs.map(doc => (
                  <li key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <FileText size={16} className="text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(doc.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                        {doc.uploadedByName && <span className="ml-1">· {doc.uploadedByName}</span>}
                      </p>
                    </div>
                    <a
                      href={doc.fileUrl}
                      download={doc.fileName}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600 shrink-0"
                      title="Downloaden"
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

// ── HypermillModal ────────────────────────────────────────────────────────────

function toHmopenUrl(filePath: string): string {
  return `hmopen://${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

function HypermillModal({
  docs, setupId, onClose,
}: {
  docs: Document[]
  setupId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [pathInput, setPathInput]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  async function handleSavePath() {
    const trimmed = pathInput.trim()
    if (!trimmed) return
    setSaving(true)
    setSaveError(null)
    try {
      await apiFetch(`/kiosk/product-setups/${setupId}/documents/path`, {
        method: 'POST',
        body: JSON.stringify({ path: trimmed }),
      })
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setPathInput('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-gray-400" />
            <p className="font-bold text-gray-800">Hypermill bestanden</p>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{docs.length}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        {/* Pad invoeren */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-xs text-gray-500 mb-1.5">Netwerkpad of lokaal pad (bijv. <code className="bg-gray-100 px-1 rounded">\\SERVER\HyperMill\project.hmc</code>)</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePath()}
              placeholder="\\server\share\project.hmc"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
            />
            <button
              onClick={handleSavePath}
              disabled={saving || !pathInput.trim()}
              className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {saving ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>
          {saveError && <p className="text-xs text-red-600 mt-1">{saveError}</p>}
        </div>

        {/* Bestandslijst */}
        <div className="flex-1 overflow-auto">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300">
              <FolderOpen size={36} className="mb-2" />
              <p className="text-sm">Nog geen Hypermill paden toegevoegd</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {docs.map(doc => (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-gray-50">
                  <FileText size={16} className="text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{doc.fileUrl}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(doc.uploadedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                      {doc.uploadedByName && <span className="ml-1">· {doc.uploadedByName}</span>}
                    </p>
                  </div>
                  <a
                    href={toHmopenUrl(doc.fileUrl)}
                    className="p-1.5 rounded hover:bg-teal-50 text-gray-400 hover:text-teal-600 shrink-0 transition-colors"
                    title="Openen in Hypermill"
                  >
                    <ExternalLink size={14} />
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
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-[11px] text-gray-400">
              Werkt de open-knop niet?{' '}
              <a
                href="/hypermill-protocol-install.reg"
                download="hypermill-protocol-install.reg"
                className="text-teal-600 hover:underline"
              >
                Installeer het HyperMill protocol
              </a>
              {' '}(eenmalig per PC, dubbelklik na downloaden)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AanpakFrezenModal ─────────────────────────────────────────────────────────

function fileTypeInfo(fileName: string, mimeType: string | null): {
  isImage: boolean
  isPdf: boolean
  bg: string
  labelColor: string
  label: string
} {
  if (mimeType?.startsWith('image/')) return { isImage: true,  isPdf: false, bg: '', labelColor: '', label: '' }
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf' || mimeType === 'application/pdf')
    return { isImage: false, isPdf: true,  bg: 'bg-red-50',     labelColor: 'text-red-500',    label: 'PDF' }
  if (ext === 'doc'  || ext === 'docx')
    return { isImage: false, isPdf: false, bg: 'bg-blue-50',    labelColor: 'text-blue-600',   label: ext.toUpperCase() }
  if (ext === 'xls'  || ext === 'xlsx')
    return { isImage: false, isPdf: false, bg: 'bg-green-50',   labelColor: 'text-green-600',  label: ext.toUpperCase() }
  if (ext === 'ppt'  || ext === 'pptx')
    return { isImage: false, isPdf: false, bg: 'bg-orange-50',  labelColor: 'text-orange-500', label: ext.toUpperCase() }
  if (ext === 'zip'  || ext === 'rar' || ext === '7z')
    return { isImage: false, isPdf: false, bg: 'bg-yellow-50',  labelColor: 'text-yellow-600', label: 'ZIP' }
  return { isImage: false, isPdf: false,   bg: 'bg-gray-100',   labelColor: 'text-gray-500',   label: ext.toUpperCase() || 'FILE' }
}

function AanpakFrezenModal({
  docs, setupId, onClose,
}: {
  docs: Document[]
  setupId: string
  onClose: () => void
}) {
  const qc      = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightbox, setLightbox]       = useState<{ doc: Document } | null>(null)
  const [editBeschrijving, setEditBeschrijving] = useState('')

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const patchDoc = useMutation({
    mutationFn: ({ docId, body }: { docId: string; body: { versionNote?: string | null; beschrijving?: string | null } }) =>
      apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
      fd.append('documentType', 'aanpak_frezen')
      await apiFetch(`/kiosk/product-setups/${setupId}/documents`, { method: 'POST', body: fd })
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
    } catch (err) {
      setUploadError(`Upload mislukt: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function openLightbox(doc: Document) {
    setLightbox({ doc })
    setEditBeschrijving(doc.beschrijving ?? '')
  }

  function saveBeschrijving() {
    if (!lightbox) return
    patchDoc.mutate({ docId: lightbox.doc.id, body: { beschrijving: editBeschrijving || null } })
    setLightbox(prev => prev ? { doc: { ...prev.doc, beschrijving: editBeschrijving || null } } : null)
  }

  function saveVersionNote(docId: string, note: string) {
    patchDoc.mutate({ docId, body: { versionNote: note || null } })
  }

  return (
    <>
      {/* Thumbnail grid modal */}
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpen size={16} className="text-gray-400" />
              <p className="font-bold text-gray-800">Aanpak frezen</p>
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
              <input ref={fileRef} type="file" className="hidden" accept="*/*" onChange={handleUpload} />
              <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
          </div>

          {uploadError && (
            <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100 shrink-0">{uploadError}</div>
          )}

          {/* Thumbnail grid */}
          <div className="flex-1 overflow-auto p-4">
            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <FolderOpen size={36} className="mb-2" />
                <p className="text-sm">Nog niets toegevoegd</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {docs.map(doc => {
                  const ft = fileTypeInfo(doc.fileName, doc.mimeType)
                  return (
                    <div key={doc.id} className="relative group flex flex-col gap-1.5">
                      {/* Thumbnail */}
                      <button
                        onClick={() => openLightbox(doc)}
                        className="w-full aspect-square rounded-xl overflow-hidden border border-gray-200 hover:border-teal-300 hover:shadow-md transition-all relative"
                      >
                        {ft.isImage ? (
                          <img src={doc.fileUrl} alt={doc.fileName} className="w-full h-full object-cover" />
                        ) : ft.isPdf ? (
                          <div className="w-full h-full relative overflow-hidden bg-white">
                            <iframe
                              src={`${doc.fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              title={doc.fileName}
                              style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '800px', height: '800px',
                                transform: 'scale(0.25)', transformOrigin: '0 0',
                                border: 'none', pointerEvents: 'none',
                              }}
                            />
                          </div>
                        ) : (
                          <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${ft.bg}`}>
                            <FileText size={32} className={ft.labelColor} />
                            <span className={`text-xs font-bold tracking-wide ${ft.labelColor}`}>{ft.label}</span>
                            <span className="text-[10px] text-gray-400 px-2 text-center truncate w-full">{doc.fileName}</span>
                          </div>
                        )}
                      </button>

                      {/* Korte omschrijving */}
                      <input
                        type="text"
                        defaultValue={doc.versionNote ?? ''}
                        placeholder="Korte omschrijving…"
                        onBlur={e => saveVersionNote(doc.id, e.target.value)}
                        className="text-[11px] text-gray-600 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-200 focus:border-teal-300 focus:outline-none bg-transparent w-full"
                      />

                      {/* Verwijder knop */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteDoc.mutate(doc.id) }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-gray-300 hover:text-red-500 hover:bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox — volledig scherm */}
      {lightbox && (() => {
        const ft = fileTypeInfo(lightbox.doc.fileName, lightbox.doc.mimeType)
        return (
          <div
            className="fixed inset-0 bg-black z-[60] flex flex-col"
            onClick={() => setLightbox(null)}
          >
            {/* Topbalk */}
            <div
              className="flex items-center justify-between px-5 py-3 bg-black/60 shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-sm text-white/80 truncate">{lightbox.doc.fileName}</p>
              <div className="flex items-center gap-2 shrink-0">
                {!ft.isImage && (
                  <a
                    href={lightbox.doc.fileUrl}
                    download={lightbox.doc.fileName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={13} />
                    Openen
                  </a>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setLightbox(null) }}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Inhoud */}
            <div className="flex-1 min-h-0 flex" onClick={e => e.stopPropagation()}>
              {/* Afbeelding of PDF of icoon */}
              <div className="flex-1 min-w-0 flex items-center justify-center overflow-hidden">
                {ft.isImage ? (
                  <img
                    src={lightbox.doc.fileUrl}
                    alt={lightbox.doc.fileName}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : ft.isPdf ? (
                  <iframe
                    src={lightbox.doc.fileUrl}
                    className="w-full h-full border-0"
                    title={lightbox.doc.fileName}
                  />
                ) : (
                  <div className={`flex flex-col items-center justify-center gap-4 w-64 h-64 rounded-2xl ${ft.bg}`}>
                    <FileText size={64} className={ft.labelColor} />
                    <span className={`text-xl font-bold ${ft.labelColor}`}>{ft.label}</span>
                    <p className="text-sm text-gray-500 text-center px-4">{lightbox.doc.fileName}</p>
                  </div>
                )}
              </div>

              {/* Beschrijving panel */}
              <div
                  className="w-80 bg-white flex flex-col shrink-0 border-l border-gray-100"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
                    {lightbox.doc.versionNote && (
                      <p className="text-base font-semibold text-gray-800">{lightbox.doc.versionNote}</p>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Uitgebreide beschrijving</label>
                      <textarea
                        value={editBeschrijving}
                        onChange={e => setEditBeschrijving(e.target.value)}
                        placeholder="Beschrijving toevoegen…"
                        rows={8}
                        className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400 resize-none"
                      />
                    </div>
                  </div>
                  <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-end">
                    <button
                      onClick={saveBeschrijving}
                      className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                    >
                      Opslaan
                    </button>
                  </div>
                </div>
            </div>
          </div>
        )
      })()}
    </>
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
                  ) : (att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.fileName)) ? (
                    <div
                      className="w-full h-full overflow-hidden cursor-pointer"
                      onClick={() => window.open(att.fileUrl, '_blank')}
                    >
                      <iframe
                        src={att.fileUrl}
                        title={att.fileName}
                        loading="lazy"
                        className="border-none pointer-events-none absolute top-0 left-0"
                        style={{ width: '800px', height: '800px', transform: 'scale(0.2)', transformOrigin: 'top left' }}
                      />
                    </div>
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

export function ProductSetupContent({ initialSetupId, onBack: onBackProp }: { initialSetupId?: string; onBack?: () => void } = {}) {
  const [machine, setMachine]   = useState<FresMachine | null>(null)
  const [setup, setSetup]       = useState<SetupSummary | null>(null)

  // Direct vanuit archief: sla machine/lijst over en open de setup meteen
  if (initialSetupId) {
    return (
      <SetupDetail
        setupId={initialSetupId}
        machineId=""
        onBack={onBackProp ?? (() => {})}
      />
    )
  }

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
