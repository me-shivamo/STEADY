import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { SelectableCard } from '../../components/onboarding/SelectableCard';
import { spacing } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

type Goal = 'lose_weight' | 'gain_weight' | 'maintain' | 'build_muscle';

const GOALS: { value: Goal; label: string; emoji: string }[] = [
  { value: 'lose_weight',  label: 'Lose weight',     emoji: '🔥' },
  { value: 'gain_weight',  label: 'Gain weight',     emoji: '📈' },
  { value: 'maintain',     label: 'Maintain weight', emoji: '⚖️' },
  { value: 'build_muscle', label: 'Build muscle',    emoji: '💪' },
];

type Props = { navigation: OnboardingNavProp };

export default function OnboardingGoalScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await updateProfile({ goal: selected });
      posthog.capture('onboarding_step_completed', { step: 'goal', goal: selected });
      navigation.navigate('OnboardingStats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      step={1}
      buttonLabel="Continue"
      onContinue={handleContinue}
      disabled={!selected}
      loading={loading}
    >
      <ChatBubble message="Hey! I'm STEADY 👋 I'll help you track food, hit your goals, and understand your body better. What's your main goal?" />

      <View style={styles.list}>
        {GOALS.map((goal) => (
          <SelectableCard
            key={goal.value}
            emoji={goal.emoji}
            label={goal.label}
            selected={selected === goal.value}
            onPress={() => setSelected(goal.value)}
            hideIndicator
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
  },
});
