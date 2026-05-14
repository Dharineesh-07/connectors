import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import CallHistory from './pages/CallHistory'
import Calendar from './pages/Calendar'
import JoinGroup from './pages/JoinGroup'
import AdminDashboard from './pages/admin/AdminDashboard'
import ManageUsers from './pages/admin/ManageUsers'
import AuditLogs from './pages/admin/AuditLogs'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireAdmin() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Dashboard />,
        children: [
          { path: '/', element: <Chat /> },
          { path: '/chat/:conversationId', element: <Chat /> },
          { path: '/join/:conversationId', element: <JoinGroup /> },
          { path: '/call-history', element: <CallHistory /> },
          { path: '/calendar', element: <Calendar /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/admin', element: <AdminDashboard /> },
              { path: '/admin/users', element: <ManageUsers /> },
              { path: '/admin/audit-logs', element: <AuditLogs /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
