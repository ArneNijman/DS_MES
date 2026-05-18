import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Key, Trash2, User, Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'
import { apiFetch } from '@/lib/api'
import { SIDEBAR_MODULES } from '@/lib/modules'

interface Employee {
  id: string
  name: string
  email: string | null
  photoUrl: string | null
  isClockedIn: boolean
  role: string
  bcId: string | null
}

const ROLES = [
  { value: 'operator_lassen',     label: 'Operator lassen'     },
  { value: 'operator_frezen',     label: 'Operator frezen'     },
  { value: 'operator_assemblage', label: 'Operator assemblage' },
  { value: 'cam',                 label: 'CAM'                 },
  { value: 'productie_engineer',  label: 'Productie engineer'  },
  { value: 'projectmanager',      label: 'Project manager'     },
  { value: 'manager',             label: 'Manager'             },
  { value: 'quality',             label: 'Kwaliteit'           },
  { value: 'admin',               label: 'Beheerder'           },
]

// Rollen waarvan module-toegang instelbaar is (admin = altijd alles)
const CONFIGURABLE_ROLES = ROLES.filter(r => r.value !== 'admin')

export default function AdminEmployees() {
  const qc = useQueryClient()
  const [feedback, setFeedback] = useState<{ id: string; msg: string } | null>(null)
  const [pinModal, setPinModal] = useState<{ id: string; name: string } | null>(null)
  const [pinValue, setPinValue] = useState('')
  const [createModal, setCreateModal] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', email: '', role: 'operator_frezen' })
  const [openRoleKey, setOpenRoleKey] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const showFeedback = (id: string, msg: string) => {
    setFeedback({ id, msg })
    setTimeout(() => setFeedback(null), 3000)
  }

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['admin-employees'],
    queryFn: () => apiFetch('/admin/employees'),
  })

  const roleM = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiFetch(`/admin/employees/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); showFeedback(id, 'Rol opgeslagen') },
  })

  const pinM = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) =>
      apiFetch(`/admin/employees/${id}/pin`, { method: 'PUT', body: JSON.stringify({ pin }) }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); setPinModal(null); setPinValue(''); showFeedback(id, 'PIN ingesteld') },
  })

  const clearPinM = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/employees/${id}/pin`, { method: 'DELETE' }),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); showFeedback(id, 'PIN verwijderd') },
  })

  const photoM = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData(); fd.append('file', file)
      return apiFetch(`/admin/employees/${id}/photo`, { method: 'POST', body: fd })
    },
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); showFeedback(id, 'Foto opgeslagen') },
  })

  const createM = useMutation({
    mutationFn: (data: { name: string; email: string | null; role: string }) =>
      apiFetch('/admin/employees', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] })
      setCreateModal(false)
      setNewForm({ name: '', email: '', role: 'operator_frezen' })
    },
  })

  const { data: permissions = {} } = useQuery<Record<string, string[]>>({
    queryKey: ['admin-role-permissions'],
    queryFn: () => apiFetch('/admin/role-permissions'),
  })

  const savePermM = useMutation({
    mutationFn: ({ role, modules }: { role: string; modules: string[] }) =>
      apiFetch(`/admin/role-permissions/${role}`, { method: 'PUT', body: JSON.stringify({ modules }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-role-permissions'] }),
  })

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Medewerkers</h1>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} /> Medewerker toevoegen
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Laden...</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Medewerker</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Rol</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt={emp.name} className="w-full h-full object-cover" />
                          ) : (
                            <User size={14} className="text-gray-400" />
                          )}
                        </div>
                        <span className="font-medium text-gray-800">{emp.name}</span>
                        {feedback?.id === emp.id && (
                          <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">{feedback.msg}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{emp.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={emp.role}
                        onChange={(e) => roleM.mutate({ id: emp.id, role: e.target.value })}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.isClockedIn ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.isClockedIn ? 'Aanwezig' : 'Afwezig'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Foto uploaden */}
                        <input
                          ref={(el) => { fileRefs.current[emp.id] = el }}
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) photoM.mutate({ id: emp.id, file })
                          }}
                        />
                        <button
                          onClick={() => fileRefs.current[emp.id]?.click()}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Foto uploaden"
                        >
                          <Upload size={14} />
                        </button>

                        {/* PIN instellen */}
                        <button
                          onClick={() => { setPinModal({ id: emp.id, name: emp.name }); setPinValue('') }}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                          title="PIN instellen"
                        >
                          <Key size={14} />
                        </button>

                        {/* PIN verwijderen */}
                        <button
                          onClick={() => clearPinM.mutate(emp.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                          title="PIN verwijderen"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Medewerker aanmaken modal */}
        {createModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-96">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Medewerker toevoegen</h3>
                <button onClick={() => setCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Naam *</label>
                  <input
                    type="text"
                    value={newForm.name}
                    onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Voor- en achternaam"
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">E-mailadres</label>
                  <input
                    type="email"
                    value={newForm.email}
                    onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="naam@dutch-shape.nl"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rol</label>
                  <select
                    value={newForm.role}
                    onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setCreateModal(false)}
                  className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  disabled={!newForm.name.trim() || createM.isPending}
                  onClick={() => createM.mutate({
                    name: newForm.name.trim(),
                    email: newForm.email.trim() || null,
                    role: newForm.role,
                  })}
                  className="flex-1 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
                >
                  {createM.isPending ? 'Opslaan...' : 'Toevoegen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Module-toegang per rol */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Module-toegang per rol</h2>
          <p className="text-xs text-gray-400 mb-4">Stel in welke kiosk-modules elke rol mag zien. Beheerder heeft altijd toegang tot alles.</p>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {CONFIGURABLE_ROLES.map(r => {
              const allowed = permissions[r.value] ?? []
              const isOpen = openRoleKey === r.value
              return (
                <div key={r.value}>
                  <button
                    onClick={() => setOpenRoleKey(isOpen ? null : r.value)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      <span className="text-sm font-medium text-gray-800">{r.label}</span>
                    </div>
                    <span className="text-xs text-gray-400">{allowed.length}/{SIDEBAR_MODULES.length} modules</span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {SIDEBAR_MODULES.map(m => {
                          const checked = allowed.includes(m.key)
                          return (
                            <label key={m.key} className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? allowed.filter(k => k !== m.key)
                                    : [...allowed, m.key]
                                  savePermM.mutate({ role: r.value, modules: next })
                                }}
                                className="accent-teal-600"
                              />
                              <span className="text-sm text-gray-700">{m.label}</span>
                            </label>
                          )
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => savePermM.mutate({ role: r.value, modules: SIDEBAR_MODULES.map(m => m.key) as unknown as string[] })}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          Alles aan
                        </button>
                        <button
                          onClick={() => savePermM.mutate({ role: r.value, modules: [] })}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          Alles uit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* PIN modal */}
        {pinModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-72">
              <h3 className="font-semibold text-gray-800 mb-1">PIN instellen</h3>
              <p className="text-xs text-gray-400 mb-4">{pinModal.name}</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                placeholder="4 cijfers"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-400 mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setPinModal(null)}
                  className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuleren
                </button>
                <button
                  disabled={pinValue.length !== 4}
                  onClick={() => pinM.mutate({ id: pinModal.id, pin: pinValue })}
                  className="flex-1 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
                >
                  Opslaan
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
