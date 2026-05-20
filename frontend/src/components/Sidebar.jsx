import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  UserGroupIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
  CheckIcon,
  PhoneIcon,
  CalendarIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { createConversation, listConversations } from '../api/conversations'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useTheme } from '../context/ThemeContext'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import UserAvatar from './UserAvatar'
import Logo from './Logo'
import ProfileSettingsModal from './ProfileSettingsModal'
import AdminMenuModal from './AdminMenuModal'

function ConvItem({ conv, isActive, currentUserId, onlineUsers, userStatuses, onClick }) {
  const isDirect = conv.type === 'direct'
  const other = isDirect ? conv.members?.find((m) => m.user_id !== currentUserId) : null
  const isSelf = isDirect && !other
  
  const name = isDirect
    ? isSelf ? 'You' : (other?.user?.display_name || other?.user?.full_name)
    : conv.name
    
  const avatarUser = isDirect
    ? isSelf ? conv.members?.find(m => m.user_id === currentUserId)?.user : other?.user
    : { full_name: conv.name, avatar_url: conv.avatar_url }

  const lastMsg = conv.last_message
  const preview = lastMsg
    ? lastMsg.type !== 'text'
      ? `[${lastMsg.type}]`
      : lastMsg.content?.slice(0, 50)
    : 'No messages yet'

  const isOnline = isDirect && onlineUsers.has(other?.user_id)
  const status = isDirect ? userStatuses.get(other?.user_id) : 'online'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left relative transition-all duration-200 ${
        isActive ? 'cn-conv-active' : 'hover:bg-cn-gray-100 border-l-3 border-transparent'
      }`}
      style={isActive ? {} : { borderLeft: '3px solid transparent' }}
    >
      <div className="relative flex-shrink-0">
        <UserAvatar user={avatarUser} size="md" online={isOnline} status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span
            className={`font-semibold text-sm truncate ${
              isActive ? 'text-cn-red-dark' : 'text-cn-charcoal'
            }`}
          >
            {name}
          </span>
          {lastMsg && (
            <span className="text-xs text-cn-gray-400 flex-shrink-0 ml-2">
              {dayjs(lastMsg.created_at).format('HH:mm')}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-cn-gray-600 truncate">{preview}</span>
          {conv.unread_count > 0 && (
            <span
              className="ml-2 flex-shrink-0 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center px-1.5 font-bold animate-cn-badge-pop"
              style={{ background: 'linear-gradient(135deg, #CD5252 0%, #B03E3E 100%)' }}
            >
              {conv.unread_count > 9 ? '9+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function ConversationComposer({
  mode,
  users,
  loading,
  creating,
  search,
  setSearch,
  selectedIds,
  toggleSelected,
  groupName,
  setGroupName,
  onClose,
  onStartDirect,
  onCreateGroup,
  onlineUsers,
}) {
  const isGroup = mode === 'group'
  const { user: currentUser } = useAuth()
  const [nameError, setNameError] = useState('')

  const otherUsers = useMemo(
    () => users.filter((u) => u.id !== currentUser?.id),
    [users, currentUser?.id]
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return otherUsers
    return otherUsers.filter((u) => {
      const name = (u.display_name || u.full_name || '').toLowerCase()
      return (
        name.includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      )
    })
  }, [search, otherUsers])

  const selectedUsers = otherUsers.filter((u) => selectedIds.includes(u.id))
  const otherSelectedCount = selectedIds.length
  const canCreateGroup = otherSelectedCount >= 2 && !creating

  const handleGroupSubmit = () => {
    if (!groupName.trim()) {
      setNameError('Group name is required')
      return
    }
    setNameError('')
    onCreateGroup()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-cn-gray-200 bg-cn-white shadow-modal animate-cn-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-1 cn-accent-bar" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
          <div>
            <h2 className="font-bold text-cn-charcoal">
              {isGroup ? 'New Group' : 'New Chat'}
            </h2>
            <p className="text-xs text-cn-gray-400 mt-0.5">
              {isGroup ? 'Pick at least 2 other members' : 'Choose someone to message'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-fast"
            aria-label="Close"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {isGroup && (
            <div>
              <input
                value={groupName}
                onChange={(e) => { setGroupName(e.target.value); setNameError('') }}
                placeholder="Group name"
                className={`w-full rounded-md border bg-cn-gray-100 px-3.5 py-2.5 text-sm text-cn-gray-800 placeholder-cn-gray-400 focus:outline-none transition-fast ${
                  nameError ? 'border-cn-red focus:border-cn-red' : 'border-cn-gray-200 focus:border-cn-blue'
                }`}
              />
              {nameError && (
                <p className="mt-1 text-xs text-cn-red font-medium">{nameError}</p>
              )}
            </div>
          )}

          <div
            className="flex items-center gap-2 rounded-full px-3 py-2"
            style={{ background: 'var(--cn-gray-100)', border: '1px solid var(--cn-gray-200)' }}
          >
            <MagnifyingGlassIcon className="w-4 h-4 text-cn-gray-400 flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people"
              className="flex-1 bg-transparent text-sm text-cn-charcoal placeholder-cn-gray-400 focus:outline-none"
            />
          </div>

          {isGroup && selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleSelected(u.id)}
                  className="rounded-full bg-cn-blue-light px-2.5 py-1 text-xs font-semibold text-cn-blue hover:bg-cn-gray-200 transition-fast"
                >
                  {u.display_name || u.full_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto border-y border-cn-gray-200">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-cn-gray-400">
              <span className="animate-cn-spin inline-block w-4 h-4 border-2 border-cn-blue border-t-transparent rounded-full" />
              Loading people...
            </div>
          ) : filteredUsers.length ? (
            filteredUsers.map((u) => {
              const selected = selectedIds.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => (isGroup ? toggleSelected(u.id) : onStartDirect(u))}
                  disabled={creating}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-fast disabled:opacity-60 ${
                    selected ? 'bg-cn-blue-light' : 'hover:bg-cn-gray-100'
                  }`}
                >
                  <UserAvatar user={u} size="sm" online={onlineUsers?.has(u.id) ?? u.is_online} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-cn-charcoal truncate">
                      {u.display_name || u.full_name}
                    </p>
                    <p className="text-xs text-cn-gray-400 truncate">
                      {u.department || u.email}
                    </p>
                  </div>
                  {isGroup && (
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold ${
                        selected
                          ? 'border-cn-blue bg-cn-blue text-white'
                          : 'border-cn-gray-200 text-cn-gray-400'
                      }`}
                    >
                      {selected && <CheckIcon className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </button>
              )
            })
          ) : (
            <div className="px-5 py-10 text-center text-sm text-cn-gray-400">
              No people found.
            </div>
          )}
        </div>

        {isGroup && (
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="text-xs font-medium text-cn-gray-400">
              {selectedIds.length} selected
            </span>
            <button
              type="button"
              onClick={handleGroupSubmit}
              disabled={!canCreateGroup}
              className="rounded-full bg-cn-red px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-cn-red-dark disabled:opacity-45 disabled:cursor-not-allowed transition-fast"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()
  const { on } = useSocket()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [composerMode, setComposerMode] = useState(null)
  const [directory, setDirectory] = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [directorySearch, setDirectorySearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [groupName, setGroupName] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const initialOnlineIds = useMemo(
    () =>
      (conversations ?? []).flatMap((conv) =>
        conv.members
          ?.filter((member) => member.user?.is_online)
          .map((member) => member.user_id) ?? []
      ),
    [conversations]
  )
  const { onlineUsers, userStatuses } = useOnlineUsers(initialOnlineIds)
  const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  const loadConversations = useCallback(() => {
    return listConversations().then((data) => setConversations(data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!composerMode || directory.length || directoryLoading) return

    setDirectoryLoading(true)
    listUsers({ limit: 100 })
      .then(setDirectory)
      .catch(() => toast.error('Could not load people'))
      .finally(() => setDirectoryLoading(false))
  }, [composerMode, directory.length, directoryLoading])

  useEffect(() => {
    const off1 = on('message:new', (data) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversation_id)
        if (idx === -1) return prev
        const updated = {
          ...prev[idx],
          last_message: data,
          unread_count:
            (data.conversation_id !== conversationId || !document.hasFocus()) && data.sender_id !== user?.id
              ? (prev[idx].unread_count ?? 0) + 1
              : prev[idx].unread_count,
        }
        const next = [...prev]
        next.splice(idx, 1)
        return [updated, ...next]
      })
    })

    // conversation:new is sent when a DM is upgraded to a group during a call invite (full data included)
    const off2 = on('conversation:new', (data) => {
      setConversations((prev) => {
        const exists = prev.some(c => c.id === data.id)
        if (exists) return prev
        return [data, ...prev]
      })
    })

    // conversation:created is sent when a new group/DM is created (other members need to reload)
    const off3 = on('conversation:created', () => {
      loadConversations()
    })

    // conversation:members_added is sent when members are added to an existing group
    const off4 = on('conversation:members_added', (data) => {
      if (data.user_ids?.includes(user?.id)) {
        loadConversations()
      }
    })

    // conversation:member_removed is sent when a member is removed or leaves
    const off5 = on('conversation:member_removed', (data) => {
      if (data.user_id === user?.id) {
        setConversations((prev) => prev.filter((c) => c.id !== data.conversation_id))
      }
    })

    // conversation:updated is sent when group name or avatar changes
    const off6 = on('conversation:updated', (data) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversation_id
            ? { ...c, name: data.name ?? c.name, avatar_url: data.avatar_url ?? c.avatar_url }
            : c
        )
      )
    })

    return () => { off1(); off2(); off3(); off4(); off5(); off6() }
  }, [on, conversationId, user?.id, loadConversations])

  useEffect(() => {
    const clearUnread = () => {
      if (conversationId && document.hasFocus()) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c
          )
        )
      }
    }
    clearUnread()
    window.addEventListener('focus', clearUnread)
    return () => window.removeEventListener('focus', clearUnread)
  }, [conversationId])

  const filtered = (conversations ?? []).filter((c) => {
    if (!search) return true
    const isDirect = c.type === 'direct'
    const other = isDirect ? c.members?.find((m) => m.user_id !== user?.id) : null
    const name = isDirect ? other?.user?.full_name : c.name
    return name?.toLowerCase().includes(search.toLowerCase())
  })

  const isAdmin = user?.role === 'admin'

  const openComposer = (mode) => {
    setComposerMode(mode)
    setDirectorySearch('')
    setSelectedIds([])
    setGroupName('')
  }

  const closeComposer = () => {
    if (creatingConversation) return
    setComposerMode(null)
  }

  const toggleSelected = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    )
  }

  const openConversation = async (payload) => {
    setCreatingConversation(true)
    try {
      const conversation = await createConversation(payload)
      await loadConversations()
      setComposerMode(null)
      navigate(`/chat/${conversation.id}`)
      if (window.innerWidth < 1024) onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Could not create conversation')
    } finally {
      setCreatingConversation(false)
    }
  }

  const handleStartDirect = (targetUser) => {
    openConversation({ type: 'direct', user_ids: [targetUser.id] })
  }

  const handleCreateGroup = () => {
    const name = groupName.trim()
    if (!name || selectedIds.length < 2) return
    const allIds = [...new Set([...selectedIds, user?.id])]
    openConversation({ type: 'group', name, user_ids: allIds })
  }

  const handleNavClick = (to) => {
    navigate(to)
    if (window.innerWidth < 1024) onClose()
  }

  return (
    <>
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-80 flex flex-col flex-shrink-0 bg-cn-white transform lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ boxShadow: 'var(--shadow-sidebar)', borderRight: '1px solid var(--cn-gray-200)' }}
    >
      {/* Gradient header */}
      <div
        className="flex items-center gap-3 px-4 py-4 flex-shrink-0 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #CC3333 0%, #2D3748 55%, #2277AA 100%)',
        }}
      >
        {/* Subtle radial shine */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.3) 0%, transparent 60%)',
          }}
        />
        <div className="relative z-10 flex-shrink-0">
          <Logo size="sm" />
        </div>
        <div className="relative z-10 flex-1">
          <span className="font-bold text-lg text-white tracking-tight block leading-tight">
            Connectors
          </span>
        </div>
        
        <button
          onClick={onClose}
          className="lg:hidden relative z-10 p-2 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-all"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="relative z-10 p-2 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-all duration-200"
            title="Search conversations"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="relative z-10 p-2 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-all duration-200"
            title={themeLabel}
          >
            <ThemeIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search bar (Mobile always visible or toggled) */}
      {(showSearch || window.innerWidth < 1024) && (
        <div className="px-3 py-2.5 border-b border-cn-gray-200">
          <div
            className="flex items-center gap-2 rounded-full px-3 py-2 transition-all duration-200"
            style={{ background: 'var(--cn-gray-100)', border: '1.5px solid var(--cn-gray-200)' }}
          >
            <MagnifyingGlassIcon className="w-4 h-4 text-cn-gray-400 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="flex-1 bg-transparent text-sm text-cn-charcoal placeholder-cn-gray-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-3 border-b border-cn-gray-200 flex-shrink-0">
        <button
          type="button"
          onClick={() => openComposer('direct')}
          className="cn-action-btn cn-action-btn--red flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-full flex-1 justify-center relative overflow-hidden group"
        >
          <span className="cn-action-btn__shine" />
          <PlusIcon className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:rotate-90" />
          <span className="relative z-10">New Chat</span>
        </button>
        <button
          type="button"
          onClick={() => openComposer('group')}
          className="cn-action-btn cn-action-btn--blue flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-full flex-1 justify-center relative overflow-hidden group"
        >
          <span className="cn-action-btn__shine" />
          <UserGroupIcon className="w-4 h-4 relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          <span className="relative z-10">New Group</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((conv) => (
          <ConvItem
            key={conv.id}
            conv={conv}
            isActive={conv.id === conversationId}
            currentUserId={user?.id}
            onlineUsers={onlineUsers}
            userStatuses={userStatuses}
            onClick={() => {
              navigate(`/chat/${conv.id}`)
              if (window.innerWidth < 1024) onClose()
            }}
          />
        ))}
        {!filtered.length && (
          <div className="flex flex-col items-center py-12 text-center px-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'linear-gradient(135deg, rgba(204,51,51,0.1) 0%, rgba(51,153,204,0.1) 100%)' }}
            >
              <span className="text-xl">💬</span>
            </div>
            <p className="text-sm text-cn-gray-400">No conversations</p>
          </div>
        )}
      </div>

      {/* Quick Tools Row */}
      <div className="flex border-t border-cn-gray-100 bg-cn-gray-100/30">
        <button
          onClick={() => handleNavClick('/call-history')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${
            window.location.pathname === '/call-history' ? 'text-cn-blue bg-cn-white shadow-sm' : 'text-cn-gray-400 hover:text-cn-gray-600'
          }`}
          title="Call History"
        >
          <PhoneIcon className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Calls</span>
        </button>
        <button
          onClick={() => handleNavClick('/calendar')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 border-l border-cn-gray-100 transition-all ${
            window.location.pathname === '/calendar' ? 'text-cn-blue bg-cn-white shadow-sm' : 'text-cn-gray-400 hover:text-cn-gray-600'
          }`}
          title="Calendar & Tasks"
        >
          <CalendarIcon className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-tighter">Tasks</span>
        </button>
        {isAdmin && (
           <button
             onClick={() => setShowAdminModal(true)}
             className="flex-1 flex flex-col items-center gap-1 py-3 border-l border-cn-gray-100 text-cn-gray-400 hover:text-cn-red transition-all"
             title="Admin Console"
           >
             <ShieldCheckIcon className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tighter">Admin</span>
           </button>
        )}
      </div>

      {/* User footer */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0 cursor-pointer hover:bg-cn-gray-200 transition-colors"
        style={{ borderTop: '1px solid var(--cn-gray-200)', background: 'var(--cn-gray-100)' }}
        onClick={() => setShowProfileModal(true)}
      >
        <div className="relative">
          <UserAvatar user={user} size="sm" online />
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
            style={{ background: 'var(--cn-online)', borderColor: 'var(--cn-white)', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-cn-charcoal truncate">
            {user?.display_name || user?.full_name}
          </p>
          <p className="text-xs font-medium" style={{ color: 'var(--cn-online)' }}>
            ● Online
          </p>
        </div>
        <button
          onClick={(e) => {
             e.stopPropagation();
             logout();
          }}
          className="p-2 rounded-lg transition-all duration-200"
          style={{ color: 'var(--cn-gray-400)' }}
          title="Sign out"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
    {composerMode && (
      <ConversationComposer
        mode={composerMode}
        users={directory}
        loading={directoryLoading}
        creating={creatingConversation}
        search={directorySearch}
        setSearch={setDirectorySearch}
        selectedIds={selectedIds}
        toggleSelected={toggleSelected}
        groupName={groupName}
        setGroupName={setGroupName}
        onClose={closeComposer}
        onStartDirect={handleStartDirect}
        onCreateGroup={handleCreateGroup}
        onlineUsers={onlineUsers}
      />
    )}
    {showProfileModal && (
      <ProfileSettingsModal onClose={() => setShowProfileModal(false)} />
    )}
    {showAdminModal && (
      <AdminMenuModal isOpen={showAdminModal} onClose={() => setShowAdminModal(false)} />
    )}
    </>
  )
}
