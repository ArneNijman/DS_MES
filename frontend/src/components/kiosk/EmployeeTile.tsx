import { useState } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  name: string
  photoUrl?: string | null
  isClockedIn: boolean
  hasPin: boolean
  clockedInHours?: number | null
  onTap: (id: string) => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

export default function EmployeeTile({ id, name, photoUrl, isClockedIn, hasPin, clockedInHours, onTap }: Props) {
  const [photoError, setPhotoError] = useState(false)

  const showPhoto = photoUrl && !photoError

  return (
    <button
      onClick={() => onTap(id)}
      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
    >
      <div className="relative">
        {/* Avatar */}
        <div
          className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold overflow-hidden border-[3px]',
            isClockedIn ? 'border-teal-400' : 'border-gray-200',
          )}
        >
          {showPhoto ? (
            <img
              src={photoUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={() => setPhotoError(true)}
            />
          ) : (
            <span className="text-gray-600 bg-gray-100 w-full h-full flex items-center justify-center">
              {getInitials(name)}
            </span>
          )}
        </div>

        {/* Ingeklokt badge */}
        {isClockedIn && clockedInHours != null && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
            {clockedInHours}u
          </span>
        )}

        {/* PIN slotje */}
        {hasPin && (
          <span className="absolute -bottom-1 -right-1 bg-gray-700 text-white rounded-full p-0.5">
            <Lock size={10} />
          </span>
        )}
      </div>

      {/* Naam */}
      <span className="text-xs text-center text-gray-700 leading-tight max-w-[72px] break-words">
        {name}
      </span>
    </button>
  )
}
