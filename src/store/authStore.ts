import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { Tables } from '../types/database';
import { useFoodLogStore } from './foodLogStore';
import { useGroupStore } from './groupStore';
import { track, identifyUser, resetUser, errorReason } from '../utils/analytics';

// The generated DB types export the generic `Tables<>` helper, not a named
// `Profile` type — derive it here (same pattern foodLogStore uses for its rows).
type Profile = Tables<'profiles'>;

// Required by expo-auth-session: ensures the in-app browser session is
// properly dismissed and the result is returned to the app on Android.
WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  // True while the current session came from a password-reset link. Gates
  // RootNavigator onto the SetNewPassword screen instead of the app.
  passwordRecovery: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  handleAuthDeepLink: (url: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  passwordRecovery: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    set({ session, isLoading: false });

    if (session?.user) {
      await get().fetchProfile(session.user.id);
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ session, isLoading: true });
        await get().fetchProfile(session.user.id);
        set({ isLoading: false });
      } else {
        set({ session, profile: null, isLoading: false });
      }
    });
  },

  signUp: async (email, password, fullName) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) {
      track('auth_failed', { action: 'sign_up', method: 'email', reason: errorReason(error) });
      throw error;
    }
    if (data.user) {
      // Identify with the Supabase UUID only. The email and full name we have
      // right here are deliberately NOT passed: PostHog is a third party, and
      // an email address next to a stream of health behaviour is exactly the
      // pairing our privacy policy shouldn't have to defend. The UUID is
      // useless to anyone without database access.
      identifyUser(data.user.id, { signup_method: 'email' });
      track('sign_up', { method: 'email' });
    }
  },

  signIn: async (email, password) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      track('auth_failed', { action: 'sign_in', method: 'email', reason: errorReason(error) });
      throw error;
    }
    if (data.user) {
      identifyUser(data.user.id);
      track('sign_in', { method: 'email' });
    }
  },

  signInWithGoogle: async () => {
    // Build the URL that Google will redirect back to after authentication.
    // In Expo Go / dev builds this is an https:// URL on auth.expo.io.
    // In production builds it becomes steady://auth/callback.
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'steady', path: 'auth/callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error('No OAuth URL returned from Supabase');

    // Open the Google login page inside an in-app browser and wait for it
    // to redirect back to our app via the deep link.
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type !== 'success') return;

    // Parse the tokens from the redirect URL fragment (#access_token=...&refresh_token=...)
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) throw new Error('Missing tokens in OAuth callback');

    const { error: sessionError, data: sessionData } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      track('auth_failed', { action: 'sign_in', method: 'google', reason: errorReason(sessionError) });
      throw sessionError;
    }
    if (sessionData.user) {
      identifyUser(sessionData.user.id);
      track('sign_in', { method: 'google' });
    }
  },

  signInWithApple: async () => {
    // Apple Sign In is a native iOS capability — it shows Face ID / Touch ID
    // natively without opening a browser. Not available on Android.
    if (Platform.OS !== 'ios') throw new Error('Apple Sign In is only available on iOS');

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) throw new Error('No identity token from Apple');

    // Pass Apple's identity token to Supabase — it verifies the JWT signature
    // with Apple's public keys and creates/resumes the user's account.
    const { error, data } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) {
      track('auth_failed', { action: 'sign_in', method: 'apple', reason: errorReason(error) });
      throw error;
    }
    if (data.user) {
      identifyUser(data.user.id);
      track('sign_in', { method: 'apple' });
    }
  },

  signOut: async () => {
    // Order matters: capture the event while the identity is still attached,
    // then reset. Reversed, sign_out would land on a fresh anonymous person.
    track('sign_out', {});
    resetUser();
    // Local-first sign-out: clear in-memory state synchronously so the UI swaps
    // to the welcome screen instantly (RootNavigator re-renders the moment
    // `session` becomes null). No awaited network call sits on the UI path, so
    // there's no perceptible freeze. passwordRecovery is cleared too, so a
    // half-finished reset flow can't leak into the next sign-in.
    set({ session: null, profile: null, passwordRecovery: false });
    // Clear the in-memory food log so the next user who signs in on this device
    // never sees the previous user's meals/totals. Centralised here so every
    // sign-out path (drawer, future session-expiry, etc.) always clears it.
    useFoodLogStore.getState().reset();
    useGroupStore.getState().reset();

    // Revoke the device's stored session token in the background. scope: 'local'
    // only invalidates THIS device (no all-devices round-trip), and we don't
    // await it on the critical path — failures here don't block the user from
    // being logged out locally, so we just log them.
    supabase.auth
      .signOut({ scope: 'local' })
      .then(({ error }) => {
        if (error) console.warn('Background sign-out failed:', error.message);
      })
      .catch((e) => console.warn('Background sign-out threw:', e));
  },

  deleteAccount: async () => {
    // Deletion happens server-side in the delete-account Edge Function — the
    // service-role key needed to remove an auth user must never ship in the
    // app. functions.invoke() attaches this session's token automatically; the
    // server verifies it and deletes exactly that user (photos + cascade).
    const { data, error } = await supabase.functions.invoke('delete-account');
    if (error) {
      track('account_deletion_failed', { reason: errorReason(error) });
      throw new Error(error.message);
    }
    if (!data?.success) {
      track('account_deletion_failed', { reason: errorReason(data?.error) });
      throw new Error(data?.error ?? 'Account deletion failed');
    }

    track('account_deleted', {});
    resetUser();

    // Same local teardown as signOut. The server already destroyed the session,
    // so the background token revoke below is best-effort cleanup of the stored
    // token and is expected to fail quietly.
    set({ session: null, profile: null, passwordRecovery: false });
    useFoodLogStore.getState().reset();
    useGroupStore.getState().reset();
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  },

  requestPasswordReset: async (email) => {
    // Same dev-vs-prod redirect behaviour as Google OAuth: auth.expo.io in
    // Expo Go, steady://reset-password in a production build. The URL must be
    // allow-listed in Supabase Auth → URL Configuration → Redirect URLs.
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'steady', path: 'reset-password' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      track('auth_failed', { action: 'password_reset_request', method: 'email', reason: errorReason(error) });
      throw error;
    }
    track('password_reset_requested', {});
  },

  handleAuthDeepLink: async (url) => {
    // Called for every URL that opens the app; only reset links matter here.
    // (Google OAuth redirects are consumed inside openAuthSessionAsync and
    // never reach this handler.)
    if (!url.includes('reset-password')) return;

    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const code = parsed.searchParams.get('code');

    if (accessToken && refreshToken) {
      // Implicit-flow link: tokens arrive in the hash fragment, exactly like
      // our Google OAuth callback.
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    } else if (code) {
      // PKCE-flow link: a one-time code instead of tokens — exchange it.
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else {
      return;
    }

    // Session is live, but this user came here to set a new password — flag it
    // so RootNavigator shows SetNewPasswordScreen instead of the app.
    set({ passwordRecovery: true });
  },

  completePasswordReset: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      track('auth_failed', { action: 'password_reset_complete', method: 'email', reason: errorReason(error) });
      throw error;
    }
    track('password_reset_completed', {});
    set({ passwordRecovery: false });
  },

  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch profile:', error.message);
      return;
    }
    set({ profile: data });

    // Keep profiles.timezone current every time a session starts (fresh
    // launch, login, signup — anywhere fetchProfile runs), not only when the
    // user happens to grant push notification permission. Postgres functions
    // that need "the user's local day" (usage-limit resets, reminders) read
    // this column, so a stale/missing value silently breaks them for anyone
    // who never enabled notifications. Intl.DateTimeFormat reads the phone's
    // OS timezone setting directly — no location permission involved.
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (data && data.timezone !== deviceTimezone) {
      get().updateProfile({ timezone: deviceTimezone }).catch((err) => {
        console.warn('Failed to sync device timezone:', err);
      });
    }
  },

  updateProfile: async (updates) => {
    const session = get().session;
    if (!session?.user) return;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single();

    if (error) throw error;
    set({ profile: data });

    // Only the column NAMES are captured — the values include weight, height
    // and date of birth, none of which belong on a third-party server.
    // Timezone-only writes are skipped: fetchProfile syncs the device timezone
    // on every launch, so tracking those would bury real profile edits under
    // background noise that means nothing to the product.
    const fields = Object.keys(updates);
    const isTimezoneSyncOnly = fields.length === 1 && fields[0] === 'timezone';
    if (fields.length > 0 && !isTimezoneSyncOnly) {
      track('profile_updated', { fields, field_count: fields.length });
    }

    // Keep the person profile's segmentation traits current whenever the
    // underlying profile changes, so cohorts like "users cutting weight"
    // don't go stale after someone switches goals mid-journey.
    const userId = session.user.id;
    if (data) {
      identifyUser(userId, {
        goal_type: data.goal,
        activity_level: data.activity_level,
        units_system: data.units_system,
        diet_restriction_count: data.dietary_restrictions?.length ?? 0,
        has_target_weight: data.goal_weight_kg != null,
      });
    }
  },
}));
