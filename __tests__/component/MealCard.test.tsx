// Component tests for src/components/nutrition/MealCard.tsx (Phase 9, B2).
// The inline editor opens pre-filled with the AI's food summary. Confirming
// it unchanged used to re-run the AI (the check compared against the user's
// caption, never against the summary), which could only drift the numbers.
//
// RNTL calls are awaited for the reason given in SettingsScreen.test.tsx.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MealCard from '../../src/components/nutrition/MealCard';
import type { MealCard as MealCardType } from '../../src/store/foodLogStore';

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Stub = (props: any) => ReactLib.createElement(Text, props, props.name ?? '');
  return { Ionicons: Stub };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

// Sheets the card can open; none are exercised here.
jest.mock('../../src/components/common/ChangeDateTimeSheet', () => () => null);
jest.mock('../../src/components/common/ConfirmSheet', () => () => null);
jest.mock('../../src/components/common/ImageViewerModal', () => () => null);

const mockEditMealFromText = jest.fn();
jest.mock('../../src/store/foodLogStore', () => ({
  useFoodLogStore: (selector: (s: any) => any) =>
    selector({ editMealFromText: mockEditMealFromText, deleteMeal: jest.fn() }),
}));
jest.mock('../../src/store/savedEntriesStore', () => ({
  useSavedEntriesStore: (selector: (s: any) => any) => selector({ saveMealAsEntry: jest.fn() }),
}));
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({ profile: null }),
}));

const MEAL: MealCardType = {
  id: 'meal-1',
  meal_name: 'Breakfast',
  meal_type: 'breakfast',
  logged_date: '2026-11-13',
  created_at: '2026-11-13T08:00:00.000Z',
  photo_url: null,
  input_text: 'two toast and a tomato',
  entries: [
    { id: 'e1', food_name: 'bread', quantity_label: '2 slices', quantity_g: 60, calories: 160, protein_g: 5, carbs_g: 30, fat_g: 2 } as any,
    { id: 'e2', food_name: 'tomato', quantity_label: null, quantity_g: 42, calories: 8, protein_g: 0.4, carbs_g: 1.6, fat_g: 0.1 } as any,
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEditMealFromText.mockResolvedValue(MEAL);
});

describe('MealCard inline edit (B2)', () => {
  it('opens with the food summary and makes no AI call when confirmed unchanged', async () => {
    const screen = await render(<MealCard meal={MEAL} />);

    await fireEvent.press(screen.getByText('create'));
    expect(screen.getByDisplayValue('Bread (2 slices), Tomato (42 g)')).toBeTruthy();

    await fireEvent.press(screen.getByText('checkmark'));

    expect(mockEditMealFromText).not.toHaveBeenCalled();
    // Back in read mode, still showing the user's own words.
    expect(screen.getByText('two toast and a tomato')).toBeTruthy();
  });

  it('calls the AI once for a real change', async () => {
    const screen = await render(<MealCard meal={MEAL} />);

    await fireEvent.press(screen.getByText('create'));
    await fireEvent.changeText(
      screen.getByDisplayValue('Bread (2 slices), Tomato (42 g)'),
      'Bread (3 slices), Tomato (42 g)',
    );
    await fireEvent.press(screen.getByText('checkmark'));

    await waitFor(() => expect(mockEditMealFromText).toHaveBeenCalledTimes(1));
    expect(mockEditMealFromText).toHaveBeenCalledWith('meal-1', 'Bread (3 slices), Tomato (42 g)');
  });
});
