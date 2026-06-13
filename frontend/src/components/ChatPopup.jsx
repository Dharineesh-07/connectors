import { useEffect, useLayoutEffect, useRef, useState, Fragment, useCallback } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import {
  XMarkIcon,
  MinusIcon,
  ChevronUpIcon,
  PhoneIcon,
  VideoCameraIcon,
  InformationCircleIcon,
  UsersIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline'
import { getConversation, listConversations } from '../api/conversations'
import {
  sendMessage,
  uploadFile,
  editMessage,
  deleteMessage,
  reactToMessage,
  pinMessage,
  unpinMessage,
  getPinnedMessages,
} from '../api/messages'
import { initiateCall } from '../api/calls'
import { useMessages } from '../hooks/useMessages'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useCall } from '../context/CallContext'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import { useChatPopup } from '../context/ChatPopupContext'
import UserAvatar from './UserAvatar'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import ChatSidebarInfo from './ChatSidebarInfo'
import ChatSidebarMembers from './ChatSidebarMembers'
import ThreadPanel from './ThreadPanel'
import ScheduleMessageModal from './ScheduleMessageModal'
import TaskCreationModal from './TaskCreationModal'

function getDateLabel(dateStr) {
  const msgDate = dayjs(dateStr)
  const today = dayjs()
  if (today.isSame(msgDate, 'day')) return 'Today'
  if (today.subtract(1, 'day').isSame(msgDate, 'day')) return 'Yesterday'
  return msgDate.format('MMM D')
}

export default function ChatPopup({ conversationId, minimized }) {
  const { user } = useAuth()
  const { emit } = useSocket()
  const { initiateCall: startRTC } = useCall()
  const { closeChat, minimizeChat, maximizeChat, updatePosition } = useChatPopup()
  const { messages, hasMore, loading, loadMore, updateMessage } = useMessages(conversationId)
  const queryClient = useQueryClient()

  const [showInfo, setShowInfo] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [threadMessage, setThreadMessage] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [pinnedMessageIds, setPinnedMessageIds] = useState(new Set())
  const [taskSourceMessage, setTaskSourceMessage] = useState(null)

  const currentThreadMessage = threadMessage
    ? messages.find((m) => m.id === threadMessage.id) ?? threadMessage
    : null
  const [replyMessage, setReplyMessage] = useState(null)
  const [forwardMessage, setForwardMessage] = useState(null)
  const [forwardConversations, setForwardConversations] = useState([])
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [popupWidth, setPopupWidth] = useState(350)
  const [popupHeight, setPopupHeight] = useState(350)
  const bottomRef = useRef(null)
  const popupRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const topSentinelRef = useRef(null)
  const scrollHeightBeforeRef = useRef(null)
  const scrollHandledRef = useRef(false)

  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = popupWidth
    const startH = popupHeight
    setIsResizing(true)
    document.body.style.cursor = 'se-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      const newW = Math.min(600, Math.max(280, startW + (ev.clientX - startX)))
      const newH = Math.min(650, Math.max(200, startH + (ev.clientY - startY)))
      setPopupWidth(newW)
      setPopupHeight(newH)
    }

    const onUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [popupWidth, popupHeight])

  const handleHeaderMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return
    if (e.button !== 0) return
    e.preventDefault()

    const el = popupRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    let dragged = false

    setIsDragging(true)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      dragged = true
      const x = Math.max(0, Math.min(ev.clientX - offsetX, window.innerWidth - el.offsetWidth))
      const y = Math.max(0, Math.min(ev.clientY - offsetY, window.innerHeight - el.offsetHeight))
      updatePosition(conversationId, x, y)
    }

    const onUp = () => {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [conversationId, updatePosition])

  const { data: conversation } = useQuery(
    ['conversation', conversationId],
    () => getConversation(conversationId),
    { enabled: !!conversationId, staleTime: 30_000 }
  )

  const isDirect = conversation?.type === 'direct'
  const otherMember = isDirect ? conversation?.members?.find((m) => m.user_id !== user?.id) : null
  const isSelf = isDirect && !otherMember
  const displayName = isDirect
    ? isSelf ? 'You' : (otherMember?.user?.display_name || otherMember?.user?.full_name)
    : conversation?.name

  const initialOnlineIds = conversation?.members
    ?.filter((m) => m.user?.is_online)
    .map((m) => m.user_id) ?? []
  const { onlineUsers, userStatuses } = useOnlineUsers(initialOnlineIds)
  const isOnline = isDirect ? onlineUsers.has(otherMember?.user_id) : false
  const status = isDirect ? userStatuses.get(otherMember?.user_id) : 'online'

  const avatarUser = isDirect
    ? isSelf ? user : otherMember?.user
    : { full_name: conversation?.name, avatar_url: conversation?.avatar_url }

  useEffect(() => {
    if (minimized) return
    if (scrollHandledRef.current) { scrollHandledRef.current = false; return }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, minimized])

  useLayoutEffect(() => {
    if (scrollHeightBeforeRef.current === null || !scrollContainerRef.current) return
    scrollContainerRef.current.scrollTop =
      scrollContainerRef.current.scrollHeight - scrollHeightBeforeRef.current
    scrollHeightBeforeRef.current = null
    scrollHandledRef.current = true
  }, [messages])

  const handleLoadMore = useCallback(() => {
    if (loading || !hasMore || !scrollContainerRef.current) return
    scrollHeightBeforeRef.current = scrollContainerRef.current.scrollHeight
    loadMore()
  }, [loading, hasMore, loadMore])

  useEffect(() => {
    const sentinel = topSentinelRef.current
    const container = scrollContainerRef.current
    if (!sentinel || !container) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore() },
      { root: container, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleLoadMore])

  const { data: pinnedMsgs = [] } = useQuery(
    ['pinned-messages', conversationId],
    () => getPinnedMessages(conversationId),
    { enabled: !!conversationId }
  )

  useEffect(() => {
    setPinnedMessageIds((prev) => {
      const next = new Set(pinnedMsgs.map((p) => p.message_id))
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [pinnedMsgs])

  // Clear state when conversation changes
  useEffect(() => {
    setReplyMessage(null)
    setForwardMessage(null)
    setForwardConversations([])
    setShowInfo(false)
    setShowMembers(false)
    setThreadMessage(null)
  }, [conversationId])

  const handleOpenThread = (message) => {
    setThreadMessage(message)
    setShowInfo(false)
    setShowMembers(false)
  }

  const handleSend = async (msgData) => {
    try {
      await sendMessage(conversationId, msgData)
    } catch {
      toast.error('Failed to send message')
    }
  }

  const handleFileUpload = async (file) => {
    try {
      const uploaded = await uploadFile(file)
      const msgType = file.type.startsWith('image/') ? 'image' : 'file'
      await sendMessage(conversationId, {
        type: msgType,
        file_url: uploaded.url,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
        file_thumbnail: uploaded.thumbnail || null,
      })
      queryClient.invalidateQueries(['conversation-attachments', conversationId])
    } catch {
      toast.error('File upload failed')
    }
  }

  const handleVoiceMessage = async (file) => {
    try {
      const uploaded = await uploadFile(file)
      await sendMessage(conversationId, {
        type: 'voice',
        file_url: uploaded.url,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
      })
    } catch {
      toast.error('Failed to send voice message')
    }
  }

  const handleAskResend = (msg) => {
    const name = msg.file_name ? `"${msg.file_name}"` : 'the file'
    handleSend({ type: 'text', content: `Can you resend ${name}? It has expired.` })
  }

  const handleTyping = (isTyping) => {
    emit('message:typing', { conversation_id: conversationId, is_typing: isTyping })
  }

  const handleCall = async (callType) => {
    if (!conversationId) return
    try {
      const data = await initiateCall(conversationId, callType)
      startRTC(data.call_id, conversationId, callType, data.room, data.conversation_type, user.id)
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Could not start call')
    }
  }

  const handleEdit = async (messageId, newContent) => {
    try {
      await editMessage(messageId, newContent)
    } catch {
      toast.error('Failed to edit message')
    }
  }

  const handleDelete = async (messageId) => {
    try {
      await deleteMessage(messageId)
    } catch {
      toast.error('Failed to delete message')
    }
  }

  const handleReact = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji)
      updateMessage(messageId, (m) => {
        const existing = m.reactions || []
        const alreadyReacted = existing.some((r) => r.user_id === user?.id && r.emoji === emoji)
        return alreadyReacted
          ? { ...m, reactions: existing.filter((r) => !(r.user_id === user?.id && r.emoji === emoji)) }
          : { ...m, reactions: [...existing, { user_id: user?.id, emoji }] }
      })
    } catch {
      toast.error('Could not react')
    }
  }

  const handlePin = async (message, currentlyPinned) => {
    try {
      if (currentlyPinned) {
        await unpinMessage(conversationId, message.id)
        setPinnedMessageIds((prev) => { const next = new Set(prev); next.delete(message.id); return next })
        toast.success('Message unpinned')
      } else {
        await pinMessage(conversationId, message.id)
        setPinnedMessageIds((prev) => new Set([...prev, message.id]))
        toast.success('Message pinned')
      }
    } catch {
      toast.error('Could not update pin')
    }
  }

  const handleForward = async (message) => {
    setForwardMessage(message)
    try {
      const data = await listConversations()
      setForwardConversations(data.conversations ?? data ?? [])
    } catch {
      toast.error('Could not load conversations')
    }
  }

  const handleForwardTo = async (targetConvId) => {
    if (!forwardMessage) return
    try {
      const isText = !forwardMessage.type || forwardMessage.type === 'text'
      const payload = isText
        ? { type: 'text', content: forwardMessage.content }
        : {
            type: forwardMessage.type,
            file_url: forwardMessage.file_url,
            file_name: forwardMessage.file_name,
            file_size: forwardMessage.file_size,
          }
      await sendMessage(targetConvId, payload)
      toast.success('Message forwarded')
    } catch {
      toast.error('Forward failed')
    }
    setForwardMessage(null)
    setForwardConversations([])
  }

  const handleViewMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId(null), 3000)
    }
  }

  const onlineLabel = isDirect
    ? isOnline
      ? status === 'busy' ? 'In a call' : status === 'away' ? 'Away' : 'Online'
      : 'Offline'
    : `${conversation?.members?.length ?? 0} members`

  return (
    <>
    <div
      ref={popupRef}
      className={isFullscreen
        ? 'fixed inset-0 z-[100] flex flex-col overflow-hidden'
        : 'flex flex-col rounded-t-xl overflow-hidden flex-shrink-0'
      }
      style={isFullscreen ? { background: 'var(--cn-white)' } : {
        width: minimized ? 180 : popupWidth,
        boxShadow: isDragging ? '0 16px 48px rgba(0,0,0,0.35)' : '0 8px 32px rgba(0,0,0,0.25)',
        border: '1px solid var(--cn-gray-200)',
        background: 'var(--cn-white)',
        transition: isDragging || isResizing ? 'box-shadow 0.15s' : 'width 0.2s ease, box-shadow 0.15s',
        position: 'relative',
      }}
    >
        {/* Header — drag handle */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0 select-none"
          style={{
            background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
            cursor: isDragging ? 'grabbing' : minimized ? 'pointer' : 'grab',
          }}
          onClick={() => minimized && maximizeChat(conversationId)}
          onMouseDown={handleHeaderMouseDown}
        >
          <UserAvatar user={avatarUser} size="sm" online={isOnline} status={status} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate leading-tight">
              {displayName || '…'}
            </p>
            {!minimized && (
              <p className="text-white/70 text-xs leading-tight">{onlineLabel}</p>
            )}
          </div>

          {/* Action buttons — only when expanded */}
          {!minimized && (
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleCall('audio')}
                className={`${isFullscreen ? 'p-1.5' : 'p-1'} text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors`}
                title="Voice call"
              >
                <PhoneIcon className={isFullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
              </button>
              <button
                onClick={() => handleCall('video')}
                className={`${isFullscreen ? 'p-1.5' : 'p-1'} text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors`}
                title="Video call"
              >
                <VideoCameraIcon className={isFullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
              </button>
              {!isDirect && (
                <button
                  onClick={() => { setShowMembers((v) => !v); setShowInfo(false) }}
                  className={`${isFullscreen ? 'p-1.5' : 'p-1'} rounded transition-colors ${showMembers ? 'text-white bg-white/25' : 'text-white/80 hover:text-white hover:bg-white/20'}`}
                  title="Group members"
                >
                  <UsersIcon className={isFullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
                </button>
              )}
              <button
                onClick={() => { setShowInfo((v) => !v); setShowMembers(false) }}
                className={`${isFullscreen ? 'p-1.5' : 'p-1'} rounded transition-colors ${showInfo ? 'text-white bg-white/25' : 'text-white/80 hover:text-white hover:bg-white/20'}`}
                title="Conversation info"
              >
                <InformationCircleIcon className={isFullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
              </button>
            </div>
          )}

          {/* Minimize / Fullscreen / Close — always visible */}
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {!minimized && (
              <button
                onClick={() => setIsFullscreen((v) => !v)}
                className={`${isFullscreen ? 'p-1.5' : 'p-1'} text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors`}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen
                  ? <ArrowsPointingInIcon className="w-5 h-5" />
                  : <ArrowsPointingOutIcon className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => { setIsFullscreen(false); minimized ? maximizeChat(conversationId) : minimizeChat(conversationId) }}
              className={`${isFullscreen ? 'p-1.5' : 'p-1'} text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors`}
              title={minimized ? 'Expand' : 'Minimize'}
            >
              {minimized ? <ChevronUpIcon className="w-4 h-4" /> : <MinusIcon className={isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} />}
            </button>
            <button
              onClick={() => closeChat(conversationId)}
              className={`${isFullscreen ? 'p-1.5' : 'p-1'} text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors`}
              title="Close"
            >
              <XMarkIcon className={isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} />
            </button>
          </div>
        </div>

        {/* Body — only when expanded */}
        {!minimized && (
          currentThreadMessage ? (
            /* Thread view — replaces messages inside the popup */
            <div style={{ height: popupHeight + 60 }}>
              <ThreadPanel
                message={currentThreadMessage}
                onClose={() => setThreadMessage(null)}
                className="flex flex-col bg-cn-white h-full w-full"
              />
            </div>
          ) : showMembers ? (
            /* Members view — replaces messages inside the popup */
            <div className="overflow-y-auto" style={{ height: popupHeight + 60 }}>
              <ChatSidebarMembers
                conversationId={conversationId}
                conversation={conversation}
                onClose={() => setShowMembers(false)}
                className="w-full flex flex-col bg-cn-white h-full relative z-20"
              />
            </div>
          ) : showInfo ? (
            /* Info view — replaces messages inside the popup */
            <div className="overflow-y-auto" style={{ height: popupHeight + 60 }}>
              <ChatSidebarInfo
                conversationId={conversationId}
                conversation={conversation}
                onClose={() => setShowInfo(false)}
              />
            </div>
          ) : (
            /* Chat view */
            <>
              <div
                ref={scrollContainerRef}
                className={`overflow-y-auto px-3 py-2 cn-chat-bg${isFullscreen ? ' flex-1' : ''}`}
                style={isFullscreen ? undefined : { height: popupHeight }}
              >
                <div ref={topSentinelRef} />
                {loading && (
                  <div className="text-center py-2">
                    <span className="text-xs" style={{ color: 'var(--cn-gray-400)' }}>Loading…</span>
                  </div>
                )}
                {messages.map((msg, index) => {
                  const msgDay = dayjs(msg.created_at).format('YYYY-MM-DD')
                  const prevDay = index > 0 ? dayjs(messages[index - 1].created_at).format('YYYY-MM-DD') : null
                  return (
                    <Fragment key={msg.id}>
                      {msgDay !== prevDay && (
                        <div className="flex items-center gap-2 my-3 px-1">
                          <div className="flex-1 h-px" style={{ background: 'var(--cn-gray-200)' }} />
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ color: 'var(--cn-gray-400)', background: 'var(--cn-gray-100)' }}
                          >
                            {getDateLabel(msg.created_at)}
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'var(--cn-gray-200)' }} />
                        </div>
                      )}
                      <MessageBubble
                        message={msg}
                        isOwn={msg.sender_id === user?.id}
                        currentUserId={user?.id}
                        highlighted={highlightedMessageId === msg.id}
                        onReply={setReplyMessage}
                        onForward={handleForward}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onReact={handleReact}
                        onOpenThread={handleOpenThread}
                        onPin={handlePin}
                        isPinned={pinnedMessageIds.has(msg.id)}
                        onCreateTask={(m) => setTaskSourceMessage(m)}
                        conversationMembers={conversation?.members}
                        onAskResend={handleAskResend}
                      />
                    </Fragment>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <MessageInput
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                onVoiceMessage={handleVoiceMessage}
                onTyping={handleTyping}
                onSchedule={() => setShowScheduleModal(true)}
                replyMessage={replyMessage}
                onCancelReply={() => setReplyMessage(null)}
                isFullscreen={isFullscreen}
              />
            </>
          )
        )}

        {/* Resize handle — bottom-right corner, only when expanded and not fullscreen */}
        {!minimized && !isFullscreen && (
          <div
            onMouseDown={handleResizeMouseDown}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              cursor: 'se-resize',
              zIndex: 10,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: '3px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1L1 9M9 5L5 9M9 9" stroke="var(--cn-gray-300)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
    </div>

    {/* Forward modal */}
      {forwardMessage && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { setForwardMessage(null); setForwardConversations([]) }}
        >
          <div
            className="bg-cn-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[60vh] flex flex-col animate-cn-fade-up"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
              <p className="font-semibold text-cn-charcoal">Forward to…</p>
              <button
                onClick={() => { setForwardMessage(null); setForwardConversations([]) }}
                className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {(() => {
                const opts = forwardConversations.filter((c) => c.id !== conversationId)
                if (!opts.length) {
                  return (
                    <p className="text-center text-sm text-cn-gray-400 py-8 px-4">
                      No other conversations to forward to
                    </p>
                  )
                }
                return opts.map((c) => {
                  const name =
                    c.type === 'direct'
                      ? c.members?.find((m) => m.user_id !== user?.id)?.user?.display_name ||
                        c.members?.find((m) => m.user_id !== user?.id)?.user?.full_name ||
                        'Direct'
                      : c.name ?? 'Group'
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleForwardTo(c.id)}
                      className="w-full text-left px-5 py-3.5 text-sm text-cn-gray-700 hover:bg-cn-gray-100 border-b border-cn-gray-100 transition-fast"
                    >
                      {name}
                    </button>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <ScheduleMessageModal
          conversationId={conversationId}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
      <TaskCreationModal
        key={taskSourceMessage?.id}
        isOpen={!!taskSourceMessage}
        onClose={() => setTaskSourceMessage(null)}
        prefillTitle={taskSourceMessage?.content?.slice(0, 120) ?? ''}
        conversationId={conversationId}
        messageId={taskSourceMessage?.id}
        members={conversation?.members ?? []}
      />
    </>
  )
}
