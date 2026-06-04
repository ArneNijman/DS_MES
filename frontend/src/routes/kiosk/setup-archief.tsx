import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Package, FileText, AlertTriangle, Clock, ChevronRight, ExternalLink } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface ArticleCard {
  articleNo:        string
  articleName:      string | null
  orderCount:       number
  latestArchivedAt: string
}

interface ArchiefOrder {
  productionOrderNo: string
  description:       string | null
  archivedAt:        string
  setupCount:        number
}

interface ArchiefSetup {
  id:                string
  productionOrderNo: string | null
  articleNo:         string | null
  articleName:       string | null
  setupType:         string
  description:       string | null
  createdAt:         string
  archivedAt:        string
  totalSteps:        number
}

interface ArchiefNcr {
  id:               string
  ncrId:            string
  productionOrder:  string | null
  itemRef:          string | null
  itemName:         string | null
  shortDescription: string | null
  status:           string
  faultCode:        string | null
  createdAt:        string
}

interface ArchiefProgramRun {
  id:              string
  machineId:       string
  machineName:     string | null
  programName:     string
  startedAt:       string
  endedAt:         string | null
  durationSeconds: number | null
  status:          string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

function fmtTotalTime(runs: ArchiefProgramRun[]) {
  const total = runs.reduce((s, r) => s + (r.durationSeconds ?? 0), 0)
  return fmtDuration(total)
}

function programBasename(name: string) {
  return name.replace(/.*[\\/]/, '')
}

function ncrStatusLabel(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    open:           { label: 'Open',           color: 'bg-red-100 text-red-700'    },
    in_behandeling: { label: 'In behandeling', color: 'bg-orange-100 text-orange-700' },
    in_uitvoering:  { label: 'In uitvoering',  color: 'bg-blue-100 text-blue-700'  },
    gereed:         { label: 'Gereed',         color: 'bg-green-100 text-green-700' },
    gesloten:       { label: 'Gesloten',       color: 'bg-gray-100 text-gray-600'  },
    vervallen:      { label: 'Vervallen',      color: 'bg-gray-100 text-gray-400'  },
  }
  return map[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
}

function runStatusColor(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700'
  if (status === 'stopped')   return 'bg-orange-100 text-orange-700'
  if (status === 'interrupted' || status === 'error') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

// ── View 1: Artikeloverzicht ──────────────────────────────────────────────────

function ArtikelGrid({ onSelect }: { onSelect: (a: ArticleCard) => void }) {
  const [search, setSearch] = useState('')

  const { data = [], isLoading } = useQuery<ArticleCard[]>({
    queryKey: ['archief-articles'],
    queryFn:  () => apiFetch('/kiosk/archive/articles') as Promise<ArticleCard[]>,
    staleTime: 2 * 60_000,
  })

  const filtered = data.filter(a =>
    !search ||
    a.articleNo?.toLowerCase().includes(search.toLowerCase()) ||
    a.articleName?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <h1 className="text-base font-semibold text-gray-800">Setup Archief</h1>
        <span className="text-xs text-gray-400">{data.length} artikel{data.length !== 1 ? 'en' : ''}</span>
      </div>

      <div className="px-4 py-3">
        <input
          type="text"
          placeholder="Zoek op artikelnummer of omschrijving..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading && (
          <p className="text-sm text-gray-400 text-center mt-8">Laden...</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            {data.length === 0
              ? 'Nog geen afgeronde productieorders in het archief.'
              : 'Geen artikelen gevonden voor deze zoekopdracht.'}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(a => (
            <button
              key={a.articleNo}
              onClick={() => onSelect(a)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-teal-400 hover:shadow-sm transition-all active:scale-[0.98]"
            >
              <p className="text-sm font-bold text-gray-800 truncate">{a.articleNo || '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.articleName || 'Geen omschrijving'}</p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-xs bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded-full">
                  {a.orderCount} order{a.orderCount !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-2">{fmtDate(a.latestArchivedAt)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── View 2: Orders per artikel ────────────────────────────────────────────────

function OrderLijst({
  article,
  onBack,
  onSelect,
}: {
  article:  ArticleCard
  onBack:   () => void
  onSelect: (o: ArchiefOrder) => void
}) {
  const { data = [], isLoading } = useQuery<ArchiefOrder[]>({
    queryKey: ['archief-orders', article.articleNo],
    queryFn:  () => apiFetch(`/kiosk/archive/orders?articleNo=${encodeURIComponent(article.articleNo)}`) as Promise<ArchiefOrder[]>,
    staleTime: 2 * 60_000,
  })

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-base font-semibold text-gray-800">{article.articleNo}</h1>
          {article.articleName && <p className="text-xs text-gray-500">{article.articleName}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center mt-8">Laden...</p>}
        {!isLoading && data.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">Geen orders gevonden.</p>
        )}
        {data.map(order => (
          <button
            key={order.productionOrderNo}
            onClick={() => onSelect(order)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-teal-400 hover:shadow-sm transition-all active:scale-[0.99] flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">{order.productionOrderNo}</p>
              {order.description && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{order.description}</p>
              )}
              <p className="text-xs text-gray-300 mt-2">Gearchiveerd {fmtDate(order.archivedAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {order.setupCount} setup{order.setupCount !== 1 ? 's' : ''}
              </span>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── View 3: Order detail dashboard ───────────────────────────────────────────

function OrderDetail({
  order,
  articleNo,
  onBack,
  onOpenSetup,
}: {
  order:         ArchiefOrder
  articleNo:     string
  onBack:        () => void
  onOpenSetup:   (setupId: string, type: 'product' | 'meet') => void
}) {
  const { data: setups = [] } = useQuery<ArchiefSetup[]>({
    queryKey: ['archief-setups', order.productionOrderNo],
    queryFn:  () => apiFetch(`/kiosk/archive/setups?productionOrderNo=${encodeURIComponent(order.productionOrderNo)}`) as Promise<ArchiefSetup[]>,
    staleTime: 2 * 60_000,
  })

  const { data: ncrs = [] } = useQuery<ArchiefNcr[]>({
    queryKey: ['archief-ncrs', order.productionOrderNo],
    queryFn:  () => apiFetch(`/kiosk/archive/ncrs?productionOrderNo=${encodeURIComponent(order.productionOrderNo)}`) as Promise<ArchiefNcr[]>,
    staleTime: 2 * 60_000,
  })

  const { data: runs = [] } = useQuery<ArchiefProgramRun[]>({
    queryKey: ['archief-runs', articleNo],
    queryFn:  () => apiFetch(`/kiosk/archive/program-runs?articleNo=${encodeURIComponent(articleNo)}`) as Promise<ArchiefProgramRun[]>,
    staleTime: 2 * 60_000,
  })

  const productSetups = setups.filter(s => s.setupType === 'product')
  const meetSetups    = setups.filter(s => s.setupType === 'meet')
  const totalTime     = fmtTotalTime(runs)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-800">{order.productionOrderNo}</h1>
          {order.description && <p className="text-xs text-gray-500 truncate">{order.description}</p>}
        </div>
        <span className="text-xs text-gray-400 shrink-0">Gearchiveerd {fmtDate(order.archivedAt)}</span>
      </div>

      {/* Samenvatting balk */}
      <div className="grid grid-cols-4 gap-px bg-gray-200 border-b">
        {[
          { label: 'Setups',      value: setups.length.toString() },
          { label: 'NCR\'s',     value: ncrs.length.toString() },
          { label: 'Runs',        value: runs.length.toString() },
          { label: 'Machinetijd', value: totalTime },
        ].map(item => (
          <div key={item.label} className="bg-white px-4 py-2 text-center">
            <p className="text-lg font-bold text-gray-800">{item.value}</p>
            <p className="text-xs text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Product Setups */}
        {productSetups.length > 0 && (
          <Section
            title="Product Setups"
            count={productSetups.length}
            icon={<Package size={14} />}
            action={productSetups.length === 1 ? <button onClick={() => onOpenSetup(productSetups[0].id, 'product')} className="flex items-center gap-1 text-xs text-teal-600 hover:underline"><ExternalLink size={12} />Openen</button> : undefined}
          >
            {productSetups.map(s => <SetupRow key={s.id} setup={s} onOpen={() => onOpenSetup(s.id, 'product')} />)}
          </Section>
        )}

        {/* Meet Setups */}
        {meetSetups.length > 0 && (
          <Section
            title="Meet Setups"
            count={meetSetups.length}
            icon={<FileText size={14} />}
            action={meetSetups.length === 1 ? <button onClick={() => onOpenSetup(meetSetups[0].id, 'meet')} className="flex items-center gap-1 text-xs text-teal-600 hover:underline"><ExternalLink size={12} />Openen</button> : undefined}
          >
            {meetSetups.map(s => <SetupRow key={s.id} setup={s} onOpen={() => onOpenSetup(s.id, 'meet')} />)}
          </Section>
        )}

        {setups.length === 0 && (
          <EmptyState label="Geen setups gekoppeld aan dit ordernummer" />
        )}

        {/* NCR's */}
        <Section title="NCR's" count={ncrs.length} icon={<AlertTriangle size={14} />}>
          {ncrs.length === 0
            ? <p className="text-xs text-gray-400 py-2">Geen NCR's gekoppeld aan dit ordernummer.</p>
            : ncrs.map(ncr => (
              <div key={ncr.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-700">{ncr.ncrId}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', ncrStatusLabel(ncr.status).color)}>
                      {ncrStatusLabel(ncr.status).label}
                    </span>
                    {ncr.faultCode && <span className="text-xs text-gray-400">{ncr.faultCode}</span>}
                  </div>
                  {ncr.shortDescription && (
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{ncr.shortDescription}</p>
                  )}
                </div>
                <span className="text-xs text-gray-300 shrink-0">{fmtDate(ncr.createdAt)}</span>
              </div>
            ))
          }
        </Section>

        {/* Programma-runs */}
        <Section title="Programma-runs" count={runs.length} icon={<Clock size={14} />}
          action={runs.length > 0 ? <span className="text-xs text-gray-400">Totaal: {totalTime}</span> : undefined}
        >
          {runs.length === 0
            ? <p className="text-xs text-gray-400 py-2">Geen programma-runs gevonden voor dit artikel.</p>
            : runs.map(run => (
              <div key={run.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-700">{programBasename(run.programName)}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full', runStatusColor(run.status))}>
                      {run.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {run.machineName ?? '—'} · {fmtDateTime(run.startedAt)}
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-600 shrink-0">{fmtDuration(run.durationSeconds)}</span>
              </div>
            ))
          }
        </Section>

      </div>
    </div>
  )
}

// ── Gedeelde subcomponenten ───────────────────────────────────────────────────

function Section({
  title, count, icon, action, children,
}: {
  title:    string
  count:    number
  icon:     React.ReactNode
  action?:  React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          {icon}{title}
          <span className="text-gray-400 font-normal">({count})</span>
        </div>
        {action}
      </div>
      <div className="px-4 divide-y divide-gray-100">
        {children}
      </div>
    </div>
  )
}

function SetupRow({ setup, onOpen }: { setup: ArchiefSetup; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50 transition-colors -mx-4 px-4 rounded"
    >
      <span className={cn(
        'text-xs px-1.5 py-0.5 rounded font-medium shrink-0',
        setup.setupType === 'product' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700',
      )}>
        {setup.setupType === 'product' ? 'Product' : 'Meet'}
      </span>
      <div className="flex-1 min-w-0">
        {setup.description && <p className="text-xs text-gray-700 truncate">{setup.description}</p>}
        {setup.articleName && <p className="text-xs text-gray-400 truncate">{setup.articleName}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-400">{setup.totalSteps} stap{setup.totalSteps !== 1 ? 'pen' : ''}</span>
        <ChevronRight size={12} className="text-gray-300" />
      </div>
    </button>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

export function SetupArchiefContent({
  onOpenSetup,
}: {
  onOpenSetup?: (setupId: string, type: 'product' | 'meet') => void
}) {
  const [article, setArticle] = useState<ArticleCard | null>(null)
  const [order, setOrder]     = useState<ArchiefOrder | null>(null)

  const handleOpenSetup = (setupId: string, type: 'product' | 'meet') => {
    onOpenSetup?.(setupId, type)
  }

  if (!article) return <ArtikelGrid onSelect={setArticle} />

  if (!order) return (
    <OrderLijst
      article={article}
      onBack={() => setArticle(null)}
      onSelect={setOrder}
    />
  )

  return (
    <OrderDetail
      order={order}
      articleNo={article.articleNo}
      onBack={() => setOrder(null)}
      onOpenSetup={(setupId, type) => handleOpenSetup(setupId, type)}
    />
  )
}
