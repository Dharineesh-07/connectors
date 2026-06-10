import { useCallback, useEffect, useRef, useState, Fragment } from 'react'
import dayjs from 'dayjs'
import { useParams, useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { getConversation, listConversations, toggleE2EE } from '../api/conversations'
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
import { createPoll } from '../api/polls'
import { initiateCall } from '../api/calls'
import { useMessages } from '../hooks/useMessages'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { useCall } from '../context/CallContext'
import ConversationHeader from '../components/ConversationHeader'
import MessageBubble from '../components/MessageBubble'
import MessageInput from '../components/MessageInput'
import Logo from '../components/Logo'
import ChatSidebarSearch from '../components/ChatSidebarSearch'
import ChatSidebarInfo from '../components/ChatSidebarInfo'
import ChatSidebarMembers from '../components/ChatSidebarMembers'
import OfflineBanner from '../components/OfflineBanner'
import ThreadPanel from '../components/ThreadPanel'
import PinnedMessagesPanel from '../components/PinnedMessagesPanel'
import WhiteboardPanel from '../components/WhiteboardPanel'
import ScheduleMessageModal from '../components/ScheduleMessageModal'
import TaskCreationModal from '../components/TaskCreationModal'
import PollCreator from '../components/PollCreator'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useE2EE } from '../hooks/useE2EE'
import { loadDraftQueue, saveDraftQueue } from '../utils/draftQueue'

function getDateLabel(dateStr) {
  const msgDate = dayjs(dateStr)
  const today = dayjs()
  if (today.isSame(msgDate, 'day')) return 'Today'
  if (today.subtract(1, 'day').isSame(msgDate, 'day')) return 'Yesterday'
  if (today.year() === msgDate.year()) return msgDate.format('dddd, MMMM D')
  return msgDate.format('MMMM D, YYYY')
}

function formatTypingUsers(typingUsers) {
  const names = [...typingUsers.values()]
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing…`
}

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 my-4 px-2">
      <div className="flex-1 h-px" style={{ background: 'var(--cn-gray-200)' }} />
      <span
        className="text-xs font-semibold px-3 py-1 rounded-full select-none"
        style={{ color: 'var(--cn-gray-400)', background: 'var(--cn-gray-100)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--cn-gray-200)' }} />
    </div>
  )
}

export default function Chat() {
  const { conversationId } = useParams()
  const { user } = useAuth()
  const { emit, connected, on } = useSocket()
  const isOnline = useNetworkStatus()
  const { initiateCall: startRTC } = useCall()
  const { onToggleSidebar } = useOutletContext()
  const { messages, hasMore, loading, loadMore, updateMessage, jumpToDate } = useMessages(conversationId)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [threadMessage, setThreadMessage] = useState(null)
  const [loadMoreHovered, setLoadMoreHovered] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [replyMessage, setReplyMessage] = useState(null)
  const [forwardMessage, setForwardMessage] = useState(null)
  const [forwardConversations, setForwardConversations] = useState([])
  const [pinnedMessageIds, setPinnedMessageIds] = useState(new Set())
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [taskSourceMessage, setTaskSourceMessage] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [typingUsers, setTypingUsers] = useState(new Map())
  const pendingQueueRef = useRef([])
  const typingTimers = useRef(new Map())
  const prevConnectedRef = useRef(connected)
  const bottomRef = useRef(null)

  const isInitialLoadRef = useRef(true)
  const queryClient = useQueryClient()

  // Clear all timers when the component unmounts to prevent memory leaks.
  useEffect(() => {
    return () => {
      typingTimers.current.forEach(clearTimeout)
      typingTimers.current.clear()
      pendingQueueRef.current = []
    }
  }, [])

  const { data: conversation } = useQuery(
    ['conversation', conversationId],
    () => getConversation(conversationId),
    { enabled: !!conversationId }
  )

  const { ready: e2eeReady, encrypt: e2eeEncrypt, decrypt: e2eeDecrypt, isActive: e2eeActive } = useE2EE(conversation, user?.id)

  const { data: pinnedMsgs = [] } = useQuery(
    ['pinned-messages', conversationId],
    () => getPinnedMessages(conversationId),
    {
      enabled: !!conversationId,
      onSuccess: (pins) => setPinnedMessageIds(new Set(pins.map((p) => p.message_id))),
    }
  )

  // keep pinnedMessageIds in sync when pins load. pinnedMsgs defaults to a new
  // [] on every render (react-query data is undefined until loaded), so guard
  // against setting an equal Set to avoid an infinite render loop.
  useEffect(() => {
    setPinnedMessageIds((prev) => {
      const next = new Set(pinnedMsgs.map((p) => p.message_id))
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev
      return next
    })
  }, [pinnedMsgs])

  // real-time E2EE state changes
  useEffect(() => {
    return on('conversation:e2ee_changed', (data) => {
      if (data.conversation_id === conversationId) {
        queryClient.invalidateQueries(['conversation', conversationId])
      }
    })
  }, [on, conversationId, queryClient])

  // typing indicators
  useEffect(() => {
    return on('message:typing', (data) => {
      if (data.conversation_id !== conversationId) return
      const { user_id: userId, display_name: name, is_typing: isTyping } = data
      if (typingTimers.current.has(userId)) clearTimeout(typingTimers.current.get(userId))
      if (isTyping) {
        setTypingUsers((prev) => new Map(prev).set(userId, name || 'Someone'))
        typingTimers.current.set(
          userId,
          setTimeout(() => {
            setTypingUsers((prev) => { const n = new Map(prev); n.delete(userId); return n })
            typingTimers.current.delete(userId)
          }, 4000)
        )
      } else {
        setTypingUsers((prev) => { const n = new Map(prev); n.delete(userId); return n })
        typingTimers.current.delete(userId)
      }
    })
  }, [on, conversationId])

  // real-time pin updates for all conversation members
  useEffect(() => {
    const offPin = on('message:pinned', (data) => {
      if (data.conversation_id === conversationId) {
        setPinnedMessageIds((prev) => new Set([...prev, data.pin.message_id]))
        queryClient.invalidateQueries(['pinned-messages', conversationId])
      }
    })
    const offUnpin = on('message:unpinned', (data) => {
      if (data.conversation_id === conversationId) {
        setPinnedMessageIds((prev) => { const next = new Set(prev); next.delete(data.message_id); return next })
        queryClient.invalidateQueries(['pinned-messages', conversationId])
      }
    })
    return () => { offPin?.(); offUnpin?.() }
  }, [on, conversationId, queryClient])

  useEffect(() => {
    if (messages.length === 0) return
    const behavior = isInitialLoadRef.current ? 'instant' : 'smooth'
    isInitialLoadRef.current = false
    bottomRef.current?.scrollIntoView({ behavior })
  }, [messages.length])

  // Reset initial-load flag when conversation changes so next load is instant
  useEffect(() => {
    isInitialLoadRef.current = true
  }, [conversationId])

  // Derive the live thread message from the messages array so replies stay in sync
  const currentThreadMessage = threadMessage
    ? messages.find((m) => m.id === threadMessage.id) ?? threadMessage
    : null

  // Clear reply/forward/thread and discard pending queue when switching conversations
  useEffect(() => {
    setReplyMessage(null)
    setForwardMessage(null)
    setForwardConversations([])
    setThreadMessage(null)
    setShowScheduleModal(false)
    pendingQueueRef.current = []
    setPendingCount(0)
    setTypingUsers(new Map())
    typingTimers.current.forEach(clearTimeout)
    typingTimers.current.clear()
    // Restore persisted draft queue from IndexedDB
    if (conversationId) {
      loadDraftQueue(conversationId).then((saved) => {
        if (saved.length > 0) {
          pendingQueueRef.current = saved
          setPendingCount(saved.length)
        }
      })
    }
  }, [conversationId])

  // Flush pending message queue on reconnection
  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (!wasConnected && connected && pendingQueueRef.current.length > 0) {
      const queue = [...pendingQueueRef.current]
      pendingQueueRef.current = []
      setPendingCount(0)
      if (conversationId) saveDraftQueue(conversationId, [])
      ;(async () => {
        let failed = 0
        for (const { convId, msgData } of queue) {
          try {
            await sendMessage(convId, msgData)
          } catch {
            failed++
          }
        }
        if (failed > 0) {
          toast.error(`${failed} queued message${failed > 1 ? 's' : ''} failed to send`)
        }
      })()
    }
  }, [connected, conversationId])

  const handleSend = useCallback(async (msgData) => {
    if (!isOnline || !connected) {
      const item = { convId: conversationId, msgData }
      pendingQueueRef.current.push(item)
      setPendingCount((c) => c + 1)
      saveDraftQueue(conversationId, pendingQueueRef.current)
      return
    }
    try {
      let payload = msgData
      if (e2eeActive && e2eeReady && msgData.type === 'text' && msgData.content) {
        const encryptedContent = await e2eeEncrypt(msgData.content)
        payload = { ...msgData, content: encryptedContent, is_encrypted: true }
      }
      await sendMessage(conversationId, payload)
    } catch {
      toast.error('Failed to send message')
    }
  }, [isOnline, connected, conversationId, e2eeActive, e2eeReady, e2eeEncrypt])

  const handleFileUpload = useCallback(async (file) => {
    if (!isOnline || !connected) {
      toast.error('File upload requires an active connection')
      return
    }
    try {
      const uploaded = await uploadFile(file)
      const msgType = file.type.startsWith('image/') ? 'image' : 'file'
      await sendMessage(conversationId, {
        type: msgType,
        file_url: uploaded.url,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
      })
      queryClient.invalidateQueries(['conversation-attachments', conversationId])
    } catch {
      toast.error('File upload failed')
    }
  }, [isOnline, connected, conversationId, queryClient])

  const handleVoiceMessage = useCallback(async (file) => {
    if (!isOnline || !connected) {
      toast.error('Voice message requires an active connection')
      return
    }
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
  }, [isOnline, connected, conversationId])

  const handleTyping = useCallback((isTyping) => {
    emit('message:typing', { conversation_id: conversationId, is_typing: isTyping })
  }, [emit, conversationId])

  const handleToggleE2EE = useCallback(async () => {
    if (!conversationId || !conversation) return
    const newState = !conversation.e2ee_enabled
    try {
      await toggleE2EE(conversationId, newState)
      queryClient.invalidateQueries(['conversation', conversationId])
      toast.success(newState ? 'End-to-end encryption enabled' : 'Encryption disabled')
    } catch {
      toast.error('Could not update encryption setting')
    }
  }, [conversationId, conversation, queryClient])

  const handleCreatePoll = useCallback(async (pollData) => {
    try {
      await createPoll(conversationId, pollData)
    } catch {
      toast.error('Failed to create poll')
    }
  }, [conversationId])

  const handleJumpToDate = useCallback((dateStr) => {
    isInitialLoadRef.current = true
    jumpToDate(dateStr)
  }, [jumpToDate])

  const handleCall = useCallback(async (callType) => {
    if (!conversationId) return
    try {
      const data = await initiateCall(conversationId, callType)
      startRTC(data.call_id, conversationId, callType, data.room, data.conversation_type, user.id)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Could not start call'
      const activeCallId = err.response?.data?.active_call_id
      if (activeCallId) {
        toast((t) => (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{detail}</span>
            <button
              style={{
                background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
                padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}
              onClick={async () => {
                toast.dismiss(t.id)
                try {
                  const { leaveCall } = await import('../api/calls')
                  await leaveCall(activeCallId)
                  toast.success('Previous call ended — try calling again')
                } catch {
                  toast.error('Could not end previous call')
                }
              }}
            >End previous call</button>
          </span>
        ), { duration: 8000 })
      } else {
        toast.error(detail)
      }
    }
  }, [conversationId, startRTC, user])

  const toggleSidebar = useCallback((type) => {
    setActiveSidebar((prev) => (prev === type ? null : type))
    setThreadMessage(null)
  }, [])

  const handleOpenThread = useCallback((message) => {
    setThreadMessage(message)
    setActiveSidebar(null)
  }, [])

  const handleViewMessage = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId(null), 3000)
    } else {
      toast.error('Message not found in current view. It might be further back in history.')
    }
  }, [])

  const handleReply = useCallback((message) => setReplyMessage(message), [])

  const handleForward = useCallback(async (message) => {
    setForwardMessage(message)
    try {
      const data = await listConversations()
      setForwardConversations(data.conversations ?? data ?? [])
    } catch {
      toast.error('Could not load conversations')
    }
  }, [])

  const handleForwardTo = useCallback(async (targetConvId) => {
    if (!forwardMessage) return
    try {
      await sendMessage(targetConvId, { content: forwardMessage.content, type: 'text' })
      toast.success('Message forwarded')
    } catch {
      toast.error('Forward failed')
    }
    setForwardMessage(null)
    setForwardConversations([])
  }, [forwardMessage])

  const handlePin = useCallback(async (message, currentlyPinned) => {
    try {
      if (currentlyPinned) {
        await unpinMessage(conversationId, message.id)
        setPinnedMessageIds((prev) => { const next = new Set(prev); next.delete(message.id); return next })
        queryClient.invalidateQueries(['pinned-messages', conversationId])
        toast.success('Message unpinned')
      } else {
        await pinMessage(conversationId, message.id)
        setPinnedMessageIds((prev) => new Set([...prev, message.id]))
        queryClient.invalidateQueries(['pinned-messages', conversationId])
        toast.success('Message pinned')
      }
    } catch {
      toast.error('Could not update pin')
    }
  }, [conversationId, queryClient])

  const handleEdit = useCallback(async (messageId, newContent) => {
    try {
      await editMessage(messageId, newContent)
    } catch {
      toast.error('Failed to edit message')
    }
  }, [])

  const handleDelete = useCallback(async (messageId) => {
    try {
      await deleteMessage(messageId)
    } catch {
      toast.error('Failed to delete message')
    }
  }, [])

  const handleReact = useCallback(async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji)
      updateMessage(messageId, (m) => {
        const existing = m.reactions || []
        const alreadyReacted = existing.some(
          (r) => r.user_id === user?.id && r.emoji === emoji
        )
        if (alreadyReacted) {
          return {
            ...m,
            reactions: existing.filter(
              (r) => !(r.user_id === user?.id && r.emoji === emoji)
            ),
          }
        }
        return { ...m, reactions: [...existing, { user_id: user?.id, emoji }] }
      })
    } catch {
      toast.error('Could not react to message')
    }
  }, [user?.id, updateMessage])

  if (!conversationId) {
    const hour = new Date().getHours()
    const firstName = (user?.display_name || user?.full_name || '').split(' ')[0]
    const { greeting, emoji, sub } = hour < 12
      ? { greeting: 'Good morning', emoji: '☀️', sub: 'Ready to connect with your team?' }
      : hour < 17
      ? { greeting: 'Good afternoon', emoji: '👋', sub: 'What would you like to work on?' }
      : hour < 21
      ? { greeting: 'Good evening', emoji: '🌆', sub: 'Wrapping things up for the day?' }
      : { greeting: 'Working late', emoji: '🌙', sub: "Don't forget to rest up!" }

    return (
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden cn-chat-bg">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden absolute top-4 left-4 p-2 text-cn-gray-400 hover:text-cn-blue transition-fast z-50 bg-cn-white rounded-full shadow-md"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>

        {/* Background decoration */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--cn-chat-dot) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          className="absolute animate-cn-float opacity-20 pointer-events-none"
          style={{
            top: '20%', left: '15%',
            width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--cn-red) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animationDuration: '5s',
          }}
        />
        <div
          className="absolute animate-cn-float opacity-15 pointer-events-none"
          style={{
            bottom: '20%', right: '15%',
            width: 250, height: 250, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--cn-blue) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animationDuration: '7s',
            animationDelay: '2s',
          }}
        />

        {/* Centered greeting */}
        <div className="relative z-10 flex flex-col items-center gap-4 animate-cn-fade-up text-center px-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center animate-cn-float"
            style={{
              background: 'linear-gradient(135deg, rgba(204,51,51,0.15) 0%, rgba(51,153,204,0.15) 100%)',
              boxShadow: '0 8px 32px rgba(51,153,204,0.15)',
              animationDuration: '3.5s',
            }}
          >
            <span className="text-4xl">{emoji}</span>
          </div>
          <div>
            <p className="text-cn-charcoal font-bold text-2xl leading-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}!
            </p>
            <p className="text-cn-gray-400 text-sm mt-2">{sub}</p>
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <ConversationHeader
          conversation={conversation}
          onCall={handleCall}
          onToggleSearch={() => toggleSidebar('search')}
          onToggleInfo={() => toggleSidebar('info')}
          onToggleMembers={() => toggleSidebar('members')}
          onTogglePinned={() => toggleSidebar('pinned')}
          onToggleWhiteboard={() => toggleSidebar('whiteboard')}
          onToggleSidebar={onToggleSidebar}
          onToggleE2EE={handleToggleE2EE}
          onJumpToDate={handleJumpToDate}
        />

        <OfflineBanner />

        {pendingCount > 0 && (
          <div
            className="text-center py-1 text-xs font-medium"
            style={{ background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a' }}
          >
            {pendingCount} message{pendingCount > 1 ? 's' : ''} queued — will send when reconnected
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 cn-chat-bg">
          {hasMore && (
            <div className="text-center mb-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="text-xs font-semibold px-5 py-2 rounded-full transition-all duration-200 disabled:opacity-50"
                style={{
                  background: loadMoreHovered
                    ? 'linear-gradient(135deg, #3399CC 0%, #2277AA 100%)'
                    : 'linear-gradient(135deg, rgba(51,153,204,0.15) 0%, rgba(51,153,204,0.08) 100%)',
                  color: loadMoreHovered ? '#fff' : 'var(--cn-blue)',
                  border: '1.5px solid rgba(51,153,204,0.25)',
                  boxShadow: loadMoreHovered ? '0 4px 12px rgba(51,153,204,0.35)' : 'none',
                }}
                onMouseEnter={() => setLoadMoreHovered(true)}
                onMouseLeave={() => setLoadMoreHovered(false)}
              >
                {loading ? '↑ Loading…' : '↑ Load earlier messages'}
              </button>
            </div>
          )}
          {messages.map((msg, index) => {
            const msgDay = dayjs(msg.created_at).format('YYYY-MM-DD')
            const prevDay = index > 0 ? dayjs(messages[index - 1].created_at).format('YYYY-MM-DD') : null
            return (
              <Fragment key={msg.id}>
                {msgDay !== prevDay && <DateSeparator label={getDateLabel(msg.created_at)} />}
                <MessageBubble
                  message={msg}
                  isOwn={msg.sender_id === user?.id}
                  currentUserId={user?.id}
                  highlighted={highlightedMessageId === msg.id}
                  onReply={handleReply}
                  onForward={handleForward}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onOpenThread={handleOpenThread}
                  onPin={handlePin}
                  isPinned={pinnedMessageIds.has(msg.id)}
                  onCreateTask={(msg) => setTaskSourceMessage(msg)}
                  conversationMembers={conversation?.members}
                  decrypt={e2eeDecrypt}
                  onPollUpdate={(updatedPoll) => updateMessage(msg.id, (m) => ({ ...m, poll: updatedPoll }))}
                />
              </Fragment>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {typingUsers.size > 0 && (
          <div className="px-5 py-1.5 flex items-center gap-2 bg-cn-white border-t border-cn-gray-100">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cn-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cn-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-cn-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="text-xs text-cn-gray-500">{formatTypingUsers(typingUsers)}</span>
          </div>
        )}
        <MessageInput
          onSend={handleSend}
          onFileUpload={handleFileUpload}
          onVoiceMessage={handleVoiceMessage}
          onTyping={handleTyping}
          onSchedule={() => setShowScheduleModal(true)}
          onCreatePoll={() => setShowPollCreator(true)}
          replyMessage={replyMessage}
          onCancelReply={() => setReplyMessage(null)}
          e2eeActive={e2eeActive}
          e2eeReady={e2eeReady}
        />
      </div>

      {currentThreadMessage && (
        <ThreadPanel
          message={currentThreadMessage}
          onClose={() => setThreadMessage(null)}
        />
      )}
      {activeSidebar === 'search' && (
        <ChatSidebarSearch
          conversationId={conversationId}
          onClose={() => setActiveSidebar(null)}
          onViewMessage={handleViewMessage}
        />
      )}
      {activeSidebar === 'info' && (
        <ChatSidebarInfo
          conversationId={conversationId}
          conversation={conversation}
          onClose={() => setActiveSidebar(null)}
        />
      )}
      {activeSidebar === 'members' && (
        <ChatSidebarMembers
          conversationId={conversationId}
          conversation={conversation}
          onClose={() => setActiveSidebar(null)}
        />
      )}
      {activeSidebar === 'pinned' && (
        <PinnedMessagesPanel
          conversationId={conversationId}
          onClose={() => setActiveSidebar(null)}
          onViewMessage={handleViewMessage}
        />
      )}
      {activeSidebar === 'whiteboard' && (
        <WhiteboardPanel
          conversationId={conversationId}
          onClose={() => setActiveSidebar(null)}
        />
      )}
      {showScheduleModal && (
        <ScheduleMessageModal
          conversationId={conversationId}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
      {showPollCreator && (
        <PollCreator
          onClose={() => setShowPollCreator(false)}
          onSubmit={handleCreatePoll}
        />
      )}
      <TaskCreationModal
        isOpen={!!taskSourceMessage}
        onClose={() => setTaskSourceMessage(null)}
        prefillTitle={taskSourceMessage?.content?.slice(0, 120) ?? ''}
        conversationId={conversationId}
        messageId={taskSourceMessage?.id}
        members={conversation?.members ?? []}
      />
      {/* Forward modal */}
      {forwardMessage && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => {
            setForwardMessage(null)
            setForwardConversations([])
          }}
        >
          <div
            className="bg-cn-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[60vh] flex flex-col animate-cn-fade-up"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
              <p className="font-semibold text-cn-charcoal">Forward to…</p>
              <button
                onClick={() => {
                  setForwardMessage(null)
                  setForwardConversations([])
                }}
                className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {forwardConversations
                .filter((c) => c.id !== conversationId)
                .map((c) => {
                  const name =
                    c.type === 'direct'
                      ? c.members?.find((m) => m.user_id !== user?.id)?.user
                          ?.display_name ||
                        c.members?.find((m) => m.user_id !== user?.id)?.user
                          ?.full_name ||
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
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
