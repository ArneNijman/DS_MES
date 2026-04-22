import { useNavigate } from 'react-router-dom'
import { Link2, Users, Map } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'

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
      </main>
    </div>
  )
}
