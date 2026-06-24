import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import AppNavigator from './AppNavigator';
import { colors } from '../theme/colors';
import { posthog } from '../utils/posthog';

export default function RootNavigator() {
  const { session, profile, isLoading, initialize } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    initialize();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgPrimary }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const showOnboarding = session && profile && !profile.onboarding_complete;
  const showApp = session && profile?.onboarding_complete;

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
      {showOnboarding && <OnboardingNavigator />}
      {showApp && <AppNavigator />}
      {!session && <AuthNavigator />}
    </NavigationContainer>
  );
}
