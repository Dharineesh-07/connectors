import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';

import { login as apiLogin, logout as apiLogout, refreshAccessToken } from '@/api/auth';
import { wsClient } from '@/api/websocket';
import type { UserItem } from '@/data/static';

const TOKEN_KEY   = 'auth_access_token';
const REFRESH_KEY = 'auth_refresh_token';
const USER_KEY    = 'auth_user';

type AuthCtx = {
  user: UserItem | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserItem>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

/** Decode a JWT and check whether it has expired. Returns true if expired or unreadable. */
function isTokenExpired(token: string): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return !payload.exp || Date.now() / 1000 > payload.exp;
  } catch {
    return true;
  }
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    wsClient.disconnect();
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) apiLogout(token);
    await clearSession();
    setUser(null);
  }, []);

  // Restore session on cold start; validate the access token and refresh if expired.
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(USER_KEY);
        if (!raw) { setLoading(false); return; }

        const token   = await SecureStore.getItemAsync(TOKEN_KEY);
        const refresh = await SecureStore.getItemAsync(REFRESH_KEY);

        if (token && !isTokenExpired(token)) {
          setUser(JSON.parse(raw) as UserItem);
          wsClient.connect(token);
        } else if (refresh) {
          try {
            const { access_token } = await refreshAccessToken(refresh);
            await SecureStore.setItemAsync(TOKEN_KEY, access_token);
            setUser(JSON.parse(raw) as UserItem);
            wsClient.connect(access_token);
          } catch {
            await clearSession();
          }
        } else {
          await clearSession();
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Auto-logout when the WebSocket signals that the token was rejected (code 4001).
  useEffect(() => {
    return wsClient.on('session:expired', () => { logout(); });
  }, [logout]);

  const login = useCallback(async (email: string, password: string): Promise<UserItem> => {
    const resp = await apiLogin(email, password);
    const u = resp.user;

    const userItem: UserItem = {
      id:           String(u.id),
      full_name:    ((u.full_name ?? u.name ?? '') as string),
      display_name: ((u.display_name ?? u.full_name ?? u.name ?? '') as string),
      email:        u.email,
      role:         (u.role as string) === 'admin' ? 'admin' : 'user',
      department:   ((u.department as string) ?? ''),
      avatar_url:   u.avatar_url,
      is_online:    true,
      is_active:    (u.is_active as boolean) ?? true,
    };

    await SecureStore.setItemAsync(TOKEN_KEY,   resp.access_token);
    await SecureStore.setItemAsync(REFRESH_KEY, resp.refresh_token);
    await SecureStore.setItemAsync(USER_KEY,    JSON.stringify(userItem));
    setUser(userItem);

    wsClient.connect(resp.access_token);

    return userItem;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
