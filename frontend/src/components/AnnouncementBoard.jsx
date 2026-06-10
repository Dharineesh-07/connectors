import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { MegaphoneIcon, TrashIcon, BookmarkIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useChatPopup } from '../context/ChatPopupContext'
import { listAnnouncements, createAnnouncement, pinAnnouncement, deleteAnnouncement } from '../api/announcements'
import UserAvatar from './UserAvatar'

dayjs.extend(relativeTime)

export default function AnnouncementBoard() {
  const { user } = useAuth()
  const { on } = useSocket()
  const queryClient = useQueryClient()
  const { announcementOpen, openAnnouncement, closeAnnouncement } = useChatPopup()
  const collapsed = !announcementOpen
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)

  const { data: announcements = [], isLoading } = useQuery('announcements', listAnnouncements)

  useEffect(() => {
    const offNew = on('announcement:new', (ann) => {
      queryClient.setQueryData('announcements', (prev = []) => [ann, ...prev])
    })
    const offDel = on('announcement:deleted', ({ id }) => {
      queryClient.setQueryData('announcements', (prev = []) =>
        prev.filter((a) => a.id !== id)
      )
    })
    const offUpdated = on('announcement:updated', (ann) => {
      queryClient.setQueryData('announcements', (prev = []) => {
        const updated = prev.map((a) => (a.id === ann.id ? ann : a))
        return [...updated].sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return b.is_pinned ? 1 : -1
          return new Date(b.created_at) - new Date(a.created_at)
        })
      })
    })
    return () => { offNew(); offDel(); offUpdated() }
  }, [on, queryClient])

  const handlePost = async () => {
    const trimmed = content.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      await createAnnouncement(trimmed)
      setContent('')
    } catch {
      toast.error('Failed to post announcement')
    } finally {
      setPosting(false)
    }
  }

  const handlePin = async (id) => {
    try {
      await pinAnnouncement(id)
    } catch {
      toast.error('Failed to update pin')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAnnouncement(id)
    } catch {
      toast.error('Failed to delete announcement')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handlePost()
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={openAnnouncement}
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' }}
      >
        <MegaphoneIcon className="w-5 h-5 text-white" />
      </button>
    )
  }

  return (
    <div
      className="flex flex-col rounded-b-2xl overflow-hidden"
      style={{
        width: 400,
        height: 400,
        background: 'var(--cn-white)',
        border: '1.5px solid var(--cn-gray-200)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--cn-gray-200)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' }}
        >
          <MegaphoneIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm" style={{ color: 'var(--cn-charcoal)' }}>
            Notice Board
          </p>
          <p className="text-xs" style={{ color: 'var(--cn-gray-400)' }}>
            {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={closeAnnouncement}
          title="Close"
          className="p-1.5 rounded-lg transition-all hover:bg-cn-gray-100"
          style={{ color: 'var(--cn-gray-400)' }}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--cn-blue)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <MegaphoneIcon className="w-8 h-8" style={{ color: 'var(--cn-gray-300)' }} />
            <p className="text-xs" style={{ color: 'var(--cn-gray-400)' }}>
              No announcements yet. Be the first!
            </p>
          </div>
        ) : (
          announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              ann={ann}
              currentUser={user}
              onPin={handlePin}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 border-t flex-shrink-0"
        style={{ borderColor: 'var(--cn-gray-200)' }}
      >
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--cn-gray-100)' }}
        >
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write an announcement…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--cn-charcoal)' }}
          />
          <button
            onClick={handlePost}
            disabled={posting || !content.trim()}
            className="flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' }}
          >
            {posting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AnnouncementCard({ ann, currentUser, onPin, onDelete }) {
  const canDelete = ann.author_id === currentUser?.id || currentUser?.role === 'admin'
  const name = ann.author?.display_name || ann.author?.full_name || 'Unknown'
  const time = dayjs(ann.created_at).fromNow()

  return (
    <div
      className="group relative rounded-xl p-3 transition-all"
      style={{
        background: ann.is_pinned
          ? 'linear-gradient(135deg, rgba(204,51,51,0.06) 0%, rgba(51,153,204,0.06) 100%)'
          : 'var(--cn-chat-bg, rgba(0,0,0,0.02))',
        border: ann.is_pinned
          ? '1px solid rgba(51,153,204,0.3)'
          : '1px solid var(--cn-gray-200)',
      }}
    >
      {ann.is_pinned && (
        <div className="flex items-center gap-1 mb-1.5">
          <BookmarkSolidIcon className="w-3 h-3" style={{ color: 'var(--cn-blue)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--cn-blue)' }}>Pinned</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <UserAvatar user={ann.author} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold truncate" style={{ color: 'var(--cn-charcoal)' }}>
              {name}
            </span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--cn-gray-400)' }}>
              {time}
            </span>
          </div>
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ color: 'var(--cn-gray-600, #555)' }}
          >
            {ann.content}
          </p>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={() => onPin(ann.id)}
            className={`p-1 rounded-lg transition-all ${ann.is_pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{
              color: ann.is_pinned ? 'var(--cn-blue)' : 'var(--cn-gray-400)',
              background: ann.is_pinned ? 'rgba(51,153,204,0.1)' : 'transparent',
            }}
            title={ann.is_pinned ? 'Unpin' : 'Pin'}
          >
            {ann.is_pinned
              ? <BookmarkSolidIcon className="w-3.5 h-3.5" />
              : <BookmarkIcon className="w-3.5 h-3.5" />
            }
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(ann.id)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
              style={{ color: 'var(--cn-red)', background: 'rgba(204,51,51,0.08)' }}
              title="Delete"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
