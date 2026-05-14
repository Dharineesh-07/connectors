import api from './axios'

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const logout = (refreshToken) =>
  api.post('/auth/logout', { refresh_token: refreshToken })

export const refreshTokens = (refreshToken) =>
  api.post('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data)

export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })

export const forgotPassword = (email) =>
  api.post('/auth/forgot-password', { email })

export const resetPassword = (email, otp, newPassword) =>
  api.post('/auth/reset-password', {
    email,
    otp,
    new_password: newPassword,
  })
