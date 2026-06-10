import { useCallback, useEffect, useRef, useState } from 'react'
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import ConfirmDialog from './ConfirmDialog'
import UserAvatar from './UserAvatar'
import { uploadFile, sendMessage } from '../api/messages'
import { listConversations } from '../api/conversations'
import { getWhiteboardDraft, saveWhiteboardDraft, publishWhiteboardDraft, deleteWhiteboardDraft, listWhiteboardDrafts, renameWhiteboardDraft } from '../api/whiteboard'

// ── Constants ────────────────────────────────────────────────────────────────
const PRESET_COLORS = ['#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff']
const SIZES         = [2, 5, 10, 20]
const FONT_SIZES    = { 2: 12, 5: 18, 10: 24, 20: 36 }
const NOTE_COLORS      = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa', '#99f6e4', '#c7d2fe', '#fce7f3', '#d9f99d', '#ffffff', '#f3f4f6']
const NOTE_TEXT_COLORS = ['#1a1a1a', '#ef4444', '#3b82f6', '#22c55e', '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#6366f1', '#eab308', '#0ea5e9', '#64748b']
const MAX_HISTORY   = 30
const LASER_MS      = 40
const GRID_CELLS    = 20   // grid divisions across canvas width/height
const SHAPE_TOOLS   = new Set(['rect', 'circle', 'arrow'])

const TOOLS = [
  { id: 'pen',    label: '✏ Pen' },
  { id: 'eraser', label: '◻ Erase' },
  { id: 'text',   label: 'T Text' },
  { id: 'rect',   label: '▭ Rect' },
  { id: 'circle', label: '◯ Circle' },
  { id: 'arrow',  label: '→ Arrow' },
  { id: 'note',   label: '📝 Note' },
  { id: 'laser',  label: '● Laser' },
]

// ── Pure draw helpers ─────────────────────────────────────────────────────────
function drawSegmentOnCtx(ctx, from, to, tool, color, size, w, h) {
  ctx.beginPath()
  ctx.moveTo(from.x * w, from.y * h)
  ctx.lineTo(to.x * w,   to.y * h)
  ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color
  ctx.lineWidth   = size
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  ctx.stroke()
}

function drawShapeOnCtx(ctx, type, from, to, color, size, w, h) {
  const x1 = from.x * w, y1 = from.y * h
  const x2 = to.x * w,   y2 = to.y * h
  ctx.strokeStyle = color
  ctx.lineWidth   = size
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  ctx.beginPath()
  if (type === 'rect') {
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
  } else if (type === 'circle') {
    const rx = Math.abs(x2 - x1) / 2 || 1, ry = Math.abs(y2 - y1) / 2 || 1
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (type === 'arrow') {
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const head  = Math.max(10, Math.min(24, size * 4))
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
  }
}

function drawTextOnCtx(ctx, x, y, text, color, fontSize, w, h) {
  ctx.font         = `${fontSize}px sans-serif`
  ctx.fillStyle    = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x * w, y * h)
}

function renderGridOnCanvas(gc, mode, w, h) {
  gc.width  = w
  gc.height = h
  const ctx = gc.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  if (!mode) return
  const cw = w / GRID_CELLS, ch = h / GRID_CELLS
  if (mode === 'grid') {
    ctx.strokeStyle = 'rgba(51,153,204,0.2)'
    ctx.lineWidth   = 1
    for (let i = 0; i <= GRID_CELLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * cw, 0);  ctx.lineTo(i * cw, h);  ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * ch); ctx.lineTo(w, i * ch); ctx.stroke()
    }
  } else {
    ctx.fillStyle = 'rgba(51,153,204,0.35)'
    for (let i = 0; i <= GRID_CELLS; i++)
      for (let j = 0; j <= GRID_CELLS; j++) {
        ctx.beginPath(); ctx.arc(i * cw, j * ch, 1.5, 0, Math.PI * 2); ctx.fill()
      }
  }
}

function formatAgo(from, now) {
  if (!from) return ''
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function WhiteboardPanel({ conversationId, onClose, fullPage = false }) {
  const { on, emit } = useSocket()
  const { user } = useAuth()

  // Canvas refs
  const canvasRef    = useRef(null)
  const ctxRef       = useRef(null)
  const gridCanvasRef = useRef(null)
  const displayRef   = useRef({ width: 1, height: 1 })
  const containerRef = useRef(null)   // the overflow:hidden wrapper

  // Drawing state refs
  const isDrawingRef     = useRef(false)
  const didDrawRef       = useRef(false)   // did this gesture actually draw anything? (vs a bare click)
  const lastPtRef        = useRef(null)
  const shapeStartRef    = useRef(null)
  const preShapeRef      = useRef(null)
  const laserDotRef      = useRef(null)
  const laserThrottleRef = useRef(0)

  // History
  const historyRef    = useRef([])
  const historyIdxRef = useRef(-1)

  // Stable refs for closures
  const toolRef      = useRef('pen')
  const colorRef     = useRef('#1a1a1a')
  const sizeRef      = useRef(5)
  const pageIdxRef   = useRef(0)
  const pagesRef     = useRef(null)
  const notesRef     = useRef([])
  const gridModeRef  = useRef(null)

  // Zoom / pan refs
  const zoomRef      = useRef(1)
  const panRef       = useRef({ x: 0, y: 0 })
  const isPanRef     = useRef(false)
  const panStartRef  = useRef(null)
  const spaceRef     = useRef(false)

  // Note drag ref
  const noteDragRef = useRef(null)

  // Cursor timers
  const cursorTimers = useRef({})

  // ── State ──────────────────────────────────────────────────────────────────
  const [tool,      setToolState]   = useState('pen')
  const [color,     setColorState]  = useState('#1a1a1a')
  const [size,      setSizeState]   = useState(5)
  const [canUndo,   setCanUndo]     = useState(false)
  const [canRedo,   setCanRedo]     = useState(false)
  const [pages,     setPages]       = useState(() => [{ id: crypto.randomUUID(), snapshot: null }])
  const [pageIdx,   setPageIdx]     = useState(0)
  const [notes,          setNotes]          = useState([])
  const [notePickerOpen, setNotePickerOpen] = useState(null)
  const [cursors,        setCursors]        = useState({})
  const [gridMode,  setGridModeState] = useState(null)   // null | 'grid' | 'dots'
  const [zoom,      setZoomState]   = useState(1)
  const [pan,       setPanState]    = useState({ x: 0, y: 0 })
  const [textInput, setTextInput]   = useState(null)     // { x, y } | null
  const [isDragOver, setIsDragOver] = useState(false)
  const [customColor, setCustomColorState] = useState('#ff6600')

  // Send-to-chat (forward) picker
  const [showForward,    setShowForward]    = useState(false)
  const [forwardConvs,   setForwardConvs]   = useState([])
  const [forwardSending, setForwardSending] = useState(null)  // id of conversation currently being sent to
  const [forwardQuery,   setForwardQuery]   = useState('')
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(false)
  const [confirmNewBoard,   setConfirmNewBoard]   = useState(false)
  const [showDraftsPanel,  setShowDraftsPanel]   = useState(false)
  const [allDrafts,        setAllDrafts]         = useState([])
  const [draftsLoading,    setDraftsLoading]     = useState(false)
  const [renamingDraftId,  setRenamingDraftId]   = useState(null)
  const [renameValue,      setRenameValue]       = useState('')

  // Draft persistence state
  const [draftId,     setDraftId]     = useState(null)
  const [boardName,   setBoardName]   = useState('')
  const boardNameRef                  = useRef('')
  const [editingName, setEditingName] = useState(false)
  const [draftStatus, setDraftStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'published'
  const [lastSavedAt, setLastSavedAt] = useState(null)   // server updated_at of last successful save
  const [nowTick,     setNowTick]     = useState(Date.now()) // re-renders the "… ago" label
  const [isDirty,     setIsDirty]     = useState(false)  // edits made since the last successful save
  const isDirtyRef        = useRef(false)
  const baseUpdatedAtRef  = useRef(null)  // updated_at we last saw — sent for conflict detection

  // Tick every 30s so the "last saved … ago" label stays current.
  useEffect(() => {
    if (!lastSavedAt) return
    const id = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  // Sync refs
  useEffect(() => { pagesRef.current     = pages     }, [pages])
  useEffect(() => { notesRef.current     = notes     }, [notes])
  useEffect(() => { gridModeRef.current  = gridMode  }, [gridMode])
  useEffect(() => { boardNameRef.current = boardName }, [boardName])

  // Setters that update both ref and state atomically
  const setTool  = (v) => { toolRef.current  = v; setToolState(v) }
  const setColor = (v) => { colorRef.current = v; setColorState(v) }
  const setSize  = (v) => { sizeRef.current  = v; setSizeState(v) }
  const setGridMode = (v) => { gridModeRef.current = v; setGridModeState(v) }
  const setZoom  = (v) => { zoomRef.current  = v; setZoomState(v) }
  const setPan   = (v) => { panRef.current   = v; setPanState(v) }
  const setCustomColor = (v) => { setCustomColorState(v); setColor(v) }

  // ── Snap helper ────────────────────────────────────────────────────────────
  const snap = useCallback((pt) => {
    if (!gridModeRef.current) return pt
    const s = 1 / GRID_CELLS
    return { x: Math.round(pt.x / s) * s, y: Math.round(pt.y / s) * s }
  }, [])

  // ── History helpers ────────────────────────────────────────────────────────
  const saveToHistory = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = displayRef.current
    const snap = ctx.getImageData(0, 0, width, height)
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
    historyIdxRef.current = historyRef.current.length - 1
    setCanUndo(historyIdxRef.current > 0)
    setCanRedo(false)
  }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    ctxRef.current?.putImageData(historyRef.current[historyIdxRef.current], 0, 0)
    setCanUndo(historyIdxRef.current > 0)
    setCanRedo(true)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    ctxRef.current?.putImageData(historyRef.current[historyIdxRef.current], 0, 0)
    setCanUndo(true)
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1)
  }, [])

  // ── Canvas init (ResizeObserver) ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const init = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      // Use the raw CSS size (before transform) from the container
      const container = containerRef.current
      const cRect = container ? container.getBoundingClientRect() : rect
      const w = cRect.width, h = cRect.height
      displayRef.current = { width: w, height: h }
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctxRef.current = ctx
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      // Resize & redraw grid overlay
      const gc = gridCanvasRef.current
      if (gc) renderGridOnCanvas(gc, gridModeRef.current, w, h)
      historyRef.current = []; historyIdxRef.current = -1
      setCanUndo(false); setCanRedo(false)
      saveToHistory()
    }
    init()
    const ro = new ResizeObserver(init)
    ro.observe(containerRef.current || canvas)
    return () => ro.disconnect()
  }, [saveToHistory])

  // ── Redraw grid when mode changes ──────────────────────────────────────────
  useEffect(() => {
    const gc = gridCanvasRef.current
    if (!gc) return
    const { width, height } = displayRef.current
    renderGridOnCanvas(gc, gridMode, width, height)
  }, [gridMode])

  // ── Page restore ───────────────────────────────────────────────────────────
  const currentPageSnapshot = pages[pageIdx]?.snapshot
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx || !currentPageSnapshot) return
    const { width, height } = displayRef.current
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    const img = new Image()
    img.onload = () => { ctx.drawImage(img, 0, 0, width, height); saveToHistory() }
    img.src = currentPageSnapshot
  }, [pageIdx, currentPageSnapshot, saveToHistory])

  // ── Non-passive wheel listener ─────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const factor   = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom  = Math.max(0.25, Math.min(5, zoomRef.current * factor))
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const newPanX = cx - (cx - panRef.current.x) * (newZoom / zoomRef.current)
    const newPanY = cy - (cy - panRef.current.y) * (newZoom / zoomRef.current)
    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); spaceRef.current = true }
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
      if (e.key === 'Escape') setTextInput(null)
    }
    const up = (e) => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo])

  // ── WebSocket listeners ────────────────────────────────────────────────────
  const currentPageId = pages[pageIdx]?.id
  useEffect(() => {
    const guard = (d) => d.conversation_id === conversationId && d.page_id === currentPageId

    const offStroke = on('whiteboard:stroke', (d) => {
      if (!guard(d)) return
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      drawSegmentOnCtx(ctx, d.from, d.to, d.tool, d.color, d.size, width, height)
    })
    const offShape = on('whiteboard:shape', (d) => {
      if (!guard(d)) return
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      drawShapeOnCtx(ctx, d.type, d.from, d.to, d.color, d.size, width, height)
      saveToHistory()
    })
    const offText = on('whiteboard:text', (d) => {
      if (!guard(d)) return
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      drawTextOnCtx(ctx, d.x, d.y, d.text, d.color, d.fontSize, width, height)
      saveToHistory()
    })
    const offImage = on('whiteboard:image', (d) => {
      if (!guard(d)) return
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      const img = new Image(); img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, d.x * width, d.y * height, d.wRatio * width, d.hRatio * height); saveToHistory() }
      img.src = d.url
    })
    const offClear = on('whiteboard:clear', (d) => {
      if (!guard(d)) return
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
      saveToHistory()
    })
    const offNoteAdd   = on('whiteboard:note_add',    (d) => { if (d.conversation_id !== conversationId) return; setNotes((p) => (p.find((n) => n.id === d.note.id) ? p : [...p, d.note])) })
    const offNoteMove  = on('whiteboard:note_move',   (d) => { if (d.conversation_id !== conversationId) return; setNotes((p) => p.map((n) => n.id === d.note_id ? { ...n, x: d.x, y: d.y } : n)) })
    const offNoteEdit  = on('whiteboard:note_edit',   (d) => { if (d.conversation_id !== conversationId) return; setNotes((p) => p.map((n) => n.id === d.note_id ? { ...n, text: d.text } : n)) })
    const offNoteDel   = on('whiteboard:note_delete', (d) => { if (d.conversation_id !== conversationId) return; setNotes((p) => p.filter((n) => n.id !== d.note_id)) })
    const offNoteStyle = on('whiteboard:note_style',  (d) => { if (d.conversation_id !== conversationId) return; setNotes((p) => p.map((n) => n.id === d.note_id ? { ...n, ...(d.color !== undefined ? { color: d.color } : {}), ...(d.textColor !== undefined ? { textColor: d.textColor } : {}) } : n)) })
    const offCursor   = on('whiteboard:cursor', (d) => {
      if (!guard(d)) return
      setCursors((p) => ({ ...p, [d.user_id]: { x: d.x, y: d.y } }))
      clearTimeout(cursorTimers.current[d.user_id])
      cursorTimers.current[d.user_id] = setTimeout(() => setCursors((p) => { const n = { ...p }; delete n[d.user_id]; return n }), 3000)
    })
    const offCursorLeave = on('whiteboard:cursor_leave', (d) => {
      if (d.conversation_id !== conversationId) return
      setCursors((p) => { const n = { ...p }; delete n[d.user_id]; return n })
    })

    return () => { offStroke?.(); offShape?.(); offText?.(); offImage?.(); offClear?.(); offNoteAdd?.(); offNoteMove?.(); offNoteEdit?.(); offNoteDel?.(); offNoteStyle?.(); offCursor?.(); offCursorLeave?.() }
  }, [on, conversationId, currentPageId, saveToHistory])

  // ── getPoint — works correctly with CSS transform zoom/pan ─────────────────
  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
    }
  }, [])

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    const pt = getPoint(e); if (!pt) return
    const t  = toolRef.current

    // Spacebar pan
    if (spaceRef.current) {
      isPanRef.current  = true
      panStartRef.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y }
      canvasRef.current?.setPointerCapture(e.pointerId)
      return
    }

    if (t === 'note') {
      const newNote = { id: crypto.randomUUID(), x: pt.x, y: pt.y, text: '', color: NOTE_COLORS[notesRef.current.length % NOTE_COLORS.length], textColor: '#1a1a1a' }
      setNotes((p) => [...p, newNote])
      isDirtyRef.current = true; setIsDirty(true)
      emit('whiteboard:note_add', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, note: newNote })
      return
    }
    if (t === 'laser') return
    if (t === 'text') {
      setTextInput({ x: pt.x, y: pt.y })
      return
    }

    isDrawingRef.current = true
    didDrawRef.current = false
    const snapped = SHAPE_TOOLS.has(t) ? snap(pt) : pt
    lastPtRef.current = snapped

    if (SHAPE_TOOLS.has(t)) {
      shapeStartRef.current = snapped
      const { width, height } = displayRef.current
      preShapeRef.current = ctxRef.current?.getImageData(0, 0, width, height) ?? null
    }
    canvasRef.current?.setPointerCapture(e.pointerId)
  }, [getPoint, emit, conversationId, snap])

  const handlePointerMove = useCallback((e) => {
    const t  = toolRef.current
    const pt = getPoint(e); if (!pt) return

    // Spacebar pan
    if (isPanRef.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy })
      return
    }

    // Laser
    if (t === 'laser') {
      if (laserDotRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) { laserDotRef.current.style.left = `${e.clientX - rect.left}px`; laserDotRef.current.style.top = `${e.clientY - rect.top}px`; laserDotRef.current.style.display = 'block' }
      }
      const now = Date.now()
      if (now - laserThrottleRef.current > LASER_MS) {
        laserThrottleRef.current = now
        emit('whiteboard:cursor', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, x: pt.x, y: pt.y })
      }
      return
    }

    if (!isDrawingRef.current || !lastPtRef.current) return
    e.preventDefault()
    const ctx = ctxRef.current; if (!ctx) return
    const { width, height } = displayRef.current

    if (SHAPE_TOOLS.has(t)) {
      if (preShapeRef.current) ctx.putImageData(preShapeRef.current, 0, 0)
      const snapped = snap(pt)
      drawShapeOnCtx(ctx, t, shapeStartRef.current, snapped, colorRef.current, sizeRef.current, width, height)
      lastPtRef.current = snapped
      didDrawRef.current = true
      return
    }

    didDrawRef.current = true
    drawSegmentOnCtx(ctx, lastPtRef.current, pt, t, colorRef.current, sizeRef.current, width, height)
    emit('whiteboard:stroke', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, tool: t, color: colorRef.current, size: sizeRef.current, from: lastPtRef.current, to: pt })
    lastPtRef.current = pt
  }, [getPoint, emit, conversationId, snap])

  const handlePointerUp = useCallback(() => {
    const t = toolRef.current

    if (isPanRef.current) { isPanRef.current = false; panStartRef.current = null; return }

    if (t === 'laser') {
      if (laserDotRef.current) laserDotRef.current.style.display = 'none'
      emit('whiteboard:cursor_leave', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id })
      return
    }

    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    // A bare click that drew nothing isn't a change — don't dirty or autosave.
    if (!didDrawRef.current) {
      shapeStartRef.current = null; preShapeRef.current = null; lastPtRef.current = null
      return
    }

    if (SHAPE_TOOLS.has(t) && shapeStartRef.current && lastPtRef.current) {
      const ctx = ctxRef.current
      const { width, height } = displayRef.current
      if (preShapeRef.current) ctx.putImageData(preShapeRef.current, 0, 0)
      const snapped = snap(lastPtRef.current)
      drawShapeOnCtx(ctx, t, shapeStartRef.current, snapped, colorRef.current, sizeRef.current, width, height)
      saveToHistory()
      emit('whiteboard:shape', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, type: t, color: colorRef.current, size: sizeRef.current, from: shapeStartRef.current, to: snapped })
    } else {
      saveToHistory()
    }
    isDirtyRef.current = true; setIsDirty(true)

    shapeStartRef.current = null; preShapeRef.current = null; lastPtRef.current = null
  }, [saveToHistory, emit, conversationId, snap])

  const handlePointerLeave = useCallback((e) => {
    if (toolRef.current === 'laser') {
      if (laserDotRef.current) laserDotRef.current.style.display = 'none'
      emit('whiteboard:cursor_leave', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id })
      return
    }
    handlePointerUp(e)
  }, [handlePointerUp, emit, conversationId])

  // ── Text commit ────────────────────────────────────────────────────────────
  const handleTextCommit = useCallback((text) => {
    setTextInput(null)
    if (!text.trim()) return
    const ctx = ctxRef.current; if (!ctx) return
    const { width, height } = displayRef.current
    const x = textInput?.x ?? 0.1, y = textInput?.y ?? 0.1
    const fs = FONT_SIZES[sizeRef.current]
    drawTextOnCtx(ctx, x, y, text, colorRef.current, fs, width, height)
    saveToHistory()
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:text', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, x, y, text, color: colorRef.current, fontSize: fs })
  }, [textInput, saveToHistory, emit, conversationId])

  // ── Image drop / paste ─────────────────────────────────────────────────────
  const placeImage = useCallback(async (file, pt) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const ctx = ctxRef.current; if (!ctx) return
      const { width, height } = displayRef.current
      let dw = img.width, dh = img.height
      const maxW = width * 0.65, maxH = height * 0.65
      if (dw > maxW) { dh = dh * maxW / dw; dw = maxW }
      if (dh > maxH) { dw = dw * maxH / dh; dh = maxH }
      const dx = pt.x * width, dy = pt.y * height
      ctx.drawImage(img, dx, dy, dw, dh)
      URL.revokeObjectURL(url)
      saveToHistory()
      isDirtyRef.current = true; setIsDirty(true)
      uploadFile(file)
        .then((u) => emit('whiteboard:image', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, url: u.url, x: pt.x, y: pt.y, wRatio: dw / width, hRatio: dh / height }))
        .catch(() => {})
    }
    img.src = url
  }, [saveToHistory, emit, conversationId])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file?.type.startsWith('image/')) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const pt = { x: Math.max(0, Math.min(0.9, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(0.9, (e.clientY - rect.top) / rect.height)) }
    placeImage(file, pt)
  }, [placeImage])

  const handlePaste = useCallback((e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    if (file) placeImage(file, { x: 0.05, y: 0.05 })
  }, [placeImage])

  // ── Clear ──────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return
    const { width, height } = displayRef.current
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
    saveToHistory()
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:clear', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id })
  }, [saveToHistory, emit, conversationId])

  // ── Export / Share ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const a = document.createElement('a')
    a.download = `whiteboard-p${pageIdxRef.current + 1}.png`
    a.href = canvas.toDataURL('image/png'); a.click()
  }, [])

  const handleShareToChat = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], 'whiteboard.png', { type: 'image/png' })
      uploadFile(file)
        .then((u) => sendMessage(conversationId, { type: 'image', file_url: u.url, file_name: u.file_name, file_size: u.file_size }))
        .then(() => toast.success('Whiteboard shared to chat'))
        .catch(() => toast.error('Could not share whiteboard'))
    }, 'image/png')
  }, [conversationId])

  // ── Send to chat (forward) ──────────────────────────────────────────────────
  const closeForward = useCallback(() => {
    if (forwardSending) return
    setShowForward(false)
    setForwardConvs([])
    setForwardQuery('')
  }, [forwardSending])

  const openSendToChat = useCallback(async () => {
    setForwardQuery('')
    setShowForward(true)
    try {
      const data = await listConversations()
      setForwardConvs(data.conversations ?? data ?? [])
    } catch {
      toast.error('Could not load conversations')
    }
  }, [])

  const sendBoardTo = useCallback((targetConvId) => {
    const canvas = canvasRef.current; if (!canvas) return
    setForwardSending(targetConvId)
    canvas.toBlob((blob) => {
      if (!blob) { setForwardSending(null); return }
      const file = new File([blob], 'scribble.png', { type: 'image/png' })
      uploadFile(file)
        .then((u) => sendMessage(targetConvId, { type: 'image', file_url: u.url, file_name: u.file_name, file_size: u.file_size }))
        .then(() => { toast.success('Scribble sent to chat'); setShowForward(false); setForwardConvs([]); setForwardQuery('') })
        .catch(() => toast.error('Could not send'))
        .finally(() => setForwardSending(null))
    }, 'image/png')
  }, [])

  // ── Delete whole board ──────────────────────────────────────────────────────
  const handleDeleteBoard = useCallback(async () => {
    setConfirmDeleteBoard(false)
    try {
      await deleteWhiteboardDraft(conversationId)
    } catch {
      // 404 = nothing saved yet; deleting an unsaved board is still fine
    }
    const fresh = [{ id: crypto.randomUUID(), snapshot: null }]
    setPages(fresh); pagesRef.current = fresh
    setNotes([]); notesRef.current = []
    pageIdxRef.current = 0; setPageIdx(0)
    historyRef.current = []; historyIdxRef.current = -1
    setCanUndo(false); setCanRedo(false)
    const ctx = ctxRef.current
    if (ctx) { const { width, height } = displayRef.current; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); saveToHistory() }
    setDraftId(null)
    baseUpdatedAtRef.current = null
    setLastSavedAt(null)
    setBoardName(''); boardNameRef.current = ''
    isDirtyRef.current = false; setIsDirty(false)
    setDraftStatus('idle')
    toast.success('Board deleted')
  }, [conversationId, saveToHistory])

  // ── Pages ──────────────────────────────────────────────────────────────────
  const deletePage = useCallback((targetIdx) => {
    if (pagesRef.current.length <= 1) return
    const curIdx = pageIdxRef.current
    // Persist the live canvas into the current page so other pages aren't lost.
    const curSnapshot = canvasRef.current?.toDataURL() ?? null
    let updated = pagesRef.current.map((p, i) => (i === curIdx ? { ...p, snapshot: curSnapshot } : p))
    updated = updated.filter((_, i) => i !== targetIdx)

    let newIdx = curIdx
    if (targetIdx < curIdx) newIdx = curIdx - 1
    else if (targetIdx === curIdx) newIdx = Math.min(curIdx, updated.length - 1)

    pagesRef.current = updated; setPages(updated)
    historyRef.current = []; historyIdxRef.current = -1
    setCanUndo(false); setCanRedo(false)
    pageIdxRef.current = newIdx; setPageIdx(newIdx)
    // The page-restore effect redraws pages that have a snapshot; if the new
    // current page is blank it won't fire, so clear the canvas here.
    if (!updated[newIdx]?.snapshot) {
      const ctx = ctxRef.current
      if (ctx) { const { width, height } = displayRef.current; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); saveToHistory() }
    }
    isDirtyRef.current = true; setIsDirty(true)
  }, [saveToHistory])

  const switchPage = useCallback((newIdx) => {
    if (newIdx === pageIdxRef.current) return
    const snapshot = canvasRef.current?.toDataURL() ?? null
    const fromIdx  = pageIdxRef.current
    setPages((prev) => {
      const updated = prev.map((p, i) => (i === fromIdx ? { ...p, snapshot } : p))
      pagesRef.current = updated; return updated
    })
    historyRef.current = []; historyIdxRef.current = -1
    setCanUndo(false); setCanRedo(false)
    pageIdxRef.current = newIdx; setPageIdx(newIdx)
    if (!pagesRef.current[newIdx]?.snapshot) {
      const ctx = ctxRef.current
      if (ctx) { const { width, height } = displayRef.current; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); saveToHistory() }
    }
  }, [saveToHistory])

  const addPage = useCallback(() => {
    const snapshot = canvasRef.current?.toDataURL() ?? null
    const fromIdx  = pageIdxRef.current
    const newIdx   = pagesRef.current?.length ?? 1
    setPages((prev) => { const updated = [...prev.map((p, i) => (i === fromIdx ? { ...p, snapshot } : p)), { id: crypto.randomUUID(), snapshot: null }]; pagesRef.current = updated; return updated })
    historyRef.current = []; historyIdxRef.current = -1
    setCanUndo(false); setCanRedo(false)
    pageIdxRef.current = newIdx; setPageIdx(newIdx)
    const ctx = ctxRef.current
    if (ctx) { const { width, height } = displayRef.current; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); saveToHistory() }
    isDirtyRef.current = true; setIsDirty(true)
  }, [saveToHistory])

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])

  // ── Draft persistence ──────────────────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!conversationId) return
    setDraftStatus('saving')
    const snapshot = canvasRef.current?.toDataURL() ?? null
    const idx = pageIdxRef.current
    const updatedPages = (pagesRef.current || []).map((p, i) =>
      i === idx ? { ...p, snapshot } : p
    )
    try {
      const result = await saveWhiteboardDraft(conversationId, {
        name: boardNameRef.current,
        pages: updatedPages,
        notes: notesRef.current,
        base_updated_at: baseUpdatedAtRef.current,
      })
      setDraftId(result.id)
      if (result.name !== undefined) { setBoardName(result.name); boardNameRef.current = result.name }
      baseUpdatedAtRef.current = result.updated_at
      setLastSavedAt(result.updated_at)
      isDirtyRef.current = false; setIsDirty(false)
      setDraftStatus(result.is_saved ? 'published' : 'saved')
    } catch (err) {
      if (err?.response?.status === 409) {
        // Another tab/device or collaborator saved a newer version. Adopt their
        // timestamp as our new base so the next save wins, keep our local edits,
        // and warn rather than silently overwriting.
        const remote = err.response.data?.draft
        if (remote?.updated_at) baseUpdatedAtRef.current = remote.updated_at
        isDirtyRef.current = true; setIsDirty(true)
        setDraftStatus('saved')
        toast('Board was updated elsewhere — save again to overwrite', { icon: '⚠️' })
        return
      }
      setDraftStatus('idle')
      toast.error('Could not save draft')
    }
  }, [conversationId])

  const handlePublish = useCallback(async () => {
    await saveDraft()
    try {
      const result = await publishWhiteboardDraft(conversationId)
      if (result?.updated_at) {
        baseUpdatedAtRef.current = result.updated_at
        setLastSavedAt(result.updated_at)
      }
      isDirtyRef.current = false; setIsDirty(false)
      setDraftStatus('published')
      toast.success('Whiteboard saved!')
    } catch {
      toast.error('Could not publish')
    }
  }, [saveDraft, conversationId])

  // ── New board ──────────────────────────────────────────────────────────────
  const handleNewBoard = useCallback(async () => {
    if (isDirtyRef.current) await saveDraft()
    const fresh = [{ id: crypto.randomUUID(), snapshot: null }]
    setPages(fresh); pagesRef.current = fresh
    setNotes([]); notesRef.current = []
    pageIdxRef.current = 0; setPageIdx(0)
    historyRef.current = []; historyIdxRef.current = -1
    setCanUndo(false); setCanRedo(false)
    const ctx = ctxRef.current
    if (ctx) { const { width, height } = displayRef.current; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); saveToHistory() }
    setBoardName(''); boardNameRef.current = ''
    isDirtyRef.current = true; setIsDirty(true)
    setDraftStatus('idle')
    setConfirmNewBoard(false)
  }, [saveDraft, saveToHistory])

  // ── Drafts panel ───────────────────────────────────────────────────────────
  const openDraftsPanel = useCallback(async () => {
    setDraftsLoading(true)
    setShowDraftsPanel(true)
    try {
      const data = await listWhiteboardDrafts()
      setAllDrafts(Array.isArray(data) ? data : [])
    } catch (err) {
      setAllDrafts([])
      toast.error('Could not load boards')
      console.error('listWhiteboardDrafts error:', err)
    }
    setDraftsLoading(false)
  }, [])

  const toggleDraftsPanel = useCallback(() => {
    if (showDraftsPanel) {
      setShowDraftsPanel(false)
    } else {
      openDraftsPanel()
    }
  }, [showDraftsPanel, openDraftsPanel])

  // Load draft on mount and restore canvas state
  useEffect(() => {
    if (!conversationId) return
    getWhiteboardDraft(conversationId)
      .then((draft) => {
        if (draft.pages?.length > 0) {
          setPages(draft.pages)
          pagesRef.current = draft.pages
          pageIdxRef.current = 0
        }
        if (draft.notes?.length > 0) {
          setNotes(draft.notes)
          notesRef.current = draft.notes
        }
        setDraftId(draft.id)
        setBoardName(draft.name ?? ''); boardNameRef.current = draft.name ?? ''
        baseUpdatedAtRef.current = draft.updated_at
        setLastSavedAt(draft.updated_at)
        isDirtyRef.current = false; setIsDirty(false)
        setDraftStatus(draft.is_saved ? 'published' : 'saved')
      })
      .catch(() => {}) // 404 = no draft yet, start fresh
  }, [conversationId])

  // Auto-save every 30 s when there are unsaved changes; also save on unmount
  useEffect(() => {
    const id = setInterval(() => {
      if (isDirtyRef.current) saveDraft()
    }, 30000)
    return () => {
      clearInterval(id)
      if (isDirtyRef.current) saveDraft()
    }
  }, [saveDraft])

  // ── Note handlers ──────────────────────────────────────────────────────────
  const handleNoteDragDown = useCallback((e, id) => {
    e.stopPropagation()
    const note = notesRef.current.find((n) => n.id === id); if (!note) return
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    noteDragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: note.x, oy: note.y, rw: rect.width, rh: rect.height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const handleNoteDragMove = useCallback((e, id) => {
    const d = noteDragRef.current; if (!d || d.id !== id) return
    e.stopPropagation()
    const nx = Math.max(0, Math.min(0.88, d.ox + (e.clientX - d.sx) / d.rw))
    const ny = Math.max(0, Math.min(0.88, d.oy + (e.clientY - d.sy) / d.rh))
    const el = document.getElementById(`wb-note-${id}`)
    if (el) { el.style.left = `${nx * 100}%`; el.style.top = `${ny * 100}%` }
    noteDragRef.current.cx = nx; noteDragRef.current.cy = ny
  }, [])

  const handleNoteDragUp = useCallback((e, id) => {
    const d = noteDragRef.current; if (!d || d.id !== id) return
    noteDragRef.current = null; if (d.cx === undefined) return
    setNotes((p) => p.map((n) => n.id === id ? { ...n, x: d.cx, y: d.cy } : n))
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:note_move', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, note_id: id, x: d.cx, y: d.cy })
  }, [emit, conversationId])

  const handleNoteStyleChange = useCallback((id, field, value) => {
    setNotes((p) => p.map((n) => n.id === id ? { ...n, [field]: value } : n))
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:note_style', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, note_id: id, [field]: value })
  }, [emit, conversationId])

  const handleNoteTextChange = useCallback((id, text) => { isDirtyRef.current = true; setIsDirty(true); setNotes((p) => p.map((n) => n.id === id ? { ...n, text } : n)) }, [])
  const handleNoteBlur = useCallback((id, text) => {
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:note_edit', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, note_id: id, text })
  }, [emit, conversationId])
  const handleNoteDelete = useCallback((id) => {
    setNotes((p) => p.filter((n) => n.id !== id))
    isDirtyRef.current = true; setIsDirty(true)
    emit('whiteboard:note_delete', { conversation_id: conversationId, page_id: pagesRef.current[pageIdxRef.current].id, note_id: id })
  }, [emit, conversationId])

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const canvasCursor = spaceRef.current ? 'grab' : ({ pen: 'crosshair', eraser: 'cell', text: 'text', rect: 'crosshair', circle: 'crosshair', arrow: 'crosshair', note: 'copy', laser: 'none' }[tool] || 'crosshair')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`flex flex-col h-full bg-cn-white flex-shrink-0 ${fullPage ? 'w-full' : 'border-l border-cn-gray-200'}`}
      style={fullPage ? {} : { width: 520 }}
    >

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-cn-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Inline-editable board name */}
          {editingName ? (
            <input
              autoFocus
              className="font-semibold text-sm bg-transparent border-b-2 border-cn-blue outline-none min-w-0 max-w-[200px]"
              value={boardName}
              placeholder="Untitled"
              onChange={(e) => { setBoardName(e.target.value); boardNameRef.current = e.target.value }}
              onBlur={() => { setEditingName(false); isDirtyRef.current = true; setIsDirty(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { setEditingName(false); isDirtyRef.current = true; setIsDirty(true) } }}
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="font-semibold text-sm text-cn-charcoal hover:text-cn-blue truncate max-w-[200px] text-left transition-colors"
              title="Click to rename"
            >
              {boardName.trim() || 'Untitled'}
            </button>
          )}
          {/* Draft status badge */}
          {draftStatus === 'saving'                  && <span className="text-xs text-cn-gray-400 italic flex-shrink-0">Saving…</span>}
          {draftStatus !== 'saving' && isDirty       && <span className="text-xs text-cn-gray-400 italic flex-shrink-0">Unsaved changes</span>}
          {draftStatus === 'saved'     && !isDirty   && <span className="text-xs text-green-500 font-medium flex-shrink-0">Draft saved</span>}
          {draftStatus === 'published' && !isDirty   && <span className="text-xs text-cn-blue font-semibold flex-shrink-0">Saved</span>}
          {draftStatus !== 'saving' && !isDirty && lastSavedAt && (
            <span className="text-xs text-cn-gray-400 flex-shrink-0" title={new Date(lastSavedAt).toLocaleString()}>
              · {formatAgo(lastSavedAt, nowTick)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Draft action buttons */}
          {draftStatus !== 'published' && (
            <button
              onClick={saveDraft}
              disabled={draftStatus === 'saving'}
              className="px-2 py-1 text-xs font-semibold text-cn-gray-500 hover:bg-cn-gray-100 rounded-lg transition-fast disabled:opacity-40"
              title="Save as draft"
            >
              Save Draft
            </button>
          )}
          <button
            onClick={handlePublish}
            disabled={draftStatus === 'saving'}
            className="px-2 py-1 text-xs font-semibold bg-cn-blue text-white hover:opacity-90 rounded-lg transition-fast disabled:opacity-40"
            title={draftStatus === 'published' && !isDirty ? 'Already saved' : 'Save permanently'}
          >
            {draftStatus === 'published' ? (isDirty ? 'Save' : '✓ Saved') : 'Publish'}
          </button>
          {/* Zoom indicator + reset */}
          {zoom !== 1 && (
            <button onClick={resetView} className="text-xs px-2 py-0.5 rounded bg-cn-gray-100 text-cn-gray-500 hover:bg-cn-gray-200 transition-fast">
              {Math.round(zoom * 100)}% ↺
            </button>
          )}
          {!fullPage && (
            <button onClick={onClose} className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast">
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar row 1: tools + undo/redo */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 flex-shrink-0 flex-wrap">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => setTool(t.id)}
            className={`px-2 py-1 text-xs font-semibold rounded-lg transition-fast whitespace-nowrap ${tool === t.id ? 'bg-cn-blue text-white' : 'text-cn-gray-500 hover:bg-cn-gray-100'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-0.5">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className={`px-2 py-1 text-sm rounded-lg transition-fast ${canUndo ? 'text-cn-gray-600 hover:bg-cn-gray-100' : 'text-cn-gray-300 cursor-not-allowed'}`}>↩</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className={`px-2 py-1 text-sm rounded-lg transition-fast ${canRedo ? 'text-cn-gray-600 hover:bg-cn-gray-100' : 'text-cn-gray-300 cursor-not-allowed'}`}>↪</button>
        </div>
      </div>

      {/* Toolbar row 2: colors + sizes + grid + actions */}
      <div className="flex items-center gap-2 px-2 pb-2 border-b border-cn-gray-200 flex-shrink-0 flex-wrap">
        {tool !== 'laser' && tool !== 'note' && (
          <div className="flex gap-1 items-center">
            {PRESET_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className="rounded-full border-2 flex-shrink-0 transition-fast"
                style={{ width: 18, height: 18, background: c, borderColor: c === '#ffffff' ? (color === c ? '#3399CC' : '#d1d5db') : (color === c ? '#3399CC' : 'transparent'), boxShadow: color === c ? '0 0 0 1.5px #3399CC' : 'none' }} />
            ))}
            {/* Custom color picker */}
            <label className="relative cursor-pointer flex-shrink-0" title="Custom color">
              <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="absolute opacity-0 w-0 h-0" />
              <div className="rounded-full border-2 flex-shrink-0 transition-fast"
                style={{ width: 18, height: 18, background: 'conic-gradient(red 0deg,yellow 60deg,lime 120deg,cyan 180deg,blue 240deg,magenta 300deg,red 360deg)', borderColor: !PRESET_COLORS.includes(color) ? '#3399CC' : '#d1d5db', boxShadow: !PRESET_COLORS.includes(color) ? '0 0 0 1.5px #3399CC' : 'none' }} />
            </label>
          </div>
        )}

        {tool !== 'note' && tool !== 'laser' && (
          <div className="flex gap-1 items-center">
            {SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)}
                className="rounded flex items-center justify-center flex-shrink-0 transition-fast text-white"
                style={{ width: 22, height: 22, background: size === s ? '#3399CC' : '#d1d5db', fontSize: 9, fontWeight: 700 }}
                title={tool === 'text' ? `${FONT_SIZES[s]}px` : `${s}px`}>
                {tool === 'text' ? FONT_SIZES[s] : <span className="rounded-full bg-white block" style={{ width: Math.max(Math.round(s * 0.55), 2), height: Math.max(Math.round(s * 0.55), 2) }} />}
              </button>
            ))}
          </div>
        )}

        {/* Grid toggle */}
        <div className="flex gap-0.5">
          {[{ id: 'grid', label: '▦' }, { id: 'dots', label: '⠿' }].map(({ id, label }) => (
            <button key={id} onClick={() => setGridMode(gridMode === id ? null : id)} title={id === 'grid' ? 'Grid' : 'Dot grid'}
              className={`px-1.5 py-1 text-sm rounded-lg transition-fast ${gridMode === id ? 'bg-cn-blue text-white' : 'text-cn-gray-400 hover:bg-cn-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setConfirmNewBoard(true)} className="px-2 py-1 text-xs font-semibold text-cn-gray-500 hover:bg-cn-gray-100 rounded-lg transition-fast" title="Start a new blank board">+ New</button>
          <div className="relative">
            <button
              onClick={toggleDraftsPanel}
              className="px-2 py-1 text-xs font-semibold text-cn-gray-500 hover:bg-cn-gray-100 rounded-lg transition-fast"
              title="All your boards"
            >
              📋 Drafts
            </button>
            {showDraftsPanel && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDraftsPanel(false)} />
                <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-80 max-h-80 overflow-y-auto">
                  <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">All boards</span>
                    <button onClick={() => setShowDraftsPanel(false)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xs leading-none transition-colors">✕</button>
                  </div>
                  {draftsLoading ? (
                    <div className="px-4 py-6 text-sm text-gray-400 text-center">Loading…</div>
                  ) : allDrafts.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-400 text-center">No boards yet</div>
                  ) : allDrafts.map((d) => (
                    <div key={d.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${d.conversation_id === conversationId ? 'bg-blue-50 hover:bg-blue-50' : ''}`}>
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-base">
                        🖊️
                      </div>
                      <div className="flex-1 min-w-0">
                        {renamingDraftId === d.id ? (
                          <input
                            autoFocus
                            className="text-sm font-medium text-gray-800 bg-white border border-blue-400 rounded px-1.5 py-0.5 outline-none w-full"
                            value={renameValue}
                            placeholder="Untitled"
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                const name = renameValue.trim()
                                setRenamingDraftId(null)
                                setAllDrafts((prev) => prev.map((x) => x.id === d.id ? { ...x, name } : x))
                                if (d.conversation_id === conversationId) { setBoardName(name); boardNameRef.current = name; isDirtyRef.current = true; setIsDirty(true) }
                                try { await renameWhiteboardDraft(d.conversation_id, name) } catch { toast.error('Could not rename') }
                              } else if (e.key === 'Escape') {
                                setRenamingDraftId(null)
                              }
                            }}
                            onBlur={async () => {
                              const name = renameValue.trim()
                              setRenamingDraftId(null)
                              setAllDrafts((prev) => prev.map((x) => x.id === d.id ? { ...x, name } : x))
                              if (d.conversation_id === conversationId) { setBoardName(name); boardNameRef.current = name; isDirtyRef.current = true; setIsDirty(true) }
                              try { await renameWhiteboardDraft(d.conversation_id, name) } catch { toast.error('Could not rename') }
                            }}
                          />
                        ) : (
                          <p
                            className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600"
                            title="Click to rename"
                            onClick={() => { setRenamingDraftId(d.id); setRenameValue(d.name ?? '') }}
                          >
                            {d.name?.trim() || 'Untitled'}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {d.conversation_id === '__personal__' ? 'Personal' : (d.conversation_name ?? 'Chat')} · {formatAgo(d.updated_at, nowTick)}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold ${d.is_saved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {d.is_saved ? 'Saved' : 'Draft'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={handleExport} className="px-2 py-1 text-xs font-semibold text-cn-gray-500 hover:bg-cn-gray-100 rounded-lg transition-fast" title="Download PNG">⬇ Save</button>
          {!fullPage && <button onClick={handleShareToChat} className="px-2 py-1 text-xs font-semibold text-cn-blue hover:bg-cn-blue-light rounded-lg transition-fast" title="Post to chat">↑ Share</button>}
          {fullPage && <button onClick={openSendToChat} className="px-2 py-1 text-xs font-semibold text-cn-blue hover:bg-cn-blue-light rounded-lg transition-fast" title="Send this page to a chat">↗ Send to chat</button>}
          <button onClick={handleClear} className="px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-fast">Clear</button>
          {fullPage && <button onClick={() => setConfirmDeleteBoard(true)} className="px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-fast" title="Delete the whole board">🗑 Delete board</button>}
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-white select-none"
        tabIndex={0}
        onPaste={handlePaste}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Transform wrapper — canvas + overlays all move together with zoom/pan */}
        <div
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
        >
          {/* Grid overlay — pointer-events none, doesn't affect drawing */}
          <canvas ref={gridCanvasRef} className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />

          {/* Drawing canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none w-full h-full"
            style={{ cursor: canvasCursor }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />

          {/* Text input overlay — positioned at click point, inside transform */}
          {textInput && (
            <input
              autoFocus
              className="absolute bg-transparent outline-none border-b-2 border-cn-blue min-w-32"
              style={{ left: `${textInput.x * 100}%`, top: `${textInput.y * 100}%`, transform: 'translateY(-50%)', fontSize: FONT_SIZES[size], color: color, fontFamily: 'sans-serif', caretColor: color }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTextCommit(e.target.value); if (e.key === 'Escape') setTextInput(null) }}
              onBlur={(e) => handleTextCommit(e.target.value)}
            />
          )}

          {/* Own laser dot */}
          {tool === 'laser' && (
            <div ref={laserDotRef} className="absolute pointer-events-none" style={{ display: 'none', transform: 'translate(-50%,-50%)', zIndex: 30 }}>
              <div className="w-5 h-5 rounded-full bg-red-500 opacity-80 shadow-lg animate-ping" />
            </div>
          )}

          {/* Remote laser cursors */}
          {Object.entries(cursors).map(([uid, cur]) => (
            <div key={uid} className="absolute pointer-events-none" style={{ left: `${cur.x * 100}%`, top: `${cur.y * 100}%`, transform: 'translate(-50%,-50%)', zIndex: 25 }}>
              <div className="w-4 h-4 rounded-full opacity-75 shadow-md animate-pulse" style={{ background: '#f59e0b' }} />
            </div>
          ))}

          {/* Sticky notes */}
          {notes.map((note) => (
            <div key={note.id} id={`wb-note-${note.id}`}
              className="absolute rounded-lg shadow-md flex flex-col"
              style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, width: 176, minHeight: 90, background: note.color, zIndex: 20, transform: 'translate(-88px,-45px)' }}
              onPointerDown={(e) => { if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') handleNoteDragDown(e, note.id) }}
              onPointerMove={(e) => handleNoteDragMove(e, note.id)}
              onPointerUp={(e) => handleNoteDragUp(e, note.id)}
            >
              {/* Drag handle + palette toggle + delete */}
              <div className="flex items-center justify-between px-2 py-1 cursor-move rounded-t-lg" style={{ background: 'rgba(0,0,0,0.22)' }}>
                <span className="text-xs" style={{ opacity: 0.85 }}>📌</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setNotePickerOpen(notePickerOpen === note.id ? null : note.id) }}
                    className="text-sm leading-none transition-fast"
                    style={{ opacity: notePickerOpen === note.id ? 1 : 0.85 }}
                    title="Change colors"
                  >🎨</button>
                  <button onClick={() => handleNoteDelete(note.id)} className="text-sm font-bold leading-none transition-fast" style={{ opacity: 0.75, color: '#fff' }}>✕</button>
                </div>
              </div>

              {/* Color picker dropdown */}
              {notePickerOpen === note.id && (
                <div className="flex flex-col gap-2 px-2 py-2" style={{ background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid rgba(0,0,0,0.12)' }} onPointerDown={(e) => e.stopPropagation()}>
                  {/* Background colors */}
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, marginBottom: 4, color: '#000' }}>Background</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {NOTE_COLORS.map((c) => (
                        <button key={c} onClick={() => handleNoteStyleChange(note.id, 'color', c)}
                          style={{ width: 16, height: 16, background: c, borderRadius: 3, flexShrink: 0, outline: note.color === c ? '2.5px solid #444' : '1.5px solid rgba(0,0,0,0.4)', outlineOffset: note.color === c ? 1 : 0 }} />
                      ))}
                      <label style={{ width: 16, height: 16, borderRadius: 3, cursor: 'pointer', flexShrink: 0, outline: '1.5px solid rgba(0,0,0,0.4)', background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)', position: 'relative' }} title="Custom background color">
                        <input type="color" value={note.color} onChange={(e) => handleNoteStyleChange(note.id, 'color', e.target.value)} style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', top: 0, left: 0 }} />
                      </label>
                    </div>
                  </div>
                  {/* Text colors */}
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, marginBottom: 4, color: '#000' }}>Text color</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {NOTE_TEXT_COLORS.map((c) => (
                        <button key={c} onClick={() => handleNoteStyleChange(note.id, 'textColor', c)}
                          style={{ width: 16, height: 16, background: c, borderRadius: 3, flexShrink: 0, outline: (note.textColor || '#1a1a1a') === c ? '2.5px solid #888' : '1.5px solid rgba(0,0,0,0.4)', outlineOffset: (note.textColor || '#1a1a1a') === c ? 1 : 0 }} />
                      ))}
                      <label style={{ width: 16, height: 16, borderRadius: 3, cursor: 'pointer', flexShrink: 0, outline: '1.5px solid rgba(0,0,0,0.4)', background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)', position: 'relative' }} title="Custom text color">
                        <input type="color" value={note.textColor || '#1a1a1a'} onChange={(e) => handleNoteStyleChange(note.id, 'textColor', e.target.value)} style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', top: 0, left: 0 }} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Text area */}
              <textarea className="flex-1 bg-transparent text-xs p-2 resize-none outline-none" style={{ fontFamily: 'inherit', minHeight: 52, color: note.textColor || '#1a1a1a' }}
                value={note.text}
                onChange={(e) => handleNoteTextChange(note.id, e.target.value)}
                onBlur={(e) => handleNoteBlur(note.id, e.target.value)}
                placeholder="Type here…"
                autoFocus={note.text === ''}
              />
            </div>
          ))}
        </div>

        {/* Drop zone overlay — outside transform, covers full area */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(51,153,204,0.1)', border: '3px dashed #3399CC', zIndex: 40 }}>
            <p className="text-cn-blue font-bold text-sm">Drop image here</p>
          </div>
        )}

        {/* Space-to-pan hint */}
        {zoom !== 1 && (
          <div className="absolute bottom-2 left-2 text-xs text-cn-gray-400 pointer-events-none bg-white/80 px-2 py-0.5 rounded">
            Hold Space to pan · Scroll to zoom
          </div>
        )}
      </div>

      {/* Page strip */}
      <div className="flex items-center gap-1.5 px-2 py-2 border-t border-cn-gray-200 flex-shrink-0 overflow-x-auto">
        {pages.map((page, i) => (
          <div key={page.id} className="relative flex-shrink-0 group">
            <button onClick={() => switchPage(i)} title={`Page ${i + 1}`}
              className={`block rounded-lg overflow-hidden border-2 transition-fast ${i === pageIdx ? 'border-cn-blue' : 'border-cn-gray-200 hover:border-cn-gray-400'}`}
              style={{ width: 52, height: 34 }}>
              {page.snapshot
                ? <img src={page.snapshot} className="w-full h-full object-cover" alt={`P${i + 1}`} />
                : <div className="w-full h-full bg-white flex items-center justify-center text-cn-gray-400" style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</div>}
            </button>
            {pages.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); deletePage(i) }} title={`Delete page ${i + 1}`}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-fast"
                style={{ fontSize: 9, lineHeight: 1 }}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button onClick={addPage} title="Add page"
          className="flex-shrink-0 w-9 h-9 rounded-lg border-2 border-dashed border-cn-gray-300 hover:border-cn-blue text-cn-gray-400 hover:text-cn-blue text-lg leading-none transition-fast flex items-center justify-center">
          +
        </button>
      </div>

      {/* Delete-board confirmation */}
      <ConfirmDialog
        open={confirmDeleteBoard}
        danger
        title="Delete this board?"
        message="This permanently removes all pages, notes, and the saved draft. This can't be undone."
        confirmLabel="Delete board"
        onConfirm={handleDeleteBoard}
        onCancel={() => setConfirmDeleteBoard(false)}
      />

      {/* New-board confirmation */}
      <ConfirmDialog
        open={confirmNewBoard}
        danger
        title="Start a new board?"
        message="This will clear all current pages and notes. Your current work will be saved as a draft first."
        confirmLabel="New board"
        onConfirm={handleNewBoard}
        onCancel={() => setConfirmNewBoard(false)}
      />

      {/* Send-to-chat (forward) picker */}
      {showForward && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 animate-cn-fade-up"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeForward() }}
        >
          <div className="bg-cn-white w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl max-h-[75vh] flex flex-col shadow-2xl border border-cn-gray-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
              <div>
                <p className="font-bold text-cn-charcoal">Send scribble to…</p>
                <p className="text-xs text-cn-gray-400 mt-0.5">Posts the current page as an image</p>
              </div>
              <button
                onClick={closeForward}
                disabled={!!forwardSending}
                className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast disabled:opacity-40"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <input
                value={forwardQuery}
                onChange={(e) => setForwardQuery(e.target.value)}
                placeholder="Search conversations…"
                autoFocus
                className="w-full bg-cn-gray-100 border border-cn-gray-200 rounded-full px-4 py-2 text-sm text-cn-gray-800 placeholder-cn-gray-400 focus:outline-none focus:border-cn-blue transition-fast"
              />
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-2 pb-2">
              {(() => {
                const rows = forwardConvs
                  .map((c) => {
                    const isDirect = c.type === 'direct'
                    const other = isDirect ? c.members?.find((m) => m.user_id !== user?.id) : null
                    const isSelf = isDirect && !other
                    const name = isDirect
                      ? isSelf ? 'You' : (other?.user?.display_name || other?.user?.full_name || 'Direct')
                      : (c.name ?? 'Group')
                    const avatarUser = isDirect
                      ? (isSelf ? c.members?.find((m) => m.user_id === user?.id)?.user : other?.user)
                      : { full_name: c.name, avatar_url: c.avatar_url }
                    const subtitle = isDirect
                      ? 'Direct message'
                      : `${c.member_count ?? c.members?.length ?? 0} member${(c.member_count ?? c.members?.length ?? 0) === 1 ? '' : 's'}`
                    return { c, name, avatarUser, subtitle }
                  })
                  .filter((r) => r.name.toLowerCase().includes(forwardQuery.trim().toLowerCase()))

                if (forwardConvs.length === 0) {
                  return <p className="px-3 py-8 text-sm text-cn-gray-400 text-center">No conversations available</p>
                }
                if (rows.length === 0) {
                  return <p className="px-3 py-8 text-sm text-cn-gray-400 text-center">No matches for “{forwardQuery}”</p>
                }
                return rows.map(({ c, name, avatarUser, subtitle }) => {
                  const sending = forwardSending === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => sendBoardTo(c.id)}
                      disabled={!!forwardSending}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-cn-gray-100 transition-fast disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserAvatar user={avatarUser} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-cn-gray-800 truncate">{name}</p>
                        <p className="text-xs text-cn-gray-400 truncate">{subtitle}</p>
                      </div>
                      {sending
                        ? <span className="w-4 h-4 rounded-full border-2 border-cn-gray-300 animate-spin flex-shrink-0" style={{ borderTopColor: 'var(--cn-blue)' }} />
                        : <PaperAirplaneIcon className="w-4 h-4 text-cn-gray-300 flex-shrink-0" />}
                    </button>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
