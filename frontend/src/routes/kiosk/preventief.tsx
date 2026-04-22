import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, X, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EMPLOYEE_TOKEN_KEY, ADMIN_TOKEN_KEY } from '@/lib/auth'
import EmployeePickerModal from '@/components/kiosk/EmployeePickerModal'

// ── Types ──────────────────────────────────────────────────────────────────

type PrevStatus = 'open' | 'in_behandeling' | 'gesloten'

interface PreventiveAction {
  id: string
  prevId: string
  ncrId: string | null
  status: PrevStatus
  assignedToId: string | null
  assignedToName: string | null
  datum: string | null
  completedAt: string | null
  description: string | null
  resultaat: string | null
  productionOrder: string | null
  itemRef: string | null
  itemName: string | null
  createdByName: string | null
  stilstandRegistreren: boolean
  createdById: string | null
  createdAt: string
  updatedAt: string
}

interface Employee {
  id: string
  name: string
  photoUrl: string | null
}

// ── Constanten ────────────────────────────────────────────────────────────

const COLUMNS: { key: PrevStatus; label: string; border: string; badge: string; statusColor: string }[] = [
  { key: 'open',           label: 'Open',           border: 'border-l-blue-500',  badge: 'bg-blue-100 text-blue-700',   statusColor: 'text-red-500'   },
  { key: 'in_behandeling', label: 'In behandeling', border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', statusColor: 'text-amber-600' },
  { key: 'gesloten',       label: 'Gesloten',       border: 'border-l-gray-400',  badge: 'bg-gray-100 text-gray-500',   statusColor: 'text-gray-400'  },
]

const STATUS_OPTIONS: { value: PrevStatus; label: string }[] = [
  { value: 'open',           label: 'Open'           },
  { value: 'in_behandeling', label: 'In behandeling' },
  { value: 'gesloten',       label: 'Gesloten'       },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(val: string | null | undefined) {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface StatusLogEntry {
  id: string
  fromStatus: string | null
  toStatus: string
  changedByName: string | null
  createdAt: string
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function formatLogDate(iso: string): { date: string; week: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }),
    week: `Week ${getISOWeek(d)}, ${d.getFullYear()}`,
  }
}

function colMeta(key: string) {
  return COLUMNS.find((c) => c.key === key) ?? COLUMNS[0]
}

function getLoggedInUser(): { name: string; id: string; role: string } | null {
  try {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!token) return null
    const p = JSON.parse(atob(token.split('.')[1]))
    return { name: p.name ?? p.username ?? '', id: p.employeeId ?? p.userId ?? p.sub ?? '', role: p.role ?? 'employee' }
  } catch {
    return null
  }
}

// ── Field helpers ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-0.5">{children}</label>
}

function ReadonlyField({ value, placeholder }: { value: string | null | undefined; placeholder?: string }) {
  return (
    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 min-h-[38px]">
      {value || <span className="text-gray-300">{placeholder ?? ''}</span>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
    />
  )
}

// ── Detail Modal ───────────────────────────────────────────────────────────

interface PrevDetailModalProps {
  initial: Partial<PreventiveAction>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  onGoToNcr?: (ncrDisplayId: string) => void
  loading: boolean
}

function PrevDetailModal({ initial, onSave, onClose, onGoToNcr, loading }: PrevDetailModalProps) {
  const isEdit = !!initial.id
  const isLinkedToNcr = !!initial.ncrId
  const currentUser = getLoggedInUser()
  const [showPicker, setShowPicker] = useState(false)

  const { data: nextIdData } = useQuery<{ prevId: string }>({
    queryKey: ['preventief-next-id'],
    queryFn: () => apiFetch('/kiosk/preventief/next-id'),
    enabled: !isEdit,
    staleTime: 0,
  })

  const { data: employeeList = [] } = useQuery<Employee[]>({
    queryKey: ['kiosk-employees'],
    queryFn: () => apiFetch('/kiosk/employees', { skipAuth: true } as never),
    staleTime: 5 * 60 * 1000,
  })

  const { data: statusLog = [] } = useQuery<StatusLogEntry[]>({
    queryKey: ['preventief-status-log', initial.id],
    queryFn: () => apiFetch(`/kiosk/preventief/${initial.id}/status-log`),
    enabled: !!initial.id,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })

  const [form, setForm] = useState({
    ncrId:                initial.ncrId             ?? '',
    status:               (initial.status           ?? 'open') as PrevStatus,
    assignedToId:         initial.assignedToId       ?? '',
    assignedToName:       initial.assignedToName     ?? '',
    datum:                initial.datum              ?? '',
    completedAt:          initial.completedAt        ?? '',
    description:          initial.description        ?? '',
    resultaat:            initial.resultaat          ?? '',
    productionOrder:      initial.productionOrder    ?? '',
    itemRef:              initial.itemRef            ?? '',
    itemName:             initial.itemName           ?? '',
    createdByName:        initial.createdByName      ?? currentUser?.name ?? '',
    stilstandRegistreren: initial.stilstandRegistreren ?? false,
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    onSave({
      ncrId:                form.ncrId              || null,
      status:               form.status,
      assignedToId:         form.assignedToId        || null,
      assignedToName:       form.assignedToName      || null,
      datum:                form.datum               || null,
      completedAt:          form.completedAt         || null,
      description:          form.description         || null,
      resultaat:            form.resultaat           || null,
      productionOrder:      form.productionOrder     || null,
      itemRef:              form.itemRef             || null,
      itemName:             form.itemName            || null,
      createdByName:        form.createdByName       || null,
      stilstandRegistreren: form.stilstandRegistreren,
      createdById:          currentUser?.id          || null,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
        <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-h-[96vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            {/* Links: ID */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-sm font-mono text-gray-600 min-w-[90px]">
                {isEdit ? initial.prevId : (nextIdData?.prevId ?? '…')}
              </div>
            </div>

            {/* Midden: Ga naar NCR */}
            <div className="flex-1 flex justify-center">
              {isLinkedToNcr && (
                <button
                  type="button"
                  onClick={() => onGoToNcr?.(initial.ncrId!)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <ExternalLink size={13} />
                  Ga naar NCR
                </button>
              )}
            </div>

            {/* Rechts: Status + opslaan + sluiten */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Formulier inhoud */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* Rij 1: Afwijking ID | Productie order | Artikel | Omschrijving */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <FieldLabel>Afwijking_ID</FieldLabel>
                {isLinkedToNcr ? (
                  <ReadonlyField value={form.ncrId} />
                ) : (
                  <TextInput value={form.ncrId} onChange={(v) => set('ncrId', v)} placeholder="bijv. NCR_100229" />
                )}
              </div>
              <div>
                <FieldLabel>Productie order:</FieldLabel>
                {isLinkedToNcr ? (
                  <ReadonlyField value={form.productionOrder} />
                ) : (
                  <TextInput value={form.productionOrder} onChange={(v) => set('productionOrder', v)} placeholder="bijv. PROD.2601985" />
                )}
              </div>
              <div>
                <FieldLabel>Artikel:</FieldLabel>
                {isLinkedToNcr ? (
                  <ReadonlyField value={form.itemRef} />
                ) : (
                  <TextInput value={form.itemRef} onChange={(v) => set('itemRef', v)} placeholder="bijv. 25118-1100-00" />
                )}
              </div>
              <div>
                <FieldLabel>Omschrijving:</FieldLabel>
                {isLinkedToNcr ? (
                  <ReadonlyField value={form.itemName} />
                ) : (
                  <TextInput value={form.itemName} onChange={(v) => set('itemName', v)} placeholder="bijv. Lip Skin" />
                )}
              </div>
            </div>

            {/* Rij 2: Uitvoerder | Aangemaakt door */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Uitvoerder:</FieldLabel>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm text-left transition-colors',
                    form.assignedToName
                      ? 'border-gray-200 text-gray-700 hover:border-teal-300'
                      : 'border-dashed border-gray-300 text-gray-400 hover:border-teal-400',
                  )}
                >
                  {form.assignedToName || '— Selecteer uitvoerder —'}
                </button>
              </div>
              <div>
                <FieldLabel>Aangemaakt door</FieldLabel>
                <ReadonlyField value={form.createdByName} />
              </div>
            </div>

            {/* Rij 3: Datum ingevoerd | Datum afgerond */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Datum ingevoerd:</FieldLabel>
                <input
                  type="date"
                  value={form.datum}
                  onChange={(e) => set('datum', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <FieldLabel>Datum afgerond:</FieldLabel>
                <input
                  type="date"
                  value={form.completedAt}
                  onChange={(e) => set('completedAt', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>

            {/* Stilstand registreren */}
            <div>
              <FieldLabel>Stilstand registreren:</FieldLabel>
              <label className="flex items-center gap-2 mt-1 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={form.stilstandRegistreren}
                  onChange={(e) => set('stilstandRegistreren', e.target.checked)}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="text-sm text-gray-700">Ja</span>
              </label>
            </div>

            {/* Omschrijving + Resultaat | Status log */}
            <div className="grid grid-cols-3 gap-x-6">
              <div className="col-span-2 space-y-5">
                {/* Omschrijving */}
                <div>
                  <FieldLabel>Omschrijving:</FieldLabel>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                </div>

                {/* Resultaat uitvoering */}
                <div>
                  <FieldLabel>Resultaat uitvoering:</FieldLabel>
                  <textarea
                    value={form.resultaat}
                    onChange={(e) => set('resultaat', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                </div>
              </div>

              {/* Status log rechterkolom */}
              <div>
                {isEdit && statusLog.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Status log</p>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 max-h-64 overflow-y-auto space-y-3">
                      {statusLog.map((entry) => {
                        const { date, week } = formatLogDate(entry.createdAt)
                        return (
                          <div key={entry.id} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                {entry.fromStatus && (
                                  <>
                                    <span className="text-xs px-1 py-0.5 rounded bg-white border border-gray-200 text-gray-500">{entry.fromStatus}</span>
                                    <span className="text-gray-300 text-xs">→</span>
                                  </>
                                )}
                                <span className="text-xs px-1 py-0.5 rounded bg-teal-100 text-teal-700 font-medium">{entry.toStatus}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{entry.changedByName ?? 'Onbekend'}</p>
                              <p className="text-xs text-gray-400">{date} · {week}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Employee picker overlay */}
      {showPicker && (
        <EmployeePickerModal
          employees={employeeList}
          selected={form.assignedToId}
          title="Selecteer uitvoerder"
          onSelect={(emp) => { set('assignedToId', emp.id); set('assignedToName', emp.name) }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  )
}

// ── Kaart ─────────────────────────────────────────────────────────────────

function PrevCard({ action, onClick }: { action: PreventiveAction; onClick: () => void }) {
  const meta = colMeta(action.status)
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === action.status)?.label ?? action.status

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-gray-100 border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer',
        meta.border,
      )}
    >
      <div className="p-3 space-y-2.5">
        {/* Labels rij 1 */}
        <div className="grid grid-cols-3 gap-1">
          <span className="text-xs text-blue-400 font-medium">Status:</span>
          <span className="text-xs text-blue-400 font-medium">Prev</span>
          <span className="text-xs text-blue-400 font-medium">Afwijking ID:</span>
        </div>
        {/* Waarden rij 1 */}
        <div className="grid grid-cols-3 gap-1 items-center">
          <span className={cn('text-xs font-semibold', meta.statusColor)}>{statusLabel}</span>
          <span className="text-xs font-bold text-gray-700 font-mono">{action.prevId}</span>
          <span className="text-xs text-gray-600 font-mono truncate">{action.ncrId ?? '—'}</span>
        </div>

        <div className="border-t border-gray-100" />

        {/* Labels rij 2 */}
        <div className="grid grid-cols-2 gap-1">
          <span className="text-xs text-blue-400 font-medium">Uitgevoerd door:</span>
          <span className="text-xs text-blue-400 font-medium">Datum</span>
        </div>
        {/* Waarden rij 2 + pijl */}
        <div className="flex items-center gap-1">
          <div className="grid grid-cols-2 gap-1 flex-1 min-w-0">
            <span className="text-xs text-gray-700 truncate">{action.assignedToName ?? '—'}</span>
            <span className="text-xs text-gray-600">{action.datum ? formatDate(action.datum) : '—'}</span>
          </div>
          <div className="w-8 h-8 flex items-center justify-center border border-blue-300 rounded-lg text-blue-400 hover:bg-blue-50 transition-colors shrink-0">
            <ChevronRight size={14} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Preventief Content ────────────────────────────────────────────────────

interface PreventiefContentProps {
  initialAction?: Partial<PreventiveAction> | null
  onPendingConsumed?: () => void
  onGoToNcr?: (ncrDisplayId: string) => void
}

export function PreventiefContent({ initialAction, onPendingConsumed, onGoToNcr }: PreventiefContentProps = {}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Partial<PreventiveAction> | null>(null)

  // Open modal direct bij navigatie vanuit NCR (zelfde patroon als NCRContent)
  useEffect(() => {
    if (initialAction) {
      setModal(initialAction)
      onPendingConsumed?.()
    }
  }, [initialAction, onPendingConsumed])

  const { data: actions = [], refetch, isFetching } = useQuery<PreventiveAction[]>({
    queryKey: ['preventief'],
    queryFn: () => apiFetch('/kiosk/preventief'),
  })

  const createAction = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/kiosk/preventief', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['preventief'] }); setModal(null) },
  })

  const updateAction = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/kiosk/preventief/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ['preventief'] })
      qc.invalidateQueries({ queryKey: ['preventief-status-log', id] })
      setModal(null)
    },
  })

  const searchFilter = (a: PreventiveAction) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.prevId.toLowerCase().includes(q) ||
      (a.ncrId ?? '').toLowerCase().includes(q) ||
      (a.assignedToName ?? '').toLowerCase().includes(q) ||
      (a.productionOrder ?? '').toLowerCase().includes(q)
    )
  }

  const filtered = actions.filter(searchFilter)

  const handleSave = (data: Record<string, unknown>) => {
    if (modal?.id) {
      updateAction.mutate({ id: modal.id, data })
    } else {
      createAction.mutate(data)
    }
  }

  const isMutating = createAction.isPending || updateAction.isPending

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Topbalk */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op ID, NCR, naam, order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors disabled:opacity-40"
          title="Verversen"
        >
          <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} /> Nieuwe actie
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((a) => a.status === col.key)
            return (
              <div key={col.key} className="flex flex-col w-72 shrink-0 min-h-0">
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}:</h3>
                  <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full', col.badge)}>
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pb-2">
                  {cards.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl h-16 flex items-center justify-center">
                      <span className="text-xs text-gray-300">Leeg</span>
                    </div>
                  ) : (
                    cards.map((action) => (
                      <PrevCard key={action.id} action={action} onClick={() => setModal(action)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail modal */}
      {modal !== null && (
        <PrevDetailModal
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
          onGoToNcr={onGoToNcr}
          loading={isMutating}
        />
      )}
    </div>
  )
}
