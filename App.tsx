import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { PostHogProvider } from 'posthog-react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  TikTokSans_400Regular,
  TikTokSans_500Medium,
  TikTokSans_600SemiBold,
  TikTokSans_700Bold,
} from '@expo-google-fonts/tiktok-sans';
import { Caveat_500Medium, Caveat_600SemiBold, Caveat_700Bold } from '@expo-google-fonts/caveat';
import RootNavigator from './src/navigation/RootNavigator';
import { posthog } from './src/utils/posthog';
import { useAuthStore } from './src/store/authStore';
import { registerForPushNotificationsAsync } from './src/lib/pushNotifications';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    TikTokSans_400Regular,
    TikTokSans_500Medium,
    TikTokSans_600SemiBold,
    TikTokSans_700Bold,
    Caveat_500Medium,
    Caveat_600SemiBold,
    Caveat_700Bold,
  });
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Registers this device's push token once a session exists — there's no
  // user to attach the token to before login. Failures are swallowed inside
  // registerForPushNotificationsAsync (e.g. simulator, permission denied);
  // reminders still work in the UI even if this doesn't complete.
  useEffect(() => {
    if (session?.user) {
      registerForPushNotificationsAsync();
    }
  }, [session?.user]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PostHogProvider client={posthog} autocapture={{ captureScreens: false }}>
      <RootNavigator />
    </PostHogProvider>
  );
}
