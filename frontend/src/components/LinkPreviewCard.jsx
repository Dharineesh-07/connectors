import { useEffect, useState } from 'react'
import { getLinkPreview } from '../api/messages'

const URL_REGEX = /https?:\/\/[^\s<>"]+/g

export function extractURLs(text) {
  if (!text) return []
  return [...new Set(text.match(URL_REGEX) || [])]
}

export default function LinkPreviewCard({ url }) {
  const [preview, setPreview] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getLinkPreview(url)
      .then((data) => {
        if (!cancelled && data.title) setPreview(data)
        else if (!cancelled) setFailed(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [url])

  if (failed || !preview) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex gap-3 mt-2 rounded-xl overflow-hidden border border-cn-gray-200 bg-cn-white hover:bg-cn-gray-100 transition-fast max-w-[320px]"
      style={{ boxShadow: 'var(--shadow-card)', textDecoration: 'none' }}
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-20 h-20 object-cover flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <div className="flex flex-col justify-center py-2 pr-3 min-w-0 gap-0.5">
        {preview.site_name && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-cn-gray-400 truncate">
            {preview.site_name}
          </span>
        )}
        <p className="text-xs font-semibold text-cn-charcoal leading-snug line-clamp-2">
          {preview.title}
        </p>
        {preview.description && (
          <p className="text-[11px] text-cn-gray-500 leading-snug line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  )
}
