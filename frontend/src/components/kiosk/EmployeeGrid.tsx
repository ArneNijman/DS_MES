import { useState } from 'react'
import { Search } from 'lucide-react'
import EmployeeTile from './EmployeeTile'

interface Employee {
  id: string
  name: string
  photoUrl?: string | null
  isClockedIn: boolean
  hasPin: boolean
}

interface Props {
  employees: Employee[]
  onSelect: (id: string) => void
}

const INITIAL_LIMIT = 12

export default function EmployeeGrid({ employees, onSelect }: Props) {
  const [search, setSearch]     = useState('')
  const [showAll, setShowAll]   = useState(false)

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  )

  // Bij actief zoeken altijd alles tonen, anders beperken tot INITIAL_LIMIT
  const isSearching  = search.length > 0
  const visible      = isSearching || showAll ? filtered : filtered.slice(0, INITIAL_LIMIT)
  const hiddenCount  = filtered.length - INITIAL_LIMIT

  return (
    <div>
      {/* Zoekbalk */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Zoek medewerker..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowAll(false) }}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-6">Geen medewerkers gevonden</p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
            {visible.map((emp) => (
              <EmployeeTile
                key={emp.id}
                {...emp}
                onTap={onSelect}
              />
            ))}
          </div>

          {/* Toon meer / minder knop */}
          {!isSearching && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {showAll ? 'Toon minder' : `Toon meer (${hiddenCount})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
