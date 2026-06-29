import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { SelectableCard } from '../../components/onboarding/SelectableCard';
import { spacing } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'super_active';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; emoji: string; description: string }[] = [
  { value: 'sedentary',         label: 'Desk life',    emoji: '🪑', description: 'Mostly sitting, little to no exercise' },
  { value: 'lightly_active',    label: 'Light mover',  emoji: '🚶', description: 'Walk sometimes, light workouts 1–3×/week' },
  { value: 'moderately_active', label: 'On my feet',   emoji: '🏃', description: 'Active job or regular workouts 3–5×/week' },
  { value: 'very_active',       label: 'Very active',  emoji: '🏋️', description: 'Hard training 6–7×/week' },
  { value: 'super_active',      label: 'Athlete mode', emoji: '⚡', description: 'Twice-a-day training or physical labour job' },
];

type Props = { navigation: OnboardingNavProp };

export default function OnboardingActivityScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<ActivityLevel | null>(null);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await updateProfile({ activity_level: selected });
      posthog.capture('onboarding_step_completed', { step: 'activity', activity_level: selected });
      navigation.navigate('OnboardingDiet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      step={4}
      buttonLabel="Continue"
      onContinue={handleContinue}
      disabled={!selected}
      loading={loading}
    >
      <ChatBubble message="How active are you on a typical day?" />

      <View style={styles.list}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            emoji={opt.emoji}
            label={opt.label}
            description={opt.description}
            selected={selected === opt.value}
            onPress={() => setSelected(opt.value)}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
