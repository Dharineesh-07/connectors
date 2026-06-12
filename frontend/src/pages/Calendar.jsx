import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  TrashIcon,
  CalendarIcon,
  XMarkIcon,
  VideoCameraIcon,
  UserGroupIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import isToday from 'dayjs/plugin/isToday'
import { getReminders, createReminder, updateReminder, deleteReminder } from '../api/reminders'
import { listMeetings, createMeeting, deleteMeeting, joinMeeting } from '../api/meetings'
import { listUsers } from '../api/users'
import {
  getGoogleAuthUrl,
  getGoogleCalendarStatus,
  getGoogleCalendarEvents,
  disconnectGoogleCalendar,
} from '../api/googleCalendar'
import ReminderModal from '../components/ReminderModal'
import Loader from '../components/Loader'
import GroupCallRoom from '../components/GroupCallRoom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

dayjs.extend(isToday)

function toGCalDate(iso) {
  return dayjs(iso).format('YYYYMMDDTHHmmss')
}

function googleCalendarUrl({ title, description, start, end }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toGCalDate(start)}/${toGCalDate(end || start)}`,
    ...(description ? { details: description } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function GCalButton({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Add to Google Calendar"
      className="p-1.5 rounded-lg text-cn-gray-300 hover:text-cn-blue hover:bg-cn-blue-light transition-all flex items-center"
      onClick={(e) => e.stopPropagation()}
    >
      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
    </a>
  )
}

function MeetingModal({ isOpen, onClose, onSave, selectedDate, users }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startTime, setStartTime] = useState(
    selectedDate ? selectedDate.hour(9).minute(0).format('YYYY-MM-DDTHH:mm') : ''
  )
  const [endTime, setEndTime] = useState(
    selectedDate ? selectedDate.hour(10).minute(0).format('YYYY-MM-DDTHH:mm') : ''
  )
  const [attendeeIds, setAttendeeIds] = useState([])

  if (!isOpen) return null

  const toggleAttendee = (id) => {
    setAttendeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim() || !startTime) return
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: new Date(startTime).toISOString(),
      end_time: endTime ? new Date(endTime).toISOString() : undefined,
      attendee_ids: attendeeIds,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-cn-fade-in">
      <div className="bg-cn-white rounded-2xl shadow-2xl border border-cn-gray-100 w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cn-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl cn-gradient-brand flex items-center justify-center">
              <VideoCameraIcon className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-black text-cn-charcoal">Schedule Meeting</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Title *</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title"
              className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue focus:ring-2 focus:ring-cn-blue/10 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Start *</label>
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">End</label>
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional agenda…"
              className="w-full px-4 py-2.5 rounded-xl border border-cn-gray-200 bg-cn-gray-50 text-sm text-cn-charcoal focus:outline-none focus:border-cn-blue transition-all resize-none" />
          </div>
          {users.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-cn-gray-500 uppercase tracking-widest mb-1.5">
                <UserGroupIcon className="w-3.5 h-3.5 inline mr-1" />Invite Attendees
              </label>
              <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cn-gray-50 cursor-pointer">
                    <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggleAttendee(u.id)}
                      className="w-3.5 h-3.5 accent-cn-blue" />
                    <span className="text-sm text-cn-charcoal">{u.display_name || u.full_name}</span>
                    <span className="text-xs text-cn-gray-400 ml-auto">{u.email}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-cn-gray-200 text-sm font-bold text-cn-gray-500 hover:bg-cn-gray-50 transition-all">Cancel</button>
            <button type="submit" disabled={!title.trim() || !startTime}
              className="flex-1 py-2.5 rounded-xl cn-gradient-brand text-white text-sm font-bold shadow-lg shadow-cn-blue/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100">Schedule</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Calendar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(dayjs())
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReminder, setEditingReminder] = useState(null)
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false)
  const [activeMeeting, setActiveMeeting] = useState(null)

  const queryClient = useQueryClient()

  // Detect OAuth callback result in query params
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('google_connected') === 'true') {
      toast.success('Google Calendar connected!')
      queryClient.invalidateQueries('google-calendar-status')
      queryClient.invalidateQueries('google-calendar-events')
      navigate('/calendar', { replace: true })
    } else if (params.get('google_error')) {
      toast.error('Failed to connect Google Calendar. Please try again.')
      navigate('/calendar', { replace: true })
    }
  }, [location.search])

  const { data: reminders = [], isLoading } = useQuery('reminders', getReminders)
  const { data: meetings = [] } = useQuery('meetings', listMeetings)
  const { data: allUsers = [] } = useQuery('users-directory', listUsers)

  const { data: gcalStatus } = useQuery('google-calendar-status', getGoogleCalendarStatus, {
    retry: false,
    onError: () => {},
  })
  const isGoogleConnected = gcalStatus?.connected === true

  const gcalStart = currentDate.startOf('month').subtract(1, 'week').toISOString()
  const gcalEnd = currentDate.endOf('month').add(1, 'week').toISOString()
  const { data: googleEvents = [] } = useQuery(
    ['google-calendar-events', gcalStart, gcalEnd],
    () => getGoogleCalendarEvents(gcalStart, gcalEnd),
    { enabled: isGoogleConnected, retry: false, onError: () => {} }
  )

  const connectGoogleCalendar = async () => {
    try {
      const { auth_url } = await getGoogleAuthUrl()
      window.location.href = auth_url
    } catch {
      toast.error('Google Calendar is not configured on this server.')
    }
  }

  const disconnectGoogleMut = useMutation(disconnectGoogleCalendar, {
    onSuccess: () => {
      queryClient.invalidateQueries('google-calendar-status')
      queryClient.setQueryData(['google-calendar-events', gcalStart, gcalEnd], [])
      toast.success('Google Calendar disconnected')
    },
  })

  const createMeetingMut = useMutation(createMeeting, {
    onSuccess: () => {
      queryClient.invalidateQueries('meetings')
      setIsMeetingModalOpen(false)
      toast.success('Meeting scheduled')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to schedule meeting'),
  })

  const deleteMeetingMut = useMutation(deleteMeeting, {
    onSuccess: () => {
      queryClient.invalidateQueries('meetings')
      toast.success('Meeting cancelled')
    },
  })

  const handleJoinMeeting = async (meeting) => {
    try {
      const resp = await joinMeeting(meeting.id)
      setActiveMeeting({
        call_id: meeting.id,
        type: 'video',
        room: resp.room,
        conversation_type: 'group',
        initiated_by: meeting.created_by,
      })
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to join meeting')
    }
  }

  const createMut = useMutation(createReminder, {
    onSuccess: () => {
      queryClient.invalidateQueries('reminders')
      setIsModalOpen(false)
      toast.success('Reminder created')
    }
  })

  const updateMut = useMutation(({ id, data }) => updateReminder(id, data), {
    onSuccess: () => {
      queryClient.invalidateQueries('reminders')
      setIsModalOpen(false)
      setEditingReminder(null)
      toast.success('Reminder updated')
    }
  })

  const deleteMut = useMutation(deleteReminder, {
    onSuccess: () => {
      queryClient.invalidateQueries('reminders')
      toast.success('Reminder deleted')
    }
  })

  // Calendar logic
  const daysInMonth = currentDate.daysInMonth()
  const firstDayOfMonth = currentDate.startOf('month').day()
  
  const calendarDays = useMemo(() => {
    const days = []
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null)
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(currentDate.date(i))
    }
    return days
  }, [currentDate, firstDayOfMonth, daysInMonth])

  const remindersByDate = useMemo(() => {
    const map = {}
    ;(reminders ?? []).forEach(r => {
      const date = dayjs(r.due_date).format('YYYY-MM-DD')
      if (!map[date]) map[date] = []
      map[date].push(r)
    })
    return map
  }, [reminders])

  const meetingsByDate = useMemo(() => {
    const map = {}
    ;(meetings ?? []).forEach(m => {
      const date = dayjs(m.start_time).format('YYYY-MM-DD')
      if (!map[date]) map[date] = []
      map[date].push(m)
    })
    return map
  }, [meetings])

  const googleEventsByDate = useMemo(() => {
    const map = {}
    ;(googleEvents ?? []).forEach(e => {
      const date = dayjs(e.start_time).format('YYYY-MM-DD')
      if (!map[date]) map[date] = []
      map[date].push(e)
    })
    return map
  }, [googleEvents])

  const selectedDateReminders = useMemo(() => {
    return remindersByDate[selectedDate.format('YYYY-MM-DD')] || []
  }, [selectedDate, remindersByDate])

  const selectedDateMeetings = useMemo(() => {
    return meetingsByDate[selectedDate.format('YYYY-MM-DD')] || []
  }, [selectedDate, meetingsByDate])

  const selectedDateGoogleEvents = useMemo(() => {
    return googleEventsByDate[selectedDate.format('YYYY-MM-DD')] || []
  }, [selectedDate, googleEventsByDate])

  const handlePrevMonth = () => setCurrentDate(currentDate.subtract(1, 'month'))
  const handleNextMonth = () => setCurrentDate(currentDate.add(1, 'month'))

  const handleSave = (formData) => {
    if (editingReminder) {
      updateMut.mutate({ id: editingReminder.id, data: formData })
    } else {
      createMut.mutate(formData)
    }
  }

  return (
    <div className="h-full flex flex-col bg-cn-app-bg animate-cn-fade-in overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 bg-cn-white border-b border-cn-gray-100 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl cn-gradient-brand flex items-center justify-center shadow-lg shadow-cn-blue/20">
            <CalendarIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-cn-charcoal tracking-tight">Calendar</h1>
            <p className="text-xs font-bold text-cn-gray-400 uppercase tracking-widest mt-0.5">Manage your schedule</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isGoogleConnected ? (
            <button
              onClick={() => disconnectGoogleMut.mutate()}
              className="flex items-center gap-2 px-4 py-3 bg-cn-white border border-cn-gray-200 text-cn-charcoal rounded-xl font-bold hover:bg-cn-red-light hover:text-cn-red hover:border-cn-red/30 transition-all shadow-sm text-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="" />
              <span>Disconnect Google</span>
            </button>
          ) : (
            <button
              onClick={connectGoogleCalendar}
              className="flex items-center gap-2 px-4 py-3 bg-cn-white border border-cn-gray-200 text-cn-charcoal rounded-xl font-bold hover:bg-cn-gray-50 hover:scale-105 active:scale-95 transition-all shadow-sm text-sm"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="" />
              <span>Connect Google Calendar</span>
            </button>
          )}
          <button
            onClick={() => setIsMeetingModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-cn-white border border-cn-gray-200 text-cn-charcoal rounded-xl font-bold hover:bg-cn-gray-50 hover:scale-105 active:scale-95 transition-all shadow-sm"
          >
            <VideoCameraIcon className="w-5 h-5 text-cn-blue" />
            <span>New Meeting</span>
          </button>
          <button
            onClick={() => { setEditingReminder(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-6 py-3 cn-gradient-brand text-white rounded-xl font-bold shadow-lg shadow-cn-blue/20 hover:scale-105 active:scale-95 transition-all"
          >
            <PlusIcon className="w-5 h-5" />
            <span>New Reminder</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-2 rounded-lg text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-all duration-200"
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Calendar View */}
        <div className="flex-[3] p-8 overflow-y-auto custom-scrollbar">
          <div className="bg-cn-white rounded-3xl shadow-card border border-cn-gray-100 overflow-hidden">
            <div className="p-6 border-b border-cn-gray-50 flex items-center justify-between">
              <h2 className="text-lg font-black text-cn-charcoal">
                {currentDate.format('MMMM YYYY')}
              </h2>
              <div className="flex gap-2">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-cn-gray-100 rounded-xl text-cn-gray-400 transition-all">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <button onClick={() => setCurrentDate(dayjs())} className="px-4 py-2 text-xs font-bold text-cn-blue bg-cn-blue-light rounded-xl hover:scale-105 transition-all">
                  Today
                </button>
                <button onClick={handleNextMonth} className="p-2 hover:bg-cn-gray-100 rounded-xl text-cn-gray-400 transition-all">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-[10px] font-black text-cn-gray-400 uppercase tracking-widest pb-4">
                  {day}
                </div>
              ))}
              {calendarDays.map((date, i) => {
                if (!date) return <div key={`pad-${i}`} className="aspect-square" />
                
                const isSel = date.isSame(selectedDate, 'day')
                const isTod = date.isToday()
                const dayReminders = remindersByDate[date.format('YYYY-MM-DD')] || []
                const dayMeetings = meetingsByDate[date.format('YYYY-MM-DD')] || []
                const dayGoogleEvents = googleEventsByDate[date.format('YYYY-MM-DD')] || []

                return (
                  <button
                    key={date.toString()}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl transition-all border-2 ${
                      isSel
                        ? 'bg-cn-blue border-cn-blue text-white shadow-lg shadow-cn-blue/20'
                        : isTod
                          ? 'bg-cn-blue-light border-cn-blue-light text-cn-blue'
                          : 'bg-transparent border-transparent hover:bg-cn-gray-50 text-cn-charcoal'
                    }`}
                  >
                    <span className={`text-sm font-black ${isSel ? 'scale-110' : ''}`}>
                      {date.date()}
                    </span>
                    {!isSel && (dayReminders.length > 0 || dayMeetings.length > 0 || dayGoogleEvents.length > 0) && (
                      <div className="absolute bottom-2 flex gap-0.5">
                        {dayReminders.length > 0 && <div className={`w-1.5 h-1.5 rounded-full ${isTod ? 'bg-cn-blue' : 'bg-cn-red'}`} />}
                        {dayMeetings.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                        {dayGoogleEvents.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Reminders List */}
        <div className="flex-[2] bg-cn-white border-l border-cn-gray-100 flex flex-col overflow-hidden">
          <div className="p-8 border-b border-cn-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-cn-charcoal tracking-tight">
                {selectedDate.isToday() ? 'Today' : selectedDate.format('MMM D, YYYY')}
              </h3>
              <div className="flex gap-2 flex-wrap">
                {selectedDateGoogleEvents.length > 0 && (
                  <div className="px-3 py-1 bg-green-100 rounded-full text-[10px] font-black text-green-600 uppercase tracking-widest">
                    {selectedDateGoogleEvents.length} Google
                  </div>
                )}
                {selectedDateMeetings.length > 0 && (
                  <div className="px-3 py-1 bg-purple-100 rounded-full text-[10px] font-black text-purple-600 uppercase tracking-widest">
                    {selectedDateMeetings.length} Meetings
                  </div>
                )}
                <div className="px-3 py-1 bg-cn-gray-100 rounded-full text-[10px] font-black text-cn-gray-400 uppercase tracking-widest">
                  {selectedDateReminders.length} Reminders
                </div>
              </div>
            </div>
            <p className="text-xs text-cn-gray-400">Schedule for this day</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {isLoading ? <Loader variant="block" /> : <>
            {/* Google Calendar events section */}
            {selectedDateGoogleEvents.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-3.5 h-3.5" alt="" />
                  <span className="text-xs font-black text-green-600 uppercase tracking-widest">Google Calendar</span>
                </div>
                <div className="space-y-3">
                  {selectedDateGoogleEvents.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.html_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 rounded-2xl border border-green-100 bg-green-50 hover:border-green-300 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                          <CalendarIcon className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-cn-charcoal truncate">{ev.title || '(No title)'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <ClockIcon className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-[10px] font-bold text-green-600 uppercase">
                              {ev.all_day ? 'All day' : dayjs(ev.start_time).format('HH:mm')}
                              {!ev.all_day && ev.end_time && ` – ${dayjs(ev.end_time).format('HH:mm')}`}
                            </span>
                          </div>
                          {ev.description && (
                            <p className="mt-1.5 text-xs text-cn-gray-400 line-clamp-1">{ev.description}</p>
                          )}
                        </div>
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-green-400 opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1 transition-all" />
                      </div>
                    </a>
                  ))}
                </div>
                {(selectedDateMeetings.length > 0 || selectedDateReminders.length > 0) && (
                  <div className="border-t border-cn-gray-100 mt-4 pt-4" />
                )}
              </div>
            )}

            {/* Meetings section */}
            {selectedDateMeetings.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <VideoCameraIcon className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-black text-purple-500 uppercase tracking-widest">Meetings</span>
                </div>
                <div className="space-y-3">
                  {selectedDateMeetings.map((meeting) => (
                    <div key={meeting.id} className="p-4 rounded-2xl border border-purple-100 bg-purple-50 group">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <VideoCameraIcon className="w-4 h-4 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-cn-charcoal truncate">{meeting.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <ClockIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-[10px] font-bold text-purple-500 uppercase">
                              {dayjs(meeting.start_time).format('HH:mm')}
                              {meeting.end_time && ` – ${dayjs(meeting.end_time).format('HH:mm')}`}
                            </span>
                            {meeting.attendees?.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-cn-gray-400 ml-2">
                                <UserGroupIcon className="w-3 h-3" />
                                {meeting.attendees.length}
                              </span>
                            )}
                          </div>
                          {meeting.description && (
                            <p className="mt-1.5 text-xs text-cn-gray-400 line-clamp-1">{meeting.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <GCalButton url={googleCalendarUrl({
                            title: meeting.title,
                            description: meeting.description,
                            start: meeting.start_time,
                            end: meeting.end_time || meeting.start_time,
                          })} />
                          <button
                            onClick={() => handleJoinMeeting(meeting)}
                            className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-bold hover:bg-purple-600 transition-all"
                          >Join</button>
                          {meeting.created_by === user?.id && (
                            <button
                              onClick={() => deleteMeetingMut.mutate(meeting.id)}
                              className="p-1.5 rounded-lg text-cn-gray-300 hover:text-cn-red hover:bg-cn-red-light transition-all"
                            ><TrashIcon className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedDateReminders.length > 0 && <div className="border-t border-cn-gray-100 mt-4 pt-4" />}
              </div>
            )}
            {selectedDateReminders.length > 0 ? (
              selectedDateReminders.map(reminder => (
                <div 
                  key={reminder.id}
                  className={`p-4 rounded-2xl border transition-all group ${
                    reminder.is_completed 
                      ? 'bg-cn-gray-50 border-cn-gray-100 opacity-60' 
                      : 'bg-white border-cn-gray-100 hover:border-cn-blue/30 hover:shadow-xl hover:shadow-cn-blue/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button 
                      onClick={() => updateMut.mutate({ id: reminder.id, data: { is_completed: !reminder.is_completed } })}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                        reminder.is_completed ? 'bg-cn-online text-white' : 'bg-cn-gray-100 text-cn-gray-300 hover:text-cn-blue'
                      }`}
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0" onClick={() => { setEditingReminder(reminder); setIsModalOpen(true); }}>
                      <h4 className={`text-sm font-bold truncate ${reminder.is_completed ? 'line-through text-cn-gray-400' : 'text-cn-charcoal'}`}>
                        {reminder.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <ClockIcon className="w-3.5 h-3.5 text-cn-gray-400" />
                        <span className="text-[10px] font-bold text-cn-gray-400 uppercase">
                          {dayjs(reminder.due_date).format('HH:mm')}
                        </span>
                        {reminder.notified && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-cn-blue uppercase ml-2">
                            <BellIcon className="w-3 h-3" />
                            Notified
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <GCalButton url={googleCalendarUrl({
                        title: reminder.title,
                        description: reminder.description,
                        start: reminder.due_date,
                        end: reminder.due_date,
                      })} />
                      <button
                        onClick={() => deleteMut.mutate(reminder.id)}
                        className="p-2 text-cn-gray-300 hover:text-cn-red hover:bg-cn-red-light rounded-xl transition-all"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {reminder.description && (
                    <p className="mt-3 text-xs text-cn-gray-500 pl-10 line-clamp-2">{reminder.description}</p>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <div className="w-20 h-20 rounded-full bg-cn-gray-100 flex items-center justify-center mb-6">
                  <ClockIcon className="w-10 h-10 text-cn-gray-400" />
                </div>
                <p className="text-sm font-bold text-cn-charcoal">No reminders yet</p>
                <p className="text-xs text-cn-gray-400 mt-2 px-10">Enjoy your free day or add a new task above!</p>
              </div>
            )}
            </>}
          </div>
        </div>
      </div>

      <ReminderModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingReminder(null); }}
        onSave={handleSave}
        initialData={editingReminder}
      />

      <MeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        onSave={(data) => createMeetingMut.mutate(data)}
        selectedDate={selectedDate}
        users={allUsers.filter((u) => u.id !== user?.id)}
      />

      {activeMeeting && (
        <GroupCallRoom
          activeCall={activeMeeting}
          onEnd={() => setActiveMeeting(null)}
          localUser={user}
        />
      )}
    </div>
  )
}
