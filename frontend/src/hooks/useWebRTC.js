import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { leaveCall } from '../api/calls'

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }]

const createDummyVideoTrack = () => {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    ctx.fillRect(0, 0, 1, 1)
    if (canvas.captureStream) {
      const stream = canvas.captureStream(1)
      const track = stream.getVideoTracks()[0]
      if (track) {
        track.enabled = false
        return track
      }
    }
  } catch (e) {
    console.warn('Could not create dummy video track', e)
  }
  return undefined
}

export function useWebRTC() {
  const { on, emit } = useSocket()
  const { user } = useAuth()
  const emitRef = useRef(emit)
  const myUserIdRef = useRef(user?.id)

  useEffect(() => { emitRef.current = emit }, [emit])
  useEffect(() => { myUserIdRef.current = user?.id }, [user])

  // pcsRef: Map<peerId, RTCPeerConnection> for participants whose identity is known
  const pcsRef = useRef(new Map())
  // pendingPcRef: the caller's initial PC before we know who answered
  const pendingPcRef = useRef(null)
  // pendingStreamRef: remote stream received on the pending PC before call:answered arrives
  const pendingStreamRef = useRef(null)

  const callIdRef = useRef(null)
  const incomingCallIdRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const turnCredentialsRef = useRef(null)

  const [localStream, setLocalStream] = useState(null)
  // remoteParticipants: Map<peerId, { user: {id, full_name, avatar_url} | null, stream: MediaStream | null }>
  const [remoteParticipants, setRemoteParticipants] = useState(new Map())
  const [callState, setCallState] = useState('idle')
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [remoteCameraStates, setRemoteCameraStates] = useState(new Map())

  function buildIceServers(turnCredentials) {
    const iceServers = [...STUN]
    if (turnCredentials?.url) {
      iceServers.unshift({
        urls: turnCredentials.url,
        username: turnCredentials.username,
        credential: turnCredentials.credential,
      })
    }
    return iceServers
  }

  // Create a PC for a known peer (their userId is the key)
  function buildPCForPeer(peerId, turnCredentials) {
    if (pcsRef.current.has(peerId)) {
      pcsRef.current.get(peerId).close()
    }

    const pc = new RTCPeerConnection({ iceServers: buildIceServers(turnCredentials) })
    pcsRef.current.set(peerId, pc)

    // One stream per peer — accumulate every track into it.
    // Never replace the whole stream on each ontrack: if the dummy-video transceiver
    // arrives with a different stream ID (or no stream), the fallback
    // `new MediaStream([e.track])` would create a video-only stream and overwrite
    // the audio stream, silencing the remote participant.
    const remoteStream = new MediaStream()

    pc.ontrack = (e) => {
      if (!remoteStream.getTrackById(e.track.id)) {
        remoteStream.addTrack(e.track)
      }
      setRemoteParticipants((prev) => {
        const next = new Map(prev)
        const existing = next.get(peerId) ?? { user: null, stream: null }
        next.set(peerId, { ...existing, stream: remoteStream })
        return next
      })
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        emitRef.current('call:ice-candidate', {
          call_id: callIdRef.current,
          target_user_id: peerId,
          candidate: e.candidate,
        })
      }
    }

    return pc
  }

  // Create the caller's initial PC before we know who will answer
  function buildPendingPC(turnCredentials) {
    pendingPcRef.current?.close()

    const pc = new RTCPeerConnection({ iceServers: buildIceServers(turnCredentials) })
    pendingPcRef.current = pc

    // Same single-stream accumulation as buildPCForPeer — prevents the dummy-video
    // ontrack from overwriting pendingStreamRef with a video-only MediaStream.
    const pendingRemoteStream = new MediaStream()
    pendingStreamRef.current = pendingRemoteStream

    pc.ontrack = (e) => {
      if (!pendingRemoteStream.getTrackById(e.track.id)) {
        pendingRemoteStream.addTrack(e.track)
      }
      // pendingStreamRef.current is already pointing at pendingRemoteStream
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        // No target_user_id yet; backend broadcasts to all call participants
        emitRef.current('call:ice-candidate', {
          call_id: callIdRef.current,
          candidate: e.candidate,
        })
      }
    }

    return pc
  }

  async function getMedia(video) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices not supported (requires HTTPS or localhost)')
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video })
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      if (err.name === 'NotAllowedError') throw new Error('Camera/Microphone permission denied')
      if (err.name === 'NotFoundError') throw new Error('No Camera/Microphone found on this device')
      throw new Error('Failed to access Camera/Microphone: ' + err.message)
    }
  }

  const toggleScreenShare = useCallback(async () => {
    const stream = localStreamRef.current
    if (!stream) return

    const allPCs = [
      ...pcsRef.current.values(),
      ...(pendingPcRef.current ? [pendingPcRef.current] : []),
    ]

    // Use getTransceivers() to locate the video sender reliably.
    // getSenders().find(s => s.track?.kind === 'video') misses audio-only calls where
    // the dummy video transceiver was added via addTransceiver('video') — its sender.track
    // starts as null, so the kind check returns undefined, never 'video'.
    function getVideoSender(pc) {
      const t = pc.getTransceivers().find((tr) => tr.receiver?.track?.kind === 'video')
      return t?.sender ?? null
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null

      // Restore camera video track (null for voice-only calls → stops sending video)
      const cameraVideoTrack = stream.getVideoTracks()[0] ?? null
      allPCs.forEach((pc) => {
        const sender = getVideoSender(pc)
        if (sender) sender.replaceTrack(cameraVideoTrack)
      })

      if (callIdRef.current) {
        emitRef.current('call:screen-share', { call_id: callIdRef.current, is_sharing: false })
      }
      setIsScreenSharing(false)
    } else {
      try {
        // audio:false ensures the mic audio sender is never replaced during screen share
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        screenStreamRef.current = screenStream

        const videoTrack = screenStream.getVideoTracks()[0]
        if (videoTrack) {
          allPCs.forEach((pc) => {
            const sender = getVideoSender(pc)
            if (sender) sender.replaceTrack(videoTrack)
          })
          videoTrack.onended = () => {
            if (screenStreamRef.current) toggleScreenShare()
          }
        }

        if (callIdRef.current) {
          emitRef.current('call:screen-share', { call_id: callIdRef.current, is_sharing: true })
        }
        // localStream intentionally NOT changed — keeps mic/camera controls working
        setIsScreenSharing(true)
      } catch {
        // user cancelled
      }
    }
  }, [])

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current
    const newCameraOff = !isCameraOff

    function getVideoSender(pc) {
      const t = pc.getTransceivers().find((tr) => tr.receiver?.track?.kind === 'video')
      return t?.sender ?? null
    }

    const allPCs = [
      ...pcsRef.current.values(),
      ...(pendingPcRef.current ? [pendingPcRef.current] : []),
    ]

    if (!stream) {
      setIsCameraOff(newCameraOff)
      return
    }

    if (newCameraOff) {
      // Stop video tracks to release the camera hardware (not just disable)
      stream.getVideoTracks().forEach((t) => {
        t.stop()
        stream.removeTrack(t)
      })
      // Replace sender with a dummy so the video transceiver stays alive
      allPCs.forEach((pc) => {
        const sender = getVideoSender(pc)
        if (sender) {
          const dummy = createDummyVideoTrack()
          sender.replaceTrack(dummy ?? null)
        }
      })
    } else {
      // Acquire camera and replace sender track
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = camStream.getVideoTracks()[0]
        if (videoTrack) {
          stream.addTrack(videoTrack)
          allPCs.forEach((pc) => {
            const sender = getVideoSender(pc)
            if (sender) sender.replaceTrack(videoTrack)
          })
        }
      } catch {
        return
      }
    }

    setIsCameraOff(newCameraOff)
    if (callIdRef.current) {
      emitRef.current('call:camera-toggle', {
        call_id: callIdRef.current,
        camera_on: !newCameraOff,
      })
    }
  }, [isCameraOff])

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close())
    pcsRef.current.clear()
    pendingPcRef.current?.close()
    pendingPcRef.current = null
    pendingStreamRef.current = null
    callIdRef.current = null
    incomingCallIdRef.current = null
    turnCredentialsRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    setLocalStream(null)
    setRemoteParticipants(new Map())
    setActiveCall(null)
    setIncomingCall(null)
    setCallState('idle')
    setIsScreenSharing(false)
    setRemoteIsScreenSharing(false)
    setIsCameraOff(false)
    setRemoteCameraStates(new Map())
  }, [])

  const initiateCall = useCallback(async (callId, conversationId, callType, turnCredentials) => {
    callIdRef.current = callId
    turnCredentialsRef.current = turnCredentials

    const pc = buildPendingPC(turnCredentials)
    const stream = await getMedia(callType === 'video')
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    if (callType === 'audio') {
      const dummyTrack = createDummyVideoTrack()
      pc.addTransceiver(dummyTrack || 'video', { direction: 'sendrecv', streams: [stream] })
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    setActiveCall({ call_id: callId, conversation_id: conversationId, type: callType })
    setCallState('calling')
    setIsCameraOff(callType === 'audio')

    emitRef.current('call:initiate', {
      conversation_id: conversationId,
      type: callType,
      call_id: callId,
      offer_sdp: offer.sdp,
    })

    return stream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const answerCall = useCallback(async (callInfo, turnCredentials) => {
    const callerId = callInfo.caller.id
    callIdRef.current = callInfo.call_id
    turnCredentialsRef.current = turnCredentials

    const pc = buildPCForPeer(callerId, turnCredentials)
    const stream = await getMedia(callInfo.type === 'video')
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    if (callInfo.offer_sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: callInfo.offer_sdp })

      if (callInfo.type === 'audio') {
        const transceivers = pc.getTransceivers()
        const videoT = transceivers.find((t) => t.receiver?.track?.kind === 'video')
        if (videoT) {
          videoT.direction = 'sendrecv'
          const dummyTrack = createDummyVideoTrack()
          if (dummyTrack) videoT.sender.replaceTrack(dummyTrack)
        }
      }

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      emitRef.current('call:answer', {
        call_id: callInfo.call_id,
        answer_sdp: answer.sdp,
      })
    } else {
      // It's an invitation to an ongoing call without a specific offer
      // We just join and wait for others to offer to us
      emitRef.current('call:join', {
        call_id: callInfo.call_id,
      })
    }

    setRemoteParticipants((prev) => {
      const next = new Map(prev)
      next.set(callerId, { user: callInfo.caller, stream: null })
      return next
    })

    setActiveCall({
      call_id: callInfo.call_id,
      conversation_id: callInfo.conversation_id,
      type: callInfo.type,
    })
    setIncomingCall(null)
    setCallState('active')
    setIsCameraOff(callInfo.type === 'audio')

    return stream
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rejectCall = useCallback((callId) => {
    emitRef.current('call:reject', { call_id: callId })
    setIncomingCall(null)
    setCallState('idle')
  }, [])

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      leaveCall(callIdRef.current).catch(() => {})
    }
    cleanup()
  }, [cleanup])

  useEffect(() => {
    const off1 = on('call:incoming', (data) => {
      incomingCallIdRef.current = data.call_id
      setIncomingCall(data)
      setCallState('ringing')
    })

    const off2 = on('call:answered', async (data) => {
      const pc = pendingPcRef.current
      if (!pc) return

      await pc.setRemoteDescription({ type: 'answer', sdp: data.answer_sdp })
      setCallState('active')

      const answererId = data.user_id

      // Grab the accumulated stream before clearing pendingStreamRef.
      const pendingStream = pendingStreamRef.current ?? new MediaStream()
      pendingStreamRef.current = null

      // Rewire ontrack to add late-arriving tracks into the SAME accumulated stream.
      // Using the same object means the <audio>/<video> srcObject never needs to change.
      pc.ontrack = (e) => {
        if (!pendingStream.getTrackById(e.track.id)) {
          pendingStream.addTrack(e.track)
        }
        setRemoteParticipants((prev) => {
          const next = new Map(prev)
          const existing = next.get(answererId) ?? { user: null, stream: null }
          next.set(answererId, { ...existing, stream: pendingStream })
          return next
        })
      }

      pcsRef.current.set(answererId, pc)
      pendingPcRef.current = null

      setRemoteParticipants((prev) => {
        const next = new Map(prev)
        next.set(answererId, {
          user: data.user ?? { id: answererId, full_name: null, avatar_url: null },
          stream: pendingStream,
        })
        return next
      })
    })

    const off3 = on('call:ice-candidate', async (data) => {
      const fromUserId = data.user_id

      let pc = fromUserId ? pcsRef.current.get(fromUserId) : null
      if (!pc) pc = pendingPcRef.current

      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate)
        } catch {
          // stale candidate, ignore
        }
      }
    })

    const off4 = on('call:ended', cleanup)

    const off5 = on('call:timeout', (data) => {
      const isCaller = callIdRef.current === data.call_id
      const isCallee = incomingCallIdRef.current === data.call_id
      if (isCaller || isCallee) {
        toast.error(isCaller ? 'No answer — call ended' : 'Missed call')
        cleanup()
      }
    })

    const off11 = on('call:rejected', (data) => {
      if (callIdRef.current === data.call_id) {
        toast.error('Call was declined')
        cleanup()
      }
    })

    const off6 = on('call:screen-share', (data) => {
      setRemoteIsScreenSharing(data.is_sharing)
    })

    const off13 = on('call:camera-toggle', (data) => {
      setRemoteCameraStates((prev) => {
        const next = new Map(prev)
        next.set(data.user_id, !data.camera_on)
        return next
      })
    })

    // A new participant has joined the ongoing call — existing participants create offers to them
    const off7 = on('call:participant_joined', async (data) => {
      const { user_id, user } = data
      if (!user_id || user_id === myUserIdRef.current) return
      if (!callIdRef.current || !localStreamRef.current) return

      // Skip if a live connection already exists (e.g. initiator already connected
      // to the first answerer via pendingPcRef before this event arrives).
      const existingPc = pcsRef.current.get(user_id)
      if (existingPc && existingPc.connectionState !== 'closed' && existingPc.connectionState !== 'failed') return

      const pc = buildPCForPeer(user_id, turnCredentialsRef.current)

      setRemoteParticipants((prev) => {
        const next = new Map(prev)
        next.set(user_id, { user: user ?? { id: user_id, full_name: null, avatar_url: null }, stream: null })
        return next
      })

      const localStream = localStreamRef.current
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      emitRef.current('call:peer_offer', {
        call_id: callIdRef.current,
        target_user_id: user_id,
        offer_sdp: offer.sdp,
      })
    })

    // A peer is offering a direct connection (mesh) — create answer
    const off8 = on('call:peer_offer', async (data) => {
      const { call_id, from_user_id, from_user, offer_sdp } = data
      if (!callIdRef.current || callIdRef.current !== call_id) return
      if (!localStreamRef.current) return

      const pc = buildPCForPeer(from_user_id, turnCredentialsRef.current)

      setRemoteParticipants((prev) => {
        const next = new Map(prev)
        next.set(from_user_id, {
          user: from_user ?? { id: from_user_id, full_name: null, avatar_url: null },
          stream: null,
        })
        return next
      })

      const localStream = localStreamRef.current
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

      await pc.setRemoteDescription({ type: 'offer', sdp: offer_sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      emitRef.current('call:peer_answer', {
        call_id: callIdRef.current,
        target_user_id: from_user_id,
        answer_sdp: answer.sdp,
      })
    })

    // Our peer offer was answered — complete the connection
    const off9 = on('call:peer_answer', async (data) => {
      const { from_user_id, answer_sdp } = data
      const pc = pcsRef.current.get(from_user_id)
      if (!pc) return
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: answer_sdp })
      } catch {
        // ignore
      }
    })

    const off10 = on('call:updated', (data) => {
      setActiveCall((prev) => {
        if (prev?.call_id === data.call_id) {
          return { ...prev, conversation_id: data.conversation_id }
        }
        return prev
      })
    })

    const off12 = on('call:participant_left', (data) => {
      const { user_id } = data
      const pc = pcsRef.current.get(user_id)
      if (pc) {
        pc.close()
        pcsRef.current.delete(user_id)
      }
      setRemoteParticipants((prev) => {
        const next = new Map(prev)
        next.delete(user_id)
        return next
      })
    })

    return () => {
      off1(); off2(); off3(); off4(); off5(); off6(); off7(); off8(); off9(); off10(); off11(); off12(); off13()
    }
  }, [on, cleanup])

  return {
    callState,
    activeCall,
    incomingCall,
    localStream,
    remoteParticipants,
    isScreenSharing,
    remoteIsScreenSharing,
    isCameraOff,
    remoteCameraStates,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    toggleScreenShare,
    toggleCamera,
  }
}
