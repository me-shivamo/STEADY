import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { PostHogProvider } from 'posthog-react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  TikTokSans_400Regular,
  TikTokSans_500Medium,
  TikTokSans_600SemiBold,
  TikTokSans_700Bold,
} from '@expo-google-fonts/tiktok-sans';
import { Caveat_500Medium, Caveat_600SemiBold, Caveat_700Bold } from '@expo-google-fonts/caveat';
import RootNavigator from './src/navigation/RootNavigator';
import ToastHost from './src/components/common/ToastHost';
import AnimatedSplash from './src/components/common/AnimatedSplash';
import { posthog } from './src/utils/posthog';
import { useAuthStore } from './src/store/authStore';
import { registerForPushNotificationsAsync } from './src/lib/pushNotifications';

SplashScreen.preventAutoHideAsync();

// Decides what happens when a push arrives while STEADY is in the FOREGROUND.
//
// This is not optional polish. expo-notifications' documented default, when no
// handler is registered, is to show NOTHING — a foreground push is silently
// discarded. The app had no handler anywhere, which means the natural way to
// test reminders ("open the app, send a test push, watch the screen") produced
// no output even when delivery was working perfectly. That is indistinguishable
// from "push is broken", and it is why this must ship alongside the FCM fix
// rather than after it.
//
// Registered at module scope so it is installed once at import, before any
// notification can arrive — not inside a component, where it would re-run on
// every render and race the first delivery.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  // Our own splash stays up after the native one hides. The native splash can
  // only show a circle-masked icon (Android 12+ masks windowSplashScreenAnimatedIcon),
  // so the bowl-with-callouts artwork has to be rendered by React — see
  // AnimatedSplash for the full explanation.
  const [splashVisible, setSplashVisible] = useState(true);
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

  // Registers this device's push token once a session exists — there's no user
  // to attach the token to before login.
  //
  // The .catch() is load-bearing: registration genuinely can reject (on a build
  // with no FCM config, getExpoPushTokenAsync throws), and without a handler
  // that becomes an unhandled promise rejection — invisible on device and
  // invisible in analytics. The function itself now reports the failure to
  // PostHog; this just stops the rejection escaping.
  useEffect(() => {
    if (session?.user) {
      registerForPushNotificationsAsync().catch(() => {});
    }
  }, [session?.user]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    // SafeAreaProvider has to sit above RootNavigator so ToastHost — which is
    // outside the navigator — can read the bottom inset and clear the Android
    // navigation bar. React Navigation mounts its own SafeAreaProviderCompat
    // internally, which detects this one and defers to it rather than nesting.
    <SafeAreaProvider>
      <PostHogProvider client={posthog} autocapture={{ captureScreens: false }}>
        <RootNavigator />
        {/* Last child = painted on top of every screen. */}
        <ToastHost />
        {/* Rendered ABOVE the navigator rather than instead of it, so the real
            first screen mounts and settles behind the splash. By the time this
            fades out there is a finished screen underneath, not a flash of
            empty layout. */}
        {splashVisible && (
          <AnimatedSplash
            isAppReady={fontsLoaded}
            onFinish={() => setSplashVisible(false)}
          />
        )}
      </PostHogProvider>
    </SafeAreaProvider>
  );
}
