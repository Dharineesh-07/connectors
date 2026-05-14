import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { RTCView } from '../utils/webrtcShim'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { joinCall } from '../api/calls'
import { useCall } from '../context/CallContext'
import UserAvatar from '../components/UserAvatar'
import { Colors } from '../theme/colors'

export default function CallScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const {
    callState,
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    answerCall,
    rejectCall,
    endCall,
  } = useCall()
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (callState === 'idle') {
      navigation.goBack()
    }
  }, [callState, navigation])

  const handleAnswer = async () => {
    try {
      const data = await joinCall(incomingCall.call_id)
      await answerCall(incomingCall, data.turn_credentials)
    } catch {
      Toast.show({ type: 'error', text1: 'Could not answer call' })
      navigation.goBack()
    }
  }

  const handleReject = () => {
    rejectCall(incomingCall.call_id)
    navigation.goBack()
  }

  const handleEnd = () => {
    endCall()
    navigation.goBack()
  }

  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach((t) => {
        t.enabled = muted
      })
      setMuted((v) => !v)
    }
  }

  const isVideo = (activeCall ?? incomingCall)?.type === 'video'

  // ── Ringing state ─────────────────────────────────────────────────────────
  if (callState === 'ringing' && incomingCall) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.incomingCenter}>
          <UserAvatar user={incomingCall.caller} size="xxl" />
          <Text style={styles.callerName}>{incomingCall.caller?.full_name}</Text>
          <Text style={styles.callTypeLabel}>
            Incoming {incomingCall.type === 'video' ? 'video' : 'voice'} call
          </Text>
          <View style={styles.incomingBtns}>
            <TouchableOpacity style={[styles.roundBtn, styles.rejectBtn]} onPress={handleReject}>
              <Text style={styles.roundBtnIcon}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roundBtn, styles.acceptBtn]} onPress={handleAnswer}>
              <Text style={styles.roundBtnIcon}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── Calling / Active state ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {isVideo ? (
        <>
          {remoteStream && RTCView ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.remoteVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.remoteVideo}>
              <UserAvatar
                user={incomingCall?.caller ?? { full_name: 'Remote' }}
                size="xxl"
              />
            </View>
          )}
          {localStream && RTCView && (
            <RTCView
              streamURL={localStream.toURL()}
              style={[styles.localVideo, { top: insets.top + 16 }]}
              objectFit="cover"
              mirror
            />
          )}
        </>
      ) : (
        <View style={styles.audioCenter}>
          <UserAvatar
            user={incomingCall?.caller ?? activeCall ?? { full_name: 'Call' }}
            size="xxl"
          />
          <Text style={styles.callerName}>
            {incomingCall?.caller?.full_name ??
              (callState === 'calling' ? 'Calling…' : 'Connected')}
          </Text>
          <Text style={styles.callStatusLabel}>
            {callState === 'calling' ? 'Calling…' : 'Voice call'}
          </Text>
        </View>
      )}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.roundBtn, styles.controlBtn, muted && styles.mutedBtn]}
          onPress={toggleMute}
        >
          <Text style={styles.roundBtnIcon}>{muted ? '🔇' : '🎤'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roundBtn, styles.endBtn]} onPress={handleEnd}>
          <Text style={styles.roundBtnIcon}>✕</Text>
        </TouchableOpacity>
        {isVideo && (
          <TouchableOpacity style={[styles.roundBtn, styles.controlBtn]}>
            <Text style={styles.roundBtnIcon}>📹</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.charcoal },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A202C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  localVideo: {
    position: 'absolute',
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#2D3748',
    overflow: 'hidden',
  },
  audioCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  incomingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  callerName: { fontSize: 26, fontWeight: '700', color: Colors.white },
  callTypeLabel: { fontSize: 15, color: Colors.gray400 },
  callStatusLabel: { fontSize: 14, color: Colors.gray400 },
  incomingBtns: {
    flexDirection: 'row',
    gap: 48,
    marginTop: 32,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    paddingTop: 24,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  roundBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnIcon: { fontSize: 26, color: Colors.white },
  controlBtn: { backgroundColor: 'rgba(255,255,255,0.15)' },
  mutedBtn: { backgroundColor: Colors.red },
  acceptBtn: { backgroundColor: Colors.online },
  rejectBtn: { backgroundColor: Colors.red },
  endBtn: { backgroundColor: Colors.red, width: 72, height: 72, borderRadius: 36 },
})
