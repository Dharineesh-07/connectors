import { useEffect, useState } from 'react'
import { PhoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid'
import UserAvatar from './UserAvatar'

export default function CallOverlay({ incomingCall, onAnswer, onReject }) {
  const [secondsLeft, setSecondsLeft] = useState(35)

  useEffect(() => {
    if (!incomingCall) return
    setSecondsLeft(35)
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [incomingCall])

  if (!incomingCall) return null

  const isVideo = incomingCall.type === 'video'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.80)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }}>
      {/* Card */}
      <div
        className="animate-cn-scale-in"
        style={{
          background: 'linear-gradient(160deg, #0a1628 0%, #0d1f38 55%, #111827 100%)',
          border: '1px solid rgba(99, 102, 241, 0.38)',
          boxShadow: '0 0 0 1px rgba(99,102,241,0.12), 0 0 60px rgba(99,102,241,0.22), 0 24px 80px rgba(0,0,0,0.6)',
          borderRadius: '24px',
          padding: '36px 44px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '18px',
          width: '300px',
          minWidth: '280px',
        }}
      >
        {/* Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '6px 18px',
          borderRadius: '9999px',
          border: '1px solid rgba(99, 179, 237, 0.50)',
          background: 'rgba(99, 179, 237, 0.08)',
          color: '#90cdf4',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.12em',
        }}>
          <PhoneIcon style={{ width: 12, height: 12 }} />
          {isVideo ? 'VIDEO CALL' : 'VOICE CALL'}
        </div>

        {/* Avatar with pulsing rings */}
        <div style={{ position: 'relative', width: '64px', height: '64px', margin: '28px 0 10px' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="cn-call-ring"
              style={{ animationDelay: `${i * 0.6}s` }}
            />
          ))}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <UserAvatar user={incomingCall.caller} size="xl" />
          </div>
        </div>

        {/* Caller info */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: 0 }}>
            {incomingCall.caller?.full_name}
          </p>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '5px' }}>
            Incoming {isVideo ? 'video' : 'voice'} call...
          </p>
          <p style={{ color: secondsLeft <= 5 ? '#ef4444' : '#475569', fontSize: '12px', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
            {secondsLeft}s
          </p>
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '44px' }}>
          <button
            onClick={() => onReject(incomingCall.call_id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
          >
            <span style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #dc2626 0%, #9f1515 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(220, 38, 38, 0.55)',
              transition: 'box-shadow 150ms ease, transform 150ms ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 36px rgba(220,38,38,0.75)'; e.currentTarget.style.transform = 'scale(1.07)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(220,38,38,0.55)'; e.currentTarget.style.transform = 'scale(1)' }}
            >
              <PhoneXMarkIcon style={{ width: '26px', height: '26px', color: 'white' }} />
            </span>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Decline</span>
          </button>

          <button
            onClick={() => onAnswer(incomingCall)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
          >
            <span style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #16a34a 0%, #0d6e33 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(22, 163, 74, 0.55)',
              transition: 'box-shadow 150ms ease, transform 150ms ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 36px rgba(22,163,74,0.75)'; e.currentTarget.style.transform = 'scale(1.07)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(22,163,74,0.55)'; e.currentTarget.style.transform = 'scale(1)' }}
            >
              <PhoneIcon style={{ width: '26px', height: '26px', color: 'white' }} />
            </span>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Accept</span>
          </button>
        </div>
      </div>
    </div>
  )
}
