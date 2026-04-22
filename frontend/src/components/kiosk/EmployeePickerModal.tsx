import { ChevronLeft } from 'lucide-react'
import EmployeeGrid from './EmployeeGrid'

interface Employee {
  id: string
  name: string
  photoUrl?: string | null
  isClockedIn?: boolean
  hasPin?: boolean
}

interface Props {
  employees: Employee[]
  selected: string | null
  title?: string
  onSelect: (emp: Employee) => void
  onClose: () => void
}

export default function EmployeePickerModal({ employees, title = 'Selecteer medewerker', onSelect, onClose }: Props) {
  // Normaliseer zodat EmployeeGrid altijd de vereiste velden heeft
  const normalized = employees.map((e) => ({
    ...e,
    isClockedIn: e.isClockedIn ?? false,
    hasPin:      e.hasPin      ?? false,
  }))

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>

        {/* Grid — EmployeeGrid heeft eigen zoekbalk */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          <EmployeeGrid
            employees={normalized}
            onSelect={(id) => {
              const emp = employees.find((e) => e.id === id)
              if (emp) onSelect(emp)
            }}
          />
        </div>
      </div>
    </div>
  )
}
