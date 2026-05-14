import api from './axios'

export const getStats = () => api.get('/admin/stats').then((r) => r.data)

export const listUsers = (params) =>
  api.get('/admin/users', { params }).then((r) => r.data)

export const createUser = (data) =>
  api.post('/admin/users', data).then((r) => r.data)

export const updateUser = (id, data) =>
  api.put(`/admin/users/${id}`, data).then((r) => r.data)

export const deactivateUser = (id) => api.delete(`/admin/users/${id}`)

export const resetPassword = (id, newPassword) =>
  api.post(`/admin/users/${id}/reset-password`, { new_password: newPassword })

export const getAuditLogs = (params) =>
  api.get('/admin/audit-logs', { params }).then((r) => r.data)

export const broadcast = (content) => api.post('/admin/broadcast', { content })

export const getAdminCallHistory = (params) =>
  api.get('/admin/call-history', { params }).then((r) => r.data)
