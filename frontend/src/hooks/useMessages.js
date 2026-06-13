import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages, markRead, markConversationRead, getMessagesByDate } from '../api/messages'
import { useSocket } from '../context/SocketContext'

// Module-level cache: conversationId -> { messages, hasMore, cursor, cachedAt }
// Survives conversation switches so we can show cached data instantly on re-visit.
const messageCache = new Map()

// How long before a cache entry is considered stale and needs a background refetch.
// Socket events keep active-conversation messages live, so 5 minutes is safe.
const CACHE_STALE_MS = 5 * 60 * 1000

// Called by SocketContext on reconnect so non-active conversations refetch on
// next visit instead of serving data that may have been missed during the outage.
export function staleAllMessageCaches() {
  messageCache.forEach((entry, key) => {
    messageCache.set(key, { ...entry, cachedAt: 0 })
  })
}

export function useMessages(conversationId) {
  const { on, connected } = useSocket()
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const cursorRef = useRef(null)
  const connectedOnceRef = useRef(false)
  const mountedRef = useRef(true)
  // Tracks the conversation currently being displayed; used to discard stale async results.
  const currentConvRef = useRef(conversationId)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(
    async (reset = false) => {
      if (!conversationId) return
      // Capture at call time so we can detect if the conversation changed before the response arrives.
      const thisConvId = conversationId
      setLoading(true)
      try {
        const data = await listMessages(thisConvId, reset ? null : cursorRef.current, 30)
        if (!mountedRef.current) return
        // Conversation switched while this request was in-flight — discard the result.
        if (currentConvRef.current !== thisConvId) return
        const incoming = data.messages ?? []
        setHasMore(data.has_more)
        if (data.next_cursor) cursorRef.current = data.next_cursor
        const next = reset ? incoming : [...incoming, ...(messageCache.get(thisConvId)?.messages ?? [])]
        messageCache.set(thisConvId, { messages: next, hasMore: data.has_more, cursor: cursorRef.current, cachedAt: Date.now() })
        setMessages(next)
        if (reset) {
          markConversationRead(thisConvId).catch(() => {})
        }
      } finally {
        // Only clear the spinner if we are still showing this conversation.
        if (mountedRef.current && currentConvRef.current === thisConvId) setLoading(false)
      }
    },
    [conversationId]
  )

  useEffect(() => {
    currentConvRef.current = conversationId
    cursorRef.current = null
    connectedOnceRef.current = false
    // Clear any spinner left over from the previous conversation's in-flight request.
    setLoading(false)
    const cached = messageCache.get(conversationId)
    if (cached) {
      setMessages(cached.messages)
      setHasMore(cached.hasMore)
      cursorRef.current = cached.cursor ?? null
      // Cache is fresh — socket events have kept it current, no need to refetch.
      if (cached.cachedAt && Date.now() - cached.cachedAt < CACHE_STALE_MS) {
        markConversationRead(conversationId).catch(() => {})
        return
      }
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
          if (cached) messageCache.set(conversationId, { ...cached, messages: next, cachedAt: Date.now() })
          return next
        })
        if (data.id && document.hasFocus()) {
          markRead(data.id).catch(() => {})
        }
      } else {
        // Keep non-active conversation caches current so switching to them is instant
        const cached = messageCache.get(data.conversation_id)
        if (cached) {
          messageCache.set(data.conversation_id, {
            ...cached,
            messages: [...cached.messages, data],
            cachedAt: Date.now(),
          })
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
      setMessages((prev) => {
        if (!prev.some((m) => m.id === data.message_id)) return prev
        return prev.map((m) => {
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
      })
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
