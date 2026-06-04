import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import EmployeeGrid from '@/components/kiosk/EmployeeGrid'
import PinDialog from '@/components/kiosk/PinDialog'
import { apiFetch } from '@/lib/api'

interface Employee {
  id: string
  name: string
  photoUrl?: string | null
  isClockedIn: boolean
  hasPin: boolean
}

const VERSION = '2.0.0'

export default function KioskIndex() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Employee | null>(null)

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['kiosk-employees'],
    queryFn: () => apiFetch('/kiosk/employees', { skipAuth: true } as never),
    refetchInterval: 30_000,
  })

  const handlePinSuccess = () => {
    setSelected(null)
    navigate('/kiosk/dashboard')
  }

  return (
    <div className="relative min-h-screen">
      {/* Achtergrond — fixed, altijd volledig schermvullend */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: 'url(/dutch-shape-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="fixed inset-0 bg-black/40 -z-10" />

      {/* Inhoud — normale flow, kan scrollen */}
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Factory Assistant</h1>
          <p className="text-white/70 text-sm mt-1 drop-shadow">Manufacturing Execution System</p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
          <div className="px-6 pt-6 pb-4 shrink-0">
            <h2 className="text-center text-gray-700 font-medium">Selecteer je account</h2>
          </div>
          <div className="overflow-y-auto px-6 pb-2 flex-1 min-h-0">
            <EmployeeGrid
              employees={employees}
              onSelect={(id) => {
                const emp = employees.find((e) => e.id === id)
                if (emp) setSelected(emp)
              }}
            />
          </div>
          <div className="text-center px-6 py-4 shrink-0 border-t border-gray-100">
            <a
              href="/admin/login"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Admin login
            </a>
          </div>
        </div>
      </div>

      {/* Versienummer */}
      <p className="fixed bottom-3 right-4 text-white/40 text-xs">v{VERSION}</p>

      {/* PIN dialog */}
      {selected && (
        <PinDialog
          employeeId={selected.id}
          employeeName={selected.name}
          onSuccess={handlePinSuccess}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
