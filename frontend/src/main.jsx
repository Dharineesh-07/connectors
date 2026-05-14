import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import { CallProvider } from './context/CallContext'
import { ThemeProvider } from './context/ThemeContext'
import App from './App'
import './index.css'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault("Asia/Kolkata")

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
              <App />
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: 'var(--cn-white)',
                    color: 'var(--cn-gray-800)',
                    border: '1px solid var(--cn-gray-200)',
                    borderRadius: '10px',
                    boxShadow: 'var(--shadow-card)',
                    fontFamily: 'Inter, Segoe UI, sans-serif',
                    fontSize: '14px',
                  },
                  success: {
                    iconTheme: { primary: 'var(--cn-online)', secondary: '#FFFFFF' },
                  },
                  error: {
                    iconTheme: { primary: 'var(--cn-danger)', secondary: '#FFFFFF' },
                  },
                }}
              />
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
