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
      // `|| undefined` rather than the raw value: dotenv turns an unset key into
      // an EMPTY STRING, not undefined, and an empty string is a very different
      // thing to hand a native SDK than "absent". EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      // is currently blank, so this matters the moment we do an iOS build.
      iosClientId: IOS_CLIENT_ID || undefined,
      scopes: ['profile', 'email'],
    });
    configured = true;
  }

  try {
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
  } catch (err) {
    // The native module reports failures as a numeric `code`, and the message
    // that comes with them is developer-facing ("DEVELOPER_ERROR: Follow
    // troubleshooting instructions at ..."). That string was being rendered
    // straight into the sign-in screen's red error text — useless to a user and,
    // worse, it meant the ONE piece of information needed to diagnose which
    // Google Cloud / Play setting is wrong was only ever visible on a phone
    // screen and never logged anywhere we could read it.
    //
    // Log it loudly here (reaches `adb logcat` even in a release build) and
    // re-throw so the caller can decide what the user sees.
    const code = String((err as { code?: unknown })?.code ?? '');
    if (code === '10' || code === 'DEVELOPER_ERROR') {
      // Everything needed to diagnose this printed in one place, because the
      // alternative is cross-referencing three consoles from memory.
      const pkg = Constants.expoConfig?.android?.package ?? '(unknown)';
      // Only the project number is logged, never the full client ID — it is not
      // secret, but logs get pasted into issues and screenshots.
      const project = WEB_CLIENT_ID?.split('-')[0] ?? '(unset)';
      console.error(
        '[googleSignIn] DEVELOPER_ERROR (code 10) — Google Play Services refused this app’s identity.\n' +
          `  package        : ${pkg}\n` +
          `  GCP project #  : ${project}\n` +
          '  This is NEVER an app-code bug. Google matches the RUNNING binary by\n' +
          '  (package name + signing certificate SHA-1) against the Android OAuth\n' +
          '  clients in that project. Checklist, most likely first:\n' +
          '   1. A Play Store install is re-signed by Play App Signing — its cert is\n' +
          '      NOT the upload key you built with. Register the SHA-1 from Play\n' +
          '      Console > App integrity > App signing key certificate.\n' +
          '   2. The OAuth client must live in the SAME project as the web client\n' +
          '      above, and its package name must match exactly.\n' +
          '   3. EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be a *Web* client, not an\n' +
          '      Android one — an Android ID here fails with this same error.\n' +
          '   4. Changes can take a few minutes to propagate.',
        err,
      );
    } else {
      console.error('[googleSignIn] sign-in failed, code=' + (code || 'none'), err);
    }
    throw err;
  }
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
