import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  ChevronDown,
  Search,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  AlertTriangle,
  Wrench,
  ChevronRight,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CncMachine {
  id: string
  machineId: string | null
  name: string
  category: string
  cncController: string | null
  cncIpAddress: string | null
  isActive: boolean
}

interface CncToolEntry {
  id: string
  machineId: string
  machineName?: string
  toolNumber: number
  name: string | null   // null = lege magazijnpositie
  l: string | null
  r: string | null
  dl: string | null
  dr: string | null
  time2: string | null
  curTime: string | null
  doc: string | null
  locked: boolean
  syncedAt: string
  isEmpty?: boolean     // client-side gegenereerde lege slot
}

interface ToolStats {
  total: number
  atRisk: number
  critical: number
  expired: number
  locked: number
}

interface SyncLog {
  id: string
  status: 'running' | 'success' | 'error'
  toolsCount: number | null
  durationMs: number | null
  errorMessage: string | null
  fileName: string | null
  startedAt: string
  completedAt: string | null
}

interface ToolsResponse {
  stats: ToolStats
  cncMaxTools: number | null
  lastSync: SyncLog | null
  tools: CncToolEntry[]
}

interface AllToolsResponse {
  stats: ToolStats
  tools: CncToolEntry[]
}

interface ProjectUsageEntry {
  setupId: string
  articleNo: string | null
  articleName: string | null
  createdAt: string
  archivedAt: string | null
  totalSeconds: number
}

interface AssemblyUsageItem {
  id: string
  ncNumber: number
  ncName: string
  estimatedQuantity: number | null
  totalUses: number
  uniqueSetups: number
  totalSeconds: number
  maxConcurrent: number
  projects: ProjectUsageEntry[]
}

interface ItemUsageItem {
  id: string
  itemType: string
  name: string
  orderingCode: string | null
  estimatedQuantity: number | null
  totalUses: number
  uniqueSetups: number
  totalSeconds: number
  maxConcurrent: number
  assemblyNames: string[]
  projects: ProjectUsageEntry[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToolCode(name: string | null): string {
  if (!name) return ''
  const m = name.match(/^(.+)-([A-Z]?\d+\w*)$/)
  const toolCode   = m ? m[1] : name
  const holderCode = m ? m[2] : ''

  const MAT: Record<string, string> = { A: 'Aluminium', U: 'Universeel', H: 'HSS' }
  const LEN: Record<string, string> = { SN: 'Normale lengte', N: 'Normale lengte', SL: 'Lang', L: 'Lang', K: 'Kort' }

  // Houdertype
  let houder = ''
  if (holderCode) {
    const n = parseInt(holderCode)
    if (holderCode.startsWith('H'))      houder = 'HSK'
    else if (holderCode.startsWith('S')) houder = 'SK50'
    else if (n >= 101 && n <= 199)       houder = 'Freeskop'
    else if (n >= 201 && n <= 299)       houder = 'Opschroefhouder'
    else if (n >= 301 && n <= 399)       houder = 'Weldonhouder'
    else if (n >= 401 && n <= 499)       houder = 'Spantang'
    else if (n >= 501 && n <= 599)       houder = 'Boorhoofd'
    else if (n >= 601 && n <= 699)       houder = 'Morse conus'
    else if (n >= 701 && n <= 799)       houder = 'Tussenhouder'
    else if (n >= 801 && n <= 899)       houder = 'Diverse houder'
  }

  let parts: string[] = []

  // WP-frezen met prefix (101-WP42R030)
  const wpMatch = toolCode.match(/^(\d+)-WP(\d+)(R(\d+)|H(\d+\w*))/i)
  // WP zonder prefix (WP66R6)
  const wpSimple = toolCode.match(/^WP(\d+)R(\d+\.?\d*)/i)
  // VF/BF: VF100A2SN
  const vfMatch  = toolCode.match(/^(VF|BF)(\d{2,3})([AU]?)(\d?)S?(SN|SL|N|L)?/i)
  // Torusfrees: T100R030A2SN
  const torMatch = toolCode.match(/^T(\d{3})R(\d{3})([AU]?)(\d?)S?(SN|SL|N|L)?/i)
  // Tap: TM100X150AD
  const tmMatch  = toolCode.match(/^TM(\d{3})X(\d+)([AU]?)(D|B)?/i)
  // Centerboor: CB100H90N
  const cbMatch  = toolCode.match(/^CB(\d{3})H(\d+)(N|L)?/i)
  // Boor: B010AHSSK
  const bMatch   = toolCode.match(/^B(\d{3})([AU]?)(HSS|HM)?(K|L)?/i)
  // Afbraamfrees: SPAB12H45A
  const spabMatch = toolCode.match(/^SPAB(\d+)H(\d+)([AU]?)/i)

  if (spabMatch) {
    parts = ['Afbraamfrees', `${spabMatch[1]}x${spabMatch[2]}°`,
      spabMatch[3] ? MAT[spabMatch[3].toUpperCase()] ?? '' : ''].filter(Boolean)
  } else if (/^SP/i.test(toolCode)) {
    parts = ['Special']
  } else if (wpMatch) {
    const prefix = parseInt(wpMatch[1]), d = parseInt(wpMatch[2])
    const rVal = wpMatch[4] ? `R${parseInt(wpMatch[4]) / 10}` : ''
    const hVal = wpMatch[5] ?? ''
    const wpType = prefix === 101 ? 'Torusfrees (V platen)'
                 : prefix === 102 ? 'Torusfrees (Ronde platen)'
                 : prefix === 103 ? 'Hoekfrees'
                 : prefix === 105 ? 'Vlakfrees'
                 : 'Wisselplaatfrees'
    const wpDim  = prefix === 105 ? `Ø${d}x${hVal}` : `Ø${d}${rVal ? ' ' + rVal : hVal ? ' H' + hVal : ''}`
    parts = [wpType, wpDim].filter(Boolean)
  } else if (wpSimple) {
    parts = ['Wisselplaatfrees', `Ø${parseInt(wpSimple[1])} R${wpSimple[2]}`]
  } else if (vfMatch) {
    const typeName = vfMatch[1].toUpperCase() === 'VF' ? 'Vingerfrees' : 'Bolfrees'
    const d = vfMatch[2].length === 3 ? parseInt(vfMatch[2]) / 10 : parseInt(vfMatch[2])
    const mat = vfMatch[3] ? MAT[vfMatch[3].toUpperCase()] ?? '' : ''
    const snij = vfMatch[4] ? `${vfMatch[4]} snijder` : ''
    const len = vfMatch[5] ? LEN[vfMatch[5].toUpperCase()] ?? '' : ''
    parts = [typeName, `Ø${d}`, snij, mat, len].filter(Boolean)
  } else if (torMatch) {
    const d = parseInt(torMatch[1]) / 10, r = parseInt(torMatch[2]) / 10
    const mat = torMatch[3] ? MAT[torMatch[3].toUpperCase()] ?? '' : ''
    const snij = torMatch[4] ? `${torMatch[4]} snijder` : ''
    const len = torMatch[5] ? LEN[torMatch[5].toUpperCase()] ?? '' : ''
    parts = ['Torusfrees', `Ø${d} R${r}`, snij, mat, len].filter(Boolean)
  } else if (tmMatch) {
    const thread = parseInt(tmMatch[1]) / 10
    const pitch  = parseInt(tmMatch[2]) / 100
    const mat  = tmMatch[3] ? MAT[tmMatch[3].toUpperCase()] ?? '' : ''
    const type2 = tmMatch[4]?.toUpperCase() === 'D' ? 'Doorlopend' : tmMatch[4]?.toUpperCase() === 'B' ? 'Blind' : ''
    parts = ['Tap', `M${thread} p${pitch}`, mat, type2].filter(Boolean)
  } else if (cbMatch) {
    const d = parseInt(cbMatch[1]) / 10
    const angle = cbMatch[2]
    const len = cbMatch[3] ? LEN[cbMatch[3].toUpperCase()] ?? '' : ''
    parts = ['Centerboor', `Ø${d}`, `${angle}° tophoek`, len].filter(Boolean)
  } else if (bMatch) {
    const d = parseInt(bMatch[1])
    const mat  = bMatch[2] ? MAT[bMatch[2].toUpperCase()] ?? '' : ''
    const steel = bMatch[3]?.toUpperCase() ?? ''
    const len  = bMatch[4] ? LEN[bMatch[4].toUpperCase()] ?? '' : ''
    parts = ['Boor', `Ø${d}`, mat, steel, len].filter(Boolean)
  }

  const toolDesc = parts.join(', ')
  if (!toolDesc && !houder) return ''
  if (!houder) return toolDesc
  if (!toolDesc) return houder
  return `${toolDesc} — ${houder}`
}

function lifePercent(tool: CncToolEntry): number | null {
  const time2 = tool.time2 ? parseFloat(tool.time2) : 0
  const curTime = tool.curTime ? parseFloat(tool.curTime) : 0
  if (time2 <= 0) return null
  return Math.min((curTime / time2) * 100, 100)
}

function lifeColor(pct: number | null): string {
  if (pct === null) return ''
  if (pct >= 100) return 'bg-red-700'
  if (pct >= 90)  return 'bg-red-500'
  if (pct >= 70)  return 'bg-orange-400'
  return 'bg-green-500'
}

function lifeDotColor(tool: CncToolEntry): string {
  const pct = lifePercent(tool)
  if (pct === null) {
    // Geen time2-limiet ingesteld — als er wel curTime is, is de tool gezond
    const curTime = tool.curTime ? parseFloat(tool.curTime) : 0
    return curTime > 0 ? 'bg-green-500' : 'bg-gray-300'
  }
  if (pct >= 100) return 'bg-red-700'
  if (pct >= 90)  return 'bg-red-500'
  if (pct >= 70)  return 'bg-orange-400'
  return 'bg-green-500'
}

function formatTime(val: string | null | undefined): string {
  if (val === null || val === undefined) return '0'
  const n = parseFloat(val)
  return isNaN(n) ? '0' : n.toFixed(0)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(secs: number): string {
  if (secs <= 0) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

function parseWisselplaat(comment: string | null): { body: string; wisselplaat: string } | null {
  if (!comment) return null
  const idx = comment.indexOf('WP:')
  if (idx === -1) return null
  const body = comment.slice(0, idx).trim()
  const wisselplaat = comment.slice(idx + 3).trim()
  return body && wisselplaat ? { body, wisselplaat } : null
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg px-5 py-3 min-w-[90px]">
      <span className={cn('text-2xl font-bold', color ?? 'text-gray-800')}>
        {value.toLocaleString('nl-NL')}
      </span>
      <span className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  )
}

// ── Life % bar ────────────────────────────────────────────────────────────────

function LifeBar({ tool }: { tool: CncToolEntry }) {
  const pct = lifePercent(tool)
  if (pct === null) {
    // Geen time2-limiet — als er curTime is, toon een volle groene balk (tool is gezond)
    const curTime = tool.curTime ? parseFloat(tool.curTime) : 0
    if (curTime > 0) {
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500 w-full" />
          </div>
          <span className="text-xs text-gray-400 w-9 text-right">—</span>
        </div>
      )
    }
    return <span className="text-gray-400 text-sm">-</span>
  }
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', lifeColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 w-9 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ── Sync status badge ─────────────────────────────────────────────────────────

function SyncBadge({ log }: { log: SyncLog | null }) {
  if (!log) return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <Clock size={12} /> Nog niet gesynchroniseerd
    </span>
  )
  if (log.status === 'running') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
      <RefreshCw size={12} className="animate-spin" /> Bezig...
    </span>
  )
  if (log.status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600">
      <XCircle size={12} /> {log.errorMessage ?? 'Fout'} · {formatDate(log.startedAt)}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600">
      <CheckCircle size={12} /> {log.toolsCount} tools · {formatDate(log.startedAt)}
    </span>
  )
}

// ── Machine dropdown ──────────────────────────────────────────────────────────

function MachineDropdown({
  machines,
  selected,
  showAll,
  onSelect,
  onSelectAll,
}: {
  machines: CncMachine[]
  selected: CncMachine | null
  showAll: boolean
  onSelect: (m: CncMachine) => void
  onSelectAll: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:border-gray-400 transition-colors min-w-[200px]"
      >
        {showAll ? (
          <>
            <Layers size={14} className="text-primary shrink-0" />
            <span className="flex-1 text-left font-medium text-primary">Alle machines</span>
          </>
        ) : selected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            <span className="flex-1 text-left font-medium truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-gray-400">Selecteer machine...</span>
        )}
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <button
            onClick={() => { onSelectAll(); setOpen(false) }}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors border-b border-gray-100',
              showAll && 'bg-primary/5 text-primary font-medium',
            )}
          >
            <Layers size={14} className="shrink-0" />
            <span className="flex-1">Alle machines</span>
            <span className="text-xs text-gray-400 shrink-0">{machines.length} machines</span>
          </button>
          {machines.map((m) => (
            <button
              key={m.id}
              onClick={() => { onSelect(m); setOpen(false) }}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors',
                !showAll && selected?.id === m.id && 'bg-primary/5 text-primary font-medium',
              )}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
              <span className="flex-1 truncate">{m.name}</span>
              {m.cncController && (
                <span className="text-xs text-gray-400 shrink-0">{m.cncController}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Assembly types ────────────────────────────────────────────────────────────

interface AssemblyListItem {
  id: string
  ncNumber: number
  ncName: string
  comment: string | null
  toolLength: number | null
  presetDiameter: number | null
  toolName: string | null
  toolCategory: string | null
  toolManufacturer: string | null
  holderName: string | null
  holderManufacturer: string | null
  componentCount: number
  machineCount: number
}

interface AssemblyComponent {
  type: string
  position: number
  reach: number | null
  name: string
  comment: string | null
  orderingCode: string | null
  manufacturer: string | null
  category: string | null
  photoUrl: string | null
  wisselplaatPhotoUrl: string | null
  schroefOrderingCode: string | null
  schroefPhotoUrl: string | null
}

interface AssemblyInstance {
  toolNumber: number
  l: string | null
  r: string | null
  curTime: string | null
  time2: string | null
  locked: boolean
  syncedAt: string
  machineName: string
  machineId: string
}

interface AssemblyDetail {
  assembly: {
    id: string
    ncNumber: number
    ncName: string
    comment: string | null
    toolLength: number | null
    presetDiameter: number | null
    estimatedQuantity: number | null
  }
  components: AssemblyComponent[]
  instances: AssemblyInstance[]
}

// ── Component type badge ──────────────────────────────────────────────────────

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
  return type === 'holder'    ? 'bg-blue-100 text-blue-700' :
         type === 'extension' ? 'bg-gray-100 text-gray-600' :
         label === 'Frees'    ? 'bg-green-100 text-green-700' :
         label === 'Boor'     ? 'bg-orange-100 text-orange-700' :
         label === 'Tap'      ? 'bg-purple-100 text-purple-700' :
         'bg-gray-100 text-gray-600'
}

function ComponentBadge({ type, category }: { type: string; category: string | null }) {
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', componentBadgeColor(type, category))}>
      {componentLabel(type, category)}
    </span>
  )
}

// ── Assembly display-rijen (explodeert WP-componenten naar sub-rijen) ─────────

interface DisplayRow {
  label: string
  labelColor: string
  name: string
  photoUrl: string | null
  orderingCode: string | null
  manufacturer: string | null
  reach: number | null
}

function expandComponents(components: AssemblyComponent[]): DisplayRow[] {
  const rows: DisplayRow[] = []
  for (const c of components) {
    const wp = parseWisselplaat(c.comment)
    if (wp) {
      rows.push({
        label:        componentLabel(c.type, c.category),
        labelColor:   componentBadgeColor(c.type, c.category),
        name:         wp.body,
        photoUrl:     c.photoUrl,
        orderingCode: c.orderingCode,
        manufacturer: c.manufacturer,
        reach:        c.reach,
      })
      rows.push({
        label:        'Wisselplaat',
        labelColor:   'bg-yellow-100 text-yellow-700',
        name:         wp.wisselplaat,
        photoUrl:     c.wisselplaatPhotoUrl,
        orderingCode: null,
        manufacturer: null,
        reach:        null,
      })
      if (c.schroefOrderingCode || c.schroefPhotoUrl) {
        rows.push({
          label:        'Schroef',
          labelColor:   'bg-gray-100 text-gray-500',
          name:         c.schroefOrderingCode ?? '—',
          photoUrl:     c.schroefPhotoUrl,
          orderingCode: null,
          manufacturer: null,
          reach:        null,
        })
      }
    } else {
      rows.push({
        label:        componentLabel(c.type, c.category),
        labelColor:   componentBadgeColor(c.type, c.category),
        name:         c.name,
        photoUrl:     c.photoUrl,
        orderingCode: c.orderingCode,
        manufacturer: c.manufacturer,
        reach:        c.reach,
      })
    }
  }
  return rows
}

// ── Component (where-used) types ─────────────────────────────────────────────

interface ComponentListItem {
  id: string
  itemType: string
  itemCategory: string | null
  name: string
  comment: string | null
  orderingCode: string | null
  manufacturer: string | null
  photoUrl: string | null
  wisselplaatPhotoUrl: string | null
  schroefOrderingCode: string | null
  schroefPhotoUrl: string | null
  assemblyCount: number
  machineCount: number
}

interface ComponentAssemblyUsage {
  assemblyId: string
  ncNumber: number
  ncName: string
  role: 'tool' | 'holder' | 'adapter'
  instances: { machineName: string; toolNumber: number; syncedAt: string }[]
}

interface ComponentDetail {
  item: {
    id: string
    itemType: string
    itemCategory: string | null
    name: string
    comment: string | null
    orderingCode: string | null
    manufacturer: string | null
    photoUrl: string | null
    wisselplaatPhotoUrl: string | null
    schroefOrderingCode: string | null
    schroefPhotoUrl: string | null
    estimatedQuantity: number | null
  }
  assemblies: ComponentAssemblyUsage[]
}

// ── Rol-label voor where-used ─────────────────────────────────────────────────

function rolLabel(role: string): string {
  if (role === 'tool')   return 'Als gereedschap'
  if (role === 'holder') return 'Als houder'
  return 'Als adapter'
}

function rolColor(role: string): string {
  if (role === 'tool')   return 'bg-green-100 text-green-700'
  if (role === 'holder') return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-600'
}

// ── ComponentBrowser ──────────────────────────────────────────────────────────

function ComponentBrowser() {
  const [search, setSearch]             = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [selected, setSelected]         = useState<ComponentListItem | null>(null)
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingWisselplaatPhoto, setUploadingWisselplaatPhoto] = useState(false)
  const [uploadingSchroefPhoto, setUploadingSchroefPhoto] = useState(false)
  const [schroefCode, setSchroefCode] = useState('')
  const [savingSchroef, setSavingSchroef] = useState(false)
  const [schroefError, setSchroefError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset expanded state en foutmelding als een nieuw item geselecteerd wordt
  useEffect(() => { setExpanded(new Set()); setSchroefError(null) }, [selected?.id])

  function pasteImageFile(e: React.ClipboardEvent): File | null {
    return Array.from(e.clipboardData?.items ?? [])
      .find(item => item.type.startsWith('image/'))
      ?.getAsFile() ?? null
  }

  async function uploadComponentPhoto(file: File) {
    if (!selected) return
    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await apiFetch(`/admin/cnc/components/${selected.id}/photo`, { method: 'POST', body: fd })
      queryClient.invalidateQueries({ queryKey: ['cnc-components'] })
      queryClient.invalidateQueries({ queryKey: ['cnc-component-detail', selected.id] })
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function uploadWisselplaatPhoto(file: File) {
    if (!selected) return
    setUploadingWisselplaatPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await apiFetch(`/admin/cnc/components/${selected.id}/wisselplaat-photo`, { method: 'POST', body: fd })
      queryClient.invalidateQueries({ queryKey: ['cnc-components'] })
      queryClient.invalidateQueries({ queryKey: ['cnc-component-detail', selected.id] })
    } finally {
      setUploadingWisselplaatPhoto(false)
    }
  }

  async function handleComponentPhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { await uploadComponentPhoto(file); e.target.value = '' }
  }

  async function handleWisselplaatPhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { await uploadWisselplaatPhoto(file); e.target.value = '' }
  }

  async function uploadSchroefPhoto(file: File) {
    if (!selected) return
    setUploadingSchroefPhoto(true)
    setSchroefError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await apiFetch(`/admin/cnc/components/${selected.id}/schroef-photo`, { method: 'POST', body: fd })
      queryClient.invalidateQueries({ queryKey: ['cnc-components'] })
      queryClient.invalidateQueries({ queryKey: ['cnc-component-detail', selected.id] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload mislukt'
      setSchroefError(
        msg.includes('rechten') || msg.includes('sessie') || msg.includes('401') || msg.includes('403')
          ? `${msg} — log opnieuw in als admin`
          : msg
      )
    } finally {
      setUploadingSchroefPhoto(false)
    }
  }

  async function handleSchroefPhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) { await uploadSchroefPhoto(file); e.target.value = '' }
  }

  async function handleSchroefSave() {
    if (!selected) return
    setSavingSchroef(true)
    setSchroefError(null)
    try {
      await apiFetch(`/admin/cnc/components/${selected.id}/schroef`, {
        method: 'PUT',
        body: JSON.stringify({ orderingCode: schroefCode || null }),
      })
      queryClient.invalidateQueries({ queryKey: ['cnc-component-detail', selected.id] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt'
      setSchroefError(
        msg.includes('rechten') || msg.includes('sessie') || msg.includes('401') || msg.includes('403')
          ? `${msg} — log opnieuw in als admin`
          : msg
      )
    } finally {
      setSavingSchroef(false)
    }
  }

  const { data: listData, isLoading: listLoading } = useQuery<{ items: ComponentListItem[] }>({
    queryKey: ['cnc-components', debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      return apiFetch(`/kiosk/cnc/components${params.size ? '?' + params.toString() : ''}`)
    },
  })

  const { data: detail, isLoading: detailLoading } = useQuery<ComponentDetail>({
    queryKey: ['cnc-component-detail', selected?.id],
    queryFn: () => apiFetch(`/kiosk/cnc/components/${selected!.id}`),
    enabled: !!selected,
  })

  // Sync schroef artikelnummer met detail (staat ná de useQuery declaratie)
  useEffect(() => {
    setSchroefCode(detail?.item.schroefOrderingCode ?? '')
  }, [detail?.item.schroefOrderingCode])

  const items = listData?.items ?? []

  function toggleExpand(assemblyId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(assemblyId) ? next.delete(assemblyId) : next.add(assemblyId)
      return next
    })
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Linker panel: componentenlijst ── */}
      <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Zoek component, adapter, frees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Laden...</div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              {debouncedSearch ? 'Geen resultaten' : 'Typ om te zoeken'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors',
                    selected?.id === item.id && 'bg-primary/5 border-l-2 border-primary',
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {item.photoUrl && (
                      <div className="rounded overflow-hidden shrink-0" style={{ width: 32, height: 32, minWidth: 32, maxWidth: 32, maxHeight: 32 }}>
                        <img src={item.photoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain', display: 'block' }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <ComponentBadge type={item.itemType} category={item.itemCategory} />
                        <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
                      </div>
                      {(() => {
                        const wp = parseWisselplaat(item.comment)
                        if (wp) return (
                          <div className="text-xs text-gray-400 truncate">
                            {wp.body} <span className="text-gray-300 mx-0.5">·</span> WP: {wp.wisselplaat}
                          </div>
                        )
                        if (item.comment) return (
                          <div className="text-xs text-gray-400 truncate">{item.comment}</div>
                        )
                        return null
                      })()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-300 mt-0.5">
                    {item.assemblyCount > 0
                      ? `${item.assemblyCount} samenst.${item.machineCount > 0 ? ` · ${item.machineCount} machine${item.machineCount !== 1 ? 's' : ''}` : ''}`
                      : 'Niet in gebruik'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {!listLoading && debouncedSearch && (
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
            {items.length} resultaten
          </div>
        )}
      </div>

      {/* ── Rechter panel: where-used detail ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Wrench size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Zoek een component om te zien waar het gebruikt wordt</p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>
        ) : detail ? (
          <div className="space-y-4 max-w-2xl">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ComponentBadge type={detail.item.itemType} category={detail.item.itemCategory} />
                <h2 className="text-lg font-semibold text-gray-900">{detail.item.name}</h2>
              </div>
              {(() => {
                const wp = parseWisselplaat(detail.item.comment)
                if (wp) return (
                  <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                    <p><span className="font-medium">Body:</span> {wp.body}</p>
                    <p><span className="font-medium">WP:</span> {wp.wisselplaat}</p>
                  </div>
                )
                if (detail.item.comment) return (
                  <p className="text-sm text-gray-500 mt-0.5">{detail.item.comment}</p>
                )
                return null
              })()}
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                {detail.item.manufacturer && <span>{detail.item.manufacturer}</span>}
                {detail.item.orderingCode  && <span className="font-mono">{detail.item.orderingCode}</span>}
                <span className="flex items-center gap-1.5">
                  Voorraad:
                  <EstQtyInput
                    value={detail.item.estimatedQuantity}
                    onSave={val =>
                      apiFetch(`/admin/cnc/tooling-usage/items/${detail.item.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ estimatedQuantity: val }),
                      }).then(() => queryClient.invalidateQueries({ queryKey: ['cnc-component-detail', detail.item.id] }))
                    }
                  />
                </span>
              </div>
            </div>

            {/* Foto */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-6">
              {/* Freeslichaam foto */}
              <div
                className="flex flex-col items-center gap-1.5 outline-none"
                tabIndex={0}
                onPaste={(e) => { const f = pasteImageFile(e); if (f) { e.preventDefault(); uploadComponentPhoto(f) } }}
                title="Klik hier, dan Ctrl+V om te plakken"
              >
                <span className="text-xs font-medium text-gray-500">Freeslichaam</span>
                <div className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center" style={{ width: 100, height: 100 }}>
                  {detail.item.photoUrl
                    ? <img src={detail.item.photoUrl} alt="" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block' }} />
                    : <span className="text-xs text-gray-300">Geen foto</span>
                  }
                </div>
                <label className="cursor-pointer text-xs text-gray-400 hover:text-primary border border-dashed border-gray-300 rounded px-2 py-1 transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={handleComponentPhotoUpload} />
                  {uploadingPhoto ? 'Bezig...' : (detail.item.photoUrl ? 'Wijzigen' : 'Uploaden')}
                </label>
                <span className="text-xs text-gray-300">Ctrl+V</span>
              </div>

              {/* Wisselplaat foto — alleen tonen als comment WP: bevat */}
              {parseWisselplaat(detail.item.comment) !== null && (
                <div
                  className="flex flex-col items-center gap-1.5 outline-none"
                  tabIndex={0}
                  onPaste={(e) => { const f = pasteImageFile(e); if (f) { e.preventDefault(); uploadWisselplaatPhoto(f) } }}
                  title="Klik hier, dan Ctrl+V om te plakken"
                >
                  <span className="text-xs font-medium text-gray-500">Wisselplaat</span>
                  <div className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center" style={{ width: 100, height: 100 }}>
                    {detail.item.wisselplaatPhotoUrl
                      ? <img src={detail.item.wisselplaatPhotoUrl} alt="" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block' }} />
                      : <span className="text-xs text-gray-300">Geen foto</span>
                    }
                  </div>
                  <label className="cursor-pointer text-xs text-gray-400 hover:text-primary border border-dashed border-gray-300 rounded px-2 py-1 transition-colors">
                    <input type="file" accept="image/*" className="hidden" onChange={handleWisselplaatPhotoUpload} />
                    {uploadingWisselplaatPhoto ? 'Bezig...' : (detail.item.wisselplaatPhotoUrl ? 'Wijzigen' : 'Uploaden')}
                  </label>
                  <span className="text-xs text-gray-300">Ctrl+V</span>
                </div>
              )}
            </div>

            {/* Schroef — alleen tonen als comment WP: bevat */}
            {parseWisselplaat(detail.item.comment) !== null && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schroef</p>
                <div className="flex items-start gap-6">
                  {/* Foto */}
                  <div
                    className="flex flex-col items-center gap-1.5 outline-none"
                    tabIndex={0}
                    onPaste={(e) => { const f = pasteImageFile(e); if (f) { e.preventDefault(); uploadSchroefPhoto(f) } }}
                    title="Klik hier, dan Ctrl+V om te plakken"
                  >
                    <div className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center" style={{ width: 100, height: 100 }}>
                      {detail.item.schroefPhotoUrl
                        ? <img src={detail.item.schroefPhotoUrl} alt="" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block' }} />
                        : <span className="text-xs text-gray-300">Geen foto</span>
                      }
                    </div>
                    <label className="cursor-pointer text-xs text-gray-400 hover:text-primary border border-dashed border-gray-300 rounded px-2 py-1 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleSchroefPhotoUpload} />
                      {uploadingSchroefPhoto ? 'Bezig...' : (detail.item.schroefPhotoUrl ? 'Wijzigen' : 'Uploaden')}
                    </label>
                    <span className="text-xs text-gray-300">Ctrl+V</span>
                  </div>

                  {/* Artikelnummer */}
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Artikelnummer</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={schroefCode}
                        onChange={e => setSchroefCode(e.target.value)}
                        placeholder="bijv. T15MH"
                        className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={e => e.key === 'Enter' && handleSchroefSave()}
                      />
                      <button
                        onClick={handleSchroefSave}
                        disabled={savingSchroef}
                        className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingSchroef ? '...' : 'Opslaan'}
                      </button>
                    </div>
                  </div>
                </div>
                {schroefError && (
                  <p className="text-xs text-red-500 mt-2">{schroefError}</p>
                )}
              </div>
            )}

            {/* Samenstellingen */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Gebruikt in samenstellingen
                </span>
                <span className="text-xs text-gray-400">{detail.assemblies.length}</span>
              </div>

              {detail.assemblies.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">
                  Niet gevonden in een samenstelling
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {detail.assemblies.map(a => {
                    const isOpen = expanded.has(a.assemblyId)
                    return (
                      <div key={a.assemblyId}>
                        <button
                          onClick={() => toggleExpand(a.assemblyId)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <ChevronRight
                            size={14}
                            className={cn('text-gray-300 shrink-0 transition-transform', isOpen && 'rotate-90')}
                          />
                          <span className="font-mono text-xs text-gray-400 shrink-0">
                            T{String(a.ncNumber).padStart(3, '0')}
                          </span>
                          <span className="text-sm font-medium text-gray-800 flex-1 truncate">{a.ncName}</span>
                          <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0', rolColor(a.role))}>
                            {rolLabel(a.role)}
                          </span>
                          {a.instances.length > 0 && (
                            <span className="text-xs text-gray-400 shrink-0">{a.instances.length}×</span>
                          )}
                        </button>

                        {isOpen && (
                          <div className="bg-gray-50 border-t border-gray-100">
                            {a.instances.length === 0 ? (
                              <div className="px-10 py-2 text-xs text-gray-400">Niet in huidig magazijn</div>
                            ) : (
                              a.instances.map((inst, i) => (
                                <div key={i} className="flex items-center gap-3 px-10 py-1.5 text-xs text-gray-600 border-b border-gray-100 last:border-0">
                                  <span className="font-medium w-28 truncate">{inst.machineName}</span>
                                  <span className="font-mono text-gray-400">T{inst.toolNumber}</span>
                                  <span className="text-gray-300 ml-auto">{formatDate(inst.syncedAt)}</span>
                                </div>
                              ))
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
        ) : null}
      </div>
    </div>
  )
}

// ── Herlaad bibliotheek knop ─────────────────────────────────────────────────

function ReloadLibraryButton() {
  const queryClient = useQueryClient()
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ items: number; assemblies: number; components: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleReload() {
    setState('loading')
    setResult(null)
    setErrorMsg(null)
    try {
      const data = await apiFetch<{ ok: boolean; items: number; assemblies: number; components: number }>(
        '/admin/cnc/reload-tool-library',
        { method: 'POST' },
      )
      setResult(data)
      setState('success')
      queryClient.invalidateQueries({ queryKey: ['cnc-assemblies'] })
      queryClient.invalidateQueries({ queryKey: ['cnc-components'] })
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Herlaad mislukt')
      setState('error')
    }
  }

  return (
    <div className="flex items-center gap-2 pb-1">
      <button
        onClick={handleReload}
        disabled={state === 'loading'}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:border-gray-400 disabled:opacity-60 transition-colors"
      >
        <RefreshCw size={13} className={cn('text-gray-400', state === 'loading' && 'animate-spin')} />
        <span className="text-gray-600">
          {state === 'loading' ? 'Bezig...' : 'Herlaad bibliotheek'}
        </span>
      </button>
      {state === 'success' && result && (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} />
          {result.items} items · {result.assemblies} samenst. · {result.components} comp.
        </span>
      )}
      {state === 'error' && errorMsg && (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <XCircle size={12} />
          {errorMsg}
        </span>
      )}
    </div>
  )
}

// ── Tooling Library tabs (Samenstellingen / Componenten) ─────────────────────

function ToolingLibraryTabs() {
  const [mode, setMode] = useState<'assemblies' | 'components'>('assemblies')

  return (
    <>
      {/* Sub-tab balk */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode('assemblies')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-t font-medium transition-colors border-b-2 -mb-px',
              mode === 'assemblies'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            Samenstellingen
          </button>
          <button
            onClick={() => setMode('components')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-t font-medium transition-colors border-b-2 -mb-px',
              mode === 'components'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            Componenten
          </button>
        </div>
        <ReloadLibraryButton />
      </div>

      {/* Inhoud */}
      <div className="flex-1 overflow-hidden">
        {mode === 'assemblies' ? <AssemblyBrowser /> : <ComponentBrowser />}
      </div>
    </>
  )
}

// ── Assembly Browser ──────────────────────────────────────────────────────────

function AssemblyBrowser() {
  const [search, setSearch]             = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [selected, setSelected]         = useState<AssemblyListItem | null>(null)

  // Debounce zoekterm
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: listData, isLoading: listLoading } = useQuery<{ assemblies: AssemblyListItem[] }>({
    queryKey: ['cnc-assemblies', debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      return apiFetch(`/kiosk/cnc/assemblies${params.size ? '?' + params.toString() : ''}`)
    },
  })

  const { data: detail, isLoading: detailLoading } = useQuery<AssemblyDetail>({
    queryKey: ['cnc-assembly-detail', selected?.ncName],
    queryFn: () => apiFetch(`/kiosk/cnc/assemblies/${encodeURIComponent(selected!.ncName)}`),
    enabled: !!selected,
  })

  const assemblies = listData?.assemblies ?? []

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Linker panel: lijst ── */}
      <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        {/* Zoekbalk */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Zoek samenstelling of component..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Lijst */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Laden...</div>
          ) : assemblies.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Geen resultaten</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {assemblies.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-2',
                    selected?.id === a.id && 'bg-primary/5 border-l-2 border-primary',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-gray-400 shrink-0">T{String(a.ncNumber).padStart(3, '0')}</span>
                      <span className="text-sm font-medium text-gray-800 truncate">{a.ncName}</span>
                    </div>
                    {a.toolName && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">{a.toolName}</div>
                    )}
                    {a.holderName && (
                      <div className="text-xs text-gray-300 truncate">{a.holderName}</div>
                    )}
                    <div className="text-xs text-gray-300 mt-0.5">
                      {a.machineCount > 0
                        ? `${a.machineCount} machine${a.machineCount !== 1 ? 's' : ''}`
                        : 'Niet in gebruik'}
                    </div>
                  </div>
                  {a.componentCount > 0 && (
                    <span className="text-xs text-gray-300 shrink-0 mt-0.5">+{a.componentCount}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Teller */}
        {!listLoading && (
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
            {assemblies.length} samenstellingen
          </div>
        )}
      </div>

      {/* ── Rechter panel: detail ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Wrench size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Selecteer een samenstelling</p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Laden...</div>
        ) : detail ? (
          <div className="space-y-4 max-w-2xl">
            {/* Header */}
            <div>
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-gray-400">T{String(detail.assembly.ncNumber).padStart(3, '0')}</span>
                <h2 className="text-lg font-semibold text-gray-900">{detail.assembly.ncName}</h2>
              </div>
              {detail.assembly.comment && (
                <p className="text-sm text-gray-500 mt-0.5">{detail.assembly.comment}</p>
              )}
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                {detail.assembly.toolLength != null && (
                  <span>Lengte: <span className="text-gray-600 font-medium">{detail.assembly.toolLength.toFixed(3)} mm</span></span>
                )}
                {detail.assembly.presetDiameter != null && detail.assembly.presetDiameter > 0 && (
                  <span>Diameter: <span className="text-gray-600 font-medium">{detail.assembly.presetDiameter.toFixed(3)} mm</span></span>
                )}
              </div>
            </div>

            {/* Samenstelling */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Samenstelling</span>
              </div>
              {detail.components.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">Geen componenten geregistreerd</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {expandComponents(detail.components).map((row, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tool instanties */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tool instanties</span>
                <span className="text-xs text-gray-400">{detail.instances.length} machine{detail.instances.length !== 1 ? 's' : ''}</span>
              </div>
              {detail.instances.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">
                  Niet gevonden in huidige tooltabellen
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {detail.instances.map((inst, i) => {
                    const time2 = inst.time2 ? parseFloat(inst.time2) : 0
                    const curTime = inst.curTime ? parseFloat(inst.curTime) : 0
                    const pct = time2 > 0 ? Math.min((curTime / time2) * 100, 100) : null
                    return (
                      <div key={i} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                        <span className="text-gray-700 font-medium w-32 truncate">{inst.machineName}</span>
                        <span className="font-mono text-gray-500 text-xs w-10">T{inst.toolNumber}</span>
                        {inst.l && <span className="text-gray-400 text-xs">L={parseFloat(inst.l).toFixed(3)}</span>}
                        {inst.r && <span className="text-gray-400 text-xs">R={parseFloat(inst.r).toFixed(3)}</span>}
                        {pct !== null && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-600' : pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500')}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        )}
                        {inst.locked && <Lock size={12} className="text-gray-400 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Estimated quantity inline input ──────────────────────────────────────────

function EstQtyInput({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value !== null ? String(value) : '')

  useEffect(() => {
    setLocalVal(value !== null ? String(value) : '')
  }, [value])

  const commit = () => {
    const trimmed = localVal.trim()
    const n = trimmed === '' ? null : parseInt(trimmed, 10)
    onSave(n !== null && isNaN(n) ? null : n)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          'text-sm font-medium px-2 py-0.5 rounded border transition-colors',
          value !== null
            ? 'text-gray-700 border-gray-200 hover:border-gray-400'
            : 'text-gray-400 border-dashed border-gray-300 hover:border-gray-400',
        )}
      >
        {value !== null ? value : '—'}
      </button>
    )
  }

  return (
    <input
      type="number"
      min={0}
      className="w-16 text-sm text-center border border-primary rounded px-1 py-0.5 focus:outline-none"
      value={localVal}
      autoFocus
      onChange={e => setLocalVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setEditing(false); setLocalVal(value !== null ? String(value) : '') }
      }}
    />
  )
}

// ── Gebruik tab ───────────────────────────────────────────────────────────────

function GebruikTab() {
  const [subTab, setSubTab] = useState<'Samenstellingen' | 'Componenten'>('Samenstellingen')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: assemblies = [], isLoading: aLoading } = useQuery<AssemblyUsageItem[]>({
    queryKey: ['tooling-usage-assemblies'],
    queryFn: () => apiFetch('/admin/cnc/tooling-usage/assemblies') as Promise<AssemblyUsageItem[]>,
  })

  const { data: items = [], isLoading: iLoading } = useQuery<ItemUsageItem[]>({
    queryKey: ['tooling-usage-items'],
    queryFn: () => apiFetch('/admin/cnc/tooling-usage/items') as Promise<ItemUsageItem[]>,
  })

  const maxAssemblySeconds   = Math.max(...assemblies.map(a => a.totalSeconds), 1)
  const totalAssemblySeconds = assemblies.reduce((s, a) => s + a.totalSeconds, 0)
  const maxItemSeconds       = Math.max(...items.map(i => i.totalSeconds), 1)
  const totalItemSeconds     = items.reduce((s, i) => s + i.totalSeconds, 0)

  async function patchEstimatedQty(type: 'assemblies' | 'items', id: string, val: number | null) {
    await apiFetch(`/admin/cnc/tooling-usage/${type}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ estimatedQuantity: val }),
    })
    qc.invalidateQueries({ queryKey: type === 'assemblies' ? ['tooling-usage-assemblies'] : ['tooling-usage-items'] })
  }

  const isLoading = subTab === 'Samenstellingen' ? aLoading : iLoading

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(['Samenstellingen', 'Componenten'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setSubTab(tab); setExpandedId(null) }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              subTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400">Laden...</p>}

      {/* Samenstellingen */}
      {!isLoading && subTab === 'Samenstellingen' && (
        <div className="space-y-2">
          {assemblies.length === 0 && (
            <p className="text-sm text-gray-400">Geen samenstellingen gekoppeld aan projecten gevonden.</p>
          )}
          {assemblies.map((a, idx) => {
            const barPct   = Math.round((a.totalSeconds / maxAssemblySeconds) * 100)
            const pctOfAll = totalAssemblySeconds > 0 ? Math.round((a.totalSeconds / totalAssemblySeconds) * 100) : 0
            const expanded = expandedId === a.id
            const rankColor = idx === 0 ? 'bg-yellow-400 text-yellow-900'
                            : idx === 1 ? 'bg-gray-300 text-gray-700'
                            : idx === 2 ? 'bg-orange-300 text-orange-900'
                            : 'bg-gray-100 text-gray-500'
            // Dedupliceer op articleNo voor chips — meest machinetijd per artikel
            const uniqueProjects = Object.values(
              a.projects.reduce<Record<string, typeof a.projects[0]>>((acc, p) => {
                const key = p.articleNo ?? p.setupId
                if (!acc[key] || p.totalSeconds > acc[key].totalSeconds) acc[key] = p
                return acc
              }, {})
            )
            const visibleProjects = uniqueProjects.slice(0, 3)
            const hiddenCount     = uniqueProjects.length - visibleProjects.length
            return (
              <div key={a.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div
                  className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  {/* Rang badge */}
                  <div className={cn('shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5', rankColor)}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">{a.ncName}</span>
                      <span className="text-xs text-gray-400 font-mono">T{a.ncNumber}</span>
                    </div>
                    {/* Pareto balk */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden max-w-sm">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-teal-700 w-8 shrink-0">{pctOfAll}%</span>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDuration(a.totalSeconds)}</span>
                    </div>
                    {/* Project chips — altijd zichtbaar */}
                    {visibleProjects.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {visibleProjects.map(p => (
                          <span
                            key={p.setupId}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border',
                              p.archivedAt
                                ? 'bg-gray-50 border-gray-200 text-gray-500'
                                : 'bg-teal-50 border-teal-200 text-teal-700',
                            )}
                          >
                            <span className="font-mono font-medium">{p.articleNo ?? '—'}</span>
                            {p.articleName && <span className="text-gray-400 max-w-[120px] truncate">{p.articleName}</span>}
                            <span className="text-gray-300">·</span>
                            <span>{p.archivedAt ? new Date(p.archivedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Actief'}</span>
                          </span>
                        ))}
                        {hiddenCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">
                            +{hiddenCount} meer
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Stats rechts */}
                  <div className="flex items-center gap-5 shrink-0 mt-0.5">
                    <div className="text-center">
                      <div className="text-xs text-gray-400">Max gelijktijdig</div>
                      <div className="text-sm font-bold text-gray-700">{a.maxConcurrent}</div>
                    </div>
                  </div>
                </div>
                {expanded && a.projects.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left pb-1 font-medium">Artikel</th>
                          <th className="text-left pb-1 font-medium">Naam</th>
                          <th className="text-right pb-1 font-medium">Machinetijd</th>
                          <th className="text-right pb-1 font-medium">Afgerond</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {a.projects.map(p => (
                          <tr key={p.setupId}>
                            <td className="py-1 pr-3 font-mono text-gray-600">{p.articleNo ?? '—'}</td>
                            <td className="py-1 pr-3 text-gray-700">{p.articleName ?? '—'}</td>
                            <td className="py-1 text-right text-gray-600">{fmtDuration(p.totalSeconds)}</td>
                            <td className="py-1 text-right text-gray-400">
                              {p.archivedAt ? new Date(p.archivedAt).toLocaleDateString('nl-NL') : 'Actief'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Componenten */}
      {!isLoading && subTab === 'Componenten' && (
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-gray-400">Geen componenten gekoppeld aan projecten gevonden.</p>
          )}
          {items.map((item, idx) => {
            const barPct   = Math.round((item.totalSeconds / maxItemSeconds) * 100)
            const pctOfAll = totalItemSeconds > 0 ? Math.round((item.totalSeconds / totalItemSeconds) * 100) : 0
            const isOver   = item.estimatedQuantity !== null && item.maxConcurrent >= item.estimatedQuantity
            const expanded = expandedId === item.id
            const rankColor = idx === 0 ? 'bg-yellow-400 text-yellow-900'
                            : idx === 1 ? 'bg-gray-300 text-gray-700'
                            : idx === 2 ? 'bg-orange-300 text-orange-900'
                            : 'bg-gray-100 text-gray-500'
            const uniqueProjects = Object.values(
              item.projects.reduce<Record<string, typeof item.projects[0]>>((acc, p) => {
                const key = p.articleNo ?? p.setupId
                if (!acc[key] || p.totalSeconds > acc[key].totalSeconds) acc[key] = p
                return acc
              }, {})
            )
            const visibleProjects = uniqueProjects.slice(0, 3)
            const hiddenCount     = uniqueProjects.length - visibleProjects.length
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div
                  className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  {/* Rang badge */}
                  <div className={cn('shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5', rankColor)}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">{item.name}</span>
                      {item.orderingCode && (
                        <span className="text-xs text-gray-400 font-mono">{item.orderingCode}</span>
                      )}
                    </div>
                    {item.assemblyNames.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">In: {item.assemblyNames.join(', ')}</p>
                    )}
                    {/* Pareto balk */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden max-w-sm">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-teal-700 w-8 shrink-0">{pctOfAll}%</span>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDuration(item.totalSeconds)}</span>
                    </div>
                    {/* Project chips */}
                    {visibleProjects.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {visibleProjects.map(p => (
                          <span
                            key={p.setupId}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border',
                              p.archivedAt
                                ? 'bg-gray-50 border-gray-200 text-gray-500'
                                : 'bg-teal-50 border-teal-200 text-teal-700',
                            )}
                          >
                            <span className="font-mono font-medium">{p.articleNo ?? '—'}</span>
                            {p.articleName && <span className="text-gray-400 max-w-[120px] truncate">{p.articleName}</span>}
                            <span className="text-gray-300">·</span>
                            <span>{p.archivedAt ? new Date(p.archivedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Actief'}</span>
                          </span>
                        ))}
                        {hiddenCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">
                            +{hiddenCount} meer
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Stats rechts */}
                  <div className="flex items-center gap-5 shrink-0 mt-0.5">
                    <div className="text-center">
                      <div className="text-xs text-gray-400">Max gelijktijdig</div>
                      <div className={cn('text-sm font-bold flex items-center justify-center gap-1', isOver ? 'text-red-500' : 'text-gray-700')}>
                        {item.maxConcurrent}
                        {isOver && <AlertTriangle size={12} className="text-red-400" />}
                      </div>
                    </div>
                    <div className="text-center" onClick={e => e.stopPropagation()}>
                      <div className="text-xs text-gray-400">Geschat aantal</div>
                      <EstQtyInput
                        value={item.estimatedQuantity}
                        onSave={val => patchEstimatedQty('items', item.id, val)}
                      />
                    </div>
                  </div>
                </div>
                {expanded && item.projects.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left pb-1 font-medium">Artikel</th>
                          <th className="text-left pb-1 font-medium">Naam</th>
                          <th className="text-right pb-1 font-medium">Machinetijd</th>
                          <th className="text-right pb-1 font-medium">Afgerond</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {item.projects.map(p => (
                          <tr key={p.setupId}>
                            <td className="py-1 pr-3 font-mono text-gray-600">{p.articleNo ?? '—'}</td>
                            <td className="py-1 pr-3 text-gray-700">{p.articleName ?? '—'}</td>
                            <td className="py-1 text-right text-gray-600">{fmtDuration(p.totalSeconds)}</td>
                            <td className="py-1 text-right text-gray-400">
                              {p.archivedAt ? new Date(p.archivedAt).toLocaleDateString('nl-NL') : 'Actief'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Content component (gebruikt in kiosk dashboard) ───────────────────────────

export function CncMachiningContent() {
  const [activeTab, setActiveTab] = useState<'Samenstellingen' | 'ToolTabel' | 'Gebruik'>('ToolTabel')
  const [selectedMachine, setSelectedMachine] = useState<CncMachine | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'triggering' | 'polling' | 'done' | 'error'>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  const { data: machines = [] } = useQuery<CncMachine[]>({
    queryKey: ['cnc-machines'],
    queryFn: () => apiFetch('/kiosk/cnc/machines'),
  })

  const { data: perMachineData, isLoading: perMachineLoading, isFetching: perMachineFetching, refetch: refetchPerMachine } = useQuery<ToolsResponse>({
    queryKey: ['cnc-tools', selectedMachine?.id],
    queryFn: () => apiFetch(`/kiosk/cnc/machines/${selectedMachine!.id}/tools`),
    enabled: !showAll && !!selectedMachine,
    staleTime: 0,
  })

  const { data: allData, isLoading: allLoading, isFetching: allFetching, refetch: refetchAll } = useQuery<AllToolsResponse>({
    queryKey: ['cnc-tools-all'],
    queryFn: () => apiFetch('/kiosk/cnc/tools'),
    enabled: showAll,
    staleTime: 0,
  })

  const toolsData = showAll ? allData : perMachineData
  const toolsLoading = showAll ? allLoading : perMachineLoading
  const toolsFetching = showAll ? allFetching : perMachineFetching

  // Stop polling bij unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function handleSync() {
    if (syncStatus === 'triggering' || syncStatus === 'polling') return
    setSyncStatus('triggering')
    setSyncError(null)

    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>('/kiosk/cnc/trigger-sync', { method: 'POST' })
      if (!res.ok) throw new Error(res.error ?? 'Agent niet bereikbaar')
    } catch (err: unknown) {
      setSyncStatus('error')
      setSyncError(err instanceof Error ? err.message : 'Fout')
      setTimeout(() => setSyncStatus('idle'), 5000)
      return
    }

    // Agent bevestigd: start pollen (5× elke 4 seconden = 20 sec)
    setSyncStatus('polling')
    pollCountRef.current = 0
    pollRef.current = setInterval(async () => {
      pollCountRef.current++
      showAll ? await refetchAll() : await refetchPerMachine()
      if (pollCountRef.current >= 5) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setSyncStatus('done')
        setTimeout(() => setSyncStatus('idle'), 3000)
      }
    }, 4000)
  }

  const cncMaxTools = (!showAll ? (toolsData as ToolsResponse | undefined)?.cncMaxTools : null) ?? null

  // Voeg lege slots toe voor posities 1–cncMaxTools die geen entry hebben (alleen single-machine)
  const displayTools = useMemo(() => {
    const base = toolsData?.tools ?? []
    if (!cncMaxTools || showAll) return base
    const filled = new Set(base.map(t => t.toolNumber))
    const emptySlots: CncToolEntry[] = Array.from({ length: cncMaxTools }, (_, i) => i + 1)
      .filter(n => !filled.has(n))
      .map(n => ({
        id: `empty-${n}`, machineId: '', toolNumber: n,
        name: null, l: null, r: null, dl: null, dr: null,
        time2: null, curTime: null, doc: null, locked: false,
        syncedAt: '', isEmpty: true,
      }))
    return [...base, ...emptySlots].sort((a, b) => a.toolNumber - b.toolNumber)
  }, [toolsData, cncMaxTools, showAll])

  const filteredTools = displayTools.filter((t) => {
    // Lege slots verbergen bij actieve zoekopdracht
    if (search && t.isEmpty) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      String(t.toolNumber).includes(q) ||
      (t.name ?? '').toLowerCase().includes(q) ||
      (t.doc ?? '').toLowerCase().includes(q) ||
      (t.machineName ?? '').toLowerCase().includes(q)
    )
  })

  const freeCount = displayTools.filter(t => t.name === null).length

  const stats = toolsData?.stats
  const lastSync = (toolsData as ToolsResponse | undefined)?.lastSync ?? null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Paginakop + tabs */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 tracking-wide">TOOLING</h1>
        <div className="flex gap-1 mt-3 border-b border-gray-200 -mb-px">
          {(['Samenstellingen', 'ToolTabel', 'Gebruik'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Samenstellingen tab */}
      {activeTab === 'Samenstellingen' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <ToolingLibraryTabs />
        </div>
      )}

      {/* ToolTabel tab — scrollbare inhoud */}
      {activeTab === 'ToolTabel' && (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Stats */}
        {stats && (
          <div className="flex gap-3 flex-wrap">
            <StatCard value={stats.total}    label="Total" />
            <StatCard value={stats.atRisk}   label="At Risk"  color="text-orange-500" />
            <StatCard value={stats.critical} label="Critical" color="text-red-500" />
            <StatCard value={stats.expired}  label="Expired"  color="text-red-700" />
            <StatCard value={stats.locked}   label="Locked"   color="text-gray-500" />
            {cncMaxTools && !showAll && (
              <StatCard value={freeCount} label="Vrij" color="text-blue-500" />
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <MachineDropdown
            machines={machines}
            selected={selectedMachine}
            showAll={showAll}
            onSelect={(m) => { setSelectedMachine(m); setShowAll(false); setSearch('') }}
            onSelectAll={() => { setSelectedMachine(null); setShowAll(true); setSearch('') }}
          />

          {/* Sync knop — triggert de Windows agent + vernieuwt data */}
          {(showAll || selectedMachine) && (
            <button
              onClick={handleSync}
              disabled={syncStatus === 'triggering' || syncStatus === 'polling' || toolsFetching}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:border-gray-400 disabled:opacity-60 transition-colors"
            >
              <RefreshCw
                size={14}
                className={cn(
                  'text-gray-500',
                  (syncStatus === 'triggering' || syncStatus === 'polling' || toolsFetching) && 'animate-spin',
                  syncStatus === 'done' && 'text-green-500',
                  syncStatus === 'error' && 'text-red-500',
                )}
              />
              <span className="text-gray-600">
                {syncStatus === 'triggering' ? 'Verbinden...' :
                 syncStatus === 'polling'    ? 'Synchroniseren...' :
                 syncStatus === 'done'       ? 'Klaar' :
                 syncStatus === 'error'      ? 'Fout' :
                 'Sync'}
              </span>
            </button>
          )}
          {syncStatus === 'error' && syncError && (
            <span className="text-xs text-red-500">{syncError}</span>
          )}

          {(showAll || selectedMachine) && (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={showAll ? 'Zoeken op machine, T-nummer, naam, doc...' : 'Zoeken op T-nummer, naam, doc...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-72 bg-white"
                />
              </div>

              {stats && (
                <span className="text-sm text-gray-500 ml-auto">
                  {search
                    ? `${filteredTools.filter(t => !t.isEmpty && t.name).length} van ${stats.total} tools`
                    : `${stats.total} tools`}
                </span>
              )}
            </>
          )}
        </div>

        {/* Laatste sync info */}
        {selectedMachine && !showAll && (
          <div className="flex items-center gap-3 text-sm">
            <SyncBadge log={lastSync} />
          </div>
        )}

        {/* Tabel / lege states */}
        {!showAll && !selectedMachine ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <p className="text-base">Selecteer een CNC-machine om de tooltabel te bekijken</p>
            {machines.length === 0 && (
              <p className="text-sm mt-2">
                Geen CNC-machines gevonden. Voeg een IP-adres of CNC-controller toe aan een machine.
              </p>
            )}
          </div>
        ) : toolsLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Laden...</div>
        ) : filteredTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <p className="text-base">
              {(toolsData?.tools.length ?? 0) === 0
                ? 'Nog geen tooltabel gesynchroniseerd'
                : 'Geen tools gevonden voor deze zoekopdracht'}
            </p>
            {(toolsData?.tools.length ?? 0) === 0 && !showAll && (
              <p className="text-sm mt-2">Upload een TOOL.T bestand om te beginnen</p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-4 px-4 py-3" />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">MACHINE</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">TOOL ▲</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NAME</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">DOC</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">TIME2</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">CUR.TIME</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">LIFE %</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LOCK</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LAST SYNC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTools.map((tool) => {
                    const pct = lifePercent(tool)
                    const isEmpty = tool.isEmpty === true
                    const isVirtual = !isEmpty && cncMaxTools !== null && tool.toolNumber > cncMaxTools
                    return (
                      <tr
                        key={tool.id}
                        className={cn(
                          'transition-colors',
                          isEmpty ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50',
                        )}
                      >
                        <td className="px-4 py-2.5">
                          {isVirtual ? (
                            <span title={`Virtuele tool — buiten magazijnbereik (T${tool.toolNumber} > max ${cncMaxTools})`}>
                              <AlertTriangle size={14} className="text-orange-400" />
                            </span>
                          ) : (
                            <span className={cn(
                              'inline-block w-2 h-2 rounded-full',
                              isEmpty ? 'bg-gray-200' : lifeDotColor(tool),
                            )} />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {showAll ? (tool.machineName ?? '-') : selectedMachine!.name}
                        </td>
                        <td className={cn('px-4 py-2.5 font-mono font-medium', isEmpty ? 'text-gray-400' : 'text-gray-800')}>
                          T{tool.toolNumber}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEmpty
                            ? <span className="text-gray-400 italic text-xs">leeg</span>
                            : <>
                                <span className="text-gray-700 font-medium">{tool.name}</span>
                                {parseToolCode(tool.name) && (
                                  <p className="text-xs text-gray-400 mt-0.5">{parseToolCode(tool.name)}</p>
                                )}
                              </>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{isEmpty ? '—' : (tool.doc ?? '-')}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 font-mono text-xs whitespace-nowrap">
                          {isEmpty ? '—' : (tool.time2 && parseFloat(tool.time2) > 0 ? formatTime(tool.time2) : '—')}
                        </td>
                        <td className={cn(
                          'px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap',
                          !isEmpty && (() => {
                            const t2 = tool.time2 ? parseFloat(tool.time2) : 0
                            const ct = tool.curTime ? parseFloat(tool.curTime) : 0
                            return t2 > 0 && ct >= t2
                          })() ? 'text-red-600 font-semibold' : 'text-gray-600',
                        )}>
                          {isEmpty ? '—' : (tool.curTime && parseFloat(tool.curTime) > 0 ? formatTime(tool.curTime) : '—')}
                        </td>
                        <td className="px-4 py-2.5">{isEmpty ? null : <LifeBar tool={tool} />}</td>
                        <td className="px-4 py-2.5">
                          {!isEmpty && (tool.locked
                            ? <Lock size={14} className="text-gray-500" />
                            : <Unlock size={14} className="text-gray-300" />)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                          {isEmpty ? '—' : formatDate(tool.syncedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Gebruik tab */}
      {activeTab === 'Gebruik' && <GebruikTab />}
    </div>
  )
}
