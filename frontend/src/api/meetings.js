import api from './axios'

export const listMeetings = () =>
  api.get('/meetings').then((r) => r.data)

export const createMeeting = (data) =>
  api.post('/meetings', data).then((r) => r.data)

export const deleteMeeting = (id) =>
  api.delete(`/meetings/${id}`)

export const joinMeeting = (id) =>
  api.post(`/meetings/${id}/join`).then((r) => r.data)
