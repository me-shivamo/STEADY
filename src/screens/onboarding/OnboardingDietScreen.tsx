import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { OnboardingNavProp } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import OnboardingScreen from '../../components/onboarding/OnboardingScreen';
import ChatBubble from '../../components/onboarding/ChatBubble';
import { Chip } from '../../components/onboarding/SelectableCard';
import { colors } from '../../theme/colors';
import { typography, fontFamily } from '../../theme/typography';
import { spacing, radius } from '../../theme/spacing';
import { posthog } from '../../utils/posthog';

const DIET_OPTIONS = ['Veg', 'Non-veg', 'Keto', 'Low-carb'];

type Props = { navigation: OnboardingNavProp };

export default function OnboardingDietScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const toggleOption = (option: string) => {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    );
  };

  // Custom entries are comma-separated free text, merged in alongside the
  // preset chips — e.g. "Veg" + "no peanuts, low sodium".
  const buildRestrictions = () => {
    const custom = customText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...selected, ...custom];
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      const restrictions = buildRestrictions();
      await updateProfile({ dietary_restrictions: restrictions });
      posthog.capture('onboarding_step_completed', { step: 'diet', restrictions, count: restrictions.length });
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

  const totalCount = selected.length + customText.split(',').map(s => s.trim()).filter(Boolean).length;

  return (
    <OnboardingScreen
      step={5}
      buttonLabel={totalCount > 0 ? `Continue (${totalCount} selected)` : 'Continue'}
      onContinue={handleContinue}
      loading={loading}
      secondaryLabel="No restrictions"
      onSecondary={handleNoRestrictions}
    >
      <ChatBubble
        animated
        message="Any foods I should know about?"
        hint="Pick what applies, or add your own below. You can always change this later."
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

      <View style={styles.customSection}>
        <Text style={styles.customLabel}>Custom (comma-separated)</Text>
        <TextInput
          style={styles.customInput}
          value={customText}
          onChangeText={setCustomText}
          placeholder="e.g. no peanuts, dairy-free"
          placeholderTextColor={colors.textMuted}
          multiline
        />
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  customSection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  customLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontFamily: fontFamily.regular,
  },
  customInput: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    fontSize: typography.md,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    minHeight: 44,
  },
});
