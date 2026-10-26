import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { navigateToDeepLink } from './navigationRef';
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

  await setupNotificationChannels();

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  // This call is the single point where push registration actually fails in a
  // standalone build, and until now it failed INVISIBLY.
  //
  // On Android the Expo push token is minted from an underlying FCM device
  // token. Obtaining that requires a configured default FirebaseApp, which comes
  // from google-services.json baked in at build time. Without it,
  // FirebaseMessaging.getInstance() throws, expo-notifications rejects with
  // "Make sure to complete the guide at .../fcm-credentials/", and — because
  // nothing here caught it and the caller in App.tsx was fire-and-forget — the
  // rejection vanished. No token was ever stored for the standalone app, so the
  // scheduled sender kept delivering to the one stale Expo Go token still in the
  // table. That is the whole "notifications arrive in Expo Go" bug.
  //
  // Catching it here turns a silent fleet-wide outage into a PostHog metric.
  let tokenData: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    tokenData = result.data;
  } catch (err) {
    console.warn('Failed to obtain Expo push token:', err);
    track('push_registration_failed', { reason: errorReason(err), stage: 'token' });
    return;
  }

  // Reported AFTER setupNotificationChannels() has run above, so this is a
  // statement about channels that genuinely exist on this device rather than a
  // promise about ones we intend to create. The server refuses to name a
  // channel unless the device has claimed it, because Android silently discards
  // notifications aimed at a channel that isn't there.
  const { error } = await supabase.functions.invoke('register-push-token', {
    body: {
      expo_push_token: tokenData,
      platform: Platform.OS,
      channels_version: CHANNELS_VERSION,
    },
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

// ── Android notification channels ────────────────────────────────────────────
// Since Android 8 every notification must belong to a channel, and the channel
// name is printed in the notification header next to the app name (this is the
// "• Reminder" you see on a Healthify notification). More importantly the user
// controls each channel independently in system settings — importance, sound,
// or silence it outright — and the app cannot override that. That is the whole
// point of the design.
//
// So a channel is really the granularity at which someone is allowed to be
// annoyed with us. Until now STEADY declared exactly one, 'default', which
// meant a user irritated by a cheeky lapse nudge had no option except muting
// STEADY entirely, taking their streak alerts and celebrations with it.
//
// Worth knowing: channels are IMMUTABLE once created. Changing importance in a
// later app update does nothing; you have to delete and recreate under a new
// id, and deleting loses the user's own customisations. Cheaper to get the
// split right now than after release.
// Bumped whenever the set below changes. Reported to the server on every token
// registration so the sender knows which channel ids this device can actually
// render. Channels are immutable once created, so a change here is genuinely a
// new capability level rather than an edit to an existing one.
//   0 = builds before 2026-08-07 (only 'default' existed)
//   1 = this set
export const CHANNELS_VERSION = 1;

const CHANNELS: { id: string; name: string; importance: number }[] = [
  { id: 'default',      name: 'General',         importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'onboarding',   name: 'Getting started', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'celebrations', name: 'Celebration',     importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'reminders',    name: 'Reminder',        importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'nudges',       name: 'Nudge',           importance: Notifications.AndroidImportance.LOW },
  { id: 'groups',       name: 'Group',           importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'tips',         name: 'Tip',             importance: Notifications.AndroidImportance.LOW },
  { id: 'progress',     name: 'Progress',        importance: Notifications.AndroidImportance.LOW },
];

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // 'nudges', 'tips' and 'progress' ship at LOW importance deliberately: they
  // arrive in the tray without a sound or heads-up banner. These are the
  // interruptive-but-not-urgent categories, and the research on notification
  // fatigue is consistent that volume is what drives uninstalls.
  await Promise.all(
    CHANNELS.map((c) =>
      Notifications.setNotificationChannelAsync(c.id, { name: c.name, importance: c.importance })
    )
  );
}

// ── Tap tracking ─────────────────────────────────────────────────────────────
// notification_log has carried a 'opened' status and an opened_at column since
// migration 013 and both had zero rows, because nothing ever wrote them. That
// single gap is what blocks tone locking, send-time optimisation and any answer
// to "which copy actually works" — we have been writing notification copy with
// no feedback at all.
//
// The server puts `log_id` and `deep_link` into the push payload's `data` field
// (see send-scheduled-notifications). Tapping brings us here, where we report
// the open through a SECURITY DEFINER RPC — the client cannot write
// notification_log directly, since that table has RLS on with deliberately zero
// policies.
async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  coldStart: boolean
): Promise<void> {
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const logId = typeof data.log_id === 'string' ? data.log_id : null;
  const deepLink = typeof data.deep_link === 'string' ? data.deep_link : 'home';
  const channel = typeof data.channel === 'string' ? data.channel : 'unknown';

  let recorded = false;
  if (logId) {
    try {
      const { data: ok, error } = await supabase.rpc('mark_notification_opened', {
        p_log_id: logId,
      });
      recorded = !error && ok === true;
      if (error) console.warn('Failed to record notification open:', error.message);
    } catch (err) {
      console.warn('Failed to record notification open:', err);
    }
  }

  track('notification_opened', { channel, deep_link: deepLink, cold_start: coldStart, recorded });

  // On a cold start the NavigationContainer may not have mounted yet, so the
  // first attempt legitimately fails. Retry on a short delay rather than
  // dropping the user on Home when they tapped "log your water".
  if (!navigateToDeepLink(deepLink) && coldStart) {
    setTimeout(() => navigateToDeepLink(deepLink), 1000);
  }
}

// Two entry paths, because Android and iOS deliver taps differently depending
// on whether the app was already alive:
//   - app running or backgrounded  -> the listener fires
//   - app was killed and the tap launched it -> no listener exists yet at that
//     moment, so the response is instead waiting in getLastNotificationResponseAsync()
// Missing the second path is the classic bug here: taps that launch the app
// from cold are exactly the ones that matter most, and they'd never be counted.
export function attachNotificationTapListener(): () => void {
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handleNotificationResponse(response, true).catch(() => {});
    })
    .catch(() => {});

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response, false).catch(() => {});
  });

  return () => sub.remove();
}
