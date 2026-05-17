import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';

export const unstable_settings = {
  anchor: 'login',
};

function RootNavigator() {
  const { user, loading } = useAuth();
  const segments  = useSegments();
  const router    = useRouter();

  useEffect(() => {
    if (loading) return;

    const seg0 = segments[0] as string | undefined;
    const inAuthArea =
      seg0 === '(tabs)' ||
      seg0 === 'chat'   ||
      seg0 === 'admin';

    if (user && !inAuthArea) {
      router.replace('/(tabs)');
    } else if (!user && inAuthArea) {
      router.replace('/login');
    }
  }, [user, loading, segments]);

  return (
    <Stack>
      <Stack.Screen name="login"       options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)"      options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]"   options={{ headerShown: false }} />
      <Stack.Screen name="admin"       options={{ headerShown: false }} />
      <Stack.Screen name="modal"       options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
