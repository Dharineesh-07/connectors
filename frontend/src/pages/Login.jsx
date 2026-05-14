import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  EyeIcon, 
  EyeSlashIcon, 
  MoonIcon, 
  SunIcon, 
  ArrowLeftIcon,
  KeyIcon,
  EnvelopeIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { forgotPassword, resetPassword } from '../api/auth'
import Logo from '../components/Logo'
import toast from 'react-hot-toast'

const INPUT_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  border: '2px solid var(--cn-gray-200)',
  borderRadius: '10px',
  padding: '12px 16px',
  fontSize: '14px',
  color: 'var(--cn-gray-800)',
  background: 'var(--cn-input-bg)',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 180ms ease, box-shadow 180ms ease',
}

const BUTTON_STYLE = (loading, isDanger = true) => ({
  marginTop: '8px',
  width: '100%',
  padding: '14px',
  borderRadius: '10px',
  border: 'none',
  cursor: loading ? 'not-allowed' : 'pointer',
  fontSize: '15px',
  fontWeight: 700,
  color: '#FFFFFF',
  background: loading
    ? 'var(--cn-gray-400)'
    : isDanger 
      ? 'linear-gradient(135deg, #CC3333 0%, #A52266 100%)'
      : 'linear-gradient(135deg, #3399CC 0%, #2277AA 100%)',
  boxShadow: loading ? 'none' : isDanger ? '0 6px 20px rgba(204,51,51,0.25)' : '0 6px 20px rgba(51,153,204,0.25)',
  transition: 'transform 150ms ease, box-shadow 150ms ease',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
})

export default function Login() {
  const { login, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user])
  
  const [view, setView] = useState('login') // 'login' | 'forgot' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState('')

  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestOTP = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      toast.success('OTP sent to your email!')
      setView('reset')
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email, otp, newPassword)
      toast.success('Password reset successful! Please login.')
      setView('login')
      setPassword('')
      setOtp('')
      setNewPassword('')
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to reset password. Check OTP or password strength.')
    } finally {
      setLoading(false)
    }
  }

  const focusStyle = {
    borderColor: 'var(--cn-blue)',
    boxShadow: '0 0 0 4px rgba(51,153,204,0.12)',
    background: 'var(--cn-focus-bg)',
  }

  const renderContent = () => {
    if (view === 'forgot') {
      return (
        <div className="animate-cn-fade-up">
          <button 
            onClick={() => setView('login')}
            className="flex items-center gap-1.5 text-xs font-bold text-cn-gray-400 hover:text-cn-charcoal transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            Back to login
          </button>
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cn-blue-light text-cn-blue mb-4">
            <EnvelopeIcon className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-cn-charcoal tracking-tight mb-2">Forgot password?</h1>
          <p className="text-sm text-cn-gray-600 mb-8 leading-relaxed">
            No worries! Enter your email and we'll send you a 6-digit OTP to reset your password.
          </p>

          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ ...INPUT_STYLE, ...(focused === 'email' ? focusStyle : {}) }}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused('')}
              />
            </div>
            <button 
              type="submit" 
              disabled={loading} 
              style={BUTTON_STYLE(loading, false)}
            >
              {loading ? 'Sending...' : 'Send OTP →'}
            </button>
          </form>
        </div>
      )
    }

    if (view === 'reset') {
      return (
        <div className="animate-cn-fade-up">
          <button 
            onClick={() => setView('forgot')}
            className="flex items-center gap-1.5 text-xs font-bold text-cn-gray-400 hover:text-cn-charcoal transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            Change email
          </button>
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cn-red-light text-cn-red mb-4">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-cn-charcoal tracking-tight mb-2">Reset Password</h1>
          <p className="text-sm text-cn-gray-600 mb-8 leading-relaxed">
            Check your email <b>{email}</b> for the 6-digit code. It expires in 3 minutes.
          </p>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Verification Code</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit OTP"
                className="tracking-[0.5em] text-center font-bold"
                style={{ ...INPUT_STYLE, fontSize: '18px', ...(focused === 'otp' ? focusStyle : {}) }}
                onFocus={() => setFocused('otp')}
                onBlur={() => setFocused('')}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...INPUT_STYLE, paddingRight: '44px', ...(focused === 'newPwd' ? focusStyle : {}) }}
                  onFocus={() => setFocused('newPwd')}
                  onBlur={() => setFocused('')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-cn-gray-400 hover:text-cn-blue transition-colors"
                >
                  {showPwd ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[10px] text-cn-gray-400 mt-2 ml-1">Min 8 chars, 1 uppercase, 1 special char</p>
            </div>
            <button 
              type="submit" 
              disabled={loading} 
              style={BUTTON_STYLE(loading, true)}
            >
              {loading ? 'Resetting...' : 'Reset Password →'}
            </button>
          </form>
        </div>
      )
    }

    return (
      <div className="animate-cn-fade-up">
        <h1 className="text-2xl font-black text-cn-charcoal tracking-tight mb-1">Welcome back</h1>
        <p className="text-sm text-cn-gray-600 mb-8">Sign in to Connectors</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-cn-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email address</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ ...INPUT_STYLE, ...(focused === 'email' ? focusStyle : {}) }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused('')}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 ml-1 pr-1">
              <label className="block text-[10px] font-black text-cn-gray-400 uppercase tracking-widest">Password</label>
              <button 
                type="button"
                onClick={() => { setView('forgot'); setError(''); }}
                className="text-[10px] font-black text-cn-blue uppercase tracking-widest hover:text-cn-blue-dark transition-colors"
              >
                Forgot?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...INPUT_STYLE, paddingRight: '44px', ...(focused === 'password' ? focusStyle : {}) }}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused('')}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cn-gray-400 hover:text-cn-blue transition-colors"
              >
                {showPwd ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            style={BUTTON_STYLE(loading, true)}
          >
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        overflow: 'hidden',
        background: 'var(--cn-login-bg)',
      }}
    >
      {/* Theme Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-8 right-8 z-20 w-10 h-10 rounded-full border border-cn-gray-200 bg-cn-white text-cn-gray-600 shadow-card flex items-center justify-center hover:scale-110 transition-all duration-200"
        title={themeLabel}
      >
        <ThemeIcon className="w-5 h-5" />
      </button>

      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,var(--cn-login-orb-red)0%,transparent 70%)] blur-[60px] animate-cn-float pointer-events-none opacity-60" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[440px] h-[440px] rounded-full bg-[radial-gradient(circle,var(--cn-login-orb-blue)0%,transparent 70%)] blur-[60px] animate-cn-float pointer-events-none opacity-60" style={{ animationDelay: '3s' }} />

      <div
        className="relative z-10 w-full max-w-[420px] rounded-[24px] overflow-hidden bg-cn-white shadow-modal border border-cn-gray-200/50"
      >
        {/* Accent Bar */}
        <div className="h-1.5 cn-gradient-brand-animated" />

        <div className="p-10">
          <div className="flex justify-center mb-10">
            <Logo size="lg" />
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-cn-red-light border-l-4 border-cn-red flex items-start gap-3 animate-cn-fade-up">
              <span className="font-bold text-cn-red text-sm">!</span>
              <span className="text-xs text-cn-red font-semibold leading-relaxed">{error}</span>
            </div>
          )}

          {renderContent()}
        </div>
      </div>

      <p className="absolute bottom-8 text-[10px] font-bold text-cn-gray-400 uppercase tracking-[0.2em]">
        © Connectors — Internal Platform
      </p>
    </div>
  )
}
