import { API_BASE_URL } from './config';

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
};

async function post<T = void>(path: string, body: object, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') throw new Error('Request timed out. Check your network connection.');
    throw new Error('Network request failed. Make sure the server is reachable.');
  }
  clearTimeout(timer);

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail ?? `Request failed (${res.status})`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const login = (email: string, password: string) =>
  post<LoginResponse>('/auth/login', { email, password });

/** Revoke the refresh token on the server. Fire-and-forget — local state is cleared regardless. */
export const logout = (accessToken: string): void => {
  fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
};

export const refreshAccessToken = (refreshToken: string) =>
  post<{ access_token: string }>('/auth/refresh', { refresh_token: refreshToken });

export const forgotPassword = (email: string) =>
  post('/auth/forgot-password', { email });

export const resetPassword = (email: string, otp: string, new_password: string) =>
  post('/auth/reset-password', { email, otp, new_password });
