import { useState } from 'react'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

export default function PollCreator({ onClose, onSubmit }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [isMultiple, setIsMultiple] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const addOption = () => {
    if (options.length < 10) setOptions((v) => [...v, ''])
  }

  const removeOption = (i) => {
    if (options.length <= 2) return
    setOptions((v) => v.filter((_, idx) => idx !== i))
  }

  const updateOption = (i, val) =>
    setOptions((v) => v.map((o, idx) => (idx === i ? val : o)))

  const validOptions = options.map((o) => o.trim()).filter(Boolean)
  const canSubmit = question.trim().length > 0 && validOptions.length >= 2

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({ question: question.trim(), options: validOptions, is_multiple: isMultiple })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cn-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-cn-fade-up"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
          <h2 className="text-base font-bold text-cn-charcoal flex items-center gap-2">
            <span>📊</span> Create Poll
          </h2>
          <button onClick={onClose} className="p-1 text-cn-gray-400 hover:text-cn-gray-600 transition-fast">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-cn-gray-500 mb-1.5 uppercase tracking-wide">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask your team something…"
              className="w-full border border-cn-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-cn-gray-50 focus:outline-none focus:border-cn-blue text-cn-gray-800 placeholder-cn-gray-400 transition-fast"
              maxLength={500}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-cn-gray-500 mb-1.5 uppercase tracking-wide">
              Options
            </label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cn-gray-400 w-5 text-right flex-shrink-0">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border border-cn-gray-200 rounded-xl px-3.5 py-2 text-sm bg-cn-gray-50 focus:outline-none focus:border-cn-blue text-cn-gray-800 placeholder-cn-gray-400 transition-fast"
                    maxLength={255}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="p-1.5 text-cn-gray-400 hover:text-red-500 transition-fast disabled:opacity-30 flex-shrink-0"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold transition-fast"
                style={{ color: 'var(--cn-blue)' }}
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add option
              </button>
            )}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              className="relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
              style={{ background: isMultiple ? 'var(--cn-blue)' : 'var(--cn-gray-300)' }}
              onClick={() => setIsMultiple((v) => !v)}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                style={{ transform: isMultiple ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </div>
            <span className="text-sm text-cn-gray-700">Allow multiple selections</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-cn-gray-200 text-sm font-semibold text-cn-gray-600 hover:bg-cn-gray-50 transition-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-fast disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #CC3333 0%, #3399CC 100%)' }}
            >
              {submitting ? 'Creating…' : 'Create Poll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
