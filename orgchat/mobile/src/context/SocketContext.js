import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { useAuth } from './AuthContext'
import { WS_BASE_URL } from '../api/config'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const [connected, setConnected] = useState(false)
  const listenersRef = useRef({})

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

  useEffect(() => {
    if (!user) return

    let alive = true

    async function connect() {
      const token = await SecureStore.getItemAsync('access_token')
      if (!token || !alive) return

      const ws = new WebSocket(`${WS_BASE_URL}/ws/connect?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (alive) setConnected(true)
      }

      ws.onclose = (event) => {
        if (!alive) return
        setConnected(false)
        if (event.code !== 4001) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
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
    }
  }, [user])

  return (
    <SocketContext.Provider value={{ connected, on, emit }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
