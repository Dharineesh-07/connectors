import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  PlusIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  TrashIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import isToday from 'dayjs/plugin/isToday'
import { getReminders, createReminder, updateReminder, deleteReminder } from '../api/reminders'
import ReminderModal from '../components/ReminderModal'
import toast from 'react-hot-toast'

dayjs.extend(isToday)

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(dayjs())
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReminder, setEditingReminder] = useState(null)
  
  const queryClient = useQueryClient()

  const { data: reminders = [], isLoading } = useQuery('reminders', getReminders)

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
    reminders.forEach(r => {
      const date = dayjs(r.due_date).format('YYYY-MM-DD')
      if (!map[date]) map[date] = []
      map[date].push(r)
    })
    return map
  }, [reminders])

  const selectedDateReminders = useMemo(() => {
    return remindersByDate[selectedDate.format('YYYY-MM-DD')] || []
  }, [selectedDate, remindersByDate])

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
        <button 
          onClick={() => { setEditingReminder(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-6 py-3 cn-gradient-brand text-white rounded-xl font-bold shadow-lg shadow-cn-blue/20 hover:scale-105 active:scale-95 transition-all"
        >
          <PlusIcon className="w-5 h-5" />
          <span>New Reminder</span>
        </button>
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
                    {dayReminders.length > 0 && !isSel && (
                      <div className={`absolute bottom-2 w-1.5 h-1.5 rounded-full ${isTod ? 'bg-cn-blue' : 'bg-cn-red'}`} />
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
              <div className="px-3 py-1 bg-cn-gray-100 rounded-full text-[10px] font-black text-cn-gray-400 uppercase tracking-widest">
                {selectedDateReminders.length} Tasks
              </div>
            </div>
            <p className="text-xs text-cn-gray-400">Scheduled reminders for this day</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
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
                    <button 
                      onClick={() => deleteMut.mutate(reminder.id)}
                      className="p-2 text-cn-gray-300 hover:text-cn-red hover:bg-cn-red-light rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
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
          </div>
        </div>
      </div>

      <ReminderModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingReminder(null); }}
        onSave={handleSave}
        initialData={editingReminder}
      />
    </div>
  )
}
