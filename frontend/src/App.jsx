import { Component } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Loader from './components/Loader'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import CallHistory from './pages/CallHistory'
import Calendar from './pages/Calendar'
import Tasks from './pages/Tasks'
import Scribble from './pages/Scribble'
import JoinGroup from './pages/JoinGroup'
import AdminDashboard from './pages/admin/AdminDashboard'
import ManageUsers from './pages/admin/ManageUsers'
import AuditLogs from './pages/admin/AuditLogs'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
          <p style={{ fontWeight: 600, fontSize: 18 }}>Something went wrong</p>
          <p style={{ color: '#666', fontSize: 14 }}>{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#3399CC', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <Loader variant="fullscreen" />
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
          { path: '/tasks', element: <Tasks /> },
          { path: '/scribble', element: <Scribble /> },
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
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
