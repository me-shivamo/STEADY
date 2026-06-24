import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

// ─── Auth Stack ──────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
};

// ─── Onboarding Stack ────────────────────────────────────────────────────────
export type OnboardingStackParamList = {
  OnboardingGoal: undefined;
  OnboardingStats: undefined;
  OnboardingTargetWeight: undefined;
  OnboardingActivity: undefined;
  OnboardingDiet: undefined;
  OnboardingReveal: undefined;
};

// ─── App Stack (wraps the tab navigator + full-screen push screens) ──────────
// "Tabs" is the tab navigator itself treated as one stack entry.
// Weight, Settings (and future screens) push on top of it full-screen.
export type AppStackParamList = {
  Tabs: undefined;
  Weight: undefined;
  Settings: undefined;
};

// ─── App Bottom Tabs ─────────────────────────────────────────────────────────
export type AppTabParamList = {
  Home: undefined;
  Journal: undefined;
  Me: undefined;
};

// ─── Navigation prop type helpers ────────────────────────────────────────────
export type AuthNavProp = NativeStackNavigationProp<AuthStackParamList>;
export type OnboardingNavProp = NativeStackNavigationProp<OnboardingStackParamList>;
export type AppTabNavProp = BottomTabNavigationProp<AppTabParamList>;
export type AppStackNavProp = NativeStackNavigationProp<AppStackParamList>;
