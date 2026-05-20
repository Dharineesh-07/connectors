import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { forgotPassword, resetPassword } from '@/api/auth';
import { CN } from '@/data/static';

type FormView = 'login' | 'forgot' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateNewPassword(pwd: string): string | null {
  if (pwd.length < 8)        return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pwd))    return 'Must include at least one uppercase letter.';
  if (!/[0-9]/.test(pwd))    return 'Must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Must include at least one special character.';
  return null;
}

export default function LoginScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;

  const { login } = useAuth();

  const [view, setView]               = useState<FormView>('login');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [otp, setOtp]                 = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [showNewPwd, setShowNewPwd]   = useState(false);
  const [focused, setFocused]         = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Count down the resend cooldown timer.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setError('Please enter your email and password.'); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await login(trimmedEmail, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOTP = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Please enter your email address.'); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { setError('Please enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      await forgotPassword(trimmedEmail);
      setResendCooldown(60);
      setView('reset');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (otp.length !== 6)  { setError('Please enter the 6-digit code sent to your email.'); return; }
    const pwdError = validateNewPassword(newPassword);
    if (pwdError)          { setError(pwdError); return; }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim(), otp, newPassword);
      setView('login');
      setOtp('');
      setNewPassword('');
      setResendCooldown(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password. Check your OTP.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string) => [
    styles.input,
    {
      color:           c.text,
      backgroundColor: c.inputBg,
      borderColor:     focused === field ? CN.blue : c.border,
      shadowColor:     focused === field ? CN.blue : 'transparent',
      shadowOpacity:   focused === field ? 0.12 : 0,
      shadowRadius:    focused === field ? 6 : 0,
      shadowOffset:    { width: 0, height: 0 },
      elevation:       focused === field ? 4 : 0,
    },
  ];

  const goBack = () => { setView('login'); setError(''); };
  const goToForgot = () => { setView('forgot'); setOtp(''); setError(''); };

  // ── Login view ─────────────────────────────────────────────────────────────
  const renderLogin = () => (
    <View style={styles.formSection}>
      <Text style={[styles.heading, { color: c.text }]}>Welcome back</Text>
      <Text style={[styles.subheading, { color: c.sub }]}>Sign in to Connectors</Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: c.label }]}>Email address</Text>
        <TextInput
          style={inputStyle('email')}
          placeholder="you@company.com"
          placeholderTextColor={c.label}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused('')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      </View>

      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: c.label }]}>Password</Text>
          <Pressable onPress={() => { setView('forgot'); setError(''); }}>
            <Text style={[styles.forgotBtn, { color: CN.blue }]}>Forgot?</Text>
          </Pressable>
        </View>
        <View>
          <TextInput
            style={[inputStyle('password'), { paddingRight: 48 }]}
            placeholder="••••••••"
            placeholderTextColor={c.label}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused('')}
            secureTextEntry={!showPwd}
            textContentType="password"
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowPwd(p => !p)}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.label} />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.88 : 1 }]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign in →'}</Text>
      </Pressable>
    </View>
  );

  // ── Forgot view ────────────────────────────────────────────────────────────
  const renderForgot = () => (
    <View style={styles.formSection}>
      <Pressable style={styles.backBtn} onPress={goBack}>
        <Ionicons name="arrow-back" size={14} color={c.label} />
        <Text style={[styles.backBtnText, { color: c.label }]}>Back to login</Text>
      </Pressable>

      <View style={[styles.iconBadge, { backgroundColor: CN.blueLight }]}>
        <Ionicons name="mail-outline" size={24} color={CN.blue} />
      </View>

      <Text style={[styles.heading, { color: c.text }]}>Forgot password?</Text>
      <Text style={[styles.subheading, { color: c.sub }]}>
        Enter your email and we'll send you a 6-digit code to reset your password.
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: c.label }]}>Email address</Text>
        <TextInput
          style={inputStyle('email')}
          placeholder="you@company.com"
          placeholderTextColor={c.label}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused('')}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, styles.blueBtn, { opacity: pressed ? 0.88 : 1 }]}
        onPress={handleRequestOTP}
        disabled={loading}
      >
        <Text style={styles.primaryBtnText}>{loading ? 'Sending…' : 'Send Code →'}</Text>
      </Pressable>
    </View>
  );

  // ── Reset view ─────────────────────────────────────────────────────────────
  const renderReset = () => (
    <View style={styles.formSection}>
      <View style={styles.resetNav}>
        <Pressable style={styles.backBtn} onPress={goToForgot}>
          <Ionicons name="arrow-back" size={14} color={c.label} />
          <Text style={[styles.backBtnText, { color: c.label }]}>Change email</Text>
        </Pressable>

        <Pressable
          style={[styles.backBtn, resendCooldown > 0 && { opacity: 0.45 }]}
          onPress={resendCooldown > 0 ? undefined : handleRequestOTP}
          disabled={resendCooldown > 0 || loading}
        >
          <Ionicons name="refresh-outline" size={14} color={CN.blue} />
          <Text style={[styles.backBtnText, { color: CN.blue }]}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.iconBadge, { backgroundColor: CN.redLight }]}>
        <Ionicons name="shield-checkmark-outline" size={24} color={CN.red} />
      </View>

      <Text style={[styles.heading, { color: c.text }]}>Reset Password</Text>
      <Text style={[styles.subheading, { color: c.sub }]}>
        A 6-digit code was sent to{' '}
        <Text style={{ fontWeight: '700' }}>{email.trim()}</Text>.{' '}
        It expires in 3 minutes.
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: c.label }]}>Verification Code</Text>
        <TextInput
          style={[inputStyle('otp'), styles.otpInput]}
          placeholder="000000"
          placeholderTextColor={c.label}
          value={otp}
          onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
          onFocus={() => setFocused('otp')}
          onBlur={() => setFocused('')}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: c.label }]}>New Password</Text>
        <View>
          <TextInput
            style={[inputStyle('newPwd'), { paddingRight: 48 }]}
            placeholder="••••••••"
            placeholderTextColor={c.label}
            value={newPassword}
            onChangeText={setNewPassword}
            onFocus={() => setFocused('newPwd')}
            onBlur={() => setFocused('')}
            secureTextEntry={!showNewPwd}
            textContentType="newPassword"
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowNewPwd(p => !p)}>
            <Ionicons name={showNewPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.label} />
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: c.label }]}>Min 8 chars · 1 uppercase · 1 number · 1 special</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.88 : 1 }]}
        onPress={handleResetPassword}
        disabled={loading}
      >
        <Text style={styles.primaryBtnText}>{loading ? 'Resetting…' : 'Reset Password →'}</Text>
      </Pressable>
    </View>
  );

  // ── Root ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Decorative orbs */}
      <View style={[styles.orb, styles.orbRed, { backgroundColor: isDark ? 'rgba(204,51,51,0.45)' : 'rgba(204,51,51,0.22)' }]} />
      <View style={[styles.orb, styles.orbBlue, { backgroundColor: isDark ? 'rgba(51,153,204,0.40)' : 'rgba(51,153,204,0.24)' }]} />

      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[
            styles.card,
            {
              backgroundColor: c.card,
              borderColor:     isDark ? 'rgba(38,52,70,0.5)' : 'rgba(232,236,240,0.5)',
              shadowColor:     isDark ? '#000' : '#2D3748',
            },
          ]}>
            {/* Accent bar */}
            <View style={styles.accentBar}>
              <View style={[styles.accentHalf, { backgroundColor: CN.red }]} />
              <View style={[styles.accentHalf, { backgroundColor: CN.purple }]} />
              <View style={[styles.accentHalf, { backgroundColor: CN.blue }]} />
            </View>

            <View style={styles.cardBody}>
              {/* Logo */}
              <View style={styles.logoWrap}>
                <Image
                  source={require('@/assets/images/logo.jpeg')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>

              {/* Error */}
              {!!error && (
                <View style={styles.errorBadge}>
                  <Text style={styles.errorBang}>!</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {view === 'login'  && renderLogin()}
              {view === 'forgot' && renderForgot()}
              {view === 'reset'  && renderReset()}
            </View>
          </View>

          <Text style={[styles.footer, { color: c.label }]}>
            © Connectors — Internal Platform
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  orb: { position: 'absolute', borderRadius: 9999 },
  orbRed:  { width: 360, height: 360, top: -80,  left: -80  },
  orbBlue: { width: 320, height: 320, bottom: -60, right: -60 },
  kav:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  accentBar:  { flexDirection: 'row', height: 5 },
  accentHalf: { flex: 1 },
  cardBody:   { paddingHorizontal: 32, paddingTop: 28, paddingBottom: 36 },

  logoWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  logoImage: { width: 180, height: 72 },

  errorBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F5E6E6',
    borderLeftWidth: 4,
    borderLeftColor: CN.red,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorBang: { color: CN.red, fontWeight: '700', fontSize: 14 },
  errorText: { color: CN.red, fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 18 },

  formSection: { gap: 0 },
  heading:    { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  subheading: { fontSize: 13, lineHeight: 20, marginBottom: 24 },
  fieldGroup: { marginBottom: 16 },
  label:      { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, marginLeft: 2 },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  forgotBtn:  { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },

  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  otpInput: { textAlign: 'center', fontSize: 20, fontWeight: '700', letterSpacing: 12 },
  eyeBtn:   { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },

  primaryBtn: {
    marginTop: 8,
    height: 52,
    borderRadius: 10,
    backgroundColor: CN.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CN.red,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  blueBtn:        { backgroundColor: CN.blue, shadowColor: CN.blue },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  resetNav:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnText: { fontSize: 12, fontWeight: '700' },
  iconBadge:   { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  hint:        { fontSize: 10, marginTop: 6, marginLeft: 2 },

  footer: {
    marginTop: 28,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
}) as unknown as Record<string, any>;
