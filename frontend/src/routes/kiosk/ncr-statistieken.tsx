import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer,
  ComposedChart, BarChart,
  Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────

interface NcrStats {
  totaal: number
  actief: number
  gesloten: number
  openOuderDan30: number
  maatregelNodigPct: number
  gemiddeldeDoorlooptijd: number | null
  perMaand:         { month: string; count: number }[]
  perAfdeling:      { causingDepartment: string; count: number }[]
  perFaultCode:     { faultCode: string; count: number }[]
  perCauseCode:     { causeCode: string; count: number }[]
  perDispositionType: { dispositionType: string; count: number }[]
  topCombinaties:   { causingDepartment: string; faultCode: string; count: number }[]
  beschikbareJaren: number[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#0d9488', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6']

function toPareto(data: { name: string; count: number }[]) {
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const total  = sorted.reduce((s, d) => s + d.count, 0)
  let cumul = 0
  return sorted.map((d) => {
    cumul += d.count
    return { ...d, cumPct: total > 0 ? Math.round((cumul / total) * 100) : 0 }
  })
}

function padMonths(year: number, data: { month: string; count: number }[]) {
  const map = new Map(data.map((d) => [d.month, d.count]))
  return Array.from({ length: 12 }, (_, i) => {
    const m     = `${year}-${String(i + 1).padStart(2, '0')}`
    const label = new Date(m + '-01').toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')
    return { month: m, label, count: map.get(m) ?? 0 }
  })
}

function formatMonthLabel(month: string) {
  return new Date(month + '-01')
    .toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    .replace(/\./g, '')
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, accent = false, warn = false,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm p-4',
      accent ? 'border-teal-300' : warn ? 'border-red-300' : 'border-gray-200',
    )}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn(
        'text-2xl font-bold leading-tight',
        accent ? 'text-teal-600' : warn ? 'text-red-500' : 'text-gray-800',
      )}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartCard({
  title, children, className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm p-4', className)}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

interface ParetoItem { name: string; count: number; cumPct: number }

function ParetoChart({ data, color = '#0d9488' }: { data: ParetoItem[]; color?: string }) {
  if (data.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-10">Geen data</p>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 5, right: 32, left: 0, bottom: 64 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10 }}
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === 'cumPct' ? [`${value}%`, 'Cumulatief'] : [value, 'Aantal']
          }
        />
        <Bar yAxisId="left"  dataKey="count"  fill={color} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────

export function NcrStatistiekenContent() {
  const [year,         setYear]         = useState<number | null>(null)
  const [selectedDept, setSelectedDept] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (year)         params.set('year',              String(year))
  if (selectedDept) params.set('causingDepartment', selectedDept)

  const { data: stats, isLoading } = useQuery<NcrStats>({
    queryKey: ['ncr-stats', year, selectedDept],
    queryFn:  () => apiFetch(`/kiosk/ncr/statistics?${params}`),
    staleTime: 60_000,
  })

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Laden…
      </div>
    )
  }

  // Maand-data: met jaar-filter → vul alle 12 maanden aan; zonder → toon beschikbare maanden
  const maandData = year
    ? padMonths(year, stats.perMaand)
    : stats.perMaand.map((d) => ({ ...d, label: formatMonthLabel(d.month) }))

  const faultPareto = toPareto(stats.perFaultCode.map((d) => ({ name: d.faultCode,  count: d.count })))
  const causePareto = toPareto(stats.perCauseCode.map((d) => ({ name: d.causeCode,  count: d.count })))
  const topCombiData = stats.topCombinaties.map((d) => ({
    name:  `${d.causingDepartment} — ${d.faultCode}`,
    count: d.count,
  }))

  const deptBarHeight = Math.max(160, stats.perAfdeling.length * 36 + 20)
  const topBarHeight  = Math.max(160, topCombiData.length * 30 + 20)

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Header + filters ── */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-teal-600" />
            <h2 className="text-base font-semibold text-gray-800">NCR Statistieken</h2>
            <span className="text-xs text-gray-400">{stats.totaal} records</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Jaar-filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setYear(null)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  year === null
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                Alle jaren
              </button>
              {stats.beschikbareJaren.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    year === y
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>

            {/* Actief afdelingsfilter chip */}
            {selectedDept && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-xs font-medium">
                <span>{selectedDept}</span>
                <button
                  onClick={() => setSelectedDept(null)}
                  className="hover:text-red-600 transition-colors"
                  title="Filter verwijderen"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollbaar inhoud ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Samenvattingskaarten */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <SummaryCard label="Totaal NCR's"        value={stats.totaal}  accent />
          <SummaryCard label="Actief"               value={stats.actief}  sub="open / in behandeling" />
          <SummaryCard label="Gesloten"             value={stats.gesloten} />
          <SummaryCard
            label="Oud > 30 dgn"
            value={stats.openOuderDan30}
            sub="actief, ouder dan 30 dagen"
            warn={stats.openOuderDan30 > 0}
          />
          <SummaryCard
            label="Gem. doorlooptijd"
            value={stats.gemiddeldeDoorlooptijd !== null
              ? `${stats.gemiddeldeDoorlooptijd} dgn`
              : '—'}
            sub="aanmaak → gesloten"
          />
          <SummaryCard
            label="Maatregel nodig"
            value={`${stats.maatregelNodigPct}%`}
            sub="van totaal"
          />
        </div>

        {/* Afwijkingen per maand */}
        <ChartCard title={year ? `Afwijkingen per maand — ${year}` : 'Afwijkingen per maand (alle jaren)'}>
          {maandData.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-10">Geen data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={maandData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, 'Afwijkingen']} />
                <Bar  dataKey="count" fill="#0d9488" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Pareto foutcode + oorzaakcode */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard title="Pareto — Type fout (foutcode)">
            <ParetoChart data={faultPareto} color="#0d9488" />
          </ChartCard>
          <ChartCard title="Pareto — Oorzaakcode">
            <ParetoChart data={causePareto} color="#3b82f6" />
          </ChartCard>
        </div>

        {/* Afwijkingen per veroorzakende afdeling */}
        <ChartCard title="Afwijkingen per veroorzakende afdeling — klik om te filteren">
          {stats.perAfdeling.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-10">Geen data</p>
          ) : (
            <ResponsiveContainer width="100%" height={deptBarHeight}>
              <BarChart
                layout="vertical"
                data={stats.perAfdeling}
                margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="causingDepartment"
                  width={150}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => [v, 'Afwijkingen']} />
                <Bar
                  dataKey="count"
                  radius={[0, 3, 3, 0]}
                  cursor="pointer"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(d: any) => setSelectedDept(
                    selectedDept === d.causingDepartment ? null : d.causingDepartment,
                  )}
                >
                  {stats.perAfdeling.map((d) => (
                    <Cell
                      key={d.causingDepartment}
                      fill={selectedDept === d.causingDepartment ? '#f59e0b' : '#0d9488'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top 10 combinaties afdeling × foutcode  +  Dispositie verdeling */}
        <div className="grid grid-cols-2 gap-6">
          <ChartCard title="Top 10 afdeling × foutcode combinaties">
            {topCombiData.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-10">Geen data</p>
            ) : (
              <ResponsiveContainer width="100%" height={topBarHeight}>
                <BarChart
                  layout="vertical"
                  data={topCombiData}
                  margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={210}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(v: number) => [v, 'Afwijkingen']} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Dispositie verdeling">
            {stats.perDispositionType.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-10">Geen data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats.perDispositionType}
                    dataKey="count"
                    nameKey="dispositionType"
                    cx="50%"
                    cy="42%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {stats.perDispositionType.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => (
                      <span className="text-xs text-gray-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

      </div>
    </div>
  )
}
