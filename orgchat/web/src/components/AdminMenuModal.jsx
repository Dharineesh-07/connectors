import { NavLink } from 'react-router-dom'
import { 
  XMarkIcon, 
  ShieldCheckIcon,
  ChartBarIcon,
  UsersIcon,
  DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline'

export default function AdminMenuModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4 py-8 overflow-y-auto"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 shadow-modal animate-cn-scale-in"
        style={{
          background: 'linear-gradient(145deg, #1A202C 0%, #2D3748 100%)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cn-red/20 flex items-center justify-center">
              <ShieldCheckIcon className="w-6 h-6 text-cn-red" />
            </div>
            <h2 className="text-lg font-black text-white tracking-wide uppercase">Admin Console</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {[
            { to: '/admin', label: 'Dashboard', desc: 'System overview & statistics', icon: ChartBarIcon, end: true },
            { to: '/admin/users', label: 'User Management', desc: 'Manage accounts & permissions', icon: UsersIcon, end: false },
            { to: '/admin/audit-logs', label: 'Audit Logs', desc: 'Track all administrative actions', icon: DocumentMagnifyingGlassIcon, end: false },
          ].map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-start gap-4 p-4 rounded-2xl transition-all group ${
                    isActive 
                      ? 'bg-cn-red text-white shadow-lg shadow-cn-red/20' 
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : 'bg-black/20 group-hover:bg-cn-red/20 group-hover:text-cn-red transition-all'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold tracking-tight">{link.label}</p>
                      <p className={`text-[10px] mt-0.5 opacity-60 font-medium ${isActive ? 'text-white' : ''}`}>
                        {link.desc}
                      </p>
                    </div>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>

        <div className="px-6 py-4 bg-black/20 border-t border-white/5">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] text-center">
            Privileged Access Only
          </p>
        </div>
      </div>
    </div>
  )
}
