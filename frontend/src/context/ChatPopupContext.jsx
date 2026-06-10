import { createContext, useContext, useState, useCallback } from 'react'

const ChatPopupContext = createContext(null)

// Each item: { id, minimized, x: null, y: null }
// x/y null  → docked in the bottom-right bar
// x/y set   → freely floating at fixed screen coords

export function ChatPopupProvider({ children }) {
  const [openChats, setOpenChats] = useState([])
  const [announcementOpen, setAnnouncementOpen] = useState(false)

  const openAnnouncement = useCallback(() => {
    setAnnouncementOpen(true)
    setOpenChats((prev) => prev.map((c) => ({ ...c, minimized: true })))
  }, [])

  const closeAnnouncement = useCallback(() => {
    setAnnouncementOpen(false)
  }, [])

  const openChat = useCallback((id) => {
    setAnnouncementOpen(false)
    setOpenChats((prev) => {
      const existing = prev.find((c) => c.id === id)
      // Already floating → expand it, minimize all others
      if (existing?.x != null) {
        return prev.map((c) => (c.id === id ? { ...c, minimized: false } : { ...c, minimized: true }))
      }
      // Docked or new → remove from current slot, append expanded at end, minimize all others
      const rest = prev
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, minimized: true }))
      return [...rest, { id, minimized: false, x: null, y: null }]
    })
  }, [])

  const closeChat = useCallback((id) => {
    setOpenChats((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const minimizeChat = useCallback((id) => {
    setOpenChats((prev) => prev.map((c) => (c.id === id ? { ...c, minimized: true } : c)))
  }, [])

  const maximizeChat = useCallback((id) => {
    setAnnouncementOpen(false)
    setOpenChats((prev) => {
      const chat = prev.find((c) => c.id === id)
      if (!chat) return prev
      // Floating → expand in-place, minimize all others
      if (chat.x != null) {
        return prev.map((c) => (c.id === id ? { ...c, minimized: false } : { ...c, minimized: true }))
      }
      // Docked → move to end (rightmost), minimize all others
      const rest = prev
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, minimized: true }))
      return [...rest, { id, minimized: false, x: null, y: null }]
    })
  }, [])

  const updatePosition = useCallback((id, x, y) => {
    setOpenChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x, y } : c))
    )
  }, [])

  return (
    <ChatPopupContext.Provider
      value={{ openChats, openChat, closeChat, minimizeChat, maximizeChat, updatePosition, announcementOpen, openAnnouncement, closeAnnouncement }}
    >
      {children}
    </ChatPopupContext.Provider>
  )
}

export function useChatPopup() {
  return useContext(ChatPopupContext)
}
