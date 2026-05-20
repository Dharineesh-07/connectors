import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import CallOverlay from '../components/CallOverlay'
import GroupCallRoom from '../components/GroupCallRoom'
import { useCall } from '../context/CallContext'
import { useAuth } from '../context/AuthContext'
import { joinCall } from '../api/calls'
import { useNotifications } from '../hooks/useNotifications'

export default function Dashboard() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [callMinimized, setCallMinimized] = useState(false)
  useNotifications() // Enable system notifications

  const {
    callState,
    incomingCall,
    activeCall,
    localStream,
    remoteParticipants,
    answerCall,
    rejectCall,
    endCall,
    isScreenSharing,
    remoteIsScreenSharing,
    toggleScreenShare,
    isCameraOff,
    remoteCameraStates,
    toggleCamera,
  } = useCall()

  useEffect(() => {
    if (callState === 'idle') setCallMinimized(false)
  }, [callState])

  const handleAnswer = async (callInfo) => {
    try {
      const data = await joinCall(callInfo.call_id)
      await answerCall(callInfo, data.turn_credentials)
    } catch {
      toast.error('Could not answer call')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-all animate-cn-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Outlet context={{ onToggleSidebar: () => setSidebarOpen(!sidebarOpen) }} />
      </main>

      {callState === 'ringing' && incomingCall && (
        <CallOverlay
          incomingCall={incomingCall}
          onAnswer={handleAnswer}
          onReject={rejectCall}
        />
      )}

      {(callState === 'calling' || callState === 'active') && activeCall && (
        <GroupCallRoom
          callState={callState}
          activeCall={activeCall}
          localStream={localStream}
          remoteParticipants={remoteParticipants}
          onEnd={endCall}
          localUser={user}
          isScreenSharing={isScreenSharing}
          remoteIsScreenSharing={remoteIsScreenSharing}
          onToggleScreenShare={toggleScreenShare}
          isCameraOff={isCameraOff}
          remoteCameraStates={remoteCameraStates}
          onToggleCamera={toggleCamera}
          minimized={callMinimized}
          onMinimize={() => setCallMinimized(true)}
          onMaximize={() => setCallMinimized(false)}
        />
      )}
    </div>
  )
}
