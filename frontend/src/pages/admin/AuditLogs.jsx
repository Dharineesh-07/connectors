import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getAuditLogs } from '../../api/admin'
import AuditLogItem from '../../components/admin/AuditLogItem'
import Loader from '../../components/Loader'

const PAGE_SIZE = 20
const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'create_user', label: 'Create User' },
  { value: 'update_user', label: 'Update User' },
  { value: 'deactivate_user', label: 'Deactivate User' },
  { value: 'reset_password', label: 'Reset Password' },
  { value: 'broadcast', label: 'Broadcast' },
]

export default function AuditLogs() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')

  const { data, isLoading } = useQuery(
    ['audit-logs', page, action],
    () => getAuditLogs({ page, limit: PAGE_SIZE, ...(action ? { action } : {}) }),
    { keepPreviousData: true }
  )

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-cn-charcoal">Audit Logs</h2>
          <p className="text-sm text-cn-gray-600 mt-0.5">
            {total} recorded admin events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(e) => {
              setPage(1)
              setAction(e.target.value)
            }}
            className="min-w-44 rounded-sm border border-cn-gray-200 bg-cn-white px-3 py-2 text-sm font-medium text-cn-gray-600 focus:outline-none focus:border-cn-blue transition-fast"
          >
            {ACTION_FILTERS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-fast"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-cn-white rounded-md overflow-hidden shadow-card border border-cn-gray-200">
        {isLoading ? (
          <Loader variant="block" />
        ) : data?.logs?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="bg-cn-gray-100 border-b border-cn-gray-200">
                  {['Time', 'Actor', 'Action', 'Target', 'Details'].map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-bold text-cn-gray-600 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => <AuditLogItem key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-cn-gray-400 p-10 text-sm text-center">No audit logs found.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 bg-cn-white border border-cn-gray-200 rounded-sm text-sm text-cn-gray-600 hover:bg-cn-gray-100 disabled:opacity-40 transition-fast"
          >
            Previous
          </button>
          <span className="text-sm text-cn-gray-600 font-medium">
            {rangeStart}-{rangeEnd} of {total}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 bg-cn-white border border-cn-gray-200 rounded-sm text-sm text-cn-gray-600 hover:bg-cn-gray-100 disabled:opacity-40 transition-fast"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
