import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import toast from 'react-hot-toast'
import { 
  XMarkIcon, 
  CameraIcon, 
  UserIcon, 
  EnvelopeIcon, 
  BriefcaseIcon, 
  PhoneIcon, 
  LockClosedIcon
} from '@heroicons/react/24/outline'
import { uploadFile } from '../api/messages'
import { updateProfile } from '../api/users'
import { changePassword } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'

export default function ProfileSettingsModal({ onClose }) {
  const { user, updateUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    setLoading(true)
    try {
      const uploaded = await uploadFile(file)
      const updatedUser = await updateProfile({ avatar_url: uploaded.file_url })
      updateUser({ avatar_url: updatedUser.avatar_url })
      toast.success('Profile picture updated successfully')
    } catch (err) {
      toast.error('Failed to update profile picture')
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      let profileUpdated = false
      
      // 1. Update Phone Number if changed
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
      
      // 2. Change Password if provided
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
        {/* Decorative background glow */}
        <div 
          className="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(51,153,204,0.8) 0%, transparent 70%)',
          }}
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
          <div className="flex flex-col items-center">
            <div 
              className="relative group cursor-pointer mb-6" 
              onClick={() => !loading && fileInputRef.current?.click()}
            >
              <div className="relative rounded-full p-1" style={{ background: 'linear-gradient(135deg, rgba(204,51,51,0.5) 0%, rgba(51,153,204,0.5) 100%)' }}>
                <div className="rounded-full overflow-hidden border-4 border-[#1A202C]">
                  <UserAvatar user={user} size="xl" />
                </div>
              </div>
              
              <div className="absolute inset-1 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm m-1 border-4 border-transparent">
                <CameraIcon className="w-8 h-8 text-white mb-1" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">Change</span>
              </div>
              
              {loading && (
                <div className="absolute inset-1 bg-[#1A202C]/80 rounded-full flex items-center justify-center m-1 border-4 border-transparent">
                  <span className="animate-cn-spin inline-block w-8 h-8 border-2 border-cn-blue border-t-transparent rounded-full" />
                </div>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>
          
          <form onSubmit={handleSave} className="space-y-5">
            <div className="w-full bg-white/5 rounded-xl p-5 border border-white/10 space-y-4">
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0.5">Name</p>
                  <p className="text-base font-semibold text-white truncate">{user?.display_name || user?.full_name}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <EnvelopeIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0.5">Email</p>
                  <p className="text-base font-medium text-white/90 truncate">{user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-white/50">
                  <BriefcaseIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0.5">Role / Dept</p>
                  <p className="text-sm font-bold text-cn-blue truncate uppercase tracking-wider">{user?.role} {user?.department ? `• ${user.department}` : ''}</p>
                </div>
              </div>

              <hr className="border-white/10" />

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
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhoneNumber(val);
                    }}
                    placeholder="Enter 10-digit number"
                    className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-1.5 text-white placeholder-white/20 focus:outline-none focus:border-cn-blue transition-colors text-sm"
                  />
                </div>
              </div>

            </div>

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
