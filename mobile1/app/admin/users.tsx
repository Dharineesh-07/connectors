import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { CN, getInitials } from '@/data/static';
import {
  listAdminUsers,
  createAdminUser,
  deactivateUser,
  resetUserPassword,
  type AdminUser,
} from '@/api/admin';

const PAGE_SIZE = 20;

// ── Avatar ────────────────────────────────────────────────────────────────────
function UserAvatar({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: CN.charcoal, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.34, fontWeight: '700' }}>{getInitials(name)}</Text>
    </View>
  );
}

// ── AddUserModal ──────────────────────────────────────────────────────────────
function AddUserModal({ visible, onClose, onAdd, isDark }: {
  visible: boolean; onClose: () => void;
  onAdd: (u: AdminUser) => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError]           = useState('');
  const [saving, setSaving]         = useState(false);

  const handleAdd = async () => {
    if (!fullName.trim() || !email.trim()) { setError('Full name and email are required.'); return; }
    setSaving(true);
    setError('');
    try {
      const user = await createAdminUser({
        full_name:  fullName.trim(),
        email:      email.trim().toLowerCase(),
        department: department.trim() || undefined,
      });
      onAdd(user);
      setFullName(''); setEmail(''); setDepartment('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFullName(''); setEmail(''); setDepartment(''); setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.accentBar}>
            <View style={[styles.accentSlice, { backgroundColor: CN.red }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.purple }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.blue }]} />
          </View>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: c.text }]}>Add Employee</Text>
              <Text style={[styles.modalSub, { color: c.label }]}>Create a new user account</Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={20} color={c.label} />
            </TouchableOpacity>
          </View>
          {!!error && (
            <View style={[styles.errorBadge, { margin: 14 }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.modalBody}>
            {[
              { label: 'Full Name *', value: fullName, setter: setFullName, placeholder: 'John Doe', type: 'default' as const },
              { label: 'Email *',     value: email,    setter: setEmail,    placeholder: 'john@company.com', type: 'email-address' as const },
              { label: 'Department',  value: department, setter: setDepartment, placeholder: 'Engineering', type: 'default' as const },
            ].map(({ label, value, setter, placeholder, type }) => (
              <View key={label} style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: c.label }]}>{label}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                  placeholder={placeholder}
                  placeholderTextColor={c.label}
                  value={value}
                  onChangeText={setter}
                  keyboardType={type}
                  autoCapitalize={type === 'email-address' ? 'none' : 'words'}
                />
              </View>
            ))}
          </View>
          <View style={[styles.modalFooter, { borderTopColor: c.border }]}>
            <TouchableOpacity onPress={handleClose}
              style={[styles.footerBtn, { borderColor: c.border }]}>
              <Text style={[styles.footerBtnText, { color: c.label }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAdd} disabled={saving}
              style={[styles.footerBtn, styles.addBtn, { opacity: saving ? 0.6 : 1 }]}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.addBtnText}>Add Employee</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── ResetPasswordModal ────────────────────────────────────────────────────────
function ResetPasswordModal({ userId, userName, visible, onClose, isDark }: {
  userId: string; userName: string; visible: boolean; onClose: () => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const handleReset = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSaving(true); setError('');
    try {
      await resetUserPassword(userId, password);
      setPassword('');
      onClose();
      Alert.alert('Done', `Password reset for ${userName}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => { setPassword(''); setError(''); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.accentBar}>
            <View style={[styles.accentSlice, { backgroundColor: CN.red }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.purple }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.blue }]} />
          </View>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: c.text }]}>Reset Password</Text>
              <Text style={[styles.modalSub, { color: c.label }]}>{userName}</Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={20} color={c.label} />
            </TouchableOpacity>
          </View>
          {!!error && (
            <View style={[styles.errorBadge, { margin: 14 }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.modalBody}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: c.label }]}>New Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                placeholder="Min 8 characters"
                placeholderTextColor={c.label}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
              />
            </View>
          </View>
          <View style={[styles.modalFooter, { borderTopColor: c.border }]}>
            <TouchableOpacity onPress={handleClose} style={[styles.footerBtn, { borderColor: c.border }]}>
              <Text style={[styles.footerBtnText, { color: c.label }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReset} disabled={saving}
              style={[styles.footerBtn, styles.addBtn, { opacity: saving ? 0.6 : 1 }]}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.addBtnText}>Reset</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── UserRow ───────────────────────────────────────────────────────────────────
function UserRow({ user, onDeactivate, onReset, isDark }: {
  user: AdminUser; onDeactivate: () => void; onReset: () => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const displayName = user.display_name || user.full_name;
  return (
    <View style={[styles.userRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
      <View style={styles.userLeft}>
        <View style={{ position: 'relative' }}>
          <UserAvatar name={displayName} size={40} />
          {user.is_online && (
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
              borderRadius: 5, backgroundColor: CN.online, borderWidth: 2, borderColor: '#fff' }} />
          )}
        </View>
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={[styles.userName, { color: c.text }]} numberOfLines={1}>{user.full_name}</Text>
            {user.role === 'admin' && (
              <View style={styles.adminPill}>
                <Text style={styles.adminPillText}>Admin</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userEmail, { color: c.label }]} numberOfLines={1}>{user.email}</Text>
          {!!user.department && (
            <Text style={[styles.userDept, { color: c.sub }]}>{user.department}</Text>
          )}
        </View>
      </View>
      <View style={styles.userActions}>
        <View style={[styles.statusPill, { backgroundColor: user.is_active ? '#E6F9EE' : '#F5E6E6' }]}>
          <Text style={[styles.statusPillText, { color: user.is_active ? '#16A34A' : CN.red }]}>
            {user.is_active ? 'Active' : 'Inactive'}
          </Text>
        </View>
        {user.is_active && (
          <TouchableOpacity onPress={onDeactivate} style={[styles.actionBtn, { backgroundColor: c.gray100 }]}>
            <Ionicons name="person-remove-outline" size={14} color={c.label} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onReset} style={[styles.actionBtn, { backgroundColor: c.gray100 }]}>
          <Ionicons name="key-outline" size={14} color={c.label} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ManageUsersScreen ─────────────────────────────────────────────────────────
export default function ManageUsersScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]     = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetTarget, setResetTarget]   = useState<AdminUser | null>(null);

  const loadUsers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await listAdminUsers({ page: p, limit: PAGE_SIZE });
      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.total_pages ?? 1);
      setPage(p);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const headerHeight = 60 + insets.top;

  const handleDeactivate = (user: AdminUser) => {
    Alert.alert('Deactivate User', `Deactivate ${user.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: async () => {
        try {
          await deactivateUser(user.id);
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: false, is_online: false } : u));
        } catch (e: unknown) {
          Alert.alert('Error', e instanceof Error ? e.message : 'Failed to deactivate user');
        }
      }},
    ]);
  };

  const handleAddUser = (u: AdminUser) => {
    setUsers(prev => [u, ...prev]);
    setTotal(t => t + 1);
    setShowAddModal(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { height: headerHeight, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: CN.charcoal }]} />
        <View style={{ position: 'absolute', width: 280, height: 280, borderRadius: 140,
          top: insets.top - 200, left: -50, backgroundColor: CN.red, opacity: 0.7 }} />
        <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110,
          top: insets.top - 170, right: -30, backgroundColor: CN.blue, opacity: 0.6 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Manage Users</Text>
            <Text style={styles.headerSub}>{loading ? '…' : `${total} employees`}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addHeaderBtn}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action bar */}
      <View style={[styles.actionBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => setShowAddModal(true)}
          style={[styles.addEmpBtn, { backgroundColor: CN.red }]}>
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={styles.addEmpBtnText}>Add Employee</Text>
        </TouchableOpacity>
        {!loading && (
          <Text style={[styles.pageInfo, { color: c.label }]}>
            Page {page} of {totalPages}
          </Text>
        )}
      </View>

      {/* User list */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CN.red} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            <UserRow
              user={item}
              onDeactivate={() => handleDeactivate(item)}
              onReset={() => setResetTarget(item)}
              isDark={isDark}
            />
          )}
          ListEmptyComponent={
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={{ color: c.label, fontSize: 14 }}>No users found.</Text>
            </View>
          }
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <View style={[styles.pagination, {
          backgroundColor: c.card, borderTopColor: c.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
        }]}>
          <TouchableOpacity
            onPress={() => loadUsers(page - 1)}
            disabled={page <= 1}
            style={[styles.pageBtn, { backgroundColor: c.gray100, opacity: page <= 1 ? 0.4 : 1 }]}
          >
            <Ionicons name="chevron-back" size={18} color={c.text} />
            <Text style={[styles.pageBtnText, { color: c.text }]}>Previous</Text>
          </TouchableOpacity>
          <Text style={[styles.pageLabel, { color: c.label }]}>
            Page {page} of {totalPages}
          </Text>
          <TouchableOpacity
            onPress={() => loadUsers(page + 1)}
            disabled={page >= totalPages}
            style={[styles.pageBtn, { backgroundColor: c.gray100, opacity: page >= totalPages ? 0.4 : 1 }]}
          >
            <Text style={[styles.pageBtnText, { color: c.text }]}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={c.text} />
          </TouchableOpacity>
        </View>
      )}

      <AddUserModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddUser}
        isDark={isDark}
      />

      {resetTarget && (
        <ResetPasswordModal
          userId={resetTarget.id}
          userName={resetTarget.full_name}
          visible
          onClose={() => setResetTarget(null)}
          isDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {},
  headerContent: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, zIndex: 1 },
  backBtn:      { padding: 8, borderRadius: 8 },
  headerCenter: { flex: 1, marginHorizontal: 8 },
  headerTitle:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSub:    { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 },
  addHeaderBtn: { padding: 8, borderRadius: 8 },

  actionBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  addEmpBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addEmpBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
  pageInfo:     { fontSize: 12 },

  userRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  userLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  userInfo:    { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName:    { fontWeight: '600', fontSize: 14, flex: 1 },
  userEmail:   { fontSize: 12, marginTop: 1 },
  userDept:    { fontSize: 11, marginTop: 1 },
  adminPill:   { backgroundColor: CN.redLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminPillText:{ color: CN.red, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statusPill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusPillText:{ fontSize: 10, fontWeight: '700' },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  pagination:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1 },
  pageBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  pageBtnText: { fontSize: 13, fontWeight: '600' },
  pageLabel:   { fontSize: 13 },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard:  { width: '100%', maxWidth: 420, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  accentBar:  { flexDirection: 'row', height: 4 },
  accentSlice:{ flex: 1 },
  modalHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontWeight: '700', fontSize: 16 },
  modalSub:   { fontSize: 12, marginTop: 2 },
  modalBody:  { padding: 16, gap: 12 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  input:      { height: 44, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 14 },
  modalFooter:{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  footerBtn:  { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  footerBtnText:{ fontSize: 14, fontWeight: '600' },
  addBtn:     { backgroundColor: CN.red, borderColor: CN.red },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  errorBadge: { backgroundColor: '#F5E6E6', borderLeftWidth: 4, borderLeftColor: CN.red, borderRadius: 8, padding: 12 },
  errorText:  { color: CN.red, fontSize: 13, fontWeight: '600' },
}) as unknown as Record<string, any>;
