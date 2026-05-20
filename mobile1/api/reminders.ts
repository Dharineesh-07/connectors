import { API_BASE_URL } from './config';
import { getAccessToken } from '@/context/AuthContext';

export type ApiReminder = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  due_date: string; // RFC3339 datetime, e.g. "2026-05-17T10:00:00Z"
  is_completed: boolean;
  notified: boolean;
  created_at: string;
  updated_at: string;
};

async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });
  if (res.status === 204) return undefined as unknown as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const listReminders = () =>
  authFetch<ApiReminder[]>('/reminders');

export const createReminder = (title: string, dueDate: string) =>
  authFetch<ApiReminder>('/reminders', {
    method: 'POST',
    body: JSON.stringify({ title, due_date: dueDate }),
  });

export const updateReminder = (
  id: string,
  patch: Partial<{ title: string; due_date: string; is_completed: boolean }>,
) =>
  authFetch<ApiReminder>(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const deleteReminder = (id: string) =>
  authFetch<void>(`/reminders/${id}`, { method: 'DELETE' });

/** Convert a YYYY-MM-DD date string + HH:MM time string to RFC3339. */
export function toRFC3339(date: string, time: string): string {
  return `${date}T${time}:00Z`;
}

/** Extract YYYY-MM-DD from an RFC3339 string. */
export function extractDate(rfc3339: string): string {
  return rfc3339.slice(0, 10);
}

/** Extract HH:MM from an RFC3339 string (UTC). */
export function extractTime(rfc3339: string): string {
  const d = new Date(rfc3339);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
