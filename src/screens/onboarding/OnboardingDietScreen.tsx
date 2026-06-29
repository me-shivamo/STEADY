import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { Chip } from '../../components/onboarding/SelectableCard';
import { spacing } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

const DIET_OPTIONS = [
  'Vegetarian', 'Vegan', 'Pescatarian',
  'Gluten-free', 'Dairy-free',
  'Keto', 'Low-carb', 'Paleo',
  'Halal', 'Kosher',
];

type Props = { navigation: OnboardingNavProp };

export default function OnboardingDietScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const toggleOption = (option: string) => {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await updateProfile({ dietary_restrictions: selected });
      posthog.capture('onboarding_step_completed', { step: 'diet', restrictions: selected, count: selected.length });
      navigation.navigate('OnboardingReveal');
    } finally {
      setLoading(false);
    }
  };

  const handleNoRestrictions = async () => {
    setLoading(true);
    try {
      await updateProfile({ dietary_restrictions: [] });
      posthog.capture('onboarding_step_completed', { step: 'diet', restrictions: [], count: 0 });
      navigation.navigate('OnboardingReveal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingScreen
      step={5}
      buttonLabel={selected.length > 0 ? `Continue (${selected.length} selected)` : 'Continue'}
      onContinue={handleContinue}
      loading={loading}
      secondaryLabel="No restrictions"
      onSecondary={handleNoRestrictions}
    >
      <ChatBubble
        message="Any foods I should know about?"
        hint="Pick as many as apply. You can always change this later."
      />

      <View style={styles.chipsWrap}>
        {DIET_OPTIONS.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={selected.includes(option)}
            onPress={() => toggleOption(option)}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
