const SIZES = {
  xs:  { cls: 'w-6 h-6',   text: 'text-xs',  dot: 'w-1.5 h-1.5' },
  sm:  { cls: 'w-8 h-8',   text: 'text-xs',  dot: 'w-2 h-2'     },
  md:  { cls: 'w-10 h-10', text: 'text-sm',  dot: 'w-2.5 h-2.5' },
  lg:  { cls: 'w-14 h-14', text: 'text-base',dot: 'w-3 h-3'     },
  xl:  { cls: 'w-16 h-16', text: 'text-lg',  dot: 'w-3.5 h-3.5' },
  xxl: { cls: 'w-20 h-20', text: 'text-xl',  dot: 'w-4 h-4'     },
}

function getInitials(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'U'
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function UserAvatar({ user, size = 'md', online = false, status = 'online' }) {
  const { cls, text, dot } = SIZES[size] ?? SIZES.md
  const initials = getInitials(user?.display_name || user?.full_name || user?.name)

  const statusColors = {
    online: '#22C55E', // Green
    away: '#F59E0B',   // Amber
    busy: '#EF4444',   // Red
    offline: '#94A3B8'  // Gray
  }

  const activeStatus = online ? (status || 'online') : 'offline'

  return (
    <div className="relative flex-shrink-0">
      {user?.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.full_name || user.name || 'User'}
          className={`${cls} rounded-full object-cover border-2 border-cn-gray-200 transition-all`}
        />
      ) : (
        <div
          className={`${cls} rounded-full flex items-center justify-center font-bold ${text} text-white transition-all`}
          style={{
            background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
          }}
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          className={`${dot} absolute bottom-0 right-0 rounded-full border-2 transition-all duration-300`}
          style={{
            backgroundColor: statusColors[activeStatus] || statusColors.online,
            borderColor: 'var(--cn-white)',
            boxShadow: activeStatus === 'online' ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
          }}
          title={activeStatus.toUpperCase()}
        />
      )}
    </div>
  )
}
