import { useMemo } from 'react'
import { PhoneIcon, VideoCameraIcon, MagnifyingGlassIcon, InformationCircleIcon, Bars3Icon, UsersIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import { useAuth } from '../context/AuthContext'

export default function ConversationHeader({ conversation, onCall, onToggleSearch, onToggleInfo, onToggleMembers, onToggleSidebar }) {
  const { user } = useAuth()
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
