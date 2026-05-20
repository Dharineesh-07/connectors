import { API_BASE_URL } from './config';
import { getAccessToken } from '@/context/AuthContext';

export type ConvMember = {
  user_id: string;
  role: string;
  user: {
    id: string;
    full_name: string;
    display_name?: string;
    avatar_url?: string;
    is_online?: boolean;
    status?: string;
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
    content?: string;
    type: string;
    sender_id: string;
    created_at: string;
  };
  unread_count?: number;
};

export type UserItem = {
  id: string;
  full_name: string;
  display_name?: string;
  email?: string;
  department?: string;
  avatar_url?: string;
  is_online?: boolean;
  status?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: {
    id: string;
    full_name: string;
    display_name?: string;
    avatar_url?: string;
  };
  content?: string;
  type: string;
  file_url?: string;
  file_name?: string;
  is_edited?: boolean;
  is_deleted?: boolean;
  created_at: string;
};

export type MessageListResponse = {
  messages: Message[];
  next_cursor: string | null;
  has_more: boolean;
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

export const getConversation = (convId: string) =>
  authFetch<Conversation>(`/conversations/${convId}`);

export const createConversation = (body: {
  type: 'direct' | 'group';
  name?: string;
  user_ids: string[];
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
  authFetch<MessageListResponse>(`/conversations/${convId}/messages?limit=${limit}`);

export const sendMessage = (convId: string, content: string) =>
  authFetch<Message>(`/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, type: 'text' }),
  })

export const sendVoiceMessage = (
  convId: string,
  fileUrl: string,
  fileName: string,
  fileSize: number,
) =>
  authFetch<Message>(`/conversations/${convId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ type: 'voice', file_url: fileUrl, file_name: fileName, file_size: fileSize }),
  })

export async function uploadVoiceFile(
  convId: string,
  uri: string,
  fileName: string,
): Promise<{ url: string; file_name: string; file_size: number }> {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append('file', { uri, name: fileName, type: 'audio/m4a' } as any);

  const res = await fetch(`${API_BASE_URL}/messages/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail ?? `Upload failed (${res.status})`);
  }
  return { url: (data as any).url, file_name: (data as any).file_name, file_size: (data as any).file_size };
};

export const markConversationRead = (convId: string) =>
  authFetch<void>(`/conversations/${convId}/messages/read`, { method: 'POST' });
