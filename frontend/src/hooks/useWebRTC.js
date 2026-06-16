import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSocket } from '../context/SocketContext'
import { leaveCall } from '../api/calls'

export function useWebRTC() {
  const { on, emit } = useSocket()
  const emitRef = useRef(emit)
  useEffect(() => { emitRef.current = emit }, [emit])

  const callIdRef = useRef(null)
  const incomingCallIdRef = useRef(null)
  // mirrors incomingCall state so event-handler closures can read it without stale captures
  const incomingCallDataRef = useRef(null)
  // client-side fallback timer — fires at 35 s if the backend call:timeout never arrives
  const ringTimerRef = useRef(null)
  // ringtone Web Audio state
  const ringCtxRef = useRef(null)
  const ringIntervalRef = useRef(null)

  const [callState, setCallState] = useState('idle')
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [missedCalls, setMissedCalls] = useState([])
  const [waitingRoom, setWaitingRoom] = useState(false) // true when in waiting room

  // mirrors activeCall so event-handler closures can read it without stale captures
  const activeCallRef = useRef(null)
  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])

  const addMissedCall = useCallback((call) => {
    setMissedCalls(prev =>
      prev.some(c => c.call_id === call.call_id)
        ? prev.map(c => c.call_id === call.call_id ? { ...c, ...call } : c)
        : [...prev, call]
    )
  }, [])

  const dismissMissedCall = useCallback((callId) => {
    setMissedCalls(prev => prev.filter(c => c.call_id !== callId))
  }, [])

  const stopRingtone = useCallback(() => {
    clearInterval(ringIntervalRef.current)
    ringIntervalRef.current = null
    try { ringCtxRef.current?.close() } catch {}
    ringCtxRef.current = null
  }, [])

  const startRingtone = useCallback(() => {
    if (localStorage.getItem('sound_enabled') === 'false') return
    stopRingtone()
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ringCtxRef.current = ctx
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const playRingCycle = () => {
        const t = ctx.currentTime
        ;[[0, 480], [0.45, 440]].forEach(([dt, freq]) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0, t + dt)
          gain.gain.linearRampToValueAtTime(0.3, t + dt + 0.02)
          gain.gain.setValueAtTime(0.3, t + dt + 0.38)
          gain.gain.linearRampToValueAtTime(0, t + dt + 0.4)
          osc.start(t + dt)
          osc.stop(t + dt + 0.4)
        })
      }
      playRingCycle()
      ringIntervalRef.current = setInterval(playRingCycle, 2800)
    } catch {}
  }, [stopRingtone])

  const cleanup = useCallback(() => {
    stopRingtone()
    clearTimeout(ringTimerRef.current)
    ringTimerRef.current = null
    callIdRef.current = null
    incomingCallIdRef.current = null
    incomingCallDataRef.current = null
    setActiveCall(null)
    setIncomingCall(null)
    setCallState('idle')
    setWaitingRoom(false)
  }, [stopRingtone])

  // Called after POST /api/calls/initiate returns.
  // The REST handler now takes care of notifying other members and starting
  // the 30-second timeout, so no WebSocket emit is needed here.
  const initiateCall = useCallback((callId, conversationId, callType, room, conversationType, initiatedBy) => {
    callIdRef.current = callId
    setActiveCall({
      call_id: callId,
      conversation_id: conversationId,
      type: callType,
      room,
      conversation_type: conversationType,
      initiated_by: initiatedBy,
    })
    setCallState('calling')
  }, [])

  // Called after POST /api/calls/:id/join returns with token.
  // If the call has waiting room enabled the backend returns an empty token —
  // in that case we stay in a "waiting" state until call:admitted arrives.
  const answerCall = useCallback((callInfo) => {
    stopRingtone()
    clearTimeout(ringTimerRef.current)
    ringTimerRef.current = null
    const callId = callInfo.call_id
    callIdRef.current = callId

    const initiatedBy = incomingCallDataRef.current?.caller?.id

    // The user has accepted, so this is no longer a pending incoming ring.
    // Clear the incoming refs; otherwise a later call:ended for this same call
    // is misread as an unanswered incoming call and shown as a "missed call".
    incomingCallIdRef.current = null
    incomingCallDataRef.current = null

    if (!callInfo.room) {
      // Placed in waiting room — record enough info to restore later
      setActiveCall({
        call_id: callId,
        conversation_id: callInfo.conversation_id,
        type: callInfo.type,
        room: null,
        conversation_type: callInfo.conversation_type,
        initiated_by: initiatedBy,
      })
      setIncomingCall(null)
      setCallState('calling')
      setWaitingRoom(true)
      toast('Waiting to be admitted…', { icon: '🚪', duration: 4000 })
      return
    }

    setActiveCall({
      call_id: callId,
      conversation_id: callInfo.conversation_id,
      type: callInfo.type,
      room: callInfo.room,
      conversation_type: callInfo.conversation_type,
      initiated_by: initiatedBy,
    })
    setIncomingCall(null)
    setCallState('active')
  }, [stopRingtone])

  const rejectCall = useCallback((callId) => {
    stopRingtone()
    clearTimeout(ringTimerRef.current)
    ringTimerRef.current = null
    incomingCallIdRef.current = null
    incomingCallDataRef.current = null
    emitRef.current('call:reject', { call_id: callId })
    setIncomingCall(null)
    setCallState('idle')
  }, [stopRingtone])

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      leaveCall(callIdRef.current).catch(() => {})
    }
    cleanup()
  }, [cleanup])

  useEffect(() => {
    const off1 = on('call:incoming', (data) => {
      if (!data?.call_id || !data?.caller) {
        console.error('call:incoming: invalid event payload', data)
        return
      }
      // Already in a call (active, ringing, or waiting): a new incoming/invite
      // ring must NOT tear down the current call. Record it as a missed call so
      // the user can call back instead of hijacking their callState.
      if (callIdRef.current && callIdRef.current !== data.call_id) {
        const isOngoing = !!data.is_invite || data.conversation_type === 'group'
        addMissedCall({
          ...data,
          room: data.room ?? 'call-' + data.call_id,
          isOngoing,
          timestamp: new Date().toISOString(),
        })
        return
      }
      incomingCallIdRef.current = data.call_id
      const callData = { ...data, room: data.room ?? 'call-' + data.call_id }
      incomingCallDataRef.current = callData
      setIncomingCall(callData)
      setCallState('ringing')
      startRingtone()

      // Client-side fallback: dismiss the ring at 35 s in case the backend
      // call:timeout / call:ended event is never received (e.g. WS drop/reconnect).
      clearTimeout(ringTimerRef.current)
      ringTimerRef.current = setTimeout(() => {
        if (incomingCallIdRef.current === data.call_id) {
          addMissedCall({ ...callData, isOngoing: false, timestamp: new Date().toISOString() })
          cleanup()
        }
      }, 35000)
    })

    const off2 = on('call:participant_joined', (data) => {
      if (!data?.call_id || data.call_id !== callIdRef.current) return
      setCallState('active')
    })

    const off3 = on('call:ended', (data) => {
      if (!data?.call_id) return
      const isActiveCall = callIdRef.current === data.call_id
      const isIncomingCall = incomingCallIdRef.current === data.call_id
      // Guard: only clean up call state for the call we're actually tracking.
      // A foreign call:ended (e.g. for a call we were invited to but never joined,
      // or a stale event that arrived after a WebSocket reconnect) must never
      // destroy an unrelated active or ringing call.
      if (!isActiveCall && !isIncomingCall) {
        setMissedCalls(prev => prev.map(c =>
          c.call_id === data.call_id && c.isOngoing ? { ...c, isOngoing: false } : c
        ))
        return
      }
      const savedIncoming = incomingCallDataRef.current
      if (isIncomingCall && savedIncoming) {
        addMissedCall({ ...savedIncoming, isOngoing: false, timestamp: new Date().toISOString() })
      } else {
        setMissedCalls(prev => prev.map(c =>
          c.call_id === data.call_id && c.isOngoing ? { ...c, isOngoing: false } : c
        ))
      }
      cleanup()
    })

    const off4 = on('call:timeout', (data) => {
      if (!data?.call_id) return
      const isCaller = callIdRef.current === data.call_id
      const isCallee = incomingCallIdRef.current === data.call_id
      if (!isCaller && !isCallee) return

      if (data.is_ongoing) {
        // Group call — initiator stays in call, just toast them
        if (isCaller) toast('No one answered yet', { icon: '📞' })
      } else {
        // Direct call timeout — callee shows missed call popup; caller toasts
        if (isCallee && incomingCallDataRef.current) {
          addMissedCall({ ...incomingCallDataRef.current, isOngoing: false, timestamp: new Date().toISOString() })
        } else {
          toast.error(isCaller ? 'No answer — call ended' : 'Missed call')
        }
        cleanup()
      }
    })

    const off5 = on('call:rejected', (data) => {
      if (!data?.call_id) return
      if (callIdRef.current === data.call_id) {
        // In a group call a single decline must not tear down the call for
        // everyone else — the backend keeps the call alive while joined
        // participants remain. Only end the UI for a 1:1 (direct) call.
        if (activeCallRef.current?.conversation_type === 'group') {
          toast('A participant declined the call', { icon: '🚫' })
          return
        }
        toast.error('Call was declined')
        cleanup()
      }
    })

    // Group call: ring window expired but call is still ongoing — show popup with Join Now
    const off7 = on('call:missed_ring', (data) => {
      if (!data?.call_id) return
      if (incomingCallIdRef.current === data.call_id || !incomingCallIdRef.current) {
        addMissedCall({ ...data, isOngoing: true, timestamp: new Date().toISOString() })
        // Only clear ringing state if we were actually ringing for THIS call.
        // If incomingCallIdRef is null the user might be in a separate active call —
        // touching callState in that case would tear down the unrelated call.
        if (incomingCallIdRef.current === data.call_id) {
          incomingCallIdRef.current = null
          incomingCallDataRef.current = null
          setIncomingCall(null)
          setCallState('idle')
        }
      }
    })

    const off6c = on('call:participant_left', (data) => {
      if (!data?.call_id) return
      if (callIdRef.current === data.call_id) {
        const name = data.user?.full_name || 'A participant'
        toast(`${name} left the call`, { icon: '👋', duration: 3000 })
      }
    })

    const off6 = on('call:updated', (data) => {
      if (!data?.call_id) return
      setActiveCall((prev) => {
        if (prev?.call_id === data.call_id) {
          const next = { ...prev }
          if (data.conversation_id) next.conversation_id = data.conversation_id
          // host may have been reassigned (e.g. the original host left a group call)
          if (data.initiated_by) next.initiated_by = data.initiated_by
          return next
        }
        return prev
      })
    })

    // Waiting room: host admitted us — receive the token and enter the call
    const off8 = on('call:admitted', (data) => {
      if (!data?.call_id || !data?.room) {
        console.error('call:admitted: invalid event payload', data)
        return
      }
      clearTimeout(ringTimerRef.current)
      ringTimerRef.current = null
      setWaitingRoom(false)
      const callId = data.call_id
      callIdRef.current = callId
      setActiveCall((prev) => ({
        ...prev,
        call_id: callId,
        room: data.room,
      }))
      setIncomingCall(null)
      setCallState('active')
      toast.success('You have been admitted to the call')
    })

    const off9 = on('call:rejected_from_waiting', (data) => {
      if (!data?.call_id) return
      if (callIdRef.current === data.call_id || incomingCallIdRef.current === data.call_id) {
        toast.error('Your request to join was declined')
        cleanup()
      }
    })

    // When the WebSocket reconnects the server resets the user's status to
    // "online". If we're mid-call we need to restore the "busy" flag so
    // presence reflects the call correctly.
    const offReconnect = on('connection:established', () => {
      if (callIdRef.current) {
        emitRef.current('user:status', { status: 'busy' })
      }
    })

    return () => {
      off1(); off2(); off3(); off4(); off5(); off6c(); off6(); off7(); off8(); off9(); offReconnect()
      cleanup()
    }
  }, [on, cleanup, addMissedCall, startRingtone])

  return {
    callState,
    activeCall,
    incomingCall,
    missedCalls,
    waitingRoom,
    dismissMissedCall,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
  }
}
