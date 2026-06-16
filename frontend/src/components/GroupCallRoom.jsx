import { useState, useRef, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { listUsers } from '../api/users'
import { inviteToCall, getWaitingRoom, admitParticipant, rejectWaiting } from '../api/calls'
import { useSfuCall } from '../hooks/useSfuCall'
import {
  MicrophoneIcon, VideoCameraIcon, VideoCameraSlashIcon,
  ComputerDesktopIcon, HandRaisedIcon, FaceSmileIcon, UserGroupIcon,
} from '@heroicons/react/24/solid'

// ── Join / leave audio chimes (Web Audio API, no asset files needed) ──────────
let _chimeCtx = null
function getChimeCtx() {
  if (!_chimeCtx) {
    try { _chimeCtx = new (window.AudioContext || window.webkitAudioContext)() } catch { /* */ }
  }
  return _chimeCtx
}
function playTone(freq1, freq2, duration, volume) {
  const ctx = getChimeCtx()
  if (!ctx) return
  ctx.resume().catch(() => {})
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.setValueAtTime(freq1, ctx.currentTime)
  osc.frequency.linearRampToValueAtTime(freq2, ctx.currentTime + duration * 0.5)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}
const playJoinSound  = () => playTone(880, 1100, 0.32, 0.09)
const playLeaveSound = () => playTone(660, 440, 0.32, 0.07)

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

// Deterministic per-participant color derived from their ID — used for speaking
// borders and name labels so each person has a unique visual identity.
const TILE_COLORS = [
  '#38bdf8','#a78bfa','#34d399','#fb923c','#f472b6',
  '#facc15','#60a5fa','#4ade80','#c084fc','#f87171',
]
function tileColor(id) {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i)
  return TILE_COLORS[Math.abs(h) % TILE_COLORS.length]
}

function avatarContent(tile) {
  if (tile.avatarUrl) {
    return <img src={tile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return (tile.name || '?')[0].toUpperCase()
}

// Renders one participant tile: live video when present, otherwise an avatar
// placeholder. Binds the native MediaStream to the <video> element.
function VideoTile({ tile, isSpeaking, raised, micMuted, onPin, fillHeight, getAudioLevel, hostId, localFilter, localBgColor }) {
  const videoRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = tile.videoStream || null
    return () => { if (el) el.srcObject = null }
  }, [tile.videoStream])

  const showVideo = tile.videoStream && !tile.videoMuted
  const color = tileColor(tile.id)
  return (
    <div
      className="cn-tile"
      data-speaking={isSpeaking ? 'true' : 'false'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...(fillHeight ? { height: '100%' } : {}),
        ...(isSpeaking ? {
          animation: 'none',
          boxShadow: `0 0 0 2px ${color}cc, 0 0 0 6px ${color}38, 0 0 28px ${color}60`,
        } : {}),
      }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.isLocal}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: tile.isLocal && !tile.isDesktop ? 'scaleX(-1)' : 'none',
            filter: tile.isLocal && localFilter ? localFilter : undefined,
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tile.isLocal && localBgColor ? localBgColor : undefined,
        }}>
          <div className="cn-avatar">{avatarContent(tile)}</div>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 8, left: 10, zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        maxWidth: 'calc(100% - 20px)', pointerEvents: 'none',
      }}>
        {tile.id === hostId && (
          <span style={{
            background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.5)',
            borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 800,
            color: '#fbbf24', letterSpacing: 0.8, textTransform: 'uppercase',
          }}>HOST</span>
        )}
        <div className="cn-tile-name" style={{ position: 'static', borderColor: `${color}70` }}>
          {tile.name || 'Participant'}{tile.isLocal ? ' (You)' : ''}
        </div>
      </div>
      {raised && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          pointerEvents: 'none', color: '#fbbf24',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))',
          animation: 'raiseHandPulse 1.5s ease-in-out infinite',
        }}><HandRaisedIcon style={{ width: 22, height: 22 }} /></div>
      )}
      {micMuted && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 10,
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.55)', borderRadius: '50%',
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#f87171',
        }}>
          <MutedMicIcon size={14} />
        </div>
      )}
      {hovered && onPin && (
        <button
          onClick={e => { e.stopPropagation(); onPin(tile.id) }}
          style={{
            position: 'absolute', top: raised ? 38 : 8, right: 8, zIndex: 12,
            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
            color: '#e2e8f0', fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
          }}
        >
          Pin
        </button>
      )}
      {getAudioLevel && <AudioLevelBars tileId={tile.id} getAudioLevel={getAudioLevel} />}
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

// Full-size screen share video rendered with contain so no content is clipped.
function ScreenShareView({ tile }) {
  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = tile.videoStream || null
    return () => { if (el) el.srcObject = null }
  }, [tile.videoStream])
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={tile.isLocal}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
    />
  )
}

// Compact tile for the sidebar shown during screen sharing.
function SidebarTile({ tile, isSpeaking, raised, getAudioLevel, hostId, style: styleProp }) {
  const videoRef = useRef(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = tile.videoStream || null
    return () => { if (el) el.srcObject = null }
  }, [tile.videoStream])
  const showVideo = tile.videoStream && !tile.videoMuted
  const color = tileColor(tile.id)
  return (
    <div
      className="cn-tile"
      data-speaking={isSpeaking ? 'true' : 'false'}
      style={{
        height: 110, flexShrink: 0, borderRadius: 10,
        ...styleProp,
        ...(isSpeaking ? {
          animation: 'none',
          boxShadow: `0 0 0 2px ${color}cc, 0 0 12px ${color}60`,
        } : {}),
      }}
    >
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
          <div className="cn-avatar" style={{ width: 38, height: 38, fontSize: 15 }}>{avatarContent(tile)}</div>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 4, left: 6, zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
        maxWidth: 'calc(100% - 12px)', pointerEvents: 'none',
      }}>
        {tile.id === hostId && (
          <span style={{ fontSize: 8, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.5, textTransform: 'uppercase' }}>HOST</span>
        )}
        <div className="cn-tile-name" style={{ position: 'static', fontSize: 10, borderColor: `${color}70` }}>
          {tile.name || 'Participant'}{tile.isLocal ? ' (You)' : ''}
        </div>
      </div>
      {raised && (
        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 10, color: '#fbbf24' }}>
          <HandRaisedIcon style={{ width: 14, height: 14 }} />
        </div>
      )}
      {getAudioLevel && <AudioLevelBars tileId={tile.id} getAudioLevel={getAudioLevel} small />}
    </div>
  )
}

const MAX_MOSAIC = 9

function TileGrid({ tiles, speakingId, raisedHands, localHandRaised, localId, onPin, getAudioLevel, hostId, localFilter, localBgColor }) {
  const visibleTiles = tiles.slice(0, MAX_MOSAIC)
  const overflowTiles = tiles.slice(MAX_MOSAIC)
  const cols = gridColumns(visibleTiles.length)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: '1fr', gap: 6,
        padding: overflowTiles.length ? '6px 6px 3px' : 6,
        boxSizing: 'border-box',
      }}>
        {visibleTiles.map((tile) => {
          const raised = tile.id === localId ? localHandRaised : !!raisedHands[tile.id]?.raised
          return (
            <VideoTile
              key={tile.id}
              tile={tile}
              isSpeaking={tile.id === speakingId}
              raised={raised}
              micMuted={tile.micMuted}
              onPin={onPin}
              getAudioLevel={getAudioLevel}
              hostId={hostId}
              localFilter={localFilter}
              localBgColor={localBgColor}
            />
          )
        })}
      </div>
      {overflowTiles.length > 0 && (
        <div style={{
          flexShrink: 0, display: 'flex', gap: 4, padding: '0 6px 6px',
          overflowX: 'auto', alignItems: 'flex-end',
        }}>
          <span style={{
            flexShrink: 0, color: '#475569', fontSize: 9, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 4, paddingRight: 2,
          }}>
            +{overflowTiles.length} more
          </span>
          {overflowTiles.map((tile) => {
            const raised = tile.id === localId ? localHandRaised : !!raisedHands[tile.id]?.raised
            return (
              <div
                key={tile.id}
                onClick={() => onPin?.(tile.id)}
                style={{ flexShrink: 0, cursor: 'pointer' }}
                title={`${tile.name || 'Participant'} — click to spotlight`}
              >
                <SidebarTile
                  tile={tile}
                  isSpeaking={tile.id === speakingId}
                  raised={raised}
                  getAudioLevel={getAudioLevel}
                  hostId={hostId}
                  style={{ height: 62, width: 90, borderRadius: 8 }}
                />
              </div>
            )
          })}
        </div>
      )}
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

const SHORTCUTS = [
  { key: 'Space', desc: 'Mute / Unmute' },
  { key: 'V', desc: 'Toggle camera' },
  { key: 'S', desc: 'Share / stop screen' },
  { key: 'H', desc: 'Raise / lower hand' },
  { key: 'L', desc: 'Toggle layout (Grid / Spotlight)' },
  { key: 'P', desc: 'Participants panel' },
  { key: 'C', desc: 'Toggle chat' },
  { key: 'N', desc: 'Toggle call notes' },
  { key: 'I', desc: 'Picture-in-Picture' },
  { key: 'T', desc: 'Toggle live captions' },
  { key: 'Q', desc: 'Raise-hand queue' },
  { key: 'F', desc: 'Fullscreen' },
  { key: 'Esc', desc: 'Unpin tile / close panels' },
  { key: '?', desc: 'Show this reference' },
]

function ShortcutCard({ onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 210,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #0f172a, #0c1220)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: '24px 28px',
          width: 320,
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 700 }}>Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <kbd style={{
                background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 5, padding: '2px 8px', minWidth: 56, textAlign: 'center',
                color: '#c4b5fd', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                fontFamily: 'monospace', flexShrink: 0,
              }}>{key}</kbd>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DeviceSelector({ onReplaceAudio, onReplaceVideo, onClose }) {
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [selAudio, setSelAudio] = useState('')
  const [selVideo, setSelVideo] = useState('')

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'))
    }).catch(() => {})
  }, [])

  const selectStyle = {
    width: '100%', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
    padding: '6px 8px', color: '#e2e8f0', fontSize: 12, outline: 'none', cursor: 'pointer',
  }
  const labelStyle = {
    color: '#64748b', fontSize: 10, fontWeight: 700,
    letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 5,
  }

  return (
    <div
      style={{
        position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
        background: 'linear-gradient(145deg, #0f172a, #0c1220)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 16, width: 268, zIndex: 60,
        boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Microphone</label>
        <select value={selAudio} onChange={e => setSelAudio(e.target.value)} style={selectStyle}>
          <option value="">Current device</option>
          {audioDevices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic (${d.deviceId.slice(0, 6)})`}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Camera</label>
        <select value={selVideo} onChange={e => setSelVideo(e.target.value)} style={selectStyle}>
          <option value="">Current device</option>
          {videoDevices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera (${d.deviceId.slice(0, 6)})`}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            if (selAudio) onReplaceAudio(selAudio)
            if (selVideo) onReplaceVideo(selVideo)
            onClose()
          }}
          style={{
            flex: 1, background: 'rgba(139,92,246,0.18)',
            border: '1px solid rgba(139,92,246,0.4)', color: '#c4b5fd',
            borderRadius: 7, padding: '7px 0', cursor: 'pointer', fontSize: 12, fontWeight: 700,
          }}
        >
          Apply
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#64748b',
            borderRadius: 7, padding: '7px 0', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function EndCallModal({ isHost, isGroup, onLeave, onEndAll, onCancel }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'linear-gradient(160deg, #12111e 0%, #0c1018 100%)',
          border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: 14, padding: '22px 24px',
          width: 268, display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 700, marginBottom: 5, letterSpacing: 0.1 }}>
            {isHost && isGroup ? 'Leave or end this call?' : 'Leave this call?'}
          </div>
          <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>
            {isHost && isGroup
              ? 'Leave and let others continue, or end the call for everyone.'
              : 'You will be disconnected from the call.'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {isHost && isGroup && (
            <button
              onClick={onEndAll}
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                border: 'none', borderRadius: 8, color: '#fff',
                padding: '9px 0', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, width: '100%',
                letterSpacing: 0.2,
              }}
            >
              End Call for Everyone
            </button>
          )}
          <button
            onClick={onLeave}
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 8, color: '#fca5a5',
              padding: '9px 0', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, width: '100%',
              letterSpacing: 0.2,
            }}
          >
            {isHost && isGroup ? 'Leave Call' : 'Leave'}
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: '#64748b',
              padding: '9px 0', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, width: '100%',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function PinnedLayout({ tiles, pinnedId, speakingId, raisedHands, localHandRaised, localId, onPin, onUnpin, unpinLabel = 'Unpin', getAudioLevel, hostId, localFilter, localBgColor }) {
  const pinnedTile = tiles.find(t => t.id === pinnedId)
  const otherTiles = tiles.filter(t => t.id !== pinnedId)
  if (!pinnedTile) return null
  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* Main pinned tile */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', padding: 6, paddingRight: otherTiles.length ? 3 : 6 }}>
        <VideoTile
          tile={pinnedTile}
          isSpeaking={pinnedTile.id === speakingId}
          raised={pinnedTile.id === localId ? localHandRaised : !!raisedHands[pinnedTile.id]?.raised}
          micMuted={pinnedTile.micMuted}
          onPin={onPin}
          fillHeight
          getAudioLevel={getAudioLevel}
          hostId={hostId}
          localFilter={localFilter}
          localBgColor={localBgColor}
        />
        <button
          onClick={onUnpin}
          style={{
            position: 'absolute', top: 14, right: otherTiles.length ? 9 : 14, zIndex: 20,
            background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            color: '#e2e8f0', fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
          }}
        >
          {unpinLabel}
        </button>
      </div>
      {/* Sidebar strip */}
      {otherTiles.length > 0 && (
        <div style={{
          width: 156, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: 6, overflowY: 'auto',
          background: 'rgba(10,6,22,0.8)',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}>
          {otherTiles.map((tile) => {
            const raised = tile.id === localId ? localHandRaised : !!raisedHands[tile.id]?.raised
            return (
              <div key={tile.id} onClick={() => onPin(tile.id)} style={{ cursor: 'pointer', flexShrink: 0 }} title="Click to spotlight">
                <SidebarTile tile={tile} isSpeaking={tile.id === speakingId} raised={raised} getAudioLevel={getAudioLevel} hostId={hostId} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SignalBars({ quality }) {
  const COLORS = {
    good: ['#22c55e', '#22c55e', '#22c55e'],
    fair: ['#f59e0b', '#f59e0b', '#334155'],
    poor: ['#ef4444', '#334155', '#334155'],
  }
  const c = COLORS[quality] || COLORS.good
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" style={{ display: 'block', flexShrink: 0 }} title={`Network: ${quality}`}>
      <rect x="0" y="7" width="3.5" height="5" rx="0.8" fill={c[0]} />
      <rect x="5" y="3.5" width="3.5" height="8.5" rx="0.8" fill={c[1]} />
      <rect x="10" y="0" width="3.5" height="12" rx="0.8" fill={c[2]} />
    </svg>
  )
}

function ParticipantPanel({ tiles, onClose }) {
  return (
    <div style={{
      width: 244, flexShrink: 0,
      background: 'rgba(9,13,24,0.94)', backdropFilter: 'blur(18px)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>
          Participants <span style={{ color: '#475569', fontWeight: 500 }}>({tiles.length})</span>
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px' }}
        >×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tiles.map((tile) => (
          <div key={tile.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6d28d9, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden',
            }}>
              {tile.avatarUrl
                ? <img src={tile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (tile.name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, color: '#cbd5e1', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tile.name || 'Participant'}{tile.isLocal ? ' (You)' : ''}
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {tile.micMuted && (
                <span title="Muted" style={{ color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                  <MutedMicIcon size={13} />
                </span>
              )}
              {tile.videoMuted && (
                <span title="Camera off" style={{ color: '#475569', display: 'flex', alignItems: 'center' }}>
                  <VideoCameraSlashIcon style={{ width: 13, height: 13 }} />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CallTimer({ connected }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(null)
  useEffect(() => {
    if (connected) {
      if (!startRef.current) startRef.current = Date.now()
      const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
      return () => clearInterval(id)
    } else {
      startRef.current = null
      setElapsed(0)
    }
  }, [connected])
  if (!connected) return null
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return (
    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums' }}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

function RecBadge({ start }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [start])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)',
      borderRadius: 7, padding: '4px 10px',
      color: '#fca5a5', fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
        animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block',
      }} />
      REC {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  )
}

function HandQueuePanel({ raisedHands, localId, localHandRaised, localHandRaisedAt, tiles, isHost, onCallOn, onLowerOwn, onClose }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const entries = []
  if (localHandRaised) {
    const tile = tiles.find(t => t.isLocal)
    entries.push({ id: localId, name: tile?.name || 'You', raisedAt: localHandRaisedAt || Date.now(), isLocal: true })
  }
  Object.entries(raisedHands).forEach(([id, info]) => {
    if (info.raised) entries.push({ id, name: info.name || 'Participant', raisedAt: info.raisedAt || 0, isLocal: false })
  })
  entries.sort((a, b) => a.raisedAt - b.raisedAt)

  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 10) return 'just now'
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  return (
    <div style={{
      position: 'absolute', top: 60, left: 12, zIndex: 30,
      width: 272, maxHeight: 340,
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
          Raised Hands {entries.length > 0 && `(${entries.length})`}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7c6fa0', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {entries.length === 0 ? (
          <div style={{ color: '#7c6fa0', fontSize: 12, textAlign: 'center', padding: '22px 0' }}>No hands raised</div>
        ) : entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 6px', borderRadius: 8, marginBottom: 2,
            background: i === 0 ? 'rgba(251,191,36,0.07)' : 'transparent',
            borderLeft: i === 0 ? '2px solid rgba(251,191,36,0.45)' : '2px solid transparent',
            paddingLeft: 8,
          }}>
            <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>#{i + 1}</span>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6d28d9, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
            }}>{(entry.name || '?')[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#d4c8ff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.name}{entry.isLocal ? ' (You)' : ''}
              </div>
              <div style={{ color: '#64748b', fontSize: 10 }}>{timeAgo(entry.raisedAt)}</div>
            </div>
            {entry.isLocal ? (
              <button
                onClick={onLowerOwn}
                style={{
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#fca5a5', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}
              >Lower</button>
            ) : isHost ? (
              <button
                onClick={() => onCallOn(entry.id)}
                style={{
                  background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
                  color: '#fbbf24', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}
              >Call On</button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatPanel({ messages, onSendMessage, onClose, pinnedMsg, onPin, isHost }) {
  const [text, setText] = useState('')
  const [hoveredMsgId, setHoveredMsgId] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setText('')
  }

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: 'rgba(9,13,24,0.94)', backdropFilter: 'blur(18px)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>In-Call Chat</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
      </div>

      {/* Pinned message banner */}
      {pinnedMsg && (
        <div style={{
          margin: '8px 12px 0', borderRadius: 8, padding: '7px 10px',
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
          display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: '#fbbf24', flexShrink: 0 }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fbbf24', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
              {pinnedMsg.fromName}
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pinnedMsg.text}
            </div>
          </div>
          {isHost && (
            <button
              onClick={() => onPin(null)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
              title="Unpin"
            >×</button>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: '28px 0' }}>
            No messages yet
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isLocal ? 'flex-end' : 'flex-start', position: 'relative' }}
            onMouseEnter={() => setHoveredMsgId(msg.id)}
            onMouseLeave={() => setHoveredMsgId(null)}
          >
            {!msg.isLocal && (
              <span style={{ color: '#64748b', fontSize: 10, fontWeight: 600, marginBottom: 2, paddingLeft: 4 }}>{msg.fromName}</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: msg.isLocal ? 'row-reverse' : 'row' }}>
              <div style={{
                maxWidth: '85%', padding: '7px 11px', wordBreak: 'break-word',
                borderRadius: msg.isLocal ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: msg.isLocal
                  ? 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(56,189,248,0.25))'
                  : 'rgba(255,255,255,0.07)',
                border: msg.isLocal ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0', fontSize: 13, lineHeight: 1.45,
              }}>{msg.text}</div>
              {isHost && hoveredMsgId === msg.id && (
                <button
                  onClick={() => onPin(pinnedMsg?.msgId === msg.id ? null : msg)}
                  title={pinnedMsg?.msgId === msg.id ? 'Unpin' : 'Pin message'}
                  style={{
                    background: pinnedMsg?.msgId === msg.id ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6, padding: '2px 5px', cursor: 'pointer',
                    fontSize: 12, color: '#94a3b8', flexShrink: 0,
                  }}
                >📌</button>
              )}
            </div>
            <span style={{ color: '#334155', fontSize: 9, marginTop: 2, paddingLeft: 4, paddingRight: 4 }}>{msg.time}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Message everyone…"
            rows={1}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '7px 10px', color: '#e2e8f0',
              fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            style={{
              background: text.trim() ? 'linear-gradient(135deg, #8b5cf6, #38bdf8)' : 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 8, padding: '8px 12px',
              cursor: text.trim() ? 'pointer' : 'default',
              color: text.trim() ? '#fff' : '#475569',
              fontSize: 15, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s',
            }}
          >↑</button>
        </div>
      </div>
    </div>
  )
}

function CtrlWithLabel({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {children}
      <span style={{ color: '#475569', fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', userSelect: 'none' }}>
        {label}
      </span>
    </div>
  )
}

function RoomContent({
  activeCall, call, onEnd, minimized, onToggleMinimize, onDragStart, isGroup, onInvite, isHost,
  isFullscreen, onToggleFullscreen,
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
  const [showParticipants, setShowParticipants] = useState(false)
  const [pinnedId, setPinnedId] = useState(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [layoutMode, setLayoutMode] = useState('grid') // 'grid' | 'spotlight'
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [remoteScreenSharers, setRemoteScreenSharers] = useState(new Set())
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [captionsEnabled, setCaptionsEnabled] = useState(false)
  const [captionText, setCaptionText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStart, setRecordingStart] = useState(null)
  const [showHandQueue, setShowHandQueue] = useState(false)
  const [localHandRaisedAt, setLocalHandRaisedAt] = useState(null)
  const [videoFilter, setVideoFilter] = useState('')
  const [tileBgColor, setTileBgColor] = useState('')
  const [activePoll, setActivePoll] = useState(null)
  const [ownVote, setOwnVote] = useState(null)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const pipVideoRef = useRef(null)
  const [pinnedMsg, setPinnedMsg] = useState(null)
  const hostId = activeCall?.initiated_by

  const chatOpenRef = useRef(false)
  useEffect(() => { chatOpenRef.current = chatOpen }, [chatOpen])
  const recognitionRef = useRef(null)
  const captionClearRef = useRef(null)

  // Broadcast local screen-share state so peers can update their layout.
  useEffect(() => {
    call.sendSignal({ type: 'screen_share', active: call.screenSharing })
  }, [call.screenSharing, call.sendSignal])

  // Incoming raise-hand / reaction / screen-share signals from other participants.
  useEffect(() => {
    call.registerSignalHandler((fromId, fromName, data) => {
      try {
        if (data?.type === 'raise_hand') {
          if (fromId === call.localId) return
          const name = fromName || fromId
          setRaisedHands((prev) => ({
            ...prev,
            [fromId]: { raised: data.raised, name, raisedAt: data.raised ? (prev[fromId]?.raisedAt || Date.now()) : prev[fromId]?.raisedAt },
          }))
          if (data.raised) toast(`${name} raised their hand ✋`, { duration: 3000 })
        } else if (data?.type === 'reaction') {
          const id = Math.random().toString(36).slice(2)
          const x = 20 + Math.random() * 60
          setFloatingReactions((prev) => [...prev, { id, emoji: data.emoji, x }])
          setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500)
        } else if (data?.type === 'screen_share') {
          setRemoteScreenSharers((prev) => {
            const next = new Set(prev)
            if (data.active) next.add(fromId)
            else next.delete(fromId)
            return next
          })
        } else if (data?.type === 'recording') {
          setIsRecording(!!data.active)
          setRecordingStart(data.active ? (data.startTime || Date.now()) : null)
        } else if (data?.type === 'lower_hand' && data.targetId) {
          setRaisedHands(prev => {
            const next = { ...prev }
            delete next[data.targetId]
            return next
          })
          if (data.targetId === call.localId) {
            setHandRaised(false)
            setLocalHandRaisedAt(null)
          }
        } else if (data?.type === 'chat' && data.text) {
          const msg = {
            id: Math.random().toString(36).slice(2),
            fromId,
            fromName: fromName || 'Participant',
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isLocal: false,
          }
          setMessages(prev => [...prev, msg])
          if (!chatOpenRef.current) setUnreadCount(c => c + 1)
        } else if (data?.type === 'poll_start' && data.pollId) {
          setActivePoll({ pollId: data.pollId, question: data.question, options: data.options, votes: new Array(data.options.length).fill(0) })
          setOwnVote(null)
        } else if (data?.type === 'poll_vote' && typeof data.optionIdx === 'number') {
          setActivePoll(prev => {
            if (!prev || prev.pollId !== data.pollId) return prev
            const votes = [...prev.votes]
            votes[data.optionIdx] = (votes[data.optionIdx] || 0) + 1
            return { ...prev, votes }
          })
        } else if (data?.type === 'poll_end') {
          setActivePoll(prev => (prev?.pollId === data.pollId ? null : prev))
          setOwnVote(null)
        } else if (data?.type === 'chat_pin') {
          setPinnedMsg(data.msgId ? { msgId: data.msgId, text: data.text, fromName: data.fromName } : null)
        }
      } catch (e) {
        console.error('signal handler error:', e)
      }
    })
  }, [call])

  const toggleRaiseHand = useCallback(() => {
    const next = !handRaised
    setHandRaised(next)
    if (next) setLocalHandRaisedAt(Date.now())
    else setLocalHandRaisedAt(null)
    call.sendSignal({ type: 'raise_hand', raised: next })
  }, [handRaised, call])

  const callOn = useCallback((targetId) => {
    call.sendSignal({ type: 'lower_hand', targetId })
    setRaisedHands(prev => { const next = { ...prev }; delete next[targetId]; return next })
  }, [call])

  const toggleRecording = useCallback(() => {
    const next = !isRecording
    const startTime = next ? Date.now() : null
    setIsRecording(next)
    setRecordingStart(startTime)
    call.sendSignal({ type: 'recording', active: next, startTime })
  }, [isRecording, call])

  const sendReaction = useCallback((emoji) => {
    call.sendSignal({ type: 'reaction', emoji })
    const id = Math.random().toString(36).slice(2)
    const x = 20 + Math.random() * 60
    setFloatingReactions((prev) => [...prev, { id, emoji, x }])
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500)
    setShowReactionPicker(false)
  }, [call])

  const sendChatMessage = useCallback((text) => {
    const msg = {
      id: Math.random().toString(36).slice(2),
      fromId: call.localId,
      fromName: 'You',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isLocal: true,
    }
    setMessages(prev => [...prev, msg])
    call.sendSignal({ type: 'chat', text })
  }, [call])

  const toggleChat = useCallback(() => {
    setChatOpen(v => {
      if (!v) { setUnreadCount(0); setShowParticipants(false); setShowNotes(false) }
      return !v
    })
  }, [])

  const toggleNotes = useCallback(() => {
    setShowNotes(v => {
      if (!v) { setChatOpen(false); setShowParticipants(false) }
      return !v
    })
  }, [])

  const pinChatMsg = useCallback((msg) => {
    const data = msg ? { msgId: msg.id, text: msg.text, fromName: msg.isLocal ? 'You' : (msg.fromName || 'Participant') } : null
    setPinnedMsg(data)
    call.sendSignal({ type: 'chat_pin', ...(data || { msgId: null }) })
  }, [call])

  const startPoll = useCallback((poll) => {
    const newPoll = { ...poll, votes: new Array(poll.options.length).fill(0) }
    setActivePoll(newPoll)
    setOwnVote(null)
    setShowPollCreator(false)
    call.sendSignal({ type: 'poll_start', pollId: poll.pollId, question: poll.question, options: poll.options })
  }, [call])

  const castVote = useCallback((optionIdx) => {
    setActivePoll(prev => {
      if (!prev) return prev
      const votes = [...prev.votes]
      votes[optionIdx] = (votes[optionIdx] || 0) + 1
      return { ...prev, votes }
    })
    setOwnVote(optionIdx)
    call.sendSignal({ type: 'poll_vote', pollId: activePoll?.pollId, optionIdx })
  }, [call, activePoll])

  const endPoll = useCallback(() => {
    if (!activePoll) return
    call.sendSignal({ type: 'poll_end', pollId: activePoll.pollId })
    setActivePoll(null)
    setOwnVote(null)
  }, [activePoll, call])

  const togglePiP = useCallback(async () => {
    const el = pipVideoRef.current
    if (!el) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        if (el.srcObject) await el.requestPictureInPicture()
      }
    } catch (e) {
      console.warn('PiP:', e)
    }
  }, [])

  // PiP state sync
  useEffect(() => {
    const onEnter = () => setIsPiP(true)
    const onLeave = () => setIsPiP(false)
    document.addEventListener('enterpictureinpicture', onEnter)
    document.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      document.removeEventListener('enterpictureinpicture', onEnter)
      document.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  // Live captions via Web Speech API (local mic only)
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !captionsEnabled) {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* */ }
        recognitionRef.current = null
      }
      setCaptionText('')
      clearTimeout(captionClearRef.current)
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition
    recognition.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setCaptionText(text.trim())
      clearTimeout(captionClearRef.current)
      captionClearRef.current = setTimeout(() => setCaptionText(''), 5000)
    }
    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') console.warn('Caption error:', e.error)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        try { recognition.start() } catch { /* */ }
      }
    }
    try { recognition.start() } catch { /* */ }
    return () => {
      recognitionRef.current = null
      try { recognition.abort() } catch { /* */ }
      clearTimeout(captionClearRef.current)
      setCaptionText('')
    }
  }, [captionsEnabled])

  // Join / leave chimes: compare tile ID sets across renders.
  const prevTileIdsRef = useRef(null)
  useEffect(() => {
    const currentIds = new Set(call.tiles.map(t => t.id))
    if (prevTileIdsRef.current !== null) {
      const joined = [...currentIds].some(id => id !== call.localId && !prevTileIdsRef.current.has(id))
      const left   = [...prevTileIdsRef.current].some(id => id !== call.localId && !currentIds.has(id))
      if (joined) playJoinSound()
      if (left)   playLeaveSound()
    }
    prevTileIdsRef.current = currentIds
  }, [call.tiles, call.localId])

  // Auto bandwidth saver: drop outbound video to 240p when quality is poor.
  useEffect(() => {
    call.setVideoBandwidth?.(call.connectionQuality === 'poor' ? 'low' : 'normal')
  }, [call.connectionQuality]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the hidden PiP video element pointed at the current "main" stream.
  useEffect(() => {
    const el = pipVideoRef.current
    if (!el) return
    const mainId = pinnedId
      || (call.speakingId !== call.localId ? call.speakingId : null)
      || call.tiles.find(t => !t.isLocal)?.id
      || call.tiles[0]?.id
    el.srcObject = call.tiles.find(t => t.id === mainId)?.videoStream || null
  }, [pinnedId, call.speakingId, call.localId, call.tiles])

  // Determine if anyone is screen sharing — needed before grid/spotlight logic.
  const sharingTile = call.screenSharing
    ? call.tiles.find((t) => t.isLocal)
    : call.tiles.find((t) => remoteScreenSharers.has(t.id))
  const isAnyoneSharing = !!sharingTile

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }).catch(() => {})
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      switch (e.key) {
        case ' ': e.preventDefault(); call.toggleMic(); break
        case 'v': case 'V': e.preventDefault(); call.toggleCamera(); break
        case 's': case 'S': e.preventDefault(); call.toggleScreenShare(); break
        case 'h': case 'H': e.preventDefault(); toggleRaiseHand(); break
        case 'l': case 'L': e.preventDefault(); setLayoutMode(m => m === 'grid' ? 'spotlight' : 'grid'); break
        case 'p': case 'P': e.preventDefault(); setShowParticipants(v => { if (!v) setChatOpen(false); return !v }); break
        case 'c': case 'C': e.preventDefault(); toggleChat(); break
        case 't': case 'T': e.preventDefault(); setCaptionsEnabled(v => !v); break
        case 'q': case 'Q': e.preventDefault(); setShowHandQueue(v => !v); break
        case 'f': case 'F': e.preventDefault(); onToggleFullscreen?.(); break
        case 'n': case 'N': e.preventDefault(); toggleNotes(); break
        case 'i': case 'I': e.preventDefault(); togglePiP(); break
        case 'Escape':
          if (pinnedId) setPinnedId(null)
          else if (showShortcuts) setShowShortcuts(false)
          else if (showDeviceSelector) setShowDeviceSelector(false)
          else if (showNotes) setShowNotes(false)
          else if (chatOpen) setChatOpen(false)
          break
        case '?': setShowShortcuts(v => !v); break
        default: break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [call, pinnedId, showShortcuts, showDeviceSelector, showNotes, chatOpen, onToggleFullscreen, toggleRaiseHand, toggleChat, toggleNotes, togglePiP])

  // Auto-spotlight: the active remote speaker, falling back to the first remote tile.
  const spotlightId = layoutMode === 'spotlight' && !isAnyoneSharing
    ? ((call.speakingId && call.speakingId !== call.localId) ? call.speakingId : null)
      ?? call.tiles.find(t => !t.isLocal)?.id
      ?? call.tiles[0]?.id
    : null

  const grid = (
    <TileGrid
      tiles={call.tiles}
      speakingId={call.speakingId}
      raisedHands={raisedHands}
      localHandRaised={handRaised}
      localId={call.localId}
      onPin={setPinnedId}
      getAudioLevel={call.getAudioLevel}
      hostId={hostId}
      localFilter={videoFilter}
      localBgColor={tileBgColor}
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: '#e0d7ff', fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {isVideo ? 'Video Call' : 'Audio Call'}
          </span>
          {(connecting || isReconnecting) && (
            <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 400, fontSize: 11 }}>
              {isReconnecting ? 'Reconnecting…' : 'Connecting…'}
            </span>
          )}
          <CallTimer connected={connected} />
          <span style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '2px 8px', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {call.tiles.length} {call.tiles.length === 1 ? 'participant' : 'participants'}
          </span>
          {isRecording && <RecBadge start={recordingStart} />}
          {call.connectionQuality === 'poor' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 7, padding: '3px 9px',
              color: '#fbbf24', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
            }} title="Bandwidth saver active — video reduced to 240p">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              BW Saver
            </div>
          )}
        </div>
        {/* Copy meeting link */}
        <button
          onClick={handleCopyLink}
          title="Copy meeting link"
          style={{
            background: linkCopied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${linkCopied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: linkCopied ? '#4ade80' : '#64748b',
            borderRadius: 7, padding: '4px 9px', cursor: 'pointer',
            fontSize: 10, fontWeight: 700, marginRight: 4,
            transition: 'all 0.2s', letterSpacing: 0.3, whiteSpace: 'nowrap',
          }}
        >
          {linkCopied ? '✓ Copied' : 'Copy Link'}
        </button>
        {/* Signal quality */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }} title={`Connection: ${call.connectionQuality}`}>
          <SignalBars quality={call.connectionQuality} />
        </div>
        {/* Raised hands count — opens queue panel */}
        {(() => {
          const count = Object.values(raisedHands).filter(h => h.raised).length + (handRaised ? 1 : 0)
          if (!count) return null
          return (
            <button
              onClick={() => setShowHandQueue(v => !v)}
              title="Raised hands queue (Q)"
              style={{
                background: showHandQueue ? 'rgba(251,191,36,0.22)' : 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24', borderRadius: 8, padding: '4px 9px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, marginRight: 4,
                display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.2s',
              }}
            >
              ✋ {count}
            </button>
          )
        })()}
        {/* People panel toggle */}
        <button
          onClick={() => setShowParticipants(v => { if (!v) setChatOpen(false); return !v })}
          title="Participants"
          style={{
            background: showParticipants ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, marginRight: 4, transition: 'background 0.2s',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = showParticipants ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.08)'}
        >
          <UserGroupIcon style={{ width: 14, height: 14 }} />
          <span>{call.tiles.length}</span>
        </button>
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
        {/* Fullscreen toggle */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          style={{
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, marginRight: 6, transition: 'background 0.2s', lineHeight: 1,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.25)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.08)'}
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>
        {/* Shortcuts reference */}
        <button
          onClick={() => setShowShortcuts(v => !v)}
          title="Keyboard shortcuts (?)"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#475569', borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, marginRight: 6, transition: 'background 0.2s', lineHeight: 1,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          ?
        </button>
        <button
          onClick={() => setShowEndConfirm(true)}
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(190,18,60,0.22))',
            border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5',
            borderRadius: 8, padding: '5px 16px', cursor: 'pointer',
            fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
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

      {/* Participant tiles / screen share + side panel */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', zIndex: 1, display: 'flex' }}>
        {/* Main video area */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, #0d0618 0%, #0a0f1e 40%, #080d1a 70%, #0d0618 100%)',
            backgroundSize: '400% 400%', animation: 'gradientShift 8s ease infinite', zIndex: 0,
          }} />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 20% 30%, rgba(139,92,246,0.1) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(56,189,248,0.08) 0%, transparent 60%)',
          }} />
          {pinnedId && !isAnyoneSharing ? (
          <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <PinnedLayout
              tiles={call.tiles}
              pinnedId={pinnedId}
              speakingId={call.speakingId}
              raisedHands={raisedHands}
              localHandRaised={handRaised}
              localId={call.localId}
              onPin={setPinnedId}
              onUnpin={() => setPinnedId(null)}
              getAudioLevel={call.getAudioLevel}
              hostId={hostId}
              localFilter={videoFilter}
              localBgColor={tileBgColor}
            />
          </div>
        ) : spotlightId && !isAnyoneSharing ? (
          <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <PinnedLayout
              tiles={call.tiles}
              pinnedId={spotlightId}
              speakingId={call.speakingId}
              raisedHands={raisedHands}
              localHandRaised={handRaised}
              localId={call.localId}
              onPin={setPinnedId}
              onUnpin={() => setLayoutMode('grid')}
              unpinLabel="Grid View"
              getAudioLevel={call.getAudioLevel}
              hostId={hostId}
              localFilter={videoFilter}
              localBgColor={tileBgColor}
            />
          </div>
        ) : isAnyoneSharing ? (
            // Slack-style: big screen left, participant strip right
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex' }}>
              {/* Main screen area */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ScreenShareView tile={sharingTile} />
                {/* "X is presenting" badge */}
                <div style={{
                  position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(13,8,26,0.72)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(139,92,246,0.35)',
                  borderRadius: 8, padding: '4px 14px',
                  color: '#c4b5fd', fontSize: 12, fontWeight: 600,
                  letterSpacing: 0.3, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5,
                }}>
                  {sharingTile.name}{sharingTile.isLocal ? ' (You)' : ''} is presenting
                </div>
              </div>
              {/* Participant sidebar */}
              <div style={{
                width: 188, flexShrink: 0,
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '8px 8px', overflowY: 'auto',
                background: 'rgba(10,6,22,0.85)',
                borderLeft: '1px solid rgba(139,92,246,0.2)',
              }}>
                {call.tiles.map((tile) => {
                  const raised = tile.id === call.localId ? handRaised : !!raisedHands[tile.id]?.raised
                  return (
                    <SidebarTile
                      key={tile.id}
                      tile={tile}
                      isSpeaking={tile.id === call.speakingId}
                      raised={raised}
                      getAudioLevel={call.getAudioLevel}
                      hostId={hostId}
                    />
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
              {grid}
            </div>
          )}

          {/* Floating reactions */}
          {renderFloatingReactions()}

          {/* Speaking indicator */}
          {(() => {
            if (!call.speakingId || call.speakingId === call.localId) return null
            const speakingTile = call.tiles.find(t => t.id === call.speakingId)
            if (!speakingTile) return null
            return (
              <div style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20, padding: '5px 16px',
                color: '#e2e8f0', fontSize: 12, fontWeight: 500,
                zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{speakingTile.name}</span>
                <span style={{ color: '#94a3b8' }}>is speaking</span>
              </div>
            )
          })()}


          {/* Live captions strip — local speech only */}
          {captionsEnabled && captionText && (
            <div style={{
              position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
              maxWidth: '68%', zIndex: 21, pointerEvents: 'none',
              background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '7px 18px', textAlign: 'center',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                color: '#38bdf8', fontSize: 10, fontWeight: 800,
                letterSpacing: 0.5, flexShrink: 0,
                background: 'rgba(56,189,248,0.15)', borderRadius: 4,
                padding: '1px 5px', border: '1px solid rgba(56,189,248,0.3)',
              }}>CC</span>
              <span style={{ color: '#f1f5f9', fontSize: 14, lineHeight: 1.5 }}>{captionText}</span>
            </div>
          )}

          {/* Poll overlay */}
          {activePoll && (
            <PollOverlay
              poll={activePoll}
              ownVote={ownVote}
              isHost={isHost}
              onVote={castVote}
              onEnd={endPoll}
            />
          )}

          {/* Hidden PiP video source */}
          <video
            ref={pipVideoRef}
            autoPlay playsInline muted
            style={{ display: 'none' }}
          />

          {/* Hand queue panel */}
          {showHandQueue && (
            <HandQueuePanel
              raisedHands={raisedHands}
              localId={call.localId}
              localHandRaised={handRaised}
              localHandRaisedAt={localHandRaisedAt}
              tiles={call.tiles}
              isHost={isHost}
              onCallOn={callOn}
              onLowerOwn={() => {
                setHandRaised(false)
                setLocalHandRaisedAt(null)
                call.sendSignal({ type: 'raise_hand', raised: false })
              }}
              onClose={() => setShowHandQueue(false)}
            />
          )}

          {/* Waiting room panel */}
          {showWaitingRoom && isHost && (
            <WaitingRoomPanel callId={activeCall.call_id} onClose={() => setShowWaitingRoom(false)} />
          )}
        </div>

        {/* Participant panel — sits beside video area, no overlay */}
        {showParticipants && (
          <ParticipantPanel tiles={call.tiles} onClose={() => setShowParticipants(false)} />
        )}
        {/* Chat panel */}
        {chatOpen && (
          <ChatPanel
            messages={messages}
            onSendMessage={sendChatMessage}
            onClose={() => setChatOpen(false)}
            pinnedMsg={pinnedMsg}
            onPin={pinChatMsg}
            isHost={isHost}
          />
        )}
        {/* Notes panel */}
        {showNotes && (
          <CallNotesPanel
            notesKey={`notes_${activeCall?.call_id || 'default'}`}
            onClose={() => setShowNotes(false)}
          />
        )}
      </div>

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '12px 0 10px' }}>
          {/* Mic */}
          <CtrlWithLabel label={call.micEnabled ? 'Mute' : 'Unmute'}>
            <button
              onClick={call.toggleMic}
              title={call.micEnabled ? 'Mute' : 'Unmute'}
              style={ctrlBtn(call.micEnabled ? 'idle' : 'danger')}
            >{call.micEnabled ? <MicrophoneIcon style={ICON_SIZE} /> : <MutedMicIcon />}</button>
          </CtrlWithLabel>
          {/* Camera */}
          <CtrlWithLabel label={call.cameraEnabled ? 'Stop Video' : 'Start Video'}>
            <button
              onClick={call.toggleCamera}
              title={call.cameraEnabled ? 'Stop camera' : 'Start camera'}
              style={ctrlBtn(call.cameraEnabled ? 'idle' : 'danger')}
            >{call.cameraEnabled ? <VideoCameraIcon style={ICON_SIZE} /> : <VideoCameraSlashIcon style={ICON_SIZE} />}</button>
          </CtrlWithLabel>
          {/* Screen share */}
          <CtrlWithLabel label={call.screenSharing ? 'Stop Share' : 'Share Screen'}>
            <button
              onClick={call.toggleScreenShare}
              title={call.screenSharing ? 'Stop sharing' : 'Share screen'}
              style={ctrlBtn(call.screenSharing ? 'active' : 'idle')}
            ><ComputerDesktopIcon style={ICON_SIZE} /></button>
          </CtrlWithLabel>
          {/* Raise hand */}
          <CtrlWithLabel label={handRaised ? 'Lower Hand' : 'Raise Hand'}>
            <button
              onClick={toggleRaiseHand}
              title={handRaised ? 'Lower hand' : 'Raise hand'}
              style={{
                ...ctrlBtn(handRaised ? 'active' : 'idle'),
                animation: handRaised ? 'raiseHandPulse 1.5s ease-in-out infinite' : 'none',
              }}
            ><HandRaisedIcon style={ICON_SIZE} /></button>
          </CtrlWithLabel>
          {/* Reaction picker */}
          <CtrlWithLabel label="Reactions">
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
          </CtrlWithLabel>
          {/* Layout toggle */}
          <CtrlWithLabel label={layoutMode === 'spotlight' ? 'Grid View' : 'Spotlight'}>
            <button
              onClick={() => setLayoutMode(m => m === 'grid' ? 'spotlight' : 'grid')}
              title={layoutMode === 'spotlight' ? 'Switch to grid (L)' : 'Auto spotlight (L)'}
              style={ctrlBtn(layoutMode === 'spotlight' ? 'active' : 'idle')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                {layoutMode === 'spotlight'
                  ? <><rect x="2" y="2" width="16" height="9" rx="1.5"/><rect x="2" y="13" width="7" height="5" rx="1.5"/><rect x="11" y="13" width="7" height="5" rx="1.5"/></>
                  : <><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></>
                }
              </svg>
            </button>
          </CtrlWithLabel>
          {/* Device settings */}
          <CtrlWithLabel label="Devices">
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDeviceSelector(v => !v)}
                title="Audio / video devices"
                style={ctrlBtn(showDeviceSelector ? 'active' : 'idle')}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </button>
              {showDeviceSelector && (
                <DeviceSelector
                  onReplaceAudio={call.replaceAudioDevice}
                  onReplaceVideo={call.replaceVideoDevice}
                  onClose={() => setShowDeviceSelector(false)}
                />
              )}
            </div>
          </CtrlWithLabel>
          {/* Chat */}
          <CtrlWithLabel label="Chat">
            <div style={{ position: 'relative' }}>
              <button
                onClick={toggleChat}
                title="Chat (C)"
                style={ctrlBtn(chatOpen ? 'active' : 'idle')}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
              </button>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  width: 16, height: 16, fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
          </CtrlWithLabel>
          {/* Live Captions — fullscreen only */}
          {isFullscreen && (
            <CtrlWithLabel label={captionsEnabled ? 'Hide CC' : 'Captions'}>
              <button
                onClick={() => setCaptionsEnabled(v => !v)}
                title={`${captionsEnabled ? 'Disable' : 'Enable'} live captions (T)`}
                style={ctrlBtn(captionsEnabled ? 'active' : 'idle')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8"/>
                </svg>
              </button>
            </CtrlWithLabel>
          )}
          {/* Record (host only) */}
          {isHost && (
            <CtrlWithLabel label={isRecording ? 'Stop REC' : 'Record'}>
              <button
                onClick={toggleRecording}
                title={isRecording ? 'Stop recording' : 'Start recording'}
                style={{
                  ...ctrlBtn(isRecording ? 'danger' : 'idle'),
                  ...(isRecording ? { animation: 'raiseHandPulse 1.5s ease-in-out infinite' } : {}),
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="10" r="7" />
                </svg>
              </button>
            </CtrlWithLabel>
          )}
          {/* Waiting room button (host only) */}
          {isHost && isGroup && (
            <CtrlWithLabel label="Waiting Room">
              <button
                onClick={() => setShowWaitingRoom((v) => !v)}
                title="Waiting room"
                style={ctrlBtn(showWaitingRoom ? 'active' : 'idle')}
              ><UserGroupIcon style={ICON_SIZE} /></button>
            </CtrlWithLabel>
          )}
          {/* Notes — fullscreen only */}
          {isFullscreen && (
            <CtrlWithLabel label="Notes">
              <button
                onClick={toggleNotes}
                title="Call notes (N)"
                style={ctrlBtn(showNotes ? 'active' : 'idle')}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V8.414a1 1 0 00-.293-.707l-4.414-4.414A1 1 0 0011.586 3H5zm6 1.5V8a1 1 0 001 1h3.5L11 4.5zM7 9h2v1H7V9zm0 2h6v1H7v-1zm0 2h6v1H7v-1z" />
                </svg>
              </button>
            </CtrlWithLabel>
          )}
          {/* Picture-in-Picture */}
          <CtrlWithLabel label="PiP">
            <button
              onClick={togglePiP}
              title="Picture-in-Picture (I)"
              style={ctrlBtn(isPiP ? 'active' : 'idle')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v10h10V5H5zm5 5a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z" clipRule="evenodd" />
              </svg>
            </button>
          </CtrlWithLabel>
          {/* Poll (host only) */}
          {isHost && (
            <CtrlWithLabel label="Poll">
              <button
                onClick={() => setShowPollCreator(true)}
                title="Create a poll"
                style={ctrlBtn(activePoll ? 'active' : 'idle')}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </button>
            </CtrlWithLabel>
          )}
        </div>
      </div>

      {/* "You are muted" nudge */}
      {call.speakingWhileMuted && (
        <div style={{
          position: 'absolute', bottom: 118, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 10, padding: '8px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          zIndex: 22, whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(239,68,68,0.18)',
        }}>
          <span style={{ color: '#f87171', fontSize: 13, fontWeight: 600 }}>You are muted</span>
          <button
            onClick={call.toggleMic}
            style={{
              background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)',
              color: '#fca5a5', borderRadius: 6, padding: '3px 10px',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
            }}
          >
            Unmute
          </button>
        </div>
      )}

      {/* Keyboard shortcut reference */}
      {showShortcuts && <ShortcutCard onClose={() => setShowShortcuts(false)} />}

      {/* Poll creator modal */}
      {showPollCreator && isHost && (
        <PollCreatorModal
          onStart={startPoll}
          onClose={() => setShowPollCreator(false)}
        />
      )}

      {/* End call confirmation */}
      {showEndConfirm && (
        <EndCallModal
          isHost={isHost}
          isGroup={isGroup}
          onLeave={() => { setShowEndConfirm(false); onEnd() }}
          onEndAll={() => { setShowEndConfirm(false); onEnd() }}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}

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

// Per-tile animated audio level bars — DOM-direct updates via rAF, no re-renders.
const BAR_PATTERNS_FULL  = [0.5, 0.8, 1.0, 0.8, 0.5]
const BAR_PATTERNS_SMALL = [0.7, 1.0, 0.7]

function AudioLevelBars({ tileId, getAudioLevel, small = false }) {
  const patterns = small ? BAR_PATTERNS_SMALL : BAR_PATTERNS_FULL
  const maxH   = small ? 14 : 22
  const width  = small ? 2.5 : 3
  const gap    = small ? 2 : 2.5
  const bottom = small ? 22 : 34
  const right  = small ? 5 : 10
  const barRefs   = useRef([])
  const smoothRef = useRef(patterns.map(() => 0))
  const rafRef    = useRef(null)

  useEffect(() => {
    const tick = () => {
      const level = getAudioLevel ? getAudioLevel(tileId) : 0
      patterns.forEach((p, i) => {
        smoothRef.current[i] = smoothRef.current[i] * 0.6 + level * p * 0.4
        const el = barRefs.current[i]
        if (el) el.style.height = `${Math.max(small ? 1.5 : 2, smoothRef.current[i] * maxH)}px`
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [tileId, getAudioLevel, small]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'absolute', bottom, right,
      display: 'flex', alignItems: 'flex-end', gap,
      height: maxH, zIndex: 10, pointerEvents: 'none',
    }}>
      {patterns.map((_, i) => (
        <div
          key={i}
          ref={el => { barRefs.current[i] = el }}
          style={{
            width, height: small ? 1.5 : 2, borderRadius: 2,
            background: 'linear-gradient(180deg, #38bdf8, #8b5cf6)',
            filter: 'drop-shadow(0 0 3px rgba(56,189,248,0.5))',
          }}
        />
      ))}
    </div>
  )
}

// ── Virtual Background / Video Effects Panel ─────────────────────────────────
const VIDEO_FILTERS = [
  { label: 'Normal', value: '' },
  { label: 'B&W', value: 'grayscale(1)' },
  { label: 'Sepia', value: 'sepia(0.8)' },
  { label: 'Warm', value: 'sepia(0.3) saturate(1.6) hue-rotate(-10deg)' },
  { label: 'Cool', value: 'hue-rotate(180deg) saturate(1.4)' },
  { label: 'Vivid', value: 'saturate(2) contrast(1.1)' },
  { label: 'Blur', value: 'blur(4px)' },
]
const BG_COLORS = ['', '#1a1a2e', '#0d1b2a', '#16213e', '#0f3460', '#533483', '#1a472a', '#2d1b33']

function VirtualBgPanel({ filter, bgColor, onFilterChange, onBgColorChange, onClose }) {
  return (
    <div
      style={{
        position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
        background: 'linear-gradient(145deg, #0f172a, #0c1220)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 16, width: 280, zIndex: 60,
        boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Video Effects</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Filter</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {VIDEO_FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => onFilterChange(f.value)}
            style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: filter === f.value ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)',
              border: filter === f.value ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
              color: filter === f.value ? '#c4b5fd' : '#94a3b8',
            }}
          >{f.label}</button>
        ))}
      </div>
      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Background (camera off)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BG_COLORS.map((c, i) => (
          <button
            key={i}
            onClick={() => onBgColorChange(c)}
            title={c || 'Default'}
            style={{
              width: 26, height: 26, borderRadius: 6, cursor: 'pointer', padding: 0,
              background: c || 'linear-gradient(135deg, #6d28d9, #1d4ed8)',
              border: bgColor === c ? '2px solid #a78bfa' : '2px solid rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Poll Creator Modal (host only) ────────────────────────────────────────────
function PollCreatorModal({ onStart, onClose }) {
  const [question, setQuestion] = useState('')
  const [type, setType] = useState('yesno')
  const [options, setOptions] = useState(['', ''])

  const handleStart = () => {
    const q = question.trim()
    if (!q) return
    const opts = type === 'yesno' ? ['Yes', 'No'] : options.map(o => o.trim()).filter(Boolean)
    if (opts.length < 2) return
    onStart({ question: q, options: opts, pollId: Math.random().toString(36).slice(2) })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #0f172a, #0c1220)',
          border: '1px solid rgba(139,92,246,0.4)',
          borderRadius: 16, padding: '24px 28px',
          width: 340, display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>Create a Poll</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <input
          autoFocus
          placeholder="Ask a question…"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
          style={{
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8, padding: '8px 12px', color: '#e0d7ff', fontSize: 13, outline: 'none',
            width: '100%', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {['yesno', 'choice'].map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: type === t ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
              border: type === t ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: type === t ? '#c4b5fd' : '#64748b',
            }}>{t === 'yesno' ? 'Yes / No' : 'Multi-choice'}</button>
          ))}
        </div>
        {type === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => { const next = [...options]; next[i] = e.target.value; setOptions(next) }}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 7, padding: '6px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none',
                  }}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                  >×</button>
                )}
              </div>
            ))}
            {options.length < 4 && (
              <button
                onClick={() => setOptions([...options, ''])}
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)',
                  borderRadius: 7, padding: '6px 0', color: '#64748b', fontSize: 11, cursor: 'pointer',
                }}
              >+ Add option</button>
            )}
          </div>
        )}
        <button
          onClick={handleStart}
          disabled={!question.trim()}
          style={{
            background: question.trim() ? 'linear-gradient(135deg, #8b5cf6, #38bdf8)' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8, color: question.trim() ? '#fff' : '#475569',
            padding: '10px 0', cursor: question.trim() ? 'pointer' : 'default',
            fontSize: 13, fontWeight: 700, width: '100%', transition: 'all 0.15s',
          }}
        >Launch Poll</button>
      </div>
    </div>
  )
}

// ── Poll Overlay (visible to all while a poll is active) ──────────────────────
function PollOverlay({ poll, ownVote, isHost, onVote, onEnd }) {
  const total = (poll.votes || []).reduce((s, c) => s + c, 0)
  return (
    <div style={{
      position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
      width: 320, background: 'rgba(9,13,24,0.96)', backdropFilter: 'blur(18px)',
      border: '1px solid rgba(139,92,246,0.4)', borderRadius: 14,
      padding: '18px 20px', zIndex: 30,
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, marginRight: 8, color: '#e2e8f0', fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
          <span style={{ fontSize: 15 }}>📊</span>
          {poll.question}
        </div>
        {isHost && (
          <button onClick={onEnd} style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6, padding: '3px 8px', color: '#f87171',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          }}>End</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {poll.options.map((opt, i) => {
          const count = (poll.votes && poll.votes[i]) || 0
          const pct = total > 0 ? (count / total) * 100 : 0
          const voted = ownVote === i
          const showResults = ownVote !== null || isHost
          return (
            <button
              key={i}
              onClick={() => ownVote === null && !isHost && onVote(i)}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 12px',
                borderRadius: 8, position: 'relative', overflow: 'hidden',
                background: voted ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                border: voted ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                cursor: ownVote === null && !isHost ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {showResults && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
                  background: voted ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.04)',
                  transition: 'width 0.5s ease',
                }} />
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: voted ? '#c4b5fd' : '#e2e8f0', fontSize: 12, fontWeight: voted ? 700 : 500 }}>
                  {voted && '✓ '}{opt}
                </span>
                {showResults && (
                  <span style={{ color: '#64748b', fontSize: 11 }}>{count} ({Math.round(pct)}%)</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {total > 0 && (
        <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 10, fontWeight: 600 }}>
          {total} vote{total !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ── Call Notes Panel ──────────────────────────────────────────────────────────
function CallNotesPanel({ notesKey, onClose }) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(notesKey) || '' } catch { return '' }
  })
  const saveTimerRef = useRef(null)

  const handleChange = (val) => {
    setText(val)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(notesKey, val) } catch { /* */ }
    }, 500)
  }

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: 'rgba(9,13,24,0.94)', backdropFilter: 'blur(18px)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>Call Notes</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#334155', fontSize: 9, fontWeight: 600 }}>Auto-saved</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={text}
          onChange={e => handleChange(e.target.value)}
          placeholder="Private notes — only visible to you."
          style={{
            flex: 1, width: '100%', boxSizing: 'border-box', minHeight: 200,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
            fontSize: 12, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.55,
          }}
        />
      </div>
    </div>
  )
}

// ── Lobby Pre-join Screen ─────────────────────────────────────────────────────
function LobbyScreen({ localUser, activeCall, onJoin, onCancel }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [acquiring, setAcquiring] = useState(true)
  const isVideo = activeCall?.type === 'video'

  useEffect(() => {
    let cancelled = false
    setAcquiring(true)
    const constraints = isVideo ? { video: true, audio: true } : { audio: true }
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current && isVideo) videoRef.current.srcObject = stream
      setAcquiring(false)
    }).catch(() => { if (!cancelled) setAcquiring(false) })
    return () => {
      cancelled = true
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    }
  }, [isVideo])

  const toggleMic = () => {
    const next = !micOn; setMicOn(next)
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = next })
  }
  const toggleCam = () => {
    const next = !camOn; setCamOn(next)
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = next })
  }
  const handleJoin = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    onJoin({ camOn, micOn })
  }

  const displayName = localUser?.full_name || localUser?.email || 'You'
  const title = activeCall?.title || (isVideo ? 'Video Call' : 'Voice Call')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0614 0%, #0d1525 100%)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 520, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#8b5cf6', textTransform: 'uppercase', marginBottom: 8 }}>
            Ready to join?
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>{title}</div>
        </div>

        {/* Camera / avatar preview */}
        <div style={{
          width: 360, height: 220, borderRadius: 14, overflow: 'hidden', position: 'relative',
          background: '#0a0614', border: '1px solid rgba(139,92,246,0.3)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {isVideo && (
            <video
              ref={videoRef}
              autoPlay playsInline muted
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', transform: 'scaleX(-1)',
                display: camOn ? 'block' : 'none',
              }}
            />
          )}
          {(!isVideo || !camOn) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 1 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6d28d9, #1d4ed8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: '#fff',
              }}>
                {displayName[0].toUpperCase()}
              </div>
              <span style={{ color: '#475569', fontSize: 12 }}>{isVideo ? 'Camera off' : 'Voice only'}</span>
            </div>
          )}
          {acquiring && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', zIndex: 2 }}>
              <span style={{ color: '#8b5cf6', fontSize: 12 }}>Requesting access…</span>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, zIndex: 3 }}>
            <button
              onClick={toggleMic}
              title={micOn ? 'Mute mic' : 'Unmute mic'}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: micOn ? 'rgba(0,0,0,0.65)' : 'rgba(239,68,68,0.85)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}
            >
              <MicrophoneIcon style={{ width: 16, height: 16 }} />
            </button>
            {isVideo && (
              <button
                onClick={toggleCam}
                title={camOn ? 'Turn off camera' : 'Turn on camera'}
                style={{
                  width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: camOn ? 'rgba(0,0,0,0.65)' : 'rgba(239,68,68,0.85)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {camOn ? <VideoCameraIcon style={{ width: 16, height: 16 }} /> : <VideoCameraSlashIcon style={{ width: 16, height: 16 }} />}
              </button>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', width: 360 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Joining as </span>
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}>{displayName}</span>
        </div>

        <div style={{ display: 'flex', gap: 12, width: 360 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '12px 0', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >Cancel</button>
          <button
            onClick={handleJoin}
            style={{
              flex: 2, background: 'linear-gradient(135deg, #8b5cf6, #38bdf8)',
              border: 'none', borderRadius: 10, padding: '12px 0', color: '#fff',
              cursor: 'pointer', fontSize: 14, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
            }}
          >Join Now</button>
        </div>
      </div>
    </div>
  )
}

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
  const [lobbyDone, setLobbyDone] = useState(false)
  const [joinWithCam, setJoinWithCam] = useState(true)
  const [joinWithMic, setJoinWithMic] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [pipPos, setPipPos] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isHost = activeCall?.initiated_by === localUser?.id
  const pipRef = useRef(null)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      pipRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])
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
    room: lobbyDone ? activeCall?.room : null,
    isVideo: activeCall?.type === 'video',
    localUser,
    initialCamOff: !joinWithCam,
    initialMicOff: !joinWithMic,
    onConnected: handleConnected,
    onError: handleError,
    onEnd: handleDisconnected,
  })

  // Notify the user when the server forces their camera off due to room video limits.
  useEffect(() => {
    if (call.videoCapped) toast('Your camera was disabled — this call has reached its video stream limit.', { duration: 6000 })
  }, [call.videoCapped])

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

  if (!lobbyDone) {
    return (
      <LobbyScreen
        localUser={localUser}
        activeCall={activeCall}
        onJoin={({ camOn, micOn }) => { setJoinWithCam(camOn); setJoinWithMic(micOn); setLobbyDone(true) }}
        onCancel={onEnd}
      />
    )
  }

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
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
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
