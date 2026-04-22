import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Users, Map, Save, Check } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'
import { apiFetch } from '@/lib/api'

const cards = [
  {
    to: '/admin/bc-config',
    icon: Link2,
    title: 'BC Configuratie',
    description: 'Business Central OAuth2 koppeling instellen en testen',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    to: '/admin/employees',
    icon: Users,
    title: 'Medewerkers',
    description: 'Medewerkers beheren, rollen toewijzen en PIN instellen',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    to: '/admin/bc-field-map',
    icon: Map,
    title: 'Veldmapping',
    description: 'Automatisch gedetecteerde BC veldnamen controleren',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
]

function WinToolPathSetting() {
  const [path, setPath]     = useState('')
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ path: string | null }>('/admin/cnc/wintool-path')
      .then(data => setPath(data.path ?? ''))
      .catch(() => {/* stil falen — instelling is optioneel */})
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/admin/cnc/wintool-path', {
        method: 'PUT',
        body: JSON.stringify({ path }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 text-sm mb-1">WinTool database pad</h3>
      <p className="text-xs text-gray-400 mb-3">
        Pad naar het .db bestand op de gemounte netwerkshare (bijv. /wintool/Dutch-Shape_2025.db)
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={path}
          onChange={e => setPath(e.target.value)}
          placeholder="/wintool/Dutch-Shape_2025.db"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saved
            ? <><Check size={14} /> Opgeslagen</>
            : <><Save size={14} /> Opslaan</>
          }
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export default function AdminHome() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Dashboard</h1>
        <p className="text-sm text-gray-400 mb-8">Factory Assistant — Beheer</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ to, icon: Icon, title, description, color, bg }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md transition-shadow"
            >
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${bg} mb-3`}>
                <Icon size={20} className={color} />
              </div>
              <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
              <p className="text-xs text-gray-400 mt-1">{description}</p>
            </button>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Systeem</h2>
          <div className="max-w-xl">
            <WinToolPathSetting />
          </div>
        </div>
      </main>
    </div>
  )
}
