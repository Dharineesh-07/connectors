import { useEffect, useRef, useState } from 'react'
import { useSocket } from '../context/SocketContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export default function OfflineBanner() {
  const isOnline = useNetworkStatus()
  const { connected } = useSocket()
  const [justReconnected, setJustReconnected] = useState(false)
  const prevConnectedRef = useRef(connected)

  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (!wasConnected && connected && isOnline) {
      setJustReconnected(true)
      const t = setTimeout(() => setJustReconnected(false), 2500)
      return () => clearTimeout(t)
    }
  }, [connected, isOnline])

  if (justReconnected) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-white"
        style={{ background: '#22c55e' }}
      >
        ✓ Connected
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-white"
        style={{ background: '#ef4444' }}
      >
        ✕ No internet connection
      </div>
    )
  }

  if (!connected) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 py-1 text-xs font-semibold text-white"
        style={{ background: '#f59e0b' }}
      >
        ↻ Reconnecting…
      </div>
    )
  }

  return null
}
