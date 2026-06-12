import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { XMarkIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import { sendMessage, getThreadReplies } from '../api/messages'

function ThreadReplyItem({ reply }) {
  const isDeleted = reply.is_deleted
  return (
    <div className="flex gap-2.5 items-start">
      <UserAvatar user={reply.sender} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-xs font-bold"
            style={{
              background: 'linear-gradient(90deg, #CC3333, #3399CC)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {reply.sender?.display_name || reply.sender?.full_name}
          </span>
          <span className="text-[10px] text-cn-gray-400">
            {dayjs(reply.created_at).format('HH:mm')}
          </span>
        </div>
        <p
          className={`text-sm text-cn-gray-800 mt-0.5 break-words leading-snug ${
            isDeleted ? 'italic opacity-50' : ''
          }`}
        >
          {isDeleted ? 'This message was deleted' : reply.content}
        </p>
      </div>
    </div>
  )
}

function ParentMessage({ message }) {
  return (
    <div
      className="flex gap-2.5 items-start px-4 py-3"
      style={{ borderBottom: '1px solid var(--cn-gray-200)' }}
    >
      <UserAvatar user={message.sender} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-xs font-bold"
            style={{
              background: 'linear-gradient(90deg, #CC3333, #3399CC)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {message.sender?.display_name || message.sender?.full_name}
          </span>
          <span className="text-[10px] text-cn-gray-400">
            {dayjs(message.created_at).format('MMM D, HH:mm')}
          </span>
        </div>
        <p className="text-sm text-cn-gray-800 mt-0.5 break-words leading-snug">
          {message.content}
        </p>
      </div>
    </div>
  )
}

export default function ThreadPanel({ message, onClose, className }) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [replies, setReplies] = useState([])
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Fetch existing replies from API when thread opens
  useEffect(() => {
    if (!message?.id) return
    setReplies(message?.thread_replies ?? [])
    getThreadReplies(message.id).then(setReplies).catch(() => {})
  }, [message?.id])

  // Append new real-time replies pushed via WebSocket (avoid duplicates)
  useEffect(() => {
    const ws = message?.thread_replies ?? []
    if (!ws.length) return
    setReplies((prev) => {
      const ids = new Set(prev.map((r) => r.id))
      const newOnes = ws.filter((r) => !ids.has(r.id))
      return newOnes.length ? [...prev, ...newOnes] : prev
    })
  }, [message?.thread_replies])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies.length])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [message?.id])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending || !message) return
    setSending(true)
    try {
      await sendMessage(message.conversation_id, {
        type: 'text',
        content,
        thread_parent_id: message.id,
      })
      setInput('')
    } finally {
      setSending(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!message) return null

  return (
    <div className={className ?? 'w-80 flex flex-col bg-cn-white border-l border-cn-gray-200 h-full animate-cn-slide-in-right shadow-2xl relative z-20'}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--cn-gray-200)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--cn-blue)' }}>
            <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold text-sm text-cn-charcoal">Thread</span>
          {replies.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(51,153,204,0.1)', color: 'var(--cn-blue)' }}
            >
              {replies.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full text-cn-gray-400 hover:text-cn-gray-600 hover:bg-cn-gray-100 transition-fast"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message */}
      <div className="flex-shrink-0">
        <ParentMessage message={message} />
      </div>

      {/* Replies list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {replies.length === 0 ? (
          <p className="text-xs text-cn-gray-400 text-center mt-4">
            No replies yet. Start the thread!
          </p>
        ) : (
          replies.map((reply) => (
            <ThreadReplyItem key={reply.id} reply={reply} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div
        className="flex-shrink-0 px-3 py-3"
        style={{ borderTop: '1px solid var(--cn-gray-200)' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Reply in thread…"
            rows={1}
            className="flex-1 resize-none border border-cn-gray-200 bg-cn-gray-100 text-cn-gray-800 placeholder-cn-gray-400 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-cn-blue overflow-y-auto transition-fast"
            style={{ minHeight: 36, maxHeight: 96 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)',
              boxShadow: input.trim() ? '0 2px 8px rgba(204,51,51,0.35)' : 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
