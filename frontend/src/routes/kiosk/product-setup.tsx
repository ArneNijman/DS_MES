import { useState, useRef, useEffect, Fragment, ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ChevronLeft, Plus, Upload, Trash2, X, Check,
  FileText, Layers, AlertCircle, Package, Cpu, Paperclip,
  ChevronDown, ChevronRight, ExternalLink, RefreshCw
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  articleName:       string
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
  uploadedAt:     string
  uploadedByName: string | null
}

interface SetupDetail {
  id:                string
  productionOrderNo: string | null
  articleNo:         string | null
  articleName:       string
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
    l:          string | null
    r:          string | null
    dl:         string | null
    dr:         string | null
    time2:      string | null
    curTime:    string | null
  }
  assembly?: {
    id:             string
    ncName:         string
    toolLength:     number | null
    presetDiameter: number | null
    components:     { type: string; name: string; orderingCode: string | null; manufacturer: string | null; photoUrl: string | null }[]
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

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'aanwezig' | 'ontbreekt' | 'onbekend' }) {
  if (status === 'aanwezig')  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><Check size={10} />in machine</span>
  if (status === 'ontbreekt') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertCircle size={10} />ontbreekt</span>
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
  const [newName, setNewName] = useState('')
  const [newOrder, setNewOrder] = useState('')
  const [newArticle, setNewArticle] = useState('')
  const [newStepName, setNewStepName] = useState('')
  const [showBcMsg, setShowBcMsg] = useState(false)

  const { data: setups = [], isLoading } = useQuery<SetupSummary[]>({
    queryKey: ['product-setups', machine.id, search],
    queryFn:  () => apiFetch(`/kiosk/product-setups?machineId=${machine.id}&search=${encodeURIComponent(search)}`),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch<{ ok: boolean; setupId: string }>('/kiosk/product-setups', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async (res) => {
      await apiFetch(`/kiosk/product-setups/${res.setupId}/steps`, {
        method: 'POST',
        body: JSON.stringify({ stepName: newStepName.trim() || 'Stap 1', machineId: machine.id }),
      })
      qc.invalidateQueries({ queryKey: ['product-setups', machine.id] })
      setShowNew(false); setNewName(''); setNewOrder(''); setNewArticle(''); setNewStepName('')
    },
  })

  function handleCreate() {
    if (!newName.trim()) return
    createMutation.mutate({ articleName: newName.trim(), productionOrderNo: newOrder.trim() || undefined, articleNo: newArticle.trim() || undefined, origin: 'manual' })
  }

  function handleShowNew() {
    setShowBcMsg(false)
    setShowNew(true)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
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
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
            placeholder="Zoek op ordernummer, artikelnaam of stapnaam…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Lijst */}
      <div className="flex-1 overflow-auto p-5">
        {isLoading && <p className="text-gray-400 text-sm">Laden…</p>}
        {!isLoading && setups.length === 0 && (
          <p className="text-gray-400 text-sm">Geen setups gevonden{search ? ' voor deze zoekopdracht' : ''}.</p>
        )}
        <div className="space-y-2">
          {setups.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Layers size={18} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 truncate">{s.articleName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {s.productionOrderNo && <span className="mr-2">PO: {s.productionOrderNo}</span>}
                  {s.articleNo && <span>Art: {s.articleNo}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                  {s.totalSteps} {s.totalSteps === 1 ? 'stap' : 'stappen'}
                </span>
                {s.stepsOnMachine > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{s.stepsOnMachine} op deze machine</p>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-400 shrink-0" />
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
                className="flex flex-col items-center gap-2 p-4 border-2 border-teal-500 bg-teal-50 rounded-xl"
                onClick={() => setShowBcMsg(false)}
              >
                <FileText size={22} className="text-teal-600" />
                <span className="text-sm font-medium text-teal-700">Handmatig</span>
              </button>
              <button
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                onClick={() => setShowBcMsg(true)}
              >
                <ExternalLink size={22} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Vanuit Business Central</span>
              </button>
            </div>

            {showBcMsg && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Koppeling met Business Central voor productieorders is binnenkort beschikbaar.
              </div>
            )}

            {!showBcMsg && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Artikelnaam <span className="text-red-500">*</span></label>
                  <input
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. Deksel 12345"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Productieorder</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                      placeholder="PO-2024-001"
                      value={newOrder}
                      onChange={e => setNewOrder(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Artikelnummer</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                      placeholder="ART-0042"
                      value={newArticle}
                      onChange={e => setNewArticle(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Eerste bewerkingsstap <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                    placeholder="bijv. Vlak frezen, Boren, Contour frezen…"
                    value={newStepName}
                    onChange={e => setNewStepName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  />
                  <p className="text-xs text-gray-400 mt-1">Gekoppeld aan: <span className="font-medium text-gray-600">{machine.name}</span></p>
                </div>
                <button
                  disabled={!newName.trim() || !newStepName.trim() || createMutation.isPending}
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
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'product' | 'cnc' | 'bijlagen'>('product')
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')

  const { data: setup, isLoading } = useQuery<SetupDetail>({
    queryKey: ['product-setup', setupId],
    queryFn:  () => apiFetch(`/kiosk/product-setups/${setupId}`),
  })

  useEffect(() => {
    if (setup && !activeStepId && setup.steps.length > 0) {
      const machineStep = setup.steps.find(s => s.machineId === machineId)
      setActiveStepId(machineStep?.id ?? setup.steps[0].id)
    }
  }, [setup, activeStepId, machineId])

  const patchSetup = useMutation({
    mutationFn: (body: object) => apiFetch(`/kiosk/product-setups/${setupId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const addStepMutation = useMutation({
    mutationFn: (body: object) => apiFetch<{ stepId: string }>(`/kiosk/product-setups/${setupId}/steps`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setActiveStepId(res.stepId)
      setShowAddStep(false); setNewStepName('')
    },
  })

  if (isLoading || !setup) return <div className="flex-1 flex items-center justify-center text-gray-400">Laden…</div>

  const activeStep = setup.steps.find(s => s.id === activeStepId) ?? setup.steps[0] ?? null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={setup.articleName}
            onSave={v => patchSetup.mutate({ articleName: v })}
            className="font-bold text-base text-gray-900"
            placeholder="Artikelnaam"
          />
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
            {setup.productionOrderNo && <span>PO: {setup.productionOrderNo}</span>}
            {setup.articleNo && <span>Art: {setup.articleNo}</span>}
          </div>
        </div>
      </div>

      {/* Stap navigator */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-200 bg-gray-50 overflow-x-auto shrink-0">
        {setup.steps.map(step => (
          <button
            key={step.id}
            onClick={() => setActiveStepId(step.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0',
              activeStepId === step.id
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-700',
            )}
          >
            <span className="text-xs opacity-70">#{step.stepNumber}</span>
            {step.stepName}
            {step.machineId === machineId && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Deze machine" />
            )}
          </button>
        ))}
        {/* Nieuwe stap */}
        {!showAddStep ? (
          <button
            onClick={() => setShowAddStep(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors shrink-0"
          >
            <Plus size={13} /> Nieuwe stap
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              className="w-36 border border-teal-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
              placeholder="Stapnaam"
              value={newStepName}
              onChange={e => setNewStepName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newStepName.trim()) addStepMutation.mutate({ stepName: newStepName.trim(), machineId })
                if (e.key === 'Escape') { setShowAddStep(false); setNewStepName('') }
              }}
            />
            <button
              onClick={() => newStepName.trim() && addStepMutation.mutate({ stepName: newStepName.trim(), machineId })}
              className="p-1.5 rounded bg-teal-600 text-white hover:bg-teal-700"
            ><Check size={13} /></button>
            <button onClick={() => { setShowAddStep(false); setNewStepName('') }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={13} /></button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-gray-200 bg-white shrink-0">
        {(['product', 'cnc', 'bijlagen'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab === 'product' ? 'Product informatie' : tab === 'cnc' ? 'CNC informatie' : 'Bijlagen'}
          </button>
        ))}
      </div>

      {/* Tab inhoud */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'product' && activeStep && (
          <ProductInfoTab setup={setup} step={activeStep} onPatchSetup={b => patchSetup.mutate(b)} />
        )}
        {activeTab === 'cnc' && activeStep && (
          <CncInfoTab step={activeStep} setupId={setupId} />
        )}
        {activeTab === 'bijlagen' && activeStep && (
          <BijlagenTab step={activeStep} />
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Product informatie
// ══════════════════════════════════════════════════════════════════════════════

function ProductInfoTab({
  setup, step, onPatchSetup,
}: {
  setup: SetupDetail
  step: Step
  onPatchSetup: (b: object) => void
}) {
  const qc = useQueryClient()
  const [showMachinePicker, setShowMachinePicker] = useState(false)
  const [uploading, setUploading] = useState(false)

  const patchStep = useMutation({
    mutationFn: (body: object) => apiFetch(`/kiosk/product-setups/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setup.id] }),
  })

  const deleteMachine = () => patchStep.mutate({ machineId: null })

  const { data: machines = [] } = useQuery<FresMachine[]>({
    queryKey: ['product-setup-machines'],
    queryFn:  () => apiFetch('/kiosk/product-setups/machines'),
    enabled:  showMachinePicker,
  })

  async function handleDocUpload(e: ChangeEvent<HTMLInputElement>, documentType: string) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('documentType', documentType)
      await apiFetch(`/kiosk/product-setups/${setup.id}/documents`, { method: 'POST', body: fd })
      qc.invalidateQueries({ queryKey: ['product-setup', setup.id] })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/kiosk/product-setups/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setup.id] }),
  })

  const tekeningen = setup.documents.filter(d => d.documentType === 'tekening')
  const cadFiles   = setup.documents.filter(d => d.documentType === 'cad')

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      {/* Machine */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Machine</h3>
        {step.machineId ? (
          <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
              {step.machinePhotoUrl ? <img src={step.machinePhotoUrl} alt="" className="w-full h-full object-cover" /> : <Cpu size={22} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-800">{step.machineName}</p>
            </div>
            <button onClick={() => setShowMachinePicker(true)} className="text-xs text-teal-600 hover:underline">Wijzigen</button>
            <button onClick={deleteMachine} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={14} /></button>
          </div>
        ) : (
          <button
            onClick={() => setShowMachinePicker(true)}
            className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 transition-colors"
          >
            <Plus size={16} /> Machine koppelen
          </button>
        )}
      </section>

      {/* Order informatie */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Order informatie</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Productieorder</label>
            <InlineEdit
              value={setup.productionOrderNo ?? ''}
              onSave={v => onPatchSetup({ productionOrderNo: v })}
              placeholder="Niet ingevuld"
              className="text-sm text-gray-800 w-full"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Artikelnummer</label>
            <InlineEdit
              value={setup.articleNo ?? ''}
              onSave={v => onPatchSetup({ articleNo: v })}
              placeholder="Niet ingevuld"
              className="text-sm text-gray-800 w-full"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Artikelnaam</label>
            <InlineEdit
              value={setup.articleName}
              onSave={v => onPatchSetup({ articleName: v })}
              className="text-sm text-gray-800 w-full"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Algemene informatie</label>
            <InlineEdit
              value={setup.description ?? ''}
              onSave={v => onPatchSetup({ description: v })}
              placeholder="Voeg een beschrijving toe…"
              className="text-sm text-gray-800 w-full"
              textarea
            />
          </div>
        </div>
      </section>

      {/* Tekeningen */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tekeningen</h3>
          <label className={cn('flex items-center gap-1.5 text-xs text-teal-600 cursor-pointer hover:text-teal-700', uploading && 'opacity-50 pointer-events-none')}>
            <Upload size={13} /> Uploaden
            <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => handleDocUpload(e, 'tekening')} />
          </label>
        </div>
        {tekeningen.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nog geen tekeningen toegevoegd</p>
        ) : (
          <div className="space-y-2">
            {tekeningen.map(doc => (
              <DocumentRow key={doc.id} doc={doc} setupId={setup.id} onDelete={() => deleteDoc.mutate(doc.id)} />
            ))}
          </div>
        )}
      </section>

      {/* CAD bestanden */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CAD-bestanden</h3>
          <label className={cn('flex items-center gap-1.5 text-xs text-teal-600 cursor-pointer hover:text-teal-700', uploading && 'opacity-50 pointer-events-none')}>
            <Upload size={13} /> Uploaden
            <input type="file" className="hidden" accept=".step,.stp,.iges,.igs,.dxf,.dwg,.stl" onChange={e => handleDocUpload(e, 'cad')} />
          </label>
        </div>
        {cadFiles.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nog geen CAD-bestanden toegevoegd</p>
        ) : (
          <div className="space-y-2">
            {cadFiles.map(doc => (
              <DocumentRow key={doc.id} doc={doc} setupId={setup.id} onDelete={() => deleteDoc.mutate(doc.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Machine picker modal */}
      {showMachinePicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowMachinePicker(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-800">Machine selecteren</h2>
              <button onClick={() => setShowMachinePicker(false)} className="p-1 rounded hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="overflow-auto grid grid-cols-2 gap-3">
              {machines.map(m => (
                <button
                  key={m.id}
                  onClick={() => { patchStep.mutate({ machineId: m.id }); setShowMachinePicker(false) }}
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

function DocumentRow({ doc, setupId, onDelete }: { doc: Document; setupId: string; onDelete: () => void }) {
  const qc = useQueryClient()
  const [editNote, setEditNote] = useState(false)
  const [note, setNote] = useState(doc.versionNote ?? '')

  function saveNote() {
    setEditNote(false)
    if (note !== (doc.versionNote ?? '')) {
      // We use a direct patch via the documents endpoint — caption update reused as versionNote
      apiFetch(`/kiosk/product-setups/documents/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ versionNote: note.trim() || null }),
      }).then(() => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }))
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg group">
      <FileText size={18} className="text-gray-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-600 hover:underline truncate block">
          {doc.fileName}
        </a>
        {editNote ? (
          <input
            autoFocus
            className="mt-1 w-full border border-teal-400 rounded px-2 py-0.5 text-xs focus:outline-none"
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditNote(false) }}
            placeholder="Revisienota bijv. Rev B – flens aangepast"
          />
        ) : (
          <p
            className="text-xs text-gray-500 cursor-text hover:text-teal-600 mt-0.5"
            onClick={() => setEditNote(true)}
          >
            {doc.versionNote || <span className="italic text-gray-300">Revisienota toevoegen…</span>}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(doc.uploadedAt)}{doc.uploadedByName ? ` · ${doc.uploadedByName}` : ''}</p>
      </div>
      <button
        onClick={() => { if (confirm('Document verwijderen?')) onDelete() }}
        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
      ><Trash2 size={14} /></button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: CNC informatie
// ══════════════════════════════════════════════════════════════════════════════

function CncInfoTab({ step, setupId }: { step: Step; setupId: string }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedNcFileId, setSelectedNcFileId] = useState<string | null>(
    step.ncFiles.length > 0 ? step.ncFiles[step.ncFiles.length - 1].id : null
  )
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const patchStep = useMutation({
    mutationFn: (body: object) => apiFetch(`/kiosk/product-setups/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-setup', setupId] }),
  })

  const deleteNcFile = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/product-setups/nc-files/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setSelectedNcFileId(null)
    },
  })

  const { data: validation, isLoading: validating, refetch: validate } = useQuery<ValidationResult>({
    queryKey: ['nc-validate', selectedNcFileId],
    queryFn:  () => apiFetch(`/kiosk/product-setups/nc-files/${selectedNcFileId}/validate`),
    enabled:  false,
  })

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ ok: boolean; ncFileId: string; toolCallCount: number }>(`/kiosk/product-setups/steps/${step.id}/nc-files`, {
        method: 'POST', body: fd,
      })
      await qc.invalidateQueries({ queryKey: ['product-setup', setupId] })
      setSelectedNcFileId(res.ncFileId)
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function toggleRow(seq: number) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(seq) ? next.delete(seq) : next.add(seq)
      return next
    })
  }

  const selectedFile = step.ncFiles.find(f => f.id === selectedNcFileId)

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
                type="number"
                step="0.0001"
                className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400"
                defaultValue={step[axis] ? parseFloat(step[axis]!) : ''}
                onBlur={e => patchStep.mutate({ [axis]: e.target.value ? parseFloat(e.target.value) : null })}
              />
            </div>
          ))}
        </div>
      </section>

      {/* NC bestanden */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">NC-programmabestanden (.h)</h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <Upload size={13} /> {uploading ? 'Uploaden…' : 'Bestand uploaden'}
          </button>
          <input ref={fileInputRef} type="file" accept=".h" className="hidden" onChange={handleUpload} />
        </div>

        {uploadError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{uploadError}</div>
        )}

        {step.ncFiles.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nog geen .h bestanden geüpload</p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {[...step.ncFiles].reverse().map(f => (
              <div
                key={f.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                  selectedNcFileId === f.id
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                )}
                onClick={() => setSelectedNcFileId(f.id)}
              >
                <FileText size={16} className={selectedNcFileId === f.id ? 'text-teal-600' : 'text-gray-400'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {f.programName && <span className="mr-2">{f.programName}</span>}
                    {f.toolCallCount} tool calls · {fmtDate(f.uploadedAt)}
                  </p>
                </div>
                {selectedNcFileId === f.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); validate() }}
                    disabled={validating}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-600 text-white rounded text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={validating ? 'animate-spin' : ''} />
                    {validation ? 'Hervalideren' : 'Importeer samenstellingen'}
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); if (confirm('NC bestand verwijderen?')) deleteNcFile.mutate(f.id) }}
                  className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Validatietabel */}
        {validation && (
          <div>
            {/* Summary */}
            <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-sm font-medium text-gray-700">
                {validation.programName && <span className="mr-2 text-gray-500">{validation.programName}</span>}
                Validatie: <span className="text-green-600">{validation.summary.present} aanwezig</span>
                {validation.summary.missing > 0 && <span className="text-red-600"> · {validation.summary.missing} ontbreken</span>}
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
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">L</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">R</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">DL</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">DR</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">TIME2</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">CUR.TIME</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 w-24">LIFE %</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">STATUS</th>
                    <th className="px-2 py-2 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {validation.toolCalls.map(tc => {
                    const me = tc.magazineEntry
                    const expanded = expandedRows.has(tc.sequence)
                    return (
                      <Fragment key={tc.sequence}>
                        <tr className={cn('group', tc.status === 'ontbreekt' && 'bg-red-50/40')}>
                          {/* Health dot */}
                          <td className="px-2 py-2">
                            <div className={cn('w-2 h-2 rounded-full', me
                              ? lifeDotColor(me.time2, me.curTime)
                              : tc.status === 'ontbreekt' ? 'bg-red-300' : 'bg-gray-200'
                            )} />
                          </td>
                          <td className="px-3 py-2 font-mono font-medium text-gray-800">
                            {tc.toolNumber != null ? `T${tc.toolNumber}` : tc.toolName ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{me?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.l ?? null)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.r ?? null)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.dl ?? null)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmt(me?.dr ?? null)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtTime(me?.time2 ?? null)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 font-mono">{fmtTime(me?.curTime ?? null)}</td>
                          <td className="px-3 py-2">
                            <LifeBarMini time2={me?.time2 ?? null} curTime={me?.curTime ?? null} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={tc.status} />
                          </td>
                          <td className="px-2 py-2">
                            {tc.status === 'ontbreekt' && (
                              <button onClick={() => toggleRow(tc.sequence)} className="p-0.5 rounded hover:bg-gray-200 text-gray-400">
                                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded && tc.status === 'ontbreekt' && (
                          <tr>
                            <td colSpan={12} className="px-4 pb-3 pt-1">
                              <OntbreektDetail tc={tc} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Ontbreekt detail (in andere machines + op voorraad) ───────────────────────

function OntbreektDetail({ tc }: { tc: ValidationToolCall }) {
  const [subTab, setSubTab] = useState<'machines' | 'voorraad'>('machines')
  const qc = useQueryClient()

  const uitnemen = useMutation({
    mutationFn: (locId: string) => apiFetch(`/kiosk/tooling/stock-locations/${locId}/mutate`, {
      method: 'POST',
      body: JSON.stringify({ delta: -1 }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nc-validate'] }),
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setSubTab('machines')}
          className={cn('px-3 py-1 rounded text-xs font-medium', subTab === 'machines' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
        >
          In andere machines ({tc.inOtherMachines?.length ?? 0})
        </button>
        <button
          onClick={() => setSubTab('voorraad')}
          className={cn('px-3 py-1 rounded text-xs font-medium', subTab === 'voorraad' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
        >
          Op voorraad ({tc.componentsInStock?.reduce((a, c) => a + c.locations.length, 0) ?? 0})
        </button>
      </div>

      {subTab === 'machines' && (
        <div>
          {!tc.inOtherMachines?.length ? (
            <p className="text-xs text-gray-400 italic">Niet aangetroffen in andere machines</p>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500"><th className="text-left pb-1">Machine</th><th className="text-left pb-1">Positie</th><th className="text-right pb-1">Aantal</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {tc.inOtherMachines?.map((m, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-medium text-gray-700">{m.machineName}</td>
                    <td className="py-1.5 text-gray-500 font-mono">T{m.toolNumber}</td>
                    <td className="py-1.5 text-right text-gray-500">{m.count}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subTab === 'voorraad' && (
        <div>
          {!tc.componentsInStock?.length ? (
            <p className="text-xs text-gray-400 italic">Geen componenten op voorraad gevonden</p>
          ) : (
            <div className="space-y-3">
              {tc.componentsInStock?.map(item => (
                <div key={item.itemId}>
                  <p className="text-xs font-semibold text-gray-700 mb-1">{item.itemName} <span className="text-gray-400 font-normal">({item.itemType})</span></p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-500"><th className="text-left pb-1">Locatie</th><th className="text-right pb-1">Aantal</th><th className="pb-1" /></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {item.locations.map(loc => (
                        <tr key={loc.locId}>
                          <td className="py-1.5 font-mono text-gray-700">{loc.locationCode}</td>
                          <td className="py-1.5 text-right text-gray-600">{loc.quantity} st.</td>
                          <td className="py-1.5 pl-2">
                            <button
                              disabled={uitnemen.isPending}
                              onClick={() => uitnemen.mutate(loc.locId)}
                              className="px-2 py-0.5 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:opacity-50"
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
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Bijlagen
// ══════════════════════════════════════════════════════════════════════════════

function BijlagenTab({ step }: { step: Step }) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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
          {step.attachments.map(att => (
            <div key={att.id} className="group relative flex flex-col gap-1.5">
              {/* Thumbnail / icoon */}
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center relative">
                {isImage(att.mimeType, att.fileName) ? (
                  <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
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
          ))}
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
