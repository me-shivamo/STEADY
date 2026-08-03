import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Client IDs come from Google Cloud Console (APIs & Services → Credentials).
// Both are public identifiers, not secrets — they're safe in the bundle, which
// is why they use the EXPO_PUBLIC_ prefix that Metro inlines at build time.
//
// The counterintuitive bit: on ANDROID we still pass the *web* client ID. The
// Android OAuth client isn't referenced by any string — Google matches it by
// package name + APK signing fingerprint. The web client ID's job is to become
// the `aud` ("audience") claim inside the issued ID token, which is what
// Supabase checks to confirm the token was minted for us and not some other app.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// Expo Go bundles a fixed set of native modules and google-signin isn't one of
// them, so any call into it there throws. 'storeClient' is Expo's name for
// "running inside the Expo Go app" (vs 'standalone' for a real/dev build).
const isExpoGo = Constants.executionEnvironment === 'storeClient';

/**
 * Whether the native Google sign-in path can run. False in Expo Go, or if the
 * client ID hasn't been configured yet — callers fall back to the older
 * browser-redirect flow in both cases.
 */
export const isNativeGoogleSignInAvailable = (): boolean => !isExpoGo && !!WEB_CLIENT_ID;

// Lazy require rather than a top-level import: a static import would put the
// native module in Metro's bundle graph and execute it even in Expo Go, where
// it can't load. Deferring it means the Expo Go fallback path never touches it.
const loadModule = () =>
  require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');

let configured = false;

/**
 * Opens the native Google account picker and returns a signed ID token (a JWT
 * asserting who the user is). Returns null if the user dismissed the sheet.
 *
 * No browser and no redirect URI is involved — the OS talks to Play Services
 * directly, so Google has no third-party hostname to display on the picker.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleSignin, isSuccessResponse } = loadModule();

  // configure() is global, one-time SDK setup (closest analogy: constructing a
  // client singleton). Doing it here rather than at import time keeps it off
  // the Expo Go code path.
  if (!configured) {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID,
      scopes: ['profile', 'email'],
    });
    configured = true;
  }

  // Android-only preflight: on a device with a missing or outdated Play
  // Services this shows the update prompt instead of failing cryptically.
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null; // { type: 'cancelled' }

  const { idToken } = response.data;
  if (!idToken) throw new Error('No ID token returned from Google Sign-In');
  return idToken;
}

/**
 * Clears the SDK's cached Google account. Without this, signing out of STEADY
 * and tapping "Continue with Google" again would silently re-authenticate the
 * same account with no picker — so a second user on the same device could never
 * get in. Safe to call unconditionally; it no-ops where the module can't load.
 */
export async function signOutFromGoogle(): Promise<void> {
  if (!isNativeGoogleSignInAvailable()) return;
  try {
    await loadModule().GoogleSignin.signOut();
  } catch (e) {
    // Never block local sign-out on this — the user is logged out either way.
    console.warn('Google sign-out failed:', e);
  }
}
