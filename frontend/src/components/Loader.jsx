import { useState, useEffect } from 'react'
import Logo from './Logo'

const MESSAGES = [
  'Setting up your workspace…',
  'Loading conversations…',
  'Almost ready…',
]

function CyclingMessage() {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx((i) => (i + 1) % MESSAGES.length)
        setVisible(true)
      }, 400)
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  return (
    <p
      style={{
        color: 'var(--cn-gray-400)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        transition: 'opacity 400ms ease, transform 400ms ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        minHeight: '18px',
      }}
    >
      {MESSAGES[idx]}
    </p>
  )
}

export default function Loader({ variant = 'inline', message }) {
  if (variant === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        style={{ background: 'var(--cn-login-bg)' }}
      >
        {/* Background orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(circle, var(--cn-login-orb-red) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'cn-float 3.5s ease-in-out infinite' }}
        />
        <div className="absolute bottom-[-10%] right-[-5%] w-[440px] h-[440px] rounded-full pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(circle, var(--cn-login-orb-blue) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'cn-float 3.5s ease-in-out infinite', animationDelay: '1.8s' }}
        />

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center" style={{ gap: '32px' }}>

          {/* Logo with pulse rings */}
          <div className="relative flex items-center justify-center" style={{ width: '180px', height: '180px' }}>
            {/* Ring 1 */}
            <div
              className="absolute rounded-full"
              style={{
                width: '110px',
                height: '110px',
                border: '1.5px solid rgba(204, 51, 51, 0.5)',
                animation: 'cn-loader-ring 2.4s ease-out infinite',
              }}
            />
            {/* Ring 2 */}
            <div
              className="absolute rounded-full"
              style={{
                width: '110px',
                height: '110px',
                border: '1.5px solid rgba(51, 153, 204, 0.5)',
                animation: 'cn-loader-ring 2.4s ease-out infinite',
                animationDelay: '0.8s',
              }}
            />
            {/* Ring 3 */}
            <div
              className="absolute rounded-full"
              style={{
                width: '110px',
                height: '110px',
                border: '1px solid rgba(165, 34, 102, 0.3)',
                animation: 'cn-loader-ring 2.4s ease-out infinite',
                animationDelay: '1.6s',
              }}
            />
            {/* Logo floating */}
            <div style={{ animation: 'cn-loader-logo-float 3.2s ease-in-out infinite' }}>
              <Logo size="lg" />
            </div>
          </div>

          {/* Brand bar with shimmer */}
          <div
            className="relative rounded-full overflow-hidden"
            style={{ width: '220px', height: '3px', background: 'rgba(255,255,255,0.07)' }}
          >
            <div
              className="absolute inset-0 rounded-full cn-gradient-brand-animated"
            />
            <div
              className="absolute inset-y-0 w-1/3 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
                animation: 'cn-loader-shimmer 1.8s ease-in-out infinite',
              }}
            />
          </div>

          {/* Gradient dots */}
          <div className="flex items-center gap-3">
            {[
              { bg: 'linear-gradient(135deg, #CC3333, #A52266)', delay: '0s' },
              { bg: 'linear-gradient(135deg, #A52266, #3399CC)', delay: '0.22s' },
              { bg: 'linear-gradient(135deg, #3399CC, #2277AA)', delay: '0.44s' },
            ].map((dot, i) => (
              <div
                key={i}
                style={{
                  width: '11px',
                  height: '11px',
                  borderRadius: '50%',
                  background: dot.bg,
                  animation: 'cn-loader-dot 1.4s ease infinite',
                  animationDelay: dot.delay,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              />
            ))}
          </div>

          {/* Cycling message */}
          {message ? (
            <p style={{ color: 'var(--cn-gray-400)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {message}
            </p>
          ) : (
            <CyclingMessage />
          )}
        </div>
      </div>
    )
  }

  if (variant === 'block') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-4">
        <div className="flex items-center gap-2.5">
          {[
            { bg: 'linear-gradient(135deg, #CC3333, #A52266)', delay: '0s' },
            { bg: 'linear-gradient(135deg, #A52266, #3399CC)', delay: '0.2s' },
            { bg: 'linear-gradient(135deg, #3399CC, #2277AA)', delay: '0.4s' },
          ].map((dot, i) => (
            <div
              key={i}
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: dot.bg,
                animation: 'cn-loader-dot 1.4s ease infinite',
                animationDelay: dot.delay,
              }}
            />
          ))}
        </div>
        {message && (
          <p className="text-xs" style={{ color: 'var(--cn-gray-400)' }}>{message}</p>
        )}
      </div>
    )
  }

  return (
    <span className="animate-cn-spin inline-block w-4 h-4 border-2 border-cn-blue border-t-transparent rounded-full" />
  )
}
