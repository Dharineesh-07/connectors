import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TINT = { light: '#CC3333', dark: '#FF6B6B' };

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const tint = TINT[colorScheme ?? 'light'];

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: tint,
      headerShown: false,
      tabBarButton: HapticTab,
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Calls',
          tabBarIcon: ({ color }) => <Ionicons name="call" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
