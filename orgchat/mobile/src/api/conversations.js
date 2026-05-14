import api from './axios'

export const listConversations = () =>
  api.get('/conversations').then((r) => r.data)

export const getConversation = (id) =>
  api.get(`/conversations/${id}`).then((r) => r.data)

export const createConversation = (data) =>
  api.post('/conversations', data).then((r) => r.data)
