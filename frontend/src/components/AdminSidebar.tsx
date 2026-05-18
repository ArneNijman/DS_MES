import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Link2, Map, LogOut, Activity } from 'lucide-react'
import { removeToken } from '@/lib/auth'
import { cn } from '@/lib/utils'

const VERSION = '2.0.0'

const navItems = [
  { to: '/admin/home',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/employees',        icon: Users,           label: 'Medewerkers' },
  { to: '/admin/machine-dashboard',icon: Activity,        label: 'Machine Dashboard' },
  { to: '/admin/bc-config',        icon: Link2,           label: 'BC Configuratie' },
  { to: '/admin/bc-field-map',     icon: Map,             label: 'Veldmapping' },
]

export default function AdminSidebar() {
  const navigate = useNavigate()

  const handleLogout = () => {
    removeToken('admin')
    navigate('/admin/login')
  }

  return (
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
  )
}
