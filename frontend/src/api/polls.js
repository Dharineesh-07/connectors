import api from './axios'

export const createPoll = (conversationId, data) =>
  api.post(`/conversations/${conversationId}/polls`, data).then((r) => r.data)

export const getPoll = (pollId) =>
  api.get(`/polls/${pollId}`).then((r) => r.data)

export const votePoll = (pollId, optionIds) =>
  api.post(`/polls/${pollId}/vote`, { option_ids: optionIds }).then((r) => r.data)

export const closePoll = (pollId) =>
  api.patch(`/polls/${pollId}/close`).then((r) => r.data)
