import { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { AuthProvider } from './src/context/AuthContext'
import { SocketProvider } from './src/context/SocketContext'
import { CallProvider } from './src/context/CallContext'
import AppNavigator from './src/navigation/AppNavigator'
import { navigationRef } from './src/navigation/navigationRef'
import {
  addNotificationListener,
  addResponseListener,
} from './src/utils/notifications'

function Inner() {
  useEffect(() => {
    // Handle notifications received while app is foregrounded
    const sub1 = addNotificationListener(() => {
      // Toast is already shown by the OS for background; no-op here
    })
    // Handle tap on a notification
    const sub2 = addResponseListener((response) => {
      const data = response.notification.request.content.data
      if (data?.conversation_id) {
        navigationRef.current?.navigate('Chat', {
          conversationId: data.conversation_id,
        })
      }
    })
    return () => {
      sub1.remove()
      sub2.remove()
    }
  }, [])

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <Inner />
            <Toast />
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
