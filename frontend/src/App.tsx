import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminRoute from '@/components/AdminRoute'

const AdminLogin = lazy(() => import('@/routes/admin/login'))
const AdminHome = lazy(() => import('@/routes/admin/home'))
const AdminEmployees = lazy(() => import('@/routes/admin/employees'))
const AdminBcConfig = lazy(() => import('@/routes/admin/bc-config'))
const AdminBcFieldMap = lazy(() => import('@/routes/admin/bc-field-map'))
const AdminMachines = lazy(() => import('@/routes/admin/machines'))
const AdminMachineDashboard = lazy(() => import('@/routes/admin/machine-dashboard'))
const AdminSmtpSettings = lazy(() => import('@/routes/admin/smtp-settings'))
const AdminSystem = lazy(() => import('@/routes/admin/system'))
const KioskIndex = lazy(() => import('@/routes/kiosk/index'))
const KioskDashboard = lazy(() => import('@/routes/kiosk/dashboard'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function Loading() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <span className="text-gray-400 text-sm">Laden...</span>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Kiosk */}
            <Route path="/kiosk" element={<KioskIndex />} />
            <Route path="/kiosk/dashboard" element={<KioskDashboard />} />

            {/* Admin */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/home" element={<AdminRoute><AdminHome /></AdminRoute>} />
            <Route path="/admin/employees" element={<AdminRoute><AdminEmployees /></AdminRoute>} />
            <Route path="/admin/bc-config" element={<AdminRoute><AdminBcConfig /></AdminRoute>} />
            <Route path="/admin/bc-field-map" element={<AdminRoute><AdminBcFieldMap /></AdminRoute>} />
            <Route path="/admin/machines" element={<AdminRoute><AdminMachines /></AdminRoute>} />
            <Route path="/admin/machine-dashboard" element={<AdminRoute><AdminMachineDashboard /></AdminRoute>} />
            <Route path="/admin/smtp-settings" element={<AdminRoute><AdminSmtpSettings /></AdminRoute>} />
            <Route path="/admin/system" element={<AdminRoute><AdminSystem /></AdminRoute>} />

            {/* Standaard → kiosk */}
            <Route path="*" element={<Navigate to="/kiosk" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
