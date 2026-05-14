import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)', animation: 'lb-fade-in 0.18s ease' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes lb-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lb-scale-in { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
      <img
        src={src}
        alt={alt}
        className="rounded-xl object-contain"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
          animation: 'lb-scale-in 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full text-white text-2xl leading-none transition-colors"
        style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
        aria-label="Close"
      >
        ×
      </button>
      {alt && (
        <p
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/80 text-sm px-4 py-1.5 rounded-full truncate max-w-[80vw]"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          {alt}
        </p>
      )}
    </div>,
    document.body
  )
}
