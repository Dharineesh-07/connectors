import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { CN } from '@/data/static';
import { getAuditLogs, type AuditLogEntry } from '@/api/admin';

const PAGE_SIZE = 20;

type ActionFilter = 'all' | string;

const ACTION_FILTERS: { key: ActionFilter; label: string }[] = [
  { key: 'all',             label: 'All'            },
  { key: 'create_user',     label: 'Create User'    },
  { key: 'update_user',     label: 'Update User'    },
  { key: 'deactivate_user', label: 'Deactivate'     },
  { key: 'reset_password',  label: 'Reset Password' },
  { key: 'broadcast',       label: 'Broadcast'      },
];

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  create_user:     { icon: 'person-add-outline',    color: CN.online,   label: 'Create User'    },
  update_user:     { icon: 'pencil-outline',         color: CN.blue,     label: 'Update User'    },
  deactivate_user: { icon: 'person-remove-outline', color: CN.red,      label: 'Deactivate'     },
  reset_password:  { icon: 'key-outline',            color: '#9333EA',   label: 'Reset Password' },
  broadcast:       { icon: 'megaphone-outline',      color: '#F59E0B',   label: 'Broadcast'      },
};

const DEFAULT_META = { icon: 'document-text-outline', color: CN.blue, label: 'Action' };

function formatLogTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── LogItem ───────────────────────────────────────────────────────────────────
function LogItem({ log, isDark }: { log: AuditLogEntry; isDark: boolean }) {
  const c = isDark ? CN.dark : CN.light;
  const meta = ACTION_META[log.action] ?? DEFAULT_META;
  const actor  = log.admin?.full_name ?? 'Admin';
  const target = log.target_user?.full_name ?? 'All Users';

  let details = '';
  if (log.details) {
    try {
      const parsed = JSON.parse(log.details);
      details = typeof parsed === 'object'
        ? Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ')
        : String(parsed);
    } catch {
      details = log.details;
    }
  }

  return (
    <View style={[styles.logItem, { backgroundColor: c.card, borderBottomColor: c.border }]}>
      <View style={[styles.logIconWrap, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
      </View>
      <View style={styles.logContent}>
        <View style={styles.logTopRow}>
          <View style={[styles.actionBadge, { backgroundColor: meta.color + '18' }]}>
            <Text style={[styles.actionBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={[styles.logTime, { color: c.label }]}>{formatLogTime(log.created_at)}</Text>
        </View>
        <View style={styles.logBottomRow}>
          <Text style={[styles.logActor, { color: c.text }]} numberOfLines={1}>{actor}</Text>
          <Ionicons name="arrow-forward" size={12} color={c.label} style={{ marginHorizontal: 4 }} />
          <Text style={[styles.logTarget, { color: c.sub }]} numberOfLines={1}>{target}</Text>
        </View>
        {!!details && (
          <Text style={[styles.logDetails, { color: c.label }]} numberOfLines={2}>{details}</Text>
        )}
      </View>
    </View>
  );
}

// ── AuditLogsScreen ───────────────────────────────────────────────────────────
export default function AuditLogsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const [logs, setLogs]         = useState<AuditLogEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<ActionFilter>('all');

  const loadLogs = useCallback(async (p: number, action: ActionFilter) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: PAGE_SIZE };
      if (action !== 'all') params.action = action;
      const res = await getAuditLogs(params);
      setLogs(res.logs ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.total_pages ?? 1);
      setPage(p);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(1, filter);
  }, [loadLogs, filter]);

  const handleFilterChange = (f: ActionFilter) => {
    setFilter(f);
  };

  const headerHeight = 60 + insets.top;

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
            <Text style={styles.headerTitle}>Audit Logs</Text>
            <Text style={styles.headerSub}>{loading ? '…' : `${total} entries`}</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      {/* Filter row */}
      <View style={[styles.filterWrap, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {ACTION_FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity key={f.key} onPress={() => handleFilterChange(f.key)}
                style={[styles.filterBtn, active && { backgroundColor: CN.red }]}>
                <Text style={[styles.filterBtnText, { color: active ? '#fff' : c.label }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Log list */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CN.red} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          style={{ flex: 1 }}
          renderItem={({ item }) => <LogItem log={item} isDark={isDark} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={36} color={c.label} />
              <Text style={[styles.emptyText, { color: c.label }]}>No logs found</Text>
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
            onPress={() => loadLogs(page - 1, filter)}
            disabled={page <= 1}
            style={[styles.pageBtn, { backgroundColor: c.gray100, opacity: page <= 1 ? 0.4 : 1 }]}
          >
            <Ionicons name="chevron-back" size={18} color={c.text} />
            <Text style={[styles.pageBtnText, { color: c.text }]}>Previous</Text>
          </TouchableOpacity>
          <Text style={[styles.pageLabel, { color: c.label }]}>
            {page} / {totalPages}
          </Text>
          <TouchableOpacity
            onPress={() => loadLogs(page + 1, filter)}
            disabled={page >= totalPages}
            style={[styles.pageBtn, { backgroundColor: c.gray100, opacity: page >= totalPages ? 0.4 : 1 }]}
          >
            <Text style={[styles.pageBtnText, { color: c.text }]}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={c.text} />
          </TouchableOpacity>
        </View>
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

  filterWrap:   { borderBottomWidth: 1 },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterBtn:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  filterBtnText:{ fontSize: 12, fontWeight: '600' },

  logItem:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  logIconWrap:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  logContent:   { flex: 1, gap: 4 },
  logTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  logTime:      { fontSize: 11 },
  logBottomRow: { flexDirection: 'row', alignItems: 'center' },
  logActor:     { fontWeight: '600', fontSize: 13, maxWidth: '40%' },
  logTarget:    { fontSize: 13, flex: 1 },
  logDetails:   { fontSize: 11, lineHeight: 16 },

  emptyState:   { paddingTop: 80, alignItems: 'center', gap: 12 },
  emptyText:    { fontSize: 14 },

  pagination:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1 },
  pageBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  pageBtnText:  { fontSize: 13, fontWeight: '600' },
  pageLabel:    { fontSize: 13 },
}) as unknown as Record<string, any>;
