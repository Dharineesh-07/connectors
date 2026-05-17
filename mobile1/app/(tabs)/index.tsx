import { useCallback, useMemo, useState } from 'react';
import {
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

import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CN, USERS, INITIAL_CONVERSATIONS, getInitials, formatTime,
  type Conversation, type UserItem,
} from '@/data/static';

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 44, online = false, isGroup = false }: {
  name?: string; size?: number; online?: boolean; isGroup?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: isGroup ? CN.blue : CN.charcoal,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: '#fff', fontSize: size * 0.34, fontWeight: '700' }}>
          {getInitials(name)}
        </Text>
      </View>
      {online && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: Math.round(size * 0.28), height: Math.round(size * 0.28),
          borderRadius: Math.round(size * 0.14),
          backgroundColor: CN.online, borderWidth: 2, borderColor: '#fff',
        }} />
      )}
    </View>
  );
}

// ── ConvItem ──────────────────────────────────────────────────────────────────
function ConvItem({ conv, currentUserId, onPress, isDark }: {
  conv: Conversation; currentUserId?: number; onPress: () => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const isGroup = conv.type === 'group';
  const other = !isGroup ? conv.members?.find((m) => m.user_id !== currentUserId) : null;
  const name = isGroup ? conv.name : (other?.user?.display_name || other?.user?.full_name || 'You');
  const lastMsg = conv.last_message;
  const preview = lastMsg
    ? (lastMsg.type !== 'text' ? `[${lastMsg.type}]` : (lastMsg.content?.slice(0, 60) ?? ''))
    : 'No messages yet';
  const isOnline = !isGroup && !!other?.user?.is_online;
  const unread = conv.unread_count ?? 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.convItem, { borderBottomColor: c.border }]}
      activeOpacity={0.7}
    >
      <Avatar name={name} size={44} online={isOnline} isGroup={isGroup} />
      <View style={styles.convContent}>
        <View style={styles.convRow}>
          <Text style={[styles.convName, { color: c.text }]} numberOfLines={1}>{name}</Text>
          {lastMsg && (
            <Text style={[styles.convTime, { color: c.gray400 }]}>{formatTime(lastMsg.created_at)}</Text>
          )}
        </View>
        <View style={styles.convRow}>
          <Text style={[styles.convPreview, { color: c.gray600 }]} numberOfLines={1}>{preview}</Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 9 ? '9+' : String(unread)}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── ComposerModal ─────────────────────────────────────────────────────────────
function ComposerModal({ mode, visible, onClose, currentUser, onCreated, isDark }: {
  mode: 'direct' | 'group'; visible: boolean; onClose: () => void;
  currentUser?: UserItem; onCreated: (conv: Conversation) => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const isGroup = mode === 'group';

  const [search, setSearch]         = useState('');
  const [groupName, setGroupName]   = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError]           = useState('');

  const otherUsers = USERS.filter((u) => u.id !== currentUser?.id);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return otherUsers;
    return otherUsers.filter((u) => {
      const name = (u.display_name || u.full_name || '').toLowerCase();
      return name.includes(q) || u.email?.toLowerCase().includes(q);
    });
  }, [search, otherUsers]);

  const selectedUsers = otherUsers.filter((u) => selectedIds.includes(u.id));
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const handleStartDirect = (u: UserItem) => {
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      type: 'direct',
      members: [
        { user_id: currentUser!.id, user: currentUser! },
        { user_id: u.id, user: u },
      ],
      unread_count: 0,
    };
    onCreated(newConv);
  };

  const handleCreateGroup = () => {
    if (!groupName.trim()) { setError('Group name is required'); return; }
    if (selectedIds.length < 2) { setError('Select at least 2 members'); return; }
    const allIds = [...new Set([...selectedIds, ...(currentUser ? [currentUser.id] : [])])];
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      type: 'group',
      name: groupName.trim(),
      members: USERS.filter(u => allIds.includes(u.id)).map(u => ({ user_id: u.id, user: u })),
      unread_count: 0,
    };
    onCreated(newConv);
  };

  const handleClose = () => {
    setSearch(''); setGroupName(''); setSelectedIds([]); setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.accentBar}>
            <View style={[styles.accentSlice, { backgroundColor: CN.red }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.purple }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.blue }]} />
          </View>

          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: c.text }]}>{isGroup ? 'New Group' : 'New Chat'}</Text>
              <Text style={[styles.modalSub, { color: c.label }]}>
                {isGroup ? 'Pick at least 2 other members' : 'Choose someone to message'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={c.label} />
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={[styles.errorBadge, { margin: 14 }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
            {isGroup && (
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                placeholder="Group name"
                placeholderTextColor={c.label}
                value={groupName}
                onChangeText={setGroupName}
              />
            )}
            {isGroup && selectedUsers.length > 0 && (
              <View style={styles.chipsRow}>
                {selectedUsers.map((u) => (
                  <TouchableOpacity key={u.id} onPress={() => toggleSelected(u.id)}
                    style={[styles.chip, { backgroundColor: CN.blueLight }]}>
                    <Text style={[styles.chipText, { color: CN.blue }]}>{u.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[styles.searchBar, { backgroundColor: c.gray100, borderColor: c.border }]}>
              <Ionicons name="search" size={15} color={c.label} />
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="Search people"
                placeholderTextColor={c.label}
                value={search}
                onChangeText={setSearch}
                autoFocus={!isGroup}
              />
            </View>
          </View>

          <FlatList
            data={filteredUsers}
            keyExtractor={(u) => String(u.id)}
            style={[styles.userList, { borderTopColor: c.border, borderBottomColor: c.border }]}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <TouchableOpacity
                  onPress={() => isGroup ? toggleSelected(item.id) : handleStartDirect(item)}
                  style={[styles.userItem, { backgroundColor: selected ? CN.blueLight : 'transparent' }]}
                >
                  <Avatar name={item.display_name} size={36} online={item.is_online} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontWeight: '600', fontSize: 14, color: c.text }} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.label }} numberOfLines={1}>
                      {item.department}
                    </Text>
                  </View>
                  {isGroup && (
                    <View style={[styles.checkCircle, { borderColor: selected ? CN.blue : c.border },
                      selected && { backgroundColor: CN.blue }]}>
                      {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.listPlaceholder}>
                <Text style={{ color: c.label, fontSize: 13 }}>No people found.</Text>
              </View>
            }
          />

          {isGroup && (
            <View style={[styles.modalFooter, { borderTopColor: c.border }]}>
              <Text style={{ color: c.label, fontSize: 12 }}>{selectedIds.length} selected</Text>
              <TouchableOpacity
                onPress={handleCreateGroup}
                disabled={selectedIds.length < 2 || !groupName.trim()}
                style={[styles.createBtn, { opacity: selectedIds.length < 2 || !groupName.trim() ? 0.45 : 1 }]}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Create Group</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const userConversations = INITIAL_CONVERSATIONS.filter(conv =>
    conv.members.some(m => m.user_id === user?.id)
  );

  const [conversations, setConversations] = useState<Conversation[]>(userConversations);
  const [search, setSearch]               = useState('');
  const [showSearch, setShowSearch]       = useState(false);
  const [composerMode, setComposerMode]   = useState<'direct' | 'group' | null>(null);

  const filtered = conversations.filter((conv) => {
    if (!search) return true;
    const isGroup = conv.type === 'group';
    const other = !isGroup ? conv.members?.find((m) => m.user_id !== user?.id) : null;
    const name = isGroup ? conv.name : (other?.user?.display_name || other?.user?.full_name);
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  const handleConvCreated = useCallback((conv: Conversation) => {
    setComposerMode(null);
    setConversations((prev) => {
      if (prev.some((c) => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
    router.push(`/chat/${conv.id}`);
  }, [router]);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const displayName = user?.display_name || user?.full_name || 'User';
  const isAdmin = user?.role === 'admin';
  const headerHeight = 60 + insets.top;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { height: headerHeight, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: CN.charcoal }]} />
        <View style={{ position: 'absolute', width: 320, height: 320, borderRadius: 160,
          top: insets.top - 220, left: -70, backgroundColor: CN.red, opacity: 0.75 }} />
        <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130,
          top: insets.top - 200, right: -50, backgroundColor: CN.blue, opacity: 0.65 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top }]}>
          <View style={styles.logoArea}>
            <View style={styles.logoBox}>
              <Ionicons name="chatbubbles" size={17} color="#fff" />
            </View>
            <Text style={styles.brandName}>Connectors</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => { setShowSearch(v => !v); setSearch(''); }} style={styles.headerBtn}>
              <Ionicons name={showSearch ? 'close' : 'search'} size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={[styles.searchSection, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <View style={[styles.searchBar, { backgroundColor: c.gray100, borderColor: c.border }]}>
            <Ionicons name="search" size={15} color={c.label} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search conversations…"
              placeholderTextColor={c.label}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={c.label} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={[styles.actionRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => setComposerMode('direct')}
          style={[styles.actionBtn, { backgroundColor: CN.red }]} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>New Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setComposerMode('group')}
          style={[styles.actionBtn, { backgroundColor: CN.blue }]} activeOpacity={0.85}>
          <Ionicons name="people" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>New Group</Text>
        </TouchableOpacity>
      </View>

      {/* Conversation list */}
      <FlatList
        data={filtered}
        keyExtractor={(conv) => conv.id}
        style={{ flex: 1, backgroundColor: c.card }}
        renderItem={({ item }) => (
          <ConvItem
            conv={item}
            currentUserId={user?.id}
            onPress={() => router.push(`/chat/${item.id}`)}
            isDark={isDark}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyBubble}>
              <Text style={{ fontSize: 28 }}>💬</Text>
            </View>
            <Text style={[styles.emptyText, { color: c.label }]}>
              {search ? 'No conversations match your search' : 'No conversations yet'}
            </Text>
          </View>
        }
      />

      {/* Quick tools row */}
      <View style={[styles.quickTools, { backgroundColor: c.gray100, borderTopColor: c.border }]}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(tabs)/explore')}>
          <Ionicons name="call-outline" size={20} color={c.gray400} />
          <Text style={[styles.quickLabel, { color: c.gray400 }]}>CALLS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, { borderLeftWidth: 1, borderLeftColor: c.border }]}
          onPress={() => router.push('/(tabs)/calendar')}
        >
          <Ionicons name="calendar-outline" size={20} color={c.gray400} />
          <Text style={[styles.quickLabel, { color: c.gray400 }]}>TASKS</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={[styles.quickBtn, { borderLeftWidth: 1, borderLeftColor: c.border }]} onPress={() => router.push('/admin')}>
            <Ionicons name="shield-checkmark-outline" size={20} color={c.gray400} />
            <Text style={[styles.quickLabel, { color: c.gray400 }]}>ADMIN</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* User footer */}
      <View style={[styles.userFooter, {
        backgroundColor: c.gray100, borderTopColor: c.border,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
      }]}>
        <Avatar name={displayName} size={36} online />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.footerName, { color: c.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.footerStatus, { color: CN.online }]}>● Online</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={c.gray400} />
        </TouchableOpacity>
      </View>

      {composerMode && (
        <ComposerModal
          mode={composerMode}
          visible
          onClose={() => setComposerMode(null)}
          currentUser={user ?? undefined}
          onCreated={handleConvCreated}
          isDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {},
  headerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, zIndex: 1 },
  logoArea:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox:     { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  brandName:   { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 2 },
  headerBtn:   { padding: 8, borderRadius: 8 },

  searchSection: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  actionRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  actionBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  actionBtnText:{ color: '#fff', fontWeight: '700', fontSize: 12 },

  convItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  convContent: { flex: 1, marginLeft: 12 },
  convRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName:    { fontWeight: '600', fontSize: 14, flex: 1 },
  convTime:    { fontSize: 12, marginLeft: 8, flexShrink: 0 },
  convPreview: { fontSize: 12, flex: 1, marginTop: 2 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: CN.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 6 },
  unreadText:  { color: '#fff', fontSize: 10, fontWeight: '800' },

  emptyState:  { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(204,51,51,0.1)', alignItems: 'center', justifyContent: 'center' },
  emptyText:   { fontSize: 14 },

  quickTools:  { flexDirection: 'row', borderTopWidth: 1 },
  quickBtn:    { flex: 1, alignItems: 'center', paddingVertical: 9, gap: 3 },
  quickLabel:  { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  userFooter:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  footerName:  { fontWeight: '600', fontSize: 14 },
  footerStatus:{ fontSize: 11, fontWeight: '600', marginTop: 1 },
  logoutBtn:   { padding: 8 },

  // Modal
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard:   { width: '100%', maxWidth: 420, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  accentBar:   { flexDirection: 'row', height: 4 },
  accentSlice: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle:  { fontWeight: '700', fontSize: 16 },
  modalSub:    { fontSize: 12, marginTop: 2 },
  closeBtn:    { padding: 4 },
  modalInput:  { height: 44, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 14 },
  chipsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:        { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:    { fontSize: 12, fontWeight: '600' },
  userList:    { maxHeight: 280, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  userItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  checkCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  listPlaceholder: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  createBtn:   { backgroundColor: CN.red, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  errorBadge:  { backgroundColor: '#F5E6E6', borderLeftWidth: 4, borderLeftColor: CN.red, borderRadius: 8, padding: 12 },
  errorText:   { color: CN.red, fontSize: 13, fontWeight: '600' },

}) as unknown as Record<string, any>;
