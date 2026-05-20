import { XMarkIcon, ShieldCheckIcon, UserPlusIcon, MagnifyingGlassIcon, CheckIcon, LinkIcon, ArrowRightOnRectangleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { addMembers, leaveConversation } from '../api/conversations'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import UserAvatar from './UserAvatar'
import toast from 'react-hot-toast'

export default function ChatSidebarMembers({ conversationId, conversation, onClose }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selectedToAdd, setSelectedToAdd] = useState([])
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: allUsers = [], isLoading: usersLoading } = useQuery(
    'users-list',
    () => listUsers(),
    { enabled: showAddModal }
  )

  const addMembersMutation = useMutation(
    (userIds) => addMembers(conversationId, userIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['conversation', conversationId])
        toast.success('Members added successfully')
        setShowAddModal(false)
        setSelectedToAdd([])
        setAddSearch('')
      },
      onError: () => toast.error('Failed to add members'),
    }
  )

  const existingMemberIds = useMemo(
    () => new Set(conversation?.members?.map((m) => m.user_id) ?? []),
    [conversation]
  )

  const filteredAvailableUsers = useMemo(() => {
    const available = allUsers.filter((u) => !existingMemberIds.has(u.id))
    const q = addSearch.trim().toLowerCase()
    if (!q) return available
    return available.filter((u) => {
      const name = (u.display_name || u.full_name || '').toLowerCase()
      return name.includes(q) || u.email?.toLowerCase().includes(q)
    })
  }, [allUsers, existingMemberIds, addSearch])

  const toggleSelect = (id) => {
    setSelectedToAdd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleAddMembers = () => {
    if (selectedToAdd.length === 0) return
    addMembersMutation.mutate(selectedToAdd)
  }

  const leaveMutation = useMutation(
    () => leaveConversation(conversationId, user.id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('conversations')
        toast.success('You left the group')
        onClose()
        navigate('/')
      },
      onError: () => toast.error('Failed to leave group'),
    }
  )

  const handleCopyInviteLink = async () => {
    const link = `${window.location.origin}/join/${conversationId}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied!')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const initialOnlineIds = useMemo(
    () => (conversation?.members ?? []).filter((m) => m.user?.is_online).map((m) => m.user_id),
    [conversation]
  )
  const { onlineUsers } = useOnlineUsers(initialOnlineIds)

  const members = conversation?.members ?? []
  const currentMember = members.find((m) => m.user_id === user?.id)
  const isOnlyAdmin =
    currentMember?.role === 'admin' &&
    members.filter((m) => m.role === 'admin').length === 1

  return (
    <>
      <div className="w-80 flex flex-col bg-cn-white border-l border-cn-gray-200 h-full animate-cn-slide-in-right shadow-2xl relative z-20">
        {/* Header */}
        <div className="relative p-6 border-b border-cn-gray-100 overflow-hidden bg-cn-white">
          <div className="absolute top-0 left-0 w-full h-1 cn-gradient-brand"></div>
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-cn-blue/5 rounded-full blur-3xl"></div>
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h3 className="text-lg font-bold text-cn-charcoal">Members</h3>
              <p className="text-[11px] text-cn-gray-400 mt-1 uppercase tracking-widest font-bold">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-cn-gray-100 text-cn-gray-400 hover:text-cn-charcoal rounded-full transition-all duration-200"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {members.map((member) => {
            const u = member.user ?? {}
            const name = u.display_name || u.full_name || 'Unknown'
            const isAdmin = member.role === 'admin'
            return (
              <div
                key={member.id ?? member.user_id}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-cn-gray-100/60 transition-all duration-200"
              >
                <UserAvatar user={u} size="sm" online={onlineUsers.has(member.user_id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cn-charcoal truncate">{name}</p>
                  <p className="text-[10px] text-cn-gray-400 truncate">{u.department || u.email || ''}</p>
                </div>
                {isAdmin && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-cn-blue bg-cn-blue-light px-2 py-0.5 rounded-full flex-shrink-0">
                    <ShieldCheckIcon className="w-3 h-3" />
                    Admin
                  </span>
                )}
              </div>
            )
          })}

          {members.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center opacity-60">
              <div className="w-16 h-16 rounded-3xl bg-cn-gray-50 flex items-center justify-center mb-4 text-2xl grayscale">👥</div>
              <p className="font-bold text-cn-charcoal text-xs">No members found</p>
            </div>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-cn-blue/30 text-cn-blue text-sm font-bold hover:bg-cn-blue-light/50 hover:border-cn-blue/60 transition-all duration-200"
          >
            <UserPlusIcon className="w-4 h-4" />
            Add Member
          </button>

          <button
            onClick={handleCopyInviteLink}
            className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-cn-gray-200 text-cn-gray-500 text-sm font-bold hover:bg-cn-gray-100/60 hover:border-cn-gray-300 transition-all duration-200"
          >
            <LinkIcon className="w-4 h-4" />
            Copy Invite Link
          </button>

          {!showLeaveConfirm ? (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-cn-red text-sm font-bold hover:bg-cn-red-light/60 transition-all duration-200"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Leave Group
            </button>
          ) : (
            <div className="mt-2 rounded-2xl border border-cn-red/30 bg-cn-red-light/40 p-3 space-y-2">
              {isOnlyAdmin && (
                <p className="flex items-start gap-1.5 text-[11px] text-cn-red font-medium">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  You are the only admin. Leaving will leave the group without an admin.
                </p>
              )}
              <p className="text-xs text-cn-charcoal font-semibold text-center">Leave this group?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold text-cn-gray-500 bg-cn-white border border-cn-gray-200 hover:bg-cn-gray-100 transition-fast"
                >
                  Cancel
                </button>
                <button
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isLoading}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold text-white bg-cn-red hover:opacity-90 disabled:opacity-50 transition-fast"
                >
                  {leaveMutation.isLoading ? 'Leaving…' : 'Leave'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
          onMouseDown={() => {
            setShowAddModal(false)
            setSelectedToAdd([])
            setAddSearch('')
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-cn-gray-200 bg-cn-white shadow-modal animate-cn-fade-up"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="h-1 cn-gradient-brand" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
              <div>
                <h2 className="font-bold text-cn-charcoal">Add Members</h2>
                <p className="text-xs text-cn-gray-400 mt-0.5">Search and select people to add</p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setSelectedToAdd([])
                  setAddSearch('')
                }}
                className="p-1.5 rounded-full text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-fast"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-2"
                style={{ background: 'var(--cn-gray-100)', border: '1px solid var(--cn-gray-200)' }}
              >
                <MagnifyingGlassIcon className="w-4 h-4 text-cn-gray-400 flex-shrink-0" />
                <input
                  autoFocus
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search people"
                  className="flex-1 bg-transparent text-sm text-cn-charcoal placeholder-cn-gray-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto border-y border-cn-gray-200">
              {usersLoading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-cn-gray-400">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-cn-blue border-t-transparent rounded-full" />
                  Loading people...
                </div>
              ) : filteredAvailableUsers.length > 0 ? (
                filteredAvailableUsers.map((u) => {
                  const selected = selectedToAdd.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleSelect(u.id)}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-fast ${
                        selected ? 'bg-cn-blue-light' : 'hover:bg-cn-gray-100'
                      }`}
                    >
                      <UserAvatar user={u} size="sm" online={onlineUsers.has(u.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-cn-charcoal truncate">
                          {u.display_name || u.full_name}
                        </p>
                        <p className="text-xs text-cn-gray-400 truncate">
                          {u.department || u.email}
                        </p>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          selected
                            ? 'border-cn-blue bg-cn-blue text-white'
                            : 'border-cn-gray-200 text-cn-gray-400'
                        }`}
                      >
                        {selected && <CheckIcon className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="px-5 py-10 text-center text-sm text-cn-gray-400">
                  {allUsers.length === 0 ? 'No people found.' : 'All users are already members.'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="text-xs font-medium text-cn-gray-400">
                {selectedToAdd.length} selected
              </span>
              <button
                type="button"
                onClick={handleAddMembers}
                disabled={selectedToAdd.length === 0 || addMembersMutation.isLoading}
                className="rounded-full bg-cn-blue px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-cn-blue-dark disabled:opacity-45 disabled:cursor-not-allowed transition-fast"
              >
                {addMembersMutation.isLoading ? 'Adding...' : 'Add to Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
