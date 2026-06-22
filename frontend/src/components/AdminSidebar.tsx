import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Link2, Map, LogOut, Activity, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { removeToken } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

const VERSION = '2.0.0'

const navItems = [
  { to: '/admin/home',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/employees',        icon: Users,           label: 'Medewerkers' },
  { to: '/admin/machine-dashboard',icon: Activity,        label: 'Machine Dashboard' },
  { to: '/admin/bc-config',        icon: Link2,           label: 'BC Configuratie' },
  { to: '/admin/bc-field-map',     icon: Map,             label: 'Veldmapping' },
]

type CheckStatus = 'ok' | 'warn' | 'fail'
interface HealthCheck { name: string; status: CheckStatus; detail?: string }
interface HealthResponse { status: CheckStatus; checks: HealthCheck[] }

const statusColor: Record<CheckStatus, string> = {
  ok:   'bg-green-500',
  warn: 'bg-orange-400',
  fail: 'bg-red-500',
}
const statusLabel: Record<CheckStatus, string> = {
  ok:   'Alles OK',
  warn: 'Waarschuwing',
  fail: 'Fout',
}

function HealthModal({ data, onClose }: { data: HealthResponse; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-96 max-w-[90vw] p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Systeemgezondheid</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {data.checks.map(check => (
            <div key={check.name} className="flex items-start gap-3">
              <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', statusColor[check.status])} />
              <div>
                <p className="text-sm font-medium text-gray-800">{check.name}</p>
                {check.detail && (
                  <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-4">Vernieuwd elke 5 minuten</p>
      </div>
    </div>
  )
}

export default function AdminSidebar() {
  const navigate = useNavigate()
  const [healthOpen, setHealthOpen] = useState(false)

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ['admin-system-health'],
    queryFn: () => apiFetch('/admin/system-health') as Promise<HealthResponse>,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const handleLogout = () => {
    removeToken('admin')
    navigate('/admin/login')
  }

  return (
    <>
      <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-white shrink-0">
        {/* Logo / titel */}
        <div className="px-4 pt-6 pb-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-sm">
              FA
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Factory Assistant</p>
              <p className="text-[10px] text-gray-400 leading-tight">v{VERSION}</p>
            </div>
          </div>
        </div>

        {/* Navigatie */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Status-dot */}
        {health && (
          <div className="px-2 pb-2">
            <button
              onClick={() => setHealthOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor[health.status])} />
              <span className="text-xs">{statusLabel[health.status]}</span>
            </button>
          </div>
        )}

        {/* Uitloggen */}
        <div className="px-2 pb-4 border-t border-gray-700 pt-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full"
          >
            <LogOut size={16} />
            Uitloggen
          </button>
        </div>
      </aside>

      {healthOpen && health && (
        <HealthModal data={health} onClose={() => setHealthOpen(false)} />
      )}
    </>
  )
}
