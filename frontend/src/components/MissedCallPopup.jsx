import { useEffect, useState } from 'react'
import { PhoneIcon, PhoneXMarkIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/solid'
import UserAvatar from './UserAvatar'

function useRelativeTime(timestamp) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!timestamp) return
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
      if (diff < 60) setLabel(`${diff} sec ago`)
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)} min ago`)
      else setLabel(`${Math.floor(diff / 3600)} hr ago`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timestamp])

  return label
}

export default function MissedCallPopup({ missedCall, onDismiss, onJoin }) {
  // Hooks must run unconditionally and before any early return.
  const timeAgo = useRelativeTime(missedCall?.timestamp ?? missedCall?.created_at ?? missedCall?.startedAt)

  if (!missedCall) return null

  const isVideo = missedCall.type === 'video'
  const isGroup = missedCall.conversation_type === 'group'
  const showJoinNow = isGroup && missedCall.isOngoing

  return (
    <div className="w-80 animate-cn-fade-up">
      <div className="bg-cn-white rounded-lg shadow-modal border border-cn-gray-200 overflow-hidden">
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ backgroundColor: 'var(--cn-danger)' }}
        >
          <div className="flex items-center gap-2">
            <PhoneXMarkIcon className="w-4 h-4 text-white" />
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              Missed {isVideo ? 'Video' : 'Voice'} Call
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/80 hover:text-white transition-fast"
            aria-label="Dismiss"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative flex-shrink-0">
            <UserAvatar user={missedCall.caller} size="md" />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--cn-danger)' }}
            >
              {isVideo
                ? <VideoCameraIcon className="w-2.5 h-2.5 text-white" />
                : <PhoneIcon className="w-2.5 h-2.5 text-white" />
              }
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cn-charcoal truncate">
              {missedCall.caller?.full_name ?? 'Unknown'}
            </p>
            <p className="text-xs text-cn-gray-500 mt-0.5">
              Missed call{timeAgo ? ` — ${timeAgo}` : ''}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-3">
          {showJoinNow && (
            <button
              onClick={onJoin}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold text-white transition-fast"
              style={{ backgroundColor: 'var(--cn-online)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#16a34a' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--cn-online)' }}
            >
              <PhoneIcon className="w-3.5 h-3.5" />
              Join Now
            </button>
          )}
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-md text-sm font-medium text-cn-gray-600 bg-cn-gray-100 hover:bg-cn-gray-200 transition-fast"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
