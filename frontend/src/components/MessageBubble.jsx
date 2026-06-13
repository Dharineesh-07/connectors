import { memo, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import dayjs from 'dayjs'
import { DocumentIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import ImageLightbox from './ImageLightbox'
import LinkPreviewCard, { extractURLs } from './LinkPreviewCard'
import PollMessage from './PollMessage'
import MarkdownContent from './MarkdownContent'

function formatFileSize(bytes) {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])
const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡']

function getFrequentEmojis() {
  try {
    const raw = localStorage.getItem('orgchat-reaction-history')
    if (!raw) return DEFAULT_REACTION_EMOJIS
    const counts = JSON.parse(raw)
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([emoji]) => emoji)
    return [...new Set([...sorted, ...DEFAULT_REACTION_EMOJIS])].slice(0, 6)
  } catch {
    return DEFAULT_REACTION_EMOJIS
  }
}

function trackReactionUse(emoji) {
  try {
    const raw = localStorage.getItem('orgchat-reaction-history')
    const counts = raw ? JSON.parse(raw) : {}
    counts[emoji] = (counts[emoji] || 0) + 1
    localStorage.setItem('orgchat-reaction-history', JSON.stringify(counts))
  } catch {}
}

function isImageFile(fileName) {
  if (!fileName) return false
  const ext = fileName.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="white" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}>
      <path d="M12 1C9.24 1 7 3.24 7 6v1H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2V6c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v1H9V6c0-1.66 1.34-3 3-3zm0 9a2 2 0 110 4 2 2 0 010-4z"/>
    </svg>
  )
}

function ExpiredImageBubble({ message, isOwn, onOpen }) {
  const thumb = message.file_thumbnail
  return (
    <div
      className={`relative rounded-2xl overflow-hidden cursor-pointer ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
      style={{ width: 220, height: 160, boxShadow: isOwn ? '0 4px 14px rgba(204,51,51,0.35)' : 'var(--shadow-card)' }}
      onClick={onOpen}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'blur(12px) brightness(0.6)', transform: 'scale(1.1)' }}
        />
      ) : (
        <div className="w-full h-full" style={{ background: '#444' }} />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <LockIcon />
        <span className="text-white text-[11px] font-semibold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
          Photo expired
        </span>
      </div>
    </div>
  )
}

function ExpiredFileBubble({ message, isOwn, onOpen }) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 flex flex-col items-center gap-1.5 min-w-[160px] cursor-pointer ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
      style={{
        ...(isOwn
          ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
          : { background: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-400)', boxShadow: 'var(--shadow-card)' }),
        opacity: 0.75,
      }}
      onClick={onOpen}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isOwn ? 'bg-white/15' : 'bg-cn-gray-300'}`}>
        <LockIcon />
      </div>
      <p className={`text-xs font-semibold text-center ${isOwn ? 'text-white/80' : 'text-cn-gray-600'}`}>
        {message.file_name || 'File'} expired
      </p>
    </div>
  )
}

function ExpiredModal({ message, isOwn, senderName, onClose, onAskResend }) {
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center z-50 pb-8 px-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-cn-white rounded-2xl p-5 w-full max-w-sm flex flex-col items-center gap-3"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-3xl">{message.type === 'image' ? '🖼️' : '📄'}</span>
        <p className="text-sm font-semibold text-cn-gray-800 text-center">
          This {message.type === 'image' ? 'photo' : 'file'} is no longer available
        </p>
        <p className="text-xs text-cn-gray-500 text-center leading-relaxed">
          {isOwn
            ? 'You sent this file. It has expired and can no longer be downloaded.'
            : `Ask ${senderName} to resend it.`}
        </p>
        {!isOwn && (
          <button
            onClick={() => { onAskResend?.(); onClose() }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)' }}
          >
            Ask to Resend
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl text-sm text-cn-gray-500 hover:bg-cn-gray-100"
        >
          Dismiss
        </button>
      </div>
    </div>,
    document.body
  )
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


function highlightMentions(text) {
  if (!text) return text
  const parts = text.split(/(@here|@channel)/g)
  return parts.map((part, i) =>
    part === '@here' || part === '@channel'
      ? <span key={i} style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderRadius: 4, padding: '1px 4px', fontWeight: 700 }}>{part}</span>
      : part
  )
}

function MessageBubble({
  message,
  isOwn,
  currentUserId,
  highlighted,
  isPending,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onReact,
  onOpenThread,
  onPin,
  isPinned,
  onCreateTask,
  conversationMembers,
  onPollUpdate,
  decrypt,
  onAskResend,
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [resendModalOpen, setResendModalOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [menuStyle, setMenuStyle] = useState({})
  const [decryptedContent, setDecryptedContent] = useState(null)
  const menuRef = useRef(null)
  const dotBtnRef = useRef(null)
  const editRef = useRef(null)

  // Decrypt content if this is an E2EE message
  useEffect(() => {
    if (!message.is_encrypted || !decrypt || !message.content) {
      setDecryptedContent(null)
      return
    }
    decrypt(message.content).then(setDecryptedContent).catch(() => setDecryptedContent('[Decryption failed]'))
  }, [message.id, message.is_encrypted, message.content, decrypt])

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
      const menuHeight = isOwn ? 176 : 232
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
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, users: [] }
    acc[r.emoji].count++
    const name = r.user?.display_name || r.user?.full_name || 'Someone'
    acc[r.emoji].users.push(name)
    return acc
  }, {})

  const minutesSinceSent = (Date.now() - new Date(message.created_at).getTime()) / 60000
  const canEdit = isOwn && !isDeleted && minutesSinceSent <= 10
  const canDelete = isOwn && !isDeleted && minutesSinceSent <= 30

  const showActions = (hovered || menuOpen) && !isDeleted && !isPending

  const dropdownMenu =
    menuOpen &&
    ReactDOM.createPortal(
      <div
        ref={menuRef}
        className="bg-cn-white rounded-xl py-1 min-w-[170px] animate-cn-fade-up"
        style={{
          ...menuStyle,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          border: '1px solid var(--cn-gray-200)',
        }}
      >
        {!isOwn && (
          <>
            <div className="flex items-center justify-around px-2 py-2">
              {getFrequentEmojis().map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact?.(message.id, emoji)
                    trackReactionUse(emoji)
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
            onOpenThread?.(message)
            setMenuOpen(false)
          }}
          className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
            <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd" />
          </svg>
          Reply in thread
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

        <button
          onClick={() => {
            onPin?.(message, isPinned)
            setMenuOpen(false)
          }}
          className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
        >
          <span>📌</span> {isPinned ? 'Unpin' : 'Pin'}
        </button>

        {!isDeleted && message.type === 'text' && (
          <button
            onClick={() => {
              onCreateTask?.(message)
              setMenuOpen(false)
            }}
            className="w-full text-left px-4 py-2 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
          >
            <span>✅</span> Create Task
          </button>
        )}

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
            className={`px-3 py-1.5 text-xs mb-1 max-w-full rounded-xl overflow-hidden ${
              isOwn ? '' : 'text-cn-gray-600'
            }`}
            style={
              isOwn
                ? { background: 'rgba(0,0,0,0.2)', borderLeft: '2px solid rgba(255,255,255,0.5)' }
                : { background: 'var(--cn-gray-100)', borderLeft: '2px solid var(--cn-blue)' }
            }
          >
            <p
              className="font-semibold truncate"
              style={{ color: isOwn ? 'rgba(255,255,255,0.9)' : 'var(--cn-blue)' }}
            >
              ↩ {message.reply_to.sender?.display_name || message.reply_to.sender?.full_name || 'Unknown'}
            </p>
            <p className={`truncate mt-0.5 ${isOwn ? 'text-white/60' : 'text-cn-gray-500'}`}>
              {message.reply_to.content ?? `[${message.reply_to.type}]`}
            </p>
          </div>
        )}

        <div className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          {message.type === 'poll' && message.poll && !isDeleted ? (
            <PollMessage poll={message.poll} isOwn={isOwn} onPollUpdate={onPollUpdate} />
          ) : message.type === 'voice' && message.file_url && !isDeleted ? (
            <div
              className={`rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} px-3 py-2`}
              style={
                isOwn
                  ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
                  : { background: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-400)', boxShadow: 'var(--shadow-card)' }
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🎙</span>
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
            message.file_expired ? (
              <>
                <ExpiredImageBubble message={message} isOwn={isOwn} onOpen={() => setResendModalOpen(true)} />
                {resendModalOpen && (
                  <ExpiredModal
                    message={message}
                    isOwn={isOwn}
                    senderName={message.sender?.display_name || message.sender?.full_name}
                    onClose={() => setResendModalOpen(false)}
                    onAskResend={() => onAskResend?.(message)}
                  />
                )}
              </>
            ) : (
              <>
                <div
                  className={`rounded-2xl overflow-hidden cursor-pointer transition-transform duration-150 hover:scale-[1.02] ${
                    isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'
                  }`}
                  style={{ boxShadow: isOwn ? '0 4px 14px rgba(204,51,51,0.35)' : 'var(--shadow-card)' }}
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
            )
          ) : isEditing ? (
            <div
              className={`rounded-2xl ${isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'} p-3 min-w-[180px]`}
              style={
                isOwn
                  ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
                  : { background: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-400)', boxShadow: 'var(--shadow-card)' }
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
              <div className={`flex gap-2 mt-1 text-xs ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <button
                  onClick={cancelEdit}
                  className={`px-2 py-0.5 rounded ${isOwn ? 'text-white/70 hover:text-white' : 'text-cn-gray-400 hover:text-cn-gray-600'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={submitEdit}
                  className={`px-2 py-0.5 rounded font-semibold ${isOwn ? 'text-white hover:bg-white/20' : 'text-cn-blue hover:bg-cn-blue/10'}`}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`px-4 py-2.5 break-words transition-transform duration-150 hover:scale-[1.02] min-w-[80px] ${
                isOwn ? 'text-white rounded-2xl rounded-br-sm' : 'text-cn-gray-800 rounded-2xl rounded-bl-sm'
              } ${isDeleted ? 'italic opacity-50' : ''}`}
              style={{
                ...(isOwn
                  ? { background: 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)', boxShadow: '0 4px 14px rgba(204,51,51,0.35)' }
                  : { background: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-400)', boxShadow: 'var(--shadow-card)' }
                ),
                fontSize: 'var(--msg-font-size)',
              }}
            >
              {message.type === 'file' && !isDeleted ? (
                message.file_expired ? (
                  <>
                    <ExpiredFileBubble message={message} isOwn={isOwn} onOpen={() => setResendModalOpen(true)} />
                    {resendModalOpen && (
                      <ExpiredModal
                        message={message}
                        isOwn={isOwn}
                        senderName={message.sender?.display_name || message.sender?.full_name}
                        onClose={() => setResendModalOpen(false)}
                        onAskResend={() => onAskResend?.(message)}
                      />
                    )}
                  </>
                ) : (
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
                )
              ) : (
                <div className="flex items-start gap-1.5">
                  {message.is_encrypted && (
                    <LockClosedIcon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${isOwn ? 'text-white/50' : 'text-cn-gray-400'}`} />
                  )}
                  <MarkdownContent text={decryptedContent ?? message.content} isOwn={isOwn} />
                </div>
              )}
            </div>
          )}

          {/* Hover actions */}
          <div className={`self-center flex-shrink-0 flex gap-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Three-dot menu */}
            <button
              ref={dotBtnRef}
              onClick={openMenu}
              className="p-1 rounded-full transition-fast"
              style={{
                color: showActions ? 'var(--cn-gray-400)' : 'transparent',
                pointerEvents: showActions ? 'auto' : 'none',
              }}
            >
              <ThreeDotIcon />
            </button>
            {dropdownMenu}
          </div>
        </div>

        {message.type === 'text' && !isDeleted && extractURLs(message.content).map((url) => (
          <LinkPreviewCard key={url} url={url} />
        ))}

        {Object.keys(reactionGroups).length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-0.5 max-w-full ${isOwn ? 'justify-end' : 'justify-start'}`}
          >
            {Object.entries(reactionGroups).map(([emoji, { count, users }]) => (
              <button
                key={emoji}
                onClick={() => onReact?.(message.id, emoji)}
                title={users.join(', ')}
                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-cn-white border border-cn-gray-200 hover:bg-cn-blue-light hover:border-cn-blue transition-fast"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {emoji}
                {count > 1 && <span className="text-cn-gray-400 ml-0.5">{count}</span>}
              </button>
            ))}
          </div>
        )}

        <span className="text-xs flex items-center gap-0.5 text-cn-gray-400 px-1">
          {message.is_encrypted && !isPending && (
            <LockClosedIcon className="w-2.5 h-2.5 text-cn-blue" title="End-to-end encrypted" />
          )}
          {isPending ? (
            <span title="Sending…" style={{ opacity: 0.5, fontSize: 11 }}>⏱</span>
          ) : (
            <>
              {dayjs(message.created_at).format('HH:mm')}
              {message.is_edited && !isDeleted && (
                <span className="ml-1 opacity-60">(edited)</span>
              )}
              {isOwn && (
                <ReceiptTicks receipts={message.receipts} currentUserId={currentUserId} />
              )}
            </>
          )}
        </span>

        {!isDeleted && (message.reply_count ?? message.thread_replies?.length) > 0 && (
          <button
            onClick={() => onOpenThread?.(message)}
            className="flex items-center gap-1 text-xs px-1 mt-0.5 transition-colors duration-150"
            style={{ color: 'var(--cn-blue)' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd" />
            </svg>
            {(message.reply_count ?? message.thread_replies?.length)} {(message.reply_count ?? message.thread_replies?.length) === 1 ? 'reply' : 'replies'}
          </button>
        )}

      </div>
    </div>
  )
}

export default memo(MessageBubble)
