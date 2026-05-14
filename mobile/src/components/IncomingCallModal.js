import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import UserAvatar from './UserAvatar'

export default function IncomingCallModal({ incomingCall, onAnswer, onReject }) {
  if (!incomingCall) return null

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <UserAvatar user={incomingCall.caller} size={72} />
          <Text style={styles.name}>{incomingCall.caller?.full_name}</Text>
          <Text style={styles.type}>
            Incoming {incomingCall.type === 'video' ? 'video' : 'voice'} call
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={() => onReject(incomingCall.call_id)}
            >
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => onAnswer(incomingCall)}
            >
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: 300,
  },
  name: { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginTop: 8 },
  type: { fontSize: 14, color: '#94a3b8' },
  buttons: { flexDirection: 'row', gap: 24, marginTop: 16 },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 50,
    minWidth: 100,
    alignItems: 'center',
  },
  rejectBtn: { backgroundColor: '#dc2626' },
  acceptBtn: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
