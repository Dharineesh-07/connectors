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

export const getThreadReplies = (messageId) =>
  api.get(`/messages/${messageId}/thread`).then((r) => r.data)

export const getPinnedMessages = (conversationId) =>
  api.get(`/conversations/${conversationId}/pinned`).then((r) => r.data)

export const pinMessage = (conversationId, messageId) =>
  api.post(`/conversations/${conversationId}/messages/${messageId}/pin`).then((r) => r.data)

export const unpinMessage = (conversationId, messageId) =>
  api.delete(`/conversations/${conversationId}/messages/${messageId}/pin`)

export const scheduleMessage = (conversationId, data) =>
  api.post(`/conversations/${conversationId}/messages/schedule`, data).then((r) => r.data)

export const getScheduledMessages = (conversationId) =>
  api.get(`/conversations/${conversationId}/scheduled`).then((r) => r.data)

export const deleteScheduledMessage = (scheduledId) =>
  api.delete(`/scheduled-messages/${scheduledId}`)

export const getLinkPreview = (url) =>
  api.get('/link-preview', { params: { url } }).then((r) => r.data)

export const getMessagesByDate = (conversationId, date) =>
  api
    .get(`/conversations/${conversationId}/messages`, { params: { around_date: date } })
    .then((r) => r.data)
