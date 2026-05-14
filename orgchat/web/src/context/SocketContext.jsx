import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

function tokenExpiresSoon(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.exp || payload.exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('orgchat_refresh_token')
  if (!refreshToken) return null

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) return null

  const data = await response.json()
  localStorage.setItem('orgchat_access_token', data.access_token)
  return data.access_token
}

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const forceRefreshRef = useRef(false)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [userStatuses, setUserStatuses] = useState(new Map())
  const [presenceReady, setPresenceReady] = useState(false)
  const listenersRef = useRef({})
  const ownStatusRef = useRef('online')

  const on = useCallback((type, handler) => {
    if (!listenersRef.current[type]) listenersRef.current[type] = new Set()
    listenersRef.current[type].add(handler)
    return () => listenersRef.current[type]?.delete(handler)
  }, [])

  const emit = useCallback((type, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }))
    }
  }, [])

  // Handle tab visibility (Away status)
  useEffect(() => {
    if (!connected) return

    const handleVisibilityChange = () => {
      if (ownStatusRef.current === 'busy') return
      const status = document.visibilityState === 'visible' ? 'online' : 'away'
      emit('user:status', { status })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [connected, emit])

  useEffect(() => {
    if (!user) {
      setConnected(false)
      setReconnecting(false)
      setPresenceReady(false)
      setOnlineUsers(new Set())
      setUserStatuses(new Map())
      return
    }

    let alive = true

    async function getSocketToken() {
      const token = localStorage.getItem('orgchat_access_token')
      if (token && !forceRefreshRef.current && !tokenExpiresSoon(token)) return token

      forceRefreshRef.current = false
      return refreshAccessToken()
    }

    async function connect() {
      const token = await getSocketToken()
      if (!token || !alive) return

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/connect?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (alive) {
          setConnected(true)
          setReconnecting(false)
          setPresenceReady(false)
        }
      }

      ws.onclose = (event) => {
        if (!alive) return
        setConnected(false)
        setPresenceReady(false)
        if (event.code === 4001) forceRefreshRef.current = true
        setReconnecting(true)
        reconnectTimer.current = setTimeout(connect, event.code === 4001 ? 500 : 3000)
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          
          if (msg.type === 'presence:snapshot') {
            const users = msg.data?.users ?? []
            const newStatuses = new Map()
            const newOnline = new Set()
            users.forEach(u => {
              newOnline.add(u.user_id)
              newStatuses.set(u.user_id, u.status)
              if (u.user_id === user?.id) ownStatusRef.current = u.status
            })
            setOnlineUsers(newOnline)
            setUserStatuses(newStatuses)
            setPresenceReady(true)
          } else if (msg.type === 'user:presence') {
            const { user_id, online, status } = msg.data
            if (user_id === user?.id) ownStatusRef.current = online ? status : 'offline'
            setOnlineUsers((prev) => {
              const next = new Set(prev)
              if (online) next.add(user_id)
              else next.delete(user_id)
              return next
            })
            setUserStatuses((prev) => {
              const next = new Map(prev)
              if (online) next.set(user_id, status)
              else next.delete(user_id)
              return next
            })
          }

          const handlers = listenersRef.current[msg.type]
          if (handlers) handlers.forEach((h) => h(msg.data, msg))
        } catch {
          // ignore malformed frames
        }
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setReconnecting(false)
      setPresenceReady(false)
    }
  }, [user])

  return (
    <SocketContext.Provider value={{ connected, reconnecting, on, emit, onlineUsers, userStatuses, presenceReady }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
