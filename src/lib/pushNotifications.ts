import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { track, errorReason } from '../utils/analytics';

// Registers this device for push notifications: requests permission, gets an
// Expo push token, and sends it to the register-push-token Edge Function so
// the scheduled-notification sender (Supabase, driven by pg_cron) knows where
// to deliver this user's reminders. Also re-syncs the device's IANA timezone
// (e.g. "Asia/Kolkata") onto the profile as a second write path — the primary
// one is authStore.fetchProfile(), which runs on every login/launch and
// doesn't depend on notification permission being granted.
//
// Only works in a real native build (EAS dev client / production build) —
// Expo Go dropped remote push support as of SDK 53, and simulators/emulators
// have no push capability at all. Call sites should not treat failures here
// as fatal; reminders still work locally in the UI even if registration fails.
export async function registerForPushNotificationsAsync(): Promise<void> {
  // Constants.appOwnership is 'expo' only when running inside the Expo Go
  // client itself (not a real build). Device.isDevice alone isn't enough —
  // it only rules out simulators, but a physical phone running Expo Go still
  // can't get a push token, so calling getExpoPushTokenAsync() there logs a
  // scary (but harmless) native warning every time. Bail out before that.
  if (Constants.appOwnership === 'expo') {
    return;
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device — skipping registration.');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    // Only captured when we actually showed the OS prompt — re-reporting an
    // already-granted permission on every launch would drown out the number
    // that matters, which is the accept rate at the moment of asking.
    track('push_permission_result', { granted: status === 'granted' });
  }
  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied.');
    track('push_registration_failed', { reason: 'forbidden', stage: 'permission' });
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });

  const { error } = await supabase.functions.invoke('register-push-token', {
    body: { expo_push_token: tokenData, platform: Platform.OS },
  });
  if (error) {
    console.warn('Failed to register push token:', error.message);
    track('push_registration_failed', { reason: errorReason(error), stage: 'server' });
    return;
  }
  // The reminders feature is only real for devices that get this far. If
  // enabled-reminder counts ever outrun registered tokens, the pg_cron sender
  // has nowhere to deliver and the bug would otherwise be invisible.
  track('push_token_registered', { platform: Platform.OS });

  await saveDeviceTimezone();
}

async function saveDeviceTimezone(): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    await useAuthStore.getState().updateProfile({ timezone });
  } catch (err) {
    console.warn('Failed to save device timezone:', err);
  }
}
