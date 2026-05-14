import dayjs from 'dayjs'
import UserAvatar from '../UserAvatar'

const ACTION_META = {
  create_user: {
    label: 'Create User',
    bg: 'rgba(34,197,94,0.14)',
    color: 'var(--cn-success)',
  },
  deactivate_user: {
    label: 'Deactivate User',
    bg: 'rgba(204,51,51,0.14)',
    color: 'var(--cn-danger)',
  },
  update_user: {
    label: 'Update User',
    bg: 'rgba(51,153,204,0.14)',
    color: 'var(--cn-blue)',
  },
  reset_password: {
    label: 'Reset Password',
    bg: 'rgba(245,158,11,0.16)',
    color: 'var(--cn-warning)',
  },
  broadcast: {
    label: 'Broadcast',
    bg: 'rgba(51,153,204,0.14)',
    color: 'var(--cn-blue)',
  },
}

function formatLabel(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DetailChips({ details }) {
  const entries = Object.entries(details ?? {}).filter(([, value]) => value !== undefined)

  if (!entries.length) {
    return <span className="text-sm text-cn-gray-400">No additional details</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="max-w-[240px] truncate rounded-full border border-cn-gray-200 bg-cn-gray-100 px-2.5 py-1 text-xs text-cn-gray-600"
          title={`${formatLabel(key)}: ${formatValue(value)}`}
        >
          <span className="font-semibold text-cn-charcoal">{formatLabel(key)}:</span>{' '}
          {formatValue(value)}
        </span>
      ))}
    </div>
  )
}

export default function AuditLogItem({ log }) {
  const meta = ACTION_META[log.action] ?? {
    label: formatLabel(log.action),
    bg: 'var(--cn-gray-100)',
    color: 'var(--cn-gray-600)',
  }

  return (
    <tr className="border-b border-cn-gray-200 hover:bg-cn-gray-100 transition-fast">
      <td className="px-4 py-4 align-top">
        <div className="text-sm font-semibold text-cn-charcoal">
          {dayjs(log.created_at).format('MMM D, YYYY')}
        </div>
        <div className="text-xs text-cn-gray-400 mt-0.5">
          {dayjs(log.created_at).format('HH:mm')}
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar user={log.admin} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cn-charcoal truncate">
              {log.admin?.full_name ?? 'Unknown admin'}
            </div>
            <div className="text-xs text-cn-gray-400 truncate">
              {log.admin?.email ?? 'No email'}
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ backgroundColor: meta.bg, color: meta.color }}
        >
          {meta.label}
        </span>
      </td>

      <td className="px-4 py-4 align-top">
        {log.target_user ? (
          <div className="min-w-0">
            <div className="text-sm font-medium text-cn-charcoal truncate">
              {log.target_user.full_name}
            </div>
            <div className="text-xs text-cn-gray-400 truncate">
              {log.target_user.email}
            </div>
          </div>
        ) : (
          <span className="text-sm text-cn-gray-400">System</span>
        )}
      </td>

      <td className="px-4 py-4 align-top">
        <DetailChips details={log.details} />
      </td>
    </tr>
  )
}
