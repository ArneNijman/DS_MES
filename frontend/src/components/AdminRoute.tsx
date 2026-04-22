import { Navigate } from 'react-router-dom'
import { useAdminAuth, EMPLOYEE_TOKEN_KEY } from '@/lib/auth'

function hasEmployeeAdminToken(): boolean {
  try {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY)
    if (!token) return false
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && Date.now() / 1000 > payload.exp) return false
    return payload.role === 'admin'
  } catch {
    return false
  }
}

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAdminAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <span className="text-muted-foreground text-sm">Sessie controleren...</span>
      </div>
    )
  }

  if (!isAuthenticated && !hasEmployeeAdminToken()) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
