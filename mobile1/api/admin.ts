import { API_BASE_URL } from './config';
import { getAccessToken } from '@/context/AuthContext';

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  display_name?: string;
  avatar_url?: string;
  role: string;
  department?: string;
  is_active: boolean;
  is_online: boolean;
  last_seen?: string;
  created_at: string;
  updated_at: string;
};

export type AdminStats = {
  total_users: number;
  active_users: number;
  online_users: number;
  messages_today: number;
  calls_today: number;
  new_users_this_week: number;
};

export type AuditLogUser = {
  id: string;
  full_name: string;
  email: string;
};

export type AuditLogEntry = {
  id: string;
  admin_id: string;
  action: string;
  target_user_id?: string | null;
  details?: string | null;
  created_at: string;
  admin?: AuditLogUser;
  target_user?: AuditLogUser | null;
};

export type UserListResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export type AuditLogListResponse = {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
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

export const getAdminStats = () =>
  authFetch<AdminStats>('/admin/stats');

export const listAdminUsers = (params: Record<string, string | number> = {}): Promise<UserListResponse> => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  return authFetch<UserListResponse>(`/admin/users${qs ? `?${qs}` : ''}`);
};

export const createAdminUser = (body: {
  email: string;
  full_name: string;
  department?: string;
  role?: string;
}) =>
  authFetch<AdminUser>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deactivateUser = (userId: string) =>
  authFetch<{ message: string }>(`/admin/users/${userId}`, { method: 'DELETE' });

export const resetUserPassword = (userId: string, newPassword: string) =>
  authFetch<void>(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  });

export const getAuditLogs = (params: Record<string, string | number> = {}): Promise<AuditLogListResponse> => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  return authFetch<AuditLogListResponse>(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
};

export const sendBroadcast = (content: string) =>
  authFetch<void>('/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
