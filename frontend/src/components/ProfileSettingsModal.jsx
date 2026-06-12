import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  XMarkIcon,
  CameraIcon,
  UserIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  PhoneIcon,
  LockClosedIcon,
  BellIcon,
  BellSlashIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { uploadFile } from '../api/messages'
import { updateProfile } from '../api/users'
import { changePassword } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'

const FONT_SIZES = {
  sm: { label: 'S', value: '0.75rem', title: 'Small' },
  md: { label: 'M', value: '0.875rem', title: 'Medium' },
  lg: { label: 'L', value: '1.0625rem', title: 'Large' },
}

const NOTIFICATION_TYPES = [
  { value: 'all', label: 'All messages' },
  { value: 'dms_only', label: 'DMs only' },
  { value: 'mentions_only', label: 'Mentions only' },
]

function Toggle({ enabled, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none"
      style={{ background: enabled ? 'var(--cn-blue, #2277AA)' : 'rgba(255,255,255,0.15)' }}
      aria-label={label}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200"
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

export default function ProfileSettingsModal({ onClose }) {
  const { user, updateUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [stream, setStream] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  // — Saveable fields (require Save button)
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // — Instant-save preferences (localStorage only)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('notifications_enabled') !== 'false'
  )
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('sound_enabled') !== 'false'
  )
  const [notificationType, setNotificationType] = useState(
    () => localStorage.getItem('notification_type') || 'all'
  )
  const [messageFontSize, setMessageFontSize] = useState(
    () => localStorage.getItem('msg_font_size') || 'md'
  )
  const initialFontSize = useRef(localStorage.getItem('msg_font_size') || 'md')

  useEffect(() => {
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [stream])

  useEffect(() => {
    if (cameraOpen && stream && videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [cameraOpen, stream])

  const toggleNotifications = () => setNotificationsEnabled(prev => !prev)
  const toggleSound = () => setSoundEnabled(prev => !prev)
  const handleNotificationType = (value) => setNotificationType(value)
  const handleFontSize = (size) => setMessageFontSize(size)

  const openCamera = async () => {
    if (loading) return
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setStream(mediaStream)
      setCameraOpen(true)
    } catch {
      toast.error('Could not access camera. Please allow camera permissions.')
    }
  }

  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
    setCameraOpen(false)
  }

  const takePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' })
      closeCamera()
      setLoading(true)
      try {
        const uploaded = await uploadFile(file)
        const updatedUser = await updateProfile({ avatar_url: uploaded.file_url })
        updateUser({ avatar_url: updatedUser.avatar_url })
        toast.success('Profile picture updated successfully')
      } catch {
        toast.error('Failed to update profile picture')
      } finally {
        setLoading(false)
      }
    }, 'image/jpeg', 0.92)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      let profileUpdated = false

      // 1. Update display name if changed
      const currentDisplayName = user?.display_name || ''
      if (displayName !== currentDisplayName) {
        const updatedUser = await updateProfile({ display_name: displayName || null })
        updateUser({ display_name: updatedUser.display_name })
        profileUpdated = true
      }

      // 2. Update phone number if changed
      if (phoneNumber !== (user?.phone_number || '')) {
        if (phoneNumber && phoneNumber.length !== 10) {
          toast.error('Phone number must be exactly 10 digits')
          setSaving(false)
          return
        }
        const updatedUser = await updateProfile({ phone_number: phoneNumber })
        updateUser({ phone_number: updatedUser.phone_number })
        profileUpdated = true
      }

      // 3. Change password if provided
      if (currentPassword && newPassword) {
        await changePassword(currentPassword, newPassword)
        toast.success('Password changed successfully')
        setCurrentPassword('')
        setNewPassword('')
        profileUpdated = true
      } else if (newPassword && !currentPassword) {
        toast.error('Please enter your current password to set a new one')
        setSaving(false)
        return
      }

      // Save notification preferences
      const prevNotificationsEnabled = localStorage.getItem('notifications_enabled') !== 'false'
      const prevSoundEnabled = localStorage.getItem('sound_enabled') !== 'false'
      const prevNotificationType = localStorage.getItem('notification_type') || 'all'
      if (
        notificationsEnabled !== prevNotificationsEnabled ||
        soundEnabled !== prevSoundEnabled ||
        notificationType !== prevNotificationType
      ) {
        localStorage.setItem('notifications_enabled', String(notificationsEnabled))
        localStorage.setItem('sound_enabled', String(soundEnabled))
        localStorage.setItem('notification_type', notificationType)
        profileUpdated = true
      }

      // Save font size
      if (messageFontSize !== initialFontSize.current) {
        localStorage.setItem('msg_font_size', messageFontSize)
        document.documentElement.style.setProperty('--msg-font-size', FONT_SIZES[messageFontSize].value)
        initialFontSize.current = messageFontSize
        profileUpdated = true
      }

      if (profileUpdated) {
        toast.success('Profile updated successfully')
      } else if (!currentPassword && !newPassword) {
        toast('No changes to save', { icon: 'ℹ️' })
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4 py-8 overflow-y-auto transition-all duration-300"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md my-auto overflow-hidden rounded-2xl border border-white/10 shadow-2xl animate-cn-fade-up relative"
        style={{
          background: 'linear-gradient(145deg, #1A202C 0%, #2D3748 100%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(51,153,204,0.8) 0%, transparent 70%)' }}
        />

        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 relative z-10">
          <h2 className="text-lg font-black text-white tracking-wide">Profile Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col relative z-10 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative group cursor-pointer mb-6" onClick={openCamera}>
              <div className="relative rounded-full p-1" style={{ background: 'linear-gradient(135deg, rgba(204,51,51,0.5) 0%, rgba(51,153,204,0.5) 100%)' }}>
                <div className="rounded-full overflow-hidden border-4 border-[#1A202C]">
                  <UserAvatar user={user} size="xl" />
                </div>
              </div>
              <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                <CameraIcon className="w-7 h-7 text-white mb-1" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">Take Photo</span>
              </div>
              {loading && (
                <div className="absolute inset-0 bg-[#1A202C]/80 rounded-full flex items-center justify-center">
                  <span className="animate-cn-spin inline-block w-8 h-8 border-2 border-cn-blue border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          </div>

          {/* Camera modal */}
          {cameraOpen && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md"
              onMouseDown={closeCamera}
            >
              <div
                className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-white/10 shadow-2xl"
                style={{ background: 'linear-gradient(145deg, #1A202C 0%, #2D3748 100%)' }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h3 className="text-white font-bold text-base tracking-wide">Take Your Profile Photo</h3>
                <div className="rounded-xl overflow-hidden border-2 border-white/10">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-72 h-54 object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-sm font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={takePhoto}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cn-blue to-cn-blue-dark hover:from-cn-blue-light hover:to-cn-blue text-white font-bold text-sm transition-all shadow-lg shadow-cn-blue/20 flex items-center justify-center gap-2"
                  >
                    <CameraIcon className="w-4 h-4" />
                    Capture
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            {/* ── Profile Info ── */}
            <div className="w-full bg-white/5 rounded-xl p-5 border border-white/10 space-y-4">

              {/* Display Name — editable */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={user?.full_name || 'Enter display name'}
                    maxLength={80}
                    className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-cn-blue transition-colors text-sm"
                  />
                  <p className="text-[10px] text-white/25 mt-0.5">
                    Legal name: {user?.full_name}
                  </p>
                </div>
              </div>

              {/* Email — read-only */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <EnvelopeIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0.5">Email</p>
                  <p className="text-base font-medium text-white/90 truncate">{user?.email}</p>
                </div>
              </div>

              {/* Role / Dept — read-only */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <BriefcaseIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0.5">Role / Dept</p>
                  <p className="text-sm font-bold text-cn-blue truncate uppercase tracking-wider">
                    {user?.role}{user?.department ? ` • ${user.department}` : ''}
                  </p>
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Phone — editable */}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <PhoneIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block">Phone Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                      setPhoneNumber(val)
                    }}
                    placeholder="Enter 10-digit number"
                    className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-cn-blue transition-colors text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ── Change Password ── */}
            <div className="w-full bg-white/5 rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <LockClosedIcon className="w-5 h-5 text-white/50" />
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Change Password</h3>
              </div>
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block">Current / Temp Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-cn-blue transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars, 1 uppercase, 1 special"
                  className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-cn-blue transition-colors text-sm"
                />
              </div>
            </div>

            {/* ── Notifications ── */}
            <div className="w-full bg-white/5 rounded-xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center gap-3">
                {notificationsEnabled ? (
                  <BellIcon className="w-5 h-5 text-white/50" />
                ) : (
                  <BellSlashIcon className="w-5 h-5 text-white/50" />
                )}
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Notifications</h3>
              </div>

              {/* Master on/off */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {notificationsEnabled ? 'Push notifications on' : 'Push notifications off'}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {notificationsEnabled ? 'You will receive message alerts' : 'All alerts are muted'}
                  </p>
                </div>
                <Toggle enabled={notificationsEnabled} onToggle={toggleNotifications} label="Toggle notifications" />
              </div>

              {/* Sound toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <SpeakerWaveIcon className="w-4 h-4 text-white/40" />
                  ) : (
                    <SpeakerXMarkIcon className="w-4 h-4 text-white/40" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">Sound alerts</p>
                    <p className="text-xs text-white/40 mt-0.5">Play a tone on new messages</p>
                  </div>
                </div>
                <Toggle enabled={soundEnabled} onToggle={toggleSound} label="Toggle sound" />
              </div>

              {/* Notification type */}
              <div>
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Notify me for</p>
                <div className="flex flex-col gap-1.5">
                  {NOTIFICATION_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleNotificationType(value)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 text-left"
                      style={{
                        background: notificationType === value ? 'rgba(51,153,204,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${notificationType === value ? 'rgba(51,153,204,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{
                          borderColor: notificationType === value ? 'var(--cn-blue)' : 'rgba(255,255,255,0.25)',
                        }}
                      >
                        {notificationType === value && (
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--cn-blue)' }} />
                        )}
                      </span>
                      <span className={`text-sm font-medium ${notificationType === value ? 'text-white' : 'text-white/60'}`}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Message Font Size ── */}
            <div className="w-full bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <ChatBubbleLeftRightIcon className="w-5 h-5 text-white/50" />
                <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Message Font Size</h3>
              </div>
              <div className="flex gap-2">
                {Object.entries(FONT_SIZES).map(([key, { label, title }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleFontSize(key)}
                    title={title}
                    className="flex-1 py-2.5 rounded-xl font-bold transition-all duration-150"
                    style={{
                      background: messageFontSize === key ? 'rgba(51,153,204,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1.5px solid ${messageFontSize === key ? 'rgba(51,153,204,0.6)' : 'rgba(255,255,255,0.08)'}`,
                      color: messageFontSize === key ? 'var(--cn-blue)' : 'rgba(255,255,255,0.45)',
                      fontSize: key === 'sm' ? '0.75rem' : key === 'lg' ? '1.0625rem' : '0.875rem',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/30 mt-2 text-center">
                Preview: <span style={{ fontSize: FONT_SIZES[messageFontSize].value, color: 'rgba(255,255,255,0.6)' }}>Hello, this is a message.</span>
              </p>
            </div>

            {/* ── Save ── */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cn-blue to-cn-blue-dark hover:from-cn-blue-light hover:to-cn-blue text-white font-bold text-sm transition-all shadow-lg shadow-cn-blue/20 disabled:opacity-50 flex justify-center items-center"
              >
                {saving ? (
                  <span className="animate-cn-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
