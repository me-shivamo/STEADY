import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from './types';
import OnboardingGoalScreen from '../screens/onboarding/OnboardingGoalScreen';
import OnboardingStatsScreen from '../screens/onboarding/OnboardingStatsScreen';
import OnboardingTargetWeightScreen from '../screens/onboarding/OnboardingTargetWeightScreen';
import OnboardingActivityScreen from '../screens/onboarding/OnboardingActivityScreen';
import OnboardingDietScreen from '../screens/onboarding/OnboardingDietScreen';
import OnboardingRevealScreen from '../screens/onboarding/OnboardingRevealScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="OnboardingGoal" component={OnboardingGoalScreen} />
      <Stack.Screen name="OnboardingStats" component={OnboardingStatsScreen} />
      <Stack.Screen name="OnboardingTargetWeight" component={OnboardingTargetWeightScreen} />
      <Stack.Screen name="OnboardingActivity" component={OnboardingActivityScreen} />
      <Stack.Screen name="OnboardingDiet" component={OnboardingDietScreen} />
      <Stack.Screen name="OnboardingReveal" component={OnboardingRevealScreen} />
    </Stack.Navigator>
  );
}
