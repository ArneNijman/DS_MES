import { useState } from 'react'
import { ChevronLeft, Search, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Machine {
  id: string
  machineId: string | null
  name: string
  category: string
  photoUrl?: string | null
}

interface Props {
  machines: Machine[]
  onSelect: (machine: Machine) => void
  onClose: () => void
}

export default function MachinePicker({ machines, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')

  const filtered = machines.filter((m) => {
    const q = query.toLowerCase()
    return (
      m.name.toLowerCase().includes(q) ||
      (m.machineId ?? '').toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    )
  })

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-semibold text-gray-800">Selecteer machine</h3>
        </div>

        {/* Zoekbalk */}
        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Zoek op naam, ID of categorie…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
        </div>

        {/* Tegel-grid */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Geen machines gevonden</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((machine) => (
                <button
                  key={machine.id}
                  onClick={() => onSelect(machine)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200',
                    'hover:border-teal-400 hover:bg-teal-50 transition-colors text-center',
                  )}
                >
                  {machine.photoUrl ? (
                    <img
                      src={machine.photoUrl}
                      alt={machine.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Cpu size={28} className="text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 w-full">
                    <p className="text-xs font-semibold text-gray-800 truncate">{machine.name}</p>
                    {machine.machineId && (
                      <p className="text-xs text-gray-400 truncate">{machine.machineId}</p>
                    )}
                    <p className="text-xs text-gray-400 truncate">{machine.category}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
