import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Star, X, Minus, Plus, Trash2, ArrowRightLeft, Package, Camera } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolingTab = 'artikelen' | 'demonteren'

interface ToolingArticle {
  id: string
  articleType: string
  name: string
  orderingCode: string | null
  manufacturer: string | null
  photoUrl: string | null
  libraryPhotoUrl?: string | null
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

interface AssemblySearchResult {
  id: string
  ncNumber: number
  ncName: string
  comment: string | null
}

interface DemonterenStockLocation {
  id: string
  locationCode: string
  quantity: number
}

interface DemonterenComponent {
  type: 'holder' | 'extension' | 'tool'
  position: number
  name: string
  manufacturer: string | null
  orderingCode: string | null
  photoUrl: string | null
  reach: number | null
  articleId: string | null
  articleType: string | null
  locations: DemonterenStockLocation[]
}

interface AssemblyDetail {
  assembly: {
    id: string
    ncNumber: number
    ncName: string
    comment: string | null
    toolLength: number | null
    presetDiameter: number | null
  }
  components: DemonterenComponent[]
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

const TABS: { key: ToolingTab; label: string }[] = [
  { key: 'artikelen',  label: 'Artikelen'  },
  { key: 'demonteren', label: 'Demonteren' },
]

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

function parseToolCode(name: string | null): string {
  if (!name) return ''
  const m = name.match(/^(.+)-([A-Z]?\d+\w*)$/)
  const toolCode   = m ? m[1] : name
  const holderCode = m ? m[2] : ''

  const MAT: Record<string, string> = { A: 'Aluminium', U: 'Universeel', H: 'HSS' }
  const LEN: Record<string, string> = { SN: 'Normale lengte', N: 'Normale lengte', SL: 'Lang', L: 'Lang', K: 'Kort' }

  let houder = ''
  if (holderCode) {
    const n = parseInt(holderCode)
    if (holderCode.startsWith('H'))      houder = 'HSK'
    else if (holderCode.startsWith('S')) houder = 'SK50'
    else if (n >= 101 && n <= 199)       houder = 'Freeskop'
    else if (n >= 201 && n <= 299)       houder = 'Opschroefhouder'
    else if (n >= 301 && n <= 399)       houder = 'Weldonhouder'
    else if (n >= 401 && n <= 499)       houder = 'Spantang'
    else if (n >= 501 && n <= 599)       houder = 'Boorhoofd'
    else if (n >= 601 && n <= 699)       houder = 'Morse conus'
    else if (n >= 701 && n <= 799)       houder = 'Tussenhouder'
    else if (n >= 801 && n <= 899)       houder = 'Diverse houder'
  }

  let parts: string[] = []

  const wpMatch   = toolCode.match(/^(\d+)-WP(\d+)(R(\d+)|H(\d+\w*))/i)
  const wpSimple  = toolCode.match(/^WP(\d+)R(\d+\.?\d*)/i)
  const vfMatch   = toolCode.match(/^(VF|BF)(\d{2,3})([AU]?)(\d?)S?(SN|SL|N|L)?/i)
  const torMatch  = toolCode.match(/^T(\d{3})R(\d{3})([AU]?)(\d?)S?(SN|SL|N|L)?/i)
  const tmMatch   = toolCode.match(/^TM(\d{3})X(\d+)([AU]?)(D|B)?/i)
  const cbMatch   = toolCode.match(/^CB(\d{3})H(\d+)(N|L)?/i)
  const bMatch    = toolCode.match(/^B(\d{3})([AU]?)(HSS|HM)?(K|L)?/i)
  const spabMatch = toolCode.match(/^SPAB(\d+)H(\d+)([AU]?)/i)

  if (spabMatch) {
    parts = ['Afbraamfrees', `${spabMatch[1]}x${spabMatch[2]}°`,
      spabMatch[3] ? MAT[spabMatch[3].toUpperCase()] ?? '' : ''].filter(Boolean)
  } else if (/^SP/i.test(toolCode)) {
    parts = ['Special']
  } else if (wpMatch) {
    const prefix = parseInt(wpMatch[1]), d = parseInt(wpMatch[2])
    const rVal = wpMatch[4] ? `R${parseInt(wpMatch[4]) / 10}` : ''
    const hVal = wpMatch[5] ?? ''
    const wpType = prefix === 101 ? 'Torusfrees (V platen)'
                 : prefix === 102 ? 'Torusfrees (Ronde platen)'
                 : prefix === 103 ? 'Hoekfrees'
                 : prefix === 105 ? 'Vlakfrees'
                 : 'Wisselplaatfrees'
    const wpDim  = prefix === 105 ? `Ø${d}x${hVal}` : `Ø${d}${rVal ? ' ' + rVal : hVal ? ' H' + hVal : ''}`
    parts = [wpType, wpDim].filter(Boolean)
  } else if (wpSimple) {
    parts = ['Wisselplaatfrees', `Ø${parseInt(wpSimple[1])} R${wpSimple[2]}`]
  } else if (vfMatch) {
    const typeName = vfMatch[1].toUpperCase() === 'VF' ? 'Vingerfrees' : 'Bolfrees'
    const d   = vfMatch[2].length === 3 ? parseInt(vfMatch[2]) / 10 : parseInt(vfMatch[2])
    const mat = vfMatch[3] ? MAT[vfMatch[3].toUpperCase()] ?? '' : ''
    const snij = vfMatch[4] ? `${vfMatch[4]} snijder` : ''
    const len  = vfMatch[5] ? LEN[vfMatch[5].toUpperCase()] ?? '' : ''
    parts = [typeName, `Ø${d}`, snij, mat, len].filter(Boolean)
  } else if (torMatch) {
    const d = parseInt(torMatch[1]) / 10, r = parseInt(torMatch[2]) / 10
    const mat  = torMatch[3] ? MAT[torMatch[3].toUpperCase()] ?? '' : ''
    const snij = torMatch[4] ? `${torMatch[4]} snijder` : ''
    const len  = torMatch[5] ? LEN[torMatch[5].toUpperCase()] ?? '' : ''
    parts = ['Torusfrees', `Ø${d} R${r}`, snij, mat, len].filter(Boolean)
  } else if (tmMatch) {
    const thread = parseInt(tmMatch[1]) / 10, pitch = parseInt(tmMatch[2]) / 100
    const mat   = tmMatch[3] ? MAT[tmMatch[3].toUpperCase()] ?? '' : ''
    const type2 = tmMatch[4]?.toUpperCase() === 'D' ? 'Doorlopend' : tmMatch[4]?.toUpperCase() === 'B' ? 'Blind' : ''
    parts = ['Tap', `M${thread} p${pitch}`, mat, type2].filter(Boolean)
  } else if (cbMatch) {
    const d = parseInt(cbMatch[1]) / 10
    const len = cbMatch[3] ? LEN[cbMatch[3].toUpperCase()] ?? '' : ''
    parts = ['Centerboor', `Ø${d}`, `${cbMatch[2]}° tophoek`, len].filter(Boolean)
  } else if (bMatch) {
    const d    = parseInt(bMatch[1])
    const mat  = bMatch[2] ? MAT[bMatch[2].toUpperCase()] ?? '' : ''
    const steel = bMatch[3]?.toUpperCase() ?? ''
    const len  = bMatch[4] ? LEN[bMatch[4].toUpperCase()] ?? '' : ''
    parts = ['Boor', `Ø${d}`, mat, steel, len].filter(Boolean)
  }

  const toolDesc = parts.join(', ')
  if (!toolDesc && !houder) return ''
  if (!houder) return toolDesc
  if (!toolDesc) return houder
  return `${toolDesc} — ${houder}`
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
          {parseToolCode(article.name) && (
            <p className="text-[11px] text-gray-500 leading-tight">{parseToolCode(article.name)}</p>
          )}
          {article.manufacturer && (
            <p className="text-[11px] text-gray-500 truncate">{article.manufacturer}</p>
          )}
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadPhoto = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiFetch(`/kiosk/tooling/articles/${articleId}/photo`, { method: 'POST', body: fd })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooling-article', articleId] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
    },
  })

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) uploadPhoto.mutate(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [articleId])

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
          <button
            className="relative shrink-0 rounded bg-gray-100 border border-gray-200 overflow-hidden group"
            style={{ width: 72, height: 72 }}
            onClick={() => fileInputRef.current?.click()}
            title="Foto uploaden (of Ctrl+V plakken)"
          >
            {(article.photoUrl || article.libraryPhotoUrl)
              ? <img src={article.photoUrl ?? article.libraryPhotoUrl!} alt="" style={{ width: 72, height: 72, objectFit: 'contain', display: 'block' }} />
              : <Package size={28} className="text-gray-300 absolute inset-0 m-auto" />
            }
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </div>
            {uploadPhoto.isPending && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <span className="text-xs text-gray-500">...</span>
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadPhoto.mutate(file)
              e.target.value = ''
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={article.articleType} />
              {article.manufacturer && (
                <span className="text-xs text-gray-400">{article.manufacturer}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5 leading-tight">{article.name}</h2>
            {parseToolCode(article.name) && (
              <p className="text-sm text-gray-500 mt-0.5">{parseToolCode(article.name)}</p>
            )}
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
                        {parseToolCode(r.name) && <p className="text-[11px] text-gray-400 truncate">{parseToolCode(r.name)}</p>}
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
                  {parseToolCode(a.name) && <p className="text-[11px] text-gray-400 truncate">{parseToolCode(a.name)}</p>}
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

// ── Demonteren: component rij ─────────────────────────────────────────────────

function ComponentRow({
  component,
  ncNumber,
  onMutated,
}: {
  component: DemonterenComponent
  ncNumber: number
  onMutated: () => void
}) {
  const qc = useQueryClient()
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const mutateStock = useMutation({
    mutationFn: ({ locId, delta }: { locId: string; delta: number }) =>
      apiFetch(`/kiosk/tooling/stock-locations/${locId}/mutate`, {
        method: 'POST',
        body: JSON.stringify({ delta }),
      }),
    onSuccess: () => {
      if (component.articleId) {
        qc.invalidateQueries({ queryKey: ['tooling-article', component.articleId] })
      }
      qc.invalidateQueries({ queryKey: ['tooling-assembly-detail', ncNumber] })
      qc.invalidateQueries({ queryKey: ['tooling-articles'] })
      onMutated()
    },
  })

  const getAmount = (locId: string) => amounts[locId] ?? 1

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      {/* Component header */}
      <div className="flex items-start gap-3">
        <PhotoBox src={component.photoUrl} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={component.type} />
            {component.manufacturer && (
              <span className="text-xs text-gray-400">{component.manufacturer}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800 leading-tight mt-0.5">{component.name}</p>
          {parseToolCode(component.name) && (
            <p className="text-xs text-gray-500 mt-0.5">{parseToolCode(component.name)}</p>
          )}
          {component.orderingCode && (
            <p className="text-xs font-mono text-gray-400 mt-0.5">{component.orderingCode}</p>
          )}
        </div>
      </div>

      {/* Voorraad sectie */}
      <div className="mt-3 space-y-2">
        {!component.articleId && (
          <p className="text-xs text-gray-400 italic">Niet in voorraad beheer</p>
        )}
        {component.articleId && component.locations.length === 0 && (
          <p className="text-xs text-gray-400 italic">Geen locaties gevonden</p>
        )}
        {component.locations.map((loc) => {
          const amt = getAmount(loc.id)
          return (
            <div key={loc.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs font-mono font-semibold text-gray-700 w-28 shrink-0 truncate">
                {loc.locationCode}
              </span>
              <span className={cn('text-sm font-bold min-w-[24px] text-center shrink-0', loc.quantity === 0 ? 'text-red-600' : 'text-gray-800')}>
                {loc.quantity}
              </span>
              <span className="text-xs text-gray-400 shrink-0">st.</span>

              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="w-10 text-center text-sm border border-gray-200 rounded py-0.5"
                  value={amt}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(999, parseInt(e.target.value) || 1))
                    setAmounts((prev) => ({ ...prev, [loc.id]: v }))
                  }}
                />
                <button
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[36px] transition-colors',
                    'bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  disabled={mutateStock.isPending}
                  onClick={() => mutateStock.mutate({ locId: loc.id, delta: amt })}
                >
                  <Plus size={13} />
                  Bij boeken
                </button>
              </div>
            </div>
          )
        })}
        {mutateStock.isError && (
          <p className="text-xs text-red-600">{(mutateStock.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}

// ── Demonteren: assembly detail view ──────────────────────────────────────────

function AssemblyDetailView({
  detail,
  onMutated,
}: {
  detail: AssemblyDetail
  onMutated: () => void
}) {
  const { assembly, components } = detail

  return (
    <div className="space-y-4">
      {/* Header kaart */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Samenstelling</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">{assembly.ncName}</h2>
            {assembly.comment && <p className="text-sm text-gray-500 mt-1">{assembly.comment}</p>}
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            {assembly.toolLength != null && (
              <p className="text-xs text-gray-400">
                Lengte: <span className="font-mono text-gray-600">{assembly.toolLength} mm</span>
              </p>
            )}
            {assembly.presetDiameter != null && (
              <p className="text-xs text-gray-400">
                Ø preset: <span className="font-mono text-gray-600">{assembly.presetDiameter} mm</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Componentenlijst */}
      {components.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Geen componenten gevonden voor deze samenstelling</p>
      ) : (
        <div className="space-y-3">
          {components.map((comp, idx) => (
            <ComponentRow
              key={`${comp.type}-${idx}`}
              component={comp}
              ncNumber={assembly.ncNumber}
              onMutated={onMutated}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Demonteren tab inhoud ─────────────────────────────────────────────────────

function DemonterenContent() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedAssembly, setSelectedAssembly] = useState<AssemblySearchResult | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<AssemblySearchResult[]>({
    queryKey: ['tooling-assemblies-search', debouncedSearch],
    queryFn: () => apiFetch(`/kiosk/tooling/assemblies?q=${encodeURIComponent(debouncedSearch)}`),
    staleTime: 30_000,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<AssemblyDetail>({
    queryKey: ['tooling-assembly-detail', selectedAssembly?.ncNumber],
    queryFn: () => apiFetch(`/kiosk/tooling/assemblies/${selectedAssembly!.ncNumber}`),
    enabled: !!selectedAssembly,
    staleTime: 30_000,
  })

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Linker paneel — zoekresultaten */}
      <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Zoek samenstelling…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => { setSearch(''); setDebouncedSearch(''); setSelectedAssembly(null) }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {searchLoading && (
            <p className="text-sm text-gray-400 p-4">Laden...</p>
          )}
          {!searchLoading && !debouncedSearch && (
            <p className="text-xs text-gray-400 p-4">Typ een naam om te zoeken</p>
          )}
          {!searchLoading && debouncedSearch && searchResults.length === 0 && (
            <p className="text-sm text-gray-400 p-4">Geen samenstellingen gevonden</p>
          )}
          {searchResults.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAssembly(a)}
              className={cn(
                'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                selectedAssembly?.id === a.id && 'bg-teal-50 border-l-2 border-teal-500',
              )}
            >
              <p className="text-sm font-semibold text-gray-800">{a.ncName}</p>
              {a.comment && (
                <p className="text-xs text-gray-400 truncate mt-0.5">{a.comment}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Rechter paneel — detail */}
      <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
        {!selectedAssembly && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package size={40} className="mb-2 opacity-30" />
            <p className="text-sm">Selecteer een samenstelling om te demonteren</p>
          </div>
        )}
        {selectedAssembly && detailLoading && (
          <p className="text-sm text-gray-400">Laden...</p>
        )}
        {selectedAssembly && detail && (
          <AssemblyDetailView
            detail={detail}
            onMutated={() => {/* invalidaties worden al in ComponentRow gedaan */}}
          />
        )}
      </div>
    </div>
  )
}

// ── Hoofd component ───────────────────────────────────────────────────────────

export function ToolingContent() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<ToolingTab>('artikelen')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [openArticleId, setOpenArticleId] = useState<string | null>(null)

  const { data: allArticles = [] } = useQuery<ToolingArticle[]>({
    queryKey: ['tooling-articles', typeFilter],
    queryFn: () =>
      apiFetch(`/kiosk/tooling/articles?type=${typeFilter}`),
    staleTime: 30_000,
  })

  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
  const articles = tokens.length === 0
    ? allArticles
    : allArticles.filter((a) => {
        const decoded = parseToolCode(a.name).toLowerCase()
        const raw     = [a.name, a.orderingCode ?? '', a.manufacturer ?? ''].join(' ').toLowerCase()
        return tokens.every((t) =>
          /^\d+(\.\d+)?$/.test(t)
            ? decoded.includes(`ø${t}`) || decoded.includes(` r${t}`) || decoded.includes(`,r${t}`)
            : raw.includes(t) || decoded.includes(t),
        )
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tabbalk */}
      <div className="flex border-b border-gray-200 px-5 shrink-0 bg-white">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Artikelen tab */}
      {tab === 'artikelen' && (
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
      )}

      {/* Demonteren tab */}
      {tab === 'demonteren' && <DemonterenContent />}
    </div>
  )
}
