import { useState } from 'react'
import { XMarkIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { useMutation, useQueryClient } from 'react-query'
import { createTask } from '../api/tasks'
import toast from 'react-hot-toast'

export default function TaskCreationModal({ isOpen, onClose, prefillTitle = '', conversationId = null, messageId = null, members = [] }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(prefillTitle)
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')

  const createMut = useMutation(createTask, {
    onSuccess: () => {
      queryClient.invalidateQueries('tasks')
      toast.success('Task created')
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to create task'),
  })

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    createMut.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      conversation_id: conversationId || undefined,
      message_id: messageId || undefined,
      assigned_to: assignedTo || undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-cn-fade-in">
      <div className="bg-cn-white rounded-2xl shadow-2xl border border-cn-gray-100 w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cn-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl cn-gradient-brand flex items-center justify-center">
              <ClipboardDocumentListIcon className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-black text-cn-charcoal">Create Task</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue focus:ring-2 focus:ring-cn-blue/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue focus:ring-2 focus:ring-cn-blue/10 transition-all resize-none"
            />
          </div>

          {members.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Assign To</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue focus:ring-2 focus:ring-cn-blue/10 transition-all"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user?.id || m.user_id} value={m.user?.id || m.user_id}>
                    {m.user?.display_name || m.user?.full_name || m.user?.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Due Date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue focus:ring-2 focus:ring-cn-blue/10 transition-all"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-cn-gray-200 text-sm font-bold text-cn-gray-500 hover:bg-cn-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createMut.isLoading}
              className="flex-1 py-2.5 rounded-xl cn-gradient-brand text-white text-sm font-bold shadow-lg shadow-cn-blue/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {createMut.isLoading ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
