// Component tests for src/screens/app/AdjustMacrosScreen.tsx (Phase 9, B3).
// Saving used to rewrite EVERY entry, rounded to whole numbers. Now only the
// rows — and within a row, only the fields — the user changed are written.
//
// RNTL calls are awaited for the reason given in SettingsScreen.test.tsx
// (React 19 + RNTL 14 return Promises from render/fireEvent).

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AdjustMacrosScreen, { changedMacroFields } from '../../src/screens/app/AdjustMacrosScreen';
import { posthog } from '../../src/utils/posthog';

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Stub = (props: any) => ReactLib.createElement(Text, props, props.name ?? '');
  return { Ionicons: Stub };
});

const mockUpdateEntryMacros = jest.fn();
jest.mock('../../src/store/foodLogStore', () => ({
  useFoodLogStore: (selector: (s: any) => any) => selector({ updateEntryMacros: mockUpdateEntryMacros }),
}));

const mockGoBack = jest.fn();

const ENTRIES = [
  { id: 'e1', food_name: 'roti', quantity_label: '2 pieces', quantity_g: 80, calories: 211.6, protein_g: 7.4, carbs_g: 41.2, fat_g: 3.9 },
  { id: 'e2', food_name: 'dal', quantity_label: '1 bowl', quantity_g: 150, calories: 250, protein_g: 12.6, carbs_g: 30.1, fat_g: 8.2 },
  { id: 'e3', food_name: 'rice', quantity_label: '1 cup', quantity_g: 160, calories: 330, protein_g: 6.1, carbs_g: 72.5, fat_g: 0.6 },
];

async function renderScreen() {
  const props: any = {
    route: { params: { mealId: 'meal-1', mealName: 'Lunch', entries: ENTRIES } },
    navigation: { goBack: mockGoBack },
  };
  return render(<AdjustMacrosScreen {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  // The store resolves true when it wrote the entry.
  mockUpdateEntryMacros.mockResolvedValue(true);
});

describe('AdjustMacrosScreen — save only what changed (B3)', () => {
  it('writes one entry, with only the edited field, when one row of three changed', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByDisplayValue('250'), '200');
    await fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateEntryMacros).toHaveBeenCalledTimes(1));
    expect(mockUpdateEntryMacros).toHaveBeenCalledWith('meal-1', 'e2', { calories: 200 });
    // Untouched rows are not re-saved as rounded whole numbers (211.6 → 212).
    expect(mockUpdateEntryMacros).not.toHaveBeenCalledWith('meal-1', 'e1', expect.anything());
    expect(posthog.capture).toHaveBeenCalledWith('meal_macros_adjusted', { entries_changed: 1 });
  });

  it('does not count rows the store skipped as already saved (a retry)', async () => {
    mockUpdateEntryMacros.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByDisplayValue('250'), '200');
    await fireEvent.changeText(screen.getByDisplayValue('330'), '300');
    await fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateEntryMacros).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(posthog.capture).toHaveBeenCalledWith('meal_macros_adjusted', { entries_changed: 1 }));
  });

  it('cannot save twice once a save has succeeded', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByDisplayValue('250'), '200');
    await fireEvent.press(screen.getByText('Save Changes'));
    await waitFor(() =>
      expect(posthog.capture).toHaveBeenCalledWith('meal_macros_adjusted', { entries_changed: 1 }));
    // A second tap in the 700 ms before the screen closes.
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateEntryMacros).toHaveBeenCalledTimes(1);
    expect((posthog.capture as jest.Mock).mock.calls.filter(c => c[0] === 'meal_macros_adjusted')).toHaveLength(1);
  });

  it('writes nothing when nothing changed', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateEntryMacros).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalledWith('meal_macros_adjusted', expect.anything());
  });
});

describe('changedMacroFields', () => {
  const original = { calories: 211.6, protein_g: 7.4, carbs_g: 41.2, fat_g: 3.9 };

  it('ignores fields still showing their rounded original', () => {
    expect(changedMacroFields({ calories: '212', protein_g: '7', carbs_g: '41', fat_g: '4' }, original)).toEqual({});
  });

  it('returns only the fields that moved, at one decimal', () => {
    expect(
      changedMacroFields({ calories: '212', protein_g: '9.25', carbs_g: '41', fat_g: '' }, original)
    ).toEqual({ protein_g: 9.3, fat_g: 0 });
  });
});
