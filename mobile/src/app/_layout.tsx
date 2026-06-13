import { ThemeProvider, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme, ActivityIndicator, View, Appearance } from 'react-native';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { UpdateNotifier } from '@/components/UpdateNotifier';
import { initDatabase } from '@/lib/db';
import { AmoledDarkTheme, ClayLightTheme } from '@/constants/theme';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    'Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env'
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        // Load persisted theme preference
        const savedTheme = await AsyncStorage.getItem('openmedq_theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          Appearance.setColorScheme(savedTheme);
        }
      } catch (err) {
        console.error('Failed to initialize database.');
      } finally {
        setDbReady(true);
      }
    }
    setup();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000000' : '#fffaf0' }}>
        <ActivityIndicator size="large" color="#ff4d8b" />
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={colorScheme === 'dark' ? AmoledDarkTheme : ClayLightTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
          <Stack.Screen name="signup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="verify" />
          <Stack.Screen name="practice-suite" />
          <Stack.Screen name="oauth-native-callback" />
        </Stack>
        <UpdateNotifier />
      </ThemeProvider>
    </ClerkProvider>
  );
}


