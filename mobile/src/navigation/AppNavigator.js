import { ActivityIndicator, Text, View } from 'react-native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import ConversationListScreen from '../screens/ConversationListScreen'
import ChatScreen from '../screens/ChatScreen'
import CallScreen from '../screens/CallScreen'
import ProfileScreen from '../screens/ProfileScreen'
import { Colors } from '../theme/colors'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

const TAB_ICON = { Chats: '💬', Profile: '👤' }

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.gray100,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.red,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
        tabBarLabel: route.name,
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 20, color }}>{TAB_ICON[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Chats" component={ConversationListScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.grayBg }}>
        <ActivityIndicator color={Colors.red} size="large" />
      </View>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen
            name="Call"
            component={CallScreen}
            options={{
              presentation: 'modal',
              gestureEnabled: false,
              cardStyle: { backgroundColor: Colors.charcoal },
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}
