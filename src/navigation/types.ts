import { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

// ─── App Stack (Home at the root + full-screen push screens) ─────────────────
// Weight, Settings (and future screens) push on top of Home full-screen.
export type AppStackParamList = {
  Home: undefined;
  Weight: undefined;
  Water: undefined;
  BodyMeasurements: undefined;
  Settings: undefined;
  AdjustMacros: {
    mealId: string;
    mealName: string;
    entries: Array<{
      id: string;
      food_name: string;
      quantity_label: string | null;
      quantity_g: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>;
  };
};

// ─── Navigation prop type helpers ────────────────────────────────────────────
export type AuthNavProp = NativeStackNavigationProp<AuthStackParamList>;
export type OnboardingNavProp = NativeStackNavigationProp<OnboardingStackParamList>;
export type AppStackNavProp = NativeStackNavigationProp<AppStackParamList>;
