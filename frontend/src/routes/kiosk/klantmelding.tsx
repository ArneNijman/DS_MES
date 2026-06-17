import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, X, ChevronRight, RefreshCw, UserCheck, Upload, FileText, ExternalLink, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EMPLOYEE_TOKEN_KEY, ADMIN_TOKEN_KEY } from '@/lib/auth'

// ── Types ──────────────────────────────────────────────────────────────────

type CtrStatus = 'open' | 'in_behandeling' | 'gesloten'

interface BeslotenPerson { id: string; name: string }

interface Employee { id: string; name: string; role: string }

interface CustomerComplaint {
  id: string
  ctrId: string
  status: CtrStatus
  datumMelding: string | null
  datumAfgesloten: string | null
  klant: string | null
  oorspronkelijkOrdernummer: string | null
  nieuwOrdernummer: string | null
  contactpersoon: string | null
  artikel: string | null
  emailContactpersoon: string | null
  oorzaakCode: string | null
  foutCode: string | null
  omschrijving: string | null
  oplossing: string | null
  beslotenDoor: BeslotenPerson[]
  createdByName: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
}

// ── Constanten ────────────────────────────────────────────────────────────

const COLUMNS: { key: CtrStatus; label: string; border: string; badge: string; statusColor: string }[] = [
  { key: 'open',           label: 'Open',           border: 'border-l-blue-500',  badge: 'bg-blue-100 text-blue-700',   statusColor: 'text-red-500'   },
  { key: 'in_behandeling', label: 'In behandeling', border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', statusColor: 'text-amber-600' },
  { key: 'gesloten',       label: 'Gesloten',       border: 'border-l-gray-400',  badge: 'bg-gray-100 text-gray-500',   statusColor: 'text-gray-400'  },
]

const STATUS_OPTIONS: { value: CtrStatus; label: string }[] = [
  { value: 'open',           label: 'Open'           },
  { value: 'in_behandeling', label: 'In behandeling' },
  { value: 'gesloten',       label: 'Gesloten'       },
]

const CAUSE_CODES = [
  'Boor fout', 'Conditie fout', 'Foute opspanning', 'Freesfout', 'Lasfout',
  'Montage fout', 'Programma fout', 'Gereedschap fout', 'Tekening fout',
  'Productie documentatie', 'Bestel documentatie',
]

const FAULT_CODES = [
  'Maat/vorm', 'Porositeit', 'Functionaliteit', 'Beschadiging',
  'Oppervlakteruwheid', 'Visueel', 'Documentatie',
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

function getLoggedInUser(): { name: string; id: string } | null {
  try {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!token) return null
    const p = JSON.parse(atob(token.split('.')[1]))
    return { name: p.name ?? p.username ?? '', id: p.employeeId ?? p.userId ?? p.sub ?? '' }
  } catch {
    return null
  }
}

// ── Field helpers ──────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-0.5">{children}</label>
}

function ReadonlyField({ value }: { value: string | null | undefined }) {
  return (
    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 min-h-[38px]">
      {value || ''}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
    />
  )
}

function SelectField({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
    >
      <option value="">{placeholder ?? '— Selecteer —'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── Multi-select medewerker picker ─────────────────────────────────────────

function BeslotenDoorPicker({
  selected,
  employees,
  onChange,
}: {
  selected: BeslotenPerson[]
  employees: Employee[]
  onChange: (people: BeslotenPerson[]) => void
}) {
  const [search, setSearch] = useState('')

  const filtered = employees.filter((e) => {
    if (selected.some((s) => s.id === e.id)) return false
    if (!search) return true
    return e.name.toLowerCase().includes(search.toLowerCase())
  })

  const add = (emp: Employee) => {
    onChange([...selected, { id: emp.id, name: emp.name }])
    setSearch('')
  }

  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id))

  return (
    <div className="space-y-2">
      {/* Geselecteerde chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-700 text-xs rounded-full">
              <UserCheck size={11} />
              {p.name}
              <button onClick={() => remove(p.id)} className="ml-0.5 text-teal-400 hover:text-teal-700">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Zoekbalk + lijst */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek medewerker…"
            className="w-full pl-8 pr-3 py-2 text-sm border-b border-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-400"
          />
        </div>
        <div className="max-h-[180px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              {search ? 'Geen resultaten' : 'Alle medewerkers geselecteerd'}
            </p>
          ) : (
            filtered.map((emp) => (
              <button
                key={emp.id}
                onClick={() => add(emp)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center gap-2 border-b border-gray-50 last:border-0"
              >
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium shrink-0">
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                {emp.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Types (documenten) ────────────────────────────────────────────────────

interface CtrDocument {
  id: string
  ctrId: string
  documentNaam: string | null
  fileUrl: string | null
  datum: string | null
  createdAt: string
}

// ── Tabs ──────────────────────────────────────────────────────────────────

type CtrTab = 'melding' | 'oplossing' | 'bijlages'

// ── Detail Modal ───────────────────────────────────────────────────────────

interface CtrDetailModalProps {
  initial: Partial<CustomerComplaint>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
}

function CtrDetailModal({ initial, onSave, onClose, loading }: CtrDetailModalProps) {
  const qc = useQueryClient()
  const isEdit = !!initial.id
  const currentUser = getLoggedInUser()
  const [tab, setTab] = useState<CtrTab>('melding')
  const docRef = useRef<HTMLInputElement>(null)
  const [isDraggingDoc, setIsDraggingDoc] = useState(false)

  const { data: nextIdData } = useQuery<{ ctrId: string }>({
    queryKey: ['klantmelding-next-id'],
    queryFn: () => apiFetch('/kiosk/klantmelding/next-id'),
    enabled: !isEdit,
    staleTime: 0,
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: () => apiFetch('/kiosk/employees'),
  })

  const { data: documents = [], refetch: refetchDocs } = useQuery<CtrDocument[]>({
    queryKey: ['ctr-documents', initial.id],
    queryFn: () => apiFetch(`/kiosk/klantmelding/${initial.id}/documents`),
    enabled: !!initial.id,
  })

  const { data: statusLog = [] } = useQuery<StatusLogEntry[]>({
    queryKey: ['ctr-status-log', initial.id],
    queryFn: () => apiFetch(`/kiosk/klantmelding/${initial.id}/status-log`),
    enabled: !!initial.id,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })

  const handleDocUploadFiles = async (files: File[]) => {
    if (!files.length || !initial.id) return
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(`/api/kiosk/klantmelding/${initial.id}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
    }
    refetchDocs()
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleDocUploadFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  useEffect(() => {
    if (tab !== 'bijlages' || !isEdit) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter(Boolean) as File[]
      if (files.length) { e.preventDefault(); handleDocUploadFiles(files) }
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [tab, isEdit, initial.id])

  const deleteDoc = useMutation({
    mutationFn: (docId: string) =>
      apiFetch(`/kiosk/klantmelding/${initial.id}/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => { refetchDocs(); qc.invalidateQueries({ queryKey: ['ctr-documents', initial.id] }) },
  })

  const [form, setForm] = useState({
    status:                    (initial.status                    ?? 'open') as CtrStatus,
    datumMelding:              initial.datumMelding               ?? '',
    datumAfgesloten:           initial.datumAfgesloten            ?? '',
    klant:                     initial.klant                      ?? '',
    oorspronkelijkOrdernummer: initial.oorspronkelijkOrdernummer  ?? '',
    nieuwOrdernummer:          initial.nieuwOrdernummer           ?? '',
    contactpersoon:            initial.contactpersoon             ?? '',
    artikel:                   initial.artikel                    ?? '',
    emailContactpersoon:       initial.emailContactpersoon        ?? '',
    oorzaakCode:               initial.oorzaakCode                ?? '',
    foutCode:                  initial.foutCode                   ?? '',
    omschrijving:              initial.omschrijving               ?? '',
    oplossing:                 initial.oplossing                  ?? '',
    beslotenDoor:              (initial.beslotenDoor              ?? []) as BeslotenPerson[],
    createdByName:             initial.createdByName              ?? currentUser?.name ?? '',
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    onSave({
      status:                    form.status,
      datumMelding:              form.datumMelding              || null,
      datumAfgesloten:           form.datumAfgesloten           || null,
      klant:                     form.klant                     || null,
      oorspronkelijkOrdernummer: form.oorspronkelijkOrdernummer || null,
      nieuwOrdernummer:          form.nieuwOrdernummer          || null,
      contactpersoon:            form.contactpersoon            || null,
      artikel:                   form.artikel                   || null,
      emailContactpersoon:       form.emailContactpersoon       || null,
      oorzaakCode:               form.oorzaakCode               || null,
      foutCode:                  form.foutCode                  || null,
      omschrijving:              form.omschrijving              || null,
      oplossing:                 form.oplossing                 || null,
      beslotenDoor:              form.beslotenDoor,
      createdByName:             form.createdByName             || null,
      createdById:               currentUser?.id                || null,
    })
  }

  const TABS: { key: CtrTab; label: string }[] = [
    { key: 'melding',   label: 'Melding'   },
    { key: 'oplossing', label: 'Oplossing' },
    { key: 'bijlages',  label: 'Bijlages'  },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-h-[96vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <FieldLabel>ID:</FieldLabel>
              <div className="px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-sm font-mono text-gray-600 min-w-[110px]">
                {isEdit ? initial.ctrId : (nextIdData?.ctrId ?? '…')}
              </div>
            </div>
            <div>
              <FieldLabel>Aangemaakt door:</FieldLabel>
              <ReadonlyField value={form.createdByName} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <FieldLabel>Status:</FieldLabel>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white min-w-[140px]"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === t.key
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab inhoud */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Tab: Melding ── */}
          {tab === 'melding' && (
            <div className="p-6 space-y-5">

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <FieldLabel>Datum melding:</FieldLabel>
                  <input type="date" value={form.datumMelding} onChange={(e) => set('datumMelding', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <FieldLabel>Datum afgesloten:</FieldLabel>
                  <input type="date" value={form.datumAfgesloten} onChange={(e) => set('datumAfgesloten', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <FieldLabel>Klant:</FieldLabel>
                  <TextInput value={form.klant} onChange={(v) => set('klant', v)} placeholder="bijv. Dutch-shape" />
                </div>
                <div>
                  <FieldLabel>Oorspronkelijk ordernummer:</FieldLabel>
                  <TextInput value={form.oorspronkelijkOrdernummer} onChange={(v) => set('oorspronkelijkOrdernummer', v)} placeholder="bijv. PRJ.24069-13" />
                </div>
                <div>
                  <FieldLabel>Nieuw ordernummer:</FieldLabel>
                  <TextInput value={form.nieuwOrdernummer} onChange={(v) => set('nieuwOrdernummer', v)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Contactpersoon:</FieldLabel>
                  <TextInput value={form.contactpersoon} onChange={(v) => set('contactpersoon', v)} placeholder="bijv. Arne Nijman" />
                </div>
                <div>
                  <FieldLabel>Artikel:</FieldLabel>
                  <TextInput value={form.artikel} onChange={(v) => set('artikel', v)} placeholder="bijv. 24069-1300-00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Email contactpersoon:</FieldLabel>
                  <TextInput value={form.emailContactpersoon} onChange={(v) => set('emailContactpersoon', v)} placeholder="bijv. arne.nijman@dutch-shape.nl" type="email" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Oorzaak code:</FieldLabel>
                  <SelectField value={form.oorzaakCode} onChange={(v) => set('oorzaakCode', v)} options={CAUSE_CODES} placeholder="— Selecteer —" />
                </div>
                <div>
                  <FieldLabel>Fout code:</FieldLabel>
                  <SelectField value={form.foutCode} onChange={(v) => set('foutCode', v)} options={FAULT_CODES} placeholder="— Selecteer —" />
                </div>
              </div>

              <div>
                <FieldLabel>Omschrijving:</FieldLabel>
                <textarea
                  value={form.omschrijving}
                  onChange={(e) => set('omschrijving', e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Tab: Oplossing ── */}
          {tab === 'oplossing' && (
            <div className="p-6">
              <div className="grid grid-cols-3 gap-x-6 gap-y-6">

                {/* Linker 2/3: velden */}
                <div className="col-span-2 space-y-6">
                  <div>
                    <FieldLabel>Oplossing:</FieldLabel>
                    <textarea
                      value={form.oplossing}
                      onChange={(e) => set('oplossing', e.target.value)}
                      rows={8}
                      placeholder="Beschrijf de genomen oplossing of maatregel…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y"
                    />
                  </div>

                  <div>
                    <FieldLabel>Besloten door:</FieldLabel>
                    <p className="text-xs text-gray-400 mb-2">Selecteer één of meerdere medewerkers die betrokken waren bij het besluit.</p>
                    <BeslotenDoorPicker
                      selected={form.beslotenDoor}
                      employees={employees}
                      onChange={(people) => set('beslotenDoor', people)}
                    />
                  </div>
                </div>

                {/* Rechter 1/3: status log */}
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
          )}

          {/* ── Tab: Bijlages ── */}
          {tab === 'bijlages' && (
            <div
              className="p-6"
              onDragOver={(e) => { e.preventDefault(); if (isEdit) setIsDraggingDoc(true) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingDoc(false) }}
              onDrop={(e) => { e.preventDefault(); setIsDraggingDoc(false); if (isEdit) handleDocUploadFiles(Array.from(e.dataTransfer.files)) }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">Bijgevoegde bestanden bij deze klantmelding.</p>
                {isEdit && (
                  <button
                    onClick={() => docRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-teal-400 text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    <Upload size={12} /> Bestand toevoegen
                  </button>
                )}
                <input ref={docRef} type="file" multiple className="hidden" onChange={handleDocUpload} />
              </div>

              {!isEdit ? (
                <p className="text-sm text-gray-400">Sla de klantmelding eerst op om bijlages toe te voegen.</p>
              ) : documents.length === 0 ? (
                <div className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center h-28 gap-1.5 transition-colors ${isDraggingDoc ? 'border-teal-400 bg-teal-50' : 'border-gray-200'}`}>
                  <p className="text-sm text-gray-400">Sleep bestanden hierheen</p>
                  <p className="text-xs text-gray-300">of Ctrl+V om te plakken</p>
                </div>
              ) : (
                <div className={`border rounded-xl overflow-hidden transition-colors ${isDraggingDoc ? 'border-teal-400 ring-2 ring-teal-400 ring-offset-1' : 'border-gray-100'}`}>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Bestandsnaam</th>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Datum</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 text-gray-700">
                              <FileText size={13} className="text-gray-400 shrink-0" />
                              {doc.documentNaam ?? 'Bestand'}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{doc.datum ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {doc.fileUrl && (
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              <button
                                onClick={() => deleteDoc.mutate(doc.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
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
      </div>
    </div>
  )
}

// ── Kaart ─────────────────────────────────────────────────────────────────

function CtrCard({ complaint, onClick }: { complaint: CustomerComplaint; onClick: () => void }) {
  const meta = colMeta(complaint.status)
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === complaint.status)?.label ?? complaint.status

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-gray-100 border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer',
        meta.border,
      )}
    >
      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-3 gap-1">
          <span className="text-xs text-blue-400 font-medium">Status:</span>
          <span className="text-xs text-blue-400 font-medium">Melding</span>
          <span className="text-xs text-blue-400 font-medium">Klant:</span>
        </div>
        <div className="grid grid-cols-3 gap-1 items-center">
          <span className={cn('text-xs font-semibold', meta.statusColor)}>{statusLabel}</span>
          <span className="text-xs font-bold text-gray-700 font-mono">{complaint.ctrId}</span>
          <span className="text-xs text-gray-600 truncate">{complaint.klant ?? '—'}</span>
        </div>

        <div className="border-t border-gray-100" />

        <div className="grid grid-cols-2 gap-1">
          <span className="text-xs text-blue-400 font-medium">Contactpersoon:</span>
          <span className="text-xs text-blue-400 font-medium">Datum melding</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="grid grid-cols-2 gap-1 flex-1 min-w-0">
            <span className="text-xs text-gray-700 truncate">{complaint.contactpersoon ?? '—'}</span>
            <span className="text-xs text-gray-600">{complaint.datumMelding ? formatDate(complaint.datumMelding) : '—'}</span>
          </div>
          <div className="w-8 h-8 flex items-center justify-center border border-blue-300 rounded-lg text-blue-400 hover:bg-blue-50 transition-colors shrink-0">
            <ChevronRight size={14} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Klantmelding Content ──────────────────────────────────────────────────

export function KlantmeldingContent() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Partial<CustomerComplaint> | null>(null)

  const { data: complaints = [], refetch, isFetching } = useQuery<CustomerComplaint[]>({
    queryKey: ['klantmelding'],
    queryFn: () => apiFetch('/kiosk/klantmelding'),
  })

  const createComplaint = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/kiosk/klantmelding', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['klantmelding'] }); setModal(null) },
  })

  const updateComplaint = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/kiosk/klantmelding/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ['klantmelding'] })
      qc.invalidateQueries({ queryKey: ['ctr-status-log', id] })
      setModal(null)
    },
  })

  const searchFilter = (c: CustomerComplaint) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.ctrId.toLowerCase().includes(q) ||
      (c.klant ?? '').toLowerCase().includes(q) ||
      (c.contactpersoon ?? '').toLowerCase().includes(q) ||
      (c.artikel ?? '').toLowerCase().includes(q) ||
      (c.oorspronkelijkOrdernummer ?? '').toLowerCase().includes(q)
    )
  }

  const filtered = complaints.filter(searchFilter)
  const isMutating = createComplaint.isPending || updateComplaint.isPending

  const handleSave = (data: Record<string, unknown>) => {
    if (modal?.id) {
      updateComplaint.mutate({ id: modal.id, data })
    } else {
      createComplaint.mutate(data)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op ID, klant, contact, artikel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} /> Nieuwe melding
        </button>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((c) => c.status === col.key)
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
                    cards.map((c) => (
                      <CtrCard key={c.id} complaint={c} onClick={() => setModal(c)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {modal !== null && (
        <CtrDetailModal
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
          loading={isMutating}
        />
      )}
    </div>
  )
}
