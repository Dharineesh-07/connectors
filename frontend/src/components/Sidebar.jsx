import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQueryClient } from 'react-query'
import Loader from './Loader'
import { getPrefetchConversations, getPrefetchUsers, clearPrefetch } from '../utils/prefetchStore'
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
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArchiveBoxArrowDownIcon,
  BackspaceIcon,
  TrashIcon,
  InformationCircleIcon,
  FolderMinusIcon,
  FolderPlusIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { createConversation, listConversations, archiveConversation, unarchiveConversation, clearConversation, deleteConversation } from '../api/conversations'
import { listUsers } from '../api/users'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useTheme } from '../context/ThemeContext'
import { useOnlineUsers } from '../hooks/useOnlineUsers'
import UserAvatar from './UserAvatar'
import Logo from './Logo'
import ProfileSettingsModal from './ProfileSettingsModal'
import AdminMenuModal from './AdminMenuModal'
import { useChatPopup } from '../context/ChatPopupContext'

function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false, icon: Icon }) {
  const ToneIcon = Icon || (danger ? TrashIcon : InformationCircleIcon)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-lg border-2 border-cn-gray-200 bg-cn-white shadow-modal ring-1 ring-black/5 animate-cn-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-1 cn-accent-bar" />
        <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center gap-3">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center ring-8 ${
              danger
                ? 'bg-cn-red-light text-cn-red ring-cn-red-light/40'
                : 'bg-cn-blue-light text-cn-blue ring-cn-blue-light/40'
            }`}
          >
            <ToneIcon className="w-6 h-6" />
          </div>
          {title && (
            <h3 className="text-lg font-bold text-cn-charcoal">{title}</h3>
          )}
          <p className="text-sm text-cn-gray-400 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border-2 border-cn-gray-200 px-4 py-2.5 text-sm font-semibold text-cn-gray-600 hover:bg-cn-gray-100 hover:text-cn-gray-800 transition-fast"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-fast ${
              danger
                ? 'bg-cn-red hover:bg-cn-red-dark'
                : 'bg-cn-blue hover:bg-cn-blue-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Section name is required'); return }
    onCreate(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-lg border border-cn-gray-200 bg-cn-white shadow-modal animate-cn-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-1 cn-accent-bar" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-cn-gray-200">
          <div>
            <h2 className="font-bold text-cn-charcoal">New Section</h2>
            <p className="text-xs text-cn-gray-400 mt-0.5">Group conversations under a label</p>
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
        <div className="px-5 py-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
            placeholder="Section name"
            className={`w-full rounded-md border bg-cn-gray-100 px-3.5 py-2.5 text-sm text-cn-gray-800 placeholder-cn-gray-400 focus:outline-none transition-fast ${
              error ? 'border-cn-red focus:border-cn-red' : 'border-cn-gray-200 focus:border-cn-blue'
            }`}
          />
          {error && <p className="mt-1 text-xs text-cn-red font-medium">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-cn-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-cn-gray-500 hover:text-cn-gray-700 transition-fast"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-full bg-cn-blue px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-cn-blue-dark transition-fast"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

const FOLDER_COLORS = ['#3399CC', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#14B8A6']

function FolderSection({ folder, conversations, currentUserId, onlineUsers, userStatuses, onDropConv, onConvClick, onArchive, onDelete, onClear, onMoveToFolder, onRemoveFromFolder, folders, activeConvIds }) {
  const [collapsed, setCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const inputRef = useRef(null)
  const ignoreBlurRef = useRef(false)

  const folderConvs = conversations.filter((c) => folder.conversationIds.includes(c.id))

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const convId = e.dataTransfer.getData('text/plain')
    if (convId) onDropConv(convId, folder.id)
  }

  const commitRename = () => {
    const name = editName.trim()
    if (name && name !== folder.name) onMoveToFolder('__rename__', folder.id, name)
    setIsEditing(false)
  }

  const handleBlur = () => {
    if (ignoreBlurRef.current) { ignoreBlurRef.current = false; return }
    commitRename()
  }

  const unreadCount = folderConvs.reduce((n, c) => n + (c.unread_count || 0), 0)

  return (
    <div>
      {/* Folder header — also a drop target */}
      <div
        className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b border-cn-gray-100 transition-fast ${dragOver ? 'cn-folder-drop-target' : 'hover:bg-cn-gray-100'}`}
        style={{ borderLeft: `3px solid ${folder.color}`, cursor: 'default' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-cn-gray-500 hover:text-cn-gray-700 transition-fast"
        >
          <span className="inline-block transition-transform duration-200" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>▶</span>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') { ignoreBlurRef.current = true; commitRename() } if (e.key === 'Escape') { ignoreBlurRef.current = true; setEditName(folder.name); setIsEditing(false) } }}
              className="flex-1 bg-transparent outline-none border-b border-cn-blue text-cn-charcoal text-xs font-semibold"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="truncate" style={{ color: folder.color }}>{folder.name}</span>
          )}
          {unreadCount > 0 && (
            <span className="ml-auto flex-shrink-0 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full leading-none" style={{ background: 'linear-gradient(135deg, #CD5252 0%, #B03E3E 100%)' }}>
              {unreadCount}
            </span>
          )}
        </button>
        {isEditing ? (
          <>
            <button
              onMouseDown={() => { ignoreBlurRef.current = true }}
              onClick={(e) => { e.stopPropagation(); ignoreBlurRef.current = false; commitRename() }}
              className="p-0.5 text-green-500 hover:text-green-700 transition-fast flex-shrink-0"
              title="Save"
            ><CheckIcon className="w-3.5 h-3.5" /></button>
            <button
              onMouseDown={() => { ignoreBlurRef.current = true }}
              onClick={(e) => { e.stopPropagation(); ignoreBlurRef.current = false; setEditName(folder.name); setIsEditing(false) }}
              className="p-0.5 text-cn-gray-400 hover:text-cn-gray-600 transition-fast flex-shrink-0"
              title="Cancel"
            ><XMarkIcon className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); setTimeout(() => inputRef.current?.focus(), 0) }}
              className="p-0.5 text-cn-gray-400 hover:text-cn-gray-600 transition-fast flex-shrink-0"
              title="Rename folder"
            ><PencilSquareIcon className="w-3.5 h-3.5" /></button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveToFolder('__delete__', folder.id) }}
              className="p-0.5 text-cn-gray-400 hover:text-cn-red transition-fast flex-shrink-0"
              title="Delete folder"
            ><XMarkIcon className="w-3.5 h-3.5" /></button>
          </>
        )}
      </div>

      {/* Conversations in folder */}
      {!collapsed && folderConvs.map((conv) => (
        <ConvItem
          key={conv.id}
          conv={conv}
          isActive={activeConvIds.has(conv.id)}
          currentUserId={currentUserId}
          onlineUsers={onlineUsers}
          userStatuses={userStatuses}
          onArchive={onArchive}
          onClear={onClear}
          onDelete={onDelete}
          onClick={() => onConvClick(conv)}
          folders={folders}
          currentFolderId={folder.id}
          onMoveToFolder={onMoveToFolder}
          onRemoveFromFolder={() => onRemoveFromFolder(conv.id, folder.id)}
        />
      ))}
      {!collapsed && folderConvs.length === 0 && (
        <p className="pl-8 pr-4 py-2 text-xs text-cn-gray-400 italic">Drop chats here</p>
      )}
    </div>
  )
}

function ConvItem({ conv, isActive, currentUserId, onlineUsers, userStatuses, onClick, onArchive, onDelete, onClear, folders = [], currentFolderId = null, onMoveToFolder, onRemoveFromFolder }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuUp, setMenuUp] = useState(false)
  const menuRef = useRef(null)
  const btnRef = useRef(null)

  const isDirect = conv.type === 'direct'
  const other = isDirect ? conv.members?.find((m) => m.user_id !== currentUserId) : null
  const isSelf = isDirect && !other
  const isArchived = !!conv.archived_at

  const name = isDirect
    ? isSelf ? 'You' : (other?.user?.display_name || other?.user?.full_name)
    : conv.name

  const avatarUser = isDirect
    ? isSelf ? conv.members?.find(m => m.user_id === currentUserId)?.user : other?.user
    : { full_name: conv.name, avatar_url: conv.avatar_url }

  const lastMsg = conv.last_message
  const preview = lastMsg
    ? lastMsg.type !== 'text'
      ? lastMsg.type
      : lastMsg.content?.slice(0, 50)
    : 'No messages yet'

  const isOnline = isDirect && onlineUsers.has(other?.user_id)
  const status = isDirect ? userStatuses.get(other?.user_id) : 'online'

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', conv.id)}
      className={`relative group w-full transition-all duration-200 ${
        isActive ? 'cn-conv-active' : 'hover:bg-cn-gray-100'
      }`}
      style={isActive ? {} : { borderLeft: '3px solid transparent' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setMenuOpen(false) }}
    >
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="relative flex-shrink-0">
          <UserAvatar user={avatarUser} size="md" online={isOnline} status={status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`font-semibold text-sm truncate ${
                  isActive ? 'text-cn-red-dark' : 'text-cn-charcoal'
                }`}
              >
                {name}
              </span>
              {!isDirect && conv.is_private && (
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0 opacity-40" title="Private group">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            {lastMsg && !hovered && !menuOpen && (
              <span className="text-xs text-cn-gray-400 flex-shrink-0 ml-2">
                {dayjs(lastMsg.created_at).format('HH:mm')}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-xs text-cn-gray-600 truncate">{preview}</span>
            {conv.unread_count > 0 && !hovered && !menuOpen && (
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

      {/* Three-dot menu button (visible on hover) */}
      {(hovered || menuOpen) && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
          <button
            ref={btnRef}
            onClick={(e) => {
              e.stopPropagation()
              if (!menuOpen) {
                const rect = btnRef.current?.getBoundingClientRect()
                setMenuUp(rect ? window.innerHeight - rect.bottom < 120 : false)
              }
              setMenuOpen((v) => !v)
            }}
            className="p-1.5 rounded-full bg-cn-white border border-cn-gray-200 text-cn-gray-400 hover:text-cn-gray-600 shadow-sm transition-fast"
            title="Options"
          >
            <svg width="13" height="13" viewBox="0 0 15 15" fill="currentColor">
              <circle cx="7.5" cy="2.5" r="1.5" />
              <circle cx="7.5" cy="7.5" r="1.5" />
              <circle cx="7.5" cy="12.5" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className={`absolute right-0 ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'} bg-cn-white rounded-xl py-1 min-w-[150px] z-50 animate-cn-fade-up`}
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid var(--cn-gray-200)' }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive?.(conv, isArchived) }}
                className="w-full text-left px-4 py-2.5 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
              >
                {isArchived
                  ? <ArchiveBoxIcon className="w-4 h-4 flex-shrink-0" />
                  : <ArchiveBoxArrowDownIcon className="w-4 h-4 flex-shrink-0" />}
                {isArchived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClear?.(conv) }}
                className="w-full text-left px-4 py-2.5 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
              >
                <BackspaceIcon className="w-4 h-4 flex-shrink-0" />
                Clear chat
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete?.(conv) }}
                className="w-full text-left px-4 py-2.5 text-sm text-cn-red hover:bg-cn-red-light flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4 flex-shrink-0" />
                Delete chat
              </button>
              {(folders.length > 0 || currentFolderId) && (
                <div className="border-t border-cn-gray-100 mt-1 pt-1">
                  {currentFolderId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRemoveFromFolder?.() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
                    >
                      <FolderMinusIcon className="w-4 h-4 flex-shrink-0" />
                      Remove from folder
                    </button>
                  )}
                  {folders.filter((f) => f.id !== currentFolderId).map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMoveToFolder?.(conv.id, f.id) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-cn-gray-700 hover:bg-cn-gray-100 flex items-center gap-2"
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 inline-block" style={{ background: f.color }} />
                      <span className="truncate">Move to {f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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
  const [isPrivate, setIsPrivate] = useState(false)

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
  const canCreateGroup = !creating

  const handleGroupSubmit = () => {
    if (!groupName.trim()) {
      setNameError('Group name is required')
      return
    }
    setNameError('')
    onCreateGroup(isPrivate)
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
              {isGroup ? 'Add members to the group' : 'Choose someone to message'}
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
            <div className="space-y-3">
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
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'var(--cn-gray-100)', border: '1px solid var(--cn-gray-200)' }}>
                <div>
                  <p className="text-xs font-semibold text-cn-charcoal">
                    {isPrivate ? 'Private group' : 'Public group'}
                  </p>
                  <p className="text-[11px] text-cn-gray-400 mt-0.5">
                    {isPrivate ? 'Only invited members can join' : 'Anyone in the workspace can join'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrivate((v) => !v)}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none"
                  style={{ background: isPrivate ? 'var(--cn-red, #CC3333)' : 'var(--cn-gray-300, #d1d5db)' }}
                  aria-label="Toggle private group"
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200"
                    style={{ transform: isPrivate ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
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
            <Loader variant="block" />
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
  const location = useLocation()
  const { conversationId } = useParams()
  const isOnSecondaryPage = location.pathname === '/call-history' || location.pathname === '/calendar' || location.pathname === '/tasks' || location.pathname === '/scribble' || location.pathname.startsWith('/admin')
  const { openChats, openChat } = useChatPopup()
  const queryClient = useQueryClient()
  // Stable ref so socket closures always read the latest expanded chat id
  const openChatsRef = useRef(openChats)
  useEffect(() => { openChatsRef.current = openChats }, [openChats])
  const expandedChatId = openChats.find((c) => !c.minimized)?.id
  const [conversations, setConversations] = useState(() => getPrefetchConversations() ?? [])
  const [archivedConversations, setArchivedConversations] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [showDMs, setShowDMs] = useState(true)
  const [showGroups, setShowGroups] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [composerMode, setComposerMode] = useState(null)
  const [directory, setDirectory] = useState(() => getPrefetchUsers() ?? [])
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [directorySearch, setDirectorySearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [groupName, setGroupName] = useState('')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [folders, setFolders] = useState([])
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [dmDragOver, setDmDragOver] = useState(false)
  const [groupDragOver, setGroupDragOver] = useState(false)
  const foldersLoadedRef = useRef(false)
  const isAdmin = user?.role === 'admin'
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
    return listConversations().then((data) => {
      const convs = data ?? []
      setConversations(convs)
      // Seed individual conversation queries so Chat opens instantly without waiting for a separate API call
      const now = Date.now()
      convs.forEach((conv) => {
        queryClient.setQueryData(['conversation', conv.id], conv, { updatedAt: now })
      })
    }).catch(() => {})
  }, [queryClient])

  const loadArchivedConversations = useCallback(() => {
    return listConversations({ archived: true }).then((data) => setArchivedConversations(data ?? [])).catch(() => {})
  }, [])

  // Seed React Query cache from prefetch data on first mount, then clear the store
  useEffect(() => {
    const prefetchedConvs = getPrefetchConversations()
    if (prefetchedConvs?.length) {
      const now = Date.now()
      prefetchedConvs.forEach((conv) => {
        queryClient.setQueryData(['conversation', conv.id], conv, { updatedAt: now })
      })
    }
    clearPrefetch()
  }, [queryClient])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (showArchived) loadArchivedConversations()
  }, [showArchived, loadArchivedConversations])

  // Load folders from localStorage — guarded by ref so React Strict Mode's
  // double-invocation doesn't re-read a corrupted empty array written by the
  // persist effect before setFolders has applied.
  useEffect(() => {
    if (!user?.id || foldersLoadedRef.current) return
    foldersLoadedRef.current = true
    try {
      const raw = localStorage.getItem(`orgchat-folders-${user.id}`)
      if (raw) setFolders(JSON.parse(raw))
    } catch {}
  }, [user?.id])

  // Persist folders whenever they change
  useEffect(() => {
    if (!user?.id || !foldersLoadedRef.current) return
    localStorage.setItem(`orgchat-folders-${user.id}`, JSON.stringify(folders))
  }, [folders, user?.id])

  const handleAddFolder = (rawName) => {
    const name = (rawName ?? '').trim()
    if (!name) return
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
    setFolders((prev) => [...prev, { id: crypto.randomUUID(), name, color, conversationIds: [] }])
    setShowSectionModal(false)
  }

  // onMoveToFolder is overloaded: '__delete__' deletes the folder, '__rename__' renames it
  const handleFolderAction = (convIdOrAction, folderId, extraArg) => {
    if (convIdOrAction === '__delete__') {
      setFolders((prev) => prev.filter((f) => f.id !== folderId))
      return
    }
    if (convIdOrAction === '__rename__') {
      setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name: extraArg } : f))
      return
    }
    // Normal move: convId → folderId (remove from any current folder first)
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id === folderId) return { ...f, conversationIds: [...new Set([...f.conversationIds, convIdOrAction])] }
        return { ...f, conversationIds: f.conversationIds.filter((id) => id !== convIdOrAction) }
      })
    )
  }

  const handleRemoveFromFolder = (convId, folderId) => {
    setFolders((prev) =>
      prev.map((f) => f.id === folderId ? { ...f, conversationIds: f.conversationIds.filter((id) => id !== convId) } : f)
    )
  }

  const handleDropToSection = (e) => {
    e.preventDefault()
    const convId = e.dataTransfer.getData('text/plain')
    if (convId) {
      setFolders((prev) =>
        prev.map((f) => ({ ...f, conversationIds: f.conversationIds.filter((id) => id !== convId) }))
      )
    }
  }

  useEffect(() => {
    if (!composerMode || directory.length || directoryLoading) return

    setDirectoryLoading(true)
    listUsers({ limit: 100 })
      .then(setDirectory)
      .catch(() => toast.error('Could not load people'))
      .finally(() => setDirectoryLoading(false))
  }, [composerMode, directory.length])

  useEffect(() => {
    const off1 = on('message:new', (data) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversation_id)
        if (idx === -1) return prev
        const activeId = openChatsRef.current.find((c) => !c.minimized)?.id ?? conversationId
        const updated = {
          ...prev[idx],
          last_message: data,
          unread_count:
            (data.conversation_id !== activeId || !document.hasFocus()) && data.sender_id !== user?.id
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

    // conversation:created is sent when a new group/DM is created
    const off3 = on('conversation:created', (data) => {
      if (data?.id) {
        setConversations((prev) => {
          if (prev.some((c) => c.id === data.id)) return prev
          return [{ ...data, unread_count: 0, member_count: data.members?.length ?? 0, is_member: true }, ...prev]
        })
      } else {
        loadConversations()
      }
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

    // conversation:archived — move out of active list into archived list (for the archiving user only)
    const off7 = on('conversation:archived', (data) => {
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === data.conversation_id)
        if (conv) setArchivedConversations((a) => [{ ...conv, archived_at: new Date().toISOString() }, ...a])
        return prev.filter((c) => c.id !== data.conversation_id)
      })
    })

    // conversation:unarchived — move back into active list
    const off8 = on('conversation:unarchived', (data) => {
      setArchivedConversations((prev) => {
        const conv = prev.find((c) => c.id === data.conversation_id)
        if (conv) setConversations((a) => [{ ...conv, archived_at: null }, ...a])
        return prev.filter((c) => c.id !== data.conversation_id)
      })
    })

    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); off8() }
  }, [on, conversationId, user?.id, loadConversations])

  useEffect(() => {
    const clearUnread = () => {
      if (expandedChatId && document.hasFocus()) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === expandedChatId ? { ...c, unread_count: 0 } : c
          )
        )
      }
    }
    clearUnread()
    window.addEventListener('focus', clearUnread)
    return () => window.removeEventListener('focus', clearUnread)
  }, [expandedChatId])

  const folderedIds = useMemo(() => new Set(folders.flatMap((f) => f.conversationIds)), [folders])

  const filtered = useMemo(() =>
    (conversations ?? [])
      .filter((c) => {
        if (folderedIds.has(c.id)) return false
        if (!search) return true
        const isDirect = c.type === 'direct'
        const other = isDirect ? c.members?.find((m) => m.user_id !== user?.id) : null
        const name = isDirect ? other?.user?.full_name : c.name
        return name?.toLowerCase().includes(search.toLowerCase())
      })
      .sort((a, b) => {
        const ta = a.last_message?.created_at ?? a.created_at
        const tb = b.last_message?.created_at ?? b.created_at
        return new Date(tb) - new Date(ta)
      }),
    [conversations, folderedIds, search, user?.id]
  )

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
      openChat(conversation.id)
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

  const handleCreateGroup = (isPrivate = false) => {
    const name = groupName.trim()
    if (!name) return
    const allIds = [...new Set([...selectedIds, user?.id])]
    openConversation({ type: 'group', name, user_ids: allIds, is_private: isPrivate })
  }

  const handleArchive = async (conv, isCurrentlyArchived) => {
    try {
      if (isCurrentlyArchived) {
        await unarchiveConversation(conv.id)
      } else {
        await archiveConversation(conv.id)
      }
      // WS events (conversation:archived / conversation:unarchived) will update state
    } catch {
      toast.error(isCurrentlyArchived ? 'Could not unarchive' : 'Could not archive')
    }
  }

  const handleClearChat = (conv) => {
    setConfirmDialog({
      title: 'Clear Chat',
      message: 'All messages will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          await clearConversation(conv.id)
          setConversations((prev) =>
            prev.map((c) => c.id === conv.id ? { ...c, last_message: null, unread_count: 0 } : c)
          )
          toast.success('Chat cleared')
        } catch {
          toast.error('Could not clear chat')
        }
      },
    })
  }

  const handleDeleteChat = (conv) => {
    const label = conv.type === 'direct' ? 'chat' : 'group'
    const message = conv.type === 'direct'
      ? 'Delete this conversation? The chat history will be permanently removed for you.'
      : 'Delete this group? You will leave and cannot rejoin unless invited by a member.'
    setConfirmDialog({
      title: conv.type === 'direct' ? 'Delete Conversation' : 'Delete Group',
      message,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          await deleteConversation(conv.id)
          setConversations((prev) => prev.filter((c) => c.id !== conv.id))
          toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted`)
        } catch {
          toast.error('Could not delete chat')
        }
      },
    })
  }

  return (
    <>
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-80 flex flex-col flex-shrink-0 bg-cn-white transform lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{ boxShadow: 'var(--shadow-sidebar)', borderRight: '1px solid var(--cn-gray-200)' }}
    >
      {/* Gradient header — full width */}
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

      {/* Middle: nav strip + conversation content */}
      <div className="flex flex-row flex-1 min-h-0">

        {/* Nav strip */}
        <nav
          className="flex flex-col items-center gap-1 pt-3 pb-2 flex-shrink-0"
          style={{ width: 56, borderRight: '1px solid var(--cn-gray-200)', background: 'var(--cn-gray-100)' }}
        >
          {[
            { icon: PhoneIcon, label: 'Calls', path: '/call-history' },
            { icon: CalendarIcon, label: 'Calendar', path: '/calendar' },
            { icon: ClipboardDocumentListIcon, label: 'Tasks', path: '/tasks' },
            { icon: PencilSquareIcon, label: 'Scribble', path: '/scribble' },
          ].map(({ icon: Icon, label, path, disabled }) => {
            const active = !disabled && location.pathname === path
            return (
              <button
                key={path}
                onClick={() => { if (disabled) return; active ? navigate('/') : navigate(path) }}
                title={disabled ? `${label} (Coming Soon)` : label}
                disabled={disabled}
                className="flex flex-col items-center gap-1 w-full py-3 transition-all duration-200 relative"
                style={{
                  color: disabled ? 'var(--cn-gray-300)' : active ? 'var(--cn-blue)' : 'var(--cn-gray-400)',
                  background: active ? 'var(--cn-blue-light)' : 'transparent',
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  filter: disabled ? 'grayscale(1)' : 'none',
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r"
                    style={{ background: 'var(--cn-blue)' }}
                  />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
              </button>
            )
          })}
          {isAdmin && (
            <button
              onClick={() => setShowAdminModal(true)}
              title="Admin Console"
              className="flex flex-col items-center gap-1 w-full py-3 transition-all duration-200 text-cn-gray-400 hover:text-cn-red"
            >
              <ShieldCheckIcon className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-tighter">Admin</span>
            </button>
          )}
        </nav>

        {/* Right: action buttons + conversation list */}
        <div className="flex flex-col flex-1 min-w-0">

      {/* Action buttons */}
      <div className="flex gap-1.5 px-2 py-2.5 border-b border-cn-gray-200 flex-shrink-0">
        <button
          type="button"
          onClick={() => openComposer('direct')}
          className="cn-action-btn cn-action-btn--red flex items-center gap-1.5 px-2 py-2 text-xs font-bold rounded-full flex-1 justify-center relative overflow-hidden group whitespace-nowrap"
        >
          <span className="cn-action-btn__shine" />
          <PlusIcon className="w-3 h-3 relative z-10 flex-shrink-0 transition-transform duration-300 group-hover:rotate-90" />
          <span className="relative z-10">Chat</span>
        </button>
        <button
          type="button"
          onClick={() => openComposer('group')}
          className="cn-action-btn cn-action-btn--blue flex items-center gap-1.5 px-2 py-2 text-xs font-bold rounded-full flex-1 justify-center relative overflow-hidden group whitespace-nowrap"
        >
          <span className="cn-action-btn__shine" />
          <UserGroupIcon className="w-3 h-3 relative z-10 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          <span className="relative z-10">Group</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSectionModal(true)}
          className="cn-action-btn cn-action-btn--green flex items-center gap-1.5 px-2 py-2 text-xs font-bold rounded-full flex-1 justify-center relative overflow-hidden group whitespace-nowrap"
        >
          <span className="cn-action-btn__shine" />
          <FolderPlusIcon className="w-3 h-3 relative z-10 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          <span className="relative z-10">Section</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {(() => {
          const filteredDMs = filtered.filter((c) => c.type === 'direct')
          const filteredGroups = filtered.filter((c) => c.type !== 'direct')
          const dmUnread = filteredDMs.filter((c) => c.unread_count > 0).length
          const groupUnread = filteredGroups.filter((c) => c.unread_count > 0).length

          return (
            <>
              {/* DMs section */}
              <button
                onClick={() => setShowDMs((v) => !v)}
                onDragOver={(e) => { e.preventDefault(); setDmDragOver(true) }}
                onDragLeave={() => setDmDragOver(false)}
                onDrop={(e) => { setDmDragOver(false); handleDropToSection(e) }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-fast border-b border-cn-gray-100 ${dmDragOver ? 'cn-folder-drop-target text-cn-blue' : 'text-cn-gray-400 hover:text-cn-gray-600 hover:bg-cn-gray-100'}`}
              >
                <span
                  className="inline-block transition-transform duration-200"
                  style={{ transform: showDMs ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <span>DMs</span>
                {dmUnread > 0 && (
                  <span
                    className="ml-auto text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full leading-none"
                    style={{ background: 'linear-gradient(135deg, #CD5252 0%, #B03E3E 100%)' }}
                  >
                    {dmUnread}
                  </span>
                )}
              </button>
              {showDMs && filteredDMs.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isActive={openChats.some((c) => c.id === conv.id && !c.minimized)}
                  currentUserId={user?.id}
                  onlineUsers={onlineUsers}
                  userStatuses={userStatuses}
                  onArchive={handleArchive}
                  onClear={handleClearChat}
                  onDelete={handleDeleteChat}
                  folders={folders}
                  currentFolderId={null}
                  onMoveToFolder={handleFolderAction}
                  onClick={() => {
                    if (isOnSecondaryPage) navigate('/')
                    openChat(conv.id)
                    if (window.innerWidth < 1024) onClose()
                  }}
                />
              ))}
              {showDMs && filteredDMs.length === 0 && (
                <p className="pl-8 pr-4 py-2 text-xs text-cn-gray-400">No direct messages</p>
              )}

              {/* Groups section */}
              <button
                onClick={() => setShowGroups((v) => !v)}
                onDragOver={(e) => { e.preventDefault(); setGroupDragOver(true) }}
                onDragLeave={() => setGroupDragOver(false)}
                onDrop={(e) => { setGroupDragOver(false); handleDropToSection(e) }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-fast border-b border-cn-gray-100 ${groupDragOver ? 'cn-folder-drop-target text-cn-blue' : 'text-cn-gray-400 hover:text-cn-gray-600 hover:bg-cn-gray-100'}`}
              >
                <span
                  className="inline-block transition-transform duration-200"
                  style={{ transform: showGroups ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <span>Groups</span>
                {groupUnread > 0 && (
                  <span
                    className="ml-auto text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full leading-none"
                    style={{ background: 'linear-gradient(135deg, #CD5252 0%, #B03E3E 100%)' }}
                  >
                    {groupUnread}
                  </span>
                )}
              </button>
              {showGroups && filteredGroups.map((conv) => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  isActive={openChats.some((c) => c.id === conv.id && !c.minimized)}
                  currentUserId={user?.id}
                  onlineUsers={onlineUsers}
                  userStatuses={userStatuses}
                  onArchive={handleArchive}
                  onClear={handleClearChat}
                  onDelete={handleDeleteChat}
                  folders={folders}
                  currentFolderId={null}
                  onMoveToFolder={handleFolderAction}
                  onClick={() => {
                    if (isOnSecondaryPage) navigate('/')
                    openChat(conv.id)
                    if (window.innerWidth < 1024) onClose()
                  }}
                />
              ))}
              {showGroups && filteredGroups.length === 0 && (
                <p className="pl-8 pr-4 py-2 text-xs text-cn-gray-400">No groups</p>
              )}


              {/* Sections (folders) */}
              {folders.map((folder) => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  conversations={conversations ?? []}
                  currentUserId={user?.id}
                  onlineUsers={onlineUsers}
                  userStatuses={userStatuses}
                  onDropConv={handleFolderAction}
                  onConvClick={(conv) => {
                    if (isOnSecondaryPage) navigate('/')
                    openChat(conv.id)
                    if (window.innerWidth < 1024) onClose()
                  }}
                  onArchive={handleArchive}
                  onClear={handleClearChat}
                  onDelete={handleDeleteChat}
                  onMoveToFolder={handleFolderAction}
                  onRemoveFromFolder={handleRemoveFromFolder}
                  folders={folders}
                  activeConvIds={new Set(openChats.filter((c) => !c.minimized).map((c) => c.id))}
                />
              ))}

              {/* Archived section — at the bottom, visible on scroll down */}
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-cn-gray-400 hover:text-cn-gray-600 hover:bg-cn-gray-100 transition-fast border-b border-cn-gray-100"
              >
                <span
                  className="inline-block transition-transform duration-200"
                  style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <span>Archived</span>
                {archivedConversations.length > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-cn-gray-200 text-cn-gray-500 px-1.5 py-0.5 rounded-full">
                    {archivedConversations.length}
                  </span>
                )}
              </button>
              {showArchived && (
                <div className="bg-cn-gray-50">
                  {archivedConversations.length === 0 && (
                    <p className="pl-8 pr-4 py-2 text-xs text-cn-gray-400">No archived conversations</p>
                  )}
                  {archivedConversations
                    .filter((c) => {
                      if (!search) return true
                      const isDirect = c.type === 'direct'
                      const other = isDirect ? c.members?.find((m) => m.user_id !== user?.id) : null
                      const name = isDirect ? other?.user?.full_name : c.name
                      return name?.toLowerCase().includes(search.toLowerCase())
                    })
                    .map((conv) => (
                      <ConvItem
                        key={conv.id}
                        conv={conv}
                        isActive={openChats.some((c) => c.id === conv.id && !c.minimized)}
                        currentUserId={user?.id}
                        onlineUsers={onlineUsers}
                        userStatuses={userStatuses}
                        onArchive={handleArchive}
                        onClear={handleClearChat}
                        onDelete={handleDeleteChat}
                        onClick={() => {
                          if (isOnSecondaryPage) navigate('/')
                          openChat(conv.id)
                          if (window.innerWidth < 1024) onClose()
                        }}
                      />
                    ))}
                </div>
              )}
            </>
          )
        })()}

      </div>
        </div>{/* end right content */}
      </div>{/* end middle flex-row */}

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
            e.stopPropagation()
            setConfirmDialog({
              title: 'Sign Out',
              message: "Are you sure you want to sign out?",
              confirmLabel: 'Sign Out',
              danger: false,
              icon: ArrowRightOnRectangleIcon,
              onConfirm: () => { setConfirmDialog(null); logout() },
            })
          }}
          className="p-2 rounded-lg transition-all duration-200"
          style={{ color: 'var(--cn-gray-400)' }}
          title="Sign out"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
    {showAdminModal && (
      <AdminMenuModal isOpen={showAdminModal} onClose={() => setShowAdminModal(false)} />
    )}
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
    {showSectionModal && (
      <SectionModal
        onClose={() => setShowSectionModal(false)}
        onCreate={handleAddFolder}
      />
    )}
    {showProfileModal && (
      <ProfileSettingsModal onClose={() => setShowProfileModal(false)} />
    )}
    {confirmDialog && (
      <ConfirmDialog
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        danger={confirmDialog.danger}
        icon={confirmDialog.icon}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />
    )}
    </>
  )
}
