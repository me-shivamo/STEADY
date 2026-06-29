import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { Tables } from '../types/database';
import { useFoodLogStore } from './foodLogStore';
import { posthog } from '../utils/posthog';

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

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,

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
    if (error) throw error;
    if (data.user) {
      posthog.identify(data.user.id, { email, name: fullName });
      posthog.capture('sign_up', { method: 'email' });
    }
  },

  signIn: async (email, password) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      posthog.identify(data.user.id, { email });
      posthog.capture('sign_in', { method: 'email' });
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
    if (sessionError) throw sessionError;
    if (sessionData.user) {
      posthog.identify(sessionData.user.id, { email: sessionData.user.email });
      posthog.capture('sign_in', { method: 'google' });
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
    if (error) throw error;
    if (data.user) {
      posthog.identify(data.user.id, { email: data.user.email });
      posthog.capture('sign_in', { method: 'apple' });
    }
  },

  signOut: async () => {
    posthog.capture('sign_out');
    posthog.reset();
    // Local-first sign-out: clear in-memory state synchronously so the UI swaps
    // to the welcome screen instantly (RootNavigator re-renders the moment
    // `session` becomes null). No awaited network call sits on the UI path, so
    // there's no perceptible freeze.
    set({ session: null, profile: null });
    // Clear the in-memory food log so the next user who signs in on this device
    // never sees the previous user's meals/totals. Centralised here so every
    // sign-out path (drawer, future session-expiry, etc.) always clears it.
    useFoodLogStore.getState().reset();

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
  },
}));
