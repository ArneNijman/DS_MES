import { useState, useEffect } from 'react'
import { Delete } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { setToken } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface Props {
  employeeId: string
  employeeName: string
  onSuccess: () => void
  onClose: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function PinDialog({ employeeId, employeeName, onSuccess, onClose }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (pin.length === 4) {
      const timer = setTimeout(() => verifyPin(pin), 150)
      return () => clearTimeout(timer)
    }
  }, [pin])

  const handleKey = (key: string) => {
    if (loading) return
    setError('')
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
    } else if (key !== '' && pin.length < 4) {
      setPin((p) => p + key)
    }
  }

  const verifyPin = async (value: string) => {
    setLoading(true)
    try {
      const res = await apiFetch<{ token: string }>(
        `/kiosk/employees/${employeeId}/verify-pin`,
        {
          method: 'POST',
          body: JSON.stringify({ pin: value }),
          skipAuth: true,
        },
      )
      setToken(res.token, 'employee')
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fout'
      if (msg.includes('niet ingesteld')) {
        setError('PIN niet ingesteld — vraag de beheerder')
      } else {
        setError('Onjuiste PIN — probeer opnieuw')
      }
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center font-semibold text-gray-800 mb-1">{employeeName}</h2>
        <p className="text-center text-sm text-gray-400 mb-5">Voer je PIN in</p>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-colors',
                pin.length > i ? 'bg-teal-500 border-teal-500' : 'border-gray-300',
              )}
            />
          ))}
        </div>

        {/* Foutmelding */}
        {error && (
          <p className="text-center text-red-500 text-xs mb-3">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key, i) => (
            <button
              key={i}
              onClick={() => handleKey(key)}
              disabled={key === '' || loading}
              className={cn(
                'h-12 rounded-xl text-lg font-medium transition-colors',
                key === ''
                  ? 'invisible'
                  : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800',
                loading && 'opacity-50',
              )}
            >
              {key === '⌫' ? <Delete size={18} className="mx-auto" /> : key}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}
