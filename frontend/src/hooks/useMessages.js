import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages, markRead, markConversationRead, getMessagesByDate } from '../api/messages'
import { useSocket } from '../context/SocketContext'

// Module-level cache: conversationId -> { messages, hasMore, cursor }
// Survives conversation switches so we can show cached data instantly on re-visit.
const messageCache = new Map()

export function useMessages(conversationId) {
  const { on, connected } = useSocket()
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const cursorRef = useRef(null)
  const connectedOnceRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(
    async (reset = false) => {
      if (!conversationId) return
      setLoading(true)
      try {
        const data = await listMessages(conversationId, reset ? null : cursorRef.current, 15)
        if (!mountedRef.current) return
        const incoming = data.messages ?? []
        setHasMore(data.has_more)
        if (data.next_cursor) cursorRef.current = data.next_cursor
        const next = reset ? incoming : [...incoming, ...(messageCache.get(conversationId)?.messages ?? [])]
        messageCache.set(conversationId, { messages: next, hasMore: data.has_more, cursor: cursorRef.current })
        setMessages(next)
        if (reset) {
          markConversationRead(conversationId).catch(() => {})
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [conversationId]
  )

  useEffect(() => {
    cursorRef.current = null
    connectedOnceRef.current = false
    // Show cached messages immediately to avoid blank screen while fetching
    const cached = messageCache.get(conversationId)
    if (cached) {
      setMessages(cached.messages)
      setHasMore(cached.hasMore)
      cursorRef.current = cached.cursor ?? null
    } else {
      setMessages([])
      setHasMore(false)
    }
    load(true)
  }, [conversationId, load])

  // Re-sync after reconnection to catch messages missed during disconnect
  useEffect(() => {
    if (!connected) return
    if (!connectedOnceRef.current) {
      connectedOnceRef.current = true
      return
    }
    if (conversationId) load(true)
  }, [connected, conversationId, load])

  useEffect(() => {
    return on('message:new', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) => {
          const next = [...prev, data]
          const cached = messageCache.get(conversationId)
          if (cached) messageCache.set(conversationId, { ...cached, messages: next })
          return next
        })
        if (data.id && document.hasFocus()) {
          markRead(data.id).catch(() => {})
        }
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    if (!conversationId) return
    const handleFocus = () => {
      markConversationRead(conversationId).catch(() => {})
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [conversationId])

  useEffect(() => {
    return on('message:edited', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.message_id
              ? { ...m, content: data.content, is_edited: true }
              : m
          )
        )
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    return on('message:deleted', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.message_id
              ? { ...m, is_deleted: true, content: 'This message was deleted' }
              : m
          )
        )
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    return on('message:reacted', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.message_id ? { ...m, reactions: data.reactions } : m
          )
        )
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    return on('thread:new_reply', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.parent_message_id
              ? { ...m, thread_replies: [...(m.thread_replies || []), data.reply] }
              : m
          )
        )
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    return on('message:read_receipt', (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.message_id) {
            const receipts = m.receipts || []
            const existingIdx = receipts.findIndex((r) => r.user_id === data.user_id)
            let newReceipts
            if (existingIdx >= 0) {
              newReceipts = [...receipts]
              newReceipts[existingIdx] = {
                ...newReceipts[existingIdx],
                status: data.status,
                timestamp: data.timestamp,
              }
            } else {
              newReceipts = [
                ...receipts,
                { user_id: data.user_id, status: data.status, timestamp: data.timestamp },
              ]
            }
            return { ...m, receipts: newReceipts }
          }
          return m
        })
      )
    })
  }, [on])

  useEffect(() => {
    return on('poll:voted', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.message_id ? { ...m, poll: data.poll } : m
          )
        )
      }
    })
  }, [on, conversationId])

  useEffect(() => {
    return on('poll:closed', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.message_id && m.poll
              ? { ...m, poll: { ...m.poll, is_closed: true } }
              : m
          )
        )
      }
    })
  }, [on, conversationId])

  const updateMessage = useCallback((messageId, updater) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? updater(m) : m)))
  }, [])

  const jumpToDate = useCallback(async (dateStr) => {
    if (!conversationId) return
    setLoading(true)
    try {
      const data = await getMessagesByDate(conversationId, dateStr)
      setHasMore(data.has_more)
      cursorRef.current = data.next_cursor || null
      setMessages(data.messages)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  return { messages, hasMore, loading, loadMore: () => load(false), updateMessage, jumpToDate }
}
