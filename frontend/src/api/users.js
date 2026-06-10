import api from './axios'

export const getMe = () => api.get('/users/me').then((r) => r.data)

export const listUsers = (params = {}) =>
  api.get('/users', { params }).then((r) => r.data.users ?? r.data)

export const updateProfile = (data) => api.put('/users/me', data).then((r) => r.data)

export const registerFCMToken = (token) =>
  api.post('/users/fcm-token', { token })

export const uploadPublicKey = (publicKey) =>
  api.put('/users/me/public-key', { public_key: publicKey })

export const getUserPublicKey = (userId) =>
  api.get(`/users/${userId}/public-key`).then((r) => r.data)
