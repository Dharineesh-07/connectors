import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  ClipboardDocumentListIcon,
  PlusIcon,
  XMarkIcon,
  CheckCircleIcon,
  TrashIcon,
  UserCircleIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { listTasks, updateTask, deleteTask } from '../api/tasks'
import TaskCreationModal from '../components/TaskCreationModal'
import toast from 'react-hot-toast'

dayjs.extend(relativeTime)

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const STATUS_COLORS = {
  todo: 'bg-cn-gray-100 text-cn-gray-500',
  in_progress: 'bg-cn-blue-light text-cn-blue',
  done: 'bg-green-100 text-green-600',
}

export default function Tasks() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

  const { data: tasks = [], isLoading } = useQuery(
    ['tasks', filter],
    () => listTasks(filter !== 'all' ? { status: filter } : {}),
  )

  const updateMut = useMutation(({ id, data }) => updateTask(id, data), {
    onSuccess: () => queryClient.invalidateQueries('tasks'),
    onError: () => toast.error('Failed to update task'),
  })

  const deleteMut = useMutation(deleteTask, {
    onSuccess: () => {
      queryClient.invalidateQueries('tasks')
      toast.success('Task deleted')
    },
    onError: () => toast.error('Failed to delete task'),
  })

  const cycleStatus = (task) => {
    const order = ['todo', 'in_progress', 'done']
    const next = order[(order.indexOf(task.status) + 1) % order.length]
    updateMut.mutate({ id: task.id, data: { status: next } })
  }

  const grouped = {
    todo: (tasks ?? []).filter((t) => t.status === 'todo'),
    in_progress: (tasks ?? []).filter((t) => t.status === 'in_progress'),
    done: (tasks ?? []).filter((t) => t.status === 'done'),
  }

  const displayGroups = filter === 'all'
    ? [['todo', grouped.todo], ['in_progress', grouped.in_progress], ['done', grouped.done]]
    : [[filter, tasks ?? []]]

  return (
    <div className="h-full flex flex-col bg-cn-app-bg animate-cn-fade-in overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 bg-cn-white border-b border-cn-gray-100 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl cn-gradient-brand flex items-center justify-center shadow-lg shadow-cn-blue/20">
            <ClipboardDocumentListIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-cn-charcoal tracking-tight">Tasks</h1>
            <p className="text-xs font-bold text-cn-gray-400 uppercase tracking-widest mt-0.5">Your work items</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-6 py-3 cn-gradient-brand text-white rounded-xl font-bold shadow-lg shadow-cn-blue/20 hover:scale-105 active:scale-95 transition-all"
          >
            <PlusIcon className="w-5 h-5" />
            <span>New Task</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg text-cn-gray-400 hover:text-cn-red hover:bg-cn-red-light transition-all"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-8 pt-4 pb-0 flex gap-2">
        {[['all', 'All'], ['todo', 'To Do'], ['in_progress', 'In Progress'], ['done', 'Done']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              filter === val
                ? 'cn-gradient-brand text-white shadow-lg shadow-cn-blue/20'
                : 'bg-cn-gray-100 text-cn-gray-400 hover:bg-cn-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task columns */}
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-cn-gray-400 text-sm font-bold">Loading…</div>
        ) : (tasks ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <div className="w-20 h-20 rounded-full bg-cn-gray-100 flex items-center justify-center mb-6">
              <ClipboardDocumentListIcon className="w-10 h-10 text-cn-gray-400" />
            </div>
            <p className="text-sm font-bold text-cn-charcoal">No tasks yet</p>
            <p className="text-xs text-cn-gray-400 mt-2">Create one or turn a chat message into a task</p>
          </div>
        ) : (
          displayGroups.map(([status, items]) => (
            items.length > 0 && (
              <div key={status}>
                {filter === 'all' && (
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-xs font-bold text-cn-gray-400">{items.length}</span>
                  </div>
                )}
                <div className="space-y-3">
                  {items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onCycleStatus={() => cycleStatus(task)}
                      onDelete={() => deleteMut.mutate(task.id)}
                    />
                  ))}
                </div>
              </div>
            )
          ))
        )}
      </div>

      <TaskCreationModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  )
}

function TaskCard({ task, onCycleStatus, onDelete }) {
  const isDone = task.status === 'done'
  const isOverdue = task.due_date && !isDone && dayjs(task.due_date).isBefore(dayjs())

  return (
    <div className={`p-4 rounded-2xl border transition-all group ${
      isDone
        ? 'bg-cn-gray-50 border-cn-gray-100 opacity-60'
        : 'bg-cn-white border-cn-gray-100 hover:border-cn-blue/30 hover:shadow-xl hover:shadow-cn-blue/5'
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onCycleStatus}
          className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all mt-0.5 ${
            isDone ? 'text-green-500' : 'text-cn-gray-300 hover:text-cn-blue'
          }`}
          title="Cycle status"
        >
          {isDone
            ? <CheckCircleSolid className="w-5 h-5" />
            : <CheckCircleIcon className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${isDone ? 'line-through text-cn-gray-400' : 'text-cn-charcoal'}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-cn-gray-400 mt-0.5 line-clamp-1">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {task.conversation && (
              <span className="text-[10px] font-bold text-cn-blue bg-cn-blue-light px-2 py-0.5 rounded-full">
                # {task.conversation.name || 'DM'}
              </span>
            )}
            {task.assigned_to_user && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-cn-gray-500">
                <UserCircleIcon className="w-3 h-3" />
                {task.assigned_to_user.display_name || task.assigned_to_user.full_name}
              </span>
            )}
            {task.due_date && (
              <span className={`flex items-center gap-1 text-[10px] font-bold ${isOverdue ? 'text-cn-red' : 'text-cn-gray-400'}`}>
                <CalendarDaysIcon className="w-3 h-3" />
                {dayjs(task.due_date).format('MMM D, HH:mm')}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-cn-gray-300 hover:text-cn-red hover:bg-cn-red-light transition-all opacity-0 group-hover:opacity-100"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
