import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'
import { apiFetch } from '@/lib/api'

interface FieldMapRow {
  id: number
  entityType: string
  logicalField: string
  detectedVariant: string
  exampleValue: string | null
  lastSeenAt: string
}

const ENTITY_LABELS: Record<string, string> = {
  employees: 'Medewerkers',
  projects: 'Projecten',
  jobTasks: 'Taakoverzicht',
  planningLines: 'Planningregels',
}

export default function AdminBcFieldMap() {
  const { data, isLoading, refetch, isFetching } = useQuery<Record<string, FieldMapRow[]>>({
    queryKey: ['bc-field-map'],
    queryFn: () => apiFetch('/admin/bc-field-map'),
  })

  const groups = Object.entries(data ?? {})

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Veldmapping</h1>
            <p className="text-sm text-gray-400">
              Automatisch gedetecteerde BC veldnaamvarianten — controleer na elke sync
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-white transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Vernieuwen
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Laden...</p>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-gray-400 text-sm">Nog geen veldmapping gevonden.</p>
            <p className="text-gray-300 text-xs mt-1">
              Start een BC sync om automatische detectie te activeren.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([entityType, rows]) => (
              <div key={entityType} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                  <h2 className="text-sm font-semibold text-gray-700">
                    {ENTITY_LABELS[entityType] ?? entityType}
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Logisch veld</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Gevonden variant</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Voorbeeldwaarde</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Laatste sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.logicalField}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">
                            {row.detectedVariant}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">
                          {row.exampleValue ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {new Date(row.lastSeenAt).toLocaleString('nl-NL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
