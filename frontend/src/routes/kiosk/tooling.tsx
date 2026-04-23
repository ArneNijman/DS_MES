import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Star, X, Minus, Plus, Trash2, ArrowRightLeft, Package } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolingArticle {
  id: string
  articleType: string
  name: string
  orderingCode: string | null
  manufacturer: string | null
  photoUrl: string | null
  totalStock: number
}

interface StockLocation {
  id: string
  articleId: string
  locationCode: string
  quantity: number
}

interface Mutation {
  id: string
  locationCode: string
  quantityDelta: number
  createdAt: string
  employeeName: string | null
}

interface AssemblyRelation {
  ncNumber: number
  ncName: string
  partnerName: string
  partnerType: 'holder' | 'tool'
}

interface ArticleDetail {
  article: ToolingArticle
  locations: StockLocation[]
  mutations: Mutation[]
  related: ToolingArticle[]
  assemblies: AssemblyRelation[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  holder:      'Houder',
  extension:   'Adapter',
  frees:       'Frees',
  boor:        'Boor',
  tap:         'Tap',
  uitboorder:  'Uitboorder',
  ruimer:      'Ruimer',
  wisselplaat: 'Wisselplaat',
  schroef:     'Schroef',
  overig:      'Overig',
}

const TYPE_COLORS: Record<string, string> = {
  holder:      'bg-blue-100 text-blue-700',
  extension:   'bg-teal-100 text-teal-700',
  frees:       'bg-purple-100 text-purple-700',
  boor:        'bg-cyan-100 text-cyan-700',
  tap:         'bg-indigo-100 text-indigo-700',
  uitboorder:  'bg-pink-100 text-pink-700',
  ruimer:      'bg-rose-100 text-rose-700',
  wisselplaat: 'bg-amber-100 text-amber-700',
  schroef:     'bg-orange-100 text-orange-700',
  overig:      'bg-gray-100 text-gray-600',
}

const FILTER_TYPES = ['all', 'holder', 'extension', 'frees', 'boor', 'tap', 'uitboorder', 'ruimer', 'wisselplaat', 'schroef', 'overig'] as const
type FilterType = (typeof FILTER_TYPES)[number]

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded', TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600')}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function StockBadge({ stock }: { stock: number }) {
  return (
    <span className={cn(
      'text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center leading-none',
      stock === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
    )}>
      {stock}
    </span>
  )
}

function PhotoBox({ src, size = 80 }: { src?: string | null; size?: number }) {
  return (
    <div className="rounded bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0" style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
        : <Package size={size * 0.4} className="text-gray-300" />
      }
    </div>
  )
}

function formatMutDate(iso: string) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm} ${hh}:${min}`
}

// ── Article card ──────────────────────────────────────────────────────────────

function ArticleCard({
  article,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  article: ToolingArticle
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
}) {
  return (
    <div
      className="relative bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Ster */}
      <button
        className={cn(
          'absolute top-2 right-2 z-10 p-1 rounded-full transition-colors',
          isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400',
        )}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        title={isFavorite ? 'Verwijder favoriet' : 'Voeg toe aan favorieten'}
      >
        <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>

      <div className="p-3 flex flex-col items-center gap-2">
        <PhotoBox src={article.photoUrl} size={80} />

        <div className="w-full text-center space-y-1">
          <TypeBadge type={article.articleType} />
          <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{article.name}</p>
          {article.orderingCode && (
            <p className="text-[11px] text-gray-400 font-mono truncate">{article.orderingCode}</p>
          )}
        </div>
      </div>

      {/* Stock badge onderaan */}
      <div className="flex justify-center pb-3">
        <StockBadge stock={Number(article.totalStock)} />
      </div>
    </div>
  )
}

// ── Transfer form (inline, per locatie) ───────────────────────────────────────

function TransferForm({
  locId,
  articleId,
  maxQty,
  onDone,
  onCancel,
}: {
  locId: string
  articleId: string
  maxQty: number
  onDone: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [toCode, setToCode] = useState('')
  const [qty, setQty] = useState(1)

  const transfer = useMutation({
    mutationFn: () =>
      apiFetch(`/kiosk/tooling/stock-locations/${locId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ toLocationCode: toCode, quantity: qty }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooling-article', articleId] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
      onDone()
    },
  })

  return (
    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700">Verplaatsen naar</p>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
          placeholder="Doellocatie"
          value={toCode}
          onChange={(e) => setToCode(e.target.value)}
        />
        <input
          type="number"
          min={1}
          max={maxQty}
          className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center"
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
          disabled={!toCode.trim() || qty < 1 || transfer.isPending}
          onClick={() => transfer.mutate()}
        >
          {transfer.isPending ? 'Bezig...' : 'Verplaatsen'}
        </button>
        <button className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700" onClick={onCancel}>
          Annuleren
        </button>
      </div>
      {transfer.isError && (
        <p className="text-xs text-red-600">{(transfer.error as Error).message}</p>
      )}
    </div>
  )
}

// ── Article detail modal ──────────────────────────────────────────────────────

function ArticleDetailModal({
  articleId,
  favoriteIds,
  onToggleFavorite,
  onClose,
}: {
  articleId: string
  favoriteIds: string[]
  onToggleFavorite: (id: string) => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [newLocCode, setNewLocCode] = useState('')
  const [addingLoc, setAddingLoc] = useState(false)
  const [transferLocId, setTransferLocId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [mutateAmounts, setMutateAmounts] = useState<Record<string, number>>({})

  const { data, isLoading } = useQuery<ArticleDetail>({
    queryKey: ['tooling-article', articleId],
    queryFn: () => apiFetch(`/kiosk/tooling/articles/${articleId}`),
  })

  const addLocation = useMutation({
    mutationFn: () =>
      apiFetch(`/kiosk/tooling/articles/${articleId}/locations`, {
        method: 'POST',
        body: JSON.stringify({ locationCode: newLocCode.trim() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooling-article', articleId] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
      setNewLocCode('')
      setAddingLoc(false)
    },
  })

  const deleteLocation = useMutation({
    mutationFn: (locId: string) =>
      apiFetch(`/kiosk/tooling/stock-locations/${locId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooling-article', articleId] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
      setDeleteConfirmId(null)
    },
  })

  const mutateStock = useMutation({
    mutationFn: ({ locId, delta }: { locId: string; delta: number }) =>
      apiFetch(`/kiosk/tooling/stock-locations/${locId}/mutate`, {
        method: 'POST',
        body: JSON.stringify({ delta }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooling-article', articleId] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
    },
  })

  const getAmount = (locId: string) => mutateAmounts[locId] ?? 1

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8">
          <p className="text-gray-500 text-sm">Laden...</p>
        </div>
      </div>
    )
  }

  const { article, locations, mutations, related, assemblies } = data
  const totalStock = locations.reduce((s, l) => s + l.quantity, 0)
  const isFav = favoriteIds.includes(article.id)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl min-h-0">
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-gray-100">
          <PhotoBox src={article.photoUrl} size={72} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={article.articleType} />
              {article.manufacturer && (
                <span className="text-xs text-gray-400">{article.manufacturer}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5 leading-tight">{article.name}</h2>
            {article.orderingCode && (
              <p className="text-sm font-mono text-gray-400 mt-0.5">{article.orderingCode}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className={cn(
                'p-2 rounded-full transition-colors',
                isFav ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400',
              )}
              onClick={() => onToggleFavorite(article.id)}
            >
              <Star size={20} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button
              className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex divide-x divide-gray-100">
          {/* Linker paneel */}
          <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[65vh]">
            {/* Voorraad header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Voorraad</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalStock} <span className="text-sm font-normal text-gray-400">st.</span>
                </p>
              </div>
              <button
                className="px-4 py-2 bg-gray-200 text-gray-400 text-sm rounded-lg cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                Bestel
              </button>
            </div>

            {/* Locaties */}
            <div className="space-y-2">
              {locations.map((loc) => {
                const amt = getAmount(loc.id)
                const isTransfer = transferLocId === loc.id
                const isDelConfirm = deleteConfirmId === loc.id
                return (
                  <div key={loc.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {/* Locatie code + qty */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono font-semibold text-gray-800">{loc.locationCode}</p>
                        <p className="text-lg font-bold text-gray-900">{loc.quantity} <span className="text-xs font-normal text-gray-400">st.</span></p>
                      </div>

                      {/* Verwijder */}
                      {!isDelConfirm && (
                        <button
                          className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                          onClick={() => setDeleteConfirmId(loc.id)}
                          title="Locatie verwijderen"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      {isDelConfirm && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600">Verwijderen?</span>
                          <button
                            className="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                            onClick={() => deleteLocation.mutate(loc.id)}
                          >
                            Ja
                          </button>
                          <button
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Nee
                          </button>
                        </div>
                      )}

                      {/* Verplaats */}
                      {!isDelConfirm && (
                        <button
                          className={cn('p-1.5 rounded transition-colors', isTransfer ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500')}
                          onClick={() => setTransferLocId(isTransfer ? null : loc.id)}
                          title="Verplaatsen"
                        >
                          <ArrowRightLeft size={15} />
                        </button>
                      )}

                      {/* Aantal invoerveld + -/+ knoppen */}
                      {!isDelConfirm && (
                        <div className="flex items-center gap-1">
                          <button
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                            disabled={loc.quantity === 0 || amt > loc.quantity || mutateStock.isPending}
                            onClick={() => mutateStock.mutate({ locId: loc.id, delta: -amt })}
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            className="w-10 text-center text-sm border border-gray-200 rounded py-0.5"
                            value={amt}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(999, parseInt(e.target.value) || 1))
                              setMutateAmounts((prev) => ({ ...prev, [loc.id]: v }))
                            }}
                          />
                          <button
                            className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                            disabled={mutateStock.isPending}
                            onClick={() => mutateStock.mutate({ locId: loc.id, delta: amt })}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Transfer form */}
                    {isTransfer && (
                      <TransferForm
                        locId={loc.id}
                        articleId={article.id}
                        maxQty={loc.quantity}
                        onDone={() => setTransferLocId(null)}
                        onCancel={() => setTransferLocId(null)}
                      />
                    )}
                  </div>
                )
              })}

              {/* Locatie toevoegen */}
              {!addingLoc ? (
                <button
                  className="w-full border border-dashed border-gray-300 rounded-lg py-2.5 text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 transition-colors"
                  onClick={() => setAddingLoc(true)}
                >
                  + Locatie toevoegen
                </button>
              ) : (
                <div className="border border-teal-300 rounded-lg p-3 bg-teal-50 space-y-2">
                  <p className="text-xs font-semibold text-teal-700">Nieuwe locatie</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                      placeholder="bijv. 100-1113"
                      value={newLocCode}
                      autoFocus
                      onChange={(e) => setNewLocCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newLocCode.trim()) addLocation.mutate() }}
                    />
                    <button
                      className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50"
                      disabled={!newLocCode.trim() || addLocation.isPending}
                      onClick={() => addLocation.mutate()}
                    >
                      {addLocation.isPending ? '...' : 'Toevoegen'}
                    </button>
                    <button
                      className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
                      onClick={() => { setAddingLoc(false); setNewLocCode('') }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {addLocation.isError && (
                    <p className="text-xs text-red-600">{(addLocation.error as Error).message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Laatste mutaties */}
            {mutations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Laatste mutaties</p>
                <div className="space-y-1">
                  {mutations.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="text-gray-300 w-24 shrink-0">{formatMutDate(m.createdAt)}</span>
                      <span className="truncate">{m.employeeName ?? '—'}</span>
                      <span className="shrink-0 ml-auto font-semibold" style={{ color: m.quantityDelta < 0 ? '#dc2626' : '#16a34a' }}>
                        {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta} st.
                      </span>
                      <span className="text-gray-300 font-mono shrink-0">{m.locationCode}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rechter paneel — gerelateerd + samenstellingen */}
          {(related.length > 0 || assemblies.length > 0) && (
            <div className="w-60 shrink-0 p-4 space-y-4 overflow-y-auto max-h-[65vh]">
              {/* WP-gerelateerde artikelen (body / wisselplaat / schroef) */}
              {related.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gerelateerd ({related.length})</p>
                  {related.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <PhotoBox src={r.photoUrl} size={40} />
                      <div className="flex-1 min-w-0">
                        <TypeBadge type={r.articleType} />
                        <p className="text-xs font-medium text-gray-700 leading-tight truncate mt-0.5">{r.name}</p>
                      </div>
                      <StockBadge stock={Number(r.totalStock)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Samenstellingen */}
              {assemblies.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Samenstellingen ({assemblies.length})
                  </p>
                  {assemblies.map((a) => (
                    <div key={a.ncNumber} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-gray-700">{a.ncName}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        <span className="font-medium text-gray-500">
                          {a.partnerType === 'holder' ? 'Houder:' : 'Tool:'}
                        </span>{' '}
                        {a.partnerName}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Favorieten paneel ─────────────────────────────────────────────────────────

function FavoritesPanel({
  articles,
  favoriteIds,
  onOpenArticle,
}: {
  articles: ToolingArticle[]
  favoriteIds: string[]
  onOpenArticle: (id: string) => void
}) {
  const favArticles = articles.filter((a) => favoriteIds.includes(a.id))

  return (
    <div className="w-52 shrink-0 border-l border-gray-200 flex flex-col">
      <div className="px-4 pt-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Star size={14} className="text-amber-400" fill="currentColor" />
          Favorieten
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {favArticles.length === 0 ? (
          <p className="text-xs text-gray-400 p-4">
            Nog geen favorieten — klik ★ op een artikel
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {favArticles.map((a) => (
              <button
                key={a.id}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                onClick={() => onOpenArticle(a.id)}
              >
                <PhotoBox src={a.photoUrl} size={32} />
                <div className="flex-1 min-w-0">
                  <TypeBadge type={a.articleType} />
                  <p className="text-xs font-medium text-gray-700 leading-tight truncate mt-0.5">{a.name}</p>
                </div>
                <StockBadge stock={Number(a.totalStock)} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hoofd component ───────────────────────────────────────────────────────────

export function ToolingContent() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [openArticleId, setOpenArticleId] = useState<string | null>(null)

  const { data: articles = [] } = useQuery<ToolingArticle[]>({
    queryKey: ['tooling-articles', search, typeFilter],
    queryFn: () =>
      apiFetch(`/kiosk/tooling/articles?search=${encodeURIComponent(search)}&type=${typeFilter}`),
    staleTime: 30_000,
  })

  const { data: favData } = useQuery<{ favoriteIds: string[] }>({
    queryKey: ['tooling-favorites'],
    queryFn: () => apiFetch('/kiosk/tooling/favorites'),
  })
  const favoriteIds = favData?.favoriteIds ?? []

  const toggleFavorite = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/kiosk/tooling/favorites/${id}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tooling-favorites'] }),
  })

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Grid area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-200 space-y-3 bg-white">
          {/* Zoekbalk */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Zoek op naam, artikelnummer of fabrikant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type-filter */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  typeFilter === t
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {t === 'all' ? 'Alle' : TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Package size={40} className="mb-2 opacity-30" />
              <p className="text-sm">Geen artikelen gevonden</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))' }}>
              {articles.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  isFavorite={favoriteIds.includes(a.id)}
                  onToggleFavorite={() => toggleFavorite.mutate(a.id)}
                  onClick={() => setOpenArticleId(a.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Favorieten paneel */}
      <FavoritesPanel
        articles={articles}
        favoriteIds={favoriteIds}
        onOpenArticle={(id) => setOpenArticleId(id)}
      />

      {/* Detail modal */}
      {openArticleId && (
        <ArticleDetailModal
          articleId={openArticleId}
          favoriteIds={favoriteIds}
          onToggleFavorite={(id) => toggleFavorite.mutate(id)}
          onClose={() => setOpenArticleId(null)}
        />
      )}
    </div>
  )
}
