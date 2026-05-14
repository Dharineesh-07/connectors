import api from './axios'

export const initiateCall = (conversationId, type) =>
  api.post('/calls/initiate', { conversation_id: conversationId, type }).then((r) => r.data)

export const joinCall = (callId) =>
  api.post(`/calls/${callId}/join`).then((r) => r.data)

export const leaveCall = (callId) => api.post(`/calls/${callId}/leave`)
