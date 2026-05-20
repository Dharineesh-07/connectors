// ── Brand palette (mirrors frontend CSS variables) ────────────────────────────
export const CN = {
  red:       '#CC3333',
  redDark:   '#A52828',
  blue:      '#3399CC',
  blueDark:  '#2277AA',
  blueLight: '#E6F3FA',
  redLight:  '#F5E6E6',
  online:    '#22C55E',
  charcoal:  '#2D3748',
  purple:    '#993399',

  light: {
    bg:      '#F4F6F8',
    card:    '#FFFFFF',
    text:    '#2D3748',
    sub:     '#5A6A7A',
    label:   '#9AAAB8',
    border:  '#E8ECF0',
    inputBg: '#FAFBFC',
    gray100: '#F0F2F4',
    gray200: '#E2E8EF',
    gray400: '#9AAAB8',
    gray600: '#6B7A8D',
    msgSelf: '#CC3333',
    msgOther:'#FFFFFF',
  },
  dark: {
    bg:      '#131E2E',
    card:    '#101821',
    text:    '#F4F7FB',
    sub:     '#B4C0CE',
    label:   '#8090A5',
    border:  '#263446',
    inputBg: '#111C28',
    gray100: '#1A2535',
    gray200: '#263446',
    gray400: '#8090A5',
    gray600: '#B4C0CE',
    msgSelf: '#A52828',
    msgOther:'#1A2535',
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────
export type UserItem = {
  id: string;
  full_name: string;
  display_name: string;
  email: string;
  role: 'admin' | 'user';
  department: string;
  avatar_url?: string;
  is_online: boolean;
  is_active: boolean;
};

export type ConvMember = {
  user_id: string;
  user: UserItem;
};

export type LastMessage = {
  id: string;
  content: string;
  type: string;
  sender_id: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar_url?: string;
  members: ConvMember[];
  last_message?: LastMessage;
  unread_count: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender: UserItem;
  content: string;
  type: 'text' | 'image' | 'file';
  created_at: string;
};

export type CallRecord = {
  id: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'ended' | 'ongoing' | 'missed';
  participants: UserItem[];
  group_name?: string;
  duration_seconds?: number;
  started_at: string;
};

export type Reminder = {
  id: string;
  title: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:MM
  completed: boolean;
};

export type AuditLog = {
  id: string;
  action: 'create_user' | 'update_user' | 'deactivate_user' | 'reset_password' | 'broadcast';
  actor: string;
  target: string;
  details: string;
  created_at: string;
};

// ── Demo credentials ──────────────────────────────────────────────────────────
export const DEMO_CREDENTIALS = [
  { email: 'admin@cnc.com', password: 'Admin@123' },
  { email: 'alice@cnc.com', password: 'Alice@123' },
  { email: 'bob@cnc.com',   password: 'Bob@1234'  },
  { email: 'carol@cnc.com', password: 'Carol@123' },
];

// ── Users ─────────────────────────────────────────────────────────────────────
export const USERS: UserItem[] = [
  { id: '1', full_name: 'Admin User',      display_name: 'Admin',   email: 'admin@company.com',  role: 'admin', department: 'IT',          is_online: true,  is_active: true  },
  { id: '2', full_name: 'John Doe',        display_name: 'John',    email: 'john@company.com',   role: 'user',  department: 'Engineering', is_online: true,  is_active: true  },
  { id: '3', full_name: 'Jane Smith',      display_name: 'Jane',    email: 'jane@company.com',   role: 'user',  department: 'Marketing',   is_online: false, is_active: true  },
  { id: '4', full_name: 'Bob Wilson',      display_name: 'Bob',     email: 'bob@company.com',    role: 'user',  department: 'Sales',       is_online: true,  is_active: true  },
  { id: '5', full_name: 'Alice Johnson',   display_name: 'Alice',   email: 'alice@company.com',  role: 'user',  department: 'HR',          is_online: false, is_active: true  },
  { id: '6', full_name: 'Carlos Martinez', display_name: 'Carlos',  email: 'carlos@company.com', role: 'user',  department: 'Engineering', is_online: true,  is_active: true  },
];

// ── Conversations ─────────────────────────────────────────────────────────────
export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv1',
    type: 'direct',
    members: [
      { user_id: '1', user: USERS[0] },
      { user_id: '2', user: USERS[1] },
    ],
    last_message: { id: 'm5', content: 'Sure, let me check on that!', type: 'text', sender_id: '2', created_at: '2026-05-17T09:30:00Z' },
    unread_count: 2,
  },
  {
    id: 'conv2',
    type: 'direct',
    members: [
      { user_id: '1', user: USERS[0] },
      { user_id: '3', user: USERS[2] },
    ],
    last_message: { id: 'm8', content: 'The meeting is at 3pm today', type: 'text', sender_id: '3', created_at: '2026-05-17T08:45:00Z' },
    unread_count: 0,
  },
  {
    id: 'conv3',
    type: 'group',
    name: 'Engineering Team',
    members: [
      { user_id: '1', user: USERS[0] },
      { user_id: '2', user: USERS[1] },
      { user_id: '6', user: USERS[5] },
    ],
    last_message: { id: 'm14', content: 'PRs are ready for review', type: 'text', sender_id: '6', created_at: '2026-05-17T08:35:00Z' },
    unread_count: 5,
  },
  {
    id: 'conv4',
    type: 'direct',
    members: [
      { user_id: '1', user: USERS[0] },
      { user_id: '4', user: USERS[3] },
    ],
    last_message: { id: 'm17', content: 'Got it, thanks!', type: 'text', sender_id: '4', created_at: '2026-05-16T16:20:00Z' },
    unread_count: 0,
  },
  {
    id: 'conv5',
    type: 'direct',
    members: [
      { user_id: '1', user: USERS[0] },
      { user_id: '5', user: USERS[4] },
    ],
    last_message: { id: 'm20', content: 'Please review the policy document', type: 'text', sender_id: '5', created_at: '2026-05-16T14:00:00Z' },
    unread_count: 1,
  },
];

// ── Messages per conversation ─────────────────────────────────────────────────
export const INITIAL_MESSAGES: Record<string, Message[]> = {
  conv1: [
    { id: 'm1', conversation_id: 'conv1', sender_id: '2', sender: USERS[1], content: 'Hey, did you see the latest report?',  type: 'text', created_at: '2026-05-17T08:00:00Z' },
    { id: 'm2', conversation_id: 'conv1', sender_id: '1', sender: USERS[0], content: "Not yet, I'll check it now.",          type: 'text', created_at: '2026-05-17T08:02:00Z' },
    { id: 'm3', conversation_id: 'conv1', sender_id: '2', sender: USERS[1], content: "It's looking really good so far.",    type: 'text', created_at: '2026-05-17T08:03:00Z' },
    { id: 'm4', conversation_id: 'conv1', sender_id: '1', sender: USERS[0], content: 'Thanks for the heads up.',            type: 'text', created_at: '2026-05-17T08:05:00Z' },
    { id: 'm5', conversation_id: 'conv1', sender_id: '2', sender: USERS[1], content: 'Sure, let me check on that!',         type: 'text', created_at: '2026-05-17T09:30:00Z' },
  ],
  conv2: [
    { id: 'm6', conversation_id: 'conv2', sender_id: '3', sender: USERS[2], content: 'Hi! Can we sync about the Q2 campaign?', type: 'text', created_at: '2026-05-17T08:30:00Z' },
    { id: 'm7', conversation_id: 'conv2', sender_id: '1', sender: USERS[0], content: 'Sure, when works for you?',              type: 'text', created_at: '2026-05-17T08:40:00Z' },
    { id: 'm8', conversation_id: 'conv2', sender_id: '3', sender: USERS[2], content: 'The meeting is at 3pm today',            type: 'text', created_at: '2026-05-17T08:45:00Z' },
  ],
  conv3: [
    { id: 'm9',  conversation_id: 'conv3', sender_id: '2', sender: USERS[1], content: 'Morning everyone!',                   type: 'text', created_at: '2026-05-16T09:00:00Z' },
    { id: 'm10', conversation_id: 'conv3', sender_id: '6', sender: USERS[5], content: 'Good morning! Ready for the sprint?', type: 'text', created_at: '2026-05-16T09:01:00Z' },
    { id: 'm11', conversation_id: 'conv3', sender_id: '1', sender: USERS[0], content: "Let's have a quick sync at 10am",     type: 'text', created_at: '2026-05-16T09:02:00Z' },
    { id: 'm12', conversation_id: 'conv3', sender_id: '2', sender: USERS[1], content: "I've pushed the latest changes",      type: 'text', created_at: '2026-05-17T08:30:00Z' },
    { id: 'm13', conversation_id: 'conv3', sender_id: '1', sender: USERS[0], content: "Great! I'll review them shortly",     type: 'text', created_at: '2026-05-17T08:32:00Z' },
    { id: 'm14', conversation_id: 'conv3', sender_id: '6', sender: USERS[5], content: 'PRs are ready for review',            type: 'text', created_at: '2026-05-17T08:35:00Z' },
  ],
  conv4: [
    { id: 'm15', conversation_id: 'conv4', sender_id: '1', sender: USERS[0], content: 'Hey Bob, can you send the Q1 report?', type: 'text', created_at: '2026-05-16T16:00:00Z' },
    { id: 'm16', conversation_id: 'conv4', sender_id: '4', sender: USERS[3], content: 'Sure, sending it over now.',           type: 'text', created_at: '2026-05-16T16:10:00Z' },
    { id: 'm17', conversation_id: 'conv4', sender_id: '4', sender: USERS[3], content: 'Got it, thanks!',                     type: 'text', created_at: '2026-05-16T16:20:00Z' },
  ],
  conv5: [
    { id: 'm18', conversation_id: 'conv5', sender_id: '5', sender: USERS[4], content: 'Hi, the new HR policy is live.',      type: 'text', created_at: '2026-05-16T13:00:00Z' },
    { id: 'm19', conversation_id: 'conv5', sender_id: '1', sender: USERS[0], content: "Thanks Alice, I'll review it.",       type: 'text', created_at: '2026-05-16T13:30:00Z' },
    { id: 'm20', conversation_id: 'conv5', sender_id: '5', sender: USERS[4], content: 'Please review the policy document',  type: 'text', created_at: '2026-05-16T14:00:00Z' },
  ],
};

// ── Call history ──────────────────────────────────────────────────────────────
export const CALL_HISTORY: CallRecord[] = [
  { id: 'c1', type: 'audio', direction: 'incoming', status: 'ended',   participants: [USERS[1]],           duration_seconds: 120, started_at: '2026-05-17T10:00:00Z' },
  { id: 'c2', type: 'video', direction: 'outgoing', status: 'ended',   participants: [USERS[2]],           duration_seconds: 300, started_at: '2026-05-17T09:00:00Z' },
  { id: 'c3', type: 'audio', direction: 'missed',   status: 'missed',  participants: [USERS[5]],           started_at: '2026-05-17T08:30:00Z' },
  { id: 'c4', type: 'audio', direction: 'incoming', status: 'ended',   participants: [USERS[1], USERS[5]], group_name: 'Engineering Team', duration_seconds: 600, started_at: '2026-05-16T15:00:00Z' },
  { id: 'c5', type: 'audio', direction: 'outgoing', status: 'ended',   participants: [USERS[3]],           duration_seconds: 45,  started_at: '2026-05-16T14:00:00Z' },
  { id: 'c6', type: 'video', direction: 'missed',   status: 'missed',  participants: [USERS[4]],           started_at: '2026-05-16T11:00:00Z' },
  { id: 'c7', type: 'audio', direction: 'incoming', status: 'ended',   participants: [USERS[1]],           duration_seconds: 180, started_at: '2026-05-15T16:00:00Z' },
  { id: 'c8', type: 'video', direction: 'outgoing', status: 'ended',   participants: [USERS[2]],           duration_seconds: 240, started_at: '2026-05-15T14:00:00Z' },
  { id: 'c9', type: 'audio', direction: 'incoming', status: 'missed',  participants: [USERS[3]],           started_at: '2026-05-14T10:00:00Z' },
  { id: 'c10',type: 'video', direction: 'outgoing', status: 'ended',   participants: [USERS[1]],           duration_seconds: 480, started_at: '2026-05-13T09:30:00Z' },
];

// ── Reminders ─────────────────────────────────────────────────────────────────
export const INITIAL_REMINDERS: Reminder[] = [
  { id: 'r1', title: 'Team standup',         date: '2026-05-17', time: '10:00', completed: false },
  { id: 'r2', title: 'Review Q2 budget',     date: '2026-05-17', time: '14:00', completed: false },
  { id: 'r3', title: 'Engineering meeting',  date: '2026-05-18', time: '11:00', completed: false },
  { id: 'r4', title: 'Submit expense report',date: '2026-05-20', time: '09:00', completed: false },
  { id: 'r5', title: 'Product demo',         date: '2026-05-21', time: '13:00', completed: false },
  { id: 'r6', title: 'Monthly review',       date: '2026-05-25', time: '15:00', completed: false },
  { id: 'r7', title: 'Client call',          date: '2026-05-15', time: '13:00', completed: true  },
  { id: 'r8', title: 'Deploy new release',   date: '2026-05-10', time: '09:00', completed: true  },
  { id: 'r9', title: 'Design review',        date: '2026-05-12', time: '10:30', completed: true  },
];

// ── Audit logs ────────────────────────────────────────────────────────────────
export const AUDIT_LOGS: AuditLog[] = [
  { id: 'a1',  action: 'create_user',     actor: 'Admin User', target: 'Jane Smith',      details: 'New employee onboarded',     created_at: '2026-05-15T10:00:00Z' },
  { id: 'a2',  action: 'deactivate_user', actor: 'Admin User', target: 'Carlos Martinez', details: 'Temporary suspension',        created_at: '2026-05-14T14:00:00Z' },
  { id: 'a3',  action: 'reset_password',  actor: 'Admin User', target: 'John Doe',        details: 'User requested reset',        created_at: '2026-05-14T11:00:00Z' },
  { id: 'a4',  action: 'update_user',     actor: 'Admin User', target: 'Bob Wilson',      details: 'Department updated to Sales', created_at: '2026-05-13T09:00:00Z' },
  { id: 'a5',  action: 'create_user',     actor: 'Admin User', target: 'Alice Johnson',   details: 'New HR manager onboarded',    created_at: '2026-05-12T16:00:00Z' },
  { id: 'a6',  action: 'broadcast',       actor: 'Admin User', target: 'All Users',       details: 'Policy update announcement',  created_at: '2026-05-11T10:00:00Z' },
  { id: 'a7',  action: 'create_user',     actor: 'Admin User', target: 'Bob Wilson',      details: 'New sales rep onboarded',     created_at: '2026-05-10T09:00:00Z' },
  { id: 'a8',  action: 'reset_password',  actor: 'Admin User', target: 'Jane Smith',      details: 'Password expired reset',      created_at: '2026-05-09T15:00:00Z' },
  { id: 'a9',  action: 'update_user',     actor: 'Admin User', target: 'John Doe',        details: 'Role updated to senior',      created_at: '2026-05-08T11:00:00Z' },
  { id: 'a10', action: 'deactivate_user', actor: 'Admin User', target: 'Carlos Martinez', details: 'Account suspended',           created_at: '2026-05-07T14:00:00Z' },
  { id: 'a11', action: 'create_user',     actor: 'Admin User', target: 'Carlos Martinez', details: 'New engineer onboarded',      created_at: '2026-05-05T09:00:00Z' },
  { id: 'a12', action: 'broadcast',       actor: 'Admin User', target: 'All Users',       details: 'System maintenance notice',   created_at: '2026-05-04T08:00:00Z' },
];

// ── Shared helpers ────────────────────────────────────────────────────────────
export function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000
  );
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
