import api from './axios'

export const listMessages = (conversationId, beforeId) =>
  api
    .get(`/conversations/${conversationId}/messages`, {
      params: beforeId ? { before_id: beforeId } : {},
    })
    .then((r) => r.data)

export const sendMessage = (conversationId, data) =>
  api.post(`/conversations/${conversationId}/messages`, data).then((r) => r.data)

export const markRead = (messageId) => api.post(`/messages/${messageId}/read`)

export const uploadFile = (file) => {
  const form = new FormData()
  form.append('file', {
    uri: file.uri,
    name: file.name ?? 'upload',
    type: file.mimeType ?? 'application/octet-stream',
  })
  return api.post('/messages/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const editMessage = (messageId, content) =>
  api.patch(`/messages/${messageId}`, { content }).then((r) => r.data)

export const deleteMessage = (messageId) =>
  api.delete(`/messages/${messageId}`).then((r) => r.data)

export const reactToMessage = (messageId, emoji) =>
  api.post(`/messages/${messageId}/react`, { emoji }).then((r) => r.data)
