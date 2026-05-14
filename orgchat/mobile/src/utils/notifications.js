import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { registerFCMToken } from '../api/users'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotifications() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    const tokenData = await Notifications.getExpoPushTokenAsync()
    await registerFCMToken(tokenData.data)
  } catch {
    // Push registration is best-effort; don't block app startup
  }
}

export function addNotificationListener(handler) {
  return Notifications.addNotificationReceivedListener(handler)
}

export function addResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler)
}
