import api from './axios'

export const getWhiteboardDraft = (conversationId) =>
  api.get(`/conversations/${conversationId}/whiteboard`).then((r) => r.data)

export const saveWhiteboardDraft = (conversationId, data) =>
  api.put(`/conversations/${conversationId}/whiteboard`, data).then((r) => r.data)

export const publishWhiteboardDraft = (conversationId) =>
  api.post(`/conversations/${conversationId}/whiteboard/publish`).then((r) => r.data)

export const deleteWhiteboardDraft = (conversationId) =>
  api.delete(`/conversations/${conversationId}/whiteboard`).then((r) => r.data)

export const listWhiteboardDrafts = () =>
  api.get('/whiteboard/my-drafts').then((r) => r.data)

export const renameWhiteboardDraft = (conversationId, name) =>
  api.patch(`/conversations/${conversationId}/whiteboard/name`, { name }).then((r) => r.data)
