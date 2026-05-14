import { useRef, useState } from 'react'
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  FaceSmileIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import EmojiPicker from 'emoji-picker-react'
import { useTheme } from '../context/ThemeContext'

export default function MessageInput({
  onSend,
  onFileUpload,
  onTyping,
  disabled,
  replyMessage,
  onCancelReply,
}) {
  const { theme } = useTheme()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const typingTimer = useRef(null)

  const handleChange = (e) => {
    setText(e.target.value)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    onTyping?.(true)
    typingTimer.current = setTimeout(() => onTyping?.(false), 2000)
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend({
      content: trimmed,
      type: 'text',
      ...(replyMessage ? { reply_to_id: replyMessage.id } : {}),
    })
    setText('')
    setShowEmoji(false)
    onCancelReply?.()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await onFileUpload?.(file)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const hasText = text.trim().length > 0

  return (
    <div className="relative px-4 py-3 bg-cn-white border-t border-cn-gray-200">
      {/* Reply bar */}
      {replyMessage && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-cn-gray-100 border border-cn-gray-200">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'var(--cn-blue)' }}>
              ↩ {replyMessage.sender?.display_name || replyMessage.sender?.full_name}
            </p>
            <p className="text-xs text-cn-gray-500 truncate mt-0.5">{replyMessage.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="p-2 text-cn-gray-400 hover:text-cn-blue transition-fast disabled:opacity-50 flex-shrink-0"
        >
          <PaperClipIcon className="w-5 h-5" />
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />

        {/* Emoji toggle */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className="p-2 text-cn-gray-400 hover:text-cn-blue transition-fast flex-shrink-0"
          >
            <FaceSmileIcon className="w-5 h-5" />
          </button>

          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 z-10 animate-cn-fade-up">
              <EmojiPicker
                onEmojiClick={(e) => setText((t) => t + e.emoji)}
                theme={theme}
                height={300}
                width={280}
                previewConfig={{ showPreview: false }}
              />
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKey}
          placeholder="Type a message…"
          disabled={disabled}
          className="flex-1 resize-none border border-cn-gray-200 bg-cn-gray-100 text-cn-gray-800 placeholder-cn-gray-400 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-cn-blue min-h-[44px] max-h-32 overflow-y-auto transition-fast"
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--cn-blue)'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = ''
          }}
          onInput={(e) => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasText || disabled}
          style={
            hasText
              ? {
                  background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
                  boxShadow: '0 4px 12px rgba(204,51,51,0.35)',
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                }
              : {
                  background: 'var(--cn-gray-200)',
                  cursor: 'not-allowed',
                }
          }
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
          onMouseEnter={(e) => {
            if (hasText) {
              e.currentTarget.style.transform = 'scale(1.1)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(204,51,51,0.50)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = hasText
              ? '0 4px 12px rgba(204,51,51,0.35)'
              : 'none'
          }}
        >
          <PaperAirplaneIcon
            className="w-4 h-4"
            style={{ color: hasText ? '#fff' : 'var(--cn-gray-400)' }}
          />
        </button>
      </div>
    </div>
  )
}
