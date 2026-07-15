import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Clock, Info, ChevronDown, Search, ChevronRight } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
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
  currentTool: { nr: number; name: string | null; assemblyNcNumber: number | null } | null
  photoUrl: string | null
  programRunning: boolean
  currentProgram: string | null
  lastRunStatus: string | null
  lastRunProgram: string | null
  lastRunEndedAt: string | null
  currentProgramStartedAt: string | null
  activeRunningAlarm: string | null
  programStateKnown: boolean
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
                {machine.currentTool.assemblyNcNumber != null && (
                  <span className="ml-1 text-teal-500">· samenstelling</span>
                )}
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
        .slice(days <= 1 ? 1 : 0)  // dag/vandaag-weergave: referentiepunt weggooien
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
        className="text-gray-400 hover:text-teal-600 transition-colors"
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

// ── Periode filter info popover ───────────────────────────────────────────

function PeriodeFilterInfo() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-400 hover:text-teal-600 transition-colors"
        aria-label="Uitleg periodefilter"
      >
        <Info size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-xs text-gray-600 leading-relaxed space-y-2">
            <p className="font-semibold text-gray-800 mb-1">Periodefilter uitleg</p>
            {[
              { label: 'Vandaag',   desc: 'Vandaag vanaf 05:30 tot nu — toont de huidige werkdag.' },
              { label: 'Dag',       desc: 'Afgelopen 24 uur tot nu — doorlopend venster ongeacht tijdstip.' },
              { label: 'Week',      desc: '7 kalenderdagen terug vanaf vandaag.' },
              { label: 'Maand',     desc: 'Laatste 30 dagen.' },
              { label: 'Kwartaal',  desc: 'Vanaf het begin van het huidige kwartaal.' },
              { label: 'Halfjaar',  desc: 'Laatste 180 dagen.' },
              { label: 'Jaar',      desc: 'Vanaf 1 januari van het huidige jaar.' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex gap-2">
                <span className="font-medium text-gray-700 w-16 shrink-0">{label}</span>
                <span className="text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        </>
      )}
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
        className="text-gray-400 hover:text-teal-600 transition-colors"
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
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>Alle afgeronde runs van hetzelfde artikel worden samengevoegd tot één totaal — draait artikel <code className="bg-gray-100 px-1 rounded">25038-11</code> vandaag 15× gedurende 45 min, dan zie je <strong>11u 15m</strong></span></li>
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>Artikelnummer komt uit het NC-programmapad: <code className="bg-gray-100 px-1 rounded">TNC:\Program\<strong>22073-3201</strong>\bewerking.nc</code></span></li>
                <li className="flex gap-2"><span className="text-teal-500 font-bold">·</span><span>De badges tonen <strong>alle artikelen</strong> waaraan die machine tijd kwijt was, gesorteerd op meeste tijd</span></li>
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

const VERSPAANTIJD_VISIBLE  = 5
const ARTICLES_VISIBLE      = 5

function VerspaantijdSectie({ days }: { days: number }) {
  const [showAll, setShowAll]               = useState(false)
  const [hiddenArticles, setHiddenArticles] = useState<Set<string>>(new Set())
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set())

  const toggleMachineExpand = (id: string) =>
    setExpandedMachines(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const [articleSearch, setArticleSearch]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(articleSearch.trim()), 400)
    return () => clearTimeout(t)
  }, [articleSearch])

  const { data, isLoading } = useQuery<CncRunsDashboardData>({
    queryKey: ['cnc-runs-all', days],
    queryFn:  () => apiFetch(`/admin/cnc-program-runs/all?since=${getSinceDate(days)}`) as Promise<CncRunsDashboardData>,
    refetchInterval: 60_000,
  })

  const { data: searchResult, isLoading: searchLoading } = useQuery<ArticleSearchResult>({
    queryKey: ['cnc-article-search', debouncedSearch, days],
    queryFn:  () => apiFetch(`/admin/cnc-program-runs/article-search?article=${encodeURIComponent(debouncedSearch)}&since=${getSinceDate(days)}`) as Promise<ArticleSearchResult>,
    enabled:  debouncedSearch.length >= 2,
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
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Zoek artikel..."
            value={articleSearch}
            onChange={e => setArticleSearch(e.target.value)}
            className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-36"
          />
          {!debouncedSearch && totalSeconds > 0 && (
            <span className="text-xs text-gray-500">
              Totaal: <span className="font-semibold text-teal-700">{formatDuration(Math.round(totalSeconds / 60))}</span>
            </span>
          )}
        </div>
      </div>

      {/* Zoekresultaat-weergave */}
      {debouncedSearch.length >= 2 ? (
        <div>
          {searchLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Zoeken...</p>
          ) : !searchResult || searchResult.byMachine.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Geen runs gevonden voor "{debouncedSearch}"</p>
          ) : (
            <>
              {(() => {
                const searchDispSecs = (m: ArticleSearchResult['byMachine'][0]) =>
                  Math.max(0, m.seconds - m.articles.filter(a => hiddenArticles.has(a.article)).reduce((s, a) => s + a.seconds, 0))
                const searchMaxSecs = Math.max(...searchResult.byMachine.map(searchDispSecs), 1)
                const searchTotal   = searchResult.byMachine.reduce((s, m) => s + searchDispSecs(m), 0)
                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Resultaten voor "{searchResult.article}"</span>
                      <span className="text-xs text-gray-500">
                        Totaal: <span className="font-semibold text-teal-700">{formatDuration(Math.round(searchTotal / 60))}</span>
                        <span className="ml-2 text-gray-400">· {searchResult.totalRuns} runs</span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchResult.byMachine.map(m => {
                        const disp   = searchDispSecs(m)
                        const barPct = Math.round((disp / searchMaxSecs) * 100)
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
                            {m.articles.length > 0 && (() => {
                              const expanded = expandedMachines.has(m.id)
                              const visibleA = expanded ? m.articles : m.articles.slice(0, ARTICLES_VISIBLE)
                              const hiddenCount = m.articles.length - ARTICLES_VISIBLE
                              return (
                                <div className="mt-2 flex flex-wrap gap-1.5 pl-40">
                                  {visibleA.map(({ article, seconds }) => {
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
                                  {!expanded && hiddenCount > 0 && (
                                    <button
                                      onClick={() => toggleMachineExpand(m.id)}
                                      className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                    >
                                      +{hiddenCount} meer
                                    </button>
                                  )}
                                  {expanded && hiddenCount > 0 && (
                                    <button
                                      onClick={() => toggleMachineExpand(m.id)}
                                      className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                    >
                                      Minder
                                    </button>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      ) : isLoading ? (
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
                  {m.topArticles.length > 0 && (() => {
                    const expanded = expandedMachines.has(m.id)
                    const visible  = expanded ? m.topArticles : m.topArticles.slice(0, ARTICLES_VISIBLE)
                    const hidden   = m.topArticles.length - ARTICLES_VISIBLE
                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-40">
                        {visible.map(({ article, seconds }) => {
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
                        {!expanded && hidden > 0 && (
                          <button
                            onClick={() => toggleMachineExpand(m.id)}
                            className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                          >
                            +{hidden} meer
                          </button>
                        )}
                        {expanded && hidden > 0 && (
                          <button
                            onClick={() => toggleMachineExpand(m.id)}
                            className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                          >
                            Minder
                          </button>
                        )}
                      </div>
                    )
                  })()}
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

// ── Machine tegel helpers ──────────────────────────────────────────────────

function extractArticle(programName: string | null): string | null {
  if (!programName) return null
  const idx = programName.toUpperCase().indexOf('TNC:')
  const clean = idx >= 0 ? programName.slice(idx) : programName
  const parts = clean.replace(/\\/g, '/').split('/')
  return parts.length >= 3 ? parts[2] : parts[parts.length - 1] || null
}

// ── MachineTegel ───────────────────────────────────────────────────────────

function MachineTegel({ machine, onClick }: { machine: MachineSummary; onClick: () => void }) {
  const avail = machine.availabilityPct
  const availColor = avail >= 90 ? 'text-green-600' : avail >= 75 ? 'text-amber-500' : 'text-red-500'
  const period = machine.ongoingPeriod
  const article         = extractArticle(machine.currentProgram)
  const lastArticle     = extractArticle(machine.lastRunProgram)

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden text-left hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer w-full"
    >
      {/* Foto */}
      <div className="h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
        {machine.photoUrl
          ? <img src={machine.photoUrl} alt={machine.name} className="w-full h-full object-contain" />
          : <Activity size={32} className="text-gray-200" />
        }
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5 h-52 overflow-hidden">
        <p className="text-sm font-semibold text-gray-800 truncate">{machine.name}</p>

        {/* Beschikbaarheid */}
        <p className={cn('text-xl font-bold', availColor)}>{avail}%</p>

        {/* Online / Offline */}
        <div>
          {period?.type === 'offline' ? (
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', DOWNTIME_BADGE['offline'])}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {DOWNTIME_LABEL['offline']}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Online
            </span>
          )}
        </div>

        {/* Programma status */}
        {machine.programRunning ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
              ▶ Loopt
            </span>
            <span className="text-xs text-gray-400 truncate">{machine.currentProgramStartedAt ? formatTime(machine.currentProgramStartedAt) : ''}</span>
            <span />
            {article && <p className="text-xs text-gray-500 truncate">{article}</p>}
          </div>
        ) : machine.programStateKnown && machine.lastRunStatus === 'interrupted' ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
              ⚠ Onderbroken
            </span>
            <span className="text-xs text-gray-400 truncate">{machine.lastRunEndedAt ? formatTime(machine.lastRunEndedAt) : ''}</span>
            <span />
            {lastArticle && <p className="text-xs text-gray-500 truncate">{lastArticle}</p>}
          </div>
        ) : machine.programStateKnown && (machine.lastRunStatus === 'completed' || machine.lastRunStatus === 'stopped') ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              ◼ Gestopt
            </span>
            <span className="text-xs text-gray-400 truncate">{machine.lastRunEndedAt ? formatTime(machine.lastRunEndedAt) : ''}</span>
            <span />
            {lastArticle && <p className="text-xs text-gray-500 truncate">{lastArticle}</p>}
          </div>
        ) : null}

        {/* Alarmstilstand / Stilstand / Wachttijd (als actief, niet offline) */}
        {period && period.type !== 'offline' && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5">
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', DOWNTIME_BADGE[period.type])}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {DOWNTIME_LABEL[period.type]}
            </span>
            <span className="text-xs text-gray-400 truncate">{formatTime(period.startedAt)}</span>
            {period.type === 'alarmstilstand' && (period as DowntimePeriod & { alarmText?: string | null }).alarmText && (
              <>
                <span />
                <p className="text-xs text-red-500 truncate" title={(period as DowntimePeriod & { alarmText?: string | null }).alarmText ?? ''}>
                  {(period as DowntimePeriod & { alarmText?: string | null }).alarmText}
                </p>
              </>
            )}
          </div>
        )}

        {/* Alarm actief terwijl programma draait — geen downtime, wel tonen */}
        {machine.activeRunningAlarm && (
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              ⚠ Alarm actief
            </span>
            <p className="text-xs text-orange-500 truncate" title={machine.activeRunningAlarm}>
              {machine.activeRunningAlarm}
            </p>
          </div>
        )}

        {/* Actief gereedschap */}
        {machine.currentTool && period?.type !== 'offline' && (
          <p className="text-xs text-gray-400 truncate">
            T{machine.currentTool.nr}{machine.currentTool.name ? ` · ${machine.currentTool.name}` : ''}
            {machine.currentTool.assemblyNcNumber != null && <span className="ml-1 text-teal-500">· samenstelling</span>}
          </p>
        )}
      </div>
    </button>
  )
}

// ── MachineDetailModal ─────────────────────────────────────────────────────

function MachineDetailModal({ machine, onClose }: { machine: MachineSummary; onClose: () => void }) {
  const avail = machine.availabilityPct
  const availColor = avail >= 90 ? 'text-green-600' : avail >= 75 ? 'text-amber-500' : 'text-red-500'
  const sorted = [...machine.periods].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{machine.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className={cn('text-2xl font-bold', availColor)}>{avail}% beschikbaar</p>
              <BeschikbaarheidInfo />
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mt-1.5">
              <div
                className={cn('h-full rounded-full transition-all', avail >= 90 ? 'bg-green-500' : avail >= 75 ? 'bg-amber-400' : 'bg-red-500')}
                style={{ width: `${avail}%` }}
              />
            </div>

            {machine.totalDowntimeMinutes > 0 ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-sm text-gray-600">
                  Totale downtime: <span className="font-semibold text-gray-800">{formatDuration(machine.totalDowntimeMinutes)}</span>
                </p>
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="text-xs text-gray-400 shrink-0">Waarvan:</span>
                  {(['alarmstilstand', 'stilstand', 'offline', 'wachttijd'] as const).map(type => {
                    const mins = machine.byType[type]
                    if (!mins) return null
                    return (
                      <span key={type} className={cn('px-2 py-0.5 rounded text-xs font-medium', DOWNTIME_BADGE[type])}>
                        {DOWNTIME_LABEL[type]} {formatDuration(mins)}
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-600 mt-1">Geen downtime in deze periode ✓</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg ml-4 shrink-0">
            ✕
          </button>
        </div>

        {/* Perioden lijst */}
        <div className="flex-1 overflow-y-auto p-5">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Geen stilstand in deze periode</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((p, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-100 text-xs">
                  <span className={cn('px-2 py-0.5 rounded-full font-medium shrink-0', DOWNTIME_BADGE[p.type])}>
                    {p.isOngoing && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />}
                    {DOWNTIME_LABEL[p.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-500">{formatTime(p.startedAt)}{p.endedAt ? ` → ${formatTime(p.endedAt)}` : ''}</p>
                    {p.type === 'alarmstilstand' && (p as DowntimePeriod & { alarmText?: string | null }).alarmText && (
                      <p className="text-red-500 mt-0.5 truncate">{(p as DowntimePeriod & { alarmText?: string | null }).alarmText}</p>
                    )}
                  </div>
                  <span className="font-medium text-gray-700 shrink-0">
                    {p.durationSeconds !== null ? formatDuration(Math.round(p.durationSeconds / 60)) : p.isOngoing ? <span className="text-red-500 animate-pulse">lopend</span> : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── BeschikbaarheidTab ─────────────────────────────────────────────────────

function BeschikbaarheidTab({ machines }: { machines: MachineSummary[] }) {
  const [selected, setSelected] = useState<MachineSummary | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {machines
          .sort((a, b) => a.availabilityPct - b.availabilityPct)
          .map(m => (
            <MachineTegel key={m.id} machine={m} onClick={() => setSelected(m)} />
          ))
        }
      </div>
      <DowntimeLegend />
      {selected && <MachineDetailModal machine={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ── Content (herbruikbaar in kiosk + admin) ────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 0,   label: 'Vandaag' },
  { value: 1,   label: 'Dag' },
  { value: 7,   label: 'Week' },
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

interface ArticleSearchResult {
  article: string
  totalSeconds: number
  totalRuns: number
  byMachine: {
    id: string
    name: string
    seconds: number
    runCount: number
    articles: { article: string; seconds: number }[]
  }[]
}

/** Berekent de exacte kalendergrens voor het geselecteerde periode-filter (lokale tijd). */
function getSinceDate(days: number): string {
  const d = new Date()
  switch (days) {
    case 0:   // Vandaag vanaf 05:30
      d.setHours(5, 30, 0, 0); break
    case 1:   // Laatste 24 uur
      d.setTime(d.getTime() - 24 * 60 * 60 * 1000); break
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

// ── Projectanalyse types ───────────────────────────────────────────────────

interface ParetoArticle {
  article:         string
  totalSeconds:    number
  runCount:        number
  completedRuns:   number
  interruptedRuns: number
}

interface ParetoData { articles: ParetoArticle[] }

interface ArticleDetail {
  article:             string
  totalSeconds:        number
  runCount:            number
  completedRuns:       number
  interruptedSeconds:  number
  byMachine: { id: string; name: string; seconds: number; runCount: number; completedRuns: number; interruptedSeconds: number }[]
  runs: { id: string; machineName: string; startedAt: string; durationSeconds: number | null; status: string }[]
}

// ── Berekent downtime die overlaps met de looptijd van de runs ────────────

function computeRunOverlap(
  runs:    ArticleDetail['runs'],
  periods: DowntimePeriod[],
): { alarmstilstandMin: number; stilstandMin: number; offlineMin: number } {
  const nowMs = Date.now()

  // Bouw per dag een venster van eerste run-start tot laatste run-einde.
  // Stilstand/alarmstilstand valt tussen runs in — door het dagvenster te gebruiken
  // worden die meegenomen zonder downtime na de laatste run van de dag mee te tellen.
  const dayMap = new Map<string, { startMs: number; endMs: number }>()
  for (const r of runs) {
    if (!r.durationSeconds || r.durationSeconds <= 0) continue
    const startMs = new Date(r.startedAt).getTime()
    const endMs   = startMs + r.durationSeconds * 1000
    const day     = new Date(r.startedAt).toDateString()
    const w       = dayMap.get(day)
    if (!w) dayMap.set(day, { startMs, endMs })
    else    { w.startMs = Math.min(w.startMs, startMs); w.endMs = Math.max(w.endMs, endMs) }
  }
  const dayWindows = [...dayMap.values()]

  const allPeriods = periods.map(p => ({
    type:    p.type,
    startMs: new Date(p.startedAt).getTime(),
    endMs:   p.endedAt ? new Date(p.endedAt).getTime() : nowMs,
  }))

  let alarmMs = 0
  let stilMs  = 0
  let offMs   = 0

  for (const w of dayWindows) {
    for (const p of allPeriods) {
      const ov = overlapMs(w.startMs, w.endMs, p.startMs, p.endMs)
      if (ov <= 0) continue
      if (p.type === 'alarmstilstand') alarmMs += ov
      else if (p.type === 'stilstand') stilMs  += ov
      else if (p.type === 'offline')   offMs   += ov
    }
  }

  return {
    alarmstilstandMin: Math.round(alarmMs / 60_000),
    stilstandMin:      Math.round(stilMs  / 60_000),
    offlineMin:        Math.round(offMs   / 60_000),
  }
}

// ── PeriodBar ──────────────────────────────────────────────────────────────
// Toont de 5 categorieën als % van de totale looptijd (runs van dit artikel)

function PeriodBar({ verspaanMin, interruptedMin, alarmMin, stilstandMin, offlineMin, since, machineName, article }: {
  verspaanMin: number; interruptedMin: number; alarmMin: number; stilstandMin: number; offlineMin: number
  since: string; machineName: string; article: string
}) {
  const totalMin = Math.max(1, verspaanMin + alarmMin + stilstandMin + offlineMin)
  const pct = (m: number) => `${Math.max(0.4, m / totalMin * 100).toFixed(2)}%`
  const completedMin = Math.max(0, verspaanMin - interruptedMin)

  const segments = [
    { key: 'running',        label: 'Verspaantijd',   min: completedMin,    color: '#0d9488' },
    { key: 'interrupted',    label: 'Onderbroken',    min: interruptedMin,  color: '#f97316' },
    { key: 'alarmstilstand', label: 'Alarmstilstand', min: alarmMin,        color: '#ef4444' },
    { key: 'stilstand',      label: 'Stilstand',      min: stilstandMin,    color: '#f59e0b' },
    { key: 'offline',        label: 'Offline',        min: offlineMin,      color: '#9ca3af' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {machineName} · artikel {article}
      </h3>

      <p className="text-xs text-gray-400 mb-3">
        {new Date(since).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })} – nu
      </p>

      <div className="h-10 rounded-xl overflow-hidden flex w-full mb-4">
        {segments.map(s => s.min > 0 && (
          <div
            key={s.key}
            style={{ width: pct(s.min), backgroundColor: s.color }}
            className="h-full"
            title={`${s.label}: ${fmtSeconds(s.min * 60)} (${Math.round(s.min / totalMin * 100)}%)`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {segments.filter(s => s.min > 0).map(s => (
          <div key={s.key} className="flex items-start gap-2">
            <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <div>
              <p className="text-xs font-medium text-gray-700">{s.label}</p>
              <p className="text-xs text-gray-400">{fmtSeconds(s.min * 60)} · {Math.round(s.min / totalMin * 100)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ProjectAnalyseTab ──────────────────────────────────────────────────────

function fmtSeconds(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}u ${m > 0 ? `${m}m` : ''}`.trim()
  return `${m}m`
}

function fmtRunDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Dagelijkse activiteitsberekening per artikel ────────────────────────────

interface DayActivity {
  date:           string   // "dd-mm"
  verspaantijd:   number   // minuten — looptijd van dit artikel
  alarmstilstand: number   // minuten — alarmstilstand op de machine (alle periodes)
  stilstand:      number   // minuten — stilstand op de machine (alle periodes)
  offline:        number   // minuten — machine offline (alle periodes)
}

function overlapMs(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

function buildDayActivity(
  runs: ArticleDetail['runs'],
  periods: DowntimePeriod[],
  since: string,
): DayActivity[] {
  const nowMs   = Date.now()
  const sinceMs = new Date(since).getTime()

  // Alle downtime-periodes van de machine (niet alleen overlap met runs)
  const allPeriods = periods.map(p => ({
    type:    p.type,
    startMs: new Date(p.startedAt).getTime(),
    endMs:   p.endedAt ? new Date(p.endedAt).getTime() : nowMs,
  }))

  const runWindows = runs
    .filter(r => r.durationSeconds != null && r.durationSeconds > 0)
    .map(r => ({
      startMs: new Date(r.startedAt).getTime(),
      endMs:   new Date(r.startedAt).getTime() + r.durationSeconds! * 1000,
    }))

  const result: DayActivity[] = []
  const cursor = new Date(sinceMs)
  cursor.setHours(0, 0, 0, 0)

  while (cursor.getTime() < nowMs) {
    const dayStart = cursor.getTime()
    cursor.setDate(cursor.getDate() + 1)
    const dayEnd = Math.min(cursor.getTime(), nowMs)

    // Verspaantijd = looptijd van dit artikel op deze dag
    let verspaantijdMs = 0
    for (const run of runWindows) {
      verspaantijdMs += overlapMs(run.startMs, run.endMs, dayStart, dayEnd)
    }

    // Downtime — gebruik dagvenster (eerste run-start tot laatste run-einde op deze dag)
    // zodat stilstand/alarmstilstand tussen runs in ook wordt meegenomen.
    let alarmstilstandMs = 0
    let stilstandMs      = 0
    let offlineMs        = 0
    if (verspaantijdMs > 0) {
      const dayRunStart = Math.max(dayStart, Math.min(...runWindows.filter(r => overlapMs(r.startMs, r.endMs, dayStart, dayEnd) > 0).map(r => r.startMs)))
      const dayRunEnd   = Math.min(dayEnd,   Math.max(...runWindows.filter(r => overlapMs(r.startMs, r.endMs, dayStart, dayEnd) > 0).map(r => r.endMs)))
      for (const p of allPeriods) {
        const ov = overlapMs(p.startMs, p.endMs, dayRunStart, dayRunEnd)
        if (p.type === 'alarmstilstand') alarmstilstandMs += ov
        else if (p.type === 'stilstand') stilstandMs      += ov
        else if (p.type === 'offline')   offlineMs        += ov
      }
    }

    if (verspaantijdMs > 0) {
      result.push({
        date:           new Date(dayStart).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }),
        verspaantijd:   Math.round(verspaantijdMs   / 60_000),
        alarmstilstand: Math.round(alarmstilstandMs / 60_000),
        stilstand:      Math.round(stilstandMs      / 60_000),
        offline:        Math.round(offlineMs        / 60_000),
      })
    }
  }

  return result
}

function ProjectAnalyseTab({ machines, days }: { machines: MachineSummary[]; days: number }) {
  const [selectedMachine, setSelectedMachine]   = useState<MachineSummary | null>(null)
  const [selectedArticle, setSelectedArticle]   = useState<string | null>(null)
  const [articleSearch, setArticleSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch]   = useState('')
  const [showAllRuns, setShowAllRuns]           = useState(true)
  const [showInfoN2, setShowInfoN2]             = useState(false)
  const [showInfoN3, setShowInfoN3]             = useState(false)
  const [openKpiInfo, setOpenKpiInfo]           = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(articleSearch.trim()), 350)
    return () => clearTimeout(t)
  }, [articleSearch])

  // Reset bij periode- of artikelwissel
  useEffect(() => { setSelectedArticle(null); setShowAllRuns(false) }, [days])
  useEffect(() => { setShowAllRuns(false) }, [selectedArticle])

  const since = getSinceDate(days)

  const selectMachine = (m: MachineSummary) => {
    setSelectedMachine(m)
    setSelectedArticle(null)
    setArticleSearch('')
    setDebouncedSearch('')
  }

  // Pareto query — backend doet ILIKE als debouncedSearch gevuld is
  const { data: paretoData, isLoading: paretoLoading } = useQuery<ParetoData>({
    queryKey: ['cnc-pareto', since, selectedMachine?.id ?? '', debouncedSearch],
    queryFn:  () => apiFetch(
      `/admin/cnc-project-analysis/pareto?since=${since}&machineId=${selectedMachine!.id}&limit=50${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}`,
    ) as Promise<ParetoData>,
    enabled:  !!selectedMachine && !selectedArticle,
    staleTime: 60_000,
  })

  const { data: detailData, isLoading: detailLoading } = useQuery<ArticleDetail>({
    queryKey: ['cnc-article-detail', selectedArticle, since, selectedMachine?.id ?? ''],
    queryFn:  () => apiFetch(
      `/admin/cnc-project-analysis/detail?article=${encodeURIComponent(selectedArticle!)}&since=${since}${selectedMachine ? `&machineId=${selectedMachine.id}` : ''}`,
    ) as Promise<ArticleDetail>,
    enabled:  !!selectedArticle,
    staleTime: 60_000,
  })

  // ── Niveau 1 — Machine-tegels ────────────────────────────────────────────
  if (!selectedMachine) {
    return (
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {machines.map(m => (
            <button
              key={m.id}
              onClick={() => selectMachine(m)}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden text-left hover:border-teal-300 hover:shadow-sm transition-all"
            >
              <div className="h-28 bg-gray-50 flex items-center justify-center overflow-hidden">
                {m.photoUrl
                  ? <img src={m.photoUrl} alt={m.name} className="w-full h-full object-contain" />
                  : <Activity size={28} className="text-gray-200" />
                }
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <ChevronRight size={12} className="text-teal-500 shrink-0" />
                  <p className="text-xs text-teal-600">Bekijk projecten</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Niveau 2 — Pareto artikelen ───────────────────────────────────────────
  if (!selectedArticle) {
    const articles = paretoData?.articles ?? []
    const maxSec   = articles[0]?.totalSeconds || 1
    const isSearching = debouncedSearch.length > 0

    return (
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <button onClick={() => { setSelectedMachine(null); setArticleSearch(''); setDebouncedSearch('') }} className="hover:text-teal-600 transition-colors">
            Alle machines
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="font-medium text-gray-800">{selectedMachine.name}</span>
        </div>

        {/* Zoekbalk */}
        <div className="relative max-w-xs mb-4">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Zoek artikelnummer..."
            value={articleSearch}
            onChange={e => setArticleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const first = articles[0]
                if (first) setSelectedArticle(first.article)
                else if (articleSearch.trim()) setSelectedArticle(articleSearch.trim())
              }
            }}
            className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          {paretoLoading && isSearching && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs">…</span>
          )}
        </div>

        {paretoLoading && !isSearching ? (
          <p className="text-sm text-gray-400 text-center py-12">Laden...</p>
        ) : !articles.length ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            {isSearching ? (
              <>
                <p className="text-sm text-gray-400">Geen artikelen gevonden voor <strong>"{debouncedSearch}"</strong></p>
                <p className="text-xs text-gray-300 mt-1">Probeer een kortere zoekterm</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Geen runs gevonden voor {selectedMachine.name} in deze periode</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {isSearching
                  ? `${articles.length} artikel${articles.length !== 1 ? 'en' : ''} gevonden voor "${debouncedSearch}"`
                  : `Verspaantijd per artikel — ${selectedMachine.name}`}
              </h3>
              <button
                onClick={() => setShowInfoN2(v => !v)}
                className="w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:border-teal-400 hover:text-teal-600 text-xs font-bold flex items-center justify-center transition-colors shrink-0"
                aria-label="Uitleg"
              >i</button>
            </div>
            {showInfoN2 && (
              <div className="mb-4 bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-600 space-y-2">
                <p className="font-semibold text-gray-700">Wat toont deze lijst?</p>
                <p>Alle artikelen die op <strong>{selectedMachine.name}</strong> zijn vervaardigd in de geselecteerde periode, gerangschikt op verspaantijd (langste bovenaan).</p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-teal-500" />
                    <p><strong>Groen</strong> — aandeel voltooide runs (status: voltooid of gestopt).</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-red-400" />
                    <p><strong>Rood</strong> — aandeel onderbroken runs (onderbroken door alarm, netwerk of handmatig gestopt).</p>
                  </div>
                </div>
                <p className="text-gray-400">Klik op een artikel om de detailweergave te openen.</p>
              </div>
            )}
            <div className="space-y-2">
              {articles.map(a => {
                const completedPct     = a.runCount > 0 ? (a.completedRuns / a.runCount * 100) : 0
                const barWidth         = Math.round((a.totalSeconds / maxSec) * 100)
                const interruptedPart  = a.runCount > 0 ? Math.round((a.interruptedRuns / a.runCount) * barWidth) : 0
                const completedPart    = barWidth - interruptedPart
                return (
                  <button
                    key={a.article}
                    onClick={() => setSelectedArticle(a.article)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-40 shrink-0">
                        <p className="text-xs font-medium text-gray-700 truncate group-hover:text-teal-600 transition-colors" title={a.article}>
                          {a.article}
                        </p>
                        <p className="text-xs text-gray-400">{a.runCount} runs · {Math.round(completedPct)}% voltooid</p>
                      </div>
                      <div className="flex-1 flex h-5 rounded overflow-hidden bg-gray-100">
                        {completedPart > 0 && <div className="bg-teal-500 h-full" style={{ width: `${completedPart}%` }} />}
                        {interruptedPart > 0 && <div className="bg-red-400 h-full" style={{ width: `${interruptedPart}%` }} />}
                      </div>
                      <span className="text-xs text-gray-600 font-medium w-16 text-right shrink-0">
                        {fmtSeconds(a.totalSeconds)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-sm bg-teal-500 shrink-0" /> Voltooid
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-sm bg-red-400 shrink-0" /> Onderbroken
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Niveau 3 — Artikeldetail ──────────────────────────────────────────────
  const completionPct = detailData && detailData.runCount > 0
    ? Math.round(detailData.completedRuns / detailData.runCount * 100)
    : 0

  // Downtime die overlapt met de run-vensters van dit artikel (niet machine-breed)
  const runOverlap = detailData
    ? computeRunOverlap(detailData.runs, selectedMachine.periods)
    : { alarmstilstandMin: 0, stilstandMin: 0, offlineMin: 0 }
  const machineAlarmMin = runOverlap.alarmstilstandMin
  const machineStilMin  = runOverlap.stilstandMin
  const machineOffMin   = runOverlap.offlineMin

  return (
    <div>
      {/* Breadcrumb + info knop */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
          <button
            onClick={() => { setSelectedMachine(null); setSelectedArticle(null); setArticleSearch(''); setDebouncedSearch('') }}
            className="hover:text-teal-600 transition-colors"
          >
            Alle machines
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <button onClick={() => setSelectedArticle(null)} className="hover:text-teal-600 transition-colors font-medium text-gray-700">
            {selectedMachine.name}
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="font-medium text-gray-800">{selectedArticle}</span>
        </div>
        <button
          onClick={() => setShowInfoN3(v => !v)}
          className="w-5 h-5 rounded-full border border-gray-300 text-gray-400 hover:border-teal-400 hover:text-teal-600 text-xs font-bold flex items-center justify-center transition-colors shrink-0"
          aria-label="Uitleg"
        >i</button>
      </div>

      {showInfoN3 && (
        <div className="mb-4 bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-600 space-y-2">
          <p className="font-semibold text-gray-700">Wat toont deze weergave?</p>
          <p>Alle programma-runs van artikel <strong>{selectedArticle}</strong> op <strong>{selectedMachine.name}</strong> in de geselecteerde periode, met een uitsplitsing van hoe de machine-tijd verdeeld is.</p>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-teal-500" />
              <p><strong>Verspaantijd</strong> — totale looptijd van alle runs van dit artikel op deze machine.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-red-500" />
              <p><strong>Alarmstilstand</strong> — machine stond stil door een alarm. Machine-breed gemeten in deze periode.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-amber-400" />
              <p><strong>Stilstand</strong> — geen programma actief voor meer dan 10 minuten. Machine-breed gemeten in deze periode.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-3 h-3 rounded-sm flex-shrink-0 bg-gray-400" />
              <p><strong>Offline</strong> — machine niet bereikbaar via het netwerk. Machine-breed gemeten in deze periode.</p>
            </div>
          </div>
          <p className="text-gray-400">De percentages geven het aandeel van elke categorie ten opzichte van de som van alle vier. De balk en waarden verversen automatisch.</p>
        </div>
      )}

      {detailLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">Laden...</p>
      ) : !detailData ? (
        <p className="text-sm text-red-400 text-center py-12">Laden mislukt — controleer backend logs</p>
      ) : (
        <div className="space-y-4">
          {/* KPI-kaarten */}
          {(() => {
            const interruptedMin = Math.round((detailData.interruptedSeconds ?? 0) / 60)
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-l-4 border-l-teal-500">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs text-gray-400">Verspaantijd</p>
                    <button onClick={() => setOpenKpiInfo(v => v === 'verspaantijd' ? null : 'verspaantijd')} className="w-4 h-4 rounded-full border border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 mt-0.5">i</button>
                  </div>
                  <p className="text-xl font-bold text-teal-700">{fmtSeconds(detailData.totalSeconds)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{detailData.runCount} runs</p>
                  {openKpiInfo === 'verspaantijd' && (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-relaxed">
                      Totale duur van alle afgeronde en gestopte runs voor dit artikel. Runs met duur 0 (phantom) worden uitgesloten.
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-l-4 border-l-orange-500">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs text-gray-400">Onderbroken</p>
                    <button onClick={() => setOpenKpiInfo(v => v === 'onderbroken' ? null : 'onderbroken')} className="w-4 h-4 rounded-full border border-gray-200 text-gray-400 hover:border-orange-400 hover:text-orange-600 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 mt-0.5">i</button>
                  </div>
                  <p className="text-xl font-bold text-orange-600">
                    {interruptedMin > 0 ? fmtSeconds(interruptedMin * 60) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {interruptedMin > 0 ? `${detailData.runCount - detailData.completedRuns} runs afgebroken` : 'geen onderbroken runs'}
                  </p>
                  {openKpiInfo === 'onderbroken' && (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-relaxed">
                      Verspaantijd van runs die niet normaal zijn afgerond — programma afgebroken of gestopt zonder een volgend programma te starten.
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-l-4 border-l-red-500">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs text-gray-400">Alarmstilstand</p>
                    <button onClick={() => setOpenKpiInfo(v => v === 'alarm' ? null : 'alarm')} className="w-4 h-4 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 mt-0.5">i</button>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    {machineAlarmMin > 0 ? fmtSeconds(machineAlarmMin * 60) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedMachine.name}</p>
                  {openKpiInfo === 'alarm' && (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-relaxed">
                      Stilstand door machine-alarmen, beperkt tot de perioden dat dit artikel werd verwerkt (van eerste run-start tot laatste run-einde per dag).
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-l-4 border-l-amber-400">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs text-gray-400">Stilstand</p>
                    <button onClick={() => setOpenKpiInfo(v => v === 'stilstand' ? null : 'stilstand')} className="w-4 h-4 rounded-full border border-gray-200 text-gray-400 hover:border-amber-400 hover:text-amber-600 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 mt-0.5">i</button>
                  </div>
                  <p className="text-xl font-bold text-amber-500">
                    {machineStilMin > 0 ? fmtSeconds(machineStilMin * 60) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">&gt; 10 min zonder programma</p>
                  {openKpiInfo === 'stilstand' && (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-relaxed">
                      Machine stond aan maar startte meer dan 10 minuten geen nieuw programma. Beperkt tot de run-vensters van dit artikel.
                    </p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 border-l-4 border-l-gray-400">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs text-gray-400">Offline</p>
                    <button onClick={() => setOpenKpiInfo(v => v === 'offline' ? null : 'offline')} className="w-4 h-4 rounded-full border border-gray-200 text-gray-400 hover:border-gray-500 hover:text-gray-600 text-[10px] font-bold flex items-center justify-center transition-colors shrink-0 mt-0.5">i</button>
                  </div>
                  <p className="text-xl font-bold text-gray-500">
                    {machineOffMin > 0 ? fmtSeconds(machineOffMin * 60) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">niet bereikbaar</p>
                  {openKpiInfo === 'offline' && (
                    <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 leading-relaxed">
                      Machine was niet bereikbaar via netwerk. Beperkt tot de run-vensters van dit artikel. Perioden korter dan 5 min worden genegeerd.
                    </p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Enkelvoudige gesegmenteerde tijdbalk voor de geselecteerde periode */}
          <PeriodBar
            verspaanMin={Math.round(detailData.totalSeconds / 60)}
            interruptedMin={Math.round((detailData.interruptedSeconds ?? 0) / 60)}
            alarmMin={machineAlarmMin}
            stilstandMin={machineStilMin}
            offlineMin={machineOffMin}
            since={since}
            machineName={selectedMachine.name}
            article={selectedArticle!}
          />


          {/* Per machine — alleen tonen als meerdere machines */}
          {detailData.byMachine.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Verdeling per machine</h3>
              <div className="space-y-2">
                {detailData.byMachine.map(m => {
                  const pct = Math.round(m.seconds / detailData.totalSeconds * 100)
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <p className="text-xs font-medium text-gray-700 w-24 shrink-0 truncate">{m.name}</p>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div className="bg-teal-500 h-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-24 text-right shrink-0">
                        {fmtSeconds(m.seconds)} ({m.runCount} runs)
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Run-tabel */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Runs ({detailData.runs.length}{detailData.runs.length === 100 ? '+' : ''})
            </h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-2 font-medium">Machine</th>
                    <th className="text-left pb-2 font-medium">Gestart</th>
                    <th className="text-left pb-2 font-medium">Duur</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(showAllRuns ? detailData.runs : detailData.runs.slice(0, 10)).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-700">{r.machineName}</td>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{fmtRunDate(r.startedAt)}</td>
                      <td className="py-2 pr-4 font-mono text-gray-700">{fmtDuration(r.durationSeconds)}</td>
                      <td className="py-2">
                        {r.status === 'completed' || r.status === 'stopped' ? (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            {r.status === 'completed' ? 'Voltooid' : 'Gestopt'}
                          </span>
                        ) : r.status === 'interrupted' ? (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Onderbroken</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{r.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detailData.runs.length > 10 && (
              <button
                onClick={() => setShowAllRuns(v => !v)}
                className="mt-3 w-full text-xs text-teal-600 hover:text-teal-700 font-medium py-2 border border-teal-100 rounded-lg hover:bg-teal-50 transition-colors"
              >
                {showAllRuns
                  ? 'Minder tonen'
                  : `Toon alle ${detailData.runs.length}${detailData.runs.length === 100 ? '+' : ''} runs`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── einde ProjectAnalyseTab ─────────────────────────────────────────────────

type DashboardTab = 'beschikbaarheid' | 'spindeluren' | 'verspaantijd' | 'projectanalyse'

export function MachineDashboardContent() {
  const [days, setDays] = useState(0)
  const [tab, setTab]   = useState<DashboardTab>('beschikbaarheid')

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['machine-downtime-all', days],
    queryFn:  () => apiFetch(`/admin/cnc-downtime/all?since=${getSinceDate(days)}`) as Promise<DashboardData>,
    refetchInterval: 30_000,
  })

  const ongoingCount  = data?.machines.filter(m => m.ongoingPeriod).length ?? 0
  const totalDowntime = data?.machines.reduce((s, m) => s + m.totalDowntimeMinutes, 0) ?? 0

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Periode filter */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <PeriodeFilterInfo />
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

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-5">
          {([
            { key: 'beschikbaarheid', label: 'Beschikbaarheid' },
            { key: 'spindeluren',     label: 'Spindeluren' },
            { key: 'verspaantijd',    label: 'Verspaantijd' },
            { key: 'projectanalyse',  label: 'Projectanalyse' },
          ] as { key: DashboardTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {label}
            </button>
          ))}
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
            {tab === 'beschikbaarheid' && (
              <BeschikbaarheidTab machines={data.machines} />
            )}

            {tab === 'spindeluren' && (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock size={13} /> Spindeluren per dag
                </h2>
                <div className="space-y-6">
                  {data.machines.map(m => (
                    <SpindleChart key={m.id} machineId={m.id} machineName={m.name} days={days} />
                  ))}
                </div>
              </div>
            )}

            {tab === 'verspaantijd' && <VerspaantijdSectie days={days} />}

            {tab === 'projectanalyse' && (
              <ProjectAnalyseTab machines={data.machines} days={days} />
            )}
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
