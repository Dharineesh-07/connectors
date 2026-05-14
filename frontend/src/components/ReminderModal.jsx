import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'

export default function ReminderModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    is_completed: false
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        due_date: dayjs(initialData.due_date).format('YYYY-MM-DDTHH:mm'),
        is_completed: initialData.is_completed || false
      })
    } else {
      setFormData({
        title: '',
        description: '',
        due_date: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
        is_completed: false
      })
    }
  }, [initialData, isOpen])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-cn-fade-in">
      <div className="bg-cn-white w-full max-w-md rounded-2xl shadow-modal overflow-hidden animate-cn-scale-in">
        <div className="p-6 border-b border-cn-gray-100 flex items-center justify-between cn-gradient-brand text-white">
          <h3 className="text-lg font-bold">
            {initialData ? 'Edit Reminder' : 'New Reminder'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-all">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-cn-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-cn-blue transition-all"
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Due Date & Time</label>
            <input
              type="datetime-local"
              required
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              className="w-full px-4 py-3 bg-cn-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-cn-blue transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description (Optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-cn-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-cn-blue transition-all h-24 resize-none"
              placeholder="Add more details..."
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-cn-gray-100 text-cn-gray-600 font-bold rounded-xl hover:bg-cn-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-3 cn-gradient-brand text-white font-bold rounded-xl shadow-lg shadow-cn-blue/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {initialData ? 'Update Reminder' : 'Create Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
