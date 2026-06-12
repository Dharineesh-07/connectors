import { useQuery } from 'react-query'
import {
  UsersIcon,
  WifiIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { getStats } from '../../api/admin'
import { useAuth } from '../../context/AuthContext'
import Logo from '../../components/Logo'
import Loader from '../../components/Loader'

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #3399CC 0%, #2277AA 100%)',
  'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
]

function StatCard({ icon: Icon, label, value, gradient, index }) {
  return (
    <div
      className="cn-stat-card rounded-2xl p-6 flex items-center gap-5 relative overflow-hidden cursor-default animate-cn-fade-up"
      style={{
        background: gradient,
        boxShadow: '0 6px 20px rgba(45,55,72,0.15)',
        animationDelay: `${index * 120}ms`,
      }}
    >
      {/* Shine overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'radial-gradient(ellipse at 20% 20%, rgba(255,255,255,0.6) 0%, transparent 60%)',
        }}
      />
      {/* Decorative circle */}
      <div
        className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full opacity-15"
        style={{ background: 'rgba(255,255,255,0.4)' }}
      />
      <div
        className="relative z-10 w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.25)' }}
      >
        <Icon className="w-7 h-7 text-white" />
      </div>
      <div className="relative z-10">
        <p className="text-4xl font-black text-white">{value ?? '—'}</p>
        <p className="text-sm text-white/80 mt-1 font-medium">{label}</p>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: stats, isLoading } = useQuery('admin-stats', getStats, {
    refetchInterval: 30_000,
  })

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const cards = [
    { icon: UsersIcon, label: 'Total Employees', value: stats?.total_users },
    { icon: WifiIcon, label: 'Active Users', value: stats?.active_users },
  ]

  return (
    <div>
      {/* Welcome header */}
      <div
        className="px-8 py-6 flex items-center justify-between relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #CC3333 0%, #2D3748 50%, #2277AA 100%)',
        }}
      >
        {/* Radial overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          }}
        />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative z-10">
          <p className="text-white/70 text-sm font-medium">{greeting},</p>
          <h1 className="text-white text-2xl font-black mt-0.5">
            {user?.display_name || user?.full_name}
          </h1>
          <p className="text-white/50 text-xs mt-1 font-medium">Admin Dashboard</p>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <Logo size="md" showText={false} className="opacity-80" />
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-all duration-200"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-4 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, #CC3333, #3399CC)' }} />
          <h2 className="text-xs font-bold text-cn-gray-600 uppercase tracking-widest">
            Overview
          </h2>
        </div>
        {isLoading ? (
          <Loader variant="block" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cards.map((c, i) => (
              <StatCard key={c.label} {...c} gradient={CARD_GRADIENTS[i]} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
