import { createContext, useContext } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'

const CallContext = createContext(null)

export function CallProvider({ children }) {
  const rtc = useWebRTC()
  return <CallContext.Provider value={rtc}>{children}</CallContext.Provider>
}

export const useCall = () => useContext(CallContext)
