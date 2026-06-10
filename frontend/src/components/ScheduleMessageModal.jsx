import { useEffect, useRef, useState } from 'react'
import { XMarkIcon, ClockIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useQuery, useQueryClient } from 'react-query'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { scheduleMessage, getScheduledMessages, deleteScheduledMessage } from '../api/messages'

export default function ScheduleMessageModal({ conversationId, onClose }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('new')
  const [text, setText] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + 30)
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [sending, setSending] = useState(false)
  const textRef = useRef(null)

  const { data: scheduled = [], isLoading } = useQuery(
    ['scheduled-messages', conversationId],
    () => getScheduledMessages(conversationId),
    { enabled: !!conversationId }
  )

  useEffect(() => {
    if (tab === 'new') textRef.current?.focus()
  }, [tab])

  const handleSchedule = async () => {
    if (!text.trim()) return
    const isoTime = new Date(scheduledAt).toISOString()
    setSending(true)
    try {
      await scheduleMessage(conversationId, { content: text.trim(), type: 'text', scheduled_at: isoTime })
      queryClient.invalidateQueries(['scheduled-messages', conversationId])
      toast.success('Message scheduled')
      setText('')
      setTab('list')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not schedule message')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteScheduledMessage(id)
      queryClient.invalidateQueries(['scheduled-messages', conversationId])
      toast.success('Cancelled')
    } catch {
      toast.error('Could not cancel')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-cn-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col animate-cn-fade-up"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-cn-blue" />
            <p className="font-semibold text-cn-charcoal">Schedule Message</p>
          </div>
          <button onClick={onClose} className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-cn-gray-200">
          {['new', 'list'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-sm font-semibold transition-fast"
              style={{
                color: tab === t ? 'var(--cn-blue)' : 'var(--cn-gray-400)',
                borderBottom: tab === t ? '2px solid var(--cn-blue)' : '2px solid transparent',
              }}
            >
              {t === 'new' ? 'New' : `Scheduled${scheduled.length ? ` (${scheduled.length})` : ''}`}
            </button>
          ))}
        </div>

        {tab === 'new' ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div>
              <label className="block text-xs font-semibold text-cn-gray-500 mb-1.5">Message</label>
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your message…"
                rows={4}
                className="w-full border border-cn-gray-200 bg-cn-gray-100 rounded-xl px-4 py-3 text-sm text-cn-gray-800 placeholder-cn-gray-400 resize-none focus:outline-none focus:border-cn-blue transition-fast"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-cn-gray-500 mb-1.5">Send at</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full border border-cn-gray-200 bg-cn-gray-100 rounded-xl px-4 py-2.5 text-sm text-cn-gray-800 focus:outline-none focus:border-cn-blue transition-fast"
              />
            </div>
            <button
              onClick={handleSchedule}
              disabled={!text.trim() || sending}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-fast"
              style={{ background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' }}
            >
              {sending ? 'Scheduling…' : 'Schedule Message'}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {isLoading && <p className="text-center text-cn-gray-400 text-sm py-10">Loading…</p>}
            {!isLoading && scheduled.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-cn-gray-400">
                <ClockIcon className="w-10 h-10 opacity-40" />
                <p className="text-sm font-medium">No scheduled messages</p>
              </div>
            )}
            {scheduled.map((sm) => (
              <div key={sm.id} className="flex items-start gap-3 px-5 py-4 border-b border-cn-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cn-gray-800 leading-snug line-clamp-2">{sm.content}</p>
                  <p className="text-xs text-cn-blue mt-1 font-medium">
                    {dayjs(sm.scheduled_at).format('MMM D, YYYY · HH:mm')}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(sm.id)}
                  className="flex-shrink-0 p-1.5 text-cn-gray-400 hover:text-red-500 transition-fast"
                  title="Cancel"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
