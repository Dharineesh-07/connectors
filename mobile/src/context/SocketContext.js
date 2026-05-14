import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import * as SecureStore from 'expo-secure-store'
import { useAuth } from './AuthContext'
import { WS_BASE_URL } from '../api/config'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const listenersRef = useRef({})

  const on = useCallback((type, handler) => {
    if (!listenersRef.current[type]) listenersRef.current[type] = new Set()
    listenersRef.current[type].add(handler)
    return () => listenersRef.current[type]?.delete(handler)
  }, [])

  const emit = useCallback((type, data) => {
    socketRef.current?.emit(type, data)
  }, [])

  useEffect(() => {
    if (!user) return

    let socket
    let alive = true

    async function connect() {
      const token = await SecureStore.getItemAsync('access_token')
      if (!token || !alive) return

      socket = io(WS_BASE_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: Infinity,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        if (alive) setConnected(true)
      })
      socket.on('disconnect', () => {
        if (alive) setConnected(false)
      })
      socket.on('connect_error', () => {
        if (alive) setConnected(false)
      })

      // Forward all socket.io named events into the listener registry
      socket.onAny((eventName, data) => {
        const handlers = listenersRef.current[eventName]
        if (handlers) handlers.forEach((h) => h(data))
      })
    }

    connect()

    return () => {
      alive = false
      socket?.disconnect()
      socketRef.current = null
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
