import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, ChevronDown } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { EMPLOYEE_TOKEN_KEY } from '@/lib/auth'
import { cn } from '@/lib/utils'

// ── Types (shared subset van NcrRegistration) ─────────────────────────────

export interface MyTaskNcr {
  id: string
  ncrId: string
  productionOrder: string | null
  itemRef: string | null
  itemName: string | null
  productionStep: string | null
  writtenByName: string | null
  writtenByDepartment: string | null
  causingDepartment: string | null
  faultCode: string | null
  causeCode: string | null
  shortDescription: string | null
  description: string | null
  measureRequired: boolean | null
  peEmail: string | null
  assignedToId: string | null
  solution: string | null
  dispositionType: string | null
  resolvedBy: string | null
  closedBy: string | null
  closedAt: string | null
  status: 'open' | 'in_behandeling' | 'in_uitvoering' | 'gereed' | 'gesloten' | 'vervallen'
  createdById: string | null
  createdAt: string
  updatedAt: string
}

// ── Calibration alert types ───────────────────────────────────────────────

interface CalAlertTool {
  id: string
  toolId: string
  artikelnaam: string | null
  locatie: string | null
  interval: string | null
}

interface CalAlerts {
  verlopen: CalAlertTool[]
  kritisch: CalAlertTool[]
}

// ── Hook — deelt cache met dashboard badge ────────────────────────────────

export function useMyTaskCount(): number {
  const { data: ncr = [] } = useQuery<MyTaskNcr[]>({
    queryKey: ['ncr-my-tasks'],
    queryFn: () => apiFetch('/kiosk/ncr/my-tasks'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    enabled: !!localStorage.getItem(EMPLOYEE_TOKEN_KEY),
  })
  const { data: cal = { verlopen: [], kritisch: [] } } = useQuery<CalAlerts>({
    queryKey: ['cal-alerts'],
    queryFn: () => apiFetch('/kiosk/meetmiddelen/calibration-alerts'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    enabled: !!localStorage.getItem(EMPLOYEE_TOKEN_KEY),
  })
  return ncr.length + cal.verlopen.length + cal.kritisch.length
}

// ── Helpers ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; border: string; badge: string }> = {
  open:           { label: 'Open',           border: 'border-l-blue-500',  badge: 'bg-blue-100 text-blue-700'   },
  in_behandeling: { label: 'In behandeling', border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700' },
  in_uitvoering:  { label: 'In uitvoering',  border: 'border-l-teal-500',  badge: 'bg-teal-100 text-teal-700'   },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── MijnTakenContent ──────────────────────────────────────────────────────

interface MijnTakenContentProps {
  onOpenNcr: (ncr: MyTaskNcr) => void
  onNavigateToTool: (toolId: string) => void
}

export function MijnTakenContent({ onOpenNcr, onNavigateToTool }: MijnTakenContentProps) {
  const qc = useQueryClient()
  const [alertsExpanded, setAlertsExpanded] = useState(false)
  const [ncrExpanded, setNcrExpanded] = useState(false)

  const { data: tasks = [], isLoading } = useQuery<MyTaskNcr[]>({
    queryKey: ['ncr-my-tasks'],
    queryFn: () => apiFetch('/kiosk/ncr/my-tasks'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const { data: calAlerts = { verlopen: [], kritisch: [] } } = useQuery<CalAlerts>({
    queryKey: ['cal-alerts'],
    queryFn: () => apiFetch('/kiosk/meetmiddelen/calibration-alerts'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })
  const totalAlerts = calAlerts.verlopen.length + calAlerts.kritisch.length

  const grouped = {
    open:           tasks.filter((t) => t.status === 'open'),
    in_behandeling: tasks.filter((t) => t.status === 'in_behandeling'),
    in_uitvoering:  tasks.filter((t) => t.status === 'in_uitvoering'),
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Laden...
      </div>
    )
  }

  if (tasks.length === 0 && totalAlerts === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <CheckSquare size={36} className="opacity-30" />
        <p className="text-sm">Geen openstaande meldingen</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Topbalk */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Mijn meldingen</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {tasks.length > 0 && `${tasks.length} actieve NCR${tasks.length !== 1 ? "'s" : ''}`}
            {tasks.length > 0 && totalAlerts > 0 && ' · '}
            {totalAlerts > 0 && `${totalAlerts} kalibratie melding${totalAlerts !== 1 ? 'en' : ''}`}
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['ncr-my-tasks'] })}
          className="text-xs text-teal-600 hover:underline"
        >
          Vernieuwen
        </button>
      </div>

      {/* Kaarten per status */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Kalibratie meldingen collectie ── */}
        {totalAlerts > 0 && (
          <div>
            <button
              onClick={() => setAlertsExpanded(e => !e)}
              className={cn(
                'w-full text-left bg-white rounded-xl border border-l-4 shadow-sm hover:shadow-md transition-shadow p-4',
                calAlerts.verlopen.length > 0 ? 'border-l-red-500' : 'border-l-orange-400',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Kalibratie meldingen</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {calAlerts.verlopen.length > 0 && (
                      <span className="text-red-600 font-medium">{calAlerts.verlopen.length} verlopen</span>
                    )}
                    {calAlerts.verlopen.length > 0 && calAlerts.kritisch.length > 0 && ' · '}
                    {calAlerts.kritisch.length > 0 && (
                      <span className="text-orange-500 font-medium">{calAlerts.kritisch.length} kritisch</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    calAlerts.verlopen.length > 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
                  )}>
                    {totalAlerts}
                  </span>
                  <ChevronDown size={16} className={cn('text-gray-400 transition-transform', alertsExpanded && 'rotate-180')} />
                </div>
              </div>
            </button>

            {alertsExpanded && (
              <div className="mt-2 space-y-1.5 pl-1">
                {[
                  ...calAlerts.verlopen.map(t => ({ ...t, alertStatus: 'verlopen' as const })),
                  ...calAlerts.kritisch.map(t => ({ ...t, alertStatus: 'kritisch' as const })),
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onNavigateToTool(t.id)}
                    className={cn(
                      'w-full text-left bg-white rounded-lg border border-l-4 px-3 py-2.5 hover:shadow-md transition-shadow',
                      t.alertStatus === 'verlopen' ? 'border-l-red-400' : 'border-l-orange-300',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-gray-400">{t.toolId}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full font-medium',
                          t.alertStatus === 'verlopen' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
                        )}>
                          {t.alertStatus === 'verlopen' ? 'Verlopen' : 'Kritisch'}
                        </span>
                        <span className="text-xs text-teal-500 font-medium">Openen →</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{t.artikelnaam ?? '—'}</p>
                    {t.locatie && <p className="text-xs text-gray-400 truncate">{t.locatie}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NCR meldingen collectie ── */}
        {tasks.length > 0 && (
          <div>
            <button
              onClick={() => setNcrExpanded(e => !e)}
              className="w-full text-left bg-white rounded-xl border border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">NCR meldingen</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex gap-2">
                    {grouped.open.length > 0 && (
                      <span className="text-blue-600 font-medium">{grouped.open.length} open</span>
                    )}
                    {grouped.in_behandeling.length > 0 && (
                      <span className="text-amber-600 font-medium">{grouped.in_behandeling.length} in behandeling</span>
                    )}
                    {grouped.in_uitvoering.length > 0 && (
                      <span className="text-teal-600 font-medium">{grouped.in_uitvoering.length} in uitvoering</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {tasks.length}
                  </span>
                  <ChevronDown size={16} className={cn('text-gray-400 transition-transform', ncrExpanded && 'rotate-180')} />
                </div>
              </div>
            </button>

            {ncrExpanded && (
              <div className="mt-2 space-y-1.5 pl-1">
                {tasks.map((task) => {
                  const meta = STATUS_META[task.status] ?? STATUS_META['open']
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'bg-white rounded-lg border border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer',
                        meta.border,
                      )}
                      onClick={() => onOpenNcr(task)}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-xs font-bold text-gray-700 font-mono">{task.ncrId}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', meta.badge)}>
                              {meta.label}
                            </span>
                            <span className="text-xs text-gray-400">{formatDate(task.createdAt)}</span>
                          </div>
                        </div>
                        {(task.faultCode || task.causeCode) && (
                          <p className="text-sm font-semibold text-gray-800 mb-1">
                            {task.faultCode}{task.faultCode && task.causeCode ? ' · ' : ''}{task.causeCode}
                          </p>
                        )}
                        <div className="space-y-0.5">
                          {task.productionOrder && (
                            <p className="text-xs text-gray-500">
                              <span className="text-gray-400">Order </span>{task.productionOrder}
                            </p>
                          )}
                          {task.itemRef && (
                            <p className="text-xs text-gray-500">
                              <span className="text-gray-400">Ref </span>{task.itemRef}
                            </p>
                          )}
                          {task.shortDescription && (
                            <p className="text-xs text-gray-400 truncate mt-1 italic">{task.shortDescription}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end px-3 pb-2">
                        <span className="text-xs text-teal-500 font-medium">Openen →</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
