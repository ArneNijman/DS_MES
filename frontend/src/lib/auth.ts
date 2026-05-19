import { useState, useEffect } from 'react'

export const ADMIN_TOKEN_KEY = 'mes_admin_token'
export const EMPLOYEE_TOKEN_KEY = 'employee_token'

function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return !(payload.exp && Date.now() / 1000 > payload.exp)
  } catch {
    return false
  }
}

export function getToken(): string | null {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (isTokenValid(adminToken)) return adminToken
  const employeeToken = localStorage.getItem(EMPLOYEE_TOKEN_KEY)
  if (isTokenValid(employeeToken)) return employeeToken
  return null
}

export function setToken(token: string, type: 'admin' | 'employee'): void {
  const key = type === 'admin' ? ADMIN_TOKEN_KEY : EMPLOYEE_TOKEN_KEY
  localStorage.setItem(key, token)
}

export function removeToken(type?: 'admin' | 'employee'): void {
  if (!type || type === 'admin') localStorage.removeItem(ADMIN_TOKEN_KEY)
  if (!type || type === 'employee') localStorage.removeItem(EMPLOYEE_TOKEN_KEY)
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getAdminToken()
    if (!token) {
      setIsAuthenticated(false)
      setIsLoading(false)
      return
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const expired = payload.exp && Date.now() / 1000 > payload.exp
      setIsAuthenticated(!expired)
    } catch {
      setIsAuthenticated(false)
    }
    setIsLoading(false)
  }, [])

  return { isAuthenticated, isLoading }
}
