import { useState, useEffect } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import Loader from '../components/Loader'
import {
  PhoneIcon,
  VideoCameraIcon,
  ArrowPathIcon,
  PhoneXMarkIcon,
  PhoneArrowUpRightIcon,
  PhoneArrowDownLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import duration from 'dayjs/plugin/duration'
import { getCallHistory } from '../api/calls'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import UserAvatar from '../components/UserAvatar'
import Logo from '../components/Logo'

dayjs.extend(relativeTime)
dayjs.extend(duration)

const STATUS_CONFIG = {
  ended:     { label: 'Ended',    color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  glow: 'rgba(34,197,94,0.25)',  icon: '✓' },
  ongoing:   { label: 'In a call',color: '#3399CC', bg: 'rgba(51,153,204,0.12)', glow: 'rgba(51,153,204,0.30)', icon: null },
  initiated: { label: 'Ringing',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', glow: 'rgba(245,158,11,0.25)', icon: null },
  missed:    { label: 'Missed',   color: '#CC3333', bg: 'rgba(204,51,51,0.12)',  glow: 'rgba(204,51,51,0.25)',  icon: '✕' },
  rejected:  { label: 'Rejected', color: '#F97316', bg: 'rgba(249,115,22,0.12)', glow: 'rgba(249,115,22,0.25)', icon: '✕' },
}

function CallStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ended
  const isOngoing = status === 'ongoing'
  const isRinging = status === 'initiated'
  const isMissed = status === 'missed' || status === 'rejected'
  const isEnded = status === 'ended'

  return (
    <span
      className={`cn-status-badge inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold relative overflow-hidden ${
        isRinging ? 'cn-status-badge--ringing' : ''
      } ${isMissed ? 'cn-status-badge--missed' : ''}`}
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.glow}`,
        boxShadow: isOngoing || isRinging ? `0 0 12px ${cfg.glow}` : 'none',
      }}
    >
      {/* Animated dot indicator */}
      <span className="relative flex items-center justify-center w-4 h-4 flex-shrink-0">
        {/* Base dot */}
        <span
          className={`w-2 h-2 rounded-full relative z-10 ${isEnded ? 'cn-status-dot--pop' : ''}`}
          style={{ background: cfg.color }}
        />
        {/* Pulse ring for ongoing */}
        {isOngoing && (
          <>
            <span
              className="absolute inset-0 rounded-full cn-status-pulse"
              style={{ border: `1.5px solid ${cfg.color}` }}
            />
            <span
              className="absolute inset-0 rounded-full cn-status-pulse"
              style={{ border: `1.5px solid ${cfg.color}`, animationDelay: '0.8s' }}
            />
          </>
        )}
        {/* Vibrate ring for ringing */}
        {isRinging && (
          <span
            className="absolute inset-0.5 rounded-full cn-status-ring"
            style={{ border: `1.5px solid ${cfg.color}` }}
          />
        )}
      </span>
      {cfg.label}
    </span>
  )
}


function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const d = dayjs.duration(seconds, 'seconds')
  const h = Math.floor(d.asHours())
  const m = d.minutes()
  const s = d.seconds()
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function CallRow({ call, currentUserId, index, onOpenChat }) {
  const isVideo = call.type === 'video'
  const TypeIcon = isVideo ? VideoCameraIcon : PhoneIcon
  const isInitiator = call.initiator?.id === currentUserId

  // Derive missed vs rejected from participant statuses
  let effectiveStatus = call.status
  if (call.status === 'missed') {
    const myParticipant = call.participants?.find((p) => p.user_id === currentUserId)
    const otherParticipant = call.participants?.find((p) => p.user_id !== currentUserId)
    const rejectedStatus = isInitiator
      ? otherParticipant?.status === 'rejected'
      : myParticipant?.status === 'rejected'
    if (rejectedStatus) effectiveStatus = 'rejected'
  }

  const isMissed = effectiveStatus === 'missed'
  const isRejected = effectiveStatus === 'rejected'
  const isNotAnswered = isMissed || isRejected

  const DirectionIcon = isNotAnswered
    ? PhoneXMarkIcon
    : isInitiator
    ? PhoneArrowUpRightIcon
    : PhoneArrowDownLeftIcon

  const directionLabel = isMissed
    ? 'Missed'
    : isRejected
    ? 'Rejected'
    : isInitiator
    ? 'Outgoing'
    : 'Incoming'

  // First try to find from participants
  let otherUser = isInitiator
    ? call.participants?.find((p) => p.user_id !== currentUserId)?.user
    : call.initiator

  // If missing (e.g. migration wasn't run for "invited" status), fallback to conversation members
  if (!otherUser && isInitiator && call.conversation) {
    const targetMember = call.conversation.members?.find((m) => m.user_id !== currentUserId)
    otherUser = targetMember?.user
  }

  // If group call, use the group name if it's a group conversation
  const isGroup = call.conversation?.type === 'group'
  const displayName = isGroup 
    ? (call.conversation?.name || 'Group Call') 
    : (otherUser ? (otherUser.display_name || otherUser.full_name) : 'Unknown')

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 hover:bg-cn-gray-100 transition-all duration-200 animate-cn-fade-up cursor-pointer"
      style={{ animationDelay: `${index * 40}ms` }}
      onClick={() => call.conversation?.id && onOpenChat(call.conversation.id)}
    >
      {/* Type icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: isVideo
            ? 'linear-gradient(135deg, rgba(51,153,204,0.12), rgba(51,153,204,0.05))'
            : 'linear-gradient(135deg, rgba(204,51,51,0.12), rgba(204,51,51,0.05))',
        }}
      >
        <TypeIcon
          className="w-5 h-5"
          style={{ color: isVideo ? 'var(--cn-blue)' : 'var(--cn-red)' }}
        />
      </div>

      {/* Other user info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isGroup && call.conversation?.avatar_url ? (
          <img src={call.conversation.avatar_url} alt="Group" className="w-8 h-8 rounded-full object-cover" />
        ) : otherUser ? (
          <UserAvatar user={otherUser} size="sm" />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cn-charcoal truncate">
            {displayName}
          </p>
          <p className="text-xs text-cn-gray-400 truncate flex items-center gap-1">
            <DirectionIcon
              className="w-3 h-3 flex-shrink-0"
              style={{ color: isNotAnswered ? 'var(--cn-red)' : undefined }}
            />
            <span style={{ color: isNotAnswered ? 'var(--cn-red)' : undefined }}>
              {directionLabel}
            </span>
            <span>· {isVideo ? 'Video' : 'Audio'}</span>
            {call.participants?.length > 2 && (
              <span>· {call.participants.length} people</span>
            )}
          </p>
        </div>
      </div>

      {/* Participants stacked avatars — always rendered to keep columns aligned */}
      <div className="w-20 flex items-center -space-x-2 flex-shrink-0">
        {call.participants?.length > 1 && (
          <>
            {call.participants.slice(0, 3).map((p, i) => (
              <div
                key={p.id}
                className="w-7 h-7 rounded-full border-2 border-white overflow-hidden"
                style={{ zIndex: 10 - i }}
                title={p.user?.display_name || p.user?.full_name}
              >
                <UserAvatar user={p.user} size="xs" />
              </div>
            ))}
            {call.participants.length > 3 && (
              <div
                className="w-7 h-7 rounded-full border-2 border-white bg-cn-gray-200 flex items-center justify-center text-xs font-bold text-cn-gray-600"
                style={{ zIndex: 5 }}
              >
                +{call.participants.length - 3}
              </div>
            )}
          </>
        )}
      </div>

      {/* Status */}
      <div className="w-24 flex-shrink-0">
        <CallStatusBadge status={effectiveStatus} />
      </div>

      {/* Duration */}
      <div className="w-20 text-right flex-shrink-0">
        <p className="text-sm font-semibold text-cn-charcoal">
          {formatDuration(call.duration_seconds)}
        </p>
      </div>

      {/* Time */}
      <div className="w-28 text-right flex-shrink-0">
        <p className="text-xs font-medium text-cn-gray-600">
          {dayjs(call.started_at).format('MMM D, YYYY')}
        </p>
        <p className="text-xs text-cn-gray-400">
          {dayjs(call.started_at).format('HH:mm')}
        </p>
      </div>
    </div>
  )
}

export default function CallHistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const limit = 15

  const { data, isLoading, refetch } = useQuery(
    ['my-call-history', page],
    () => getCallHistory({ page, limit }),
    { keepPreviousData: true }
  )

  const calls = data?.calls ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const { on } = useSocket()
  
  // Real-time call history updates
  useEffect(() => {
    const off1 = on('call:ended', () => refetch())
    const off2 = on('call:rejected', () => refetch())
    const off3 = on('call:timeout', () => refetch())
    const off4 = on('call:answered', () => refetch())
    const off5 = on('call:incoming', () => refetch())
    
    return () => {
      off1()
      off2()
      off3()
      off4()
      off5()
    }
  }, [on, refetch])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 py-5 flex items-center justify-between relative overflow-hidden flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, #CC3333 0%, #2D3748 55%, #2277AA 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-15"
          style={{
            background: 'radial-gradient(ellipse at 25% 50%, rgba(255,255,255,0.3) 0%, transparent 60%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            <ClockIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-lg font-black">Call History</h1>
            <p className="text-white/50 text-xs font-medium mt-0.5">
              Your recent calls
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="relative z-10 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-all duration-200"
          title="Close"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="rounded-xl border border-cn-gray-200 bg-cn-white overflow-hidden"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {/* Table header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b border-cn-gray-200"
            style={{ background: 'var(--cn-gray-100)' }}
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, #CC3333, #3399CC)' }} />
              <span className="text-xs font-bold text-cn-gray-600 uppercase tracking-wider">
                All Calls
              </span>
              <span className="text-xs text-cn-gray-400">({total})</span>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 rounded-lg text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light transition-all duration-200"
              title="Refresh"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center gap-4 px-5 py-2.5 text-xs font-bold text-cn-gray-400 uppercase tracking-wider border-b border-cn-gray-200"
            style={{ background: 'var(--cn-gray-100)' }}
          >
            <div className="w-10 flex-shrink-0">Type</div>
            <div className="flex-1">Contact</div>
            <div className="w-20 flex-shrink-0"></div>
            <div className="w-24 flex-shrink-0">Status</div>
            <div className="w-20 text-right flex-shrink-0">Duration</div>
            <div className="w-28 text-right flex-shrink-0">Date</div>
          </div>

          {isLoading ? (
            <Loader variant="block" />
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center px-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4 animate-cn-float"
                style={{
                  background: 'linear-gradient(135deg, rgba(204,51,51,0.08) 0%, rgba(51,153,204,0.08) 100%)',
                  animationDuration: '4s',
                }}
              >
                <PhoneIcon className="w-7 h-7 text-cn-gray-400" />
              </div>
              <p className="text-sm font-semibold text-cn-gray-600">No calls yet</p>
              <p className="text-xs text-cn-gray-400 mt-1 max-w-xs">
                Start an audio or video call from any conversation and it will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-cn-gray-200">
              {calls.map((call, i) => (
                <CallRow
                  key={call.id}
                  call={call}
                  currentUserId={user?.id}
                  index={i}
                  onOpenChat={(convId) => navigate(`/chat/${convId}`)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div
              className="flex items-center justify-between px-5 py-3 border-t border-cn-gray-200"
              style={{ background: 'var(--cn-gray-100)' }}
            >
              <span className="text-xs text-cn-gray-400">
                Page {page} of {totalPages} · {total} calls
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg text-cn-gray-400 hover:text-cn-charcoal hover:bg-cn-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg text-cn-gray-400 hover:text-cn-charcoal hover:bg-cn-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
