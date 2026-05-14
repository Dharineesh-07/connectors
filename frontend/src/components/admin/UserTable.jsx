import { KeyIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import UserAvatar from '../UserAvatar'

const COLS = ['Employee', 'Email', 'Department', 'Role', 'Status', 'Joined', 'Actions']

export default function UserTable({ users, currentUserId, onEdit, onDeactivate, onResetPassword }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-cn-gray-100 border-b border-cn-gray-200">
            {COLS.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-bold text-cn-gray-600 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="border-b border-cn-gray-200 hover:bg-cn-gray-100 transition-fast"
            >
              {/* Employee */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <UserAvatar user={u} size="sm" online={u.is_online} />
                  <span className="font-semibold text-cn-charcoal">{u.full_name}</span>
                </div>
              </td>
              {/* Email */}
              <td className="px-4 py-3 text-cn-gray-600">{u.email}</td>
              {/* Department */}
              <td className="px-4 py-3 text-cn-gray-600">{u.department ?? '—'}</td>
              {/* Role */}
              <td className="px-4 py-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    u.role === 'admin'
                      ? 'bg-cn-red-light text-cn-red'
                      : 'bg-cn-blue-light text-cn-blue'
                  }`}
                >
                  {u.role}
                </span>
              </td>
              {/* Status */}
              <td className="px-4 py-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    u.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-cn-gray-200 text-cn-gray-400'
                  }`}
                >
                  {u.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              {/* Joined */}
              <td className="px-4 py-3 text-cn-gray-600">
                {dayjs(u.created_at).format('MMM D, YYYY')}
              </td>
              {/* Actions */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit?.(u)}
                    className="p-1.5 text-cn-blue hover:bg-cn-blue-light rounded transition-fast"
                    title="Edit"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onResetPassword?.(u)}
                    className="p-1.5 text-cn-gray-600 hover:bg-cn-gray-100 rounded transition-fast"
                    title="Reset password"
                  >
                    <KeyIcon className="w-4 h-4" />
                  </button>
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => onDeactivate?.(u)}
                      className="p-1.5 text-cn-red hover:bg-cn-red-light rounded transition-fast"
                      title="Deactivate"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-cn-gray-400">
                No employees found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
