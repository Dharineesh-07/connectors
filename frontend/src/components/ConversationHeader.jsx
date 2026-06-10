import { useMemo, useRef, useState } from 'react'
import { PhoneIcon, VideoCameraIcon, MagnifyingGlassIcon, InformationCircleIcon, Bars3Icon, UsersIcon, LockClosedIcon, LockOpenIcon, CalendarDaysIcon, PencilSquareIcon } from '@heroicons/react/24/outline'

function PinIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}
import UserAvatar from './UserAvatar'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import { useAuth } from '../context/AuthContext'

export default function ConversationHeader({ conversation, onCall, onToggleSearch, onToggleInfo, onToggleMembers, onTogglePinned, onToggleSidebar, onToggleE2EE, onJumpToDate, onToggleWhiteboard }) {
  const { user } = useAuth()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef(null)
  const initialOnlineIds = useMemo(
    () =>
      conversation?.members
        ?.filter((m) => m.user?.is_online)
        .map((m) => m.user_id) ?? [],
    [conversation]
  )
  const { onlineUsers, userStatuses } = useOnlineUsers(initialOnlineIds)

  if (!conversation) return null

  const isDirect = conversation.type === 'direct'
  const isE2EE = !!conversation.e2ee_enabled
  const otherMember = isDirect
    ? conversation.members?.find((m) => m.user_id !== user?.id)
    : null
  const isSelf = isDirect && !otherMember

  const displayName = isDirect
    ? isSelf ? 'You' : (otherMember?.user?.display_name || otherMember?.user?.full_name)
    : conversation.name

  const avatarUser = isDirect
    ? isSelf ? user : otherMember?.user
    : { full_name: conversation.name, avatar_url: conversation.avatar_url }

  const isOnline = isDirect ? (isSelf ? true : onlineUsers.has(otherMember?.user_id)) : false
  const status = isDirect ? (isSelf ? 'online' : userStatuses.get(otherMember?.user_id)) : 'online'
  const memberCount = conversation.members?.length ?? 0

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-cn-white border-b border-cn-gray-200 flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-2 -ml-2 text-cn-gray-400 hover:text-cn-blue transition-fast"
      >
        <Bars3Icon className="w-6 h-6" />
      </button>

      <UserAvatar user={avatarUser} size="md" online={isOnline} status={status} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-cn-charcoal truncate">{displayName}</p>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-cn-blue' : 'text-cn-gray-400'}`}>
          {isDirect && isOnline && (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: status === 'busy' ? '#EF4444' : status === 'away' ? '#F59E0B' : '#22C55E',
              }}
            />
          )}
          {isDirect
            ? isOnline
              ? status === 'busy' ? 'In a call' : status === 'away' ? 'Away' : 'Online'
              : 'Offline'
            : `${memberCount} members`}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {isDirect && onToggleE2EE && (
          <button
            onClick={onToggleE2EE}
            className={`p-2 rounded-full transition-fast ${isE2EE ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light'}`}
            title={isE2EE ? 'E2EE enabled — click to disable' : 'Enable end-to-end encryption'}
          >
            {isE2EE ? <LockClosedIcon className="w-5 h-5" /> : <LockOpenIcon className="w-5 h-5" />}
          </button>
        )}
        {!isDirect && (
          <button
            onClick={onToggleMembers}
            className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
            title="Group members"
          >
            <UsersIcon className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onTogglePinned}
          className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Pinned messages"
        >
          <PinIcon className="w-5 h-5" />
        </button>
        <div className="relative" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
            title="Jump to date"
          >
            <CalendarDaysIcon className="w-5 h-5" />
          </button>
          {showDatePicker && (
            <div
              className="absolute right-0 top-full mt-2 z-50 bg-cn-white rounded-xl border border-cn-gray-200 p-3 animate-cn-fade-up"
              style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 220 }}
            >
              <p className="text-xs font-semibold text-cn-gray-500 mb-2">Jump to date</p>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                className="w-full text-sm border border-cn-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cn-blue text-cn-gray-800 bg-cn-white"
                onChange={(e) => {
                  if (e.target.value) {
                    onJumpToDate?.(e.target.value)
                    setShowDatePicker(false)
                  }
                }}
              />
            </div>
          )}
        </div>
        <button
          onClick={onToggleWhiteboard}
          className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Whiteboard"
        >
          <PencilSquareIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleSearch}
          className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Search messages"
        >
          <MagnifyingGlassIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleInfo}
          className="p-2 text-cn-gray-400 hover:text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Conversation info"
        >
          <InformationCircleIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onCall?.('audio')}
          className="p-2 text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Voice call"
        >
          <PhoneIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onCall?.('video')}
          className="p-2 text-cn-blue hover:bg-cn-blue-light rounded-full transition-fast"
          title="Video call"
        >
          <VideoCameraIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
