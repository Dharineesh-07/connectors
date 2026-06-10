import { useEffect } from 'react'

// A styled in-app replacement for window.confirm(). Render it always and toggle
// with `open` so the Escape/keydown hook stays mounted.
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 animate-cn-fade-up"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div className="bg-cn-white rounded-2xl shadow-2xl border border-cn-gray-200 w-[400px] max-w-[92vw] overflow-hidden">
        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-cn-charcoal">{title}</h3>
          {message && (
            <p className="text-sm text-cn-gray-500 mt-1.5 leading-relaxed">{message}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-cn-gray-50 border-t border-cn-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-cn-gray-600 rounded-lg hover:bg-cn-gray-200 transition-fast"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-fast"
            style={{ background: danger ? 'var(--cn-danger)' : 'var(--cn-blue)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
