// react-native-webrtc requires a native dev build; Expo Go doesn't include it.
// This shim catches the module-init error so the rest of the app still loads.
let RTCPeerConnection = null
let RTCIceCandidate = null
let RTCSessionDescription = null
let mediaDevices = null
let RTCView = null
export let webRTCAvailable = false

try {
  const webrtc = require('react-native-webrtc')
  RTCPeerConnection = webrtc.RTCPeerConnection
  RTCIceCandidate = webrtc.RTCIceCandidate
  RTCSessionDescription = webrtc.RTCSessionDescription
  mediaDevices = webrtc.mediaDevices
  RTCView = webrtc.RTCView
  webRTCAvailable = true
} catch {
  // Native module not linked — running in Expo Go
}

export { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, RTCView }
