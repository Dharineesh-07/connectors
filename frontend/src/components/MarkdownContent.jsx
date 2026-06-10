import { useMemo } from 'react'
import { renderMarkdown } from '../utils/markdown'
import 'prismjs/themes/prism-tomorrow.css'

export default function MarkdownContent({ text, isOwn }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return (
    <div
      className={`cn-markdown ${isOwn ? 'cn-markdown-own' : 'cn-markdown-other'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
