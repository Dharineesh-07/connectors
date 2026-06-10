import api from './axios'

export const listAnnouncements = () =>
  api.get('/announcements').then((r) => r.data)

export const createAnnouncement = (content) =>
  api.post('/announcements', { content }).then((r) => r.data)

export const pinAnnouncement = (id) =>
  api.patch(`/announcements/${id}/pin`).then((r) => r.data)

export const deleteAnnouncement = (id) =>
  api.delete(`/announcements/${id}`)
