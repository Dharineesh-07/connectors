import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { CN, USERS } from '@/data/static';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ icon, value, label, color, isDark }: {
  icon: string; value: string | number; label: string; color: string; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  return (
    <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.label }]}>{label}</Text>
    </View>
  );
}

function NavCard({ icon, title, subtitle, onPress, isDark }: {
  icon: string; title: string; subtitle: string; onPress: () => void; isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.navCard, { backgroundColor: c.card, borderColor: c.border }]}
      activeOpacity={0.75}
    >
      <View style={[styles.navIcon, { backgroundColor: CN.redLight }]}>
        <Ionicons name={icon as any} size={22} color={CN.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.navSubtitle, { color: c.label }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.label} />
    </TouchableOpacity>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const displayName = user?.display_name || user?.full_name || 'Admin';
  const totalUsers  = USERS.length;
  const activeUsers = USERS.filter(u => u.is_online).length;
  const headerHeight = 120 + insets.top;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style="light" />

      {/* Gradient header */}
      <View style={[styles.header, { minHeight: headerHeight, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: CN.charcoal }]} />
        {/* Grid pattern overlay */}
        <View style={[StyleSheet.absoluteFillObject, { opacity: 0.06 }]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={{ height: 1, backgroundColor: '#fff', marginTop: 14 }} />
          ))}
        </View>
        <View style={{ position: 'absolute', width: 300, height: 300, borderRadius: 150,
          top: insets.top - 180, left: -60, backgroundColor: CN.red, opacity: 0.65 }} />
        <View style={{ position: 'absolute', width: 240, height: 240, borderRadius: 120,
          top: insets.top - 160, right: -40, backgroundColor: CN.blue, opacity: 0.55 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={[styles.adminBadge]}>
            <Ionicons name="shield-checkmark" size={14} color={CN.red} />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        </View>

        <View style={styles.greetingArea}>
          <Text style={styles.greetingLabel}>{greeting()},</Text>
          <Text style={styles.greetingName}>{displayName} 👋</Text>
          <Text style={styles.greetingSub}>Here's your platform overview</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard icon="people" value={totalUsers}  label="Total Employees" color={CN.blue} isDark={isDark} />
        <StatCard icon="wifi"   value={activeUsers} label="Active Users"    color={CN.online} isDark={isDark} />
      </View>

      {/* Navigation cards */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.label }]}>MANAGEMENT</Text>

        <NavCard
          icon="people-outline"
          title="Manage Users"
          subtitle={`${totalUsers} employees registered`}
          onPress={() => router.push('/admin/users')}
          isDark={isDark}
        />
        <NavCard
          icon="document-text-outline"
          title="Audit Logs"
          subtitle="View all admin activity"
          onPress={() => router.push('/admin/audit-logs')}
          isDark={isDark}
        />
      </View>

      {/* Quick info */}
      <View style={[styles.infoCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="information-circle-outline" size={16} color={CN.blue} />
        <Text style={[styles.infoText, { color: c.sub }]}>
          Admin panel for managing employees and reviewing platform activity.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 20 },
  backBtn:      { padding: 8, borderRadius: 8 },
  adminBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  adminBadgeText:{ color: '#fff', fontSize: 12, fontWeight: '700' },
  greetingArea: { paddingHorizontal: 20, zIndex: 1 },
  greetingLabel:{ color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  greetingName: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  greetingSub:  { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: -16 },
  statCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  statIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue:{ fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  statLabel:{ fontSize: 11, fontWeight: '600', textAlign: 'center' },

  section:       { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle:  { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  navCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  navIcon:       { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navTitle:      { fontSize: 14, fontWeight: '700' },
  navSubtitle:   { fontSize: 12, marginTop: 2 },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 14, marginHorizontal: 16, marginTop: 16 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
}) as unknown as Record<string, any>;
