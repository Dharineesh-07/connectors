import { createContext, useContext, useEffect } from 'react'
import { useWebRTC } from '../hooks/useWebRTC'
import { navigate } from '../navigation/navigationRef'
import { useSocket } from './SocketContext'

const CallContext = createContext(null)

export function CallProvider({ children }) {
  const rtc = useWebRTC()
  const { on } = useSocket()

  // Navigate to CallScreen on incoming call
  useEffect(() => {
    return on('call:incoming', () => {
      navigate('Call')
    })
  }, [on])

  // Navigate to CallScreen when outgoing call is initiated
  useEffect(() => {
    if (rtc.callState === 'calling') {
      navigate('Call')
    }
  }, [rtc.callState])

  return <CallContext.Provider value={rtc}>{children}</CallContext.Provider>
}

export const useCall = () => useContext(CallContext)
