import { useEffect } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'

export function useNotifications() {
  const { on } = useSocket()
  const { user } = useAuth()

  useEffect(() => {
    // Request permission on load
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!window.Notification) return

    const showNotification = (title, options) => {
      if (Notification.permission === 'granted') {
        const n = new Notification(title, options)
        n.onclick = () => {
          window.focus()
          n.close()
        }
      }
    }

    const offMsg = on('message:new', (data) => {
      // Don't notify if we are actively looking at this conversation
      const activeId = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/)?.[1]
      if (activeId === data.conversation_id && document.hasFocus()) {
        return
      }
      
      // Don't notify for our own messages
      if (data.sender_id === user?.id) return

      const text = data.type === 'text' ? data.content : `[${data.type} message]`
      showNotification('New Message', {
        body: text,
        icon: '/favicon.ico', // Adjust if there's a better icon
      })
    })

    let currentCallNotification = null

    const offCall = on('call:incoming', (data) => {
      const callerName = data.caller?.full_name || 'Someone'
      const type = data.type === 'video' ? 'Video' : 'Audio'
      
      if (Notification.permission === 'granted') {
        currentCallNotification = new Notification(`Incoming ${type} Call`, {
          body: `${callerName} is calling you...`,
          icon: data.caller?.avatar_url || '/favicon.ico',
          requireInteraction: true,
        })
        currentCallNotification.onclick = () => {
          window.focus()
          currentCallNotification.close()
        }
      }
    })

    const closeCallNotification = () => {
      if (currentCallNotification) {
        currentCallNotification.close()
        currentCallNotification = null
      }
    }

    const offCallAnswered = on('call:answered', closeCallNotification)
    const offCallEnded = on('call:ended', closeCallNotification)
    const offCallTimeout = on('call:timeout', closeCallNotification)

    return () => {
      offMsg()
      offCall()
      offCallAnswered()
      offCallEnded()
      offCallTimeout()
    }
  }, [on, user])
}
