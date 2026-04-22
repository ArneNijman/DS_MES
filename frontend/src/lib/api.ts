import { getToken, EMPLOYEE_TOKEN_KEY, ADMIN_TOKEN_KEY } from './auth'

interface FetchOptions extends RequestInit {
  skipAuth?: boolean
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options

  const headers = new Headers(fetchOptions.headers)

  if (!skipAuth) {
    // Kiosk-routes: employee-token heeft prioriteit boven admin-token
    // zodat ingelogde admins de kiosk niet verstoren met hun eigen sessie
    const token = path.startsWith('/kiosk/')
      ? (localStorage.getItem(EMPLOYEE_TOKEN_KEY) ?? localStorage.getItem(ADMIN_TOKEN_KEY) ?? null)
      : getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  if (fetchOptions.body != null && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/api${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      message = data.error ?? data.message ?? message
    } catch {
      // gebruik standaard bericht
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
