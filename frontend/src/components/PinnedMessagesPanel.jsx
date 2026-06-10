import { useQuery } from 'react-query'
import dayjs from 'dayjs'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getPinnedMessages } from '../api/messages'
import UserAvatar from './UserAvatar'

export default function PinnedMessagesPanel({ conversationId, onClose, onViewMessage }) {
  const { data: pins = [], isLoading } = useQuery(
    ['pinned-messages', conversationId],
    () => getPinnedMessages(conversationId),
    { enabled: !!conversationId }
  )

  return (
    <div
      className="w-80 flex-shrink-0 flex flex-col h-full border-l border-cn-gray-200 bg-cn-white animate-cn-fade-up"
      style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">📌</span>
          <p className="font-semibold text-cn-charcoal text-sm">Pinned Messages</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="text-center text-cn-gray-400 text-sm py-10">Loading…</p>
        )}
        {!isLoading && pins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-cn-gray-400">
            <span className="text-4xl">📌</span>
            <p className="text-sm font-medium">No pinned messages</p>
            <p className="text-xs text-center px-6">Pin important messages so the team can find them easily.</p>
          </div>
        )}
        {pins.map((pin) => (
          <div
            key={pin.id}
            className="px-5 py-4 border-b border-cn-gray-100 hover:bg-cn-gray-50 transition-fast cursor-pointer"
            onClick={() => onViewMessage?.(pin.message_id)}
          >
            <div className="flex items-center gap-2 mb-2">
              <UserAvatar user={pin.message?.sender} size="xs" />
              <span className="text-xs font-semibold text-cn-charcoal truncate">
                {pin.message?.sender?.display_name || pin.message?.sender?.full_name}
              </span>
              <span className="text-xs text-cn-gray-400 ml-auto flex-shrink-0">
                {dayjs(pin.pinned_at).format('MMM D')}
              </span>
            </div>
            <p className="text-sm text-cn-gray-700 line-clamp-3 leading-relaxed">
              {pin.message?.is_deleted
                ? <span className="italic opacity-50">This message was deleted</span>
                : pin.message?.content ?? `[${pin.message?.type}]`}
            </p>
            <p className="text-[10px] text-cn-gray-400 mt-1.5">
              Pinned by {pin.pinned_by_user?.display_name || pin.pinned_by_user?.full_name}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
