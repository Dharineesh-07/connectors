import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { login as apiLogin, logout as apiLogout } from '../api/auth'

const AuthContext = createContext(null)

const KEYS = {
  access: 'orgchat_access_token',
  refresh: 'orgchat_refresh_token',
  user: 'orgchat_user',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.user)) ?? null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password)
    localStorage.setItem(KEYS.access, data.access_token)
    localStorage.setItem(KEYS.refresh, data.refresh_token)
    localStorage.setItem(KEYS.user, JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(KEYS.refresh)
    try {
      await apiLogout(refreshToken)
    } finally {
      localStorage.removeItem(KEYS.access)
      localStorage.removeItem(KEYS.refresh)
      localStorage.removeItem(KEYS.user)
      setUser(null)
    }
  }, [])

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial }
      localStorage.setItem(KEYS.user, JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
