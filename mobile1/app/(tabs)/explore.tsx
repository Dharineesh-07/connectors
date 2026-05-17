import { useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CN, CALL_HISTORY, getInitials, formatTime, formatDuration,
  type CallRecord,
} from '@/data/static';

type FilterType = 'all' | 'incoming' | 'outgoing' | 'missed';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'incoming', label: 'Incoming' },
  { key: 'outgoing', label: 'Outgoing' },
  { key: 'missed',   label: 'Missed' },
];

// ── MiniAvatar ────────────────────────────────────────────────────────────────
function StackedAvatars({ names, size = 28 }: { names: string[]; size?: number }) {
  const shown = names.slice(0, 3);
  const extra = names.length - 3;
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden' }}>
      {shown.map((name, i) => (
        <View key={i} style={[{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: CN.charcoal,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: '#fff',
          marginLeft: i === 0 ? 0 : -(size * 0.3),
          zIndex: shown.length - i,
        }]}>
          <Text style={{ color: '#fff', fontSize: size * 0.32, fontWeight: '700' }}>
            {getInitials(name)}
          </Text>
        </View>
      ))}
      {extra > 0 && (
        <View style={[{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: CN.blue,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: '#fff',
          marginLeft: -(size * 0.3),
        }]}>
          <Text style={{ color: '#fff', fontSize: size * 0.3, fontWeight: '700' }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CallRecord['status'] }) {
  const cfg = {
    ended:   { bg: '#F0F2F4', text: '#6B7A8D', label: 'Ended' },
    ongoing: { bg: '#E6F9EE', text: '#16A34A', label: 'Ongoing' },
    missed:  { bg: '#F5E6E6', text: CN.red,    label: 'Missed'  },
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Direction icon ────────────────────────────────────────────────────────────
function DirectionIcon({ direction, type }: { direction: CallRecord['direction']; type: CallRecord['type'] }) {
  const color = direction === 'missed' ? CN.red : direction === 'incoming' ? CN.blue : CN.online;
  const iconName: any =
    direction === 'incoming' ? 'call-outline' :
    direction === 'outgoing' ? 'call-outline' :
    'call-outline';
  return (
    <View style={[styles.dirIcon, { backgroundColor: color + '18', transform: [{ scaleX: direction === 'outgoing' ? -1 : 1 }] }]}>
      <Ionicons name={type === 'video' ? 'videocam-outline' : iconName} size={16} color={color} />
    </View>
  );
}

// ── CallCard ──────────────────────────────────────────────────────────────────
function CallCard({ call, isDark }: { call: CallRecord; isDark: boolean }) {
  const c = isDark ? CN.dark : CN.light;
  const names = call.group_name
    ? [call.group_name]
    : call.participants.map(p => p.display_name || p.full_name);
  const displayName = call.group_name ?? (call.participants[0]?.display_name || call.participants[0]?.full_name);
  const isGroup = !!call.group_name || call.participants.length > 1;
  const dirLabel = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed' }[call.direction];

  return (
    <View style={[styles.callCard, { backgroundColor: c.card, borderBottomColor: c.border }]}>
      <StackedAvatars names={names} size={44} />

      <View style={styles.callInfo}>
        <View style={styles.callRow}>
          <Text style={[styles.callName, { color: c.text }]} numberOfLines={1}>
            {displayName}
            {isGroup && !call.group_name && ` +${call.participants.length - 1}`}
          </Text>
          <Text style={[styles.callTime, { color: c.label }]}>{formatTime(call.started_at)}</Text>
        </View>
        <View style={styles.callRow}>
          <View style={styles.callMeta}>
            <DirectionIcon direction={call.direction} type={call.type} />
            <Text style={[styles.callDir, { color: call.direction === 'missed' ? CN.red : c.sub }]}>
              {dirLabel}
            </Text>
            {call.type === 'video' && (
              <View style={[styles.typePill, { backgroundColor: CN.blueLight }]}>
                <Text style={[styles.typePillText, { color: CN.blue }]}>Video</Text>
              </View>
            )}
            {isGroup && (
              <View style={[styles.typePill, { backgroundColor: c.gray100 }]}>
                <Text style={[styles.typePillText, { color: c.label }]}>Group</Text>
              </View>
            )}
          </View>
          <View style={styles.callRight}>
            {call.duration_seconds && (
              <Text style={[styles.duration, { color: c.label }]}>{formatDuration(call.duration_seconds)}</Text>
            )}
            <StatusBadge status={call.status} />
          </View>
        </View>
      </View>
    </View>
  );
}

// ── CallHistoryScreen ─────────────────────────────────────────────────────────
export default function CallHistoryScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = CALL_HISTORY.filter(call => {
    if (filter === 'all') return true;
    return call.direction === filter;
  });

  const headerHeight = 60 + insets.top;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { height: headerHeight, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: CN.charcoal }]} />
        <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150,
          top: insets.top - 210, left: -60, backgroundColor: CN.red, opacity: 0.7 }} />
        <View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120,
          top: insets.top - 190, right: -40, backgroundColor: CN.blue, opacity: 0.6 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top }]}>
          <View style={styles.titleArea}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.headerTitle}>Call History</Text>
          </View>
          <Text style={styles.headerCount}>{CALL_HISTORY.length} calls</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[styles.filterRow, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterBtn, active && { backgroundColor: CN.red }]}
              >
                <Text style={[styles.filterBtnText, { color: active ? '#fff' : c.label }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Call list */}
      <FlatList
        data={filtered}
        keyExtractor={(call) => call.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => <CallCard call={item} isDark={isDark} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyCircle}>
              <Ionicons name="call-outline" size={32} color={CN.red} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No calls found</Text>
            <Text style={[styles.emptySubtitle, { color: c.label }]}>
              {filter !== 'all' ? `No ${filter} calls in history` : 'Your call history will appear here'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {},
  headerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 1 },
  titleArea:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:  { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerCount:  { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

  filterRow:   { borderBottomWidth: 1 },
  filterScroll:{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterBtn:   { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'transparent' },
  filterBtnText:{ fontSize: 13, fontWeight: '600' },

  callCard:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  callInfo:    { flex: 1 },
  callRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  callName:    { fontWeight: '600', fontSize: 15, flex: 1 },
  callTime:    { fontSize: 12, marginLeft: 8 },
  callMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  callRight:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  callDir:     { fontSize: 12, fontWeight: '500' },

  dirIcon:     { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  typePill:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typePillText:{ fontSize: 10, fontWeight: '700' },

  duration:    { fontSize: 11, fontWeight: '500' },

  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyState:    { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyCircle:   { width: 68, height: 68, borderRadius: 34, backgroundColor: CN.redLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:    { fontSize: 16, fontWeight: '700' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
}) as unknown as Record<string, any>;
