import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Logo from '../Logo'

const FIELDS = [
  { name: 'email',         label: 'Email',              type: 'email',    required: true },
  { name: 'full_name',     label: 'Full Name',           type: 'text',     required: true },
  { name: 'department',    label: 'Department',          type: 'text'                     },
]

export default function AddUserModal({ onClose, onSubmit, loading }) {
  const [form, setForm] = useState({
    email: '', full_name: '', department: '', role: 'employee',
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-cn-white rounded-lg shadow-modal w-full max-w-md mx-4 animate-cn-fade-up overflow-hidden"
      >
        {/* Gradient top bar */}
        <div className="h-1 cn-accent-bar" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cn-gray-200">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <h2 className="font-bold text-cn-charcoal">Add New Employee</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light rounded transition-fast"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}
          className="px-6 py-5 space-y-4"
        >
          {FIELDS.map((f) => (
            <div key={f.name}>
              <label className="block text-xs font-medium text-cn-gray-600 mb-1.5">
                {f.label}{' '}
                {f.required && <span className="text-cn-red">*</span>}
              </label>
              <input
                type={f.type}
                required={f.required}
                value={form[f.name]}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full border border-cn-gray-200 rounded-sm px-3.5 py-2.5 text-sm text-cn-gray-800 placeholder-cn-gray-400 focus:outline-none transition-fast"
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--cn-blue)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(51,153,204,0.15)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = ''
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-cn-gray-600 mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className="w-full border border-cn-gray-200 rounded-sm px-3.5 py-2.5 text-sm text-cn-gray-800 focus:outline-none transition-fast bg-cn-white"
              onFocus={(e) => { e.target.style.borderColor = 'var(--cn-blue)' }}
              onBlur={(e) => { e.target.style.borderColor = '' }}
            >
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-sm border border-cn-gray-200 text-cn-gray-600 text-sm hover:bg-cn-gray-100 transition-fast font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-sm bg-cn-red hover:bg-cn-red-dark disabled:opacity-50 text-white text-sm font-semibold transition-fast"
            >
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
