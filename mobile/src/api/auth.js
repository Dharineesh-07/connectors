import api from './axios'

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const logout = (refreshToken) =>
  api.post('/auth/logout', { refresh_token: refreshToken })

export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
