import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight, Search, X, Paperclip, Lightbulb, Printer, ShieldCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EMPLOYEE_TOKEN_KEY, ADMIN_TOKEN_KEY } from '@/lib/auth'
import EmployeePickerModal from '@/components/kiosk/EmployeePickerModal'

// ── Types ──────────────────────────────────────────────────────────────────

type NcrStatus = 'open' | 'in_behandeling' | 'in_uitvoering' | 'gereed' | 'gesloten' | 'vervallen'

interface NcrRegistration {
  id: string
  ncrId: string
  productionOrder: string | null
  itemRef: string | null
  itemName: string | null
  productionStep: string | null
  writtenByName: string | null
  writtenByDepartment: string | null
  causingDepartment: string | null
  faultCode: string | null
  causeCode: string | null
  shortDescription: string | null
  description: string | null
  measureRequired: boolean | null
  peEmail: string | null
  assignedToId: string | null
  solution: string | null
  dispositionType: string | null
  resolvedBy: string | null
  closedBy: string | null
  closedAt: string | null
  status: NcrStatus
  createdById: string | null
  createdAt: string
  updatedAt: string
}

// ── Constanten ────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'open',           label: 'Open',           border: 'border-l-blue-500',  badge: 'bg-blue-100 text-blue-700'   },
  { key: 'in_behandeling', label: 'In behandeling', border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { key: 'in_uitvoering',  label: 'In uitvoering',  border: 'border-l-teal-500',  badge: 'bg-teal-100 text-teal-700'   },
  { key: 'gereed',         label: 'Gereed',         border: 'border-l-green-500', badge: 'bg-green-100 text-green-700' },
  { key: 'gesloten',       label: 'Gesloten',       border: 'border-l-gray-400',  badge: 'bg-gray-100 text-gray-500'   },
] as const

const DEPARTMENTS = [
  'CAM', 'Constructie', 'Engineering', 'Kwaliteit', 'Logistiek',
  'Productie engineer', 'Productie manager', 'Verspaning', 'Montage',
  'Extern', 'Sales', 'Inkoop',
]

const FAULT_CODES = [
  'Maat/vorm', 'Porositeit', 'Functionaliteit', 'Beschadiging',
  'Oppervlakteruwheid', 'Visueel', 'Documentatie',
]

const CAUSE_CODES = [
  'Boor fout', 'Conditie fout', 'Foute opspanning', 'Freesfout', 'Lasfout',
  'Montage fout', 'Programma fout', 'Gereedschap fout', 'Tekening fout',
  'Productie documentatie', 'Bestel documentatie',
]

const DISPOSITION_TYPES = [
  'Gebruiken zoals het is (klant besluit)',
  'Repareren (klant besluit)',
  'Herbewerken',
  'Terugsturen',
  'Vernietigen',
]

const STATUS_OPTIONS: { value: NcrStatus; label: string }[] = [
  { value: 'open',           label: 'Open'           },
  { value: 'in_behandeling', label: 'In behandeling' },
  { value: 'in_uitvoering',  label: 'In uitvoering'  },
  { value: 'gereed',         label: 'Gereed'         },
  { value: 'gesloten',       label: 'Gesloten'       },
  { value: 'vervallen',      label: 'Vervallen'      },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
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

const VERVALLEN_META = { border: 'border-l-gray-300', badge: 'bg-gray-100 text-gray-400' }

function colMeta(key: string) {
  return COLUMNS.find((c) => c.key === key) ?? VERVALLEN_META
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
  return <label className="block text-xs font-medium text-gray-500 mb-1">{children}</label>
}

function TextInput({ value, onChange, placeholder, readOnly, disabled }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; disabled?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly || disabled}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400',
        (readOnly || disabled) && 'bg-gray-50 text-gray-500 cursor-default',
      )}
    />
  )
}

function SelectInput({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={disabled ? undefined : (e) => onChange(e.target.value)}
      className={cn(
        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white',
        disabled && 'bg-gray-50 text-gray-500 cursor-default',
      )}
    >
      <option value="">{placeholder ?? '— Selecteer —'}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── NCR Detail Modal ───────────────────────────────────────────────────────

type Tab = 'afwijking' | 'oplossing' | 'bijlages'

interface NcrAttachment {
  id: string
  ncrId: string
  fileUrl: string
  fileName: string
  mimeType: string | null
  createdAt: string
}

function isImage(mimeType: string | null, fileName: string) {
  if (mimeType?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)
}

function NcrBijlagesTab({ ncrId }: { ncrId: string }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: attachments = [] } = useQuery<NcrAttachment[]>({
    queryKey: ['ncr-attachments', ncrId],
    queryFn: () => apiFetch(`/kiosk/ncr/${ncrId}/attachments`),
  })

  const deleteAtt = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/ncr-attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ncr-attachments', ncrId] }),
  })

  async function handleUpload(files: FileList) {
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/kiosk/ncr/${ncrId}/attachments`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['ncr-attachments', ncrId] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6">
      {/* Upload knop */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">{attachments.length} bijlage{attachments.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Paperclip size={14} />
          {uploading ? 'Uploaden...' : 'Bijlage toevoegen'}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files) }}
        />
      </div>

      {/* Tegel grid */}
      {attachments.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center h-36">
          <p className="text-sm text-gray-400">Nog geen bijlages toegevoegd</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {attachments.map((att) => (
            <div key={att.id} className="group relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square">
              {isImage(att.mimeType, att.fileName) ? (
                <img
                  src={att.fileUrl}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightbox(att.fileUrl)}
                />
              ) : (
                <a
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center w-full h-full gap-2 hover:bg-gray-100 transition-colors"
                >
                  <Paperclip size={22} className="text-gray-400" />
                  <span className="text-xs text-gray-500 text-center px-2 truncate w-full text-center">{att.fileName}</span>
                </a>
              )}
              {/* Verwijder knop */}
              <button
                onClick={() => { if (confirm('Bijlage verwijderen?')) deleteAtt.mutate(att.id) }}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={11} />
              </button>
              {/* Bestandsnaam onder afbeelding */}
              {isImage(att.mimeType, att.fileName) && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white truncate">{att.fileName}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Rapport helpers ───────────────────────────────────────────────────────

function ReportField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}

interface StatusLogEntry {
  id: string
  fromStatus: string | null
  toStatus: string
  changedByName: string | null
  createdAt: string
}

function NcrReportModal({ ncr, onClose }: { ncr: Partial<NcrRegistration>; onClose: () => void }) {
  const { data: attachments = [] } = useQuery<NcrAttachment[]>({
    queryKey: ['ncr-attachments', ncr.id],
    queryFn: () => apiFetch(`/kiosk/ncr/${ncr.id}/attachments`),
    enabled: !!ncr.id,
  })
  const { data: employeeList = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['kiosk-employees'],
    queryFn: () => apiFetch('/kiosk/employees', { skipAuth: true } as never),
    staleTime: 5 * 60 * 1000,
  })
  const { data: statusLog = [] } = useQuery<StatusLogEntry[]>({
    queryKey: ['ncr-status-log', ncr.id],
    queryFn: () => apiFetch(`/kiosk/ncr/${ncr.id}/status-log`),
    enabled: !!ncr.id,
  })
  const assignedName = employeeList.find((e) => e.id === ncr.assignedToId)?.name

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'ncr-print-style'
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .ncr-report-print, .ncr-report-print * { visibility: visible !important; }
        .ncr-report-print {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          overflow: visible !important;
          background: white !important;
        }
        .no-print { display: none !important; }
      }
      @page { size: A4; margin: 18mm; }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('ncr-print-style')?.remove() }
  }, [])

  const images = attachments.filter((a) => isImage(a.mimeType, a.fileName))
  const files  = attachments.filter((a) => !isImage(a.mimeType, a.fileName))

  return (
    <div className="ncr-report-print fixed inset-0 z-[9999] bg-white overflow-y-auto">

      {/* Actiebalk — alleen op scherm zichtbaar */}
      <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-8 py-3 flex items-center justify-between shadow-sm">
        <span className="text-sm font-medium text-gray-600">Rapport — {ncr.ncrId}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
          >
            <Printer size={14} /> Afdrukken / PDF
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Rapport inhoud */}
      <div className="max-w-4xl mx-auto px-10 py-10">

        {/* Koptekst */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-900">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Dutch Shape</p>
            <h1 className="text-2xl font-bold text-gray-900">Non-Conformance Report</h1>
          </div>
          <div className="text-right">
            <p className="text-lg font-mono font-bold text-gray-800">{ncr.ncrId}</p>
            <p className="text-sm text-gray-500 mt-0.5">{formatDate(ncr.createdAt ?? new Date().toISOString())}</p>
            <span className={cn(
              'inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium',
              colMeta(ncr.status ?? 'open').badge,
            )}>
              {STATUS_OPTIONS.find((s) => s.value === ncr.status)?.label ?? ncr.status}
            </span>
          </div>
        </div>

        {/* Afwijking */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Afwijking</h2>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm mb-5">
            <ReportField label="Productie order"       value={ncr.productionOrder} />
            <ReportField label="Artikel"                value={ncr.itemRef} />
            <ReportField label="Omschrijving"          value={ncr.itemName} />
            <ReportField label="Productie stap"        value={ncr.productionStep} />
            <ReportField label="Uitschrijver"          value={ncr.writtenByName} />
            <ReportField label="Afdeling uitschrijver" value={ncr.writtenByDepartment} />
            <ReportField label="Veroorzakende afd."    value={ncr.causingDepartment} />
            <ReportField label="Fout code"             value={ncr.faultCode} />
            <ReportField label="Oorzaak foutcode"      value={ncr.causeCode} />
            <ReportField
              label="Maatregel nodig"
              value={ncr.measureRequired === null || ncr.measureRequired === undefined ? undefined : ncr.measureRequired ? 'Ja' : 'Nee'}
            />
            <ReportField label="Verantwoordelijke (PE/PM)" value={assignedName} />
          </div>
          {ncr.shortDescription && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Korte omschrijving</p>
              <p className="text-sm text-gray-800">{ncr.shortDescription}</p>
            </div>
          )}
          {ncr.description && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Omschrijving</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{ncr.description}</p>
            </div>
          )}
        </section>

        {/* Statuslog */}
        {statusLog.length > 0 && (
          <section className="mb-8 pt-6 border-t border-gray-200">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Statushistorie</h2>
            <div className="space-y-1.5">
              {[...statusLog].reverse().map((entry) => {
                const from = STATUS_OPTIONS.find((s) => s.value === entry.fromStatus)?.label ?? entry.fromStatus
                const to   = STATUS_OPTIONS.find((s) => s.value === entry.toStatus)?.label  ?? entry.toStatus
                return (
                  <div key={entry.id} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="text-gray-400 text-xs shrink-0">{formatDate(entry.createdAt)}</span>
                    <span className="text-gray-300">·</span>
                    <span>
                      {from ? <><span className="text-gray-400">{from}</span><span className="mx-1.5 text-gray-300">→</span></> : null}
                      <span className={cn('font-medium', colMeta(entry.toStatus).badge.split(' ')[1])}>{to}</span>
                    </span>
                    {entry.changedByName && (
                      <><span className="text-gray-300">·</span><span className="text-gray-500 text-xs">{entry.changedByName}</span></>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Oplossing */}
        <section className="mb-8 pt-6 border-t border-gray-200">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Oplossing</h2>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm mb-5">
            <ReportField label="Soort dispositie"  value={ncr.dispositionType} />
            <ReportField label="Opgelost door"     value={ncr.resolvedBy} />
          </div>
          {ncr.solution && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Oplossing</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{ncr.solution}</p>
            </div>
          )}
        </section>

        {/* Bijlages */}
        {attachments.length > 0 && (
          <section className="pt-6 border-t border-gray-200">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Bijlages ({attachments.length})
            </h2>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-4 mb-4">
                {images.map((att) => (
                  <div key={att.id} className="flex flex-col items-center gap-1.5">
                    <img
                      src={att.fileUrl}
                      alt={att.fileName}
                      className="w-40 h-40 object-cover rounded-lg border border-gray-200"
                    />
                    <span className="text-xs text-gray-400 truncate max-w-[160px] text-center">{att.fileName}</span>
                  </div>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((att) => (
                  <li key={att.id} className="flex items-center gap-2 text-sm text-gray-600">
                    <Paperclip size={12} className="text-gray-400 shrink-0" />
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {att.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Voettekst */}
        <div className="mt-12 pt-4 border-t border-gray-200 text-xs text-red-600 space-y-3">
          <p>Proprietary data of and copyright by Dutch-Shape&nbsp;&nbsp;B.V. Disclosure to third parties of this document or any part thereof, the content of this document or the use of any information contained therein for purposes other than provided for by this document, is not permitted, except with prior and express written permission.</p>
          <p>Any copy outside the Dutch-Shape BMS (printed or digital) is not controlled</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface NcrFormProps {
  initial?: Partial<NcrRegistration>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  onStartPreventief?: (data: { ncrId: string; productionOrder: string | null; itemRef: string | null; itemName: string | null }) => void
  loading: boolean
}

function NcrForm({ initial = {}, onSave, onClose, onStartPreventief, loading }: NcrFormProps) {
  const isEdit = !!initial.id
  const currentUser = getLoggedInUser()
  const isPrivileged = ['admin', 'quality'].includes(currentUser?.role ?? '')
  const isLocked = ['gesloten'].includes(initial.status ?? '') && !isPrivileged
  const availableStatuses = isPrivileged
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((o) => !['vervallen', 'gesloten'].includes(o.value))

  const { data: nextIdData } = useQuery<{ ncrId: string }>({
    queryKey: ['ncr-next-id'],
    queryFn: () => apiFetch('/kiosk/ncr/next-id'),
    enabled: !isEdit,
    staleTime: 0,
  })

  const { data: employeeList = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ['kiosk-employees'],
    queryFn: () => apiFetch('/kiosk/employees', { skipAuth: true } as never),
    staleTime: 5 * 60 * 1000,
  })
  const peEmployees = employeeList.filter((e) =>
    ['productie_engineer', 'projectmanager'].includes(e.role),
  )

  const { data: statusLog = [] } = useQuery<StatusLogEntry[]>({
    queryKey: ['ncr-status-log', initial.id],
    queryFn: () => apiFetch(`/kiosk/ncr/${initial.id}/status-log`),
    enabled: !!initial.id,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  })

  const [tab, setTab] = useState<Tab>('afwijking')
  const [showReport, setShowReport] = useState(false)
  const [showResolvedByPicker, setShowResolvedByPicker] = useState(false)
  const [showPePicker, setShowPePicker] = useState(false)
  const [form, setForm] = useState({
    productionOrder:    initial.productionOrder    ?? '',
    itemRef:            initial.itemRef            ?? '',
    itemName:           initial.itemName           ?? '',
    productionStep:     initial.productionStep     ?? '',
    writtenByName:      initial.writtenByName      ?? currentUser?.name ?? '',
    writtenByDepartment: initial.writtenByDepartment ?? '',
    causingDepartment:  initial.causingDepartment  ?? '',
    faultCode:          initial.faultCode          ?? '',
    causeCode:          initial.causeCode          ?? '',
    shortDescription:   initial.shortDescription   ?? '',
    description:        initial.description        ?? '',
    measureRequired:    initial.measureRequired     ?? null as boolean | null,
    peEmail:            initial.peEmail            ?? '',
    assignedToId:       initial.assignedToId       ?? '',
    solution:           initial.solution           ?? '',
    dispositionType:    initial.dispositionType    ?? '',
    resolvedBy:         initial.resolvedBy         ?? '',
    status:             (initial.status            ?? 'open') as NcrStatus,
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    onSave({
      productionOrder:     form.productionOrder     || null,
      itemRef:             form.itemRef             || null,
      itemName:            form.itemName            || null,
      productionStep:      form.productionStep      || null,
      writtenByName:       form.writtenByName       || null,
      writtenByDepartment: form.writtenByDepartment || null,
      causingDepartment:   form.causingDepartment   || null,
      faultCode:           form.faultCode           || null,
      causeCode:           form.causeCode           || null,
      shortDescription:    form.shortDescription    || null,
      description:         form.description         || null,
      measureRequired:     form.measureRequired,
      peEmail:             form.peEmail             || null,
      assignedToId:        form.assignedToId        || null,
      solution:            form.solution            || null,
      dispositionType:     form.dispositionType     || null,
      resolvedBy:          form.resolvedBy          || null,
      status:              form.status,
      createdById:         currentUser?.id          || null,
    })
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'afwijking', label: 'Afwijking',  icon: null },
    { key: 'oplossing', label: 'Oplossing',  icon: <Lightbulb size={13} /> },
    { key: 'bijlages',  label: 'Bijlages',   icon: <Paperclip size={13} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-h-[96vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-gray-400">{isEdit ? initial.ncrId : 'Nieuw NCR'}</span>
            {isEdit && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                colMeta(initial.status ?? 'open').badge,
              )}>
                {STATUS_OPTIONS.find((s) => s.value === initial.status)?.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
              >
                <Printer size={13} /> Rapport
              </button>
            )}
            {!isLocked && (
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                {loading ? 'Opslaan...' : 'Opslaan'}
              </button>
            )}
            <button onClick={onClose} className="ml-1 text-gray-400 hover:text-gray-600 p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === t.key
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Afgesloten banner */}
        {isLocked && (
          <div className="mx-6 mt-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 shrink-0">
            Dit NCR is afgesloten. Alleen Beheerder of Kwaliteit kan velden aanpassen.
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Afwijking tab ── */}
          {tab === 'afwijking' && (
            <div className="p-6">
              <div className="grid grid-cols-3 gap-x-8 gap-y-5">

                {/* Linker kolom — identificatie + uitschrijver */}
                <div className="col-span-2 space-y-5">

                  {/* Rij 1: ID + datum */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Afwijking ID</FieldLabel>
                      <TextInput
                        value={isEdit ? (initial.ncrId ?? '') : (nextIdData?.ncrId ?? '…')}
                        readOnly
                      />
                    </div>
                    <div>
                      <FieldLabel>Datum aangemaakt</FieldLabel>
                      <TextInput
                        value={isEdit ? formatDate(initial.createdAt ?? '') : formatDate(new Date().toISOString())}
                        readOnly
                      />
                    </div>
                  </div>

                  {/* Rij 2: order + ref + naam */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <FieldLabel>Productie order</FieldLabel>
                      <TextInput value={form.productionOrder} onChange={(v) => set('productionOrder', v)} placeholder="bijv. 2548063" disabled={isLocked} />
                    </div>
                    <div>
                      <FieldLabel>Artikel</FieldLabel>
                      <TextInput value={form.itemRef} onChange={(v) => set('itemRef', v)} placeholder="bijv. 24074-13AB-07" disabled={isLocked} />
                    </div>
                    <div>
                      <FieldLabel>Omschrijving</FieldLabel>
                      <TextInput value={form.itemName} onChange={(v) => set('itemName', v)} placeholder="bijv. top plate section" disabled={isLocked} />
                    </div>
                  </div>

                  {/* Rij 3: productie stap */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <FieldLabel>Productie stap</FieldLabel>
                      <TextInput value={form.productionStep} onChange={(v) => set('productionStep', v)} disabled={isLocked} />
                    </div>
                  </div>

                  {/* Rij 4: uitschrijver + afdeling */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Uitschrijver</FieldLabel>
                      <TextInput value={form.writtenByName} readOnly />
                    </div>
                    <div>
                      <FieldLabel>Afdeling uitschrijver</FieldLabel>
                      <SelectInput
                        value={form.writtenByDepartment}
                        onChange={(v) => set('writtenByDepartment', v)}
                        options={DEPARTMENTS}
                        disabled={isLocked}
                      />
                    </div>
                  </div>

                  {/* Rij 5: veroorzakende afdeling */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Veroorzakende afdeling</FieldLabel>
                      <SelectInput
                        value={form.causingDepartment}
                        onChange={(v) => set('causingDepartment', v)}
                        options={DEPARTMENTS}
                        disabled={isLocked}
                      />
                    </div>
                  </div>

                  {/* Rij 6: fout code + oorzaak code */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Fout code</FieldLabel>
                      <SelectInput
                        value={form.faultCode}
                        onChange={(v) => set('faultCode', v)}
                        options={FAULT_CODES}
                        disabled={isLocked}
                      />
                    </div>
                    <div>
                      <FieldLabel>Oorzaak foutcode</FieldLabel>
                      <SelectInput
                        value={form.causeCode}
                        onChange={(v) => set('causeCode', v)}
                        options={CAUSE_CODES}
                        disabled={isLocked}
                      />
                    </div>
                  </div>

                  {/* Rij 7: korte omschrijving */}
                  <div>
                    <FieldLabel>Korte omschrijving</FieldLabel>
                    <TextInput value={form.shortDescription} onChange={(v) => set('shortDescription', v)} disabled={isLocked} />
                  </div>

                  {/* Rij 8: omschrijving */}
                  <div>
                    <FieldLabel>Omschrijving</FieldLabel>
                    <textarea
                      value={form.description}
                      onChange={isLocked ? undefined : (e) => set('description', e.target.value)}
                      readOnly={isLocked}
                      disabled={isLocked}
                      rows={4}
                      className={cn(
                        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none',
                        isLocked && 'bg-gray-50 text-gray-500 cursor-default',
                      )}
                    />
                  </div>
                </div>

                {/* Rechter kolom — status + PE + maatregel */}
                <div className="space-y-5">

                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <select
                      value={form.status}
                      disabled={isLocked}
                      onChange={isLocked ? undefined : (e) => set('status', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white',
                        isLocked && 'bg-gray-50 text-gray-500 cursor-default',
                      )}
                    >
                      {availableStatuses.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <FieldLabel>Verantwoordelijke (PE / PM)</FieldLabel>
                    {(() => {
                      const selected = peEmployees.find((e) => e.id === form.assignedToId)
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => !isLocked && setShowPePicker(true)}
                            className={cn(
                              'flex-1 text-left px-3 py-2 border border-gray-200 rounded-lg text-sm transition-colors',
                              isLocked
                                ? 'bg-gray-50 text-gray-500 cursor-default'
                                : selected
                                  ? 'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100'
                                  : 'bg-white text-gray-400 hover:bg-gray-50',
                            )}
                          >
                            {selected ? selected.name : '— Selecteer —'}
                          </button>
                          {selected && !isLocked && (
                            <button
                              type="button"
                              onClick={() => set('assignedToId', '')}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                              title="Verwijder koppeling"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      )
                    })()}
                    {showPePicker && (
                      <EmployeePickerModal
                        employees={peEmployees}
                        selected={form.assignedToId || null}
                        title="Selecteer Verantwoordelijke (PE / PM)"
                        onSelect={(emp) => { set('assignedToId', emp.id); setShowPePicker(false) }}
                        onClose={() => setShowPePicker(false)}
                      />
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <FieldLabel>Maatregel nodig</FieldLabel>
                    <div className="flex gap-4 mt-1">
                      {[
                        { label: 'Ja', value: true },
                        { label: 'Nee', value: false },
                      ].map(({ label, value }) => (
                        <label key={label} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="measureRequired"
                            checked={form.measureRequired === value}
                            onChange={() => !isLocked && set('measureRequired', value)}
                            disabled={isLocked}
                            className="accent-teal-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {form.measureRequired === true && isEdit && (
                      <button
                        type="button"
                        onClick={() => onStartPreventief?.({
                          ncrId: initial.ncrId ?? '',
                          productionOrder: form.productionOrder || null,
                          itemRef: form.itemRef || null,
                          itemName: form.itemName || null,
                        })}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-teal-300 text-teal-600 rounded-lg hover:bg-teal-50 transition-colors"
                      >
                        <ShieldCheck size={14} /> Start preventieve maatregel
                      </button>
                    )}
                  </div>

                  {/* Status log */}
                  {isEdit && (
                    <div className="border-t border-gray-100 pt-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Statushistorie</p>
                      {statusLog.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Geen statuswijzigingen geregistreerd</p>
                      ) : (
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
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Oplossing tab ── */}
          {tab === 'oplossing' && (
            <div className="p-6">
              <div className="grid grid-cols-3 gap-x-8 gap-y-5">

                {/* Linker kolom */}
                <div className="col-span-2 space-y-5">
                  <div>
                    <FieldLabel>Oplossing</FieldLabel>
                    <textarea
                      value={form.solution}
                      onChange={isLocked ? undefined : (e) => set('solution', e.target.value)}
                      readOnly={isLocked}
                      disabled={isLocked}
                      rows={6}
                      className={cn(
                        'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none',
                        isLocked && 'bg-gray-50 text-gray-500 cursor-default',
                      )}
                    />
                  </div>

                  <div>
                    <FieldLabel>Opgelost door</FieldLabel>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => !isLocked && setShowResolvedByPicker(true)}
                      className={cn(
                        'w-full px-3 py-2 border rounded-lg text-sm text-left transition-colors',
                        isLocked
                          ? 'bg-gray-50 text-gray-500 border-gray-200 cursor-default'
                          : form.resolvedBy
                            ? 'border-gray-200 text-gray-700 hover:border-teal-300'
                            : 'border-dashed border-gray-300 text-gray-400 hover:border-teal-400',
                      )}
                    >
                      {form.resolvedBy || '— Selecteer medewerker —'}
                    </button>
                  </div>
                </div>

                {/* Rechter kolom */}
                <div className="space-y-5">
                  <div>
                    <FieldLabel>Soort dispositie</FieldLabel>
                    <div className={cn('border border-gray-200 rounded-lg overflow-hidden', isLocked && 'opacity-60')}>
                      {DISPOSITION_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          disabled={isLocked}
                          onClick={isLocked ? undefined : () => set('dispositionType', form.dispositionType === type ? '' : type)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors',
                            form.dispositionType === type
                              ? 'bg-teal-50 text-teal-700 font-medium'
                              : 'hover:bg-gray-50 text-gray-700',
                            isLocked && 'cursor-default',
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* ── Bijlages tab ── */}
          {tab === 'bijlages' && initial.id && (
            <NcrBijlagesTab ncrId={initial.id} />
          )}
          {tab === 'bijlages' && !initial.id && (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Sla het NCR eerst op om bijlages toe te voegen
            </div>
          )}
        </div>
      </div>

      {/* Rapport modal */}
      {showReport && (
        <NcrReportModal ncr={{ ...initial, ...form } as Partial<NcrRegistration>} onClose={() => setShowReport(false)} />
      )}

      {/* Opgelost door picker */}
      {showResolvedByPicker && (
        <EmployeePickerModal
          employees={employeeList}
          selected={employeeList.find((e) => e.name === form.resolvedBy)?.id ?? null}
          title="Opgelost door"
          onSelect={(emp) => set('resolvedBy', emp.name)}
          onClose={() => setShowResolvedByPicker(false)}
        />
      )}
    </div>
  )
}

// ── NCR Kaart ─────────────────────────────────────────────────────────────

interface NcrCardProps {
  ncr: NcrRegistration
  onClick: () => void
}

function NcrCard({ ncr, onClick }: NcrCardProps) {
  const meta = colMeta(ncr.status)
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-100 border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer',
        meta.border,
      )}
      onClick={onClick}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="text-xs font-bold text-gray-700 font-mono">{ncr.ncrId}</span>
          <span className="text-xs text-gray-400 shrink-0">{formatDate(ncr.createdAt)}</span>
        </div>
        {(ncr.faultCode || ncr.causeCode) && (
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {ncr.faultCode}{ncr.faultCode && ncr.causeCode ? ' · ' : ''}{ncr.causeCode}
          </p>
        )}
        <div className="space-y-0.5">
          {ncr.productionOrder && (
            <p className="text-xs text-gray-500"><span className="text-gray-400">Order </span>{ncr.productionOrder}</p>
          )}
          {ncr.itemRef && (
            <p className="text-xs text-gray-500"><span className="text-gray-400">Ref </span>{ncr.itemRef}</p>
          )}
          {ncr.shortDescription && (
            <p className="text-xs text-gray-400 truncate mt-1 italic">{ncr.shortDescription}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end px-3 pb-2">
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </div>
  )
}

// ── NCR Content ────────────────────────────────────────────────────────────

interface NCRContentProps {
  initialNcr?: Partial<NcrRegistration> | null
  onPendingConsumed?: () => void
  onStartPreventief?: (data: { ncrId: string; productionOrder: string | null; itemRef: string | null; itemName: string | null }) => void
}

export function NCRContent({ initialNcr, onPendingConsumed, onStartPreventief }: NCRContentProps = {}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Partial<NcrRegistration> | null>(null)
  const [showVervallen, setShowVervallen] = useState(false)

  // Open modal direct wanneer we vanuit "Mijn taken" navigeren
  useEffect(() => {
    if (initialNcr) {
      setModal(initialNcr)
      onPendingConsumed?.()
    }
  }, [initialNcr, onPendingConsumed])

  const { data: ncrs = [] } = useQuery<NcrRegistration[]>({
    queryKey: ['ncr'],
    queryFn: () => apiFetch('/kiosk/ncr'),
  })

  const createNcr = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch('/kiosk/ncr', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ncr'] }); setModal(null) },
  })

  const updateNcr = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/kiosk/ncr/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ['ncr'] })
      qc.invalidateQueries({ queryKey: ['ncr-status-log', id] })
      setModal(null)
    },
  })

  const searchFilter = (n: NcrRegistration) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      n.ncrId.toLowerCase().includes(q) ||
      (n.productionOrder ?? '').toLowerCase().includes(q) ||
      (n.itemRef ?? '').toLowerCase().includes(q) ||
      (n.itemName ?? '').toLowerCase().includes(q) ||
      (n.faultCode ?? '').toLowerCase().includes(q) ||
      (n.causeCode ?? '').toLowerCase().includes(q)
    )
  }

  const filtered = ncrs.filter((n) => n.status !== 'vervallen').filter(searchFilter)
  const vervallenNcrs = ncrs.filter((n) => n.status === 'vervallen').filter(searchFilter)

  const handleSave = (data: Record<string, unknown>) => {
    if (modal?.id) {
      updateNcr.mutate({ id: modal.id, data })
    } else {
      createNcr.mutate(data)
    }
  }

  const isMutating = createNcr.isPending || updateNcr.isPending

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Topbalk */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoeken op ID, order, ref, oorzaak..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowVervallen((v) => !v)}
          className={cn(
            'px-3 py-2 text-sm rounded-lg border transition-colors',
            showVervallen
              ? 'border-gray-400 bg-gray-100 text-gray-700'
              : 'border-gray-200 text-gray-400 hover:text-gray-600',
          )}
        >
          {showVervallen ? 'Vervallen verbergen' : 'Toon vervallen'}
          {vervallenNcrs.length > 0 && (
            <span className="ml-1.5 text-xs font-bold bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5">
              {vervallenNcrs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} /> Nieuw NCR
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-5 gap-4 p-6 h-full">
          {COLUMNS.map((col) => {
            const cards = filtered.filter((n) => n.status === col.key)
            return (
              <div key={col.key} className="flex flex-col min-w-0 min-h-0">
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
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
                    cards.map((ncr) => (
                      <NcrCard key={ncr.id} ncr={ncr} onClick={() => setModal(ncr)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Vervallen sectie */}
      {showVervallen && vervallenNcrs.length > 0 && (
        <div className="px-6 pb-6 bg-gray-50 border-t border-gray-200 shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-3">
            Vervallen ({vervallenNcrs.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {vervallenNcrs.map((ncr) => (
              <div key={ncr.id} className="w-56">
                <NcrCard ncr={ncr} onClick={() => setModal(ncr)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <NcrForm
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
          onStartPreventief={onStartPreventief}
          loading={isMutating}
        />
      )}
    </div>
  )
}
