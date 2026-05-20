import { useEffect, useRef, useState, Fragment } from 'react'
import dayjs from 'dayjs'
import { useParams, useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { getConversation, listConversations } from '../api/conversations'
import {
  sendMessage,
  uploadFile,
  editMessage,
  deleteMessage,
  reactToMessage,
} from '../api/messages'
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
import { useNetworkStatus } from '../hooks/useNetworkStatus'

function getDateLabel(dateStr) {
  const msgDate = dayjs(dateStr)
  const today = dayjs()
  if (today.isSame(msgDate, 'day')) return 'Today'
  if (today.subtract(1, 'day').isSame(msgDate, 'day')) return 'Yesterday'
  if (today.year() === msgDate.year()) return msgDate.format('dddd, MMMM D')
  return msgDate.format('MMMM D, YYYY')
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
  const { emit, connected } = useSocket()
  const isOnline = useNetworkStatus()
  const { initiateCall: startRTC } = useCall()
  const { onToggleSidebar } = useOutletContext()
  const { messages, hasMore, loading, loadMore, updateMessage } = useMessages(conversationId)
  const [activeSidebar, setActiveSidebar] = useState(null)
  const [loadMoreHovered, setLoadMoreHovered] = useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [replyMessage, setReplyMessage] = useState(null)
  const [forwardMessage, setForwardMessage] = useState(null)
  const [forwardConversations, setForwardConversations] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const pendingQueueRef = useRef([])
  const prevConnectedRef = useRef(connected)
  const bottomRef = useRef(null)

  const queryClient = useQueryClient()

  const { data: conversation } = useQuery(
    ['conversation', conversationId],
    () => getConversation(conversationId),
    { enabled: !!conversationId }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Clear reply/forward and discard pending queue when switching conversations
  useEffect(() => {
    setReplyMessage(null)
    setForwardMessage(null)
    setForwardConversations([])
    pendingQueueRef.current = []
    setPendingCount(0)
  }, [conversationId])

  // Flush pending message queue on reconnection
  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (!wasConnected && connected && pendingQueueRef.current.length > 0) {
      const queue = [...pendingQueueRef.current]
      pendingQueueRef.current = []
      setPendingCount(0)
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
  }, [connected])

  const handleSend = async (msgData) => {
    if (!isOnline || !connected) {
      pendingQueueRef.current.push({ convId: conversationId, msgData })
      setPendingCount((c) => c + 1)
      return
    }
    try {
      await sendMessage(conversationId, msgData)
    } catch {
      toast.error('Failed to send message')
    }
  }

  const handleFileUpload = async (file) => {
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
  }

  const handleVoiceMessage = async (file) => {
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
  }

  const handleTyping = (isTyping) => {
    emit('message:typing', { conversation_id: conversationId, is_typing: isTyping })
  }

  const handleCall = async (callType) => {
    if (!conversationId) return
    try {
      const data = await initiateCall(conversationId, callType)
      await startRTC(data.call_id, conversationId, callType, data.turn_credentials)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Could not start call'
      toast.error(msg)
    }
  }

  const toggleSidebar = (type) => {
    setActiveSidebar((prev) => (prev === type ? null : type))
  }

  const handleViewMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId(null), 3000)
    } else {
      toast.error('Message not found in current view. It might be further back in history.')
    }
  }

  // Message action handlers
  const handleReply = (message) => setReplyMessage(message)

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
      await sendMessage(targetConvId, { content: forwardMessage.content, type: 'text' })
      toast.success('Message forwarded')
    } catch {
      toast.error('Forward failed')
    }
    setForwardMessage(null)
    setForwardConversations([])
  }

  const handleEdit = async (messageId, newContent) => {
    try {
      await editMessage(messageId, newContent)
      // socket event message:edited will update state via useMessages
    } catch {
      toast.error('Failed to edit message')
    }
  }

  const handleDelete = async (messageId) => {
    try {
      await deleteMessage(messageId)
      // socket event message:deleted will update state via useMessages
    } catch {
      toast.error('Failed to delete message')
    }
  }

  const handleReact = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji)
      // Optimistic update
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
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden cn-chat-bg">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden absolute top-4 left-4 p-2 text-cn-gray-400 hover:text-cn-blue transition-fast z-50 bg-cn-white rounded-full shadow-md"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>

        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--cn-chat-dot) 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div
          className="absolute animate-cn-float opacity-20"
          style={{
            top: '20%', left: '15%',
            width: 300, height: 300, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--cn-red) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animationDuration: '5s',
          }}
        />
        <div
          className="absolute animate-cn-float opacity-15"
          style={{
            bottom: '20%', right: '15%',
            width: 250, height: 250, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--cn-blue) 0%, transparent 70%)',
            filter: 'blur(40px)',
            animationDuration: '7s',
            animationDelay: '2s',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-5 animate-cn-fade-up">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center animate-cn-float"
            style={{
              background: 'linear-gradient(135deg, rgba(204,51,51,0.15) 0%, rgba(51,153,204,0.15) 100%)',
              boxShadow: '0 8px 32px rgba(51,153,204,0.15)',
              animationDuration: '3.5s',
            }}
          >
            <span className="text-3xl">💬</span>
          </div>
          <div className="text-center">
            <p className="text-cn-charcoal font-bold text-base">Select a conversation</p>
            <p className="text-cn-gray-400 text-sm mt-1">to start chatting</p>
          </div>
          <div className="mt-2 opacity-60">
            <Logo size="sm" />
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
          onToggleSidebar={onToggleSidebar}
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
          replyMessage={replyMessage}
          onCancelReply={() => setReplyMessage(null)}
        />
      </div>

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
