import api from './axios'

export const listConversations = ({ archived = false } = {}) =>
  api.get('/conversations', { params: archived ? { archived: 'true' } : {} }).then((r) => r.data)

export const archiveConversation = (id) =>
  api.patch(`/conversations/${id}/archive`)

export const unarchiveConversation = (id) =>
  api.delete(`/conversations/${id}/archive`)

export const createConversation = (data) =>
  api.post('/conversations', data).then((r) => r.data)

export const getConversation = (id) =>
  api.get(`/conversations/${id}`).then((r) => r.data)

export const updateConversation = (id, data) =>
  api.put(`/conversations/${id}`, data).then((r) => r.data)

export const addMembers = (id, userIds) =>
  api.post(`/conversations/${id}/members`, { user_ids: userIds }).then((r) => r.data)

export const leaveConversation = (id, userId) =>
  api.delete(`/conversations/${id}/members/${userId}`).then((r) => r.data)

export const joinConversation = (id) =>
  api.post(`/conversations/${id}/join`).then((r) => r.data)

export const toggleE2EE = (id, enabled) =>
  api.patch(`/conversations/${id}/e2ee`, { enabled }).then((r) => r.data)

export const clearConversation = (id) =>
  api.delete(`/conversations/${id}/messages`)

export const deleteConversation = (id) =>
  api.delete(`/conversations/${id}`)
