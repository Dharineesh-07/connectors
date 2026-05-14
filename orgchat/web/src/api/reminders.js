import api from './axios'

export const getReminders = () =>
  api.get('/reminders').then((r) => r.data)

export const createReminder = (data) =>
  api.post('/reminders', data).then((r) => r.data)

export const updateReminder = (id, data) =>
  api.patch(`/reminders/${id}`, data).then((r) => r.data)

export const deleteReminder = (id) =>
  api.delete(`/reminders/${id}`)
