import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ChevronRight, AlertTriangle, Clock, Wrench, Zap, Settings, Paperclip, X, Download, Activity, Cpu, Search } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import AdminSidebar from '@/components/AdminSidebar'

// ── Types ──────────────────────────────────────────────────────────────────

interface Machine {
  id: string
  machineId: string | null
  name: string
  category: string
  manufacturer: string | null
  isActive: boolean
  photoUrl: string | null
  createdAt: string
}

interface MachineDetail extends Machine {
  model: string | null
  serialNumber: string | null
  yearOfPurchase: number | null
  weightKg: string | null
  notes: string | null
  photoUrl: string | null
  electricKva: string | null
  electricKw: string | null
  electricAmpere: string | null
  electricFuse: string | null
  electricCableLength: string | null
  electricWireDiameter: string | null
  cncController: string | null
  cncIpAddress: string | null
  cncCamName: string | null
  cncMaxTools: number | null
  cncMaxLength: string | null
  cncMaxDiameter: string | null
  cncSpindleInterface: string | null
  cncNcVersion: string | null
  cncPlcVersion: string | null
  toolTableFormat: string | null
  postprocessor: string | null
  spindleHours: string | null
  supplierEmail: string | null
  supplierPhone: string | null
  maintenanceEmail1: string | null
  maintenancePhone1: string | null
  maintenanceEmail2: string | null
  maintenancePhone2: string | null
}

interface MaintenanceTask {
  id: string
  machineId: string
  machineName?: string
  machineCategory?: string
  title: string
  description: string | null
  status: 'gepland' | 'bezig' | 'gereed' | 'uitgesteld'
  priority: 'laag' | 'normaal' | 'hoog' | 'kritiek'
  scheduledDate: string | null
  completedDate: string | null
  interval: 'wekelijks' | 'maandelijks' | 'kwartaal' | 'halfjaar' | 'jaarlijks' | null
  logType: MaintenanceLogType | null
  assignedToName: string | null
  createdAt: string
}

const INTERVAL_OPTIONS = [
  { value: '', label: 'Geen interval' },
  { value: 'wekelijks', label: 'Wekelijks' },
  { value: 'maandelijks', label: 'Maandelijks' },
  { value: 'kwartaal', label: 'Per kwartaal' },
  { value: 'halfjaar', label: 'Halfjaarlijks' },
  { value: 'jaarlijks', label: 'Jaarlijks' },
] as const

interface Breakdown {
  id: string
  machineId: string
  machineName?: string
  machineCategory?: string
  title: string
  description: string | null
  status: 'gemeld' | 'in_behandeling' | 'opgelost'
  priority: 'laag' | 'normaal' | 'hoog' | 'kritiek'
  reportedAt: string
  reportedByName: string | null
  resolvedAt: string | null
  resolution: string | null
  resolvedByType: 'intern' | 'extern' | null
  resolvedByName: string | null
  werkbonUrl: string | null
  werkbonFileName: string | null
  createdAt: string
}

interface BreakdownAttachment {
  id: string
  breakdownId: string
  fileUrl: string
  fileName: string
  mimeType: string | null
  createdAt: string
}

interface ServiceVisit {
  id: string
  machineId: string
  visitDate: string
  serviceType: 'intern' | 'extern'
  performedBy: string
  description: string | null
  createdAt: string
}

interface ServiceContract {
  id: string
  machineId: string
  contractNumber: string | null
  supplier: string
  startDate: string | null
  endDate: string | null
  costPerYear: string | null
  description: string | null
  fileUrl: string | null
  fileName: string | null
  createdAt: string
}

interface MachineDocument {
  id: string
  machineId: string
  documentType: 'handleiding' | 'certificaat' | 'tekening' | 'schema' | 'overig'
  title: string
  fileUrl: string
  fileName: string
  mimeType: string | null
  createdAt: string
}

interface MachineInvoice {
  id: string
  machineId: string
  fileUrl: string
  fileName: string
  createdAt: string
}

const MAINTENANCE_LOG_TYPES = [
  { key: 'spindel_uren',     label: 'Spindel uur registratie' },
  { key: 'spindel_koeling',  label: 'Spindelkoeling' },
  { key: 'las_uren',         label: 'Las uren' },
  { key: 'centrale_smering', label: 'Centrale smering' },
  { key: 'spindel_smering',  label: 'Spindelsmering' },
  { key: 'koelwater',        label: 'Koelwater' },
  { key: 'hydroliek_32',     label: 'Hydroliek 32' },
  { key: 'meetdata',         label: 'Meetdata' },
] as const

type MaintenanceLogType = typeof MAINTENANCE_LOG_TYPES[number]['key']

interface MaintenanceLog {
  id: string
  type: MaintenanceLogType
  registeredByName: string
  year: number
  weekNumber: number
  spindleHours: string | null
  lasValueA: string | null
  lasValueB: string | null
  bijgevuld: boolean | null
  vervangen: boolean | null
  afvoerGeleegd: boolean | null
  percentage: string | null
  fileUrl: string | null
  fileName: string | null
  createdAt: string
}

interface MaintenanceAttachment {
  id: string
  maintenanceTaskId: string
  fileUrl: string
  fileName: string
  mimeType: string | null
  createdAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_MAINTENANCE: Record<string, { label: string; color: string }> = {
  gepland: { label: 'Gepland', color: 'bg-blue-100 text-blue-700' },
  bezig: { label: 'Bezig', color: 'bg-yellow-100 text-yellow-700' },
  gereed: { label: 'Gereed', color: 'bg-green-100 text-green-700' },
  uitgesteld: { label: 'Uitgesteld', color: 'bg-gray-100 text-gray-600' },
}

const STATUS_BREAKDOWN: Record<string, { label: string; color: string }> = {
  gemeld: { label: 'Gemeld', color: 'bg-red-100 text-red-700' },
  in_behandeling: { label: 'In behandeling', color: 'bg-orange-100 text-orange-700' },
  opgelost: { label: 'Opgelost', color: 'bg-green-100 text-green-700' },
}

const PRIORITY_COLOR: Record<string, string> = {
  laag: 'bg-gray-100 text-gray-500',
  normaal: 'bg-blue-50 text-blue-600',
  hoog: 'bg-orange-100 text-orange-600',
  kritiek: 'bg-red-100 text-red-700',
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', color)}>{label}</span>
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getLoggedInName(): string {
  try {
    const token = localStorage.getItem('employee_token') ?? localStorage.getItem('mes_admin_token')
    if (!token) return 'Onbekend'
    const p = JSON.parse(atob(token.split('.')[1]))
    return p.name ?? p.username ?? 'Onbekend'
  } catch { return 'Onbekend' }
}

function getLoggedInId(): string | null {
  try {
    const token = localStorage.getItem('employee_token') ?? localStorage.getItem('mes_admin_token')
    if (!token) return null
    const p = JSON.parse(atob(token.split('.')[1]))
    return p.employeeId ?? p.userId ?? null
  } catch { return null }
}

// ── Machine form modal ─────────────────────────────────────────────────────

const CATEGORIES = [
  'Freesmachine', 'Draaibank', 'Zaagmachine', 'Lasapparaat', 'Boormachine',
  'Ponsknipmachine', 'Kantpers', 'Slijpmachine',
  'Meetapparaat', '3D-meetapparaat',
  'Overig',
]

interface MachineFormProps {
  initial?: Partial<MachineDetail>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
  error?: string | null
}

function MachineForm({ initial = {}, onSave, onClose, loading, error }: MachineFormProps) {
  const [form, setForm] = useState({
    machineId: initial.machineId ?? '',
    name: initial.name ?? '',
    category: initial.category ?? CATEGORIES[0],
    manufacturer: initial.manufacturer ?? '',
    model: initial.model ?? '',
    serialNumber: initial.serialNumber ?? '',
    yearOfPurchase: initial.yearOfPurchase?.toString() ?? '',
    weightKg: initial.weightKg ?? '',
    notes: initial.notes ?? '',
    photoUrl: initial.photoUrl ?? '',
    electricKva: initial.electricKva ?? '',
    electricKw: initial.electricKw ?? '',
    electricAmpere: initial.electricAmpere ?? '',
    electricFuse: initial.electricFuse ?? '',
    electricCableLength: initial.electricCableLength ?? '',
    electricWireDiameter: initial.electricWireDiameter ?? '',
    cncController: initial.cncController ?? '',
    cncIpAddress: initial.cncIpAddress ?? '',
    cncCamName: initial.cncCamName ?? '',
    cncMaxTools: initial.cncMaxTools?.toString() ?? '',
    cncMaxLength: initial.cncMaxLength ?? '',
    cncMaxDiameter: initial.cncMaxDiameter ?? '',
    cncSpindleInterface: initial.cncSpindleInterface ?? '',
    cncNcVersion: initial.cncNcVersion ?? '',
    cncPlcVersion: initial.cncPlcVersion ?? '',
    toolTableFormat: initial.toolTableFormat ?? '',
    postprocessor: initial.postprocessor ?? '',
    supplierEmail: initial.supplierEmail ?? '',
    supplierPhone: initial.supplierPhone ?? '',
    maintenanceEmail1: initial.maintenanceEmail1 ?? '',
    maintenancePhone1: initial.maintenancePhone1 ?? '',
    maintenanceEmail2: initial.maintenanceEmail2 ?? '',
    maintenancePhone2: initial.maintenancePhone2 ?? '',
  })
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const formRef = useRef<{ current: typeof form }>({ current: form })
  formRef.current = { current: form }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ photoUrl: string }>('/admin/machines/photo-upload', { method: 'POST', body: fd })
      setForm((f) => ({ ...f, photoUrl: res.photoUrl }))
      // Bij bestaande machine: direct opslaan zodat de foto zichtbaar is in de lijst
      if (initial.id) {
        onSave({ ...formRef.current.current, photoUrl: res.photoUrl,
          yearOfPurchase: formRef.current.current.yearOfPurchase ? parseInt(formRef.current.current.yearOfPurchase) : null,
          cncMaxTools: formRef.current.current.cncMaxTools ? parseInt(formRef.current.current.cncMaxTools) : null,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      alert(`Foto upload mislukt: ${msg}`)
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Ctrl+V paste — document-level zodat het werkt ongeacht welk element focus heeft
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find(item => item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) { e.preventDefault(); handlePhotoUpload(file) }
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...form,
      photoUrl: form.photoUrl || null,
      yearOfPurchase: form.yearOfPurchase ? parseInt(form.yearOfPurchase) : null,
      cncMaxTools: form.cncMaxTools ? parseInt(form.cncMaxTools) : null,
    })
  }

  const field = (label: string, key: string, type: 'text' | 'number' | 'textarea' = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={form[key as keyof typeof form]}
          onChange={(e) => set(key, e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
        />
      ) : (
        <input
          type={type}
          value={form[key as keyof typeof form]}
          onChange={(e) => set(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial.id ? 'Machine bewerken' : 'Nieuwe machine'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Foto */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Foto</label>
            {form.photoUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50">
                  <img src={form.photoUrl} className="block w-full h-full object-contain" />
                </div>
                <button type="button" onClick={() => setForm((f) => ({ ...f, photoUrl: '' }))}
                  className="text-xs text-red-500 hover:underline">Verwijderen</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600">
                  {uploadingPhoto ? 'Bezig...' : 'Foto kiezen'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
                </label>
                <span className="text-xs text-gray-400">of Ctrl+V om te plakken</span>
              </div>
            )}
          </div>
          {/* Basisgegevens */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Basisgegevens</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Machine ID</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={form.machineId}
                    onChange={(e) => set('machineId', e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => set('machineId', 'M-' + String(Math.floor(100000 + Math.random() * 900000)))}
                    className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg whitespace-nowrap transition-colors"
                    title="Genereer uniek ID"
                  >
                    Genereer
                  </button>
                </div>
              </div>
              {field('Naam *', 'name')}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Categorie *</label>
                <select
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              {field('Fabrikant', 'manufacturer')}
              {field('Type / Model', 'model')}
              {field('Serienummer', 'serialNumber')}
              {field('Aanschafjaar', 'yearOfPurchase', 'number')}
              {field('Gewicht (kg)', 'weightKg')}
            </div>
          </div>

          {/* Leverancier contact */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Leverancier</h3>
            <div className="grid grid-cols-2 gap-3">
              {field('E-mailadres leverancier', 'supplierEmail')}
              {field('Telefoonnummer leverancier', 'supplierPhone')}
            </div>
          </div>

          {/* Onderhoud fabrikant contact */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Onderhoud fabrikant</h3>
            <div className="grid grid-cols-2 gap-3">
              {field('(1) E-mailadres', 'maintenanceEmail1')}
              {field('(1) Telefoonnummer', 'maintenancePhone1')}
              {field('(2) E-mailadres', 'maintenanceEmail2')}
              {field('(2) Telefoonnummer', 'maintenancePhone2')}
            </div>
          </div>

          {/* Algemene info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Algemene info</h3>
            {field('Notities / instructies', 'notes', 'textarea')}
          </div>

          {/* Elektrische aansluiting */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Elektrische aansluiting</h3>
            <div className="grid grid-cols-3 gap-3">
              {field('KVA', 'electricKva')}
              {field('KW', 'electricKw')}
              {field('Ampere', 'electricAmpere')}
              {field('Zekering', 'electricFuse')}
              {field('Kabellengte (m)', 'electricCableLength')}
              {field('Draaddiameter', 'electricWireDiameter')}
            </div>
          </div>

          {/* CNC configuratie */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">CNC configuratie</h3>
            <div className="grid grid-cols-2 gap-3">
              {field('Machine besturing', 'cncController')}
              {field('IP adres', 'cncIpAddress')}
              {field('CAM naam', 'cncCamName')}
              {field('Max tools', 'cncMaxTools', 'number')}
              {field('Max lengte (mm)', 'cncMaxLength')}
              {field('Max diameter (mm)', 'cncMaxDiameter')}
              {field('Spindel interface', 'cncSpindleInterface')}
              {field('NC versie', 'cncNcVersion')}
              {field('PLC versie', 'cncPlcVersion')}
              <div>
                <label className="block text-xs text-gray-500 mb-1">TOOL.T formaat</label>
                <select
                  value={form.toolTableFormat}
                  onChange={(e) => set('toolTableFormat', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Standaard Heidenhain</option>
                  <option value="fooke">Fooke</option>
                  <option value="ronin">Ronin</option>
                  <option value="3200">3200</option>
                  <option value="portaal">Portaal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Postprocessor</label>
                <input
                  value={form.postprocessor}
                  onChange={(e) => set('postprocessor', e.target.value)}
                  placeholder="bijv. 04-MTE_BF4200_iTNC530"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuleren
            </button>
            <button
              type="submit"
              disabled={loading || !form.name}
              className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors"
            >
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Maintenance form modal ─────────────────────────────────────────────────

interface MaintenanceFormProps {
  machineId: string
  initial?: Partial<MaintenanceTask>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
}

function MaintenanceForm({ machineId, initial = {}, onSave, onClose, loading }: MaintenanceFormProps) {
  const [form, setForm] = useState({
    title: initial.title ?? '',
    description: initial.description ?? '',
    status: initial.status ?? 'gepland',
    priority: initial.priority ?? 'normaal',
    scheduledDate: initial.scheduledDate ?? '',
    completedDate: initial.completedDate ?? '',
    interval: initial.interval ?? '',
    logType: initial.logType ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial.id ? 'Taak bewerken' : 'Onderhoudstaak toevoegen'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave({ ...form, machineId, interval: form.interval || null, logType: form.logType || null }) }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Standaard registratietype</label>
              <select value={form.logType} onChange={(e) => set('logType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">— Geen standaard —</option>
                {MAINTENANCE_LOG_TYPES.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              {form.logType && (
                <p className="text-xs text-gray-400 mt-1">Registraties openen direct met dit type vooringevuld.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Titel *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Omschrijving</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="gepland">Gepland</option>
                <option value="bezig">Bezig</option>
                <option value="gereed">Gereed</option>
                <option value="uitgesteld">Uitgesteld</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prioriteit</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="laag">Laag</option>
                <option value="normaal">Normaal</option>
                <option value="hoog">Hoog</option>
                <option value="kritiek">Kritiek</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Gepland op</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Afgerond op</label>
              <input type="date" value={form.completedDate} onChange={(e) => set('completedDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Herhalingsinterval</label>
            <select value={form.interval} onChange={(e) => set('interval', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
              {INTERVAL_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {form.interval && (
              <p className="text-xs text-gray-400 mt-1">
                Wordt automatisch teruggezet naar "Gepland" zodra het interval verstreken is na afronding.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
            <button type="submit" disabled={loading || !form.title}
              className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Breakdown form modal ───────────────────────────────────────────────────

interface BreakdownFormProps {
  machineId: string
  initial?: Partial<Breakdown>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
}

function BreakdownForm({ machineId, initial = {}, onSave, onClose, loading }: BreakdownFormProps) {
  const [form, setForm] = useState({
    title: initial.title ?? '',
    description: initial.description ?? '',
    status: initial.status ?? 'gemeld',
    priority: initial.priority ?? 'normaal',
    resolution: initial.resolution ?? '',
    resolvedByType: initial.resolvedByType ?? '',
    resolvedByName: initial.resolvedByName ?? '',
    werkbonUrl: initial.werkbonUrl ?? '',
    werkbonFileName: initial.werkbonFileName ?? '',
  })
  const [werkbonUploading, setWerkbonUploading] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleWerkbonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setWerkbonUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ fileUrl: string; fileName: string }>(
        '/admin/breakdowns/werkbon-upload',
        { method: 'POST', body: fd }
      )
      setForm(f => ({ ...f, werkbonUrl: res.fileUrl, werkbonFileName: res.fileName }))
    } finally {
      setWerkbonUploading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial.id ? 'Storing bewerken' : 'Storing melden'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave({ ...form, machineId, resolvedByType: form.resolvedByType || null, resolvedByName: form.resolvedByName || null, werkbonUrl: form.werkbonUrl || null, werkbonFileName: form.werkbonFileName || null }) }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Titel *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                <option value="gemeld">Gemeld</option>
                <option value="in_behandeling">In behandeling</option>
                <option value="opgelost">Opgelost</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prioriteit</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={inputCls}>
                <option value="laag">Laag</option>
                <option value="normaal">Normaal</option>
                <option value="hoog">Hoog</option>
                <option value="kritiek">Kritiek</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Omschrijving</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
              className={cn(inputCls, 'resize-none')} />
          </div>
          {form.status === 'opgelost' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Oplossing omschrijving</label>
                <textarea value={form.resolution} onChange={(e) => set('resolution', e.target.value)} rows={3}
                  className={cn(inputCls, 'resize-none')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Opgelost door</label>
                <div className="flex gap-2">
                  {(['intern', 'extern'] as const).map((type) => (
                    <button key={type} type="button"
                      onClick={() => set('resolvedByType', form.resolvedByType === type ? '' : type)}
                      className={cn('flex-1 py-2 rounded-lg text-sm border transition-colors capitalize',
                        form.resolvedByType === type ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Naam persoon / bedrijf</label>
                <input value={form.resolvedByName} onChange={(e) => set('resolvedByName', e.target.value)} className={inputCls} placeholder="bijv. Jan de Vries of Siemens Service" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Werkbon</label>
                <input type="file" onChange={handleWerkbonUpload} disabled={werkbonUploading}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
                {werkbonUploading && <p className="text-xs text-gray-400 mt-1">Uploaden...</p>}
                {form.werkbonFileName && !werkbonUploading && (
                  <p className="text-xs text-teal-600 mt-1">✓ {form.werkbonFileName}</p>
                )}
              </div>
            </>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
            <button type="submit" disabled={loading || !form.title}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Specifiek onderhoud form ───────────────────────────────────────────────

interface SpecificMaintenanceFormProps {
  type: MaintenanceLogType
  initial?: Partial<MaintenanceLog>
  registeredByName: string
  registeredById: string | null
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
  error?: string | null
}

function SpecificMaintenanceForm({ type, initial, registeredByName, registeredById, onSave, onClose, loading, error }: SpecificMaintenanceFormProps) {
  const now = new Date()
  const [year, setYear] = useState(initial?.year ?? now.getFullYear())
  const [weekNumber, setWeekNumber] = useState(initial?.weekNumber ?? getISOWeek(now))
  const [spindleHours, setSpindleHours] = useState(initial?.spindleHours ?? '')
  const [lasValueA, setLasValueA] = useState(initial?.lasValueA ?? '')
  const [lasValueB, setLasValueB] = useState(initial?.lasValueB ?? '')
  const [bijgevuld, setBijgevuld] = useState<boolean | null>(initial?.bijgevuld ?? null)
  const [vervangen, setVervangen] = useState<boolean | null>(initial?.vervangen ?? null)
  const [afvoerGeleegd, setAfvoerGeleegd] = useState<boolean | null>(initial?.afvoerGeleegd ?? null)
  const [percentage, setPercentage] = useState(initial?.percentage ?? '')
  const [fileUrl, setFileUrl] = useState(initial?.fileUrl ?? '')
  const [fileName, setFileName] = useState(initial?.fileName ?? '')
  const [uploading, setUploading] = useState(false)

  const typeLabel = MAINTENANCE_LOG_TYPES.find(t => t.key === type)?.label ?? type

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ fileUrl: string; fileName: string }>(
        `/admin/maintenance-logs/upload`,
        { method: 'POST', body: fd }
      )
      setFileUrl(res.fileUrl)
      setFileName(res.fileName)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      type,
      registeredByName,
      registeredById,
      year,
      weekNumber,
      spindleHours: spindleHours || null,
      lasValueA: lasValueA || null,
      lasValueB: lasValueB || null,
      bijgevuld,
      vervangen,
      afvoerGeleegd,
      percentage: percentage || null,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
    })
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  const YesNo = ({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) => (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange(true)}
          className={cn('flex-1 py-2 rounded-lg text-sm border transition-colors', value === true ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
          Ja
        </button>
        <button type="button" onClick={() => onChange(false)}
          className={cn('flex-1 py-2 rounded-lg text-sm border transition-colors', value === false ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
          Nee
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{typeLabel}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Gemeenschappelijke velden */}
          <div>
            <label className={labelCls}>Geregistreerd door</label>
            <input value={registeredByName} readOnly className={cn(inputCls, 'bg-gray-50 text-gray-500 cursor-default')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Jaar</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Weeknummer</label>
              <input type="number" min={1} max={53} value={weekNumber} onChange={e => setWeekNumber(Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* Type-specifieke velden */}
          {type === 'spindel_uren' && (
            <div>
              <label className={labelCls}>Aantal uur</label>
              <input type="number" step="0.1" value={spindleHours} onChange={e => setSpindleHours(e.target.value)} className={inputCls} />
            </div>
          )}

          {type === 'spindel_koeling' && (
            <YesNo label="Bijgevuld" value={bijgevuld} onChange={setBijgevuld} />
          )}

          {type === 'las_uren' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>B waarde</label>
                <input value={lasValueB} onChange={e => setLasValueB(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>A waarde</label>
                <input value={lasValueA} onChange={e => setLasValueA(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {(type === 'centrale_smering' || type === 'spindel_smering') && (
            <YesNo label="Bijgevuld" value={bijgevuld} onChange={setBijgevuld} />
          )}

          {type === 'koelwater' && (
            <>
              <YesNo label="Bijgevuld" value={bijgevuld} onChange={setBijgevuld} />
              <YesNo label="Afvoer geleegd" value={afvoerGeleegd} onChange={setAfvoerGeleegd} />
              <div>
                <label className={labelCls}>Percentage</label>
                <input value={percentage} onChange={e => setPercentage(e.target.value)} className={inputCls} placeholder="bijv. 5%" />
              </div>
            </>
          )}

          {type === 'hydroliek_32' && (
            <>
              <YesNo label="Bijgevuld" value={bijgevuld} onChange={setBijgevuld} />
              <YesNo label="Vervangen" value={vervangen} onChange={setVervangen} />
            </>
          )}

          {type === 'meetdata' && (
            <div>
              <label className={labelCls}>Bestand</label>
              <input type="file" onChange={handleUpload} disabled={uploading}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
              {uploading && <p className="text-xs text-gray-400 mt-1">Uploaden...</p>}
              {fileName && !uploading && (
                <p className="text-xs text-teal-600 mt-1">✓ {fileName}</p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
            <button type="submit" disabled={loading || uploading}
              className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Taak portaal (registraties per taak) ──────────────────────────────────

function TaskPortal({ task, onClose, onEditTask }: { task: MaintenanceTask; onClose: () => void; onEditTask: () => void }) {
  const qc = useQueryClient()
  const [gearOpen, setGearOpen] = useState(false)
  const [logModal, setLogModal] = useState<{ type: MaintenanceLogType; log?: MaintenanceLog } | null>(null)
  const [lightbox, setLightbox] = useState<MaintenanceAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: logs = [] } = useQuery<MaintenanceLog[]>({
    queryKey: ['task-logs', task.id],
    queryFn: () => apiFetch(`/admin/maintenance/${task.id}/logs`),
  })

  const { data: attachments = [] } = useQuery<MaintenanceAttachment[]>({
    queryKey: ['task-attachments', task.id],
    queryFn: () => apiFetch(`/admin/maintenance/${task.id}/attachments`),
  })

  const saveLog = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      logModal?.log?.id
        ? apiFetch(`/admin/maintenance-logs/${logModal.log.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch(`/admin/maintenance/${task.id}/logs`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-logs', task.id] }); setLogModal(null) },
  })

  const deleteLog = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/maintenance-logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-logs', task.id] }),
  })

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/maintenance-attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-attachments', task.id] }),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/admin/maintenance/${task.id}/attachments`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['task-attachments', task.id] })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const isImage = (mime: string | null) => mime?.startsWith('image/') ?? false

  const s = STATUS_MAINTENANCE[task.status] ?? { label: task.status, color: 'bg-gray-100 text-gray-500' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl min-h-[70vh] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-800">{task.title}</h2>
              <StatusBadge label={s.label} color={s.color} />
              <StatusBadge label={task.priority} color={PRIORITY_COLOR[task.priority]} />
            </div>
            {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
            <p className="text-xs text-gray-400 mt-1">
              {task.scheduledDate ? `Gepland: ${formatDate(task.scheduledDate)}` : ''}
              {task.assignedToName ? ` · ${task.assignedToName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEditTask} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-lg" title="Taak bewerken">
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Bijlagen sectie */}
          <div className="px-6 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Bijlagen</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 text-xs rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
              >
                <Paperclip size={13} /> {uploading ? 'Uploaden...' : 'Toevoegen'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            {attachments.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nog geen bijlagen</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {attachments.map((att) => (
                  <div key={att.id} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    {isImage(att.mimeType) ? (
                      <img
                        src={att.fileUrl}
                        alt={att.fileName}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightbox(att)}
                      />
                    ) : (
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center w-full h-full p-2 hover:bg-gray-100 transition-colors"
                      >
                        <Download size={20} className="text-gray-400 mb-1" />
                        <span className="text-xs text-gray-500 text-center truncate w-full leading-tight">{att.fileName}</span>
                      </a>
                    )}
                    {/* Verwijderknop */}
                    <button
                      onClick={() => { if (confirm('Bijlage verwijderen?')) deleteAttachment.mutate(att.id) }}
                      className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 mx-6" />

          {/* Registraties header */}
          <div className="px-6 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Registraties</span>
            <div className="relative" ref={gearRef}>
              {task.logType ? (
                <button
                  onClick={() => setLogModal({ type: task.logType! })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 text-xs rounded-lg border border-gray-200 transition-colors"
                >
                  <Settings size={13} /> Registratie toevoegen
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setGearOpen(o => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 text-xs rounded-lg border border-gray-200 transition-colors"
                  >
                    <Settings size={13} /> Registratie toevoegen
                  </button>
                  {gearOpen && (
                    <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52">
                      {MAINTENANCE_LOG_TYPES.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => { setLogModal({ type: key }); setGearOpen(false) }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Registraties lijst */}
          <div className="px-6 pb-4 space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nog geen registraties</p>
            ) : (
              logs.map((log) => {
                const typeLabel = MAINTENANCE_LOG_TYPES.find(t => t.key === log.type)?.label ?? log.type
                return (
                  <div key={log.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{typeLabel}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {log.year} · wk {log.weekNumber}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{log.registeredByName}</p>
                      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {log.spindleHours != null && <span>Uren: <strong>{log.spindleHours}</strong></span>}
                        {log.bijgevuld != null && <span>Bijgevuld: <strong>{log.bijgevuld ? 'Ja' : 'Nee'}</strong></span>}
                        {log.vervangen != null && <span>Vervangen: <strong>{log.vervangen ? 'Ja' : 'Nee'}</strong></span>}
                        {log.afvoerGeleegd != null && <span>Afvoer geleegd: <strong>{log.afvoerGeleegd ? 'Ja' : 'Nee'}</strong></span>}
                        {log.percentage && <span>Percentage: <strong>{log.percentage}</strong></span>}
                        {log.lasValueB && <span>B: <strong>{log.lasValueB}</strong></span>}
                        {log.lasValueA && <span>A: <strong>{log.lasValueA}</strong></span>}
                        {log.fileName && (
                          <a href={log.fileUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                            {log.fileName}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setLogModal({ type: log.type, log })} className="p-1 text-gray-400 hover:text-teal-600 rounded">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => { if (confirm('Registratie verwijderen?')) deleteLog.mutate(log.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 p-2 text-white hover:text-gray-300" onClick={() => setLightbox(null)}>
            <X size={24} />
          </button>
          <img
            src={lightbox.fileUrl}
            alt={lightbox.fileName}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-white text-sm opacity-70">{lightbox.fileName}</p>
        </div>
      )}

      {logModal && (
        <SpecificMaintenanceForm
          type={logModal.type}
          initial={logModal.log}
          registeredByName={getLoggedInName()}
          registeredById={getLoggedInId()}
          onSave={(d) => saveLog.mutate(d)}
          onClose={() => { setLogModal(null); saveLog.reset() }}
          loading={saveLog.isPending}
          error={saveLog.error?.message}
        />
      )}
    </div>
  )
}

// ── Storing portaal ───────────────────────────────────────────────────────

function BreakdownPortal({ breakdown, onClose, onEditBreakdown }: { breakdown: Breakdown; onClose: () => void; onEditBreakdown: () => void }) {
  const qc = useQueryClient()
  const [lightbox, setLightbox] = useState<BreakdownAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: attachments = [] } = useQuery<BreakdownAttachment[]>({
    queryKey: ['breakdown-attachments', breakdown.id],
    queryFn: () => apiFetch(`/admin/breakdowns/${breakdown.id}/attachments`),
  })

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/breakdown-attachments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakdown-attachments', breakdown.id] }),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/admin/breakdowns/${breakdown.id}/attachments`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['breakdown-attachments', breakdown.id] })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isImage = (mime: string | null) => mime?.startsWith('image/') ?? false
  const s = STATUS_BREAKDOWN[breakdown.status] ?? { label: breakdown.status, color: 'bg-gray-100 text-gray-500' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl min-h-[70vh] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-800">{breakdown.title}</h2>
              <StatusBadge label={s.label} color={s.color} />
              <StatusBadge label={breakdown.priority} color={PRIORITY_COLOR[breakdown.priority]} />
            </div>
            {breakdown.description && <p className="text-xs text-gray-500 mt-1">{breakdown.description}</p>}
            <p className="text-xs text-gray-400 mt-1">
              Gemeld: {formatDate(breakdown.reportedAt)}
              {breakdown.reportedByName ? ` · ${breakdown.reportedByName}` : ''}
            </p>
            {breakdown.status === 'opgelost' && (breakdown.resolvedByType || breakdown.resolvedByName || breakdown.werkbonFileName) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                {breakdown.resolvedByType && (
                  <span className={cn('px-2 py-0.5 rounded-full font-medium', breakdown.resolvedByType === 'intern' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-700')}>
                    {breakdown.resolvedByType === 'intern' ? 'Intern' : 'Extern'}
                  </span>
                )}
                {breakdown.resolvedByName && <span className="text-gray-600">{breakdown.resolvedByName}</span>}
                {breakdown.werkbonFileName && (
                  <a href={breakdown.werkbonUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline flex items-center gap-1">
                    <Paperclip size={11} /> {breakdown.werkbonFileName}
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEditBreakdown} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-gray-100 rounded-lg" title="Storing bewerken">
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
        </div>

        {/* Bijlagen */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Bijlagen</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 text-xs rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
            >
              <Paperclip size={13} /> {uploading ? 'Uploaden...' : 'Toevoegen'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFileUpload} />
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Nog geen bijlagen</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {attachments.map((att) => (
                <div key={att.id} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  {isImage(att.mimeType) ? (
                    <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLightbox(att)} />
                  ) : (
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center w-full h-full p-2 hover:bg-gray-100 transition-colors">
                      <Download size={20} className="text-gray-400 mb-1" />
                      <span className="text-xs text-gray-500 text-center truncate w-full leading-tight">{att.fileName}</span>
                    </a>
                  )}
                  <button
                    onClick={() => { if (confirm('Bijlage verwijderen?')) deleteAttachment.mutate(att.id) }}
                    className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 text-white hover:text-gray-300" onClick={() => setLightbox(null)}><X size={24} /></button>
          <img src={lightbox.fileUrl} alt={lightbox.fileName} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="absolute bottom-4 text-white text-sm opacity-70">{lightbox.fileName}</p>
        </div>
      )}
    </div>
  )
}

// ── Service tab ────────────────────────────────────────────────────────────

function ServiceTab({ machineId }: { machineId: string }) {
  const qc = useQueryClient()
  const [visitModal, setVisitModal] = useState<Partial<ServiceVisit> | null>(null)
  const [contractModal, setContractModal] = useState<Partial<ServiceContract> | null>(null)

  const { data: visits = [] } = useQuery<ServiceVisit[]>({
    queryKey: ['service-visits', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/service-visits`),
  })
  const { data: contracts = [] } = useQuery<ServiceContract[]>({
    queryKey: ['service-contracts', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/service-contracts`),
  })

  const saveVisit = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      visitModal?.id
        ? apiFetch(`/admin/service-visits/${visitModal.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch(`/admin/machines/${machineId}/service-visits`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-visits', machineId] }); setVisitModal(null) },
  })
  const deleteVisit = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/service-visits/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-visits', machineId] }),
  })
  const saveContract = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      contractModal?.id
        ? apiFetch(`/admin/service-contracts/${contractModal.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch(`/admin/machines/${machineId}/service-contracts`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-contracts', machineId] }); setContractModal(null) },
  })
  const deleteContract = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/service-contracts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-contracts', machineId] }),
  })

  return (
    <div className="space-y-6">
      {/* Servicebezoeken */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Servicebezoeken</h3>
          <button onClick={() => setVisitModal({})} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg transition-colors">
            <Plus size={13} /> Bezoek toevoegen
          </button>
        </div>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Geen servicebezoeken</p>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <div key={v.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{v.performedBy}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', v.serviceType === 'intern' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-700')}>
                      {v.serviceType === 'intern' ? 'Intern' : 'Extern'}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(v.visitDate)}</span>
                  </div>
                  {v.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{v.description}</p>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setVisitModal(v)} className="p-1 text-gray-400 hover:text-teal-600 rounded"><Pencil size={13} /></button>
                  <button onClick={() => { if (confirm('Bezoek verwijderen?')) deleteVisit.mutate(v.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      {/* Servicecontracten */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Servicecontracten</h3>
          <button onClick={() => setContractModal({})} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg transition-colors">
            <Plus size={13} /> Contract toevoegen
          </button>
        </div>
        {contracts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Geen servicecontracten</p>
        ) : (
          <div className="space-y-2">
            {contracts.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{c.supplier}</span>
                    {c.contractNumber && <span className="text-xs text-gray-400">#{c.contractNumber}</span>}
                    {c.costPerYear && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">€{c.costPerYear}/jaar</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.startDate ? formatDate(c.startDate) : ''}
                    {c.startDate && c.endDate ? ' – ' : ''}
                    {c.endDate ? formatDate(c.endDate) : ''}
                  </p>
                  {c.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{c.description}</p>}
                  {c.fileName && (
                    <a href={c.fileUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline flex items-center gap-1 mt-0.5">
                      <Paperclip size={11} /> {c.fileName}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setContractModal(c)} className="p-1 text-gray-400 hover:text-teal-600 rounded"><Pencil size={13} /></button>
                  <button onClick={() => { if (confirm('Contract verwijderen?')) deleteContract.mutate(c.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {visitModal !== null && <ServiceVisitForm initial={visitModal} onSave={(d) => saveVisit.mutate(d)} onClose={() => setVisitModal(null)} loading={saveVisit.isPending} />}
      {contractModal !== null && <ServiceContractForm initial={contractModal} onSave={(d) => saveContract.mutate(d)} onClose={() => setContractModal(null)} loading={saveContract.isPending} />}
    </div>
  )
}

function ServiceVisitForm({ initial = {}, onSave, onClose, loading }: { initial?: Partial<ServiceVisit>; onSave: (d: Record<string, unknown>) => void; onClose: () => void; loading: boolean }) {
  const [form, setForm] = useState({
    visitDate: initial.visitDate ?? '',
    serviceType: initial.serviceType ?? 'intern',
    performedBy: initial.performedBy ?? '',
    description: initial.description ?? '',
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial.id ? 'Bezoek bewerken' : 'Servicebezoek toevoegen'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Datum *</label>
              <input type="date" value={form.visitDate} onChange={(e) => set('visitDate', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <div className="flex gap-2 mt-1">
                {(['intern', 'extern'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set('serviceType', t)}
                    className={cn('flex-1 py-2 rounded-lg text-sm border transition-colors', form.serviceType === t ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Uitgevoerd door *</label>
            <input value={form.performedBy} onChange={(e) => set('performedBy', e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Omschrijving</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={cn(inputCls, 'resize-none')} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
            <button type="submit" disabled={loading || !form.visitDate || !form.performedBy} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ServiceContractForm({ initial = {}, onSave, onClose, loading }: { initial?: Partial<ServiceContract>; onSave: (d: Record<string, unknown>) => void; onClose: () => void; loading: boolean }) {
  const [form, setForm] = useState({
    supplier: initial.supplier ?? '',
    contractNumber: initial.contractNumber ?? '',
    startDate: initial.startDate ?? '',
    endDate: initial.endDate ?? '',
    costPerYear: initial.costPerYear ?? '',
    description: initial.description ?? '',
    fileUrl: initial.fileUrl ?? '',
    fileName: initial.fileName ?? '',
  })
  const [uploading, setUploading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ fileUrl: string; fileName: string }>('/admin/service-contracts/upload', { method: 'POST', body: fd })
      setForm(f => ({ ...f, fileUrl: res.fileUrl, fileName: res.fileName }))
    } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">{initial.id ? 'Contract bewerken' : 'Servicecontract toevoegen'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, costPerYear: form.costPerYear || null, contractNumber: form.contractNumber || null, fileUrl: form.fileUrl || null, fileName: form.fileName || null }) }} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Leverancier *</label>
            <input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} required className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contractnummer</label>
              <input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kosten/jaar (€)</label>
              <input type="number" step="0.01" value={form.costPerYear} onChange={(e) => set('costPerYear', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Startdatum</label>
              <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Einddatum</label>
              <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Omschrijving</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={cn(inputCls, 'resize-none')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contract bestand</label>
            <input type="file" onChange={handleUpload} disabled={uploading} className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Uploaden...</p>}
            {form.fileName && !uploading && <p className="text-xs text-teal-600 mt-1">✓ {form.fileName}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
            <button type="submit" disabled={loading || !form.supplier} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {loading ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Documenten tab ─────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'handleiding', label: 'Handleiding' },
  { value: 'certificaat', label: 'Certificaat' },
  { value: 'tekening', label: 'Tekening' },
  { value: 'schema', label: 'Schema' },
  { value: 'overig', label: 'Overig' },
] as const

function DocumentenTab({ machineId }: { machineId: string }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [uploadModal, setUploadModal] = useState(false)
  const [lightbox, setLightbox] = useState<MachineDocument | null>(null)
  const [uploading, setUploading] = useState(false)
  const [docTitle, setDocTitle] = useState('')
  const [docType, setDocType] = useState<string>('handleiding')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: docs = [] } = useQuery<MachineDocument[]>({
    queryKey: ['machine-documents', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/documents`),
  })

  const deleteDoc = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/machine-documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-documents', machineId] }),
  })

  const filtered = filter ? docs.filter(d => d.documentType === filter) : docs
  const isImage = (mime: string | null) => mime?.startsWith('image/') ?? false

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !docTitle) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', docTitle)
      fd.append('documentType', docType)
      await apiFetch(`/admin/machines/${machineId}/documents`, { method: 'POST', body: fd })
      qc.invalidateQueries({ queryKey: ['machine-documents', machineId] })
      setUploadModal(false)
      setDocTitle('')
      setDocType('handleiding')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilter('')} className={cn('px-2.5 py-1 text-xs rounded-lg border transition-colors', !filter ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>Alle</button>
          {DOC_TYPES.map(({ value, label }) => (
            <button key={value} onClick={() => setFilter(filter === value ? '' : value)} className={cn('px-2.5 py-1 text-xs rounded-lg border transition-colors', filter === value ? 'bg-teal-500 text-white border-teal-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setUploadModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg transition-colors shrink-0">
          <Plus size={13} /> Uploaden
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Geen documenten</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="group relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
              <div className="aspect-square">
                {isImage(doc.mimeType) ? (
                  <img src={doc.fileUrl} alt={doc.title} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLightbox(doc)} />
                ) : (
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center w-full h-full p-3 hover:bg-gray-100 transition-colors">
                    <Download size={24} className="text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500 text-center line-clamp-2 leading-tight">{doc.fileName}</span>
                  </a>
                )}
              </div>
              <div className="px-2 py-1.5 border-t border-gray-100">
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', 'bg-purple-50 text-purple-700')}>
                  {DOC_TYPES.find(t => t.value === doc.documentType)?.label ?? doc.documentType}
                </span>
                <p className="text-xs text-gray-700 mt-0.5 truncate font-medium">{doc.title}</p>
              </div>
              <button
                onClick={() => { if (confirm('Document verwijderen?')) deleteDoc.mutate(doc.id) }}
                className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Document uploaden</h2>
              <button onClick={() => setUploadModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Titel *</label>
                <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {DOC_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bestand *</label>
                <input ref={fileInputRef} type="file" onChange={handleUpload} disabled={uploading || !docTitle}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 disabled:opacity-50" />
                {uploading && <p className="text-xs text-gray-400 mt-1">Uploaden...</p>}
                {!docTitle && <p className="text-xs text-orange-500 mt-1">Vul eerst een titel in</p>}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setUploadModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuleren</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 text-white hover:text-gray-300" onClick={() => setLightbox(null)}><X size={24} /></button>
          <img src={lightbox.fileUrl} alt={lightbox.title} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="absolute bottom-4 text-white text-sm opacity-70">{lightbox.title}</p>
        </div>
      )}
    </div>
  )
}

// ── Facturen tab ───────────────────────────────────────────────────────────

function FacturenTab({ machineId }: { machineId: string }) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: invoices = [] } = useQuery<MachineInvoice[]>({
    queryKey: ['machine-invoices', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/invoices`),
  })

  const deleteInvoice = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/machine-invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-invoices', machineId] }),
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        await apiFetch(`/admin/machines/${machineId}/invoices`, { method: 'POST', body: fd })
      }
      qc.invalidateQueries({ queryKey: ['machine-invoices', machineId] })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Facturen</h3>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
          <Plus size={13} /> {uploading ? 'Uploaden...' : 'Factuur uploaden'}
        </button>
        <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" onChange={handleUpload} />
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Geen facturen</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="group relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50 hover:border-teal-300 transition-colors">
              <a href={inv.fileUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center aspect-square p-3 hover:bg-gray-100 transition-colors">
                <Download size={28} className="text-red-400 mb-2" />
                <span className="text-xs text-gray-600 text-center line-clamp-2 leading-tight font-medium">{inv.fileName}</span>
                <span className="text-xs text-gray-400 mt-1">{new Date(inv.createdAt).toLocaleDateString('nl-NL')}</span>
              </a>
              <button
                onClick={() => { if (confirm('Factuur verwijderen?')) deleteInvoice.mutate(inv.id) }}
                className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CNC Event helpers ──────────────────────────────────────────────────────

interface CncMachineEvent {
  id: string
  machineId: string
  eventType: string
  eventData: Record<string, unknown> | null
  programName: string | null
  occurredAt: string
  createdAt: string
}

interface CncProgramRun {
  id: string
  machineId: string
  programName: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  status: string
  createdAt: string
}

interface DowntimePeriod {
  type: 'offline' | 'alarmstilstand' | 'stilstand' | 'wachttijd'
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  isOngoing: boolean
}

interface MetricPoint { date: string; value: number }

interface DowntimeResult {
  periods: DowntimePeriod[]
  summary: { offline: number; alarmstilstand: number; stilstand: number; wachttijd: number }
}

const DOWNTIME_CONFIG: Record<string, { label: string; color: string }> = {
  offline:        { label: 'Offline',         color: 'bg-gray-100 text-gray-600' },
  alarmstilstand: { label: 'Alarmstilstand',  color: 'bg-red-100 text-red-700' },
  stilstand:      { label: 'Stilstand',       color: 'bg-amber-100 text-amber-700' },
  wachttijd:      { label: 'Wachttijd',       color: 'bg-orange-100 text-orange-700' },
}

const CNC_EVENT_CONFIG: Record<string, { label: string; color: string }> = {
  TOOL_CHANGED:        { label: 'Gereedschapwissel', color: 'bg-orange-100 text-orange-700' },
  SPINDLE_OFF:         { label: 'Spindel uit',       color: 'bg-orange-100 text-orange-700' },
  SPINDLE_ON:          { label: 'Spindel aan',       color: 'bg-orange-100 text-orange-700' },
  PROGRAM_STARTED:     { label: 'Programma Start',   color: 'bg-teal-100 text-teal-700' },
  PROGRAM_STOPPED:     { label: 'Programma Stop',    color: 'bg-gray-100 text-gray-600' },
  PROGRAM_INTERRUPTED: { label: 'Onderbroken',       color: 'bg-gray-100 text-gray-600' },
  ALARM_TRIGGERED:     { label: 'Alarm',             color: 'bg-red-100 text-red-700' },
  ALARM_CLEARED:       { label: 'Alarm opgeheven',   color: 'bg-green-100 text-green-700' },
  MACHINE_ONLINE:      { label: 'Online',            color: 'bg-blue-100 text-blue-700' },
  MACHINE_OFFLINE:     { label: 'Offline',           color: 'bg-gray-100 text-gray-500' },
}

const CNC_RUN_STATUS: Record<string, { label: string; color: string }> = {
  running:     { label: 'Actief',      color: 'bg-teal-100 text-teal-700' },
  completed:   { label: 'Gestopt',     color: 'bg-gray-100 text-gray-600' },
  interrupted: { label: 'Onderbroken', color: 'bg-orange-100 text-orange-700' },
  error:       { label: 'Fout',        color: 'bg-red-100 text-red-700' },
  stopped:     { label: 'Gestopt',     color: 'bg-gray-100 text-gray-600' },
}

function sanitizeProgramName(name: string): string {
  const idx = name.toUpperCase().indexOf('TNC:')
  if (idx > 0) return name.slice(idx)
  return name.replace(/^[^\x20-\x7E]+/, '')
}

function formatCncTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  const date = d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })
  return `${date} ${time}`
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds === 0) return '0m'
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

function formatCncEventDetail(ev: CncMachineEvent, toolNames?: Map<number, string>): string {
  const d = ev.eventData
  if (ev.eventType === 'TOOL_CHANGED' && d) {
    const fromNr = d.from as number | undefined
    const toNr   = d.to   as number | undefined
    const fromName = fromNr != null && toolNames?.get(fromNr) ? ` (${toolNames.get(fromNr)})` : ''
    const toName   = toNr   != null && toolNames?.get(toNr)   ? ` (${toolNames.get(toNr)})`   : ''
    return `T${fromNr ?? '?'}${fromName} → T${toNr ?? '?'}${toName}`
  }
  if (ev.eventType === 'PROGRAM_STARTED' && ev.programName) {
    return sanitizeProgramName(ev.programName)
  }
  if (ev.eventType === 'ALARM_TRIGGERED' && d) {
    const text = d.alarmText ?? d.message
    if (text) return String(text)
  }
  return ''
}

// ── Machine detail panel ───────────────────────────────────────────────────

function MachineDetailPanel({ machineId, onEdit, onDelete }: { machineId: string; onEdit: () => void; onDelete: () => void }) {
  const [subTab, setSubTab] = useState<'gegevens' | 'onderhoud' | 'storingen' | 'cnc_events' | 'cnc_runs' | 'cnc_downtime' | 'service' | 'documenten' | 'facturen'>('gegevens')
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null)
  const [maintenanceModal, setMaintenanceModal] = useState<Partial<MaintenanceTask> | null>(null)
  const [breakdownModal, setBreakdownModal] = useState<Partial<Breakdown> | null>(null)
  const [taskPortal, setTaskPortal] = useState<MaintenanceTask | null>(null)
  const [breakdownPortal, setBreakdownPortal] = useState<Breakdown | null>(null)
  const qc = useQueryClient()

  const { data: machine } = useQuery<MachineDetail>({
    queryKey: ['machine', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}`),
  })

  const { data: maintenanceList = [] } = useQuery<MaintenanceTask[]>({
    queryKey: ['machine-maintenance', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/maintenance`),
    enabled: subTab === 'onderhoud',
  })

  const { data: breakdownList = [] } = useQuery<Breakdown[]>({
    queryKey: ['machine-breakdowns', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/breakdowns`),
    enabled: subTab === 'storingen',
  })

  const { data: cncEvents = [] } = useQuery<CncMachineEvent[]>({
    queryKey: ['cnc-events', machineId, eventTypeFilter],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/cnc-events?limit=100${eventTypeFilter ? `&eventType=${eventTypeFilter}` : ''}`) as Promise<CncMachineEvent[]>,
    enabled: subTab === 'cnc_events',
    refetchInterval: subTab === 'cnc_events' ? 15_000 : false,
  })

  const { data: toolEntries = [] } = useQuery<{ toolNumber: number; name: string | null }[]>({
    queryKey: ['cnc-tool-entries', machineId],
    queryFn: async () => {
      const res = await apiFetch(`/kiosk/cnc/machines/${machineId}/tools`) as { tools: { toolNumber: number; name: string | null }[] }
      return res.tools ?? []
    },
    enabled: subTab === 'cnc_events',
  })

  const toolNameMap = new Map(
    (Array.isArray(toolEntries) ? toolEntries : []).filter(t => t.name).map(t => [t.toolNumber, t.name!])
  )

  const [articleFilter, setArticleFilter] = useState<string | null>(null)

  const { data: cncRunsSummary = [] } = useQuery<{ article: string; totalSeconds: number; runCount: number }[]>({
    queryKey: ['cnc-runs-summary', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/cnc-program-runs/summary`) as Promise<{ article: string; totalSeconds: number; runCount: number }[]>,
    enabled: subTab === 'cnc_runs',
  })

  const { data: cncRuns = [] } = useQuery<CncProgramRun[]>({
    queryKey: ['cnc-runs', machineId, articleFilter],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/cnc-program-runs?limit=100${articleFilter ? `&article=${encodeURIComponent(articleFilter)}` : ''}`) as Promise<CncProgramRun[]>,
    enabled: subTab === 'cnc_runs',
    refetchInterval: subTab === 'cnc_runs' ? 15_000 : false,
  })

  const { data: downtimeData } = useQuery<DowntimeResult>({
    queryKey: ['cnc-downtime', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/cnc-downtime?days=7`) as Promise<DowntimeResult>,
    enabled: subTab === 'cnc_downtime',
    refetchInterval: subTab === 'cnc_downtime' ? 30_000 : false,
  })

  const { data: spindleMetrics } = useQuery<{ data: MetricPoint[] }>({
    queryKey: ['spindle-metrics', machineId],
    queryFn: () => apiFetch(`/admin/machines/${machineId}/cnc-metrics?metric=spindle_hours&days=365`) as Promise<{ data: MetricPoint[] }>,
    enabled: subTab === 'gegevens',
    staleTime: 30 * 60_000,
  })

  const [spindleInput, setSpindleInput] = useState('')
  const [spindleInputOpen, setSpindleInputOpen] = useState(false)

  const saveSpindleHours = useMutation({
    mutationFn: (hours: number) =>
      apiFetch(`/admin/machines/${machineId}/cnc-metrics`, { method: 'POST', body: JSON.stringify({ spindleHours: hours }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machine', machineId] })
      qc.invalidateQueries({ queryKey: ['spindle-metrics', machineId] })
      setSpindleInputOpen(false)
      setSpindleInput('')
    },
  })

  const saveMaintenance = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      maintenanceModal?.id
        ? apiFetch(`/admin/maintenance/${maintenanceModal.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch(`/admin/machines/${machineId}/maintenance`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machine-maintenance', machineId] }); setMaintenanceModal(null) },
  })

  const deleteMaintenance = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/maintenance/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-maintenance', machineId] }),
  })

  const saveBreakdown = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      breakdownModal?.id
        ? apiFetch(`/admin/breakdowns/${breakdownModal.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch(`/admin/machines/${machineId}/breakdowns`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machine-breakdowns', machineId] }); setBreakdownModal(null) },
  })

  const deleteBreakdown = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/breakdowns/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['machine-breakdowns', machineId] }),
  })

  const toggleStatus = useMutation({
    mutationFn: (isActive: boolean) =>
      apiFetch(`/admin/machines/${machineId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); qc.invalidateQueries({ queryKey: ['machine', machineId] }) },
  })


  if (!machine) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Laden...</div>

  const infoRow = (label: string, value: string | number | null | undefined) =>
    value ? (
      <div key={label}>
        <span className="text-xs text-gray-400">{label}</span>
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      </div>
    ) : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Machine header */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-gray-900">{machine.name}</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">{machine.category}</span>
            {machine.machineId && <span className="text-xs text-gray-400">#{machine.machineId}</span>}
          </div>
          {machine.manufacturer && <p className="text-xs text-gray-400">{machine.manufacturer}{machine.model ? ` — ${machine.model}` : ''}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Actief toggle */}
          <button
            onClick={() => toggleStatus.mutate(!machine.isActive)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-lg font-medium transition-colors',
              machine.isActive
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            {machine.isActive ? 'Actief' : 'Inactief'}
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-gray-100 flex-wrap">
        {([
          { key: 'gegevens',  label: 'Gegevens' },
          { key: 'onderhoud', label: 'Onderhoud' },
          { key: 'storingen', label: 'Storingen' },
          ...(machine.category === 'Freesmachine' ? [
            { key: 'cnc_events',   label: 'CNC Events' },
            { key: 'cnc_runs',     label: 'Programma Runs' },
            { key: 'cnc_downtime', label: 'Downtime' },
          ] : []),
          { key: 'service',   label: 'Service' },
          { key: 'documenten',label: 'Documenten' },
          { key: 'facturen',  label: 'Facturen' },
        ] as { key: typeof subTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={cn(
              'px-3 py-2 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap',
              subTab === key ? 'border-teal-500 text-teal-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {subTab === 'gegevens' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basisgegevens</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {infoRow('Serienummer', machine.serialNumber)}
                {infoRow('Aanschafjaar', machine.yearOfPurchase)}
                {infoRow('Gewicht', machine.weightKg ? `${machine.weightKg} kg` : null)}
              </div>
            </div>
            {machine.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Algemene info</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{machine.notes}</p>
              </div>
            )}
            {(machine.electricKva || machine.electricKw || machine.electricAmpere || machine.electricFuse) && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Elektrische aansluiting</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  {infoRow('KVA', machine.electricKva)}
                  {infoRow('KW', machine.electricKw)}
                  {infoRow('Ampere', machine.electricAmpere)}
                  {infoRow('Zekering', machine.electricFuse)}
                  {infoRow('Kabellengte', machine.electricCableLength ? `${machine.electricCableLength} m` : null)}
                  {infoRow('Draaddiameter', machine.electricWireDiameter)}
                </div>
              </div>
            )}
            {(machine.cncController || machine.cncIpAddress || machine.cncCamName) && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">CNC configuratie</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {infoRow('Besturing', machine.cncController)}
                  {infoRow('IP adres', machine.cncIpAddress)}
                  {infoRow('CAM naam', machine.cncCamName)}
                  {infoRow('Max tools', machine.cncMaxTools)}
                  {infoRow('Max lengte', machine.cncMaxLength ? `${machine.cncMaxLength} mm` : null)}
                  {infoRow('Max diameter', machine.cncMaxDiameter ? `${machine.cncMaxDiameter} mm` : null)}
                  {infoRow('Spindel interface', machine.cncSpindleInterface)}
                  {infoRow('NC versie', machine.cncNcVersion)}
                  {infoRow('PLC versie', machine.cncPlcVersion)}
                </div>
              </div>
            )}
            {machine.category === 'Freesmachine' && machine.cncIpAddress && (() => {
              const points = spindleMetrics?.data ?? []
              const logRows = [...points].reverse()
              return (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Spindeluren</h3>
                  <div className="flex items-end gap-3 mb-4">
                    {machine.spindleHours != null ? (
                      <div className="inline-flex flex-col items-start bg-teal-50 rounded-xl px-5 py-3">
                        <span className="text-2xl font-bold text-teal-700 tabular-nums">
                          {Number(machine.spindleHours).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} u
                        </span>
                        <span className="text-xs text-teal-500 mt-0.5">Totaal spindeluren (MOD)</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Nog geen spindeluren ingevoerd</p>
                    )}
                    {!spindleInputOpen && (
                      <button
                        onClick={() => { setSpindleInput(machine.spindleHours ?? ''); setSpindleInputOpen(true) }}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                      >
                        Invoeren
                      </button>
                    )}
                  </div>
                  {spindleInputOpen && (
                    <div className="flex items-center gap-2 mb-4">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={spindleInput}
                        onChange={e => setSpindleInput(e.target.value)}
                        placeholder="bijv. 19164"
                        className="w-32 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-teal-400"
                        autoFocus
                      />
                      <span className="text-xs text-gray-500">uur</span>
                      <button
                        onClick={() => { const h = parseFloat(spindleInput); if (!isNaN(h) && h >= 0) saveSpindleHours.mutate(h) }}
                        disabled={saveSpindleHours.isPending}
                        className="px-3 py-1.5 text-xs bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                        Opslaan
                      </button>
                      <button onClick={() => setSpindleInputOpen(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600">
                        Annuleren
                      </button>
                    </div>
                  )}
                  {logRows.length > 0 && (
                    <div className="overflow-y-auto max-h-56 rounded-lg border border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-400 border-b border-gray-100">
                            <th className="text-left px-3 py-2 font-medium">Datum</th>
                            <th className="text-right px-3 py-2 font-medium">Totaal (u)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logRows.map(p => (
                            <tr key={p.date} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600">
                                {new Date(p.date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-800">
                                {Number(p.value).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {subTab === 'onderhoud' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Onderhoudstaken</h3>
              <button
                onClick={() => setMaintenanceModal({})}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg transition-colors"
              >
                <Plus size={13} /> Taak toevoegen
              </button>
            </div>
            {maintenanceList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Geen onderhoudstaken</p>
            ) : (
              <div className="space-y-2">
                {maintenanceList.map((task) => {
                  const s = STATUS_MAINTENANCE[task.status] ?? { label: task.status, color: 'bg-gray-100 text-gray-500' }
                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer"
                      onClick={() => setTaskPortal(task)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{task.title}</span>
                          <StatusBadge label={s.label} color={s.color} />
                          <StatusBadge label={task.priority} color={PRIORITY_COLOR[task.priority]} />
                          {task.interval && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600">
                              {INTERVAL_OPTIONS.find(o => o.value === task.interval)?.label ?? task.interval}
                            </span>
                          )}
                        </div>
                        {task.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          {task.scheduledDate ? `Gepland: ${formatDate(task.scheduledDate)}` : ''}
                          {task.assignedToName ? ` · ${task.assignedToName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setMaintenanceModal(task)} className="p-1 text-gray-400 hover:text-teal-600 rounded">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm('Taak verwijderen?')) deleteMaintenance.mutate(task.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'storingen' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Storingen</h3>
              <button
                onClick={() => setBreakdownModal({})}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg transition-colors"
              >
                <AlertTriangle size={13} /> Storing melden
              </button>
            </div>
            {breakdownList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Geen storingen</p>
            ) : (
              <div className="space-y-2">
                {breakdownList.map((bd) => {
                  const s = STATUS_BREAKDOWN[bd.status] ?? { label: bd.status, color: 'bg-gray-100 text-gray-500' }
                  return (
                    <div key={bd.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer" onClick={() => setBreakdownPortal(bd)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{bd.title}</span>
                          <StatusBadge label={s.label} color={s.color} />
                          <StatusBadge label={bd.priority} color={PRIORITY_COLOR[bd.priority]} />
                        </div>
                        {bd.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{bd.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          Gemeld: {formatDate(bd.reportedAt)}
                          {bd.reportedByName ? ` · ${bd.reportedByName}` : ''}
                          {bd.resolvedAt ? ` · Opgelost: ${formatDate(bd.resolvedAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setBreakdownModal(bd)} className="p-1 text-gray-400 hover:text-teal-600 rounded">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm('Storing verwijderen?')) deleteBreakdown.mutate(bd.id) }} className="p-1 text-gray-400 hover:text-red-500 rounded">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'cnc_events' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Activity size={15} className="text-teal-500" /> CNC Events
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                { key: null,                label: 'Alle' },
                { key: 'SPINDLE_OFF',       label: 'Spindel uit' },
                { key: 'PROGRAM_STARTED',   label: 'Programma start' },
                { key: 'PROGRAM_STOPPED',   label: 'Programma stop' },
                { key: 'ALARM_TRIGGERED',   label: 'Alarm' },
                { key: 'MACHINE_ONLINE',    label: 'Online' },
                { key: 'MACHINE_OFFLINE',   label: 'Offline' },
              ] as { key: string | null; label: string }[]).map(({ key, label }) => (
                <button
                  key={key ?? 'all'}
                  onClick={() => setEventTypeFilter(key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    eventTypeFilter === key
                      ? 'bg-teal-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {cncEvents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">Nog geen events ontvangen</p>
            ) : (
              <div className="space-y-1.5">
                {cncEvents.map((ev) => {
                  const cfg = CNC_EVENT_CONFIG[ev.eventType] ?? { label: ev.eventType, color: 'bg-gray-100 text-gray-600' }
                  const detail = formatCncEventDetail(ev, toolNameMap)
                  return (
                    <div key={ev.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-0.5', cfg.color)}>{cfg.label}</span>
                      <div className="flex-1 min-w-0">
                        {detail && <p className="text-sm text-gray-700">{detail}</p>}
                        {ev.programName && <p className="text-xs text-gray-400 mt-0.5">Programma: {sanitizeProgramName(ev.programName)}</p>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 mt-0.5">{formatCncTime(ev.occurredAt)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'cnc_runs' && (
          <div>
            {/* Artikel zoekbalk */}
            <div className="mb-4">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter op artikel (bijv. 22073-3201-11)"
                  value={articleFilter ?? ''}
                  onChange={e => setArticleFilter(e.target.value || null)}
                  className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                />
                {articleFilter && (
                  <button onClick={() => setArticleFilter(null)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              {articleFilter && (() => {
                const sel = cncRunsSummary.find(s => s.article.toLowerCase().includes(articleFilter.toLowerCase()))
                if (!sel) return null
                return (
                  <div className="mt-1.5 px-3 py-2 bg-teal-50 rounded-lg flex items-center gap-3 text-xs">
                    <span className="text-teal-700 font-medium">{sel.article}</span>
                    <span className="text-teal-600">Totale verspaantijd: <strong>{formatDuration(sel.totalSeconds)}</strong></span>
                    <span className="text-teal-500">{sel.runCount} run{sel.runCount !== 1 ? 's' : ''}</span>
                  </div>
                )
              })()}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pb-3 text-xs text-gray-500">
              {Object.entries(CNC_RUN_STATUS).filter(([, cfg], i, arr) => arr.findIndex(([, c]) => c.label === cfg.label) === i).map(([, cfg]) => (
                <span key={cfg.label} className="flex items-center gap-1.5">
                  <span className={cn('px-1.5 py-0.5 rounded-full font-medium', cfg.color)}>{cfg.label}</span>
                  <span>{
                    cfg.label === 'Actief'      ? 'programma draait' :
                    cfg.label === 'Gestopt'     ? 'programma gestopt of afgerond' :
                    cfg.label === 'Onderbroken' ? 'midden in bewerking afgebroken' :
                    cfg.label === 'Fout'        ? 'gestopt door NC-fout' : ''
                  }</span>
                </span>
              ))}
            </div>
            {cncRuns.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">Nog geen programma-runs ontvangen</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Programma</th>
                      <th className="text-left pb-2 font-medium">Gestart</th>
                      <th className="text-left pb-2 font-medium">Duur</th>
                      <th className="text-left pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cncRuns.map((run) => {
                      const sc        = CNC_RUN_STATUS[run.status] ?? { label: run.status, color: 'bg-gray-100 text-gray-600' }
                      const cleanName = sanitizeProgramName(run.programName)
                      const shortName = cleanName.split(/[\\/]/).pop() ?? cleanName
                      const fullPath  = shortName !== cleanName ? cleanName : null
                      return (
                        <tr key={run.id} className="hover:bg-gray-50">
                          <td className="py-2.5 pr-4">
                            <p className="font-mono text-xs font-medium text-gray-800">{shortName}</p>
                            {fullPath && <p className="text-xs text-gray-400 truncate max-w-[260px]">{fullPath}</p>}
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-gray-600 whitespace-nowrap">{formatCncTime(run.startedAt)}</td>
                          <td className="py-2.5 pr-4 text-xs text-gray-600">{formatDuration(run.durationSeconds)}</td>
                          <td className="py-2.5">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sc.color)}>{sc.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {subTab === 'cnc_downtime' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={15} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-700">Downtime — afgelopen 7 dagen</h3>
            </div>
            {downtimeData && (
              <div className="grid grid-cols-4 gap-3 mb-5">
                {([
                  { key: 'offline',        label: 'Offline',         color: 'bg-gray-50 border-gray-200 text-gray-600' },
                  { key: 'alarmstilstand', label: 'Alarmstilstand',  color: 'bg-red-50 border-red-100 text-red-700' },
                  { key: 'stilstand',      label: 'Stilstand',       color: 'bg-amber-50 border-amber-100 text-amber-700' },
                  { key: 'wachttijd',      label: 'Wachttijd',       color: 'bg-orange-50 border-orange-100 text-orange-700' },
                ] as const).map(({ key, label, color }) => (
                  <div key={key} className={cn('rounded-xl border p-3', color)}>
                    <p className="text-xs opacity-70 mb-0.5">{label}</p>
                    <p className="text-lg font-semibold">{formatDuration(downtimeData.summary[key])}</p>
                  </div>
                ))}
              </div>
            )}
            {!downtimeData || downtimeData.periods.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600 py-8 justify-center">
                <span className="text-green-500">✓</span> Geen stilstand geregistreerd in de afgelopen 7 dagen
              </div>
            ) : (
              <div className="space-y-1.5">
                {downtimeData.periods.map((p, i) => {
                  const cfg = DOWNTIME_CONFIG[p.type] ?? { label: p.type, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:bg-gray-50">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0', cfg.color)}>{cfg.label}</span>
                      <div className="flex-1 text-xs text-gray-500">
                        {formatCncTime(p.startedAt)} → {p.endedAt ? formatCncTime(p.endedAt) : <span className="text-red-500 font-medium">lopend</span>}
                      </div>
                      <span className="text-xs font-medium text-gray-700">{formatDuration(p.durationSeconds)}</span>
                      {p.isOngoing && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'service' && <ServiceTab machineId={machineId} />}
        {subTab === 'documenten' && <DocumentenTab machineId={machineId} />}
        {subTab === 'facturen' && <FacturenTab machineId={machineId} />}
      </div>

      {/* Modals */}
      {maintenanceModal !== null && (
        <MaintenanceForm
          machineId={machineId}
          initial={maintenanceModal}
          onSave={(d) => saveMaintenance.mutate(d)}
          onClose={() => setMaintenanceModal(null)}
          loading={saveMaintenance.isPending}
        />
      )}
      {breakdownModal !== null && (
        <BreakdownForm
          machineId={machineId}
          initial={breakdownModal}
          onSave={(d) => saveBreakdown.mutate(d)}
          onClose={() => setBreakdownModal(null)}
          loading={saveBreakdown.isPending}
        />
      )}
      {taskPortal && (
        <TaskPortal
          task={taskPortal}
          onClose={() => setTaskPortal(null)}
          onEditTask={() => { setMaintenanceModal(taskPortal); setTaskPortal(null) }}
        />
      )}
      {breakdownPortal && (
        <BreakdownPortal
          breakdown={breakdownPortal}
          onClose={() => setBreakdownPortal(null)}
          onEditBreakdown={() => { setBreakdownModal(breakdownPortal); setBreakdownPortal(null) }}
        />
      )}
    </div>
  )
}

// ── Global overview tabs ───────────────────────────────────────────────────

function GlobalMaintenanceTab() {
  const { data = [] } = useQuery<MaintenanceTask[]>({
    queryKey: ['all-maintenance'],
    queryFn: () => apiFetch('/admin/maintenance'),
  })

  return (
    <div className="p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Alle onderhoudstaken</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Geen onderhoudstaken</p>
      ) : (
        <div className="space-y-2">
          {data.map((task) => {
            const s = STATUS_MAINTENANCE[task.status] ?? { label: task.status, color: 'bg-gray-100 text-gray-500' }
            return (
              <div key={task.id} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{task.title}</span>
                    <StatusBadge label={s.label} color={s.color} />
                    <StatusBadge label={task.priority} color={PRIORITY_COLOR[task.priority]} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {task.machineName && <span className="font-medium">{task.machineName}</span>}
                    {task.machineCategory && <span> · {task.machineCategory}</span>}
                    {task.scheduledDate && <span> · Gepland: {formatDate(task.scheduledDate)}</span>}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GlobalBreakdownsTab() {
  const { data = [] } = useQuery<Breakdown[]>({
    queryKey: ['all-breakdowns'],
    queryFn: () => apiFetch('/admin/breakdowns'),
  })

  return (
    <div className="p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Alle storingen</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Geen storingen</p>
      ) : (
        <div className="space-y-2">
          {data.map((bd) => {
            const s = STATUS_BREAKDOWN[bd.status] ?? { label: bd.status, color: 'bg-gray-100 text-gray-500' }
            return (
              <div key={bd.id} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{bd.title}</span>
                    <StatusBadge label={s.label} color={s.color} />
                    <StatusBadge label={bd.priority} color={PRIORITY_COLOR[bd.priority]} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {bd.machineName && <span className="font-medium">{bd.machineName}</span>}
                    {bd.machineCategory && <span> · {bd.machineCategory}</span>}
                    <span> · Gemeld: {formatDate(bd.reportedAt)}</span>
                    {bd.resolvedAt && <span> · Opgelost: {formatDate(bd.resolvedAt)}</span>}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function MachinesContent() {
  const [topTab, setTopTab] = useState<'machines' | 'onderhoud' | 'storingen' | 'energy'>('machines')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [machineModal, setMachineModal] = useState<Partial<MachineDetail> | null>(null)
  const qc = useQueryClient()

  const { data: machineList = [] } = useQuery<Machine[]>({
    queryKey: ['machines'],
    queryFn: () => apiFetch('/admin/machines'),
  })

  const saveMachine = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      machineModal?.id
        ? apiFetch(`/admin/machines/${machineModal.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : apiFetch('/admin/machines', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] })
      if (machineModal?.id) qc.invalidateQueries({ queryKey: ['machine', machineModal.id] })
      setMachineModal(null)
    },
  })

  const deleteMachine = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/machines/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); setSelectedId(null) },
  })

  const filtered = machineList.filter((m) => {
    if (!showInactive && !m.isActive) return false
    if (categoryFilter && m.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !m.name.toLowerCase().includes(q) &&
        !(m.machineId ?? '').toLowerCase().includes(q) &&
        !m.category.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const categories = [...new Set(machineList.map((m) => m.category))]

  const TOP_TABS = [
    { key: 'machines', label: 'Machines', icon: Wrench },
    { key: 'onderhoud', label: 'Onderhoud', icon: Clock },
    { key: 'storingen', label: 'Storingen', icon: AlertTriangle },
    { key: 'energy', label: 'Energy', icon: Zap },
  ] as const

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Top tabs + header */}
      <div className="border-b border-gray-200 px-6 bg-white flex items-center justify-between">
        <div className="flex gap-1">
          {TOP_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTopTab(key)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                topTab === key
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        {topTab === 'machines' && (
          <button
            onClick={() => setMachineModal({})}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Nieuwe asset
          </button>
        )}
      </div>

      {/* Tab content */}
      {topTab === 'machines' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-gray-50">
            {/* Filters */}
            <div className="p-3 space-y-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Zoeken..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="">Alle categorieën</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
                Inactieve machines tonen
              </label>
            </div>
            {/* Machine list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">Geen machines</p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-gray-100 flex items-center gap-3 hover:bg-white transition-colors',
                      selectedId === m.id && 'bg-white border-l-2 border-l-teal-500',
                    )}
                  >
                    {m.photoUrl
                      ? <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0 bg-gray-50"><img src={m.photoUrl} className="block w-full h-full object-contain" /></div>
                      : <div className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300"><Wrench size={18} /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{m.category}</span>
                        {!m.isActive && <span className="text-xs text-gray-400">Inactief</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel */}
          {selectedId ? (
            <MachineDetailPanel
              key={selectedId}
              machineId={selectedId}
              onEdit={async () => {
                const detail = await apiFetch<MachineDetail>(`/admin/machines/${selectedId}`)
                setMachineModal(detail)
              }}
              onDelete={() => { if (confirm('Machine verwijderen?')) deleteMachine.mutate(selectedId) }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Wrench size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Selecteer een machine</p>
              </div>
            </div>
          )}
        </div>
      )}

      {topTab === 'onderhoud' && <GlobalMaintenanceTab />}
      {topTab === 'storingen' && <GlobalBreakdownsTab />}
      {topTab === 'energy' && (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Zap size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Energy monitoring — volgende fase</p>
          </div>
        </div>
      )}

      {/* Machine modal */}
      {machineModal !== null && (
        <MachineForm
          initial={machineModal}
          onSave={(d) => saveMachine.mutate(d)}
          onClose={() => { setMachineModal(null); saveMachine.reset() }}
          loading={saveMachine.isPending}
          error={saveMachine.error?.message}
        />
      )}
    </div>
  )
}

export default function MachinesPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <MachinesContent />
    </div>
  )
}
