import api from './axios'

export const listMessages = (conversationId, beforeId) =>
  api
    .get(`/conversations/${conversationId}/messages`, {
      params: beforeId ? { before_id: beforeId } : {},
    })
    .then((r) => r.data)

export const sendMessage = (conversationId, data) =>
  api.post(`/conversations/${conversationId}/messages`, data).then((r) => r.data)

export const editMessage = (messageId, content) =>
  api.put(`/messages/${messageId}`, { content }).then((r) => r.data)

export const deleteMessage = (messageId) =>
  api.delete(`/messages/${messageId}`)

export const markRead = (messageId) =>
  api.post(`/messages/${messageId}/read`)

export const markConversationRead = (conversationId) =>
  api.post(`/conversations/${conversationId}/messages/read`)

export const uploadFile = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/messages/upload', form).then((r) => r.data)
}

export const searchMessages = (conversationId, query) =>
  api.get(`/conversations/${conversationId}/search`, { params: { q: query } }).then((r) => r.data)

export const getAttachments = (conversationId) =>
  api.get(`/conversations/${conversationId}/attachments`).then((r) => r.data)

export const reactToMessage = (messageId, emoji) =>
  api.post(`/messages/${messageId}/react`, { emoji }).then((r) => r.data)
