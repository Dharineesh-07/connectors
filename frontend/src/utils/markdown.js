import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import DOMPurify from 'dompurify'

marked.use(
  markedHighlight({
    highlight(code, lang) {
      if (lang && Prism.languages[lang]) {
        return Prism.highlight(code, Prism.languages[lang], lang)
      }
      return code
    },
  })
)

marked.use({ gfm: true, breaks: true })

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 's', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4',
  'a', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

export function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return ''
  const raw = marked.parse(text)
  // Re-apply @here/@channel mention styling that survives sanitization
  const withMentions = raw.replace(
    /(@here|@channel)/g,
    '<span class="cn-msg-mention">$1</span>'
  )
  return DOMPurify.sanitize(withMentions, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}
