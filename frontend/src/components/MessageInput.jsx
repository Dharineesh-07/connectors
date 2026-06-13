import { useRef, useState } from 'react'
import {
  PaperAirplaneIcon,
  PaperClipIcon,
  FaceSmileIcon,
  XMarkIcon,
  MicrophoneIcon,
  StopIcon,
  ClockIcon,
  ChartBarIcon,
  PencilSquareIcon,
  PlusIcon,
  LinkIcon,
  ListBulletIcon,
  QueueListIcon,
  CodeBracketIcon,
  ArrowUturnLeftIcon,
  AtSymbolIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import EmojiPicker from 'emoji-picker-react'
import { useTheme } from '../context/ThemeContext'
import ScribblePad from './ScribblePad'

const MENTION_SUGGESTIONS = [
  { token: '@here', label: '@here', description: 'Notify all online members' },
  { token: '@channel', label: '@channel', description: 'Notify all members' },
]

export default function MessageInput({
  onSend,
  onFileUpload,
  onVoiceMessage,
  onTyping,
  onSchedule,
  onCreatePoll,
  disabled,
  replyMessage,
  onCancelReply,
  e2eeActive,
  e2eeReady,
  isFullscreen,
}) {
  const { theme } = useTheme()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [showScribble, setShowScribble] = useState(false)
  const fileRef = useRef(null)
  const imageRef = useRef(null)
  const typingTimer = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const textareaRef = useRef(null)

  const checkMentions = (value) => {
    const atIdx = value.lastIndexOf('@')
    if (atIdx === -1) { setMentionSuggestions([]); return }
    const partial = value.slice(atIdx)
    if (partial.includes(' ') || partial.length > 10) { setMentionSuggestions([]); return }
    const filtered = MENTION_SUGGESTIONS.filter((s) =>
      s.token.startsWith(partial.toLowerCase())
    )
    setMentionSuggestions(filtered)
    setActiveSuggestion(0)
  }

  const insertSuggestion = (suggestion) => {
    const atIdx = text.lastIndexOf('@')
    const newText = text.slice(0, atIdx) + suggestion.token + ' '
    setText(newText)
    setMentionSuggestions([])
    textareaRef.current?.focus()
  }

  const handleChange = (e) => {
    const value = e.target.value
    setText(value)
    checkMentions(value)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    onTyping?.(true)
    typingTimer.current = setTimeout(() => onTyping?.(false), 2000)
  }

  const handleKey = (e) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestion((v) => (v + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestion((v) => (v - 1 + mentionSuggestions.length) % mentionSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertSuggestion(mentionSuggestions[activeSuggestion])
        return
      }
      if (e.key === 'Escape') {
        setMentionSuggestions([])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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

  const handleScribbleSend = async (file) => {
    await onFileUpload?.(file)
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
    if (recording) stopRecording()
    else startRecording()
  }

  const formatRecordTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // Formatting helpers — operate on the shared textareaRef
  const wrapText = (before, after = before) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    const newVal = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e)
    setText(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, e + before.length)
    })
  }

  const insertLinePrefix = (prefix) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, value } = ta
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    setText(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + prefix.length, s + prefix.length)
    })
  }

  const handleInsertLink = () => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    const sel = value.slice(s, e) || 'link text'
    const url = window.prompt('Enter URL:', 'https://')
    if (!url) return
    const md = `[${sel}](${url})`
    setText(value.slice(0, s) + md + value.slice(e))
    requestAnimationFrame(() => { ta.focus() })
  }

  const handleInsertAt = () => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, value } = ta
    const newVal = value.slice(0, s) + '@' + value.slice(s)
    setText(newVal)
    checkMentions(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + 1, s + 1)
    })
  }

  const handleUndo = () => {
    textareaRef.current?.focus()
    document.execCommand('undo')
  }

  const hasText = text.trim().length > 0
  const isDisabled = disabled || (e2eeActive && !e2eeReady)

  return (
    <div className="relative bg-cn-white border-t border-cn-gray-200" style={{ padding: isFullscreen ? '0' : undefined }}>
      {/* E2EE status banner */}
      {e2eeActive && !isFullscreen && (
        <div
          className="flex items-center justify-center gap-1.5 mx-4 mt-3 mb-1 text-[10px] font-semibold rounded-full py-1"
          style={{
            background: e2eeReady ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
            color: e2eeReady ? '#16a34a' : '#d97706',
          }}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {e2eeReady ? 'End-to-end encrypted' : 'Setting up encryption…'}
        </div>
      )}

      {/* ── FULLSCREEN LAYOUT ─────────────────────────────────── */}
      {isFullscreen ? (
        <>
          {/* Formatting toolbar */}
          <div className="flex items-center gap-0.5 px-4 py-2 border-b border-cn-gray-100">
            {[
              { label: 'B', title: 'Bold', cls: 'font-bold', action: () => wrapText('**') },
              { label: 'I', title: 'Italic', cls: 'italic', action: () => wrapText('*') },
              { label: 'U', title: 'Underline', cls: 'underline', action: () => wrapText('<u>', '</u>') },
              { label: 'S', title: 'Strikethrough', cls: 'line-through', action: () => wrapText('~~') },
            ].map(({ label, title, cls, action }) => (
              <button
                key={label}
                onClick={action}
                title={title}
                disabled={isDisabled}
                className={`w-8 h-8 flex items-center justify-center text-sm text-cn-gray-600 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40 ${cls}`}
              >
                {label}
              </button>
            ))}
            <div className="w-px h-5 bg-cn-gray-200 mx-1.5 flex-shrink-0" />
            <button onClick={handleInsertLink} title="Insert link" disabled={isDisabled}
              className="w-8 h-8 flex items-center justify-center text-cn-gray-500 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40">
              <LinkIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-cn-gray-200 mx-1.5 flex-shrink-0" />
            <button onClick={() => insertLinePrefix('- ')} title="Bullet list" disabled={isDisabled}
              className="w-8 h-8 flex items-center justify-center text-cn-gray-500 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40">
              <ListBulletIcon className="w-4 h-4" />
            </button>
            <button onClick={() => insertLinePrefix('1. ')} title="Numbered list" disabled={isDisabled}
              className="w-8 h-8 flex items-center justify-center text-cn-gray-500 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40">
              <QueueListIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-cn-gray-200 mx-1.5 flex-shrink-0" />
            <button onClick={() => wrapText('`')} title="Inline code" disabled={isDisabled}
              className="w-8 h-8 flex items-center justify-center text-cn-gray-500 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40">
              <CodeBracketIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-cn-gray-200 mx-1.5 flex-shrink-0" />
            <button onClick={handleUndo} title="Undo" disabled={isDisabled}
              className="w-8 h-8 flex items-center justify-center text-cn-gray-500 hover:bg-cn-gray-100 hover:text-cn-gray-900 rounded transition-fast disabled:opacity-40">
              <ArrowUturnLeftIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Reply bar */}
          {replyMessage && (
            <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 rounded-lg bg-cn-gray-100 border border-cn-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--cn-blue)' }}>
                  ↩ {replyMessage.sender?.display_name || replyMessage.sender?.full_name}
                </p>
                <p className="text-xs text-cn-gray-500 truncate mt-0.5">{replyMessage.content}</p>
              </div>
              <button onClick={onCancelReply} className="flex-shrink-0 p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Textarea */}
          <div className="relative px-4 pt-2 pb-1">
            {mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full mb-1 left-4 w-72 bg-cn-white rounded-xl shadow-xl border border-cn-gray-200 overflow-hidden z-20 animate-cn-fade-up">
                {mentionSuggestions.map((s, i) => (
                  <button
                    key={s.token}
                    onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s) }}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all ${
                      i === activeSuggestion ? 'bg-cn-blue-light' : 'hover:bg-cn-gray-50'
                    }`}
                  >
                    <span className="text-base font-black text-cn-blue">{s.label}</span>
                    <span className="text-xs text-cn-gray-400">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              rows={4}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKey}
              placeholder={e2eeActive && !e2eeReady ? 'Setting up encryption…' : 'Type a message…'}
              disabled={isDisabled}
              className="w-full resize-none focus:outline-none text-sm text-cn-gray-800 placeholder-cn-gray-400 bg-transparent leading-relaxed"
            />
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center gap-1 px-4 py-2.5 border-t border-cn-gray-100">
            <button onClick={() => fileRef.current?.click()} disabled={isDisabled || uploading} title="Attach file"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50">
              <PlusIcon className="w-5 h-5" />
            </button>
            <button onClick={() => wrapText('**')} disabled={isDisabled} title="Bold"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50 text-sm font-semibold select-none">
              Aa
            </button>
            <div className="relative">
              <button onClick={() => setShowEmoji((v) => !v)} disabled={isDisabled} title="Emoji"
                className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50">
                <FaceSmileIcon className="w-5 h-5" />
              </button>
              {showEmoji && (
                <div className="absolute bottom-full left-0 mb-2 z-10 animate-cn-fade-up">
                  <EmojiPicker
                    onEmojiClick={(e) => { setText((t) => t + e.emoji); setShowEmoji(false) }}
                    theme={theme} height={300} width={280} previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
            <button onClick={handleInsertAt} disabled={isDisabled} title="Mention"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50">
              <AtSymbolIcon className="w-5 h-5" />
            </button>
            <button onClick={() => imageRef.current?.click()} disabled={isDisabled || uploading} title="Upload image"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50">
              <PhotoIcon className="w-5 h-5" />
            </button>
            <button onClick={handleVoiceToggle} disabled={isDisabled} title={recording ? 'Stop recording' : 'Record voice message'}
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue rounded-lg transition-fast disabled:opacity-50"
              style={recording ? { color: 'var(--cn-red)' } : {}}>
              {recording ? <StopIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
            </button>
            {recording && (
              <span className="text-xs font-semibold ml-1" style={{ color: 'var(--cn-red)', minWidth: 36 }}>
                {formatRecordTime(recordingSeconds)}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSend}
              disabled={isDisabled || !hasText}
              style={{
                background: hasText ? 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' : undefined,
                boxShadow: hasText ? '0 4px 12px rgba(204,51,51,0.35)' : undefined,
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 disabled:bg-cn-gray-300 transition-fast"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        /* ── COMPACT LAYOUT ──────────────────────────────────── */
        <div className="px-4 py-3">
          {/* E2EE status banner (compact) */}
          {e2eeActive && (
            <div
              className="flex items-center justify-center gap-1.5 mb-2 text-[10px] font-semibold rounded-full py-1"
              style={{
                background: e2eeReady ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                color: e2eeReady ? '#16a34a' : '#d97706',
              }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {e2eeReady ? 'End-to-end encrypted' : 'Setting up encryption…'}
            </div>
          )}
          {/* Reply bar */}
          {replyMessage && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-cn-gray-100 border border-cn-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--cn-blue)' }}>
                  ↩ {replyMessage.sender?.display_name || replyMessage.sender?.full_name}
                </p>
                <p className="text-xs text-cn-gray-500 truncate mt-0.5">{replyMessage.content}</p>
              </div>
              <button onClick={onCancelReply} className="flex-shrink-0 p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={isDisabled || uploading}
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue transition-fast disabled:opacity-50 flex-shrink-0">
              <PaperClipIcon className="w-5 h-5" />
            </button>

            <button onClick={onSchedule} disabled={isDisabled} title="Schedule message"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue transition-fast disabled:opacity-50 flex-shrink-0">
              <ClockIcon className="w-5 h-5" />
            </button>

            <button onClick={() => setShowScribble(true)} disabled={isDisabled || uploading} title="Send a scribble"
              className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue transition-fast disabled:opacity-50 flex-shrink-0">
              <PencilSquareIcon className="w-5 h-5" />
            </button>

            {onCreatePoll && (
              <button onClick={onCreatePoll} disabled={isDisabled} title="Create poll"
                className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue transition-fast disabled:opacity-50 flex-shrink-0">
                <ChartBarIcon className="w-5 h-5" />
              </button>
            )}

            <div className="relative flex-shrink-0">
              <button onClick={() => setShowEmoji((v) => !v)} disabled={isDisabled}
                className="w-9 h-9 flex items-center justify-center text-cn-gray-400 hover:text-cn-blue transition-fast flex-shrink-0 disabled:opacity-50">
                <FaceSmileIcon className="w-5 h-5" />
              </button>
              {showEmoji && (
                <div className="absolute bottom-full left-0 mb-2 z-10 animate-cn-fade-up">
                  <EmojiPicker
                    onEmojiClick={(e) => setText((t) => t + e.emoji)}
                    theme={theme} height={300} width={280} previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>

            {/* Textarea + mention suggestions */}
            <div className="flex-1 relative">
              {mentionSuggestions.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 w-72 bg-cn-white rounded-xl shadow-xl border border-cn-gray-200 overflow-hidden z-20 animate-cn-fade-up">
                  {mentionSuggestions.map((s, i) => (
                    <button
                      key={s.token}
                      onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s) }}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all ${
                        i === activeSuggestion ? 'bg-cn-blue-light' : 'hover:bg-cn-gray-50'
                      }`}
                    >
                      <span className="text-base font-black text-cn-blue">{s.label}</span>
                      <span className="text-xs text-cn-gray-400">{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKey}
                placeholder={e2eeActive && !e2eeReady ? 'Setting up encryption…' : 'Type a message… (@here or @channel to notify)'}
                disabled={isDisabled}
                className="msg-input w-full resize-none border border-cn-gray-200 bg-cn-gray-100 text-cn-gray-800 placeholder-cn-gray-400 rounded-full px-4 py-2 text-sm leading-5 focus:outline-none focus:border-cn-blue min-h-[36px] max-h-32 overflow-x-hidden overflow-y-hidden transition-fast"
                onFocus={(e) => { e.target.style.borderColor = 'var(--cn-blue)' }}
                onBlur={(e) => { e.target.style.borderColor = '' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                }}
              />
            </div>

            {recording && (
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--cn-red)', minWidth: 36 }}>
                {formatRecordTime(recordingSeconds)}
              </span>
            )}

            {hasText ? (
              <button
                onClick={handleSend}
                disabled={isDisabled}
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
                disabled={isDisabled}
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
      )}

      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {showScribble && (
        <ScribblePad onSend={handleScribbleSend} onClose={() => setShowScribble(false)} />
      )}
    </div>
  )
}
