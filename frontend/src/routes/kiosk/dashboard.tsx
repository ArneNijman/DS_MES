import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Wrench, ClipboardX, CheckSquare, ShieldCheck, MessageSquare, ChevronDown, ListTodo, Gauge, Cpu, Package, Layers, Ruler } from 'lucide-react'
import { EMPLOYEE_TOKEN_KEY, removeToken } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { MachinesContent } from '@/routes/admin/machines'
import { NCRContent } from '@/routes/kiosk/ncr'
import { MijnTakenContent, useMyTaskCount, type MyTaskNcr } from '@/routes/kiosk/mijn-meldingen'
import { MijnTakenTodoContent, useTaskCounts } from '@/routes/kiosk/mijn-taken-todo'
import { PreventiefContent } from '@/routes/kiosk/preventief'
import { KlantmeldingContent } from '@/routes/kiosk/klantmelding'
import { MeetmiddelenContent, useMeetmiddelenCounts } from '@/routes/kiosk/meetmiddelen'
import { CncMachiningContent } from '@/routes/admin/cnc-machining'
import { ToolingContent } from '@/routes/kiosk/tooling'
import { ProductSetupContent } from '@/routes/kiosk/product-setup'
import { MeetSetupContent } from '@/routes/kiosk/meet-setup'
import { cn } from '@/lib/utils'

interface UserInfo {
  name: string
  role: string
}

type NavKey = 'machines' | 'ncr' | 'preventief' | 'klantmelding' | 'mijn_taken' | 'mijn_todo' | 'meetmiddelen' | 'cnc_machining' | 'tooling' | 'product_setup' | 'meet_setup'

const ROLE_LABEL: Record<string, string> = {
  admin:               'Beheerder',
  manager:             'Manager',
  teamleider:          'Teamleider',
  quality:             'Kwaliteit',
  productie_engineer:  'Productie engineer',
  projectmanager:      'Project manager',
  operator_lassen:     'Operator lassen',
  operator_frezen:     'Operator frezen',
  operator_assemblage: 'Operator assemblage',
  cam:                 'CAM',
}

// ── Favicon badge via canvas ──────────────────────────────────────────────

function setFaviconBadge(count: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#0d9488'
  ctx.fillRect(0, 0, 32, 32)
  ctx.fillStyle = 'white'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('FA', 16, 17)

  if (count > 0) {
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(26, 6, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.font = 'bold 9px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 9 ? '9+' : String(count), 26, 7)
  }

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    document.head.appendChild(link)
  }
  link.rel = 'icon'
  link.href = canvas.toDataURL()
}

async function requestAndNotify(newCount: number) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
  if (Notification.permission !== 'granted') return
  new Notification('Factory Assistant', {
    body: `Je hebt ${newCount} nieuwe melding${newCount > 1 ? 'en' : ''} ontvangen`,
    icon: '/favicon.ico',
  })
}

// ── Nav button helper ─────────────────────────────────────────────────────

function NavBtn({
  active,
  indent,
  onClick,
  children,
}: {
  active: boolean
  indent?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 py-2 rounded-md text-sm transition-colors',
        indent ? 'px-4' : 'px-3',
        active
          ? 'bg-teal-600 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export default function KioskDashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [active, setActive] = useState<NavKey>('machines')
  const [pendingNcr, setPendingNcr] = useState<MyTaskNcr | null>(null)
  const [pendingPreventief, setPendingPreventief] = useState<Record<string, unknown> | null>(null)
  const [pendingToolId, setPendingToolId] = useState<string | null>(null)
  const KWAL_KEYS: NavKey[] = ['ncr', 'preventief', 'klantmelding']
  const [kwalOpen, setKwalOpen] = useState(false)
  const kwalCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const myTaskCount = useMyTaskCount()
  const { rood, geel } = useTaskCounts()
  const { verlopen, binnenkort } = useMeetmiddelenCounts()
  const prevCountRef = useRef<number | null>(null)

  const { data: allowedModules } = useQuery<string[]>({
    queryKey: ['role-permissions', user?.role],
    queryFn: () => apiFetch<string[]>(`/kiosk/role-permissions/${user!.role}`),
    enabled: !!user && user.role !== 'admin',
    staleTime: 5 * 60 * 1000,
  })

  const canSee = (key: string) =>
    !user || user.role === 'admin' || (allowedModules?.includes(key) ?? false)

  useEffect(() => {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY)
    if (!token) { navigate('/kiosk'); return }
    try {
      const p = JSON.parse(atob(token.split('.')[1]))
      if (p.exp && Date.now() / 1000 > p.exp) { navigate('/kiosk'); return }
      setUser({ name: p.name, role: p.role })
    } catch {
      navigate('/kiosk')
    }
  }, [navigate])

  useEffect(() => {
    document.title = myTaskCount > 0
      ? `(${myTaskCount}) Factory Assistant — MES`
      : 'Factory Assistant — MES'

    setFaviconBadge(myTaskCount)

    if (prevCountRef.current !== null && myTaskCount > prevCountRef.current) {
      requestAndNotify(myTaskCount - prevCountRef.current)
    }
    prevCountRef.current = myTaskCount
  }, [myTaskCount])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const handleOpenNcr = (ncr: MyTaskNcr) => {
    setPendingNcr(ncr)
    setActive('ncr')
  }

  const handleStartPreventief = (data: { ncrId: string; productionOrder: string | null; itemRef: string | null; itemName: string | null }) => {
    setPendingPreventief({ ncrId: data.ncrId, productionOrder: data.productionOrder, itemRef: data.itemRef, itemName: data.itemName, status: 'open' })
    setActive('preventief')
  }

  const handleGoToNcr = (ncrDisplayId: string) => {
    setPendingNcr({ ncrId: ncrDisplayId } as MyTaskNcr)
    setActive('ncr')
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Kiosk sidebar */}
      <aside className="flex flex-col w-52 shrink-0 bg-gray-900 text-white">
        {/* Header: logo + naam */}
        <div className="px-3 pt-4 pb-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.png" alt="Dutch Shape" className="h-6 w-auto shrink-0" />
            <span className="text-sm font-semibold leading-tight truncate text-white">Factory Assistant</span>
          </div>
        </div>

        {/* Navigatie */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {canSee('mijn_todo') && (
            <NavBtn active={active === 'mijn_todo'} onClick={() => setActive('mijn_todo')}>
              <ListTodo size={15} />
              <span className="flex-1 text-left">Mijn taken</span>
              {rood > 0 && <span className="text-xs bg-red-500 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">{rood > 9 ? '9+' : rood}</span>}
              {geel > 0 && <span className="text-xs bg-yellow-400 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">{geel > 9 ? '9+' : geel}</span>}
            </NavBtn>
          )}

          {canSee('mijn_taken') && (
            <NavBtn active={active === 'mijn_taken'} onClick={() => setActive('mijn_taken')}>
              <CheckSquare size={15} />
              <span className="flex-1 text-left">Mijn meldingen</span>
              {myTaskCount > 0 && <span className="text-xs bg-red-500 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">{myTaskCount > 9 ? '9+' : myTaskCount}</span>}
            </NavBtn>
          )}

          {/* Kwaliteit melding — opent bij hover/klik, sluit na 500ms als muis weg is */}
          {(canSee('ncr') || canSee('preventief') || canSee('klantmelding')) && (
            <div
              onMouseEnter={() => { if (kwalCloseTimer.current) clearTimeout(kwalCloseTimer.current); setKwalOpen(true) }}
              onMouseLeave={() => { kwalCloseTimer.current = setTimeout(() => setKwalOpen(false), 500) }}
            >
              <button
                onClick={() => setKwalOpen((o) => !o)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  KWAL_KEYS.includes(active) ? 'text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                )}
              >
                <span className="flex-1 text-left">Kwaliteit melding</span>
                <ChevronDown size={14} className={cn('transition-transform duration-200', kwalOpen && 'rotate-180')} />
              </button>
              {kwalOpen && (
                <div className="space-y-0.5 pl-1">
                  {canSee('ncr') && (
                    <NavBtn active={active === 'ncr'} indent onClick={() => setActive('ncr')}>
                      <ClipboardX size={14} /><span className="flex-1 text-left">NCR registratie</span>
                    </NavBtn>
                  )}
                  {canSee('preventief') && (
                    <NavBtn active={active === 'preventief'} indent onClick={() => setActive('preventief')}>
                      <ShieldCheck size={14} /><span className="flex-1 text-left">Preventieve maatregelen</span>
                    </NavBtn>
                  )}
                  {canSee('klantmelding') && (
                    <NavBtn active={active === 'klantmelding'} indent onClick={() => setActive('klantmelding')}>
                      <MessageSquare size={14} /><span className="flex-1 text-left">Klantmeldingen</span>
                    </NavBtn>
                  )}
                </div>
              )}
            </div>
          )}

          {canSee('machines') && (
            <NavBtn active={active === 'machines'} onClick={() => setActive('machines')}>
              <Wrench size={15} /><span className="flex-1 text-left">Machines</span>
            </NavBtn>
          )}

          {canSee('meetmiddelen') && (
            <NavBtn active={active === 'meetmiddelen'} onClick={() => setActive('meetmiddelen')}>
              <Gauge size={15} />
              <span className="flex-1 text-left">Meetmiddelen</span>
              {verlopen > 0 && <span className="text-xs bg-red-500 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">{verlopen > 9 ? '9+' : verlopen}</span>}
              {binnenkort > 0 && <span className="text-xs bg-orange-400 text-white font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">{binnenkort > 9 ? '9+' : binnenkort}</span>}
            </NavBtn>
          )}

          {canSee('cnc_machining') && (
            <NavBtn active={active === 'cnc_machining'} onClick={() => setActive('cnc_machining')}>
              <Cpu size={15} /><span className="flex-1 text-left">CNC Machining</span>
            </NavBtn>
          )}

          {canSee('tooling') && (
            <NavBtn active={active === 'tooling'} onClick={() => setActive('tooling')}>
              <Package size={15} /><span className="flex-1 text-left">Tooling beheer</span>
            </NavBtn>
          )}

          {canSee('product_setup') && (
            <NavBtn active={active === 'product_setup'} onClick={() => setActive('product_setup')}>
              <Layers size={15} /><span className="flex-1 text-left">Product Setup</span>
            </NavBtn>
          )}

          {canSee('meet_setup') && (
            <NavBtn active={active === 'meet_setup'} onClick={() => setActive('meet_setup')}>
              <Ruler size={15} /><span className="flex-1 text-left">Meet Setup</span>
            </NavBtn>
          )}
        </nav>

        {/* Gebruikersinfo + uitloggen onderaan */}
        <div className="px-3 py-3 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center font-bold text-xs shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-tight truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <button
              onClick={() => { removeToken('employee'); navigate('/kiosk') }}
              title="Uitloggen"
              className="shrink-0 p-1.5 rounded text-gray-500 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {active === 'machines'     && <MachinesContent />}
        {active === 'ncr'          && <NCRContent initialNcr={pendingNcr} onPendingConsumed={() => setPendingNcr(null)} onStartPreventief={handleStartPreventief} />}
        {active === 'preventief'   && <PreventiefContent initialAction={pendingPreventief} onPendingConsumed={() => setPendingPreventief(null)} onGoToNcr={handleGoToNcr} />}
        {active === 'klantmelding'  && <KlantmeldingContent />}
        {active === 'meetmiddelen'  && <MeetmiddelenContent openToolId={pendingToolId ?? undefined} onPendingConsumed={() => setPendingToolId(null)} />}
        {active === 'mijn_taken'   && <MijnTakenContent onOpenNcr={handleOpenNcr} onNavigateToTool={(id) => { setPendingToolId(id); setActive('meetmiddelen') }} />}
        {active === 'mijn_todo'      && <MijnTakenTodoContent />}
        {active === 'cnc_machining'  && <CncMachiningContent />}
        {active === 'tooling'        && <ToolingContent />}
        {active === 'product_setup'  && <ProductSetupContent />}
        {active === 'meet_setup'     && <MeetSetupContent />}
      </div>
    </div>
  )
}
