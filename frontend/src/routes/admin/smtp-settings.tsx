import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Save, Send, Check, X } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'
import { apiFetch } from '@/lib/api'

interface SmtpConfig {
  host: string
  port: string
  user: string
  password: string
  fromEmail: string
  fromName: string
  reminderInterval: string
}

const INTERVAL_OPTIES = [
  { value: 'dagelijks',    label: 'Dagelijks (elke werkdag)' },
  { value: 'wekelijks',   label: 'Wekelijks (maandag)' },
  { value: 'maandelijks', label: 'Maandelijks (1e van de maand)' },
]

export default function SmtpSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<SmtpConfig>({
    queryKey: ['smtp-settings'],
    queryFn: () => apiFetch('/admin/smtp') as Promise<SmtpConfig>,
  })

  const [form, setForm] = useState<SmtpConfig>({
    host: 'dutchshape-nl01c.mail.protection.outlook.com',
    port: '25',
    user: '',
    password: '',
    fromEmail: 'mes@dutch-shape.nl',
    fromName: 'Dutch Shape MES',
    reminderInterval: 'dagelijks',
  })
  const [initialized, setInitialized] = useState(false)

  if (data && !initialized) {
    setForm({ ...data, password: '' })
    setInitialized(true)
  }

  const [testEmail, setTestEmail] = useState('')
  const [testModal, setTestModal] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)

  const save = useMutation({
    mutationFn: (body: SmtpConfig) => apiFetch('/admin/smtp', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smtp-settings'] }),
  })

  const handleTest = async () => {
    setTestResult(null)
    try {
      await apiFetch('/admin/smtp/test', { method: 'POST', body: JSON.stringify({ to: testEmail }) })
      setTestResult('ok')
    } catch {
      setTestResult('error')
    }
  }

  const field = (label: string, key: keyof SmtpConfig, type = 'text', hint?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
        value={form[key]}
        placeholder={hint}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  if (isLoading) return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50 flex items-center justify-center">
        <span className="text-gray-400 text-sm">Laden…</span>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
            <Mail size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Email instellingen</h1>
            <p className="text-xs text-gray-400">SMTP-configuratie voor notificaties en herinneringen</p>
          </div>
        </div>

        <div className="max-w-xl space-y-5 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">Afzender</h2>
          {field('Naam afzender', 'fromName', 'text', 'Dutch Shape MES')}
          {field('Email afzender', 'fromEmail', 'email', 'mes@dutch-shape.nl')}

          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 pt-2">SMTP server</h2>
          {field('Server (host)', 'host', 'text', 'dutchshape-nl01c.mail.protection.outlook.com')}
          {field('Poort', 'port', 'text', '25')}
          {field('Gebruikersnaam (optioneel)', 'user')}
          {field('Wachtwoord (optioneel)', 'password', 'password')}

          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 pt-2">Herinnering</h2>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Interval</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              value={form.reminderInterval}
              onChange={e => setForm(f => ({ ...f, reminderInterval: e.target.value }))}
            >
              {INTERVAL_OPTIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-gray-400">Herinnerings-emails worden om 07:30 verstuurd</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => save.mutate(form)}
              disabled={save.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              <Save size={14} />
              {save.isPending ? 'Opslaan…' : 'Opslaan'}
            </button>
            <button
              onClick={() => { setTestModal(true); setTestResult(null) }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              <Send size={14} />
              Test email versturen
            </button>
          </div>

          {save.isSuccess && (
            <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Instellingen opgeslagen</p>
          )}
        </div>
      </main>

      {/* Test email modal */}
      {testModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Test email versturen</h3>
              <button onClick={() => setTestModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Ontvanger</label>
                <input
                  type="email"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="email@dutch-shape.nl"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
              </div>
              <button
                onClick={handleTest}
                disabled={!testEmail}
                className="w-full py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-40"
              >
                Versturen
              </button>
              {testResult === 'ok' && <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Email verstuurd</p>}
              {testResult === 'error' && <p className="text-xs text-red-600">Verzending mislukt — controleer de SMTP-instellingen</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
