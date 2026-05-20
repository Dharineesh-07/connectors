import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import dayjs from 'dayjs'
import { DocumentIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import ImageLightbox from './ImageLightbox'

function formatFileSize(bytes) {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡']

function isImageFile(fileName) {
  if (!fileName) return false
  const ext = fileName.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

function ReceiptTicks({ receipts, currentUserId }) {
  const others = receipts?.filter((r) => r.user_id !== currentUserId) ?? []
  const allRead = others.length > 0 && others.every((r) => r.status === 'read')
  const anyDelivered = others.some((r) => r.status === 'delivered' || r.status === 'read')

  return (
    <span
      className="inline-flex items-center ml-1 transition-colors duration-300"
      style={{
        color: allRead ? '#60A5FA' : 'rgba(255,255,255,0.65)',
        filter: allRead ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' : 'none',
      }}
    >
      <svg viewBox="0 0 16 9" width="15" fill="currentColor">
        <path
          d="M0 5l4 4L12 0"
          strokeWidth="1.8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {anyDelivered && (
          <path
            d="M4 5l4 4L16 0"
            strokeWidth="1.8"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
    </span>
  )
}

function ThreeDotIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <circle cx="7.5" cy="2.5" r="1.5" />
      <circle cx="7.5" cy="7.5" r="1.5" />
      <circle cx="7.5" cy="12.5" r="1.5" />
    </svg>
  )
}

export default function MessageBubble({
  message,
  isOwn,
  currentUserId,
  highlighted,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onReact,
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [menuStyle, setMenuStyle] = useState({})
  const menuRef = useRef(null)
  const dotBtnRef = useRef(null)
  const editRef = useRef(null)

  const isDeleted = message.is_deleted
  const isImage =
    message.type === 'image' ||
    (message.type === 'file' && isImageFile(message.file_name))

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      const clickedMenu = menuRef.current && menuRef.current.contains(e.target)
      const clickedBtn = dotBtnRef.current && dotBtnRef.current.contains(e.target)
      if (!clickedMenu && !clickedBtn) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const openMenu = (e) => {
    e.stopPropagation()
    if (!menuOpen && dotBtnRef.current) {
      const rect = dotBtnRef.current.getBoundingClientRect()
      // Approx height: emoji bar (56) + 2 base items (72) + own items (88) = ~216 max
      const menuHeight = isOwn ? 160 : 216
      const spaceBelow = window.innerHeight - rect.bottom - 4
      const openUp = spaceBelow < menuHeight && rect.top > menuHeight

      setMenuStyle({
        position: 'fixed',
        zIndex: 9999,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        ...(isOwn
          ? { right: window.innerWidth - rect.right }
          : { left: rect.left }),
      })
    }
    setMenuOpen((v) => !v)
  }

  const startEdit = () => {
    setEditText(message.content ?? '')
    setIsEditing(true)
    setMenuOpen(false)
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditText('')
  }

  const submitEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== message.content) {
      onEdit?.(message.id, trimmed)
    }
    cancelEdit()
  }

  const handleEditKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitEdit()
    }
    if (e.key === 'Escape') cancelEdit()
  }

  const reactions = message.reactions || []
  const reactionGroups = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1
    return acc
  }, {})

  const minutesSinceSent = (Date.now() - new Date(message.created_at).getTime()) / 60000
  const canEdit = isOwn && !isDeleted && minutesSinceSent <= 10
  const canDelete = isOwn && !isDeleted && minutesSinceSent <= 30

  const showMenuTrigger = (hovered || menuOpen) && !isDeleted

  const dropdownMenu =
    menuOpen &&
    ReactDOM.createPortal(
      <div
        ref={menuRef}
        className="bg-cn-white rounded-xl py-1 min-w-[160px] animate-cn-fade-up"
        style={{
          ...menuStyle,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          border: '1px solid var(--cn-gray-200)',
        }}
      >
        {!isOwn && (
          <>
            <div className="flex items-center justify-around px-2 py-2">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact?.(message.id, emoji)
                    setMenuOpen(false)
                  }}
                  className="text-xl hover:scale-125 transition-transform duration-100 leading-none p-0.5"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="border-t border-cn-gray-100 mb-1" />
          </>
        )}

        <button
          onClick={() => {
            onReply?.(message)
            setMenuOpen(false)
          }}
          className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
        >
          <span>↩</span> Reply
        </button>

        <button
          onClick={() => {
            onForward?.(message)
            setMenuOpen(false)
          }}
          className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
        >
          <span>↪</span> Forward
        </button>

        {(canEdit || canDelete) && (
          <>
            <div className="border-t border-cn-gray-100 my-1" />
            {canEdit && (
              <button
                onClick={startEdit}
                className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
                title="Edit (available for 10 min after sending)"
              >
                <span>✏️</span> Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  onDelete?.(message.id)
                  setMenuOpen(false)
                }}
                className="w-full text-left px-4 py-2 text-sm flex items-center gap-2"
                style={{ color: 'var(--cn-danger)' }}
                title="Delete (available for 30 min after sending)"
                onMouseEnter={(e) => (e.currentTarget.style.background = '#fff1f1')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <span>🗑️</span> Delete
              </button>
            )}
          </>
        )}
      </div>,
      document.body
    )

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex gap-2 mb-3 transition-all duration-700 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${
        isOwn ? 'animate-cn-slide-in-right' : 'animate-cn-slide-in-left'
      } ${highlighted ? 'ring-2 ring-cn-blue ring-offset-4 rounded-xl bg-cn-blue/5' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isOwn && <UserAvatar user={message.sender} size="sm" />}

      <div
        className={`max-w-[85%] sm:max-w-[70%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}
      >
        {!isOwn && (
          <span
            className="text-xs font-bold ml-1"
            style={{
              background: 'linear-gradient(90deg, #CC3333, #3399CC)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {message.sender?.display_name || message.sender?.full_name}
          </span>
        )}

        {message.reply_to && !isDeleted && (
          <div
            className={`px-3 py-1.5 text-xs mb-1 max-w-full truncate rounded-xl ${
              isOwn ? 'text-white/75' : 'text-cn-gray-600'
            }`}
            style={
              isOwn
                ? { background: 'rgba(0,0,0,0.2)', borderLeft: '2px solid rgba(255,255,255,0.5)' }
                : { background: 'var(--cn-gray-100)', borderLeft: '2px solid var(--cn-blue)' }
            }
          >
            {message.reply_to.content ?? `[${message.reply_to.type}]`}
          </div>
        )}

        <div
          className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {message.type === 'voice' && message.file_url && !isDeleted ? (
            <div
              className={`rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} px-3 py-2`}
              style={
                isOwn
                  ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
                  : { background: 'var(--cn-white)', border: '1.5px solid var(--cn-gray-200)', boxShadow: 'var(--shadow-card)' }
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{isOwn ? '🎙' : '🎙'}</span>
                <span className={`text-xs font-semibold ${isOwn ? 'text-white/80' : 'text-cn-gray-500'}`}>Voice message</span>
              </div>
              <audio
                controls
                src={message.file_url}
                className="w-full max-w-[240px] h-8"
                style={{ accentColor: isOwn ? '#fff' : 'var(--cn-blue)' }}
              />
            </div>
          ) : isImage && !isDeleted ? (
            <>
              <div
                className={`rounded-2xl overflow-hidden cursor-pointer transition-transform duration-150 hover:scale-[1.02] ${
                  isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'
                }`}
                style={{
                  boxShadow: isOwn
                    ? '0 4px 14px rgba(204,51,51,0.35)'
                    : 'var(--shadow-card)',
                }}
                onClick={() => setLightboxOpen(true)}
              >
                <img
                  src={message.file_url}
                  alt={message.file_name}
                  className="block max-w-[240px] max-h-[200px] w-full object-cover"
                  loading="lazy"
                />
              </div>
              {lightboxOpen && (
                <ImageLightbox
                  src={message.file_url}
                  alt={message.file_name}
                  onClose={() => setLightboxOpen(false)}
                />
              )}
            </>
          ) : isEditing ? (
            <div
              className={`rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} p-3 min-w-[180px]`}
              style={
                isOwn
                  ? {
                      background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)',
                      boxShadow: '0 4px 14px rgba(204,51,51,0.35)',
                    }
                  : {
                      background: 'var(--cn-white)',
                      border: '1.5px solid var(--cn-gray-200)',
                      boxShadow: 'var(--shadow-card)',
                    }
              }
            >
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKey}
                rows={2}
                className={`w-full resize-none bg-transparent text-sm outline-none ${
                  isOwn ? 'text-white placeholder-white/50' : 'text-cn-gray-800'
                }`}
              />
              <div
                className={`flex gap-2 mt-1 text-xs ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <button
                  onClick={cancelEdit}
                  className={`px-2 py-0.5 rounded ${
                    isOwn
                      ? 'text-white/70 hover:text-white'
                      : 'text-cn-gray-400 hover:text-cn-gray-600'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={submitEdit}
                  className={`px-2 py-0.5 rounded font-semibold ${
                    isOwn
                      ? 'text-white hover:bg-white/20'
                      : 'text-cn-blue hover:bg-cn-blue/10'
                  }`}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`px-4 py-2.5 text-sm break-words transition-transform duration-150 hover:scale-[1.02] ${
                isOwn
                  ? 'text-white rounded-2xl rounded-br-sm'
                  : 'text-cn-gray-800 rounded-2xl rounded-bl-sm'
              } ${isDeleted ? 'italic opacity-50' : ''}`}
              style={
                isOwn
                  ? {
                      background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)',
                      boxShadow: '0 4px 14px rgba(204,51,51,0.35)',
                    }
                  : {
                      background: 'var(--cn-white)',
                      border: '1.5px solid var(--cn-gray-200)',
                      boxShadow: 'var(--shadow-card)',
                    }
              }
            >
              {message.type === 'file' && !isDeleted ? (
                <a
                  href={message.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 min-w-[110px]"
                >
                  <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-0.5 ${isOwn ? 'bg-white/20' : 'bg-cn-gray-100'}`}>
                    <DocumentIcon className={`w-7 h-7 ${isOwn ? 'text-white' : 'text-cn-blue'}`} />
                    <span className={`text-[9px] font-bold uppercase tracking-wide ${isOwn ? 'text-white/60' : 'text-cn-gray-500'}`}>
                      {message.file_name?.split('.').pop()?.slice(0, 4) || 'FILE'}
                    </span>
                  </div>
                  <p className={`text-xs font-medium text-center leading-tight max-w-[150px] truncate ${isOwn ? 'text-white/90' : 'text-cn-gray-800'}`}>
                    {message.file_name}
                  </p>
                  {message.file_size > 0 && (
                    <p className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-cn-gray-400'}`}>
                      {formatFileSize(message.file_size)}
                    </p>
                  )}
                </a>
              ) : (
                message.content
              )}
            </div>
          )}

          {/* Three-dot trigger — dropdown rendered via portal to avoid overflow clipping */}
          <div className="self-center flex-shrink-0">
            <button
              ref={dotBtnRef}
              onClick={openMenu}
              className="p-1 rounded-full transition-fast"
              style={{
                color: showMenuTrigger ? 'var(--cn-gray-400)' : 'transparent',
                pointerEvents: showMenuTrigger ? 'auto' : 'none',
              }}
              title="Message options"
            >
              <ThreeDotIcon />
            </button>
            {dropdownMenu}
          </div>
        </div>

        {Object.keys(reactionGroups).length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-0.5 max-w-full ${isOwn ? 'justify-end' : 'justify-start'}`}
          >
            {Object.entries(reactionGroups).map(([emoji, count]) => (
              <span
                key={emoji}
                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-cn-white border border-cn-gray-200"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {emoji}
                {count > 1 && <span className="text-cn-gray-400 ml-0.5">{count}</span>}
              </span>
            ))}
          </div>
        )}

        <span className="text-xs flex items-center gap-0.5 text-cn-gray-400 px-1">
          {dayjs(message.created_at).format('HH:mm')}
          {message.is_edited && !isDeleted && (
            <span className="ml-1 opacity-60">(edited)</span>
          )}
          {isOwn && (
            <ReceiptTicks receipts={message.receipts} currentUserId={currentUserId} />
          )}
        </span>
      </div>
    </div>
  )
}
