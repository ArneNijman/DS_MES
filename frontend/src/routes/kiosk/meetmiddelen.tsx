import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, X, RefreshCw, Upload, Link2, Link2Off,
  FileText, Trash2, ExternalLink, ChevronDown, ChevronUp, Gauge, Pencil, User,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EMPLOYEE_TOKEN_KEY, ADMIN_TOKEN_KEY } from '@/lib/auth'
import EmployeePickerModal from '@/components/kiosk/EmployeePickerModal'
import MachinePicker from '@/components/kiosk/MachinePicker'

// ── Types ──────────────────────────────────────────────────────────────────

interface MeasuringTool {
  id: string
  toolId: string
  voorraadId: string | null
  artikelnaam: string | null
  merk: string | null
  afmeting: string | null
  kalibratiePlicht: boolean | null
  interval: string | null
  locatie: string | null
  emailTeamleider: string | null
  teamleiderId: string | null
  gebruiktDoor: string | null
  machineId: string | null
  machineName: string | null
  photoUrl: string | null
  actief: boolean | null
  afgekeurd: boolean | null
  afgekeurdReden: string | null
  serieSuffix: string | null
  interneKalibratie: boolean | null
  externeKalibratie: boolean | null
  eindmaatKalibratie: boolean | null
  ringKalibratie: boolean | null
  diepteKalibratie: boolean | null
  instructie: string | null
  calibrations: CalibrationRecord[]
  internalSessions: InternalSession[]
  createdAt: string
  updatedAt: string
}

interface CalibrationRecord {
  id: string
  toolId: string
  gekalibreerdDoor: string | null
  gekalibreerdDoorId: string | null
  datum: string | null
  type: string | null
  certificaatUrl: string | null
  certificaatNaam: string | null
  gecontroleerDoor: string | null
  gecontroleerDoorId: string | null
  datumWeggestuurd: string | null
  datumTerug: string | null
  createdAt: string
}

interface InternalSession {
  id: string
  toolId: string
  voltooiingsdatum: string | null
  uitgevoerdDoor: string | null
  uitgevoerdDoorId: string | null
  gecontroleerDoor: string | null
  gecontroleerDoorId: string | null
  createdAt: string
  rows: MeasurementRow[]
}

interface MeasurementRow {
  id: string
  sessionId: string
  calType: string
  nomWaarde: string | null
  gemetenWaarde: string | null
  tolerantie: string | null
  datum: string | null
  dinNorm: string | null
  createdAt: string
}

interface ToolDocument {
  id: string
  toolId: string
  documentNaam: string | null
  fileUrl: string | null
  datum: string | null
  createdAt: string
}

interface MachineOption {
  id: string
  machineId: string | null
  name: string
  category: string
  photoUrl?: string | null
}

interface Employee {
  id: string
  name: string
  photoUrl?: string | null
  isClockedIn?: boolean
  hasPin?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getLoggedInUser() {
  try {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    if (!token) return null
    const p = JSON.parse(atob(token.split('.')[1]))
    return { name: p.name ?? p.username ?? '', role: p.role ?? '' }
  } catch { return null }
}

function isPrivileged() {
  const user = getLoggedInUser()
  return user ? ['admin', 'quality'].includes(user.role) : false
}

type KalStatus = 'verlopen' | 'binnenkort' | 'ok' | 'geen'

function lastKalDatum(tool: MeasuringTool): string | null {
  const extDate = (tool.calibrations ?? []).map(c => c.datum).filter(Boolean).sort().reverse()[0] ?? null
  const intDate = (tool.internalSessions ?? []).map(s => s.voltooiingsdatum).filter(Boolean).sort().reverse()[0] ?? null
  if (!extDate && !intDate) return null
  if (!extDate) return intDate
  if (!intDate) return extDate
  return extDate > intDate ? extDate : intDate
}

function kalibratieStatus(tool: MeasuringTool): KalStatus {
  if (!tool.kalibratiePlicht || !tool.interval || tool.interval === 'geen') return 'geen'
  const lastDatum = lastKalDatum(tool)
  if (!lastDatum) return 'verlopen'
  const months: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
  const m = months[tool.interval] ?? 12
  const next = new Date(lastDatum)
  next.setMonth(next.getMonth() + m)
  const daysLeft = Math.floor((next.getTime() - Date.now()) / 86400000)
  if (daysLeft < 0) return 'verlopen'
  if (daysLeft <= 90) return 'binnenkort'
  return 'ok'
}

function nextKalDatum(tool: MeasuringTool): string | null {
  if (!tool.kalibratiePlicht || !tool.interval || tool.interval === 'geen') return null
  const lastDatum = lastKalDatum(tool)
  if (!lastDatum) return null
  const months: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 }
  const m = months[tool.interval] ?? 12
  const next = new Date(lastDatum)
  next.setMonth(next.getMonth() + m)
  return next.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function StatusBadge({ status }: { status: KalStatus }) {
  if (status === 'verlopen') return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Verlopen</span>
  )
  if (status === 'binnenkort') return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Binnenkort</span>
  )
  if (status === 'ok') return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">OK</span>
  )
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Geen kal.</span>
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function TextInput({ value, onChange, placeholder, type = 'text', disabled, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean; maxLength?: number
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      className={cn(
        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400',
        disabled && 'bg-gray-50 text-gray-500',
      )}
    />
  )
}

// ── useMeetmiddelenCounts (exported for dashboard badges) ─────────────────

export function useMeetmiddelenCounts() {
  const { data: tools = [] } = useQuery<MeasuringTool[]>({
    queryKey: ['meetmiddelen'],
    queryFn: () => apiFetch('/kiosk/meetmiddelen'),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    select: (data) => data.map(t => ({ ...t, internalSessions: t.internalSessions ?? [] })),
  })
  const verlopen   = tools.filter((t) => t.actief !== false && kalibratieStatus(t) === 'verlopen').length
  const binnenkort = tools.filter((t) => t.actief !== false && kalibratieStatus(t) === 'binnenkort').length
  return { verlopen, binnenkort }
}

// ── Tab: Meetmiddel informatie ─────────────────────────────────────────────

type MmForm = {
  voorraadId: string
  artikelnaam: string
  merk: string
  afmeting: string
  kalibratiePlicht: boolean
  interval: string
  locatie: string
  emailTeamleider: string
  teamleiderId: string | null
  gebruiktDoor: string
  machineId: string | null
  machineName: string | null
  actief: boolean
  afgekeurd: boolean
  afgekeurdReden: string
  serieSuffix: string
  interneKalibratie: boolean
  externeKalibratie: boolean
  eindmaatKalibratie: boolean
  ringKalibratie: boolean
  diepteKalibratie: boolean
  instructie: string
}

function initForm(t?: Partial<MeasuringTool>): MmForm {
  return {
    voorraadId:         t?.voorraadId         ?? '',
    artikelnaam:        t?.artikelnaam        ?? '',
    merk:               t?.merk               ?? '',
    afmeting:           t?.afmeting           ?? '',
    kalibratiePlicht:   t?.kalibratiePlicht   ?? false,
    interval:           t?.interval           ?? '',
    locatie:            t?.locatie            ?? '',
    emailTeamleider:    t?.emailTeamleider    ?? '',
    teamleiderId:       t?.teamleiderId       ?? null,
    gebruiktDoor:       t?.gebruiktDoor       ?? '',
    machineId:          t?.machineId          ?? null,
    machineName:        t?.machineName        ?? null,
    actief:             t?.actief             ?? true,
    afgekeurd:          t?.afgekeurd          ?? false,
    afgekeurdReden:     t?.afgekeurdReden     ?? '',
    serieSuffix:        t?.serieSuffix        ?? '',
    interneKalibratie:  t?.interneKalibratie  ?? false,
    externeKalibratie:  t?.externeKalibratie  ?? false,
    eindmaatKalibratie: t?.eindmaatKalibratie ?? false,
    ringKalibratie:     t?.ringKalibratie     ?? false,
    diepteKalibratie:   t?.diepteKalibratie   ?? false,
    instructie:         t?.instructie         ?? '',
  }
}

// ── Detail modal ───────────────────────────────────────────────────────────

type MmTab = 'info' | 'kalibratie' | 'instructie' | 'documenten'

interface DetailModalProps {
  tool: MeasuringTool | null          // null = nieuw
  nextId: string
  onSave: (id: string | null, data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
  onRefresh: () => void
}

// Fixed DIN norms per calibration type
const CAL_DIN_NORM: Record<string, string> = {
  eindmaat: 'DIN 862',
  diepte:   'DIN 862',
  ring:     'DIN 863',
}

type SessForm = { voltooiingsdatum: string; uitgevoerdDoor: string; uitgevoerdDoorId: string; gecontroleerDoor: string; gecontroleerDoorId: string }
type RowDraft = { _key: string; nomWaarde: string; gemetenWaarde: string; tolerantie: string; datum: string }
type ExternForm = { gekalibreerdDoor: string; datum: string; gecontroleerDoor: string; gecontroleerDoorId: string; datumWeggestuurd: string; datumTerug: string }

const emptySessForm = (): SessForm => ({ voltooiingsdatum: '', uitgevoerdDoor: '', uitgevoerdDoorId: '', gecontroleerDoor: '', gecontroleerDoorId: '' })
const emptyExternForm = (): ExternForm => ({ gekalibreerdDoor: '', datum: '', gecontroleerDoor: '', gecontroleerDoorId: '', datumWeggestuurd: '', datumTerug: '' })

function DetailModal({ tool, nextId, onSave, onClose, loading, onRefresh }: DetailModalProps) {
  const qc = useQueryClient()
  const isEdit = !!tool?.id
  const canEdit = isPrivileged()
  const [tab, setTab] = useState<MmTab>('info')
  const [form, setForm] = useState<MmForm>(() => initForm(tool ?? undefined))
  const [showMachinePicker, setShowMachinePicker] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  // Employee picker: generalized callback approach
  const [empPickerCb, setEmpPickerCb] = useState<((name: string, id: string) => void) | null>(null)
  const openEmpPicker = (cb: (name: string, id: string) => void) => setEmpPickerCb(() => cb)

  const set = (k: keyof MmForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  // ── Expand state voor meetrijen in de unified log ─────────────────────────
  const [expandedSessIds, setExpandedSessIds] = useState<Set<string>>(new Set())
  const toggleExpand = (sessId: string) =>
    setExpandedSessIds(prev => {
      const next = new Set(prev)
      next.has(sessId) ? next.delete(sessId) : next.add(sessId)
      return next
    })

  // ── Interne kalibratie state ───────────────────────────────────────────────
  const [showNewSession, setShowNewSession] = useState(false)
  const [newSessForm, setNewSessForm] = useState<SessForm>(emptySessForm)
  const [newSessDraftRows, setNewSessDraftRows] = useState<Record<string, RowDraft[]>>({})
  const [savingSession, setSavingSession] = useState(false)
  // Per existing session: add-row form open per type
  const [addRowOpen, setAddRowOpen] = useState<Record<string, boolean>>({})
  const [addRowData, setAddRowData] = useState<Record<string, RowDraft>>({})

  // ── Sessie edit state ─────────────────────────────────────────────────────
  const [editSessId, setEditSessId] = useState<string | null>(null)
  const [editSessForm, setEditSessForm] = useState<SessForm | null>(null)
  const [savingSessEdit, setSavingSessEdit] = useState(false)

  // ── Externe kalibratie state ───────────────────────────────────────────────
  const [showExternForm, setShowExternForm] = useState(false)
  const [externForm, setExternForm] = useState<ExternForm>(emptyExternForm)
  const [editCalId, setEditCalId] = useState<string | null>(null)
  const [editCalForm, setEditCalForm] = useState<ExternForm | null>(null)
  const certRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: machines = [] } = useQuery<MachineOption[]>({
    queryKey: ['machines-kiosk'],
    queryFn: () => apiFetch('/kiosk/machines'),
  })
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: () => apiFetch('/kiosk/employees'),
  })
  const { data: documents = [], refetch: refetchDocs } = useQuery<ToolDocument[]>({
    queryKey: ['tool-documents', tool?.id],
    queryFn: () => apiFetch(`/kiosk/meetmiddelen/${tool!.id}/documents`),
    enabled: !!tool?.id,
  })
  const { data: calibrations = [], refetch: refetchCals } = useQuery<CalibrationRecord[]>({
    queryKey: ['calibrations', tool?.id],
    queryFn: () => apiFetch(`/kiosk/meetmiddelen/${tool!.id}/calibrations`),
    enabled: !!tool?.id,
  })
  const { data: internalSessions = [], refetch: refetchSessions } = useQuery<InternalSession[]>({
    queryKey: ['internal-sessions', tool?.id],
    queryFn: () => apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions`),
    enabled: !!tool?.id,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tool?.id) return
    const fd = new FormData()
    fd.append('file', file)
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    await fetch(`/api/kiosk/meetmiddelen/${tool.id}/photo`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    qc.invalidateQueries({ queryKey: ['meetmiddelen'] })
    onRefresh()
  }

  const deleteSession = useMutation({
    mutationFn: (sessId: string) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions/${sessId}`, { method: 'DELETE' }),
    onSuccess: () => { refetchSessions(); qc.invalidateQueries({ queryKey: ['meetmiddelen'] }) },
  })

  const handleSaveSessEdit = async () => {
    if (!editSessId || !editSessForm) return
    setSavingSessEdit(true)
    try {
      await apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions/${editSessId}`, {
        method: 'PUT',
        body: JSON.stringify({
          voltooiingsdatum: editSessForm.voltooiingsdatum || null,
          uitgevoerdDoor: editSessForm.uitgevoerdDoor || null,
          uitgevoerdDoorId: editSessForm.uitgevoerdDoorId || null,
          gecontroleerDoor: editSessForm.gecontroleerDoor || null,
          gecontroleerDoorId: editSessForm.gecontroleerDoorId || null,
        }),
      })
      await refetchSessions()
      qc.invalidateQueries({ queryKey: ['meetmiddelen'] })
      setEditSessId(null)
      setEditSessForm(null)
    } finally {
      setSavingSessEdit(false)
    }
  }

  const deleteRow = useMutation({
    mutationFn: ({ sessId, rowId }: { sessId: string; rowId: string }) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions/${sessId}/rows/${rowId}`, { method: 'DELETE' }),
    onSuccess: () => { refetchSessions(); qc.invalidateQueries({ queryKey: ['meetmiddelen'] }) },
  })

  const addCal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/calibrations`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { refetchCals(); qc.invalidateQueries({ queryKey: ['meetmiddelen'] }); setShowExternForm(false); setExternForm(emptyExternForm()) },
  })

  const updateCal = useMutation({
    mutationFn: ({ calId, data }: { calId: string; data: Record<string, unknown> }) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/calibrations/${calId}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { refetchCals(); qc.invalidateQueries({ queryKey: ['meetmiddelen'] }); setEditCalId(null); setEditCalForm(null) },
  })

  const deleteCal = useMutation({
    mutationFn: (calId: string) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/calibrations/${calId}`, { method: 'DELETE' }),
    onSuccess: () => { refetchCals(); qc.invalidateQueries({ queryKey: ['meetmiddelen'] }) },
  })

  const handleCertUpload = async (calId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    await fetch(`/api/kiosk/meetmiddelen/${tool!.id}/calibrations/${calId}/certificate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    refetchCals()
  }

  const docRef = useRef<HTMLInputElement>(null)
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !tool?.id) return
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY)
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(`/api/kiosk/meetmiddelen/${tool.id}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
    }
    e.target.value = ''
    refetchDocs()
  }

  const deleteDoc = useMutation({
    mutationFn: (docId: string) =>
      apiFetch(`/kiosk/meetmiddelen/${tool!.id}/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => refetchDocs(),
  })

  // Save new session + draft rows
  const handleSaveNewSession = async () => {
    setSavingSession(true)
    try {
      const sess: InternalSession = await apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions`, {
        method: 'POST',
        body: JSON.stringify({
          voltooiingsdatum: newSessForm.voltooiingsdatum || null,
          uitgevoerdDoor: newSessForm.uitgevoerdDoor || null,
          uitgevoerdDoorId: newSessForm.uitgevoerdDoorId || null,
          gecontroleerDoor: newSessForm.gecontroleerDoor || null,
          gecontroleerDoorId: newSessForm.gecontroleerDoorId || null,
        }),
      })
      for (const [calType, rows] of Object.entries(newSessDraftRows)) {
        for (const row of rows) {
          await apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions/${sess.id}/rows`, {
            method: 'POST',
            body: JSON.stringify({
              calType,
              nomWaarde: row.nomWaarde || null,
              gemetenWaarde: row.gemetenWaarde || null,
              tolerantie: row.tolerantie || null,
              datum: row.datum || null,
              dinNorm: CAL_DIN_NORM[calType] ?? null,
            }),
          })
        }
      }
      refetchSessions()
      qc.invalidateQueries({ queryKey: ['meetmiddelen'] })
      setShowNewSession(false)
      setNewSessForm(emptySessForm())
      setNewSessDraftRows({})
    } finally {
      setSavingSession(false)
    }
  }

  // Add row to existing session
  const handleAddRow = async (sessId: string, calType: string) => {
    const key = `${sessId}-${calType}`
    const data = addRowData[key] ?? { _key: '', nomWaarde: '', gemetenWaarde: '', tolerantie: '', datum: '' }
    await apiFetch(`/kiosk/meetmiddelen/${tool!.id}/internal-sessions/${sessId}/rows`, {
      method: 'POST',
      body: JSON.stringify({
        calType,
        nomWaarde: data.nomWaarde || null,
        gemetenWaarde: data.gemetenWaarde || null,
        tolerantie: data.tolerantie || null,
        datum: data.datum || null,
        dinNorm: CAL_DIN_NORM[calType] ?? null,
      }),
    })
    refetchSessions()
    qc.invalidateQueries({ queryKey: ['meetmiddelen'] })
    setAddRowOpen(o => ({ ...o, [key]: false }))
    setAddRowData(d => ({ ...d, [key]: { _key: '', nomWaarde: '', gemetenWaarde: '', tolerantie: '', datum: '' } }))
  }

  const handleSave = () => {
    const data: Record<string, unknown> = {
      voorraadId:         form.voorraadId         || null,
      artikelnaam:        form.artikelnaam        || null,
      merk:               form.merk               || null,
      afmeting:           form.afmeting           || null,
      kalibratiePlicht:   form.kalibratiePlicht,
      interval:           form.interval           || null,
      locatie:            form.locatie            || null,
      emailTeamleider:    form.emailTeamleider    || null,
      teamleiderId:       form.teamleiderId       || null,
      gebruiktDoor:       form.gebruiktDoor       || null,
      machineId:          form.machineId          || null,
      actief:             form.actief,
      afgekeurd:          form.afgekeurd,
      afgekeurdReden:     form.afgekeurdReden || null,
      serieSuffix:        form.serieSuffix    || null,
      interneKalibratie:  form.interneKalibratie,
      externeKalibratie:  form.externeKalibratie,
      eindmaatKalibratie: form.eindmaatKalibratie,
      ringKalibratie:     form.ringKalibratie,
      diepteKalibratie:   form.diepteKalibratie,
      instructie:         form.instructie       || null,
    }
    onSave(tool?.id ?? null, data)
  }

  // Derive kalibratie status from live calibrations for modal display
  const toolWithLiveCals: MeasuringTool = tool
    ? { ...tool, calibrations, internalSessions, interval: form.interval, kalibratiePlicht: form.kalibratiePlicht }
    : { id: '', toolId: nextId, calibrations: [], internalSessions: [], interval: form.interval, kalibratiePlicht: form.kalibratiePlicht } as unknown as MeasuringTool
  const kalStatus = kalibratieStatus(toolWithLiveCals)
  const volgende = nextKalDatum(toolWithLiveCals)

  // ── Unified kalibratie log ─────────────────────────────────────────────────
  type UnifiedCalEntry =
    | { kind: 'intern'; id: string; datum: string | null; session: InternalSession }
    | { kind: 'extern'; id: string; datum: string | null; record: CalibrationRecord }

  const unifiedLog: UnifiedCalEntry[] = [
    ...internalSessions.map((s): UnifiedCalEntry => ({ kind: 'intern', id: s.id, datum: s.voltooiingsdatum, session: s })),
    ...calibrations.map((c): UnifiedCalEntry => ({ kind: 'extern', id: c.id, datum: c.datum, record: c })),
  ].sort((a, b) => {
    if (!a.datum && !b.datum) return 0
    if (!a.datum) return 1
    if (!b.datum) return -1
    return b.datum.localeCompare(a.datum)
  })

  const lastEntry = unifiedLog.find(e => e.datum !== null) ?? unifiedLog[0] ?? null

  const TABS: { key: MmTab; label: string }[] = [
    { key: 'info', label: 'Meetmiddel informatie' },
    { key: 'kalibratie', label: 'Kalibratie' },
    { key: 'instructie', label: 'Instructie' },
    { key: 'documenten', label: 'Documenten' },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-gray-500">
              {isEdit ? tool.toolId : nextId}
            </span>
            {isEdit && <StatusBadge status={kalStatus} />}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={loading || (form.afgekeurd && !form.afgekeurdReden.trim())}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? 'Opslaan…' : 'Opslaan'}
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t.key
                  ? 'border-teal-500 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* ── Tab 1: Meetmiddel informatie ── */}
          {tab === 'info' && (
            <div className="space-y-6">

              {/* ── Sectie: Identificatie ── */}
              <div className="flex gap-5">

                {/* Foto upload */}
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      'w-36 h-36 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-colors',
                      canEdit && 'cursor-pointer hover:border-teal-400',
                    )}
                    onClick={() => canEdit && photoRef.current?.click()}
                  >
                    {tool?.photoUrl ? (
                      <img src={tool.photoUrl} alt="foto" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-gray-300">
                        <Upload size={24} />
                        <span className="text-xs">Foto toevoegen</span>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => photoRef.current?.click()}
                        className="text-xs text-teal-600 hover:underline"
                      >
                        {tool?.photoUrl ? 'Wijzigen' : 'Uploaden'}
                      </button>
                      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </>
                  )}
                </div>

                {/* Kernvelden 2-koloms */}
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel>Meetmiddel ID</FieldLabel>
                    <ReadonlyField value={isEdit ? tool.toolId : nextId} />
                  </div>
                  <div>
                    <FieldLabel>Artikelnaam</FieldLabel>
                    {canEdit
                      ? <TextInput value={form.artikelnaam} onChange={(v) => set('artikelnaam', v)} placeholder="bijv. Schuifmaat" />
                      : <ReadonlyField value={form.artikelnaam} />}
                  </div>
                  <div>
                    <FieldLabel>Merk</FieldLabel>
                    {canEdit
                      ? <TextInput value={form.merk} onChange={(v) => set('merk', v)} placeholder="bijv. Absolute" />
                      : <ReadonlyField value={form.merk} />}
                  </div>
                  <div>
                    <FieldLabel>Afmeting</FieldLabel>
                    {canEdit
                      ? <TextInput value={form.afmeting} onChange={(v) => set('afmeting', v)} placeholder="bijv. 150 mm" />
                      : <ReadonlyField value={form.afmeting} />}
                  </div>
                  {tool?.voorraadId && isEdit && (
                    <div>
                      <FieldLabel>FileMaker ID</FieldLabel>
                      <ReadonlyField value={tool.voorraadId} />
                    </div>
                  )}
                  <div>
                    <FieldLabel>Serie (laatste 5)</FieldLabel>
                    {canEdit
                      ? <TextInput value={form.serieSuffix} onChange={(v) => set('serieSuffix', v)} placeholder="bijv. 12345" maxLength={5} />
                      : <ReadonlyField value={form.serieSuffix} />}
                  </div>
                  <div>
                    <FieldLabel>Locatie</FieldLabel>
                    {canEdit ? (
                      <select
                        value={form.locatie}
                        onChange={(e) => set('locatie', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                      >
                        <option value="">— Kies locatie —</option>
                        {['3200', '4200', 'Bankwerkers', 'CMM', 'conventioneel werkplaats', 'Dino 1', 'Dino 2', 'Draaibank', 'Fooke', 'Kantoor', 'Lasafdeling', 'LT-930', 'LT-960', 'Meetkamer', 'Poetshok', 'Ronin', 'Voorinsteller', 'Voorraad meetmiddelen', 'Werkplaats'].map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    ) : (
                      <ReadonlyField value={form.locatie} />
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* ── Sectie: Gebruik & contact ── */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Teamleider</FieldLabel>
                  {canEdit ? (
                    form.emailTeamleider ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 px-3 py-2 border border-teal-200 bg-teal-50 rounded-lg text-sm text-teal-700 truncate">
                          {form.emailTeamleider}
                        </span>
                        <button
                          onClick={() => { set('emailTeamleider', ''); set('teamleiderId', null) }}
                          className="p-2 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg"
                          title="Verwijderen"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openEmpPicker((name, id) => { set('emailTeamleider', name); set('teamleiderId', id) })}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
                      >
                        <User size={14} /> Kies teamleider
                      </button>
                    )
                  ) : (
                    <ReadonlyField value={form.emailTeamleider} />
                  )}
                </div>
                <div>
                  <FieldLabel>Gebruikt door</FieldLabel>
                  {canEdit ? (
                    form.gebruiktDoor ? (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 px-3 py-2 border border-teal-200 bg-teal-50 rounded-lg text-sm text-teal-700 truncate">
                          {form.gebruiktDoor}
                        </span>
                        <button
                          onClick={() => set('gebruiktDoor', '')}
                          className="p-2 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg"
                          title="Verwijderen"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openEmpPicker((name) => set('gebruiktDoor', name))}
                        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
                      >
                        <User size={14} /> Kies medewerker
                      </button>
                    )
                  ) : (
                    <ReadonlyField value={form.gebruiktDoor} />
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* ── Sectie: Kalibratie instellingen ── */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Kalibratie plicht</FieldLabel>
                  <div className="flex gap-4 mt-1.5">
                    {[true, false].map((v) => (
                      <label key={String(v)} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <input
                          type="radio"
                          checked={form.kalibratiePlicht === v}
                          onChange={() => canEdit && set('kalibratiePlicht', v)}
                          disabled={!canEdit}
                          className="accent-teal-600"
                        />
                        {v ? 'Ja' : 'Nee'}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <FieldLabel>Interval</FieldLabel>
                  {canEdit ? (
                    <select
                      value={form.interval}
                      onChange={(e) => set('interval', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                    >
                      <option value="">— Selecteer —</option>
                      <option value="jaarlijks">Jaarlijkse kalibratie</option>
                      <option value="halfjaarlijks">Halfjaarlijkse kalibratie</option>
                      <option value="kwartaal">Kwartaal kalibratie</option>
                      <option value="geen">Geen</option>
                    </select>
                  ) : (
                    <ReadonlyField value={form.interval} />
                  )}
                </div>

                <div>
                  <FieldLabel>Status</FieldLabel>
                  <div className="flex gap-4 mt-1.5">
                    {[true, false].map((v) => (
                      <label key={String(v)} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <input
                          type="radio"
                          checked={form.actief === v}
                          onChange={() => canEdit && set('actief', v)}
                          disabled={!canEdit}
                          className="accent-teal-600"
                        />
                        {v ? 'Actief' : 'Inactief'}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <FieldLabel>Gekoppelde machine</FieldLabel>
                  {form.machineId ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 px-3 py-2 border border-teal-200 bg-teal-50 rounded-lg text-sm text-teal-700 truncate">
                        {form.machineName ?? form.machineId}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => { set('machineId', null); set('machineName', null) }}
                          className="p-2 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg"
                          title="Ontkoppelen"
                        >
                          <Link2Off size={14} />
                        </button>
                      )}
                    </div>
                  ) : canEdit ? (
                    <button
                      onClick={() => setShowMachinePicker(true)}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors"
                    >
                      <Link2 size={14} /> Koppel aan machine
                    </button>
                  ) : (
                    <ReadonlyField value="—" />
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* ── Sectie: Kalibratie soort ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kalibratie soort</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {([
                    ['interneKalibratie',  'Interne kalibratie'],
                    ['externeKalibratie',  'Externe kalibratie'],
                  ] as [keyof MmForm, string][]).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!form[key]}
                        onChange={(e) => canEdit && set(key, e.target.checked)}
                        disabled={!canEdit}
                        className="accent-teal-600 w-4 h-4 rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {form.interneKalibratie && (
                  <div className="flex flex-col gap-2 mt-2 pl-6 border-l-2 border-teal-100">
                    {([
                      ['eindmaatKalibratie', 'Eindmaat kalibratie'],
                      ['diepteKalibratie',   'Diepte kalibratie'],
                      ['ringKalibratie',     'Ring kalibratie'],
                    ] as [keyof MmForm, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!form[key]}
                          onChange={(e) => canEdit && set(key, e.target.checked)}
                          disabled={!canEdit}
                          className="accent-teal-600 w-4 h-4 rounded"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Afkeuren</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.afgekeurd}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setForm(f => ({ ...f, afgekeurd: checked, afgekeurdReden: checked ? f.afgekeurdReden : '' }))
                    }}
                    disabled={!canEdit}
                    className="w-4 h-4 rounded border-gray-300 accent-red-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Meetmiddel afgekeurd</span>
                  {form.afgekeurd && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Afgekeurd</span>
                  )}
                </label>
                {form.afgekeurd && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-red-600">
                      Reden voor afkeuring <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.afgekeurdReden}
                      onChange={(e) => setForm(f => ({ ...f, afgekeurdReden: e.target.value }))}
                      disabled={!canEdit}
                      placeholder="Beschrijf waarom dit meetmiddel is afgekeurd…"
                      rows={3}
                      className={cn(
                        'w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 resize-none bg-red-50',
                        form.afgekeurdReden.trim()
                          ? 'border-red-200 focus:ring-red-400'
                          : 'border-red-400 focus:ring-red-500',
                      )}
                    />
                    {!form.afgekeurdReden.trim() && (
                      <p className="text-xs text-red-500">Vul een reden in voordat je opslaat</p>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── Tab 2: Kalibratie ── */}
          {tab === 'kalibratie' && (
            <div className="space-y-5">
              {!isEdit ? (
                <p className="text-sm text-gray-400">Sla het meetmiddel eerst op om kalibraties toe te voegen.</p>
              ) : (
                <>
                  {/* ── Volgende kalibratie banner ── */}
                  {form.kalibratiePlicht && form.interval && form.interval !== 'geen' && (() => {
                    const intervalLabel: Record<string, string> = {
                      jaarlijks:     'Jaarlijkse kalibratie',
                      halfjaarlijks: 'Halfjaarlijkse kalibratie',
                      kwartaal:      'Kwartaalkalibratie',
                    }
                    const heeftVorigeKal = lastEntry !== null
                    return (
                      <div className={cn(
                        'rounded-xl border-2 p-4',
                        kalStatus === 'verlopen'   && 'bg-red-50 border-red-300',
                        kalStatus === 'binnenkort' && 'bg-orange-50 border-orange-300',
                        kalStatus === 'ok'         && 'bg-green-50 border-green-200',
                        !heeftVorigeKal            && 'bg-gray-50 border-gray-300',
                      )}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                              {intervalLabel[form.interval] ?? form.interval}
                            </p>
                            {heeftVorigeKal ? (
                              <>
                                <p className="text-xs text-gray-400 mb-0.5">
                                  Volgende kalibratie (gebaseerd op laatste kalibratie + interval)
                                </p>
                                <p className={cn(
                                  'text-2xl font-bold',
                                  kalStatus === 'verlopen'   && 'text-red-700',
                                  kalStatus === 'binnenkort' && 'text-orange-700',
                                  kalStatus === 'ok'         && 'text-green-700',
                                )}>
                                  {volgende}
                                </p>
                                {kalStatus === 'verlopen' && (
                                  <p className="text-xs text-red-500 mt-0.5 font-medium">Kalibratie is verlopen — actie vereist</p>
                                )}
                                {kalStatus === 'binnenkort' && (
                                  <p className="text-xs text-orange-500 mt-0.5 font-medium">Kalibratie verloopt binnenkort</p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-lg font-semibold text-gray-500">Nog geen kalibratie geregistreerd</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  Registreer de eerste kalibratie in de log hieronder. De volgende vervaldatum wordt dan automatisch berekend op basis van het interval.
                                </p>
                              </>
                            )}
                          </div>
                          {heeftVorigeKal && <StatusBadge status={kalStatus} />}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Laatste kalibratie samenvatting ── */}
                  <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Laatste kalibratie</p>
                      <p className="font-medium text-gray-800">{lastEntry ? formatDate(lastEntry.datum) : '—'}</p>
                      {lastEntry && (
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block',
                          lastEntry.kind === 'intern' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700',
                        )}>
                          {lastEntry.kind === 'intern' ? 'Intern' : 'Extern'}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Uitgevoerd door</p>
                      <p className="font-medium text-gray-800">
                        {lastEntry
                          ? lastEntry.kind === 'intern'
                            ? (lastEntry.session.uitgevoerdDoor ?? '—')
                            : (lastEntry.record.gekalibreerdDoor ?? '—')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Gecontroleerd door</p>
                      <p className="font-medium text-gray-800">
                        {lastEntry
                          ? lastEntry.kind === 'intern'
                            ? (lastEntry.session.gecontroleerDoor ?? '—')
                            : (lastEntry.record.gecontroleerDoor ?? '—')
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {/* ── Actieknoppen ── */}
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      {form.interneKalibratie && !showNewSession && (
                        <button onClick={() => setShowNewSession(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors">
                          <Plus size={12} /> Nieuwe interne sessie
                        </button>
                      )}
                      {form.externeKalibratie && !showExternForm && (
                        <button onClick={() => setShowExternForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-teal-600 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                          <Plus size={12} /> Externe kalibratie toevoegen
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Nieuwe interne sessie form ── */}
                  {showNewSession && canEdit && (() => {
                    const activeTypes = [
                      form.eindmaatKalibratie && 'eindmaat',
                      form.diepteKalibratie   && 'diepte',
                      form.ringKalibratie     && 'ring',
                    ].filter(Boolean) as string[]
                    const colLabel: Record<string, string> = { eindmaat: 'Eindmaat', diepte: 'Diepte maat', ring: 'Diameter' }
                        return (
                          <div className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <FieldLabel>Voltooiingsdatum</FieldLabel>
                                <input type="date" value={newSessForm.voltooiingsdatum} onChange={e => setNewSessForm(f => ({...f, voltooiingsdatum: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                              </div>
                              <div>
                                <FieldLabel>Uitgevoerd door</FieldLabel>
                                <button onClick={() => openEmpPicker((n, id) => setNewSessForm(f => ({...f, uitgevoerdDoor: n, uitgevoerdDoorId: id})))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors truncate">
                                  {newSessForm.uitgevoerdDoor || <span className="text-gray-400">Selecteer…</span>}
                                </button>
                              </div>
                              <div>
                                <FieldLabel>Gecontroleerd door</FieldLabel>
                                <button onClick={() => openEmpPicker((n, id) => setNewSessForm(f => ({...f, gecontroleerDoor: n, gecontroleerDoorId: id})))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors truncate">
                                  {newSessForm.gecontroleerDoor || <span className="text-gray-400">Selecteer…</span>}
                                </button>
                              </div>
                            </div>

                            {activeTypes.map(calType => {
                              const rows = newSessDraftRows[calType] ?? []
                              return (
                                <div key={calType}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{calType.charAt(0).toUpperCase() + calType.slice(1)} kalibratie</p>
                                      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{CAL_DIN_NORM[calType]}</span>
                                    </div>
                                    <button onClick={() => {
                                      const newRow: RowDraft = { _key: String(Date.now()), nomWaarde: '', gemetenWaarde: '', tolerantie: '', datum: '' }
                                      setNewSessDraftRows(d => ({ ...d, [calType]: [...(d[calType] ?? []), newRow] }))
                                    }} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                                      <Plus size={11} /> Rij toevoegen
                                    </button>
                                  </div>
                                  {rows.length > 0 && (
                                    <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                                      <thead className="bg-white">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">{colLabel[calType]}</th>
                                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Gemeten</th>
                                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Tolerantie</th>
                                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Datum</th>
                                          <th className="w-6" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rows.map((row, idx) => (
                                          <tr key={row._key} className="border-t border-gray-100">
                                            <td className="px-1 py-1"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={row.nomWaarde} onChange={e => setNewSessDraftRows(d => ({...d, [calType]: d[calType].map((r, i) => i === idx ? {...r, nomWaarde: e.target.value} : r)}))} /></td>
                                            <td className="px-1 py-1"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={row.gemetenWaarde} onChange={e => setNewSessDraftRows(d => ({...d, [calType]: d[calType].map((r, i) => i === idx ? {...r, gemetenWaarde: e.target.value} : r)}))} /></td>
                                            <td className="px-1 py-1"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={row.tolerantie} onChange={e => setNewSessDraftRows(d => ({...d, [calType]: d[calType].map((r, i) => i === idx ? {...r, tolerantie: e.target.value} : r)}))} /></td>
                                            <td className="px-1 py-1"><input type="date" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" value={row.datum} onChange={e => setNewSessDraftRows(d => ({...d, [calType]: d[calType].map((r, i) => i === idx ? {...r, datum: e.target.value} : r)}))} /></td>
                                            <td className="px-1 py-1 text-center"><button onClick={() => setNewSessDraftRows(d => ({...d, [calType]: d[calType].filter((_, i) => i !== idx)}))} className="text-gray-300 hover:text-red-500"><X size={12} /></button></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )
                            })}

                            <div className="flex gap-2 pt-2">
                              <button onClick={handleSaveNewSession} disabled={savingSession} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors disabled:opacity-60">
                                {savingSession ? 'Opslaan…' : 'Sessie opslaan'}
                              </button>
                              <button onClick={() => { setShowNewSession(false); setNewSessForm(emptySessForm()); setNewSessDraftRows({}) }} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                                Annuleren
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                  {/* ── Extern toevoegen form ── */}
                  {showExternForm && canEdit && (
                    <div className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Naam extern lab</FieldLabel>
                          <TextInput value={externForm.gekalibreerdDoor} onChange={v => setExternForm(f => ({...f, gekalibreerdDoor: v}))} placeholder="bijv. Van Swinden Laboratorium" />
                        </div>
                        <div>
                          <FieldLabel>Datum certificaat</FieldLabel>
                          <input type="date" value={externForm.datum} onChange={e => setExternForm(f => ({...f, datum: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                        </div>
                        <div>
                          <FieldLabel>Datum weggestuurd</FieldLabel>
                          <input type="date" value={externForm.datumWeggestuurd} onChange={e => setExternForm(f => ({...f, datumWeggestuurd: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                        </div>
                        <div>
                          <FieldLabel>Datum terug ontvangen</FieldLabel>
                          <input type="date" value={externForm.datumTerug} onChange={e => setExternForm(f => ({...f, datumTerug: e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                        </div>
                        <div className="col-span-2">
                          <FieldLabel>Gecontroleerd door</FieldLabel>
                          <button onClick={() => openEmpPicker((n, id) => setExternForm(f => ({...f, gecontroleerDoor: n, gecontroleerDoorId: id})))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors">
                            {externForm.gecontroleerDoor || <span className="text-gray-400">Selecteer medewerker…</span>}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => addCal.mutate({ gekalibreerdDoor: externForm.gekalibreerdDoor || null, datum: externForm.datum || null, gecontroleerDoor: externForm.gecontroleerDoor || null, gecontroleerDoorId: externForm.gecontroleerDoorId || null, datumWeggestuurd: externForm.datumWeggestuurd || null, datumTerug: externForm.datumTerug || null })} disabled={addCal.isPending} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors disabled:opacity-60">
                          {addCal.isPending ? 'Opslaan…' : 'Opslaan'}
                        </button>
                        <button onClick={() => { setShowExternForm(false); setExternForm(emptyExternForm()) }} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Annuleren</button>
                      </div>
                    </div>
                  )}

                  {/* ── Kalibratie log (intern + extern gecombineerd, nieuwste eerst) ── */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Kalibratie log</h3>

                    {unifiedLog.length === 0 && !showNewSession && !showExternForm && (
                      <p className="text-sm text-gray-400">Nog geen kalibratie-records.</p>
                    )}

                    <div className="overflow-y-auto max-h-[480px] space-y-2 pr-1">
                      {unifiedLog.map((entry) => {
                        const colLabel: Record<string, string> = { eindmaat: 'Eindmaat', diepte: 'Diepte maat', ring: 'Diameter' }

                        // ── Intern entry ──────────────────────────────────────
                        if (entry.kind === 'intern') {
                          const sess = entry.session
                          const isExpanded = expandedSessIds.has(entry.id)
                          const activeTypes = [
                            form.eindmaatKalibratie && 'eindmaat',
                            form.diepteKalibratie   && 'diepte',
                            form.ringKalibratie     && 'ring',
                          ].filter(Boolean) as string[]

                          if (editSessId === sess.id && editSessForm) {
                            return (
                              <div key={entry.id} className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <FieldLabel>Voltooiingsdatum</FieldLabel>
                                    <input type="date" value={editSessForm.voltooiingsdatum} onChange={e => setEditSessForm(f => f ? {...f, voltooiingsdatum: e.target.value} : f)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
                                  </div>
                                  <div>
                                    <FieldLabel>Uitgevoerd door</FieldLabel>
                                    <button onClick={() => openEmpPicker((n, id) => setEditSessForm(f => f ? {...f, uitgevoerdDoor: n, uitgevoerdDoorId: id} : f))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors truncate">
                                      {editSessForm.uitgevoerdDoor || <span className="text-gray-400">Selecteer…</span>}
                                    </button>
                                  </div>
                                  <div>
                                    <FieldLabel>Gecontroleerd door</FieldLabel>
                                    <button onClick={() => openEmpPicker((n, id) => setEditSessForm(f => f ? {...f, gecontroleerDoor: n, gecontroleerDoorId: id} : f))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors truncate">
                                      {editSessForm.gecontroleerDoor || <span className="text-gray-400">Selecteer…</span>}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handleSaveSessEdit} disabled={savingSessEdit} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg transition-colors disabled:opacity-60">
                                    {savingSessEdit ? 'Opslaan…' : 'Opslaan'}
                                  </button>
                                  <button onClick={() => { setEditSessId(null); setEditSessForm(null) }} className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">Annuleren</button>
                                  <button onClick={() => deleteSession.mutate(sess.id)} className="ml-auto px-3 py-1.5 text-red-400 hover:text-red-600 text-xs">Sessie verwijderen</button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={entry.id} className="border border-gray-200 rounded-xl overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium shrink-0">Intern</span>
                                <span className="text-sm font-medium text-gray-800 w-28 shrink-0">{formatDate(sess.voltooiingsdatum)}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-gray-400">Uitgevoerd door </span>
                                  <span className="text-sm text-gray-700">{sess.uitgevoerdDoor ?? '—'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-gray-400">Gecontroleerd door </span>
                                  <span className="text-sm text-gray-700">{sess.gecontroleerDoor ?? '—'}</span>
                                </div>
                                <button
                                  onClick={() => toggleExpand(entry.id)}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 px-2 py-1 rounded-lg hover:bg-gray-50 shrink-0 transition-colors"
                                >
                                  <span className="font-mono">{sess.rows.length} meting{sess.rows.length !== 1 ? 'en' : ''}</span>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {canEdit && (
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => { setEditSessId(sess.id); setEditSessForm({ voltooiingsdatum: sess.voltooiingsdatum ?? '', uitgevoerdDoor: sess.uitgevoerdDoor ?? '', uitgevoerdDoorId: sess.uitgevoerdDoorId ?? '', gecontroleerDoor: sess.gecontroleerDoor ?? '', gecontroleerDoorId: sess.gecontroleerDoorId ?? '' }) }} className="p-1.5 text-gray-300 hover:text-teal-600 transition-colors rounded" title="Bewerken">
                                      <Pencil size={14} />
                                    </button>
                                    <button onClick={() => deleteSession.mutate(sess.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded" title="Verwijderen">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {isExpanded && (
                                <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50/50 space-y-3">
                                  {activeTypes.map(calType => {
                                    const typeRows = sess.rows.filter(r => r.calType === calType)
                                    const key = `${sess.id}-${calType}`
                                    const isAddOpen = addRowOpen[key] ?? false
                                    const addData = addRowData[key] ?? { _key: '', nomWaarde: '', gemetenWaarde: '', tolerantie: '', datum: '' }
                                    const setAdd = (field: keyof typeof addData, val: string) =>
                                      setAddRowData(d => ({ ...d, [key]: { ...addData, [field]: val } }))
                                    return (
                                      <div key={calType}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{calType.charAt(0).toUpperCase() + calType.slice(1)} kalibratie</p>
                                          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{CAL_DIN_NORM[calType]}</span>
                                        </div>
                                        {typeRows.length > 0 && (
                                          <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden mb-1.5">
                                            <thead className="bg-gray-50">
                                              <tr>
                                                <th className="px-3 py-1.5 text-left text-gray-500 font-medium">{colLabel[calType]}</th>
                                                <th className="px-3 py-1.5 text-left text-gray-500 font-medium">Gemeten</th>
                                                <th className="px-3 py-1.5 text-left text-gray-500 font-medium">Tolerantie</th>
                                                <th className="px-3 py-1.5 text-left text-gray-500 font-medium">Datum</th>
                                                {canEdit && <th className="w-6" />}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {typeRows.map(row => (
                                                <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50">
                                                  <td className="px-3 py-1.5 text-gray-700">{row.nomWaarde ?? '—'}</td>
                                                  <td className="px-3 py-1.5 text-gray-700">{row.gemetenWaarde ?? '—'}</td>
                                                  <td className="px-3 py-1.5 text-gray-700">{row.tolerantie ?? '—'}</td>
                                                  <td className="px-3 py-1.5 text-gray-700">{row.datum ?? '—'}</td>
                                                  {canEdit && (
                                                    <td className="px-2 py-1.5 text-center">
                                                      <button onClick={() => deleteRow.mutate({ sessId: sess.id, rowId: row.id })} className="text-gray-300 hover:text-red-500 transition-colors"><X size={12} /></button>
                                                    </td>
                                                  )}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                        {canEdit && !isAddOpen && (
                                          <button onClick={() => setAddRowOpen(o => ({...o, [key]: true}))} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                                            <Plus size={11} /> Meting toevoegen
                                          </button>
                                        )}
                                        {canEdit && isAddOpen && (
                                          <div className="flex items-end gap-2 mt-1.5 p-2 bg-teal-50 rounded-lg">
                                            <div className="flex-1"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" placeholder={colLabel[calType]} value={addData.nomWaarde} onChange={e => setAdd('nomWaarde', e.target.value)} /></div>
                                            <div className="flex-1"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" placeholder="Gemeten" value={addData.gemetenWaarde} onChange={e => setAdd('gemetenWaarde', e.target.value)} /></div>
                                            <div className="w-20"><input className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" placeholder="Tolerantie" value={addData.tolerantie} onChange={e => setAdd('tolerantie', e.target.value)} /></div>
                                            <div className="w-28"><input type="date" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" value={addData.datum} onChange={e => setAdd('datum', e.target.value)} /></div>
                                            <button onClick={() => handleAddRow(sess.id, calType)} className="px-3 py-1 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 whitespace-nowrap">Toevoegen</button>
                                            <button onClick={() => setAddRowOpen(o => ({...o, [key]: false}))} className="px-2 py-1 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50"><X size={12} /></button>
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

                        // ── Extern entry ──────────────────────────────────────
                        if (entry.kind === 'extern') {
                          const cal = entry.record

                          if (editCalId === cal.id && editCalForm) {
                            return (
                              <div key={entry.id} className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div><FieldLabel>Naam extern lab</FieldLabel><TextInput value={editCalForm.gekalibreerdDoor} onChange={v => setEditCalForm(f => f ? {...f, gekalibreerdDoor: v} : f)} /></div>
                                  <div><FieldLabel>Datum certificaat</FieldLabel><input type="date" value={editCalForm.datum} onChange={e => setEditCalForm(f => f ? {...f, datum: e.target.value} : f)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" /></div>
                                  <div><FieldLabel>Datum weggestuurd</FieldLabel><input type="date" value={editCalForm.datumWeggestuurd} onChange={e => setEditCalForm(f => f ? {...f, datumWeggestuurd: e.target.value} : f)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" /></div>
                                  <div><FieldLabel>Datum terug ontvangen</FieldLabel><input type="date" value={editCalForm.datumTerug} onChange={e => setEditCalForm(f => f ? {...f, datumTerug: e.target.value} : f)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" /></div>
                                  <div className="col-span-2"><FieldLabel>Gecontroleerd door</FieldLabel>
                                    <button onClick={() => openEmpPicker((n, id) => setEditCalForm(f => f ? {...f, gecontroleerDoor: n, gecontroleerDoorId: id} : f))} className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:border-teal-400 transition-colors">
                                      {editCalForm.gecontroleerDoor || <span className="text-gray-400">Selecteer medewerker…</span>}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => updateCal.mutate({ calId: cal.id, data: { gekalibreerdDoor: editCalForm.gekalibreerdDoor || null, datum: editCalForm.datum || null, gecontroleerDoor: editCalForm.gecontroleerDoor || null, gecontroleerDoorId: editCalForm.gecontroleerDoorId || null, datumWeggestuurd: editCalForm.datumWeggestuurd || null, datumTerug: editCalForm.datumTerug || null } })} disabled={updateCal.isPending} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors disabled:opacity-60">{updateCal.isPending ? 'Opslaan…' : 'Opslaan'}</button>
                                  <button onClick={() => { setEditCalId(null); setEditCalForm(null) }} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Annuleren</button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={entry.id} className="border border-gray-200 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0">Extern</span>
                                <span className="text-sm font-medium text-gray-800 w-28 shrink-0">{formatDate(cal.datum)}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-gray-400">Lab </span>
                                  <span className="text-sm text-gray-700">{cal.gekalibreerdDoor ?? '—'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-gray-400">Gecontroleerd door </span>
                                  <span className="text-sm text-gray-700">{cal.gecontroleerDoor ?? '—'}</span>
                                </div>
                                <div className="shrink-0">
                                  {cal.certificaatUrl ? (
                                    <a href={cal.certificaatUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-teal-600 hover:underline text-xs">
                                      <ExternalLink size={11} />{cal.certificaatNaam ?? 'Certificaat'}
                                    </a>
                                  ) : canEdit ? (
                                    <button onClick={() => certRefs.current[cal.id]?.click()} className="flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
                                      <Upload size={11} /> Certificaat
                                    </button>
                                  ) : null}
                                  <input type="file" className="hidden" ref={el => { certRefs.current[cal.id] = el }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCertUpload(cal.id, f) }} />
                                </div>
                                {canEdit && (
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => { setEditCalId(cal.id); setEditCalForm({ gekalibreerdDoor: cal.gekalibreerdDoor ?? '', datum: cal.datum ?? '', gecontroleerDoor: cal.gecontroleerDoor ?? '', gecontroleerDoorId: cal.gecontroleerDoorId ?? '', datumWeggestuurd: cal.datumWeggestuurd ?? '', datumTerug: cal.datumTerug ?? '' }) }} className="p-1.5 text-gray-300 hover:text-teal-600 transition-colors rounded" title="Bewerken">
                                      <Pencil size={14} />
                                    </button>
                                    <button onClick={() => deleteCal.mutate(cal.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded" title="Verwijderen">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {(cal.datumWeggestuurd || cal.datumTerug) && (
                                <div className="flex gap-4 mt-1.5 pl-[7.25rem] text-xs text-gray-400">
                                  {cal.datumWeggestuurd && <span>Weggestuurd: <span className="text-gray-600">{formatDate(cal.datumWeggestuurd)}</span></span>}
                                  {cal.datumTerug && <span>Terug: <span className="text-gray-600">{formatDate(cal.datumTerug)}</span></span>}
                                </div>
                              )}
                            </div>
                          )
                        }

                        return null
                      })}
                    </div>
                  </div>

                  {!form.interneKalibratie && !form.externeKalibratie && (
                    <p className="text-sm text-gray-400">Selecteer een kalibratie soort in de tab "Meetmiddel informatie".</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Tab 3: Instructie ── */}
          {tab === 'instructie' && (
            <div>
              <FieldLabel>Instructie / opmerking</FieldLabel>
              {canEdit ? (
                <textarea
                  value={form.instructie ?? ''}
                  onChange={(e) => set('instructie', e.target.value)}
                  rows={5}
                  placeholder="Beschrijving, gebruiksinstructies of opmerkingen…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y"
                />
              ) : (
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 min-h-[100px] whitespace-pre-wrap">
                  {form.instructie || ''}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 4: Documenten ── */}
          {tab === 'documenten' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <FieldLabel>Documenten</FieldLabel>
                {canEdit && isEdit && (
                  <button
                    onClick={() => docRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-teal-400 text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    <Upload size={12} /> Document toevoegen
                  </button>
                )}
                <input ref={docRef} type="file" multiple className="hidden" onChange={handleDocUpload} />
              </div>

              {!isEdit ? (
                <p className="text-sm text-gray-400">Sla het meetmiddel eerst op om documenten toe te voegen.</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-gray-400">Geen documenten.</p>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Document naam</th>
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
                              {doc.documentNaam ?? 'Document'}
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
                              {canEdit && (
                                <button
                                  onClick={() => deleteDoc.mutate(doc.id)}
                                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
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

      {/* Machine picker overlay */}
      {showMachinePicker && (
        <MachinePicker
          machines={machines}
          onSelect={(m) => {
            set('machineId', m.id)
            set('machineName', m.name)
            setShowMachinePicker(false)
          }}
          onClose={() => setShowMachinePicker(false)}
        />
      )}

      {/* Employee picker overlay (generalized callback) */}
      {empPickerCb && (
        <EmployeePickerModal
          employees={employees}
          selected={null}
          title="Selecteer medewerker"
          onSelect={(emp) => {
            empPickerCb(emp.name, emp.id)
            setEmpPickerCb(null)
          }}
          onClose={() => setEmpPickerCb(null)}
        />
      )}
    </div>
  )
}

// ── MeetmiddelenContent ────────────────────────────────────────────────────

export function MeetmiddelenContent({ openToolId, onPendingConsumed }: { openToolId?: string; onPendingConsumed?: () => void } = {}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterActief, setFilterActief] = useState<'actief' | 'inactief' | 'alle'>('actief')
  const [filterKal, setFilterKal] = useState<'alle' | 'verlopen' | 'kritisch'>('alle')
  const [modal, setModal] = useState<MeasuringTool | null | 'nieuw'>(null)

  const { data: tools = [], refetch, isFetching } = useQuery<MeasuringTool[]>({
    queryKey: ['meetmiddelen'],
    queryFn: () => apiFetch('/kiosk/meetmiddelen'),
  })

  useEffect(() => {
    if (!openToolId || !tools.length) return
    const tool = tools.find(t => t.id === openToolId)
    if (tool) {
      setModal(tool)
      onPendingConsumed?.()
    }
  }, [openToolId, tools])

  const { data: nextIdData } = useQuery<{ toolId: string }>({
    queryKey: ['meetmiddelen-next-id'],
    queryFn: () => apiFetch('/kiosk/meetmiddelen/next-id'),
    staleTime: 0,
  })

  const createTool = useMutation<MeasuringTool, Error, Record<string, unknown>>({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/kiosk/meetmiddelen', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (createdTool: MeasuringTool) => {
      qc.invalidateQueries({ queryKey: ['meetmiddelen'] })
      qc.invalidateQueries({ queryKey: ['meetmiddelen-next-id'] })
      setModal({ ...createdTool, calibrations: [], machineName: null })
    },
  })

  const updateTool = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/kiosk/meetmiddelen/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meetmiddelen'] }); setModal(null) },
  })

  const deleteTool = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/meetmiddelen/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meetmiddelen'] }),
  })

  const canEdit = isPrivileged()

  const filtered = tools.filter((t) => {
    const q = search.toLowerCase()
    const matchSearch =
      (t.toolId ?? '').toLowerCase().includes(q) ||
      (t.artikelnaam ?? '').toLowerCase().includes(q) ||
      (t.afmeting ?? '').toLowerCase().includes(q) ||
      (t.merk ?? '').toLowerCase().includes(q) ||
      (t.locatie ?? '').toLowerCase().includes(q)
    const matchActief =
      filterActief === 'alle'   ? true :
      filterActief === 'actief' ? t.actief !== false :
      t.actief === false
    const matchKal =
      filterKal === 'alle'     ? true :
      filterKal === 'verlopen' ? kalibratieStatus(t) === 'verlopen' :
      kalibratieStatus(t) === 'binnenkort'
    return matchSearch && matchActief && matchKal
  })

  const handleSave = (id: string | null, data: Record<string, unknown>) => {
    if (id) {
      updateTool.mutate({ id, data })
    } else {
      createTool.mutate(data)
    }
  }

  const selectedTool = modal !== null && modal !== 'nieuw' ? modal : null

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* Lijst sidebar */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col bg-white">
        {/* Zoekbalk + acties */}
        <div className="px-4 pt-4 pb-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Zoeken…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-400 hover:text-teal-600 border border-gray-200 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex gap-1">
            {(['actief', 'inactief', 'alle'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterActief(f)}
                className={cn(
                  'flex-1 py-1 text-xs rounded-md transition-colors',
                  filterActief === f
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setFilterKal('alle')}
              className={cn(
                'flex-1 py-1 text-xs rounded-md transition-colors',
                filterKal === 'alle'
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              Alle kal.
            </button>
            <button
              onClick={() => setFilterKal('verlopen')}
              className={cn(
                'flex-1 py-1 text-xs rounded-md transition-colors',
                filterKal === 'verlopen'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-500 hover:bg-red-100',
              )}
            >
              Verlopen
            </button>
            <button
              onClick={() => setFilterKal('kritisch')}
              className={cn(
                'flex-1 py-1 text-xs rounded-md transition-colors',
                filterKal === 'kritisch'
                  ? 'bg-orange-500 text-white'
                  : 'bg-orange-50 text-orange-500 hover:bg-orange-100',
              )}
            >
              Kritisch
            </button>
          </div>
        </div>

        {/* Lijst items */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Geen meetmiddelen gevonden</p>
          )}
          {filtered.map((t) => {
            const status = kalibratieStatus(t)
            return (
              <button
                key={t.id}
                onClick={() => setModal(t)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors',
                  modal !== null && modal !== 'nieuw' && (modal as MeasuringTool).id === t.id
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50',
                  'border-l-4',
                  t.afgekeurd             ? 'border-l-red-700'    :
                  status === 'verlopen'   ? 'border-l-red-500'    :
                  status === 'binnenkort' ? 'border-l-orange-400' :
                  status === 'ok'         ? 'border-l-green-400'  :
                  'border-l-gray-200',
                )}
              >
                <div className="flex items-start justify-between gap-1 flex-wrap">
                  <span className="text-xs font-mono text-gray-400">{t.toolId}</span>
                  {t.voorraadId && (
                    <span className="text-xs text-gray-400">· {t.voorraadId}</span>
                  )}
                  <div className="flex items-center gap-1">
                    {t.afgekeurd && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Afgekeurd</span>
                    )}
                    <StatusBadge status={status} />
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                  {t.artikelnaam ?? '—'}
                </p>
                {t.afmeting && <p className="text-xs text-gray-500 truncate">{t.afmeting}</p>}
                {t.locatie && <p className="text-xs text-gray-400 truncate">{t.locatie}</p>}
                {t.kalibratiePlicht && t.interval && t.interval !== 'geen' && (() => {
                  const volgende = nextKalDatum(t)
                  if (!volgende && status !== 'verlopen') return null
                  return (
                    <p className={cn(
                      'text-xs font-medium mt-1',
                      status === 'verlopen'   ? 'text-red-600'    :
                      status === 'binnenkort' ? 'text-orange-500' :
                      'text-green-600',
                    )}>
                      {status === 'verlopen' ? 'Verlopen' : `Volgende: ${volgende}`}
                    </p>
                  )
                })()}
              </button>
            )
          })}
        </div>

        {/* Nieuw aanmaken knop */}
        {canEdit && (
          <div className="px-3 pb-4 pt-2 border-t border-gray-100">
            <button
              onClick={() => setModal('nieuw')}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-xl transition-colors"
            >
              <Plus size={15} /> Nieuw meetmiddel
            </button>
          </div>
        )}
      </div>

      {/* Rechter area: placeholder of detail panel */}
      {modal === null ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Gauge size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-400 mb-4">Selecteer een meetmiddel of maak een nieuw aan</p>
            {canEdit && (
              <button
                onClick={() => setModal('nieuw')}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors"
              >
                <Plus size={15} /> Nieuw meetmiddel
              </button>
            )}
          </div>
        </div>
      ) : (
        <DetailModal
          key={modal === 'nieuw' ? 'new' : (modal as MeasuringTool).id}
          tool={modal === 'nieuw' ? null : modal}
          nextId={nextIdData?.toolId ?? 'MM-10001'}
          onSave={handleSave}
          onClose={() => setModal(null)}
          loading={createTool.isPending || updateTool.isPending}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['meetmiddelen'] })}
        />
      )}
    </div>
  )
}
