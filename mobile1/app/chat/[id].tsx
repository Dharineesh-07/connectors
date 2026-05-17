import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CN, INITIAL_CONVERSATIONS, INITIAL_MESSAGES, getInitials,
  type Message, type Conversation,
} from '@/data/static';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMsgTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSep(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// ── MiniAvatar ────────────────────────────────────────────────────────────────
function MiniAvatar({ name }: { name?: string }) {
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: CN.charcoal, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{getInitials(name)}</Text>
    </View>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, isSelf, showAvatar, senderName, isDark }: {
  msg: Message; isSelf: boolean; showAvatar: boolean; senderName?: string; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  return (
    <View style={[styles.bubbleRow, isSelf ? styles.bubbleRowSelf : styles.bubbleRowOther]}>
      {!isSelf && (
        <View style={styles.avatarSlot}>
          {showAvatar && <MiniAvatar name={senderName} />}
        </View>
      )}
      <View style={[styles.bubbleGroup, isSelf && { alignItems: 'flex-end' }]}>
        {!isSelf && showAvatar && senderName && (
          <Text style={[styles.senderName, { color: c.label }]}>{senderName}</Text>
        )}
        <View style={[
          styles.bubble,
          isSelf
            ? [styles.bubbleSelf, { backgroundColor: c.msgSelf }]
            : [styles.bubbleOther, { backgroundColor: c.msgOther, borderColor: c.border }],
        ]}>
          {msg.type !== 'text' ? (
            <Text style={[styles.bubbleAttachment, { color: isSelf ? 'rgba(255,255,255,0.7)' : c.label }]}>
              [{msg.type}]
            </Text>
          ) : (
            <Text style={[styles.bubbleText, { color: isSelf ? '#fff' : c.text }]}>{msg.content}</Text>
          )}
          <Text style={[styles.bubbleTime, { color: isSelf ? 'rgba(255,255,255,0.6)' : c.label }]}>
            {formatMsgTime(msg.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── ChatScreen ────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const conv: Conversation | undefined = INITIAL_CONVERSATIONS.find((c) => c.id === id);
  const [messages, setMessages] = useState<Message[]>(
    INITIAL_MESSAGES[id ?? ''] ?? []
  );
  const [text, setText] = useState('');

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !user) return;
    setText('');
    const newMsg: Message = {
      id: `m_${Date.now()}`,
      conversation_id: id ?? '',
      sender_id: user.id,
      sender: user,
      content,
      type: 'text',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [text, user, id]);

  // Resolve header info
  const isGroup = conv?.type === 'group';
  const other = !isGroup ? conv?.members?.find((m) => m.user_id !== user?.id) : null;
  const convName = isGroup
    ? (conv?.name ?? 'Group')
    : (other?.user?.display_name || other?.user?.full_name || 'Chat');
  const convSub = isGroup
    ? `${conv?.members?.length ?? 0} members`
    : (other?.user?.is_online ? 'Online' : 'Offline');

  const headerHeight = 56 + insets.top;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { height: headerHeight, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: CN.charcoal }]} />
        <View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120,
          top: insets.top - 180, left: -50, backgroundColor: CN.red, opacity: 0.65 }} />
        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90,
          top: insets.top - 140, right: -30, backgroundColor: CN.blue, opacity: 0.55 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{convName}</Text>
            {!!convSub && <Text style={styles.headerSub}>{convSub}</Text>}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="call-outline" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="videocam-outline" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 12 }}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const isSelf = item.sender_id === user?.id;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDate = !prevMsg || !sameDay(prevMsg.created_at, item.created_at);
            const showAvatar = !isSelf && (prevMsg?.sender_id !== item.sender_id);
            const senderName = item.sender?.display_name || item.sender?.full_name;
            return (
              <>
                {showDate && (
                  <View style={styles.dateSep}>
                    <View style={[styles.dateLine, { backgroundColor: c.border }]} />
                    <Text style={[styles.dateLabel, { color: c.label, backgroundColor: c.bg }]}>
                      {formatDateSep(item.created_at)}
                    </Text>
                    <View style={[styles.dateLine, { backgroundColor: c.border }]} />
                  </View>
                )}
                <MessageBubble
                  msg={item}
                  isSelf={isSelf}
                  showAvatar={showAvatar}
                  senderName={senderName}
                  isDark={isDark}
                />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
              <Text style={[styles.emptyText, { color: c.label }]}>No messages yet. Say hi!</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={[styles.inputBar, {
          backgroundColor: c.card, borderTopColor: c.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
        }]}>
          <TouchableOpacity style={styles.attachBtn}>
            <Ionicons name="add-circle-outline" size={26} color={c.label} />
          </TouchableOpacity>
          <View style={[styles.inputWrap, { backgroundColor: c.inputBg, borderColor: c.border }]}>
            <TextInput
              style={[styles.textInput, { color: c.text }]}
              placeholder="Type a message…"
              placeholderTextColor={c.label}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!text.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: text.trim() ? CN.red : c.gray100, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="send" size={18} color={text.trim() ? '#fff' : c.label} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {},
  headerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, zIndex: 1 },
  backBtn:     { padding: 8, borderRadius: 8 },
  headerCenter:{ flex: 1, marginHorizontal: 8 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: 'row' },
  headerBtn:   { padding: 8, borderRadius: 8 },

  emptyMessages: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, paddingBottom: 40 },
  emptyText:     { fontSize: 14 },

  dateSep:  { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 16 },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateLabel:{ fontSize: 11, fontWeight: '600', paddingHorizontal: 10 },

  bubbleRow:      { flexDirection: 'row', marginHorizontal: 12, marginVertical: 2 },
  bubbleRowSelf:  { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  avatarSlot:     { width: 36, justifyContent: 'flex-end', marginRight: 6 },
  bubbleGroup:    { maxWidth: '75%' },
  senderName:     { fontSize: 11, fontWeight: '600', marginBottom: 3, marginLeft: 2 },
  bubble:         { borderRadius: 16, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  bubbleSelf:     { borderBottomRightRadius: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  bubbleOther:    { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bubbleText:       { fontSize: 15, lineHeight: 21 },
  bubbleAttachment: { fontSize: 13, fontStyle: 'italic' },
  bubbleTime:       { fontSize: 10, marginTop: 4, textAlign: 'right' },

  inputBar:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  attachBtn:  { paddingBottom: 8 },
  inputWrap:  { flex: 1, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 120 },
  textInput:  { fontSize: 15, lineHeight: 20, padding: 0 },
  sendBtn:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
}) as unknown as Record<string, any>;
