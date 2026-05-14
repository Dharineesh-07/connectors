import { useMemo } from 'react'
import { useSocket } from '../context/SocketContext'

export function useOnlineUsers(initialOnlineIds = []) {
  const { onlineUsers, userStatuses, presenceReady } = useSocket()

  return useMemo(() => {
    // If we have a map of statuses, use it
    if (presenceReady) return { onlineUsers, userStatuses }
    
    // Fallback for initial load
    const fallbackStatuses = new Map()
    initialOnlineIds.forEach(id => fallbackStatuses.set(id, 'online'))
    
    return { 
      onlineUsers: new Set([...initialOnlineIds, ...onlineUsers]), 
      userStatuses: new Map([...fallbackStatuses, ...userStatuses]) 
    }
  }, [initialOnlineIds, onlineUsers, userStatuses, presenceReady])
}
