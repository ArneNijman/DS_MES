import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import AdminSidebar from '@/components/AdminSidebar'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertCircle, Clock, HardDrive, Cpu, Zap } from 'lucide-react'

type CheckStatus = 'ok' | 'warn' | 'fail'
interface HealthCheck { name: string; status: CheckStatus; detail?: string }
interface HealthResponse { status: CheckStatus; checks: HealthCheck[] }

interface RouteStats {
  route: string
  count: number
  avgMs: number
  minMs: number
  maxMs: number
  p95Ms: number
  errorCount: number
  errorsByCode: Record<string, number>
}

interface RequestRecord {
  method: string
  rawUrl: string
  statusCode: number
  durationMs: number
  timestamp: string
}

interface QueueStats {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

interface SystemMetrics {
  uptime: number
  memory: { heapUsedMb: number; heapTotalMb: number; rssMb: number }
  redis: { memoryMb: number; uptimeSeconds: number; connectedClients: number; role: string } | null
  queues: QueueStats[]
  recent: RequestRecord[]
  byRoute: RouteStats[]
}

function msColor(ms: number) {
  if (ms < 100) return 'text-green-600'
  if (ms < 500) return 'text-yellow-600'
  return 'text-red-600'
}

function statusColor(code: number) {
  if (code < 300) return 'text-green-600'
  if (code < 500) return 'text-orange-500'
  return 'text-red-600'
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}u`
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

const healthIcon: Record<CheckStatus, React.ReactNode> = {
  ok:   <CheckCircle2 size={16} className="text-green-500" />,
  warn: <AlertCircle  size={16} className="text-orange-400" />,
  fail: <XCircle      size={16} className="text-red-500" />,
}
const healthBg: Record<CheckStatus, string> = {
  ok:   'border-green-200 bg-green-50',
  warn: 'border-orange-200 bg-orange-50',
  fail: 'border-red-200 bg-red-50',
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function QueueBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', color)}>
      <strong>{value}</strong> {label}
    </span>
  )
}

export default function AdminSystem() {
  const { data: health, dataUpdatedAt: healthUpdated } = useQuery<HealthResponse>({
    queryKey:        ['admin-system-health'],
    queryFn:         () => apiFetch('/admin/system-health') as Promise<HealthResponse>,
    refetchInterval: 30_000,
  })

  const { data: metrics } = useQuery<SystemMetrics>({
    queryKey:        ['admin-system-metrics'],
    queryFn:         () => apiFetch('/admin/system-metrics') as Promise<SystemMetrics>,
    refetchInterval: 3_000,
  })

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50 overflow-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Systeem</h1>
        <p className="text-sm text-gray-400 mb-6">Gezondheid, prestaties en request monitoring</p>

        {/* Sectie A: Systeemgezondheid */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">Systeemgezondheid</h2>
            {healthUpdated > 0 && (
              <span className="text-xs text-gray-400">
                Bijgewerkt {new Date(healthUpdated).toLocaleTimeString('nl-NL')}
              </span>
            )}
          </div>
          {health ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {health.checks.map(check => (
                <div key={check.name} className={cn('rounded-xl border p-4', healthBg[check.status])}>
                  <div className="flex items-center gap-2 mb-1">
                    {healthIcon[check.status]}
                    <span className="text-sm font-medium text-gray-800">{check.name}</span>
                  </div>
                  {check.detail && <p className="text-xs text-gray-500 ml-6">{check.detail}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Laden...</p>
          )}
        </section>

        {/* Sectie B: Runtime, Redis, BullMQ */}
        {metrics && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-3">Runtime</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <StatChip icon={<Clock size={14} />}     label="Uptime backend"  value={formatUptime(metrics.uptime)} />
              <StatChip icon={<HardDrive size={14} />} label="Heap"            value={`${metrics.memory.heapUsedMb} / ${metrics.memory.heapTotalMb} MB`} />
              <StatChip icon={<Cpu size={14} />}       label="RSS geheugen"    value={`${metrics.memory.rssMb} MB`} />
              {metrics.redis && (
                <StatChip icon={<Zap size={14} />}     label="Redis geheugen"  value={`${metrics.redis.memoryMb} MB`} />
              )}
            </div>

            {metrics.redis && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Redis</p>
                <div className="flex flex-wrap gap-6 text-sm">
                  <span className="text-gray-600">Uptime: <strong className="text-gray-800">{formatUptime(metrics.redis.uptimeSeconds)}</strong></span>
                  <span className="text-gray-600">Clients: <strong className="text-gray-800">{metrics.redis.connectedClients}</strong></span>
                  <span className="text-gray-600">Rol: <strong className="text-gray-800">{metrics.redis.role}</strong></span>
                </div>
              </div>
            )}

            {metrics.queues.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">BullMQ queues</p>
                {metrics.queues.map(q => (
                  <div key={q.name} className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-mono font-semibold text-gray-700">{q.name}</span>
                    <QueueBadge label="wacht"      value={q.waiting}   color="bg-gray-100 text-gray-600" />
                    <QueueBadge label="actief"     value={q.active}    color="bg-blue-100 text-blue-700" />
                    <QueueBadge label="klaar"      value={q.completed} color="bg-green-100 text-green-700" />
                    <QueueBadge label="mislukt"    value={q.failed}    color={q.failed > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'} />
                    <QueueBadge label="uitgesteld" value={q.delayed}   color="bg-yellow-100 text-yellow-700" />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Sectie C: Traagste routes */}
        {metrics && metrics.byRoute.length > 0 && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-gray-700 mb-3">API prestaties — traagste routes</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Route</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Calls</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Gem.</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Min</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Max</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">P95</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Fouten</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.byRoute.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.route}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{r.count}</td>
                      <td className={cn('px-4 py-2 text-right font-medium', msColor(r.avgMs))}>{r.avgMs}ms</td>
                      <td className="px-4 py-2 text-right text-gray-400">{r.minMs}ms</td>
                      <td className="px-4 py-2 text-right text-gray-400">{r.maxMs}ms</td>
                      <td className={cn('px-4 py-2 text-right font-medium', msColor(r.p95Ms))}>{r.p95Ms}ms</td>
                      <td className="px-4 py-2 text-right">
                        {r.errorCount > 0 ? (
                          <span className="text-red-600 font-medium" title={Object.entries(r.errorsByCode).map(([code, n]) => `${n}× ${code}`).join(', ')}>
                            {Object.entries(r.errorsByCode).map(([code, n]) => `${n}×${code}`).join(' ')}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Sectie D: Live request stream */}
        {metrics && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">
              Live requests
              <span className="text-xs font-normal text-gray-400 ml-2">laatste 50 · ververst elke 3s</span>
            </h2>
            {metrics.recent.length === 0 ? (
              <p className="text-sm text-gray-400">Nog geen requests ontvangen.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Tijdstip</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Methode</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">URL</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.recent.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-1.5 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(r.timestamp).toLocaleTimeString('nl-NL')}
                        </td>
                        <td className="px-4 py-1.5">
                          <span className="text-xs font-mono font-semibold text-gray-600">{r.method}</span>
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs text-gray-700 max-w-xs truncate">{r.rawUrl}</td>
                        <td className={cn('px-4 py-1.5 text-right text-xs font-medium', statusColor(r.statusCode))}>
                          {r.statusCode}
                        </td>
                        <td className={cn('px-4 py-1.5 text-right text-xs font-medium', msColor(r.durationMs))}>
                          {r.durationMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
