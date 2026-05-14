import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  webRTCAvailable,
} from '../utils/webrtcShim'
import { useSocket } from '../context/SocketContext'

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }]

export function useWebRTC() {
  const { on, emit } = useSocket()
  const emitRef = useRef(emit)
  useEffect(() => {
    emitRef.current = emit
  }, [emit])

  const pcRef = useRef(null)
  const callIdRef = useRef(null)
  const incomingCallIdRef = useRef(null)
  const localStreamRef = useRef(null)

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [callState, setCallState] = useState('idle') // idle|calling|ringing|active
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)

  function buildPC(turnCredentials) {
    const iceServers = turnCredentials
      ? [
          {
            urls: turnCredentials.url,
            username: turnCredentials.username,
            credential: turnCredentials.credential,
          },
          ...STUN,
        ]
      : STUN

    const pc = new RTCPeerConnection({ iceServers })

    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0])
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        emitRef.current('call:ice-candidate', {
          call_id: callIdRef.current,
          candidate: e.candidate,
        })
      }
    }

    pcRef.current = pc
    return pc
  }

  async function getMedia(video) {
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: video
        ? { facingMode: 'user', width: 640, height: 480 }
        : false,
    })
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }

  const cleanup = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    callIdRef.current = null
    incomingCallIdRef.current = null
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setActiveCall(null)
    setIncomingCall(null)
    setCallState('idle')
  }, [])

  const initiateCall = useCallback(
    async (callId, conversationId, callType, turnCredentials) => {
      if (!webRTCAvailable) return
      callIdRef.current = callId
      const pc = buildPC(turnCredentials)
      const stream = await getMedia(callType === 'video')
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      })
      await pc.setLocalDescription(new RTCSessionDescription(offer))

      setActiveCall({ call_id: callId, conversation_id: conversationId, type: callType })
      setCallState('calling')

      emitRef.current('call:initiate', {
        conversation_id: conversationId,
        type: callType,
        call_id: callId,
        offer_sdp: offer.sdp,
      })

      return stream
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const answerCall = useCallback(
    async (callInfo, turnCredentials) => {
      if (!webRTCAvailable) return
      callIdRef.current = callInfo.call_id
      const pc = buildPC(turnCredentials)
      const stream = await getMedia(callInfo.type === 'video')
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: callInfo.offer_sdp })
      )
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(new RTCSessionDescription(answer))

      setActiveCall({
        call_id: callInfo.call_id,
        conversation_id: callInfo.conversation_id,
        type: callInfo.type,
      })
      setIncomingCall(null)
      setCallState('active')

      emitRef.current('call:answer', {
        call_id: callInfo.call_id,
        answer_sdp: answer.sdp,
      })

      return stream
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const rejectCall = useCallback((callId) => {
    emitRef.current('call:reject', { call_id: callId })
    setIncomingCall(null)
    setCallState('idle')
  }, [])

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      emitRef.current('call:end', { call_id: callIdRef.current })
    }
    cleanup()
  }, [cleanup])

  useEffect(() => {
    if (!webRTCAvailable) return
    const off1 = on('call:incoming', (data) => {
      incomingCallIdRef.current = data.call_id
      setIncomingCall(data)
      setCallState('ringing')
    })

    const off2 = on('call:answered', async (data) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: data.answer_sdp })
        )
        setCallState('active')
      }
    })

    const off3 = on('call:ice-candidate', async (data) => {
      if (pcRef.current && data.candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch {
          // stale candidate, ignore
        }
      }
    })

    const off4 = on('call:ended', cleanup)

    const off5 = on('call:rejected', (data) => {
      if (callIdRef.current === data.call_id) {
        cleanup()
      }
    })

    const off6 = on('call:timeout', (data) => {
      if (
        callIdRef.current === data.call_id ||
        incomingCallIdRef.current === data.call_id
      ) {
        cleanup()
      }
    })

    return () => {
      off1()
      off2()
      off3()
      off4()
      off5()
      off6()
    }
  }, [on, cleanup])

  return {
    callState,
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
  }
}
