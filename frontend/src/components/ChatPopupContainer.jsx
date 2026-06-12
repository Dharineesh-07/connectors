import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useChatPopup } from '../context/ChatPopupContext'
import { useAuth } from '../context/AuthContext'
import { getConversation } from '../api/conversations'
import UserAvatar from './UserAvatar'
import ChatPopup from './ChatPopup'
import AnnouncementBoard from './AnnouncementBoard'

const CHAT_ROUTES = ['/', '/chat']

const MAX_MINIMIZED = 3

function HiddenChatItem({ conversationId, onOpen }) {
  const { user } = useAuth()
  const { data: conv } = useQuery(
    ['conversation', conversationId],
    () => getConversation(conversationId),
    { enabled: !!conversationId, staleTime: 30_000 }
  )
  const isDirect = conv?.type === 'direct'
  const other = isDirect ? conv?.members?.find((m) => m.user_id !== user?.id) : null
  const name = isDirect
    ? other?.user?.display_name || other?.user?.full_name || 'Direct'
    : conv?.name || 'Group'
  const avatarUser = isDirect
    ? other?.user
    : { full_name: conv?.name, avatar_url: conv?.avatar_url }

  return (
    <button
      onClick={() => onOpen(conversationId)}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cn-gray-100 transition-colors text-left"
    >
      <UserAvatar user={avatarUser} size="sm" />
      <span className="text-sm font-medium text-cn-charcoal truncate">{name}</span>
    </button>
  )
}

export default function ChatPopupContainer() {
  const { openChats, openChat } = useChatPopup()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const { pathname } = useLocation()

  const isChatRoute = pathname === '/' || pathname.startsWith('/chat')

  useEffect(() => {
    if (!showDropdown) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  if (!isChatRoute) return null

  // Split into docked (bottom bar) and floating (dragged to arbitrary position)
  const docked = openChats.filter((c) => c.x == null)
  const floating = openChats.filter((c) => c.x != null)

  // Docked overflow logic
  const dockedExpanded = docked.find((c) => !c.minimized) ?? null
  const dockedMinimized = docked.filter((c) => c.minimized)
  const maxMinimized = dockedExpanded ? MAX_MINIMIZED : MAX_MINIMIZED + 1
  const visibleMinimized = dockedMinimized.slice(-maxMinimized)
  const hiddenChats = dockedMinimized.slice(0, dockedMinimized.length - visibleMinimized.length)

  return (
    <>
      {/* ── Announcement board — fixed top-right corner ── */}
      <div className="fixed top-4 right-4 z-40" style={{ pointerEvents: 'auto' }}>
        <AnnouncementBoard />
      </div>

      {/* ── Docked bar (bottom-right) ── */}
      <div
        className="fixed bottom-0 right-4 z-40 flex items-end gap-2"
        style={{ pointerEvents: 'none' }}
      >
        {/* Overflow pill */}
        {hiddenChats.length > 0 && (
          <div ref={dropdownRef} className="relative" style={{ pointerEvents: 'auto' }}>
            {showDropdown && (
              <div
                className="absolute bottom-full mb-1 left-0 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--cn-white)',
                  border: '1px solid var(--cn-gray-200)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  minWidth: 180,
                }}
              >
                <p
                  className="text-xs font-bold px-3 py-2 uppercase tracking-wider"
                  style={{ color: 'var(--cn-gray-400)', borderBottom: '1px solid var(--cn-gray-200)' }}
                >
                  Hidden chats
                </p>
                {hiddenChats.map((chat) => (
                  <HiddenChatItem
                    key={chat.id}
                    conversationId={chat.id}
                    onOpen={(id) => { openChat(id); setShowDropdown(false) }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => setShowDropdown((v) => !v)}
              className="rounded-t-xl px-4 py-3 text-white text-sm font-bold select-none transition-all hover:opacity-90"
              style={{
                background: showDropdown
                  ? 'linear-gradient(135deg, #B02020 0%, #2277AA 100%)'
                  : 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}
            >
              +{hiddenChats.length}
            </button>
          </div>
        )}

        {/* Visible minimized */}
        {visibleMinimized.map((chat) => (
          <div key={chat.id} style={{ pointerEvents: 'auto' }}>
            <ChatPopup conversationId={chat.id} minimized />
          </div>
        ))}

        {/* Expanded — rightmost */}
        {dockedExpanded && (
          <div style={{ pointerEvents: 'auto' }}>
            <ChatPopup conversationId={dockedExpanded.id} minimized={false} />
          </div>
        )}
      </div>

      {/* ── Floating (dragged) popups ── */}
      {floating.map((chat) => (
        <div
          key={chat.id}
          style={{
            position: 'fixed',
            left: chat.x,
            top: chat.y,
            zIndex: 45,
            pointerEvents: 'auto',
          }}
        >
          <ChatPopup conversationId={chat.id} minimized={chat.minimized} />
        </div>
      ))}
    </>
  )
}
