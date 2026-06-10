import { useEffect } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'

function playNotificationSound() {
  if (localStorage.getItem('sound_enabled') === 'false') return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    setTimeout(() => ctx.close(), 500)
  } catch {}
}

function shouldShowNotification(data, userId) {
  if (localStorage.getItem('notifications_enabled') === 'false') return false

  const type = localStorage.getItem('notification_type') || 'all'
  if (type === 'all') return true

  if (type === 'dms_only') {
    return data.conversation_type === 'direct'
  }

  if (type === 'mentions_only') {
    const content = data.content || ''
    if (content.includes('@here') || content.includes('@channel')) return true
    const storedUser = (() => {
      try { return JSON.parse(localStorage.getItem('orgchat_user')) } catch { return null }
    })()
    const name = storedUser?.display_name || storedUser?.full_name || ''
    return name ? content.toLowerCase().includes(name.toLowerCase()) : false
  }

  return true
}

export function useNotifications() {
  const { on } = useSocket()
  const { user } = useAuth()

  useEffect(() => {
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (!window.Notification) return

    const showNotification = (title, options) => {
      if (Notification.permission !== 'granted') return
      const n = new Notification(title, options)
      n.onclick = () => {
        window.focus()
        n.close()
      }
    }

    const offMsg = on('message:new', (data) => {
      const activeId = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/)?.[1]
      if (activeId === data.conversation_id && document.hasFocus()) return
      if (data.sender_id === user?.id) return

      if (!shouldShowNotification(data, user?.id)) return

      playNotificationSound()

      const text = data.type === 'text' ? data.content : `[${data.type} message]`
      showNotification('New Message', {
        body: text,
        icon: '/favicon.ico',
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
