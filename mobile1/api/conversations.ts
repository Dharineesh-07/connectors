import { API_BASE_URL } from './config';
import { getAccessToken } from '@/context/AuthContext';

export type ConvMember = {
  user_id: number;
  user: {
    id: number;
    full_name: string;
    display_name?: string;
    avatar_url?: string;
    is_online?: boolean;
  };
};

export type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar_url?: string;
  members?: ConvMember[];
  last_message?: {
    id: string;
    content: string;
    type: string;
    sender_id: number;
    created_at: string;
  };
  unread_count?: number;
};

export type UserItem = {
  id: number;
  full_name: string;
  display_name?: string;
  email?: string;
  department?: string;
  avatar_url?: string;
  is_online?: boolean;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: number;
  sender?: {
    id: number;
    full_name: string;
    display_name?: string;
    avatar_url?: string;
  };
  content: string;
  type: string;
  created_at: string;
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { detail?: string }).detail ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const listConversations = () =>
  authFetch<Conversation[]>('/conversations');

export const createConversation = (body: {
  type: 'direct' | 'group';
  name?: string;
  user_ids: number[];
}) =>
  authFetch<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const listUsers = (
  params: Record<string, string | number> = {}
): Promise<UserItem[]> => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  return (
    authFetch<UserItem[] | { users: UserItem[] }>(`/users${qs ? `?${qs}` : ''}`) as Promise<any>
  ).then((data: any) => (Array.isArray(data) ? data : (data.users ?? data)));
};

export const listMessages = (convId: string, limit = 50) =>
  authFetch<Message[]>(`/conversations/${convId}/messages?limit=${limit}`);

export const sendMessage = (convId: string, content: string) =>
  authFetch<Message>(`/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, type: 'text' }),
  });
