import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { setToken } from '@/lib/auth'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch<{ token: string }>('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipAuth: true,
      })
      setToken(res.token, 'admin')
      navigate('/admin/home')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggen mislukt')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <img src="/dutch-shape-bg.jpg" alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', objectPosition: 'bottom' }} />
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Factory Assistant</h1>
        <p className="text-sm text-gray-400 mb-6">Beheerder aanmelden</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gebruikersnaam
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wachtwoord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-medium py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
