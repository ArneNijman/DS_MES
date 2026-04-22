import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import AdminSidebar from '@/components/AdminSidebar'
import { apiFetch } from '@/lib/api'

interface BcConfigData {
  tenantId: string
  clientId: string
  clientSecret: string
  baseUrl: string
  isActive: boolean
  lastTestedAt?: string
  lastTestResult?: unknown
}

interface TestResult {
  success: boolean
  steps: { token: boolean; api: boolean; data: boolean }
  error?: string
}

export default function AdminBcConfig() {
  const [form, setForm] = useState({ tenantId: '', clientId: '', clientSecret: '', baseUrl: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saved, setSaved] = useState(false)

  const { data } = useQuery<BcConfigData>({
    queryKey: ['bc-config'],
    queryFn: () => apiFetch('/admin/bc-config'),
  })

  useEffect(() => {
    if (data) {
      setForm({
        tenantId: data.tenantId ?? '',
        clientId: data.clientId ?? '',
        clientSecret: data.clientSecret === '***' ? '' : (data.clientSecret ?? ''),
        baseUrl: data.baseUrl ?? '',
      })
    }
  }, [data])

  const testM = useMutation({
    mutationFn: () => apiFetch<TestResult>('/admin/bc-config/test', {
      method: 'POST',
      body: JSON.stringify(form),
    }),
    onSuccess: (res) => setTestResult(res),
  })

  const saveM = useMutation({
    mutationFn: () => apiFetch('/admin/bc-config', {
      method: 'POST',
      body: JSON.stringify(form),
    }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000) },
  })

  const Step = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle size={16} className="text-teal-500" /> : <XCircle size={16} className="text-red-400" />}
      <span className={ok ? 'text-gray-700' : 'text-red-500'}>{label}</span>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-8 bg-gray-50 overflow-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">BC Configuratie</h1>
        <p className="text-sm text-gray-400 mb-8">Business Central OAuth2 koppeling</p>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 max-w-xl">
          <div className="space-y-4">
            {[
              { key: 'tenantId', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
              { key: 'clientId', label: 'Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
              { key: 'baseUrl', label: 'BC Base URL', placeholder: 'https://api.businesscentral.dynamics.com/v2.0/...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                />
              </div>
            ))}

            {/* Client Secret */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.clientSecret}
                  onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                  placeholder="App registration secret"
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Test resultaat */}
          {testResult && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-1.5">
              <Step ok={testResult.steps.token} label="Token ophalen (Azure AD)" />
              <Step ok={testResult.steps.api} label="API bereikbaar (Business Central)" />
              <Step ok={testResult.steps.data} label="Data aanwezig (bedrijven gevonden)" />
              {testResult.error && (
                <p className="text-xs text-red-500 mt-1">{testResult.error}</p>
              )}
            </div>
          )}

          {/* Knoppen */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => testM.mutate()}
              disabled={testM.isPending}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {testM.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Verbinding testen
            </button>
            <button
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm hover:bg-teal-600 disabled:opacity-60 transition-colors"
            >
              {saved ? <CheckCircle size={14} /> : null}
              {saved ? 'Opgeslagen' : 'Opslaan'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
