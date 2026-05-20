import { useEffect, useRef, useState } from 'react'
import { PhoneXMarkIcon, MicrophoneIcon, VideoCameraIcon, ComputerDesktopIcon, UserPlusIcon, XMarkIcon, MagnifyingGlassIcon, ArrowsPointingOutIcon, MinusIcon } from '@heroicons/react/24/solid'
import { MicrophoneIcon as MicOffIcon, VideoCameraIcon as VideoCameraOffIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import { listUsers } from '../api/users'
import { inviteToCall } from '../api/calls'
import toast from 'react-hot-toast'

function VideoTile({ stream, label, muted = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !stream) return

    el.srcObject = stream
    // Start muted so the browser's autoplay policy always allows play() to succeed
    // (browsers block unmuted autoplay for elements that start playing outside a
    // synchronous user-gesture context, which is always the case for remote tracks
    // that arrive after WebRTC negotiation completes). Once playing, we restore the
    // intended muted state so audio works correctly.
    el.muted = true

    const applyMutedState = () => { el.muted = muted }

    const tryPlay = () => {
      el.play()
        .then(applyMutedState)
        .catch(() => {
          // Muted play should never fail; if it somehow does, retry on interaction.
          const resume = () => {
            el.muted = muted
            el.play().catch(() => {})
          }
          document.addEventListener('click', resume, { once: true })
        })
    }
    tryPlay()

    // Re-trigger play when a new track (e.g. video arriving after audio) is added
    // to the same stream object, since the effect won't re-run for same reference.
    stream.addEventListener('addtrack', tryPlay)
    return () => {
      stream.removeEventListener('addtrack', tryPlay)
      el.srcObject = null
    }
  }, [stream]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the DOM muted property in sync if muted prop changes independently.
  useEffect(() => {
    const el = videoRef.current
    if (el) el.muted = muted
  }, [muted])

  return (
    <div
      className="relative rounded-2xl overflow-hidden aspect-video flex items-center justify-center transition-all duration-300 shadow-card group"
      style={{
        backgroundColor: 'var(--cn-gray-200)',
        border: '1.5px solid var(--cn-gray-200)',
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-lg opacity-25"
              style={{ background: 'linear-gradient(135deg, var(--cn-red), var(--cn-blue))' }}
            />
            <UserAvatar user={{ full_name: label }} size="lg" />
          </div>
          <span
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: 'var(--cn-gray-600)' }}
          >
            {label}
          </span>
        </div>
      )}

      <div
        className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ backgroundColor: 'var(--cn-gray-100)', border: '1px solid var(--cn-gray-200)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-cn-success" />
        <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--cn-gray-600)' }}>
          {label}
        </span>
      </div>
    </div>
  )
}

function AudioPlayer({ stream }) {
  const audioRef = useRef(null)
  useEffect(() => {
    const el = audioRef.current
    if (!el || !stream) return
    el.srcObject = stream
    const tryPlay = () => {
      el.play().catch(() => {
        const resume = () => el.play().catch(() => {})
        document.addEventListener('click', resume, { once: true })
      })
    }
    tryPlay()
    stream.addEventListener('addtrack', tryPlay)
    return () => stream.removeEventListener('addtrack', tryPlay)
  }, [stream])
  return <audio ref={audioRef} autoPlay playsInline />
}

function ControlBtn({ onClick, active, activeColor = 'var(--cn-red)', title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
      style={{
        backgroundColor: active ? activeColor : 'var(--cn-gray-200)',
        boxShadow: active ? `0 0 16px ${activeColor}55` : 'none',
        color: active ? '#fff' : 'var(--cn-charcoal)',
      }}
    >
      {children}
    </button>
  )
}

export default function GroupCallRoom({
  callState,
  activeCall,
  localStream,
  remoteParticipants,
  onEnd,
  localUser,
  isScreenSharing,
  remoteIsScreenSharing,
  onToggleScreenShare,
  isCameraOff,
  onToggleCamera,
  remoteCameraStates,
  minimized = false,
  onMinimize,
  onMaximize,
}) {
  const [muted, setMuted] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [invitingId, setInvitingId] = useState(null)

  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted })
  }, [localStream, muted])

  useEffect(() => {
    if (showInviteModal && users.length === 0) {
      setLoadingUsers(true)
      listUsers({ limit: 100 })
        .then(setUsers)
        .catch(() => toast.error('Failed to load users'))
        .finally(() => setLoadingUsers(false))
    }
  }, [showInviteModal, users.length])

  const handleInvite = async (userId) => {
    setInvitingId(userId)
    try {
      await inviteToCall(activeCall.call_id, userId)
      toast.success('Invitation sent')
      setShowInviteModal(false)
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to invite user')
    } finally {
      setInvitingId(null)
    }
  }

  const filteredUsers = users.filter(u => {
    if (u.id === localUser?.id) return false
    if (remoteParticipants?.has(u.id)) return false
    const q = search.toLowerCase()
    return (u.display_name || u.full_name || '').toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  if (!activeCall) return null

  const isVideo = activeCall.type === 'video'
  const participants = Array.from(remoteParticipants?.values() ?? [])
  const totalTiles = 1 + participants.length

  if (minimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl shadow-modal animate-cn-fade-up"
        style={{ backgroundColor: 'var(--cn-gray-100)', border: '1.5px solid var(--cn-gray-200)' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: isVideo ? 'var(--cn-blue-light)' : 'var(--cn-red-light)' }}
        >
          {isVideo ? '📹' : '🎙'}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold leading-none truncate" style={{ color: 'var(--cn-charcoal)' }}>
            {callState === 'calling' ? 'Calling…' : `${totalTiles} participant${totalTiles !== 1 ? 's' : ''}`}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--cn-gray-400)' }}>
            {isVideo ? 'Video' : 'Voice'} call in progress
          </p>
        </div>

        <button
          onClick={() => setMuted(v => !v)}
          title={muted ? 'Unmute' : 'Mute'}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0"
          style={{
            backgroundColor: muted ? 'var(--cn-red)' : 'var(--cn-gray-200)',
            color: muted ? '#fff' : 'var(--cn-charcoal)',
          }}
        >
          {muted ? <MicOffIcon className="w-3.5 h-3.5" /> : <MicrophoneIcon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onEnd}
          title="End call"
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'var(--cn-red)' }}
        >
          <PhoneXMarkIcon className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onMaximize}
          title="Expand call"
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'var(--cn-gray-200)', color: 'var(--cn-charcoal)' }}
        >
          <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
        </button>

        {/* Keep audio playing while minimized */}
        {participants.map(({ user, stream }) =>
          (!isVideo || !stream?.getVideoTracks().length) && stream
            ? <AudioPlayer key={user?.id} stream={stream} />
            : null
        )}
      </div>
    )
  }

  // Max 3 cols; tiles scroll vertically only when >3 participants
  const gridCols = totalTiles === 1 ? 1 : totalTiles <= 2 ? 2 : 3
  const maxContainerWidth =
    totalTiles === 1 ? 'max-w-[360px]' :
    totalTiles <= 2 ? 'max-w-[620px]' :
    'max-w-[860px]'
  const shouldScroll = totalTiles > 3

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ backgroundColor: 'var(--cn-app-bg)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ backgroundColor: 'var(--cn-gray-100)', borderColor: 'var(--cn-gray-200)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
            style={{ backgroundColor: isVideo ? 'var(--cn-blue-light)' : 'var(--cn-red-light)' }}
          >
            {isVideo ? '📹' : '🎙'}
          </div>
          <div>
            <h2 className="font-bold text-sm leading-none" style={{ color: 'var(--cn-charcoal)' }}>
              {isVideo ? 'Video' : 'Voice'} Call
            </h2>
            <p className="text-[10px] uppercase tracking-widest font-semibold mt-0.5" style={{ color: 'var(--cn-gray-400)' }}>
              {totalTiles} Participant{totalTiles !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cn-success animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--cn-gray-400)' }}>
              Encrypted
            </span>
          </div>
          <button
            onClick={onMinimize}
            title="Minimize call"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors ml-1"
            style={{ color: 'var(--cn-gray-400)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cn-gray-200)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <MinusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Participant grid / presentation layout */}
      <div
        className={`flex-1 p-5 flex items-center justify-center ${
          isScreenSharing || remoteIsScreenSharing
            ? 'overflow-hidden'
            : shouldScroll ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'
        }`}
      >
        {callState === 'calling' && participants.length === 0 ? (
          <div className="flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="absolute rounded-full border-2 animate-ping"
                  style={{
                    borderColor: 'var(--cn-red)',
                    width: `${80 + i * 32}px`,
                    height: `${80 + i * 32}px`,
                    animationDelay: `${i * 0.4}s`,
                    animationDuration: '1.5s',
                    opacity: 0.3,
                  }}
                />
              ))}
              <UserAvatar user={localUser} size="xl" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold animate-pulse" style={{ color: 'var(--cn-charcoal)' }}>
                Calling…
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--cn-gray-400)' }}>
                Waiting for the other person to answer
              </p>
            </div>
            <button
              onClick={onEnd}
              className="mt-2 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110"
              style={{ backgroundColor: 'var(--cn-red)', boxShadow: 'var(--shadow-glow-red)' }}
              title="Cancel call"
            >
              <PhoneXMarkIcon className="w-5 h-5 text-white" />
            </button>
          </div>
        ) : (isScreenSharing || remoteIsScreenSharing) ? (
          /* Presentation mode: large stage + thumbnail strip */
          <div className="flex flex-col gap-3 w-full h-full">
            {/* Main screen share stage */}
            <div className="flex-1 min-h-0">
              {isScreenSharing ? (
                /* Show indicator instead of screen capture to prevent infinite mirror loop */
                <div
                  className="w-full h-full rounded-2xl flex flex-col items-center justify-center gap-3"
                  style={{ backgroundColor: 'var(--cn-gray-200)', border: '1.5px solid var(--cn-gray-300)' }}
                >
                  <ComputerDesktopIcon className="w-12 h-12" style={{ color: 'var(--cn-blue)' }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--cn-charcoal)' }}>
                    You are sharing your screen
                  </p>
                  <p className="text-xs" style={{ color: 'var(--cn-gray-400)' }}>
                    Others can see your screen
                  </p>
                </div>
              ) : (
                <VideoTile
                  stream={participants[0]?.stream ?? null}
                  label={`${participants[0]?.user?.full_name ?? 'Unknown'} — screen`}
                  muted={!isVideo}
                />
              )}
            </div>
            {/* Thumbnail strip */}
            <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
              {remoteIsScreenSharing ? (
                /* Remote sharing: thumbnails = local + remaining participants */
                <>
                  <div key="local" className="w-44 shrink-0">
                    <VideoTile
                      stream={isVideo ? localStream : null}
                      label={localUser?.full_name ?? 'You'}
                      muted
                    />
                  </div>
                  {participants.slice(1).map(({ user, stream: pStream }) => (
                    <div key={user?.id ?? 'unknown'} className="w-44 shrink-0">
                      <VideoTile stream={isVideo ? pStream : null} label={user?.full_name ?? 'Unknown'} />
                    </div>
                  ))}
                </>
              ) : (
                /* Local sharing: thumbnails = camera feed + all remote participants */
                <>
                  {isVideo && (
                    <div key="local" className="w-44 shrink-0">
                      <VideoTile stream={localStream} label={localUser?.full_name ?? 'You'} muted />
                    </div>
                  )}
                  {participants.map(({ user, stream: pStream }) => (
                    <div key={user?.id ?? 'unknown'} className="w-44 shrink-0">
                      <VideoTile stream={isVideo ? pStream : null} label={user?.full_name ?? 'Unknown'} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Normal grid layout */
          <div
            className={`grid gap-4 w-full mx-auto ${maxContainerWidth}`}
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
          >
            <VideoTile
              stream={!isCameraOff ? localStream : null}
              label={localUser?.full_name ?? 'You'}
              muted
            />
            {participants.map(({ user, stream }) => (
              <VideoTile
                key={user?.id ?? 'unknown'}
                stream={
                  (isVideo || remoteCameraStates?.has(user?.id)) && !remoteCameraStates?.get(user?.id)
                    ? stream
                    : null
                }
                label={user?.full_name ?? 'Unknown'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex justify-center pb-6 px-5">
        <div
          className="flex items-center gap-3 py-3 px-6 rounded-2xl border shadow-card"
          style={{
            backgroundColor: 'var(--cn-gray-100)',
            borderColor: 'var(--cn-gray-200)',
          }}
        >
          <ControlBtn
            onClick={() => setMuted(v => !v)}
            active={muted}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted
              ? <MicOffIcon className="w-4 h-4" />
              : <MicrophoneIcon className="w-4 h-4" />}
          </ControlBtn>

          <ControlBtn
            onClick={onToggleCamera}
            active={false}
            title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isCameraOff
              ? <VideoCameraOffIcon className="w-4 h-4" />
              : <VideoCameraIcon className="w-4 h-4" />}
          </ControlBtn>

          <ControlBtn
            onClick={onToggleScreenShare}
            active={isScreenSharing}
            activeColor="var(--cn-blue)"
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            <ComputerDesktopIcon className="w-4 h-4" />
          </ControlBtn>

          <ControlBtn
            onClick={() => setShowInviteModal(true)}
            active={false}
            title="Add Participant"
          >
            <UserPlusIcon className="w-4 h-4" />
          </ControlBtn>

          <div className="w-px h-7 mx-1" style={{ backgroundColor: 'var(--cn-gray-200)' }} />

          <button
            onClick={onEnd}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 text-white"
            style={{ backgroundColor: 'var(--cn-red)', boxShadow: 'var(--shadow-glow-red)' }}
            title="End call"
          >
            <PhoneXMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hidden audio players for voice calls */}
      {!isVideo &&
        participants.map(({ user, stream }) =>
          stream ? <AudioPlayer key={user?.id} stream={stream} /> : null
        )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-cn-white rounded-3xl overflow-hidden shadow-modal animate-cn-fade-up">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--cn-gray-200)' }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--cn-charcoal)' }}>Add Participant</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--cn-gray-400)' }}>Choose someone to join the call</p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-full transition-colors"
                style={{ color: 'var(--cn-gray-400)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cn-gray-100)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-3">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-gray-400)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-sm border-none outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--cn-gray-100)',
                    color: 'var(--cn-charcoal)',
                    ringColor: 'var(--cn-blue)',
                  }}
                />
              </div>

              <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-0.5">
                {loadingUsers ? (
                  <div className="py-8 text-center text-xs" style={{ color: 'var(--cn-gray-400)' }}>
                    Loading users...
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map(u => (
                    <button
                      key={u.id}
                      disabled={invitingId === u.id}
                      onClick={() => handleInvite(u.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors disabled:opacity-50 text-left"
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cn-gray-100)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <UserAvatar user={u} size="sm" online={u.is_online} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-charcoal)' }}>
                          {u.display_name || u.full_name}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--cn-gray-400)' }}>
                          {u.department || u.email}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg"
                        style={{ color: 'var(--cn-blue)', backgroundColor: 'var(--cn-blue-light)' }}
                      >
                        {invitingId === u.id ? 'Inviting…' : 'Invite'}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs" style={{ color: 'var(--cn-gray-400)' }}>
                    No users found
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
