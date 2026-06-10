import { useEffect, useRef, useState } from 'react'
import { XMarkIcon, ArrowUturnLeftIcon, TrashIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'

const COLORS = ['#1f2937', '#CC3333', '#3399CC', '#16a34a', '#d97706', '#7c3aed', '#ffffff']
const SIZES = [2, 4, 8, 14]
const CANVAS_W = 520
const CANVAS_H = 340

// A quick doodle pad. Draws on a canvas and exports a PNG File via onSend.
export default function ScribblePad({ onSend, onClose }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)
  const historyRef = useRef([])
  const [color, setColor] = useState('#1f2937')
  const [size, setSize] = useState(4)
  const [isBlank, setIsBlank] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctxRef.current = ctx
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  const pushHistory = () => {
    const canvas = canvasRef.current
    historyRef.current.push(canvas.toDataURL())
    if (historyRef.current.length > 30) historyRef.current.shift()
  }

  const startDraw = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    pushHistory()
    drawingRef.current = true
    const pt = pointFromEvent(e)
    lastRef.current = pt
    // dot for a single tap
    const ctx = ctxRef.current
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = size
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2)
    ctx.fill()
    setIsBlank(false)
  }

  const moveDraw = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = ctxRef.current
    const pt = pointFromEvent(e)
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastRef.current = pt
  }

  const endDraw = () => { drawingRef.current = false }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    const img = new Image()
    img.onload = () => {
      const ctx = ctxRef.current
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
      setIsBlank(historyRef.current.length === 0)
    }
    img.src = prev
  }

  const clear = () => {
    pushHistory()
    const ctx = ctxRef.current
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    setIsBlank(true)
  }

  const discard = () => {
    // Throw the drawing away and close the pad without sending.
    if (!isBlank && !window.confirm('Discard this scribble?')) return
    onClose?.()
  }

  const send = () => {
    if (isBlank || sending) return
    setSending(true)
    canvasRef.current.toBlob((blob) => {
      if (!blob) { setSending(false); return }
      const file = new File([blob], `scribble-${Date.now()}.png`, { type: 'image/png' })
      Promise.resolve(onSend?.(file))
        .then(() => onClose?.())
        .catch(() => setSending(false))
    }, 'image/png')
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 animate-cn-fade-up"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="bg-cn-white rounded-2xl shadow-2xl border border-cn-gray-200 p-4 w-[560px] max-w-[94vw]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-cn-gray-800 flex items-center gap-2">
            <span>✏️</span> Scribble
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          style={{ width: '100%', aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, touchAction: 'none' }}
          className="rounded-xl border border-cn-gray-300 bg-white cursor-crosshair"
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderColor: c === '#ffffff' ? 'var(--cn-gray-300)' : c,
                  outline: color === c ? '2px solid var(--cn-blue)' : 'none',
                  outlineOffset: 2,
                }}
                title={c}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-fast ${
                  size === s ? 'bg-cn-blue-light' : 'hover:bg-cn-gray-100'
                }`}
                title={`${s}px`}
              >
                <span className="rounded-full bg-cn-gray-700 block" style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cn-gray-600 rounded-lg hover:bg-cn-gray-100 transition-fast"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" /> Undo
            </button>
            <button
              onClick={clear}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cn-gray-600 rounded-lg hover:bg-cn-gray-100 transition-fast"
            >
              <TrashIcon className="w-4 h-4" /> Clear
            </button>
            <button
              onClick={discard}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-fast"
              style={{ color: 'var(--cn-danger)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fff1f1')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <XMarkIcon className="w-4 h-4" /> Discard
            </button>
          </div>

          <button
            onClick={send}
            disabled={isBlank || sending}
            style={{
              background: isBlank || sending ? 'var(--cn-gray-300)' : 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)',
              boxShadow: isBlank || sending ? 'none' : '0 4px 12px rgba(204,51,51,0.35)',
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-full transition-fast disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="w-4 h-4" /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
