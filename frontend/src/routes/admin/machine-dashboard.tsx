import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import AdminSidebar from '@/components/AdminSidebar'

// ── Types ──────────────────────────────────────────────────────────────────

interface DowntimePeriod {
  type: 'offline' | 'alarmstilstand' | 'stilstand' | 'wachttijd'
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  isOngoing: boolean
}

interface MachineSummary {
  id: string
  name: string
  availabilityPct: number
  totalDowntimeMinutes: number
  byType: { offline: number; alarmstilstand: number; stilstand: number; wachttijd: number }
  ongoingPeriod: DowntimePeriod | null
  periods: DowntimePeriod[]
}

interface DashboardData {
  machines: MachineSummary[]
  days: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DOWNTIME_COLOR: Record<string, string> = {
  offline:        'bg-gray-400',
  alarmstilstand: 'bg-red-500',
  stilstand:      'bg-amber-400',
  wachttijd:      'bg-orange-400',
}

const DOWNTIME_BADGE: Record<string, string> = {
  offline:        'bg-gray-100 text-gray-600',
  alarmstilstand: 'bg-red-100 text-red-700',
  stilstand:      'bg-amber-100 text-amber-700',
  wachttijd:      'bg-orange-100 text-orange-700',
}

const DOWNTIME_LABEL: Record<string, string> = {
  offline:        'Offline',
  alarmstilstand: 'Alarmstilstand',
  stilstand:      'Stilstand',
  wachttijd:      'Wachttijd',
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}u ${m > 0 ? `${m}m` : ''}`
  return `${m}m`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `vandaag ${time}`
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) + ' ' + time
}

// ── Availability bar ───────────────────────────────────────────────────────

function AvailabilityBar({ machine }: { machine: MachineSummary }) {
  const avail = machine.availabilityPct
  const color = avail >= 90 ? 'bg-green-500' : avail >= 75 ? 'bg-amber-400' : 'bg-red-500'
  const total = machine.totalDowntimeMinutes

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-gray-50 border border-gray-100">
      <div className="w-40 shrink-0">
        <p className="text-sm font-medium text-gray-800 truncate">{machine.name}</p>
        {machine.ongoingPeriod && (
          <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', DOWNTIME_BADGE[machine.ongoingPeriod.type])}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
            {DOWNTIME_LABEL[machine.ongoingPeriod.type]}
          </span>
        )}
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', color)}
            style={{ width: `${avail}%` }}
          />
        </div>
        <span className={cn('text-sm font-semibold w-10 text-right shrink-0', color.replace('bg-', 'text-'))}>
          {avail}%
        </span>
      </div>

      <div className="text-xs text-gray-400 w-36 text-right shrink-0">
        {total > 0 ? (
          <span className="text-gray-600">
            {formatDuration(total)} stilstand
          </span>
        ) : (
          <span className="text-green-600">Geen stilstand ✓</span>
        )}
      </div>

      {/* Type breakdown dots */}
      <div className="flex items-center gap-1.5 shrink-0">
        {(['alarmstilstand', 'stilstand', 'offline', 'wachttijd'] as const).map((type) => {
          const mins = machine.byType[type]
          if (!mins) return null
          return (
            <span key={type} className={cn('px-1.5 py-0.5 rounded text-xs font-medium', DOWNTIME_BADGE[type])}>
              {DOWNTIME_LABEL[type].replace('stilstand', '').trim() || DOWNTIME_LABEL[type]} {formatDuration(mins)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Recent downtime table ──────────────────────────────────────────────────

function RecentDowntimeTable({ data }: { data: DashboardData }) {
  const rows = data.machines
    .flatMap(m => m.periods.map(p => ({ ...p, machineName: m.name })))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 30)

  if (!rows.length) return (
    <p className="text-sm text-gray-400 text-center py-8">Geen stilstand in de geselecteerde periode</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            <th className="text-left pb-2 font-medium">Machine</th>
            <th className="text-left pb-2 font-medium">Type</th>
            <th className="text-left pb-2 font-medium">Gestart</th>
            <th className="text-left pb-2 font-medium">Duur</th>
            <th className="text-left pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="py-2.5 pr-4 text-xs font-medium text-gray-800">{row.machineName}</td>
              <td className="py-2.5 pr-4">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', DOWNTIME_BADGE[row.type])}>
                  {DOWNTIME_LABEL[row.type]}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-xs text-gray-500 whitespace-nowrap">{formatTime(row.startedAt)}</td>
              <td className="py-2.5 pr-4 text-xs text-gray-700 font-medium">
                {row.durationSeconds !== null ? formatDuration(Math.round(row.durationSeconds / 60)) : '—'}
              </td>
              <td className="py-2.5">
                {row.isOngoing ? (
                  <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Lopend
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Afgerond</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 1,  label: 'Vandaag' },
  { value: 7,  label: '7 dagen' },
  { value: 30, label: '30 dagen' },
]

export default function MachineDashboard() {
  const [days, setDays] = useState(7)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['machine-downtime-all', days],
    queryFn:  () => apiFetch(`/admin/cnc-downtime/all?days=${days}`) as Promise<DashboardData>,
    refetchInterval: 30_000,
  })

  const totalDowntime = data?.machines.reduce((s, m) => s + m.totalDowntimeMinutes, 0) ?? 0
  const ongoingCount  = data?.machines.filter(m => m.ongoingPeriod).length ?? 0

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 bg-gray-50 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/admin/machines')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Activity size={18} className="text-red-500" /> Machine Dashboard
              </h1>
              <p className="text-xs text-gray-400">Automatische downtime-detectie — Freesmachines</p>
            </div>
          </div>

          {/* Periode filter + samenvatting */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1.5">
              {PERIOD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDays(value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    days === value ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {ongoingCount > 0 && (
                <span className="flex items-center gap-1.5 text-red-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {ongoingCount} lopende stilstand{ongoingCount > 1 ? 'en' : ''}
                </span>
              )}
              {totalDowntime > 0 && (
                <span>Totaal: {formatDuration(totalDowntime)} stilstand</span>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-16">Laden...</p>
          ) : !data?.machines.length ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <Activity size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Geen Freesmachines gevonden</p>
            </div>
          ) : (
            <>
              {/* Beschikbaarheid bars */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Beschikbaarheid</h2>
                <div className="space-y-1">
                  {data.machines
                    .sort((a, b) => a.availabilityPct - b.availabilityPct)
                    .map(m => <AvailabilityBar key={m.id} machine={m} />)
                  }
                </div>
              </div>

              {/* Legenda */}
              <div className="flex gap-4 mb-5 text-xs text-gray-500">
                {(['alarmstilstand', 'stilstand', 'offline', 'wachttijd'] as const).map(type => (
                  <span key={type} className="flex items-center gap-1.5">
                    <span className={cn('w-2.5 h-2.5 rounded-sm', DOWNTIME_COLOR[type])} />
                    {DOWNTIME_LABEL[type]}
                  </span>
                ))}
              </div>

              {/* Recente downtime */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Recente stilstand</h2>
                <RecentDowntimeTable data={data} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
