import api from './axios'

export const getGoogleAuthUrl = () =>
  api.get('/google/calendar/auth').then((r) => r.data)

export const getGoogleCalendarStatus = () =>
  api.get('/google/calendar/status').then((r) => r.data)

export const getGoogleCalendarEvents = (start, end) =>
  api.get('/google/calendar/events', { params: { start, end } }).then((r) => r.data)

export const disconnectGoogleCalendar = () =>
  api.delete('/google/calendar/disconnect').then((r) => r.data)
