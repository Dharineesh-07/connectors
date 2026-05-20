import { useRef, useState } from 'react'
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  FaceSmileIcon,
  XMarkIcon,
  MicrophoneIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import EmojiPicker from 'emoji-picker-react'
import { useTheme } from '../context/ThemeContext'

export default function MessageInput({
  onSend,
  onFileUpload,
  onVoiceMessage,
  onTyping,
  disabled,
  replyMessage,
  onCancelReply,
}) {
  const { theme } = useTheme()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const fileRef = useRef(null)
  const typingTimer = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)

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

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecording(false)
        setRecordingSeconds(0)
        clearInterval(recordTimerRef.current)
        if (blob.size > 0) {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
          await onVoiceMessage?.(file)
        }
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordingSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch {
      // mic permission denied
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    clearInterval(recordTimerRef.current)
  }

  const handleVoiceToggle = () => {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const formatRecordTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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

        {/* Recording timer */}
        {recording && (
          <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--cn-red)', minWidth: 36 }}>
            {formatRecordTime(recordingSeconds)}
          </span>
        )}

        {/* Send / Mic button */}
        {hasText ? (
          <button
            onClick={handleSend}
            disabled={disabled}
            style={{
              background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
              boxShadow: '0 4px 12px rgba(204,51,51,0.35)',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(204,51,51,0.50)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(204,51,51,0.35)'
            }}
          >
            <PaperAirplaneIcon className="w-4 h-4 text-white" />
          </button>
        ) : (
          <button
            onClick={handleVoiceToggle}
            disabled={disabled}
            style={{
              background: recording
                ? 'var(--cn-red)'
                : 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
              boxShadow: recording
                ? '0 0 0 4px rgba(204,51,51,0.25)'
                : '0 4px 12px rgba(204,51,51,0.35)',
              transition: 'all 150ms ease',
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
            title={recording ? 'Stop recording' : 'Record voice message'}
          >
            {recording
              ? <StopIcon className="w-4 h-4 text-white" />
              : <MicrophoneIcon className="w-4 h-4 text-white" />}
          </button>
        )}
      </div>
    </div>
  )
}
