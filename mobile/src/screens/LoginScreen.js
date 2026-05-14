import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Toast from 'react-native-toast-message'
import { useAuth } from '../context/AuthContext'
import { registerForPushNotifications } from '../utils/notifications'
import Logo from '../components/Logo'
import { Colors } from '../theme/colors'
import { Typography } from '../theme/typography'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      await registerForPushNotifications()
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Logo size="lg" />
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Top gradient bar */}
          <View style={styles.accentBar} />

          <View style={styles.cardBody}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to COMPUNET connections</Text>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              placeholderTextColor={Colors.gray400}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={Colors.gray400}
              secureTextEntry
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>© COMPUNET connections — Internal Platform</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { marginBottom: 24 },
  card: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: Colors.charcoal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  accentBar: {
    height: 4,
    // LinearGradient not available without expo-linear-gradient; use red as fallback
    backgroundColor: Colors.red,
  },
  cardBody: { padding: 28 },
  heading: { ...Typography.headingMd, marginBottom: 4 },
  subheading: { ...Typography.secondary, marginBottom: 20 },
  errorBox: {
    backgroundColor: Colors.redLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.red,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { color: Colors.redDark, fontSize: 13 },
  label: { ...Typography.label, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.gray100,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.gray800,
    backgroundColor: Colors.white,
    marginBottom: 14,
  },
  button: {
    backgroundColor: Colors.red,
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  footer: {
    marginTop: 24,
    fontSize: 11,
    color: Colors.gray400,
    textAlign: 'center',
  },
})
