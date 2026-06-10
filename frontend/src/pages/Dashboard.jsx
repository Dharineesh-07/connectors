import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import CallOverlay from '../components/CallOverlay'
import GroupCallRoom from '../components/GroupCallRoom'
import MissedCallPopup from '../components/MissedCallPopup'
import ChatPopupContainer from '../components/ChatPopupContainer'
import { ChatPopupProvider } from '../context/ChatPopupContext'
import { useCall } from '../context/CallContext'
import { useAuth } from '../context/AuthContext'
import { joinCall } from '../api/calls'
import { useNotifications } from '../hooks/useNotifications'

export default function Dashboard() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useNotifications()

  const { callState, incomingCall, activeCall, missedCalls, waitingRoom, dismissMissedCall, answerCall, rejectCall, endCall } = useCall()

  const handleAnswer = async (callInfo) => {
    try {
      const data = await joinCall(callInfo.call_id)
      answerCall({ ...callInfo, room: data.room })
    } catch {
      toast.error('Could not answer call')
    }
  }

  const handleJoinMissedCall = async (call) => {
    try {
      const data = await joinCall(call.call_id)
      answerCall({
        call_id: call.call_id,
        conversation_id: call.conversation_id,
        type: call.type,
        room: data.room,
        conversation_type: call.conversation_type,
      })
      dismissMissedCall(call.call_id)
    } catch {
      toast.error('The call has already ended')
      dismissMissedCall(call.call_id)
    }
  }

  return (
    <ChatPopupProvider>
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-all animate-cn-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        <Outlet context={{ onToggleSidebar: () => setSidebarOpen(!sidebarOpen) }} />
      </main>

      {(callState === 'active' || (callState === 'calling' && !waitingRoom)) && activeCall && activeCall.room && (
        <GroupCallRoom
          activeCall={activeCall}
          onEnd={endCall}
          localUser={user}
        />
      )}

      {waitingRoom && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10,6,22,0.88)', backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{
            background: 'linear-gradient(145deg, #13082a, #0d1525)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: 16, padding: '40px 48px', textAlign: 'center',
            boxShadow: '0 16px 64px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚪</div>
            <p style={{ color: '#fbbf24', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
              Waiting to be admitted
            </p>
            <p style={{ color: '#7c6fa0', fontSize: 13, marginBottom: 24 }}>
              The host will let you in shortly
            </p>
            <button
              onClick={endCall}
              style={{
                background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)',
                color: '#fca5a5', borderRadius: 8, padding: '8px 20px',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}
            >Leave</button>
          </div>
        </div>
      )}

      {callState === 'ringing' && incomingCall && (
        <CallOverlay
          incomingCall={incomingCall}
          onAnswer={handleAnswer}
          onReject={rejectCall}
        />
      )}

      {missedCalls.length > 0 && (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-2">
          {missedCalls.map((call) => (
            <MissedCallPopup
              key={call.call_id}
              missedCall={call}
              onDismiss={() => dismissMissedCall(call.call_id)}
              onJoin={() => handleJoinMissedCall(call)}
            />
          ))}
        </div>
      )}

      <ChatPopupContainer />
    </div>
    </ChatPopupProvider>
  )
}
