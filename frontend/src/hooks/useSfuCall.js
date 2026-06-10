import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket } from '../context/SocketContext'
import { getIceServers } from '../api/calls'

// useSfuCall owns the whole native-WebRTC lifecycle for one call: it grabs the
// local mic/camera, opens a single RTCPeerConnection to the server-side SFU
// (which forwards everyone's media), and exposes plain React state + imperative
// controls so the presentational GroupCallRoom stays focused on the UI.
//
// The SFU is always the OFFERER — this client only ever creates answers, so
// there is no glare. Signaling rides the app's existing WebSocket:
//   out: webrtc:join / webrtc:answer / webrtc:ice / webrtc:leave / call:signal
//   in:  webrtc:offer / webrtc:ice / call:roster / call:signal
//
// A "tile" is everything the UI needs to draw one participant:
//   { id, isLocal, name, avatarUrl, videoStream, audioStream, videoMuted, isDesktop }
//
// Each forwarded track carries the publisher's userID as its MediaStream id, so
// remote audio/video is grouped per participant and labelled from the roster.
const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }]
const MAX_RECOVER = 3 // peer rebuild attempts after an ICE failure before giving up

export function useSfuCall({ room, isVideo, localUser, onConnected, onError, onEnd }) {
  const { on, emit } = useSocket()

  const [status, setStatus] = useState('connecting') // connecting | connected | reconnecting | failed | disconnected
  const [tiles, setTiles] = useState([])
  const [speakingId, setSpeakingId] = useState(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(isVideo)
  const [screenSharing, setScreenSharing] = useState(false)

  const pcRef = useRef(null)
  const localStreamRef = useRef(null)        // raw getUserMedia stream
  const localVideoStreamRef = useRef(null)   // stable MediaStream for the local video tile
  const videoSenderRef = useRef(null)        // RTCRtpSender carrying the local camera/screen
  const screenTrackRef = useRef(null)
  // remotes: userID -> { videoStream, audioStream, camMuted }
  const remotesRef = useRef(new Map())
  const rosterRef = useRef(new Map())        // userID -> { name, avatar }
  const pendingCandidatesRef = useRef([])    // remote ICE buffered until remoteDescription is set
  const signalHandlerRef = useRef(null)
  const localStateRef = useRef({ isDesktop: false, camMuted: !isVideo })
  const wasConnectedRef = useRef(false)
  const micEnabledRef = useRef(micEnabled) // mirror for the rAF speaking loop
  const iceServersRef = useRef(FALLBACK_ICE)            // cached ICE config, reused across peer rebuilds
  const negotiationChainRef = useRef(Promise.resolve()) // serialises inbound SFU offers
  const recoverAttemptsRef = useRef(0)                  // ICE-failure rebuilds since the last connect
  const armedRef = useRef(false)                        // true once initial setup ran (reconnects allowed)
  const preShareCamEnabledRef = useRef(false)           // camera state captured before a screen-share
  const establishPeerRef = useRef(null)                 // current effect's establishPeer (for screen-share rebuilds)

  // Keep callbacks fresh without re-running the connection effect.
  const cbRef = useRef({ onConnected, onError, onEnd })
  useEffect(() => { cbRef.current = { onConnected, onError, onEnd } }, [onConnected, onError, onEnd])

  const emitRef = useRef(emit)
  useEffect(() => { emitRef.current = emit }, [emit])

  const nameFor = useCallback((userID) => {
    if (userID === localUser?.id) return localUser?.full_name || localUser?.email || 'You'
    return rosterRef.current.get(userID)?.name || 'Participant'
  }, [localUser])

  const avatarFor = useCallback((userID) => {
    if (userID === localUser?.id) return localUser?.avatar_url || null
    return rosterRef.current.get(userID)?.avatar || null
  }, [localUser])

  // Rebuild the tiles array from the mutable refs. Local participant first.
  const commit = useCallback(() => {
    const local = localStateRef.current
    const list = [{
      id: localUser?.id || 'local',
      isLocal: true,
      name: nameFor(localUser?.id),
      avatarUrl: avatarFor(localUser?.id),
      videoStream: localVideoStreamRef.current,
      audioStream: null, // never play back local audio (echo)
      videoMuted: local.camMuted,
      isDesktop: local.isDesktop,
    }]
    remotesRef.current.forEach((r, id) => {
      const hasVideo = r.videoStream && r.videoStream.getVideoTracks().length > 0
      list.push({
        id,
        isLocal: false,
        name: nameFor(id),
        avatarUrl: avatarFor(id),
        videoStream: hasVideo ? r.videoStream : null,
        audioStream: r.audioStream,
        videoMuted: r.camMuted || !hasVideo,
        isDesktop: false,
      })
    })
    setTiles(list)
  }, [localUser, nameFor, avatarFor])

  const getRemote = (userID) => {
    let r = remotesRef.current.get(userID)
    if (!r) {
      r = { videoStream: null, audioStream: null, camMuted: false }
      remotesRef.current.set(userID, r)
    }
    return r
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return
    let disposed = false

    const flushCandidates = async (pc) => {
      const pending = pendingCandidatesRef.current
      pendingCandidatesRef.current = []
      for (const c of pending) {
        try { await pc.addIceCandidate(c) } catch { /* ignore late/duplicate */ }
      }
    }

    const handleRemoteTrack = (event) => {
      const stream = event.streams[0]
      const userID = stream?.id
      const track = event.track
      console.log('[sfu] remote track', { from: userID, kind: track.kind })
      if (!userID || userID === localUser?.id) return
      const remote = getRemote(userID)

      if (track.kind === 'video') {
        if (!remote.videoStream) remote.videoStream = new MediaStream()
        remote.videoStream.addTrack(track)
      } else {
        if (!remote.audioStream) remote.audioStream = new MediaStream()
        remote.audioStream.addTrack(track)
      }
      const refresh = () => {
        try {
          if (track.kind === 'video') remote.videoStream?.removeTrack(track)
          else remote.audioStream?.removeTrack(track)
        } catch { /* */ }
        // When a participant leaves, the SFU drops their forwarded tracks and
        // renegotiates, ending every track here. Once they have no media left,
        // remove their tile entirely (otherwise it lingers as a frozen avatar).
        const noVideo = !remote.videoStream || remote.videoStream.getTracks().length === 0
        const noAudio = !remote.audioStream || remote.audioStream.getTracks().length === 0
        if (noVideo && noAudio) remotesRef.current.delete(userID)
        commit()
      }
      track.onended = refresh
      stream.onremovetrack = (e) => { if (e.track === track) refresh() }
      commit()
    }

    // (Re)build the RTCPeerConnection and (re)join the SFU room. Called on initial
    // setup and again to recover the media path — a socket reconnect (the server
    // discards our SFU peer when the old socket drops) or a fatal ICE failure. The
    // local mic/camera stream is reused across rebuilds.
    const establishPeer = () => {
      const stream = localStreamRef.current
      if (disposed || !stream) return

      // Drop the previous peer and its per-connection negotiation/remote state.
      try { pcRef.current?.close() } catch { /* */ }
      remotesRef.current = new Map()
      pendingCandidatesRef.current = []
      negotiationChainRef.current = Promise.resolve()
      analysersRef.current = new Map()

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
      pcRef.current = pc
      videoSenderRef.current = null

      for (const track of stream.getTracks()) {
        const sender = pc.addTrack(track, stream)
        if (track.kind === 'video') videoSenderRef.current = sender
      }
      // Guarantee a video sender even on audio calls so screen-share / a late
      // camera can later replaceTrack without a client-driven renegotiation (the
      // SFU is the sole offerer). The empty sender publishes nothing until used.
      if (!videoSenderRef.current) {
        try { videoSenderRef.current = pc.addTransceiver('video', { direction: 'sendrecv' }).sender }
        catch { /* */ }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) emitRef.current('webrtc:ice', { room, candidate: e.candidate.toJSON() })
      }
      pc.ontrack = handleRemoteTrack
      pc.onconnectionstatechange = () => {
        if (disposed || pc !== pcRef.current) return // stale PC left over from a rebuild
        switch (pc.connectionState) {
          case 'connected':
            wasConnectedRef.current = true
            recoverAttemptsRef.current = 0
            setStatus('connected')
            cbRef.current.onConnected?.()
            break
          case 'disconnected':
            setStatus('reconnecting')
            break
          case 'failed':
            // Recover by rebuilding the peer (fresh ICE + a new server-side PC) a
            // few times before surfacing an error.
            if (recoverAttemptsRef.current < MAX_RECOVER) {
              recoverAttemptsRef.current += 1
              setStatus('reconnecting')
              establishPeer()
            } else {
              setStatus('failed')
              cbRef.current.onError?.('Call connection lost')
            }
            break
          case 'closed':
            if (wasConnectedRef.current && !disposed) { setStatus('disconnected'); cbRef.current.onEnd?.() }
            break
          default:
            break
        }
      }

      commit()
      // Join the SFU room — the server responds with an offer — and announce our
      // current camera state to whoever is already there.
      emitRef.current('webrtc:join', { room })
      emitRef.current('call:signal', { room, payload: { type: 'media_state', cam: !localStateRef.current.camMuted } })
    }

    const setup = async () => {
      // 1) ICE servers
      let iceServers = FALLBACK_ICE
      try {
        const fetched = await getIceServers()
        if (Array.isArray(fetched) && fetched.length) iceServers = fetched
      } catch { /* fall back to public STUN */ }
      if (disposed) return
      iceServersRef.current = iceServers

      // 2) Local media (fall back to audio-only if the camera is unavailable)
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo })
      } catch {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }) }
        catch (e) {
          if (!disposed) { cbRef.current.onError?.(e?.message || 'Could not access microphone/camera'); setStatus('failed') }
          return
        }
      }
      if (disposed) { stream.getTracks().forEach((t) => t.stop()); return }
      localStreamRef.current = stream
      localVideoStreamRef.current = new MediaStream(stream.getVideoTracks())
      localStateRef.current.camMuted = stream.getVideoTracks().length === 0
      setCameraEnabled(stream.getVideoTracks().length > 0)

      // 3) Open the peer + join, then arm reconnect handling.
      startSpeakingDetection()
      establishPeer()
      armedRef.current = true
    }

    // Expose the current closure's establishPeer so the screen-share controls can
    // rebuild the peer (the only reliable way to publish a new track to a sole-
    // offerer SFU). Cleared on teardown below.
    establishPeerRef.current = establishPeer

    // ── WebSocket signaling handlers ──
    // Inbound SFU offers are serialised through a promise chain so two offers
    // arriving close together can't run setRemoteDescription concurrently (which
    // throws) or answer out of order.
    const offOffer = on('webrtc:offer', (data) => {
      if (data?.room !== room) return
      negotiationChainRef.current = negotiationChainRef.current.then(async () => {
        const pc = pcRef.current
        if (!pc || disposed) return
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
          await flushCandidates(pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          emitRef.current('webrtc:answer', { room, sdp: answer.sdp })
        } catch (e) {
          console.error('handling SFU offer failed:', e)
        }
      }).catch(() => {})
    })

    const offIce = on('webrtc:ice', async (data) => {
      if (data?.room !== room || !data.candidate) return
      const pc = pcRef.current
      if (!pc) return
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(data.candidate) } catch { /* */ }
      } else {
        pendingCandidatesRef.current.push(data.candidate)
      }
    })

    const offRoster = on('call:roster', (data) => {
      if (data?.room !== room || !Array.isArray(data.participants)) return
      const map = new Map()
      data.participants.forEach((p) => map.set(p.id, { name: p.name, avatar: p.avatar }))
      rosterRef.current = map
      // A roster that grew means someone new joined — re-announce our camera
      // state so their tile renders correctly.
      emitRef.current('call:signal', { room, payload: { type: 'media_state', cam: !localStateRef.current.camMuted } })
      commit()
    })

    const offSignal = on('call:signal', (data) => {
      if (data?.room !== room) return
      const fromId = data.from
      const payload = data.payload || {}
      if (payload.type === 'media_state') {
        const remote = getRemote(fromId)
        remote.camMuted = payload.cam === false
        commit()
        return
      }
      // raise_hand / reaction → hand off to the UI's registered handler
      signalHandlerRef.current?.(fromId, nameFor(fromId), payload)
    })

    // On a socket reconnect the server has discarded our SFU peer (its session is
    // per-connection), so fully rebuild ours rather than re-joining onto a stale,
    // fingerprint-mismatched PeerConnection. Gated on armedRef so the initial
    // connection:established during setup doesn't trigger a double-join.
    const offReconnect = on('connection:established', () => {
      if (!disposed && armedRef.current) {
        setStatus('reconnecting')
        establishPeer()
      }
    })

    setup()

    return () => {
      disposed = true
      armedRef.current = false
      recoverAttemptsRef.current = 0
      establishPeerRef.current = null
      offOffer(); offIce(); offRoster(); offSignal(); offReconnect()
      emitRef.current('webrtc:leave', { room })
      stopSpeakingDetection()
      try { pcRef.current?.close() } catch { /* */ }
      pcRef.current = null
      localStreamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* */ } })
      try { screenTrackRef.current?.stop() } catch { /* */ }
      localStreamRef.current = null
      localVideoStreamRef.current = null
      videoSenderRef.current = null
      screenTrackRef.current = null
      remotesRef.current = new Map()
      rosterRef.current = new Map()
      pendingCandidatesRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  // ── Speaking detection (WebAudio RMS over each audio stream) ────────────────
  const audioCtxRef = useRef(null)
  const speakingRafRef = useRef(null)
  const analysersRef = useRef(new Map()) // id -> { analyser, data }

  const startSpeakingDetection = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    audioCtxRef.current = new AudioCtx()
    audioCtxRef.current.resume?.().catch(() => {})

    const ensureAnalyser = (id, stream) => {
      if (!stream || stream.getAudioTracks().length === 0) return
      if (analysersRef.current.has(id)) return
      try {
        const src = audioCtxRef.current.createMediaStreamSource(stream)
        const analyser = audioCtxRef.current.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        analysersRef.current.set(id, { analyser, data: new Uint8Array(analyser.frequencyBinCount) })
      } catch { /* */ }
    }

    const tick = () => {
      // Local mic
      ensureAnalyser(localUser?.id || 'local', localStreamRef.current)
      // Remotes
      remotesRef.current.forEach((r, id) => ensureAnalyser(id, r.audioStream))

      let loudest = null
      let max = 0
      analysersRef.current.forEach(({ analyser, data }, id) => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length
        // Local counts as speaking only when the mic is live.
        if (id === (localUser?.id || 'local') && !micEnabledRef.current) return
        if (avg > max) { max = avg; loudest = id }
      })
      setSpeakingId(max > 12 ? loudest : null)
      speakingRafRef.current = requestAnimationFrame(tick)
    }
    speakingRafRef.current = requestAnimationFrame(tick)
  }

  const stopSpeakingDetection = () => {
    if (speakingRafRef.current) cancelAnimationFrame(speakingRafRef.current)
    speakingRafRef.current = null
    analysersRef.current = new Map()
    try { audioCtxRef.current?.close() } catch { /* */ }
    audioCtxRef.current = null
  }

  useEffect(() => { micEnabledRef.current = micEnabled }, [micEnabled])

  // ── Controls ────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicEnabled(track.enabled)
  }, [])

  const toggleCamera = useCallback(async () => {
    if (localStateRef.current.isDesktop) return // can't toggle while screen-sharing
    const stream = localStreamRef.current
    const existing = stream?.getVideoTracks()[0]
    if (existing) {
      existing.enabled = !existing.enabled
      localStateRef.current.camMuted = !existing.enabled
      setCameraEnabled(existing.enabled)
      emitRef.current('call:signal', { room, payload: { type: 'media_state', cam: existing.enabled } })
      commit()
      return
    }
    // No camera track yet — typical of an audio call, or the camera was declined
    // at join / dropped after a screen-share. Acquire one now. A sole-offerer SFU
    // won't pick up a track attached after negotiation (replaceTrack onto the
    // spare sender leaves its m-line non-sending and the SFU never re-offers), so
    // we rebuild the peer with the camera present from join — the same path
    // screen-share takes. establishPeer re-announces cam:true to the room.
    if (!stream || !pcRef.current) return
    let track
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true })
      track = cam.getVideoTracks()[0]
    } catch {
      console.warn('camera unavailable')
      return
    }
    if (!track) return
    const oldVid = stream.getVideoTracks()[0]
    if (oldVid) { try { stream.removeTrack(oldVid); oldVid.stop() } catch { /* */ } }
    stream.addTrack(track)
    localVideoStreamRef.current = new MediaStream([track])
    localStateRef.current.camMuted = false
    setCameraEnabled(true)
    establishPeerRef.current?.()
    commit()
  }, [room, commit])

  // Publishing a new outbound track to a sole-offerer SFU is only reliable by
  // rebuilding the peer so the track is present at join (a client can't introduce
  // a track the SFU has no transceiver for, and the SFU never re-offers for one).
  // So screen-share start/stop swap the local video track, then re-establish.
  const stopScreenShare = useCallback(async () => {
    if (!localStateRef.current.isDesktop) return

    // Only bring the camera back if it was actually on before sharing started.
    let cameraTrack = null
    if (isVideo && preShareCamEnabledRef.current) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true })
        cameraTrack = cam.getVideoTracks()[0]
      } catch { cameraTrack = null }
    }
    try { screenTrackRef.current?.stop() } catch { /* */ }
    screenTrackRef.current = null

    // Swap the camera track (or nothing) into the local stream + preview.
    const oldVid = localStreamRef.current?.getVideoTracks()[0]
    if (oldVid) { try { localStreamRef.current.removeTrack(oldVid); oldVid.stop() } catch { /* */ } }
    if (cameraTrack && localStreamRef.current) localStreamRef.current.addTrack(cameraTrack)
    localVideoStreamRef.current = new MediaStream(cameraTrack ? [cameraTrack] : [])

    localStateRef.current.isDesktop = false
    localStateRef.current.camMuted = !cameraTrack
    setScreenSharing(false)
    setCameraEnabled(!!cameraTrack)
    // Rebuild so the SFU drops the screen track (or picks up the restored camera).
    // establishPeer re-announces our media state to the room on rejoin.
    establishPeerRef.current?.()
    commit()
  }, [isVideo, commit])

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) { stopScreenShare(); return }
    if (!localStreamRef.current) return
    // Remember whether the camera was live so stopScreenShare can restore it (or
    // leave it off) to match the pre-share state instead of force-enabling it.
    preShareCamEnabledRef.current = !localStateRef.current.camMuted
    let display
    try { display = await navigator.mediaDevices.getDisplayMedia({ video: true }) }
    catch { return } // user cancelled the picker
    const screenTrack = display.getVideoTracks()[0]
    if (!screenTrack) return
    screenTrackRef.current = screenTrack

    // Reflect the screen track in the local stream + preview, replacing any camera.
    const oldVid = localStreamRef.current.getVideoTracks()[0]
    if (oldVid && oldVid !== screenTrack) { try { localStreamRef.current.removeTrack(oldVid); oldVid.stop() } catch { /* */ } }
    localStreamRef.current.addTrack(screenTrack)
    localVideoStreamRef.current = new MediaStream([screenTrack])

    localStateRef.current.isDesktop = true
    localStateRef.current.camMuted = false
    setScreenSharing(true)
    setCameraEnabled(true)
    // Stop sharing when the browser's native "Stop sharing" is clicked.
    screenTrack.onended = () => stopScreenShare()
    // Rebuild the peer so the screen track is published from join — the only path
    // that gets a new track through a sole-offerer SFU. establishPeer re-announces
    // our media state (cam:true) to the room on rejoin.
    establishPeerRef.current?.()
    commit()
  }, [screenSharing, stopScreenShare, commit])

  // Broadcast a JSON signal (raise-hand / reaction) to all participants.
  const sendSignal = useCallback((payload) => {
    emitRef.current('call:signal', { room, payload })
  }, [room])

  const registerSignalHandler = useCallback((fn) => { signalHandlerRef.current = fn }, [])

  return {
    status,
    tiles,
    speakingId,
    localId: localUser?.id || 'local',
    micEnabled,
    cameraEnabled,
    screenSharing,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    sendSignal,
    registerSignalHandler,
  }
}
