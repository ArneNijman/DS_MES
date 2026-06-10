import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Clock, Info, ChevronDown } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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
  alarmText?: string | null
}

interface MachineSummary {
  id: string
  name: string
  availabilityPct: number
  totalDowntimeMinutes: number
  byType: { offline: number; alarmstilstand: number; stilstand: number; wachttijd: number }
  ongoingPeriod: DowntimePeriod | null
  currentTool: { nr: number; name: string | null } | null
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
  const [expanded, setExpanded] = useState(false)
  const avail = machine.availabilityPct
  const color = avail >= 90 ? 'bg-green-500' : avail >= 75 ? 'bg-amber-400' : 'bg-red-500'
  const total = machine.totalDowntimeMinutes
  const hasPeriods = machine.periods.length > 0

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => hasPeriods && setExpanded(o => !o)}
        className={cn('w-full py-3 px-4 text-left', hasPeriods ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default')}
      >
        <div className="flex items-center gap-4">
          <div className="w-40 shrink-0">
            <p className="text-sm font-medium text-gray-800 truncate">{machine.name}</p>
            {machine.ongoingPeriod && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', DOWNTIME_BADGE[machine.ongoingPeriod.type])}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
                {DOWNTIME_LABEL[machine.ongoingPeriod.type]}
              </span>
            )}
            {machine.ongoingPeriod?.type === 'alarmstilstand' && machine.ongoingPeriod.alarmText && (
              <p className="text-xs text-red-500 mt-0.5 truncate" title={machine.ongoingPeriod.alarmText}>
                {machine.ongoingPeriod.alarmText}
              </p>
            )}
            {machine.currentTool && machine.ongoingPeriod?.type !== 'offline' && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                T{machine.currentTool.nr}{machine.currentTool.name ? ` · ${machine.currentTool.name}` : ''}
              </p>
            )}
          </div>

          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${avail}%` }} />
            </div>
            <span className={cn('text-sm font-semibold w-10 text-right shrink-0', color.replace('bg-', 'text-'))}>
              {avail}%
            </span>
          </div>

          <div className="flex items-center gap-2 w-36 justify-end shrink-0">
            <span className="text-xs text-gray-600">
              {total > 0 ? `Totale downtime: ${formatDuration(total)}` : <span className="text-green-600">Geen downtime ✓</span>}
            </span>
            {hasPeriods && (
              <ChevronDown size={14} className={cn('text-gray-400 transition-transform shrink-0', expanded && 'rotate-180')} />
            )}
          </div>
        </div>

        {total > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 pl-44">
            <span className="text-xs text-gray-400 shrink-0">Waarvan:</span>
            {(['alarmstilstand', 'stilstand', 'offline', 'wachttijd'] as const).map((type) => {
              const mins = machine.byType[type]
              if (!mins) return null
              return (
                <span key={type} className={cn('px-1.5 py-0.5 rounded text-xs font-medium', DOWNTIME_BADGE[type])}>
                  {DOWNTIME_LABEL[type]} {formatDuration(mins)}
                </span>
              )
            })}
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5">
          {machine.periods.map((p, i) => {
            const cfg = { label: DOWNTIME_LABEL[p.type], badge: DOWNTIME_BADGE[p.type] }
            return (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className={cn('px-2 py-0.5 rounded-full font-medium shrink-0', cfg.badge)}>{cfg.label}</span>
                <span className="text-gray-500">
                  {formatTime(p.startedAt)} → {p.endedAt ? formatTime(p.endedAt) : <span className="text-red-500 font-medium animate-pulse">lopend</span>}
                </span>
                <span className="font-medium text-gray-700 ml-auto">
                  {p.durationSeconds !== null ? formatDuration(Math.round(p.durationSeconds / 60)) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
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

// ── Spindle hours chart ────────────────────────────────────────────────────

interface MetricPoint { date: string; value: number }

function SpindleChart({ machineId, machineName, days }: { machineId: string; machineName: string; days: number }) {
  const since = getSinceDate(days)
  const { data } = useQuery<{ data: MetricPoint[] }>({
    queryKey: ['cnc-metrics', machineId, since],
    queryFn:  () => apiFetch(`/admin/machines/${machineId}/cnc-metrics?metric=spindle_hours&since=${since}`) as Promise<{ data: MetricPoint[] }>,
    staleTime: 5 * 60_000,
  })

  const points = data?.data ?? []

  // Delta per dag
  const dailyDeltas = points.map((p, i) => ({
    date:  p.date,
    delta: i === 0 ? 0 : Math.min(24, Math.max(0, +(p.value - points[i - 1].value).toFixed(1))),
    totaal: +p.value.toFixed(1),
  }))

  // Aggregeer per week als periode > 14 dagen
  function isoWeek(dateStr: string): string {
    const d = new Date(dateStr)
    const jan4 = new Date(d.getFullYear(), 0, 4)
    const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7)
    return `W${week}`
  }

  const deltas = days > 14
    ? Object.values(
        dailyDeltas.reduce<Record<string, { date: string; uren: number; totaal: number }>>((acc, p) => {
          const w = isoWeek(p.date)
          if (!acc[w]) acc[w] = { date: w, uren: 0, totaal: p.totaal }
          acc[w].uren    = +(acc[w].uren + p.delta).toFixed(1)
          acc[w].totaal  = p.totaal
          return acc
        }, {})
      )
    : dailyDeltas
        .slice(days === 1 ? 1 : 0)  // dag-weergave: gisteren (referentie) weggooien, alleen vandaag tonen
        .map(p => ({ date: p.date.slice(5), uren: p.delta, totaal: p.totaal }))

  if (!deltas.length) return (
    <div className="flex items-center justify-between py-2">
      <p className="text-xs font-medium text-gray-700">{machineName}</p>
      <p className="text-xs text-gray-300">Nog geen spindeluren</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-700">{machineName}</p>
        {points.length > 0 && (
          <p className="text-xs text-gray-400">
            Huidig totaal: <span className="font-semibold text-gray-700">{Number(points[points.length - 1].value).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} u</span>
          </p>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={deltas} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="u" width={32} />
          <Tooltip
            formatter={(v: number) => [`${v}u`, 'Spindeluren']}
            labelFormatter={(l) => `${l}`}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Line type="monotone" dataKey="uren" stroke="#0d9488" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Info popover ───────────────────────────────────────────────────────────

function BeschikbaarheidInfo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-300 hover:text-gray-500 transition-colors"
        aria-label="Uitleg beschikbaarheid"
      >
        <Info size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-96 bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-3">
            <div>
              <p className="font-semibold text-gray-800 mb-1">Hoe werkt de beschikbaarheidsbalk?</p>
              <p>Het percentage toont hoeveel van de <strong>totale tijd</strong> een machine beschikbaar was — zonder stilstand, offline of alarm. 100% betekent geen enkel probleem geregistreerd. 60% betekent dat de machine 40% van de tijd stilstond, offline was of in alarm.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Dit telt als stilstand:</p>
              <ul className="space-y-1 ml-1">
                <li className="flex gap-2"><span className="text-red-400 font-bold">·</span><span><strong>Alarmstilstand</strong> — machine stopt door een alarm</span></li>
                <li className="flex gap-2"><span className="text-amber-400 font-bold">·</span><span><strong>Stilstand</strong> — programma gestopt, niets gestart binnen 10 min</span></li>
                <li className="flex gap-2"><span className="text-gray-400 font-bold">·</span><span><strong>Offline</strong> — machine niet bereikbaar via netwerk</span></li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Dit telt NIET mee:</p>
              <ul className="space-y-1 ml-1">
                <li className="flex gap-2"><span className="text-gray-300 font-bold">·</span><span>Netwerkhaperingen korter dan 5 minuten</span></li>
              </ul>
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-1">
              <p className="text-gray-500"><strong className="text-gray-700">Let op:</strong> de balk zegt niet of er actief verspaand werd — alleen of er geen geregistreerde stilstand was. Een machine kan op 100% staan terwijl de operator aan het instellen was, zolang er geen gap van meer dan 10 minuten zonder programma was.</p>
              <p className="text-gray-400">Voor werkelijke verspaantijd: zie de <strong className="text-gray-600">Spindeluren</strong> grafiek hieronder.</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Legenda ────────────────────────────────────────────────────────────────

const DOWNTIME_LEGEND: { color: string; label: string; desc: string }[] = [
  {
    color: 'bg-green-500',
    label: 'Beschikbaar',
    desc:  'Percentage van de totale tijd dat de machine beschikbaar was — geen stilstand, offline of alarm.',
  },
  {
    color: 'bg-red-400',
    label: 'Alarmstilstand',
    desc:  'Machine heeft een actief alarm gegenereerd. Periode loopt van alarm-trigger tot alarm-reset.',
  },
  {
    color: 'bg-amber-400',
    label: 'Stilstand',
    desc:  'Programma gestopt maar geen nieuw programma gestart binnen 10 minuten. Machine staat aan maar verspaant niet.',
  },
  {
    color: 'bg-gray-400',
    label: 'Offline',
    desc:  'Machine niet bereikbaar via netwerk. Perioden korter dan 5 minuten worden genegeerd (opstartruis).',
  },
  {
    color: 'bg-orange-400',
    label: 'Wachttijd',
    desc:  'Spindel staat stil terwijl een programma loopt (bijv. gereedschapwissel, instellen).',
  },
]

function DowntimeLegend() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-5 grid grid-cols-2 gap-3">
      {DOWNTIME_LEGEND.map(({ color, label, desc }) => (
        <div key={label} className="flex gap-3">
          <span className={cn('w-3 h-3 rounded-sm shrink-0 mt-0.5', color)} />
          <div>
            <p className="text-xs font-medium text-gray-700">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Verspaantijd info popover ──────────────────────────────────────────────

function VerspaantijdInfo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-300 hover:text-gray-500 transition-colors"
        aria-label="Uitleg verspaantijd"
      >
        <Info size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-96 bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-3">
            <div>
              <p className="font-semibold text-gray-800 mb-1">Wat zie je hier?</p>
              <p>Per Freesmachine de <strong>totale verspaantijd</strong> in de geselecteerde periode — de som van alle afgeronde programma-uitvoeringen. De balk is <strong>relatief</strong>: de machine met de meeste verspaantijd krijgt een volle balk, de rest wordt evenredig weergegeven. Zo zie je in één oogopslag welke machine het meest draait.</p>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Hoe wordt de tijd berekend?</p>
              <ul className="space-y-1 ml-1">
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>Alle afgeronde runs binnen de periode worden opgeteld per machine</span></li>
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>Artikelnummer komt uit het NC-programmapad: <code className="bg-gray-100 px-1 rounded">TNC:\Program\<strong>22073-3201</strong>\bewerking.nc</code></span></li>
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>De badges tonen de <strong>top 3 artikelen</strong> waaraan die machine de meeste tijd kwijt was</span></li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-gray-700 mb-1">Artikelbadges togglen</p>
              <p>Klik op een badge (bijv. <strong>Johan frezen · 2485u</strong>) om die te verbergen — de badge wordt doorgestreept grijs. Klik nogmaals om hem terug te zetten. Handig om handmatige of irrelevante programma's uit het zicht te houden.</p>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-gray-400">Loopt er op dit moment een programma, dan telt die run mee zodra hij afgesloten is.</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Verspaantijd sectie ────────────────────────────────────────────────────

const VERSPAANTIJD_VISIBLE = 5

function VerspaantijdSectie({ days }: { days: number }) {
  const [showAll, setShowAll]               = useState(false)
  const [hiddenArticles, setHiddenArticles] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<CncRunsDashboardData>({
    queryKey: ['cnc-runs-all', days],
    queryFn:  () => apiFetch(`/admin/cnc-program-runs/all?since=${getSinceDate(days)}`) as Promise<CncRunsDashboardData>,
    refetchInterval: 60_000,
  })

  const toggleArticle = (article: string) =>
    setHiddenArticles(s => {
      const next = new Set(s)
      next.has(article) ? next.delete(article) : next.add(article)
      return next
    })

  const hiddenSecs = (m: MachineCncSummary) =>
    m.topArticles.filter(a => hiddenArticles.has(a.article)).reduce((s, a) => s + a.seconds, 0)

  const displayedSeconds = (m: MachineCncSummary) => Math.max(0, m.totalSeconds - hiddenSecs(m))

  const machines = (data?.machines ?? [])
    .filter(m => m.totalSeconds > 0)
    .sort((a, b) => displayedSeconds(b) - displayedSeconds(a))

  const totalSeconds = machines.reduce((s, m) => s + displayedSeconds(m), 0)
  const maxSeconds   = displayedSeconds(machines[0] ?? { totalSeconds: 0, topArticles: [] } as unknown as MachineCncSummary) || 1
  const visible      = showAll ? machines : machines.slice(0, VERSPAANTIJD_VISIBLE)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Clock size={13} /> Verspaantijd per machine
          <VerspaantijdInfo />
        </h2>
        {totalSeconds > 0 && (
          <span className="text-xs text-gray-500">
            Totaal: <span className="font-semibold text-teal-700">{formatDuration(Math.round(totalSeconds / 60))}</span>
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400 text-center py-4">Laden...</p>
      ) : machines.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Geen verspaantijd geregistreerd in deze periode</p>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map(m => {
              const disp   = displayedSeconds(m)
              const barPct = Math.round((disp / maxSeconds) * 100)
              return (
                <div key={m.id} className="rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-4">
                    <div className="w-36 shrink-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                      <p className="text-xs text-gray-400">{m.runCount} run{m.runCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-teal-700 w-20 text-right shrink-0">
                        {formatDuration(Math.round(disp / 60))}
                      </span>
                    </div>
                  </div>
                  {m.topArticles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-40">
                      {m.topArticles.map(({ article, seconds }) => {
                        const isHidden = hiddenArticles.has(article)
                        return (
                          <button
                            key={article}
                            onClick={() => toggleArticle(article)}
                            title={isHidden ? 'Klik om te tonen' : 'Klik om te verbergen'}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs transition-colors',
                              isHidden
                                ? 'bg-gray-100 text-gray-400 line-through'
                                : 'bg-teal-50 text-teal-700 hover:bg-teal-100',
                            )}
                          >
                            {article} · {formatDuration(Math.round(seconds / 60))}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {machines.length > VERSPAANTIJD_VISIBLE && (
            <button
              onClick={() => setShowAll(o => !o)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <ChevronDown size={13} className={cn('transition-transform', showAll && 'rotate-180')} />
              {showAll ? 'Minder tonen' : `Toon alle ${machines.length} machines`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Content (herbruikbaar in kiosk + admin) ────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 1,   label: 'Vandaag' },
  { value: 7,   label: '7 dagen' },
  { value: 30,  label: 'Maand' },
  { value: 90,  label: 'Kwartaal' },
  { value: 180, label: 'Halfjaar' },
  { value: 365, label: 'Jaar' },
]

interface MachineCncSummary {
  id: string
  name: string
  totalSeconds: number
  runCount: number
  topArticles: { article: string; seconds: number }[]
}

interface CncRunsDashboardData {
  machines: MachineCncSummary[]
}

/** Berekent de exacte kalendergrens voor het geselecteerde periode-filter (lokale tijd). */
function getSinceDate(days: number): string {
  const d = new Date()
  switch (days) {
    case 1:   // Gisteren + vandaag — gisteren als referentiepunt voor de delta
      d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); break
    case 7:   // 7 kalenderdagen terug
      d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); break
    case 30:  // Laatste 30 dagen (niet kalendermaand, zodat er altijd voldoende data is)
      d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); break
    case 90:  // Begin van het huidige kwartaal
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0); break
    case 365: // Begin van het huidige jaar
      d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break
    default:
      d.setDate(d.getDate() - days + 1); d.setHours(0, 0, 0, 0)
  }
  return d.toISOString()
}

export function MachineDashboardContent() {
  const [days, setDays] = useState(7)

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['machine-downtime-all', days],
    queryFn:  () => apiFetch(`/admin/cnc-downtime/all?since=${getSinceDate(days)}`) as Promise<DashboardData>,
    refetchInterval: 30_000,
  })

  const totalDowntime = data?.machines.reduce((s, m) => s + m.totalDowntimeMinutes, 0) ?? 0
  const ongoingCount  = data?.machines.filter(m => m.ongoingPeriod).length ?? 0

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Activity size={17} className="text-red-500" /> Machine Dashboard
          </h1>
          <p className="text-xs text-gray-400">Automatische downtime-detectie — Freesmachines</p>
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
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Beschikbaarheid</h2>
                <BeschikbaarheidInfo />
              </div>
              <div className="space-y-1">
                {data.machines
                  .sort((a, b) => a.availabilityPct - b.availabilityPct)
                  .map(m => <AvailabilityBar key={m.id} machine={m} />)
                }
              </div>
            </div>

            <DowntimeLegend />

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Recente stilstand</h2>
              <RecentDowntimeTable data={data} />
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4 mt-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock size={13} /> Spindeluren per dag
              </h2>
              <div className="space-y-6">
                {data.machines.map(m => (
                  <SpindleChart key={m.id} machineId={m.id} machineName={m.name} days={days} />
                ))}
              </div>
            </div>

            <VerspaantijdSectie days={days} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Admin page wrapper ─────────────────────────────────────────────────────

export default function MachineDashboard() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-center gap-3 bg-white">
          <button
            onClick={() => navigate('/admin/machines')}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Machine Dashboard</h1>
            <p className="text-xs text-gray-400">Automatische downtime-detectie — Freesmachines</p>
          </div>
        </div>
        <MachineDashboardContent />
      </div>
    </div>
  )
}
