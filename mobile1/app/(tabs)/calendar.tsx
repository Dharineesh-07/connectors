import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { CN } from '@/data/static';
import {
  listReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  toRFC3339,
  extractDate,
  extractTime,
  type ApiReminder,
} from '@/api/reminders';

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Types ─────────────────────────────────────────────────────────────────────
type UIReminder = {
  id: string;
  title: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:MM
  completed: boolean;
  due_date: string; // RFC3339 — kept for PATCH calls
};

function apiToUI(r: ApiReminder): UIReminder {
  return {
    id:        r.id,
    title:     r.title,
    date:      extractDate(r.due_date),
    time:      extractTime(r.due_date),
    completed: r.is_completed,
    due_date:  r.due_date,
  };
}

// ── Calendar helpers ──────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function toDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}
function todayStr(): string {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
}

// ── ReminderModal ─────────────────────────────────────────────────────────────
function ReminderModal({ visible, reminder, defaultDate, onSave, onClose, isDark }: {
  visible: boolean;
  reminder: UIReminder | null;
  defaultDate: string;
  onSave: (r: UIReminder) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const c = isDark ? CN.dark : CN.light;
  const [title, setTitle] = useState('');
  const [date, setDate]   = useState(defaultDate);
  const [time, setTime]   = useState('09:00');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = () => {
    setTitle(reminder?.title ?? '');
    setDate(reminder?.date  ?? defaultDate);
    setTime(reminder?.time  ?? '09:00');
    setError('');
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Date must be YYYY-MM-DD.'); return; }
    if (!/^\d{2}:\d{2}$/.test(time))        { setError('Time must be HH:MM.'); return; }
    setSaving(true);
    setError('');
    try {
      const dueDate = toRFC3339(date, time);
      let saved: ApiReminder;
      if (reminder) {
        saved = await updateReminder(reminder.id, { title: title.trim(), due_date: dueDate });
      } else {
        saved = await createReminder(title.trim(), dueDate);
      }
      onSave(apiToUI(saved));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={handleOpen}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalAccent}>
            <View style={[styles.accentSlice, { backgroundColor: CN.red }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.purple }]} />
            <View style={[styles.accentSlice, { backgroundColor: CN.blue }]} />
          </View>

          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {reminder ? 'Edit Reminder' : 'New Reminder'}
              </Text>
              <Text style={[styles.modalSub, { color: c.label }]}>
                Set a title, date, and time
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={c.label} />
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={[styles.errorBadge, { margin: 16 }]}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.modalBody}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: c.label }]}>Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                placeholder="e.g. Team meeting"
                placeholderTextColor={c.label}
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: c.label }]}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                  placeholder="2026-05-17"
                  placeholderTextColor={c.label}
                  value={date}
                  onChangeText={setDate}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1, minWidth: 80 }]}>
                <Text style={[styles.fieldLabel, { color: c.label }]}>Time</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }]}
                  placeholder="09:00"
                  placeholderTextColor={c.label}
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </View>

          <View style={[styles.modalFooter, { borderTopColor: c.border }]}>
            <TouchableOpacity onPress={onClose}
              style={[styles.footerBtn, { borderColor: c.border }]}>
              <Text style={[styles.footerBtnText, { color: c.label }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}
              style={[styles.footerBtn, styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── CalendarScreen ────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? CN.dark : CN.light;
  const insets = useSafeAreaInsets();

  const today = todayStr();
  const todayDate = new Date();

  const [year, setYear]         = useState(todayDate.getFullYear());
  const [month, setMonth]       = useState(todayDate.getMonth());
  const [selected, setSelected] = useState(today);
  const [reminders, setReminders] = useState<UIReminder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget]     = useState<UIReminder | null>(null);

  const fetchReminders = useCallback(async () => {
    try {
      const data = await listReminders();
      setReminders(data.map(apiToUI));
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const goToPrevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToToday = () => {
    setYear(todayDate.getFullYear());
    setMonth(todayDate.getMonth());
    setSelected(today);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfWeek(year, month);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const remindersByDate: Record<string, UIReminder[]> = {};
  for (const r of reminders) {
    if (!remindersByDate[r.date]) remindersByDate[r.date] = [];
    remindersByDate[r.date].push(r);
  }

  const selectedReminders = remindersByDate[selected] ?? [];
  const totalCount = reminders.filter(r => !r.completed).length;

  const toggleCompleted = async (r: UIReminder) => {
    const next = !r.completed;
    setReminders(prev => prev.map(x => x.id === r.id ? { ...x, completed: next } : x));
    try {
      await updateReminder(r.id, { is_completed: next });
    } catch {
      setReminders(prev => prev.map(x => x.id === r.id ? { ...x, completed: r.completed } : x));
    }
  };

  const handleDeleteReminder = (r: UIReminder) => {
    Alert.alert('Delete Reminder', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setReminders(prev => prev.filter(x => x.id !== r.id));
        try {
          await deleteReminder(r.id);
        } catch {
          setReminders(prev => [r, ...prev]);
        }
      }},
    ]);
  };

  const openCreate = () => { setEditTarget(null); setModalVisible(true); };
  const openEdit   = (r: UIReminder) => { setEditTarget(r); setModalVisible(true); };

  const handleSave = (r: UIReminder) => {
    setReminders(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = r;
        return next;
      }
      return [...prev, r];
    });
    setModalVisible(false);
    setSelected(r.date);
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
          top: insets.top - 175, right: -30, backgroundColor: CN.blue, opacity: 0.6 }} />

        <View style={[styles.headerContent, { paddingTop: insets.top }]}>
          <View style={styles.titleArea}>
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.headerTitle}>Calendar</Text>
          </View>
          <View style={styles.headerRight}>
            {totalCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{totalCount}</Text>
              </View>
            )}
            <TouchableOpacity onPress={openCreate} style={styles.addBtn}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CN.red} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>

          {/* Month navigator */}
          <View style={[styles.monthNav, { backgroundColor: c.card, borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navArrow}>
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToToday}>
              <Text style={[styles.monthLabel, { color: c.text }]}>
                {MONTH_NAMES[month]} {year}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToNextMonth} style={styles.navArrow}>
              <Ionicons name="chevron-forward" size={20} color={c.text} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={[styles.calGrid, { backgroundColor: c.card }]}>
            <View style={styles.dayNamesRow}>
              {DAY_NAMES.map(d => (
                <Text key={d} style={[styles.dayName, { color: c.label }]}>{d}</Text>
              ))}
            </View>

            {/* Calendar cells */}
            <View style={styles.cellsGrid}>
              {cells.map((day, idx) => {
                if (!day) return <View key={`e${idx}`} style={styles.cell} />;
                const dateStr = toDateStr(year, month, day);
                const isToday    = dateStr === today;
                const isSel      = dateStr === selected;
                const hasReminder = (remindersByDate[dateStr]?.length ?? 0) > 0;

                return (
                  <TouchableOpacity
                    key={dateStr}
                    onPress={() => setSelected(dateStr)}
                    style={[
                      styles.cell,
                      isSel && styles.cellSelected,
                      isToday && !isSel && styles.cellToday,
                    ]}
                  >
                    <Text style={[
                      styles.cellText,
                      { color: isSel ? '#fff' : isToday ? CN.red : c.text },
                      isSel && styles.cellTextSelected,
                    ]}>
                      {day}
                    </Text>
                    {hasReminder && (
                      <View style={[styles.cellDot, { backgroundColor: isSel ? 'rgba(255,255,255,0.8)' : CN.red }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Reminders for selected date */}
          <View style={styles.remindersSection}>
            <View style={styles.remindersHeader}>
              <Text style={[styles.remindersTitle, { color: c.text }]}>
                {selected === today ? "Today's Reminders" : `Reminders for ${selected}`}
              </Text>
              <TouchableOpacity onPress={openCreate} style={[styles.addReminderBtn, { backgroundColor: CN.red }]}>
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={styles.addReminderText}>Add</Text>
              </TouchableOpacity>
            </View>

            {selectedReminders.length === 0 ? (
              <View style={[styles.emptyReminders, { backgroundColor: c.card, borderColor: c.border }]}>
                <Ionicons name="alarm-outline" size={28} color={c.label} />
                <Text style={[styles.emptyReminderText, { color: c.label }]}>No reminders for this day</Text>
                <TouchableOpacity onPress={openCreate}
                  style={[styles.emptyAddBtn, { backgroundColor: CN.blueLight }]}>
                  <Text style={[styles.emptyAddText, { color: CN.blue }]}>Add a reminder</Text>
                </TouchableOpacity>
              </View>
            ) : (
              selectedReminders.map(r => (
                <View key={r.id} style={[styles.reminderCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <TouchableOpacity onPress={() => toggleCompleted(r)} style={styles.reminderCheck}>
                    <View style={[
                      styles.checkbox,
                      { borderColor: r.completed ? CN.online : c.border },
                      r.completed && { backgroundColor: CN.online },
                    ]}>
                      {r.completed && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.reminderContent}>
                    <Text style={[
                      styles.reminderTitle,
                      { color: c.text },
                      r.completed && { textDecorationLine: 'line-through', color: c.label },
                    ]}>
                      {r.title}
                    </Text>
                    <View style={styles.reminderMeta}>
                      <Ionicons name="alarm-outline" size={12} color={c.label} />
                      <Text style={[styles.reminderTime, { color: c.label }]}>{r.time}</Text>
                    </View>
                  </View>

                  <View style={styles.reminderActions}>
                    <TouchableOpacity onPress={() => openEdit(r)} style={styles.iconBtn}>
                      <Ionicons name="pencil-outline" size={16} color={c.label} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteReminder(r)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={16} color={CN.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Upcoming reminders summary */}
          {reminders.filter(r => !r.completed && r.date >= today && r.date !== selected).length > 0 && (
            <View style={styles.upcomingSection}>
              <Text style={[styles.upcomingTitle, { color: c.label }]}>UPCOMING</Text>
              {reminders
                .filter(r => !r.completed && r.date >= today && r.date !== selected)
                .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                .slice(0, 5)
                .map(r => (
                  <TouchableOpacity key={r.id} onPress={() => setSelected(r.date)}
                    style={[styles.upcomingItem, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={[styles.upcomingDot, { backgroundColor: CN.blue }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.upcomingItemTitle, { color: c.text }]}>{r.title}</Text>
                      <Text style={[styles.upcomingItemDate, { color: c.label }]}>{r.date} at {r.time}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.label} />
                  </TouchableOpacity>
                ))
              }
            </View>
          )}
        </ScrollView>
      )}

      <ReminderModal
        visible={modalVisible}
        reminder={editTarget}
        defaultDate={selected}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
        isDark={isDark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {},
  headerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 1 },
  titleArea:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:{ color: '#fff', fontWeight: '800', fontSize: 18 },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText:  { color: '#fff', fontSize: 11, fontWeight: '800' },
  addBtn:     { padding: 4 },

  monthNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  navArrow:   { padding: 6 },
  monthLabel: { fontSize: 16, fontWeight: '700' },

  calGrid:    { paddingBottom: 12 },
  dayNamesRow:{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8 },
  dayName:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cellsGrid:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell:       { width: '14.285714%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6, minWidth: 32 },
  cellSelected:{ backgroundColor: CN.red },
  cellToday:  { borderWidth: 1.5, borderColor: CN.red },
  cellText:   { fontSize: 13, fontWeight: '500' },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellDot:    { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 4 },

  remindersSection: { paddingHorizontal: 16, paddingTop: 20 },
  remindersHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  remindersTitle:   { fontSize: 15, fontWeight: '700' },
  addReminderBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addReminderText:  { color: '#fff', fontSize: 12, fontWeight: '700' },

  emptyReminders:   { borderRadius: 12, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8 },
  emptyReminderText:{ fontSize: 14 },
  emptyAddBtn:      { marginTop: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  emptyAddText:     { fontSize: 13, fontWeight: '600' },

  reminderCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8, gap: 12 },
  reminderCheck:  { padding: 2 },
  checkbox:       { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  reminderContent:{ flex: 1 },
  reminderTitle:  { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  reminderMeta:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reminderTime:   { fontSize: 12 },
  reminderActions:{ flexDirection: 'row', gap: 4 },
  iconBtn:        { padding: 6 },

  upcomingSection:{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  upcomingTitle:  { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  upcomingItem:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 6, gap: 10 },
  upcomingDot:    { width: 8, height: 8, borderRadius: 4 },
  upcomingItemTitle:{ fontSize: 13, fontWeight: '600' },
  upcomingItemDate: { fontSize: 11, marginTop: 2 },

  // Modal
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard:  { width: '100%', maxWidth: 420, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  modalAccent:{ flexDirection: 'row', height: 4 },
  accentSlice:{ flex: 1 },
  modalHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontWeight: '700', fontSize: 16 },
  modalSub:   { fontSize: 12, marginTop: 2 },
  closeBtn:   { padding: 4 },
  modalBody:  { padding: 16, gap: 12 },
  fieldRow:   { flexDirection: 'row', gap: 10 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  input:      { height: 44, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 14 },
  modalFooter:{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  footerBtn:  { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  footerBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn:    { backgroundColor: CN.red, borderColor: CN.red },
  saveBtnText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  errorBadge: { backgroundColor: '#F5E6E6', borderLeftWidth: 4, borderLeftColor: CN.red, borderRadius: 8, padding: 12 },
  errorText:  { color: CN.red, fontSize: 13, fontWeight: '600' },
}) as unknown as Record<string, any>;
