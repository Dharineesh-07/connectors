import { API_BASE_URL } from './config';
import { getAccessToken } from '@/context/AuthContext';

export type CallParticipantUser = {
  id: string;
  full_name: string;
  display_name?: string;
  avatar_url?: string;
};

export type CallParticipant = {
  id: string;
  call_id: string;
  user_id: string;
  status: 'invited' | 'joined' | 'missed' | 'left';
  joined_at?: string | null;
  left_at?: string | null;
  user?: CallParticipantUser;
};

export type ApiCall = {
  id: string;
  conversation_id: string;
  initiated_by: string;
  type: 'audio' | 'video' | 'screen';
  status: 'initiated' | 'ongoing' | 'missed' | 'ended';
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  created_at: string;
  updated_at: string;
  participants: CallParticipant[];
  initiator?: CallParticipantUser;
};

export type CallHistoryResponse = {
  calls: ApiCall[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export type TURNCredentials = {
  urls: string[];
  username: string;
  credential: string;
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

export const getCallHistory = (params: Record<string, string | number> = {}): Promise<CallHistoryResponse> => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  return authFetch<CallHistoryResponse>(`/calls/history${qs ? `?${qs}` : ''}`);
};

export const initiateCall = (conversationId: string, type: string) =>
  authFetch<{ call_id: string; turn_credentials: TURNCredentials }>('/calls/initiate', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, type }),
  });

export const joinCall = (callId: string) =>
  authFetch<{ call_id: string; turn_credentials: TURNCredentials }>(`/calls/${callId}/join`, {
    method: 'POST',
  });

export const leaveCall = (callId: string) =>
  authFetch<void>(`/calls/${callId}/leave`, { method: 'POST' });

export const inviteToCall = (callId: string, userId: string) =>
  authFetch<ApiCall>(`/calls/${callId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });

/** Derive call direction relative to the current user. */
export function getCallDirection(
  call: ApiCall,
  currentUserId: string,
): 'incoming' | 'outgoing' | 'missed' {
  if (call.initiated_by === currentUserId) return 'outgoing';
  const myParticipant = call.participants.find(p => p.user_id === currentUserId);
  if (myParticipant?.status === 'missed') return 'missed';
  return 'incoming';
}
