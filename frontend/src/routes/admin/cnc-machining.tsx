import { useState, useRef, useEffect, useMemo } from 'react'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatTime(val: string | null): string {
  if (!val) return '-'
  const n = parseFloat(val)
  return isNaN(n) ? '-' : n.toFixed(0)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
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

function ComponentBadge({ type, category }: { type: string; category: string | null }) {
  const label = componentLabel(type, category)
  const color =
    type === 'holder'    ? 'bg-blue-100 text-blue-700' :
    type === 'extension' ? 'bg-gray-100 text-gray-600' :
    label === 'Frees'    ? 'bg-green-100 text-green-700' :
    label === 'Boor'     ? 'bg-orange-100 text-orange-700' :
    label === 'Tap'      ? 'bg-purple-100 text-purple-700' :
    'bg-gray-100 text-gray-600'
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', color)}>
      {label}
    </span>
  )
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

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset expanded state als een nieuw item geselecteerd wordt
  useEffect(() => { setExpanded(new Set()) }, [selected?.id])

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
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ComponentBadge type={item.itemType} category={item.itemCategory} />
                    <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
                  </div>
                  {item.comment && (
                    <div className="text-xs text-gray-400 truncate">{item.comment}</div>
                  )}
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
              {detail.item.comment && (
                <p className="text-sm text-gray-500 mt-0.5">{detail.item.comment}</p>
              )}
              <div className="flex gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                {detail.item.manufacturer && <span>{detail.item.manufacturer}</span>}
                {detail.item.orderingCode  && <span className="font-mono">{detail.item.orderingCode}</span>}
              </div>
            </div>

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
                  {detail.components.map((c, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex items-center gap-1 mt-0.5 shrink-0">
                        <span className="text-xs text-gray-300 w-5 text-right">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ComponentBadge type={c.type} category={c.category} />
                          <span className="text-sm font-medium text-gray-800 truncate">{c.name}</span>
                        </div>
                        {c.comment && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{c.comment}</div>
                        )}
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {c.manufacturer && <span>{c.manufacturer}</span>}
                          {c.orderingCode && <span className="font-mono">{c.orderingCode}</span>}
                          {c.reach != null && <span>Bereik: {c.reach.toFixed(1)} mm</span>}
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

// ── Content component (gebruikt in kiosk dashboard) ───────────────────────────

export function CncMachiningContent() {
  const [activeTab, setActiveTab] = useState<'Samenstellingen' | 'ToolTabel'>('ToolTabel')
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
          {(['Samenstellingen', 'ToolTabel'] as const).map((tab) => (
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
          {['Instanties', 'Spaandelen'].map((tab) => (
            <button key={tab} disabled className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-gray-300 cursor-not-allowed">
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
                  {filteredTools.length !== stats.total
                    ? `${filteredTools.length} van ${stats.total} tools`
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">TIME</th>
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
                            : <span className="text-gray-700 font-medium">{tool.name}</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{isEmpty ? '—' : (tool.doc ?? '-')}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                          {!isEmpty && tool.time2 && parseFloat(tool.time2) > 0 ? (
                            <>
                              <span className="text-gray-700">{formatTime(tool.curTime)}</span>
                              <span className="text-gray-400"> / {formatTime(tool.time2)} min</span>
                            </>
                          ) : !isEmpty && tool.curTime && parseFloat(tool.curTime) > 0 ? (
                            <span className="text-gray-700">{formatTime(tool.curTime)} min</span>
                          ) : '—'}
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
    </div>
  )
}
