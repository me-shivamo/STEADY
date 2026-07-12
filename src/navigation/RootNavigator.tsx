import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import AppNavigator from './AppNavigator';
import SetNewPasswordScreen from '../screens/auth/SetNewPasswordScreen';
import { colors } from '../theme/colors';
import { posthog } from '../utils/posthog';

export default function RootNavigator() {
  const { session, profile, isLoading, initialize, passwordRecovery } = useAuthStore();
  const handleAuthDeepLink = useAuthStore((s) => s.handleAuthDeepLink);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    initialize();

    // Password-reset links open the app via steady://reset-password. Two entry
    // paths: the app was launched BY the link (cold start → getInitialURL), or
    // it was already running (warm → 'url' event). Both feed the same handler.
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url).catch(() => {});
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgPrimary }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // A recovery session (from a reset link) must land on the set-new-password
  // screen — without this gate it would fall through to the app like any
  // normal session and the user would never see the password form.
  const showRecovery = session && passwordRecovery;
  const showOnboarding = !showRecovery && session && profile && !profile.onboarding_complete;
  const showApp = !showRecovery && session && profile?.onboarding_complete;

  return (
    <NavigationContainer
      ref={navigationRef}
      onStateChange={() => {
        const route = navigationRef.current?.getCurrentRoute();
        if (route?.name) {
          posthog.screen(route.name);
        }
      }}
    >
      {showRecovery && <SetNewPasswordScreen />}
      {showOnboarding && <OnboardingNavigator />}
      {showApp && <AppNavigator />}
      {!session && <AuthNavigator />}
    </NavigationContainer>
  );
}
