import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  XMarkIcon,
  PhotoIcon,
  DocumentIcon,
  LinkIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  UsersIcon,
  UserPlusIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { getAttachments } from '../api/messages'
import { addMembers } from '../api/conversations'
import { listUsers } from '../api/users'
import ImageLightbox from './ImageLightbox'
import UserAvatar from './UserAvatar'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

export default function ChatSidebarInfo({ conversationId, conversation, onClose }) {
  const isGroup = conversation?.type === 'group'
  const [activeTab, setActiveTab] = useState('media')
  const [lightbox, setLightbox] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selectedToAdd, setSelectedToAdd] = useState([])
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery(
    ['conversation-attachments', conversationId],
    () => getAttachments(conversationId),
    { enabled: !!conversationId }
  )

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

  const tabs = [
    { id: 'media', label: 'Media', icon: PhotoIcon, color: 'var(--cn-red)' },
    { id: 'files', label: 'Files', icon: DocumentIcon, color: 'var(--cn-blue)' },
    { id: 'links', label: 'Links', icon: LinkIcon, color: '#993399' },
  ]

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <>
      <div className="w-80 flex flex-col bg-cn-white border-l border-cn-gray-200 h-full animate-cn-slide-in-right shadow-2xl relative z-20">
        {/* Header */}
        <div className="relative p-6 border-b border-cn-gray-100 overflow-hidden bg-cn-white">
          <div className="absolute top-0 left-0 w-full h-1 cn-gradient-brand"></div>
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-cn-blue/5 rounded-full blur-3xl"></div>
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h3 className="text-lg font-bold text-cn-charcoal flex items-center gap-2">
                <span className="p-2 rounded-lg bg-cn-gray-100 text-cn-charcoal">
                  <InformationCircleIcon className="w-5 h-5" />
                </span>
                {isGroup ? 'Group Info' : 'Shared Content'}
              </h3>
              <p className="text-[11px] text-cn-gray-400 mt-1 uppercase tracking-widest font-bold">
                Media, Files & Links
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

        {/* Tabs */}
        <div className="flex p-2 bg-cn-gray-100/50 mx-6 mt-6 rounded-2xl">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-cn-white text-cn-charcoal shadow-sm scale-100'
                    : 'text-cn-gray-400 hover:text-cn-gray-600 hover:bg-cn-white/50 scale-95'
                }`}
              >
                <Icon className="w-4 h-4" style={{ color: isActive ? tab.color : undefined }} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 border-4 border-cn-blue/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-cn-blue border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-xs font-bold text-cn-gray-400 uppercase tracking-widest">Loading...</p>
            </div>
          ) : (
            <div className="animate-cn-fade-up">

              {/* Media Tab */}
              {activeTab === 'media' && (
                <div className="grid grid-cols-2 gap-3">
                  {data?.media?.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => setLightbox({ src: msg.file_url, alt: msg.file_name })}
                      className="group relative aspect-square rounded-2xl bg-cn-gray-100 overflow-hidden border border-cn-gray-100 hover:shadow-xl hover:shadow-cn-blue/10 hover:border-cn-blue/30 transition-all duration-300"
                    >
                      <img src={msg.file_url} alt={msg.file_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                        <p className="text-[10px] text-white font-medium truncate">{msg.file_name}</p>
                      </div>
                    </button>
                  ))}
                  {(!data?.media || data.media.length === 0) && (
                    <div className="col-span-2 flex flex-col items-center justify-center py-20 text-center opacity-60">
                      <div className="w-16 h-16 rounded-3xl bg-cn-gray-50 flex items-center justify-center mb-4 text-2xl grayscale">🖼️</div>
                      <p className="font-bold text-cn-charcoal text-xs">No media shared yet</p>
                    </div>
                  )}
                </div>
              )}
              {lightbox && (
                <ImageLightbox
                  src={lightbox.src}
                  alt={lightbox.alt}
                  onClose={() => setLightbox(null)}
                />
              )}

              {/* Files Tab */}
              {activeTab === 'files' && (
                <div className="space-y-3">
                  {data?.files?.map((msg) => (
                    <a
                      key={msg.id}
                      href={msg.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-4 p-4 rounded-2xl border border-cn-gray-100 bg-cn-white hover:bg-cn-blue-light/30 hover:border-cn-blue/20 hover:shadow-lg hover:shadow-cn-blue/5 transition-all duration-300 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-cn-blue-light flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <DocumentIcon className="w-6 h-6 text-cn-blue" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-cn-charcoal truncate">{msg.file_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-cn-blue uppercase">{formatSize(msg.file_size)}</span>
                          <span className="w-1 h-1 bg-cn-gray-300 rounded-full"></span>
                          <span className="text-[10px] text-cn-gray-400 font-medium">
                            {dayjs(msg.created_at).format('MMM D, YYYY')}
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="w-5 h-5 text-cn-gray-300 group-hover:text-cn-blue group-hover:translate-x-1 transition-all" />
                    </a>
                  ))}
                  {(!data?.files || data.files.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                      <div className="w-16 h-16 rounded-3xl bg-cn-gray-50 flex items-center justify-center mb-4 text-2xl grayscale">📄</div>
                      <p className="font-bold text-cn-charcoal text-xs">No files shared yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* Links Tab */}
              {activeTab === 'links' && (
                <div className="space-y-4">
                  {data?.links?.map((msg) => {
                    const urls = msg.content.match(/https?:\/\/[^\s]+/g) || []
                    return urls.map((url, i) => (
                      <a
                        key={`${msg.id}-${i}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col p-5 rounded-2xl border border-cn-gray-100 bg-cn-white hover:bg-cn-red-light/30 hover:border-cn-red/20 hover:shadow-lg hover:shadow-cn-red/5 transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-cn-red-light flex items-center justify-center group-hover:rotate-12 transition-transform">
                            <LinkIcon className="w-4 h-4 text-cn-red" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-cn-charcoal truncate block">{new URL(url).hostname}</span>
                            <span className="text-[9px] text-cn-gray-400 font-bold uppercase tracking-tight">Shared {dayjs(msg.created_at).format('MMM D')}</span>
                          </div>
                        </div>
                        <p className="text-[12px] text-cn-gray-600 break-all line-clamp-2 leading-relaxed bg-cn-gray-100/30 p-2 rounded-lg border border-cn-gray-100/50 group-hover:bg-cn-white transition-colors">{url}</p>
                        <div className="mt-3 flex items-center justify-end text-cn-red opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                          <span className="text-[10px] font-bold uppercase mr-1">Visit Link</span>
                          <ChevronRightIcon className="w-4 h-4" />
                        </div>
                      </a>
                    ))
                  })}
                  {(!data?.links || data.links.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                      <div className="w-16 h-16 rounded-3xl bg-cn-gray-50 flex items-center justify-center mb-4 text-2xl grayscale">🔗</div>
                      <p className="font-bold text-cn-charcoal text-xs">No links shared yet</p>
                    </div>
                  )}
                </div>
              )}

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
                      <UserAvatar user={u} size="sm" online={u.is_online} />
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
