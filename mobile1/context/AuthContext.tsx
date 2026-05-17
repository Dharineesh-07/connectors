import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import { DEMO_CREDENTIALS, USERS, type UserItem } from '@/data/static';

type AuthCtx = {
  user: UserItem | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserItem>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserItem | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<UserItem> => {
    const cred = DEMO_CREDENTIALS.find(
      (c) => c.email.toLowerCase() === email.toLowerCase().trim() && c.password === password
    );
    if (!cred) throw new Error('Invalid email or password.');
    const userData = USERS.find((u) => u.id === cred.userId);
    if (!userData) throw new Error('User not found.');
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
