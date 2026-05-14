import { useCallback, useEffect, useRef, useState } from 'react'
import { listMessages, markRead, markConversationRead } from '../api/messages'
import { useSocket } from '../context/SocketContext'

export function useMessages(conversationId) {
  const { on, connected } = useSocket()
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const cursorRef = useRef(null)
  const connectedOnceRef = useRef(false)

  const load = useCallback(
    async (reset = false) => {
      if (!conversationId) return
      setLoading(true)
      try {
        const data = await listMessages(conversationId, reset ? null : cursorRef.current)
        setHasMore(data.has_more)
        if (data.next_cursor) cursorRef.current = data.next_cursor
        const incoming = data.messages
        setMessages((prev) => (reset ? incoming : [...incoming, ...prev]))
        if (reset) {
          markConversationRead(conversationId).catch(() => {})
        }
      } finally {
        setLoading(false)
      }
    },
    [conversationId]
  )

  useEffect(() => {
    cursorRef.current = null
    setMessages([])
    setHasMore(false)
    connectedOnceRef.current = false
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
        setMessages((prev) => [...prev, data])
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

  const updateMessage = useCallback((messageId, updater) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? updater(m) : m)))
  }, [])

  return { messages, hasMore, loading, loadMore: () => load(false), updateMessage }
}
