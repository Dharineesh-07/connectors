import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { listUsers } from '../api/users'
import { inviteToCall, getWaitingRoom, admitParticipant, rejectWaiting } from '../api/calls'
import { useSfuCall } from '../hooks/useSfuCall'
import {
  MicrophoneIcon, VideoCameraIcon, VideoCameraSlashIcon,
  ComputerDesktopIcon, HandRaisedIcon, FaceSmileIcon, UserGroupIcon,
} from '@heroicons/react/24/solid'

const ANIMATIONS = `
  @keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 6px 2px #22c55e99; }
    50%       { box-shadow: 0 0 14px 6px #22c55ebb; opacity: 0.7; }
  }
  @keyframes pulseAmber {
    0%, 100% { box-shadow: 0 0 6px 2px #f59e0b99; }
    50%       { box-shadow: 0 0 14px 6px #f59e0bbb; opacity: 0.7; }
  }
  @keyframes titleGlow {
    0%, 100% { text-shadow: 0 0 8px rgba(139,92,246,0.6), 0 0 20px rgba(139,92,246,0.3); }
    50%       { text-shadow: 0 0 12px rgba(56,189,248,0.7), 0 0 28px rgba(56,189,248,0.35); }
  }
  @keyframes endBtnPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.3); }
    50%       { box-shadow: 0 0 18px rgba(239,68,68,0.6); }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes headerLine {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes tileIdle {
    0%, 100% { box-shadow: 0 0 0 1px rgba(139,92,246,0.25), 0 8px 32px rgba(0,0,0,0.7); }
    50%       { box-shadow: 0 0 0 1px rgba(56,189,248,0.3), 0 8px 40px rgba(56,189,248,0.12); }
  }
  /* speaking: pulsing border that alternates cyan <-> purple */
  @keyframes speakBorder {
    0%, 100% {
      box-shadow:
        0 0 0 2px #38bdf8cc,
        0 0 0 5px rgba(56,189,248,0.25),
        0 0 28px rgba(56,189,248,0.45);
    }
    50% {
      box-shadow:
        0 0 0 2px #8b5cf6cc,
        0 0 0 8px rgba(139,92,246,0.2),
        0 0 36px rgba(139,92,246,0.5);
    }
  }
  /* waveform shape morphs between two complementary wave paths */
  @keyframes waveform {
    0% {
      clip-path: polygon(
        0% 70%, 8% 28%, 16% 62%, 24% 14%, 32% 52%,
        40% 6%,  48% 44%, 56% 18%, 64% 56%, 72% 16%,
        80% 50%, 88% 24%, 96% 58%, 100% 40%,
        100% 100%, 0% 100%
      );
    }
    100% {
      clip-path: polygon(
        0% 32%, 8% 68%, 16% 22%, 24% 72%, 32% 18%,
        40% 60%, 48% 10%, 56% 52%, 64% 16%, 72% 62%,
        80% 20%, 88% 56%, 96% 28%, 100% 60%,
        100% 100%, 0% 100%
      );
    }
  }

  @keyframes floatUp {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    80%  { opacity: 0.8; transform: translateY(-60px) scale(1.4); }
    100% { opacity: 0; transform: translateY(-80px) scale(1.6); }
  }
  @keyframes raiseHandPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.6); }
    50%       { box-shadow: 0 0 0 8px rgba(251,191,36,0); }
  }

  /* ── glassmorphism participant tiles ── */
  .cn-tile {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    min-height: 0;
    background: linear-gradient(135deg, #160d2e 0%, #0d1a2e 100%);
    animation: tileIdle 3s ease-in-out infinite;
  }
  /* speaking state — replaces idle glow with a pulsing border */
  .cn-tile[data-speaking="true"] {
    animation: speakBorder 0.75s ease-in-out infinite;
  }
  /* animated waveform badge in bottom-right when speaking */
  .cn-tile[data-speaking="true"]::after {
    content: '';
    position: absolute;
    bottom: 38px;
    right: 10px;
    width: 52px;
    height: 24px;
    background: linear-gradient(90deg, #38bdf8, #8b5cf6 50%, #38bdf8);
    clip-path: polygon(
      0% 70%, 8% 28%, 16% 62%, 24% 14%, 32% 52%,
      40% 6%,  48% 44%, 56% 18%, 64% 56%, 72% 16%,
      80% 50%, 88% 24%, 96% 58%, 100% 40%,
      100% 100%, 0% 100%
    );
    animation: waveform 0.65s ease-in-out infinite alternate;
    filter: drop-shadow(0 0 5px rgba(56,189,248,0.75));
    pointer-events: none;
    z-index: 10;
    border-radius: 4px;
  }
  .cn-tile-name {
    position: absolute;
    bottom: 8px;
    left: 10px;
    z-index: 6;
    max-width: calc(100% - 20px);
    padding: 2px 9px;
    border-radius: 6px;
    background: rgba(13,8,26,0.62);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(139,92,246,0.3);
    color: #c4b5fd;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-shadow: 0 0 8px rgba(139,92,246,0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .cn-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 700;
    color: #fff;
    overflow: hidden;
    background: linear-gradient(135deg, #6d28d9, #1d4ed8);
    box-shadow: 0 0 0 1px rgba(139,92,246,0.4), 0 8px 24px rgba(0,0,0,0.5);
  }
`

function gridColumns(n) {
  if (n <= 1) return 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
}

function avatarContent(tile) {
  if (tile.avatarUrl) {
    return <img src={tile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return (tile.name || '?')[0].toUpperCase()
}

// Renders one participant tile: live video when present, otherwise an avatar
// placeholder. Binds the native MediaStream to the <video> element.
function VideoTile({ tile, isSpeaking, raised }) {
  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = tile.videoStream || null
    return () => { if (el) el.srcObject = null }
  }, [tile.videoStream])

  const showVideo = tile.videoStream && !tile.videoMuted
  return (
    <div className="cn-tile" data-speaking={isSpeaking ? 'true' : 'false'}>
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.isLocal}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: tile.isLocal && !tile.isDesktop ? 'scaleX(-1)' : 'none',
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="cn-avatar">{avatarContent(tile)}</div>
        </div>
      )}
      <div className="cn-tile-name">{tile.name || 'Participant'}{tile.isLocal ? ' (You)' : ''}</div>
      {raised && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          pointerEvents: 'none', color: '#fbbf24',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))',
          animation: 'raiseHandPulse 1.5s ease-in-out infinite',
        }}><HandRaisedIcon style={{ width: 22, height: 22 }} /></div>
      )}
    </div>
  )
}

// Hidden audio sink for a remote participant's audio stream.
function RemoteAudio({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!stream || !el) return
    el.srcObject = stream
    return () => { if (el) el.srcObject = null }
  }, [stream])
  return <audio ref={ref} autoPlay />
}

function TileGrid({ tiles, speakingId, raisedHands, localHandRaised, localId }) {
  const cols = gridColumns(tiles.length)
  return (
    <div style={{
      display: 'grid', height: '100%', width: '100%',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridAutoRows: '1fr', gap: 6, padding: 6, boxSizing: 'border-box',
    }}>
      {tiles.map((tile) => {
        const raised = tile.id === localId ? localHandRaised : !!raisedHands[tile.id]?.raised
        return (
          <VideoTile
            key={tile.id}
            tile={tile}
            isSpeaking={tile.id === speakingId}
            raised={raised}
          />
        )
      })}
    </div>
  )
}

function AddParticipantModal({ callId, localUserId, inCallIds = [], onClose }) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [inviting, setInviting] = useState({}) // userId -> 'loading' | 'done'

  // Everyone already on the call (including yourself) — they can't be invited again.
  const inCall = new Set(inCallIds)

  useEffect(() => {
    listUsers().then(setUsers).catch(() => {})
  }, [])

  const filtered = users.filter((u) => {
    if (u.id === localUserId) return false // never list yourself
    const q = query.toLowerCase()
    return (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
  })

  const handleInvite = async (u) => {
    if (inviting[u.id] || inCall.has(u.id)) return
    setInviting((prev) => ({ ...prev, [u.id]: 'loading' }))
    try {
      await inviteToCall(callId, u.id)
      setInviting((prev) => ({ ...prev, [u.id]: 'done' }))
      toast.success(`Invited ${u.full_name || u.email}`)
    } catch (e) {
      setInviting((prev) => { const n = { ...prev }; delete n[u.id]; return n })
      toast.error(e?.response?.data?.detail || 'Failed to invite')
    }
  }

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 340, maxHeight: 480, borderRadius: 14,
          background: 'linear-gradient(145deg, #13082a, #0d1525)',
          border: '1px solid rgba(139,92,246,0.45)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.2)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: '1px solid rgba(139,92,246,0.2)',
        }}>
          <span style={{
            fontWeight: 700, fontSize: 14, letterSpacing: 0.5,
            background: 'linear-gradient(90deg, #22d3ee, #818cf8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Add Participant
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#7c6fa0',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
            }}
          >
            ×
          </button>
        </div>

        {/* Search input */}
        <div style={{ padding: '10px 14px 6px' }}>
          <input
            autoFocus
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 8, padding: '7px 12px', color: '#e0d7ff',
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 && (
            <div style={{ color: '#7c6fa0', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>
              {users.length === 0 ? 'Loading…' : 'No people found'}
            </div>
          )}
          {filtered.map((u) => {
            const alreadyIn = inCall.has(u.id)
            const state = alreadyIn ? 'in_call' : inviting[u.id]
            const interactive = !state
            const name = u.full_name || u.email
            return (
              <div
                key={u.id}
                onClick={() => handleInvite(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10, cursor: interactive ? 'pointer' : 'default',
                  transition: 'background 0.15s, border-color 0.15s',
                  opacity: alreadyIn ? 0.55 : 1,
                  background: state === 'done' ? 'rgba(34,197,94,0.1)' : 'rgba(139,92,246,0.06)',
                  border: `1px solid ${state === 'done' ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.14)'}`,
                }}
                onMouseEnter={(e) => { if (interactive) { e.currentTarget.style.background = 'rgba(34,211,238,0.14)'; e.currentTarget.style.borderColor = 'rgba(34,211,238,0.45)' } }}
                onMouseLeave={(e) => { if (interactive) { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.14)' } }}
              >
                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #6d28d9, #1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden',
                }}>
                  {u.avatar_url
                    ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (name || '?')[0].toUpperCase()
                  }
                </div>
                {/* Name */}
                <div style={{ flex: 1, minWidth: 0, color: '#e6ddff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </div>
                {/* Action */}
                <div style={{ flexShrink: 0 }}>
                  {state === 'in_call' && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: '#4ade80',
                      background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                      borderRadius: 5, padding: '3px 9px', letterSpacing: 0.5, textTransform: 'uppercase',
                    }}>
                      In call
                    </span>
                  )}
                  {state === 'loading' && (
                    <span style={{ color: '#a78bfa', fontSize: 11 }}>…</span>
                  )}
                  {state === 'done' && (
                    <span style={{ color: '#22c55e', fontSize: 13 }}>✓ Invited</span>
                  )}
                  {!state && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#fff',
                      background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                      border: '1px solid rgba(56,189,248,0.5)',
                      borderRadius: 5, padding: '3px 12px', letterSpacing: 0.5,
                      boxShadow: '0 2px 8px rgba(6,182,212,0.3)',
                    }}>
                      Invite
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CALL_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙌']

function WaitingRoomPanel({ callId, onClose }) {
  const [waiting, setWaiting] = useState([])

  useEffect(() => {
    getWaitingRoom(callId).then(setWaiting).catch(() => {})
    const interval = setInterval(() => {
      getWaitingRoom(callId).then(setWaiting).catch(() => {})
    }, 4000)
    return () => clearInterval(interval)
  }, [callId])

  const handleAdmit = async (userId) => {
    try {
      await admitParticipant(callId, userId)
      setWaiting((prev) => prev.filter((p) => p.user_id !== userId))
      toast.success('Participant admitted')
    } catch {
      toast.error('Failed to admit')
    }
  }

  const handleReject = async (userId) => {
    try {
      await rejectWaiting(callId, userId)
      setWaiting((prev) => prev.filter((p) => p.user_id !== userId))
    } catch {
      toast.error('Failed to reject')
    }
  }

  return (
    <div style={{
      position: 'absolute', top: 60, right: 12, zIndex: 30,
      width: 280, maxHeight: 360,
      background: 'linear-gradient(145deg, #13082a, #0d1525)',
      border: '1px solid rgba(251,191,36,0.4)',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid rgba(251,191,36,0.2)',
      }}>
        <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>
          Waiting Room {waiting.length > 0 && `(${waiting.length})`}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7c6fa0', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {waiting.length === 0 ? (
          <div style={{ color: '#7c6fa0', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No one waiting</div>
        ) : waiting.map((p) => (
          <div key={p.user_id || p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px', borderRadius: 8, marginBottom: 4,
            background: 'rgba(251,191,36,0.05)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #92400e, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden',
            }}>
              {p.user?.avatar_url
                ? <img src={p.user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (p.user?.full_name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, color: '#d4c8ff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.user?.full_name || p.user?.email || 'Unknown'}
            </div>
            <button
              onClick={() => handleAdmit(p.user_id || p.user?.id)}
              style={{
                background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
              }}
            >Admit</button>
            <button
              onClick={() => handleReject(p.user_id || p.user?.id)}
              style={{
                background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
              }}
            >Deny</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Small round media-toggle button used in both the full and mini control bars.
function MediaButton({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.22)',
        color: active ? '#e5e7eb' : '#f87171',
        transition: 'background 0.2s',
      }}
    >
      {children}
    </button>
  )
}

function MiniControlBar({ micEnabled, cameraEnabled, onToggleMic, onToggleCamera }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '5px 0' }}>
      <MediaButton active={micEnabled} onClick={onToggleMic} title={micEnabled ? 'Mute' : 'Unmute'}>
        {micEnabled ? <MicrophoneIcon style={{ width: 16, height: 16 }} /> : <MutedMicIcon size={16} />}
      </MediaButton>
      <MediaButton active={cameraEnabled} onClick={onToggleCamera} title={cameraEnabled ? 'Stop camera' : 'Start camera'}>
        {cameraEnabled ? <VideoCameraIcon style={{ width: 16, height: 16 }} /> : <VideoCameraSlashIcon style={{ width: 16, height: 16 }} />}
      </MediaButton>
    </div>
  )
}

function RoomContent({
  activeCall, call, onEnd, minimized, onToggleMinimize, onDragStart, isGroup, onInvite, isHost,
}) {
  const isVideo = activeCall.type === 'video'
  const connected = call.status === 'connected'
  const isReconnecting = call.status === 'reconnecting'
  const connecting = call.status === 'connecting'

  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState({}) // participantId -> { raised, name }
  const [floatingReactions, setFloatingReactions] = useState([]) // [{id, emoji, x}]
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showWaitingRoom, setShowWaitingRoom] = useState(false)

  // Incoming raise-hand / reaction signals from other participants.
  useEffect(() => {
    call.registerSignalHandler((fromId, fromName, data) => {
      try {
        if (data?.type === 'raise_hand') {
          if (fromId === call.localId) return
          const name = fromName || fromId
          setRaisedHands((prev) => ({ ...prev, [fromId]: { raised: data.raised, name } }))
          if (data.raised) toast(`${name} raised their hand ✋`, { duration: 3000 })
        } else if (data?.type === 'reaction') {
          const id = Math.random().toString(36).slice(2)
          const x = 20 + Math.random() * 60
          setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, x }])
          setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500)
        }
      } catch (e) {
        console.error('signal handler error:', e)
      }
    })
  }, [call])

  const toggleRaiseHand = useCallback(() => {
    const next = !handRaised
    setHandRaised(next)
    call.sendSignal({ type: 'raise_hand', raised: next })
  }, [handRaised, call])

  const sendReaction = useCallback((emoji) => {
    call.sendSignal({ type: 'reaction', emoji })
    const id = Math.random().toString(36).slice(2)
    const x = 20 + Math.random() * 60
    setFloatingReactions((prev) => [...prev, { id, emoji, x }])
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500)
    setShowReactionPicker(false)
  }, [call])

  const grid = (
    <TileGrid
      tiles={call.tiles}
      speakingId={call.speakingId}
      raisedHands={raisedHands}
      localHandRaised={handRaised}
      localId={call.localId}
    />
  )

  // Floating reaction emojis overlay. Rendered in BOTH the fullscreen and
  // minimized views (the PiP previously omitted it, so reactions sent by other
  // participants silently vanished for anyone who had the call minimized).
  const renderFloatingReactions = (fontSize = 32, bottom = 80) => (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' }}>
      {floatingReactions.map((r) => (
        <div key={r.id} style={{
          position: 'absolute', bottom, left: `${r.x}%`,
          fontSize, animation: 'floatUp 2.5s ease-out forwards',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
        }}>{r.emoji}</div>
      ))}
    </div>
  )

  // Hidden audio sinks for every remote participant.
  const audioSinks = call.tiles
    .filter((t) => !t.isLocal && t.audioStream)
    .map((t) => <RemoteAudio key={`a-${t.id}`} stream={t.audioStream} />)

  if (minimized) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <style>{ANIMATIONS}</style>
        {/* Mini header */}
        <div
          style={{
            height: 36, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
            background: 'rgba(15,10,30,0.95)', cursor: 'grab',
            userSelect: 'none',
          }}
          onMouseDown={onDragStart}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            backgroundColor: connected ? '#22c55e' : '#f59e0b',
            animation: connected ? 'pulse 2s ease-in-out infinite' : 'pulseAmber 2s ease-in-out infinite',
          }} />
          <span style={{ color: '#c4b5fd', fontSize: 10, fontWeight: 700, flex: 1, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {isVideo ? 'Video Call' : 'Audio Call'}
          </span>
          {/* Expand icon */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onToggleMinimize}
            title="Expand"
            style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: '2px 3px', fontSize: 12, lineHeight: 1 }}
          >
            ⤢
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onInvite}
            title="Add participant"
            style={{
              background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)',
              color: '#a78bfa', borderRadius: 5, padding: '2px 5px', cursor: 'pointer',
              fontSize: 13, fontWeight: 800, lineHeight: 1,
            }}
          >
            +
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onEnd}
            style={{
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)',
              color: '#fca5a5', borderRadius: 5, padding: '2px 7px', cursor: 'pointer',
              fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
            }}
          >
            {isGroup ? 'Leave' : 'End'}
          </button>
        </div>
        {/* Mini tile grid */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, #0d0618 0%, #0a0f1e 100%)',
          }} />
          <div style={{ position: 'relative', height: '100%' }}>
            {grid}
          </div>
          {renderFloatingReactions(22, 24)}
        </div>
        {/* Mini controls */}
        <div style={{
          flexShrink: 0, background: 'rgba(10,6,22,0.95)',
          borderTop: '1px solid rgba(139,92,246,0.25)',
        }}>
          <MiniControlBar
            micEnabled={call.micEnabled}
            cameraEnabled={call.cameraEnabled}
            onToggleMic={call.toggleMic}
            onToggleCamera={call.toggleCamera}
          />
        </div>
        {audioSinks}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <style>{ANIMATIONS}</style>

      {/* Scanline sweep */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.15), rgba(56,189,248,0.2), rgba(139,92,246,0.15), transparent)',
          animation: 'scanline 6s linear infinite', opacity: 0.6,
        }} />
      </div>

      {/* Header */}
      <div style={{
        height: 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
        background: 'rgba(15,10,30,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(139,92,246,0.3)',
        zIndex: 2, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, #8b5cf6, #38bdf8, #8b5cf6, transparent)',
          backgroundSize: '200% 100%', animation: 'headerLine 3s ease infinite',
        }} />
        <span style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          backgroundColor: connected ? '#22c55e' : '#f59e0b',
          animation: connected ? 'pulse 2s ease-in-out infinite' : 'pulseAmber 2s ease-in-out infinite',
        }} />
        <span style={{
          color: '#e0d7ff', fontSize: 13, fontWeight: 700, flex: 1,
          letterSpacing: 0.8, textTransform: 'uppercase',
          animation: 'titleGlow 3s ease-in-out infinite',
        }}>
          {isVideo ? 'Video Call' : 'Audio Call'}
          {(connecting || isReconnecting) && (
            <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 400, textTransform: 'none', fontSize: 11 }}>
              {' '}· {isReconnecting ? 'Reconnecting…' : 'Connecting…'}
            </span>
          )}
        </span>
        {/* Add participant button */}
        <button
          onClick={onInvite}
          title="Add participant"
          style={{
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa', borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
            fontSize: 16, fontWeight: 700, marginRight: 6, lineHeight: 1, transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.12)'}
        >
          +
        </button>
        {/* Minimize button */}
        <button
          onClick={onToggleMinimize}
          title="Minimize"
          style={{
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, marginRight: 6, transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.12)'}
        >
          —
        </button>
        <button
          onClick={onEnd}
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(190,18,60,0.22))',
            border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5',
            borderRadius: 8, padding: '5px 16px', cursor: 'pointer',
            fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
            animation: 'endBtnPulse 2.5s ease-in-out infinite',
            transition: 'background 0.2s, transform 0.1s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.38), rgba(190,18,60,0.42))'
            e.currentTarget.style.transform = 'scale(1.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(190,18,60,0.22))'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          {isGroup ? 'Leave Call' : 'End Call'}
        </button>
      </div>

      {/* Participant tiles */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #0d0618 0%, #0a0f1e 40%, #080d1a 70%, #0d0618 100%)',
          backgroundSize: '400% 400%', animation: 'gradientShift 8s ease infinite', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 20% 30%, rgba(139,92,246,0.1) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(56,189,248,0.08) 0%, transparent 60%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
          {grid}
        </div>
      </div>

      {/* Floating reactions */}
      {renderFloatingReactions()}

      {/* Waiting room panel */}
      {showWaitingRoom && isHost && (
        <WaitingRoomPanel callId={activeCall.call_id} onClose={() => setShowWaitingRoom(false)} />
      )}

      {/* Controls */}
      <div style={{
        flexShrink: 0, background: 'rgba(10,6,22,0.6)',
        backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        position: 'relative', zIndex: 30,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, #8b5cf6, #38bdf8, #8b5cf6, transparent)',
          backgroundSize: '200% 100%', animation: 'headerLine 3s ease infinite',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 0' }}>
          {/* Mic */}
          <button
            onClick={call.toggleMic}
            title={call.micEnabled ? 'Mute' : 'Unmute'}
            style={ctrlBtn(call.micEnabled ? 'idle' : 'danger')}
          >{call.micEnabled ? <MicrophoneIcon style={ICON_SIZE} /> : <MutedMicIcon />}</button>
          {/* Camera — available in audio calls too; the SFU keeps a spare video
              sender so a late camera publishes without renegotiation. */}
          <button
            onClick={call.toggleCamera}
            title={call.cameraEnabled ? 'Stop camera' : 'Start camera'}
            style={ctrlBtn(call.cameraEnabled ? 'idle' : 'danger')}
          >{call.cameraEnabled ? <VideoCameraIcon style={ICON_SIZE} /> : <VideoCameraSlashIcon style={ICON_SIZE} />}</button>
          {/* Screen share */}
          <button
            onClick={call.toggleScreenShare}
            title={call.screenSharing ? 'Stop sharing' : 'Share screen'}
            style={ctrlBtn(call.screenSharing ? 'active' : 'idle')}
          ><ComputerDesktopIcon style={ICON_SIZE} /></button>
          {/* Raise hand */}
          <button
            onClick={toggleRaiseHand}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
            style={{
              ...ctrlBtn(handRaised ? 'active' : 'idle'),
              animation: handRaised ? 'raiseHandPulse 1.5s ease-in-out infinite' : 'none',
            }}
          ><HandRaisedIcon style={ICON_SIZE} /></button>
          {/* Reaction picker */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowReactionPicker((v) => !v)}
              title="Send reaction"
              style={ctrlBtn(showReactionPicker ? 'active' : 'idle')}
            ><FaceSmileIcon style={ICON_SIZE} /></button>
            {showReactionPicker && (
              <div style={{
                position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                background: 'linear-gradient(145deg, #13082a, #0d1525)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: 10, padding: '8px 10px',
                display: 'flex', gap: 6, zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
              }}>
                {CALL_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 22, lineHeight: 1, transition: 'transform 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.3)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  >{emoji}</button>
                ))}
              </div>
            )}
          </div>
          {/* Waiting room button (host only) */}
          {isHost && isGroup && (
            <button
              onClick={() => setShowWaitingRoom((v) => !v)}
              title="Waiting room"
              style={ctrlBtn(showWaitingRoom ? 'active' : 'idle')}
            ><UserGroupIcon style={ICON_SIZE} /></button>
          )}
        </div>
      </div>

      {audioSinks}
    </div>
  )
}

// Control-bar styling follows the convention of pro call apps: every button is
// neutral at rest so the bar reads as one calm toolbar, and color is reserved
// for meaning — red for an "off" media control, a single violet accent for an
// engaged toggle. The frosted-glass base (translucent fill + backdrop blur, a
// light top highlight, and a soft drop shadow) gives them depth; ctrlBtn() picks
// the right tint from a button's state.
const CTRL_BTN_BASE = {
  borderRadius: 12, padding: '9px 13px', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.18s',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(0,0,0,0.35)',
}

const CTRL_BTN_STATES = {
  idle:   { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.22)', color: '#f1f5f9' },
  danger: { background: 'rgba(239,68,68,0.22)',   border: '1px solid rgba(248,113,113,0.5)',  color: '#fecaca' },
  active: { background: 'rgba(139,92,246,0.28)',  border: '1px solid rgba(167,139,250,0.6)',  color: '#ede9fe' },
}

// state: 'idle' | 'danger' | 'active'
function ctrlBtn(state = 'idle') {
  return { ...CTRL_BTN_BASE, ...CTRL_BTN_STATES[state] }
}

const ICON_SIZE = { width: 20, height: 20 }

// Muted-mic glyph: heroicons has no microphone-slash, so overlay a slash.
function MutedMicIcon({ size = 20 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <MicrophoneIcon style={{ width: size, height: size }} />
      <span style={{
        position: 'absolute', top: '50%', left: -2, right: -2, height: 2,
        background: 'currentColor', borderRadius: 2,
        transform: 'rotate(-45deg)', transformOrigin: 'center',
      }} />
    </span>
  )
}

const PIP_W = 228
const PIP_H = 190
const CONNECT_TIMEOUT_MS = 20000

export default function GroupCallRoom({ activeCall, onEnd, localUser }) {
  const [minimized, setMinimized] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [pipPos, setPipPos] = useState(null)
  const isHost = activeCall?.initiated_by === localUser?.id
  const pipRef = useRef(null)
  const dragOffset = useRef(null)
  const connectTimeoutRef = useRef(null)

  const handleConnected = useCallback(() => {
    clearTimeout(connectTimeoutRef.current)
    setConnectionError(null)
  }, [])

  const handleError = useCallback((msg) => {
    clearTimeout(connectTimeoutRef.current)
    setConnectionError(msg || 'Failed to connect to the call server')
  }, [])

  const handleDisconnected = useCallback(() => {
    toast.error('Call disconnected')
    onEnd()
  }, [onEnd])

  const call = useSfuCall({
    room: activeCall?.room,
    isVideo: activeCall?.type === 'video',
    localUser,
    onConnected: handleConnected,
    onError: handleError,
    onEnd: handleDisconnected,
  })

  // Connection watchdog — surface a friendly error if we never connect.
  useEffect(() => {
    if (call.status === 'connecting' && !connectionError) {
      connectTimeoutRef.current = setTimeout(() => {
        setConnectionError('Connection timed out. Check your network and that the call server (SFU) is reachable.')
      }, CONNECT_TIMEOUT_MS)
    } else {
      clearTimeout(connectTimeoutRef.current)
    }
    return () => clearTimeout(connectTimeoutRef.current)
  }, [call.status, connectionError])

  const handleMouseMove = useCallback((e) => {
    if (!dragOffset.current) return
    const newLeft = e.clientX - dragOffset.current.x
    const newTop  = e.clientY - dragOffset.current.y
    setPipPos({
      left: Math.max(0, Math.min(newLeft, window.innerWidth - PIP_W)),
      top:  Math.max(0, Math.min(newTop,  window.innerHeight - PIP_H)),
      right: undefined,
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    dragOffset.current = null
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const handleDragStart = useCallback((e) => {
    const rect = pipRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    document.body.style.userSelect = 'none'
  }, [])

  const handleToggleMinimize = useCallback(() => {
    setMinimized(v => {
      if (v) setPipPos(null) // reset position when restoring to fullscreen
      return !v
    })
  }, [])

  if (!activeCall) return null

  const isGroup = activeCall.conversation_type === 'group'

  if (connectionError) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10,6,22,0.96)', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 48 }}>📵</div>
        <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 16, textAlign: 'center' }}>
          Call connection failed
        </p>
        <p style={{ color: '#7c6fa0', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          {connectionError}
        </p>
        <button
          onClick={onEnd}
          style={{
            background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)',
            color: '#fca5a5', borderRadius: 8, padding: '8px 24px',
            cursor: 'pointer', fontSize: 13, fontWeight: 700, marginTop: 8,
          }}
        >Close</button>
      </div>
    )
  }

  const containerStyle = minimized
    ? {
        position: 'fixed',
        ...(pipPos ? { left: pipPos.left, top: pipPos.top } : { bottom: 0, left: 325 }),
        zIndex: 50,
        width: PIP_W, height: PIP_H,
        borderRadius: '12px 12px 0 0', overflow: 'hidden',
        background: '#0a0614',
        border: '1px solid rgba(139,92,246,0.45)',
        borderBottom: 'none',
        boxShadow: '0 -4px 24px rgba(139,92,246,0.2), 0 4px 16px rgba(0,0,0,0.7)',
      }
    : {
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
        background: '#0a0614',
      }

  return (
    <div ref={pipRef} style={containerStyle} className={minimized ? 'cn-pip' : undefined}>
      <RoomContent
        activeCall={activeCall}
        call={call}
        onEnd={onEnd}
        minimized={minimized}
        onToggleMinimize={handleToggleMinimize}
        onDragStart={handleDragStart}
        isGroup={isGroup}
        onInvite={() => setShowInvite(true)}
        isHost={isHost}
      />
      {showInvite && (
        <AddParticipantModal
          callId={activeCall.call_id}
          localUserId={localUser?.id}
          inCallIds={call.tiles.map((t) => t.id)}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  )
}
