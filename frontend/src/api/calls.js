import api from './axios'

// STUN/TURN servers (with fresh time-limited TURN credentials) for the SFU.
export const getIceServers = () =>
  api.get('/calls/ice-servers').then((r) => r.data.ice_servers)

export const initiateCall = (conversationId, type) =>
  api.post('/calls/initiate', { conversation_id: conversationId, type }).then((r) => r.data)

export const joinCall = (callId) =>
  api.post(`/calls/${callId}/join`).then((r) => r.data)

export const leaveCall = (callId) =>
  api.post(`/calls/${callId}/leave`)

export const getCallHistory = (params) =>
  api.get('/calls/history', { params }).then((r) => r.data)

export const inviteToCall = (callId, userId) =>
  api.post(`/calls/${callId}/invite`, { user_id: userId }).then((r) => r.data)

export const getWaitingRoom = (callId) =>
  api.get(`/calls/${callId}/waiting`).then((r) => r.data)

export const admitParticipant = (callId, userId) =>
  api.post(`/calls/${callId}/waiting/${userId}/admit`).then((r) => r.data)

export const rejectWaiting = (callId, userId) =>
  api.delete(`/calls/${callId}/waiting/${userId}`)
