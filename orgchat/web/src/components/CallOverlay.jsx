import { PhoneIcon, PhoneXMarkIcon, VideoCameraIcon } from '@heroicons/react/24/solid'
import UserAvatar from './UserAvatar'

export default function CallOverlay({ incomingCall, onAnswer, onReject }) {
  if (!incomingCall) return null

  const isVideo = incomingCall.type === 'video'
  const ringColor = isVideo ? 'var(--cn-red)' : 'var(--cn-blue)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-cn-white rounded-lg shadow-modal flex flex-col items-center gap-6 w-80 p-10 animate-cn-fade-up"
      >
        {/* Call type badge */}
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isVideo
              ? 'bg-cn-red-light text-cn-red'
              : 'bg-cn-blue-light text-cn-blue'
          }`}
        >
          {isVideo ? '📹 Video Call' : '🎙 Audio Call'}
        </span>

        {/* Pulsing avatar rings */}
        <div className="relative flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="cn-pulse-ring"
              style={{
                border: `2px solid ${ringColor}`,
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}
          <UserAvatar user={incomingCall.caller} size="xl" />
        </div>

        {/* Caller info */}
        <div className="text-center">
          <p className="text-lg font-bold text-cn-charcoal">
            {incomingCall.caller?.full_name}
          </p>
          <p className="text-cn-gray-600 text-sm mt-0.5">
            Incoming {isVideo ? 'video' : 'voice'} call
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-10">
          <button
            onClick={() => onReject(incomingCall.call_id)}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="w-16 h-16 rounded-full flex items-center justify-center transition-fast"
              style={{ backgroundColor: 'var(--cn-danger)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--cn-red-dark)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--cn-danger)' }}
            >
              <PhoneXMarkIcon className="w-7 h-7 text-white" />
            </span>
            <span className="text-xs text-cn-gray-600 font-medium">Decline</span>
          </button>

          <button
            onClick={() => onAnswer(incomingCall)}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="w-16 h-16 rounded-full flex items-center justify-center transition-fast"
              style={{ backgroundColor: 'var(--cn-online)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#16a34a' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--cn-online)' }}
            >
              <PhoneIcon className="w-7 h-7 text-white" />
            </span>
            <span className="text-xs text-cn-gray-600 font-medium">Accept</span>
          </button>
        </div>
      </div>
    </div>
  )
}
