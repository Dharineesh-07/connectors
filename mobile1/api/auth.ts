import { API_BASE_URL } from './config';

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: number;
    name: string;
    email: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
};

async function post<T>(path: string, body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('Request timed out. Check your network connection.');
    throw new Error('Network request failed. Make sure the server is reachable.');
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (data as { detail?: string }).detail ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export const login = (email: string, password: string) =>
  post<LoginResponse>('/auth/login', { email, password });

export const forgotPassword = (email: string) =>
  post<{ message: string }>('/auth/forgot-password', { email });

export const resetPassword = (email: string, otp: string, new_password: string) =>
  post<{ message: string }>('/auth/reset-password', { email, otp, new_password });
