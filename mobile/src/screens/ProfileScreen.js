import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { changePassword } from '../api/auth'
import { updateProfile } from '../api/users'
import { useAuth } from '../context/AuthContext'
import UserAvatar from '../components/UserAvatar'
import Logo from '../components/Logo'
import { Colors } from '../theme/colors'
import { Typography } from '../theme/typography'

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

function SettingsRow({ label, value, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && (
        <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
      )}
      {!!onPress && <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  )
}

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth()
  const insets = useSafeAreaInsets()
  const [saving, setSaving] = useState(false)

  const handleEditDisplayName = () => {
    Alert.prompt(
      'Display Name',
      'Enter your display name:',
      async (newName) => {
        if (!newName?.trim()) return
        setSaving(true)
        try {
          const updated = await updateProfile({ display_name: newName.trim() })
          updateUser({ display_name: updated.display_name })
          Toast.show({ type: 'success', text1: 'Display name updated' })
        } catch {
          Toast.show({ type: 'error', text1: 'Update failed' })
        } finally {
          setSaving(false)
        }
      },
      'plain-text',
      user?.display_name ?? ''
    )
  }

  const handleChangePassword = () => {
    Alert.prompt('Current Password', '', (currentPwd) => {
      if (!currentPwd) return
      Alert.prompt(
        'New Password',
        'Min 8 chars, 1 uppercase, 1 number, 1 special char',
        async (newPwd) => {
          if (!newPwd) return
          setSaving(true)
          try {
            await changePassword(currentPwd, newPwd)
            Toast.show({ type: 'success', text1: 'Password changed' })
          } catch (err) {
            Toast.show({
              type: 'error',
              text1: 'Password change failed',
              text2: err.response?.data?.detail,
            })
          } finally {
            setSaving(false)
          }
        },
        'secure-text'
      )
    }, 'secure-text')
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
    >
      {/* Avatar section */}
      <View style={styles.avatarSection}>
        <UserAvatar user={user} size="xxl" online />
        <Text style={styles.userName}>{user?.display_name || user?.full_name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        {user?.department && (
          <View style={styles.deptBadge}>
            <Text style={styles.deptText}>{user.department}</Text>
          </View>
        )}
        {saving && <ActivityIndicator color={Colors.red} style={{ marginTop: 8 }} />}
      </View>

      {/* Logo watermark */}
      <View style={styles.logoRow}>
        <Logo size="sm" />
      </View>

      <Section title="Account">
        <SettingsRow
          label="Display Name"
          value={user?.display_name || 'Not set'}
          onPress={handleEditDisplayName}
        />
        <View style={styles.divider} />
        <SettingsRow label="Email" value={user?.email} />
        <View style={styles.divider} />
        <SettingsRow label="Role" value={user?.role} />
      </Section>

      <Section title="Security">
        <SettingsRow label="Change Password" value="" onPress={handleChangePassword} />
      </Section>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    marginBottom: 8,
  },
  userName: { fontSize: 22, fontWeight: '800', color: Colors.charcoal, marginTop: 12 },
  userEmail: { fontSize: 14, color: Colors.gray600, marginTop: 4 },
  deptBadge: {
    backgroundColor: Colors.blueLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  deptText: { color: Colors.blue, fontSize: 13, fontWeight: '600' },
  logoRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 15, color: Colors.charcoal, flex: 1 },
  rowValue: { fontSize: 14, color: Colors.gray600, flex: 1, textAlign: 'right', marginRight: 8 },
  rowChevron: { fontSize: 20, color: Colors.gray400 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginLeft: 16 },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.red,
  },
  logoutText: { color: Colors.red, fontSize: 16, fontWeight: '700' },
})
