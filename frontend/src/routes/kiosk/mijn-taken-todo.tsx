import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListTodo, Star, StarOff, Check, Pencil, Trash2, Plus, X, ChevronLeft,
  Wrench, UserCheck, Archive, Clock, Calendar, AlertTriangle,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { EMPLOYEE_TOKEN_KEY } from '@/lib/auth'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────

export interface Task {
  id: string
  title: string
  description: string | null
  priority: 'kritisch' | 'laag'
  dueDate: string | null
  status: 'open' | 'in_uitvoering' | 'gereed' | 'gearchiveerd'
  isFavorite: boolean
  machineIds: string[]
  assignedToId: string | null
  assignedById: string | null
  assignmentStatus: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  assignedByName?: string | null
}

interface Employee {
  id: string
  name: string
  role: string
  photoUrl: string | null
}

interface Machine {
  id: string
  machineId: string | null
  name: string
  category: string
  photoUrl: string | null
}

type TabKey = 'taken' | 'toewijzingen' | 'archief'

// ── Badge counts hook (used by dashboard) ────────────────────────────────

interface TaskCounts {
  kritisch: number
  laag: number
  storingen: number
  onderhoud: number
}

export function useTaskCounts(): { rood: number; geel: number } {
  const { data } = useQuery<TaskCounts>({
    queryKey: ['task-counts'],
    queryFn: () => apiFetch('/kiosk/tasks/counts'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    enabled: !!localStorage.getItem(EMPLOYEE_TOKEN_KEY),
  })
  return {
    rood: (data?.kritisch ?? 0) + (data?.storingen ?? 0) + (data?.onderhoud ?? 0),
    geel: data?.laag ?? 0,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

function isToday(dueDate: string | null) {
  if (!dueDate) return false
  return dueDate === new Date().toISOString().slice(0, 10)
}

function isThisWeek(dueDate: string | null) {
  if (!dueDate) return false
  const d = new Date(dueDate)
  const now = new Date()
  const endOfWeek = new Date(now)
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
  return d > now && d <= endOfWeek
}

function PriorityBadge({ priority }: { priority: 'kritisch' | 'laag' }) {
  if (priority === 'kritisch') {
    return (
      <span className="flex items-center gap-0.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
        <AlertTriangle size={10} />
        Kritisch
      </span>
    )
  }
  return (
    <span className="text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">
      Laag
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    gemeld: 'bg-red-100 text-red-700',
    in_behandeling: 'bg-amber-100 text-amber-700',
    opgelost: 'bg-green-100 text-green-700',
    gepland: 'bg-blue-100 text-blue-700',
    bezig: 'bg-amber-100 text-amber-700',
    gereed: 'bg-green-100 text-green-700',
  }
  const label: Record<string, string> = {
    gemeld: 'Gemeld',
    in_behandeling: 'In behandeling',
    opgelost: 'Opgelost',
    gepland: 'Gepland',
    bezig: 'Bezig',
    gereed: 'Gereed',
  }
  return (
    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', map[status] ?? 'bg-gray-100 text-gray-600')}>
      {label[status] ?? status}
    </span>
  )
}

// ── Task Modal ────────────────────────────────────────────────────────────

interface TaskModalProps {
  initial?: Task | null
  machines: Machine[]
  employees: Employee[]
  onClose: () => void
  onSave: (data: Partial<Task>) => void
  onCreateAndAssign?: (data: Partial<Task>, assignedToId: string) => void
}

function TaskModal({ initial, machines, employees, onClose, onSave, onCreateAndAssign }: TaskModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [priority, setPriority] = useState<'kritisch' | 'laag'>(initial?.priority ?? 'laag')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>(initial?.machineIds ?? [])
  const [step, setStep] = useState<'form' | 'assign'>('form')

  function toggleMachine(id: string) {
    setSelectedMachineIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    )
  }

  function handleSave() {
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: description || null,
      priority,
      dueDate: dueDate || null,
      machineIds: selectedMachineIds,
    })
  }

  if (step === 'assign') {
    const formData: Partial<Task> = {
      title: title.trim(),
      description: description || null,
      priority,
      dueDate: dueDate || null,
      machineIds: selectedMachineIds,
    }
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <button onClick={() => setStep('form')} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={18} />
            </button>
            <h3 className="font-semibold text-gray-800">Toewijzen aan collega</h3>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {employees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => { onCreateAndAssign?.(formData, emp.id); onClose() }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-colors text-center"
              >
                {emp.photoUrl ? (
                  <img src={emp.photoUrl} alt={emp.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-lg">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-gray-700 leading-tight">{emp.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{initial ? 'Taak bewerken' : 'Nieuwe taak'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Omschrijving van de taak..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Omschrijving</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prioriteit</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'kritisch' | 'laag')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="laag">Laag</option>
                <option value="kritisch">Kritisch</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Datum</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
          {machines.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Machines (optioneel, meerdere mogelijk)
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                {machines.map((m) => {
                  const sel = selectedMachineIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMachine(m.id)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-colors',
                        sel
                          ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-400'
                          : 'border-gray-200 hover:border-teal-300',
                      )}
                    >
                      {m.photoUrl ? (
                        <img src={m.photoUrl} alt={m.name} className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                          <Wrench size={14} className="text-gray-400" />
                        </div>
                      )}
                      <span className="text-xs text-gray-700 leading-tight line-clamp-1">{m.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          {!initial && onCreateAndAssign && (
            <button
              onClick={() => { if (title.trim()) setStep('assign') }}
              className="px-3 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg border border-teal-200 transition-colors flex items-center gap-1.5"
            >
              <UserCheck size={14} />
              Opslaan & toewijzen
            </button>
          )}
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            {initial ? 'Opslaan' : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Taken ─────────────────────────────────────────────────────────────

function TakenTab({
  tasks,
  machines,
  employees,
  onUpdate,
  onCreate,
  onDelete,
  onCreateAndAssign,
}: {
  tasks: Task[]
  machines: Machine[]
  employees: Employee[]
  onUpdate: (id: string, data: Partial<Task>) => void
  onCreate: (data: Partial<Task>) => void
  onDelete: (id: string) => void
  onCreateAndAssign: (data: Partial<Task>, assignedToId: string) => void
}) {
  const [modal, setModal] = useState<'new' | Task | null>(null)

  const active = tasks.filter((t) => t.status === 'open' || t.status === 'in_uitvoering')

  const groups = useMemo(() => {
    const overdue: Task[] = []
    const today: Task[] = []
    const week: Task[] = []
    const later: Task[] = []
    const noDate: Task[] = []
    const favorites: Task[] = []

    for (const t of active) {
      if (t.isFavorite) { favorites.push(t); continue }
      if (!t.dueDate) { noDate.push(t); continue }
      if (isOverdue(t.dueDate)) { overdue.push(t); continue }
      if (isToday(t.dueDate)) { today.push(t); continue }
      if (isThisWeek(t.dueDate)) { week.push(t); continue }
      later.push(t)
    }
    return { overdue, today, week, later, noDate, favorites }
  }, [active])

  function TaskCard({ task }: { task: Task }) {
    const taskMachines = machines.filter((m) => task.machineIds?.includes(m.id))
    return (
      <div className={cn(
        'bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-3',
        task.priority === 'kritisch' ? 'border-l-4 border-l-red-500 border-gray-100' : 'border-l-4 border-l-yellow-400 border-gray-100',
      )}>
        <div className="flex items-start gap-2">
          <button
            onClick={() => onUpdate(task.id, { status: 'gereed' })}
            className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-teal-500 hover:bg-teal-50 flex items-center justify-center transition-colors"
            title="Afronden"
          >
            <Check size={11} className="text-transparent hover:text-teal-500" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
            {task.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{task.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <PriorityBadge priority={task.priority} />
              {task.dueDate && (
                <span className={cn(
                  'flex items-center gap-0.5 text-xs',
                  isOverdue(task.dueDate) ? 'text-red-500 font-semibold' : 'text-gray-400',
                )}>
                  <Calendar size={10} />
                  {formatDate(task.dueDate)}
                </span>
              )}
              {taskMachines.map((m) => (
                <span key={m.id} className="text-xs text-gray-400 flex items-center gap-0.5">
                  <Wrench size={10} />
                  {m.name}
                </span>
              ))}
              {task.assignedToId && task.assignmentStatus === 'geaccepteerd' && (
                <span className="text-xs text-teal-600 flex items-center gap-0.5">
                  <UserCheck size={10} />
                  Toegewezen
                </span>
              )}
              {task.assignedToId && task.assignmentStatus === 'in_afwachting' && (
                <span className="text-xs text-amber-500 flex items-center gap-0.5">
                  <Clock size={10} />
                  In afwachting
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onUpdate(task.id, { isFavorite: !task.isFavorite })}
              className="p-1 text-gray-300 hover:text-yellow-400 transition-colors"
              title={task.isFavorite ? 'Verwijder favoriet' : 'Markeer als favoriet'}
            >
              {task.isFavorite ? <Star size={14} className="fill-yellow-400 text-yellow-400" /> : <StarOff size={14} />}
            </button>
            <button
              onClick={() => setModal(task)}
              className="p-1 text-gray-300 hover:text-teal-500 transition-colors"
              title="Bewerken"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
              title="Verwijderen"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  function Group({ label, items, accent }: { label: string; items: Task[]; accent?: string }) {
    if (items.length === 0) return null
    return (
      <div>
        <h4 className={cn('text-xs font-semibold uppercase tracking-wider mb-2', accent ?? 'text-gray-400')}>
          {label} <span className="font-normal normal-case tracking-normal">({items.length})</span>
        </h4>
        <div className="space-y-2">
          {items.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex justify-end">
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Plus size={13} />
          Nieuwe taak
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {active.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <ListTodo size={32} className="opacity-30" />
            <p className="text-sm">Geen actieve taken</p>
          </div>
        )}
        <Group label="Verlopen" items={groups.overdue} accent="text-red-500" />
        <Group label="Vandaag" items={groups.today} accent="text-teal-600" />
        <Group label="⭐ Favorieten" items={groups.favorites} accent="text-yellow-500" />
        <Group label="Deze week" items={groups.week} />
        <Group label="Later" items={groups.later} />
        <Group label="Geen datum" items={groups.noDate} />
      </div>

      {modal === 'new' && (
        <TaskModal
          machines={machines}
          employees={employees}
          onClose={() => setModal(null)}
          onSave={(data) => { onCreate(data); setModal(null) }}
          onCreateAndAssign={(data, assignedToId) => { onCreateAndAssign(data, assignedToId); setModal(null) }}
        />
      )}
      {modal && modal !== 'new' && (
        <TaskModal
          initial={modal}
          machines={machines}
          employees={employees}
          onClose={() => setModal(null)}
          onSave={(data) => { onUpdate((modal as Task).id, data); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Tab: Toewijzingen ──────────────────────────────────────────────────────

function ToewijzingenTab({
  incoming,
  assigned,
  employees,
  machines,
  onAccept,
  onReject,
}: {
  incoming: Task[]
  assigned: Task[]
  employees: Employee[]
  machines: Machine[]
  onAccept: (id: string) => void
  onReject: (id: string) => void
}) {
  function empName(id: string | null) {
    return employees.find((e) => e.id === id)?.name ?? id ?? '—'
  }
  function machineNames(ids: string[] | null) {
    if (!ids?.length) return null
    return ids.map((id) => machines.find((m) => m.id === id)?.name).filter(Boolean).join(', ')
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-3">
          Aan mij toegewezen — in afwachting ({incoming.length})
        </h4>
        {incoming.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Geen openstaande toewijzingen</p>
        ) : (
          <div className="space-y-2">
            {incoming.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  <PriorityBadge priority={t.priority} />
                </div>
                <p className="text-xs text-gray-400 mb-1">
                  Van: <span className="font-medium text-gray-600">{t.assignedByName ?? empName(t.assignedById)}</span>
                </p>
                {machineNames(t.machineIds) && (
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                    <Wrench size={10} /> {machineNames(t.machineIds)}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => onAccept(t.id)}
                    className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Accepteren
                  </button>
                  <button
                    onClick={() => onReject(t.id)}
                    className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Afwijzen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Door mij toegewezen ({assigned.filter((t) => t.assignedToId).length})
        </h4>
        {assigned.filter((t) => t.assignedToId).length === 0 ? (
          <p className="text-sm text-gray-400 italic">Geen uitstaande toewijzingen</p>
        ) : (
          <div className="space-y-2">
            {assigned.filter((t) => t.assignedToId).map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-800">{t.title}</p>
                  <span className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded',
                    t.assignmentStatus === 'geaccepteerd' ? 'bg-green-100 text-green-700' :
                    t.assignmentStatus === 'in_afwachting' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500',
                  )}>
                    {t.assignmentStatus === 'geaccepteerd' ? 'Geaccepteerd' :
                     t.assignmentStatus === 'in_afwachting' ? 'In afwachting' :
                     t.assignmentStatus ?? '—'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Aan: <span className="font-medium text-gray-600">{empName(t.assignedToId)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Archief ───────────────────────────────────────────────────────────

function ArchiefTab({
  tasks,
  machines,
  onDelete,
}: {
  tasks: Task[]
  machines: Machine[]
  onDelete: (id: string) => void
}) {
  const archived = tasks
    .filter((t) => t.status === 'gereed' || t.status === 'gearchiveerd')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {archived.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Archive size={32} className="opacity-30" />
          <p className="text-sm">Geen gearchiveerde taken</p>
        </div>
      ) : (
        <div className="space-y-2">
          {archived.map((t) => {
            const taskMachineNames = t.machineIds?.length
              ? machines.filter((m) => t.machineIds.includes(m.id)).map((m) => m.name).join(', ')
              : null
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600 line-through">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PriorityBadge priority={t.priority} />
                    <span className="text-xs text-gray-400">{formatDate(t.updatedAt)}</span>
                    {taskMachineNames && (
                      <span className="text-xs text-gray-400 flex items-center gap-0.5">
                        <Wrench size={10} /> {taskMachineNames}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(t.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  title="Verwijderen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function MijnTakenTodoContent() {
  const [tab, setTab] = useState<TabKey>('taken')
  const qc = useQueryClient()

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['my-tasks'],
    queryFn: () => apiFetch('/kiosk/tasks/my'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const { data: incomingTasks = [] } = useQuery<Task[]>({
    queryKey: ['incoming-tasks'],
    queryFn: () => apiFetch('/kiosk/tasks/incoming'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const { data: machineList = [] } = useQuery<Machine[]>({
    queryKey: ['kiosk-machines'],
    queryFn: () => apiFetch('/kiosk/machines'),
    staleTime: 60_000,
  })

  const { data: employeeList = [] } = useQuery<Employee[]>({
    queryKey: ['kiosk-employees'],
    queryFn: () => apiFetch('/kiosk/employees'),
    staleTime: 120_000,
  })

  const createTask = useMutation({
    mutationFn: (data: Partial<Task>) => apiFetch<Task>('/kiosk/tasks', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['task-counts'] })
    },
  })

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) =>
      apiFetch(`/kiosk/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['task-counts'] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['task-counts'] })
    },
  })

  const assignTask = useMutation({
    mutationFn: ({ id, assignedToId }: { id: string; assignedToId: string }) =>
      apiFetch(`/kiosk/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignedToId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })

  const acceptTask = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/tasks/${id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incoming-tasks'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['task-counts'] })
    },
  })

  const rejectTask = useMutation({
    mutationFn: (id: string) => apiFetch(`/kiosk/tasks/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incoming-tasks'] })
    },
  })

  const incomingCount = incomingTasks.length

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'taken', label: 'Taken' },
    { key: 'toewijzingen', label: 'Toewijzingen', badge: incomingCount },
    { key: 'archief', label: 'Archief' },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <h2 className="text-base font-semibold text-gray-800">Mijn taken</h2>
        <p className="text-xs text-gray-400 mt-0.5">Persoonlijke to-do lijst</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white shrink-0 px-4">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === key
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className="text-xs bg-amber-500 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'taken' && (
          <TakenTab
            tasks={allTasks}
            machines={machineList}
            employees={employeeList}
            onCreate={(data) => createTask.mutate(data)}
            onUpdate={(id, data) => updateTask.mutate({ id, data })}
            onDelete={(id) => deleteTask.mutate(id)}
            onCreateAndAssign={async (data, assignedToId) => {
              const task = await createTask.mutateAsync(data)
              assignTask.mutate({ id: task.id, assignedToId })
            }}
          />
        )}
        {tab === 'toewijzingen' && (
          <ToewijzingenTab
            incoming={incomingTasks}
            assigned={allTasks}
            employees={employeeList}
            machines={machineList}
            onAccept={(id) => acceptTask.mutate(id)}
            onReject={(id) => rejectTask.mutate(id)}
          />
        )}
        {tab === 'archief' && (
          <ArchiefTab
            tasks={allTasks}
            machines={machineList}
            onDelete={(id) => deleteTask.mutate(id)}
          />
        )}
      </div>
    </div>
  )
}
