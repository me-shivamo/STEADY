// Component tests for src/screens/app/SettingsScreen.tsx.
// Traces TEST_SCENARIOS.md §1.5.2 (delete-account button gating) and §9.1–9.6
// (Settings & Profile), Component-layer rows only.
//
// §9.5 (Privacy Policy / Terms links) is flagged Manual/known-broken in
// TESTING.md §9.1–9.2 — out of scope here, not implemented.
// §9.4 ("Coming soon" rows like Progress Charts/Reminders/Groups) does not
// apply to the CURRENT SettingsScreen source — no such rows exist in this
// component today (grep confirms). Documented below as not-applicable rather
// than faked against a row that doesn't exist.
//
// NOTE on async RNTL calls: in this environment's installed
// @testing-library/react-native@14 + jest-expo/React 19 combo, `render()`,
// `fireEvent.press()`, and `fireEvent.changeText()` all return Promises that
// must be awaited (confirmed by isolated debugging) — otherwise their
// internal act() batches overlap with the next test's render and corrupt it
// ("You seem to have overlapping act() calls"). Every call here is awaited.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import SettingsScreen from '../../src/screens/app/SettingsScreen';
import { Tables } from '../../src/types/database';

// `expo-asset` (a transitive dep of expo-font, pulled in via @expo/vector-icons)
// is not present in node_modules in this environment. SettingsScreen only uses
// Ionicons for decorative glyphs that no test here asserts on, so a
// lightweight stub avoids the missing-module resolution error without touching
// any src/ file.
jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Stub = (props: any) => ReactLib.createElement(Text, props, props.name ?? '');
  return { Ionicons: Stub };
});

type Profile = Tables<'profiles'>;

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockUpdateProfile = jest.fn();
const mockDeleteAccount = jest.fn();
const mockAddWeightEntry = jest.fn();

let mockProfile: Partial<Profile> | null;

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({
      profile: mockProfile,
      updateProfile: mockUpdateProfile,
      deleteAccount: mockDeleteAccount,
    }),
}));

// The screen now routes a changed weight through weightStore.addEntry() so it
// lands in weight_logs, not just the profile column.
jest.mock('../../src/store/weightStore', () => ({
  useWeightStore: (selector: (s: any) => any) => selector({ addEntry: mockAddWeightEntry }),
}));

// `beforeRemove` powers the unsaved-changes guard, so the navigation mock has
// to be a real (if inert) event emitter.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    dispatch: mockDispatch,
    addListener: () => jest.fn(),
  }),
}));

// Base fixture profile used across most tests. date_of_birth is present so the
// TDEE recalculation has every input it needs (it is skipped without an age).
function baseProfile(overrides: Partial<Profile> = {}): Partial<Profile> {
  return {
    id: 'user-1',
    full_name: 'Ada Lovelace',
    sex: 'female',
    date_of_birth: '1996-01-01',
    height_cm: 170,
    current_weight_kg: 65,
    goal_weight_kg: 60,
    goal: 'lose_weight',
    activity_level: 'moderately_active',
    calorie_goal: 1800,
    protein_goal_g: 120,
    carb_goal_g: 180,
    fat_goal_g: 60,
    units_system: 'metric',
    ...overrides,
  };
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue(undefined);
    mockAddWeightEntry.mockResolvedValue(undefined);
    mockProfile = baseProfile();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(async () => {
    (Alert.alert as jest.Mock).mockRestore();
    await cleanup();
  });

  // ── §1.5.2 — delete-account confirmation button gating ──────────────────

  describe('1.5.2 delete-account confirm-text gating', () => {
    async function openModal() {
      const { getByText, getByPlaceholderText } = await render(<SettingsScreen />);
      await fireEvent.press(getByText('Delete account'));
      const input = await waitFor(() => getByPlaceholderText('DELETE'));
      return { getByText, input };
    }

    it('1.5.2 keeps "Delete forever" disabled for lowercase "delete"', async () => {
      const { getByText, input } = await openModal();
      await fireEvent.changeText(input, 'delete');
      const deleteBtn = getByText('Delete forever').parent;
      expect(deleteBtn?.props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(getByText('Delete forever'));
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('1.5.2 keeps "Delete forever" disabled for "DELETE " with trailing space', async () => {
      const { getByText, input } = await openModal();
      await fireEvent.changeText(input, 'DELETE ');
      const deleteBtn = getByText('Delete forever').parent;
      expect(deleteBtn?.props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(getByText('Delete forever'));
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('1.5.2 keeps "Delete forever" disabled for incomplete "DELET"', async () => {
      const { getByText, input } = await openModal();
      await fireEvent.changeText(input, 'DELET');
      const deleteBtn = getByText('Delete forever').parent;
      expect(deleteBtn?.props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(getByText('Delete forever'));
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('1.5.2 keeps "Delete forever" disabled for an empty string', async () => {
      const { getByText } = await openModal();
      const deleteBtn = getByText('Delete forever').parent;
      expect(deleteBtn?.props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(getByText('Delete forever'));
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('1.5.2 enables "Delete forever" and calls deleteAccount ONLY for the exact string "DELETE"', async () => {
      const { getByText, input } = await openModal();
      await fireEvent.changeText(input, 'DELETE');
      const deleteBtn = getByText('Delete forever').parent;
      expect(deleteBtn?.props.accessibilityState?.disabled).toBe(false);
      await fireEvent.press(getByText('Delete forever'));
      await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
    });
  });

  // ── §9.1 — save flow (failure path; success path is silent, no alert) ───

  describe('9.1 save profile', () => {
    it('9.1 shows an inline error when updateProfile rejects', async () => {
      mockUpdateProfile.mockRejectedValueOnce(new Error('network down'));
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      // Save is disabled until something actually changes, so make an edit
      // that doesn't feed the TDEE formula (no recalculation prompt).
      await fireEvent.changeText(getByDisplayValue('Ada Lovelace'), 'Grace Hopper');
      await fireEvent.press(getByText('Save'));

      await waitFor(() =>
        expect(getByText('Could not save. Please check your connection and try again.')).toBeTruthy()
      );
      // Failure must not navigate back.
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('9.1 calls updateProfile with edited fields and navigates back on success', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      const nameInput = getByDisplayValue('Ada Lovelace');
      await fireEvent.changeText(nameInput, 'Grace Hopper');
      await fireEvent.press(getByText('Save'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Grace Hopper' })
      );
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    });

    it('9.1 leaves Save disabled while nothing has been edited', async () => {
      const { getByText } = await render(<SettingsScreen />);
      await fireEvent.press(getByText('Save'));
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
  });

  // ── §9.2 — draft discarded without Save ──────────────────────────────────

  describe('9.2 draft discarded without save', () => {
    it('9.2 does not call updateProfile after editing a field without pressing Save', async () => {
      const { getByDisplayValue } = await render(<SettingsScreen />);

      const nameInput = getByDisplayValue('Ada Lovelace');
      await fireEvent.changeText(nameInput, 'Unsaved Name');

      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('9.2 unmounting the screen after an edit still never commits the draft', async () => {
      const { getByDisplayValue, unmount } = await render(<SettingsScreen />);

      const nameInput = getByDisplayValue('Ada Lovelace');
      await fireEvent.changeText(nameInput, 'Unsaved Name');
      unmount();

      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
  });

  // ── §9.3 — units round-trip ───────────────────────────────────────────

  describe('9.3 metric <-> imperial round-trip', () => {
    it('9.3 converts height/weight to imperial and back to the original metric values', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      // Starts in metric: stored values displayed as-is.
      expect(getByDisplayValue('170')).toBeTruthy(); // height cm
      expect(getByDisplayValue('65')).toBeTruthy(); // current weight kg

      await fireEvent.press(getByText('lb, in'));

      expect(getByDisplayValue('67')).toBeTruthy(); // 170 / 2.54 = 66.9 -> 67
      expect(getByDisplayValue('143')).toBeTruthy(); // 65 * 2.20462 = 143.3 -> 143

      // Untouched fields re-format from the stored kg/cm rather than from the
      // rounded imperial text, so the original values come back exactly.
      await fireEvent.press(getByText('kg, cm'));

      expect(getByDisplayValue('170')).toBeTruthy();
      expect(getByDisplayValue('65')).toBeTruthy();
    });

    it('9.3 treats a value typed in imperial as imperial (regression: double conversion)', async () => {
      // The old screen displayed cm→in but wrote the typed inches straight back
      // into the cm state, so every keystroke got divided by 2.54 again.
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.press(getByText('lb, in'));
      const heightInput = getByDisplayValue('67');
      await fireEvent.changeText(heightInput, '70');

      // The field must still read 70 — not 70/2.54 = 28.
      expect(getByDisplayValue('70')).toBeTruthy();

      await fireEvent.press(getByText('Save'));

      // Height feeds the TDEE formula, so the preview sheet comes first.
      await waitFor(() => expect(getByText('Update your daily targets?')).toBeTruthy());
      await fireEvent.press(getByText('Keep mine'));

      // 70 inches = 177.8cm -> 178
      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ height_cm: 178, units_system: 'imperial' })
      );
    });
  });

  // ── §9.4 — "Coming soon" rows: not applicable to current source ─────────

  describe('9.4 "Coming soon" rows', () => {
    it('9.4 out of scope: SettingsScreen has no Progress Charts/Reminders/Groups rows in current source (verified via grep) — nothing to test', async () => {
      const { queryByText } = await render(<SettingsScreen />);
      expect(queryByText(/progress charts/i)).toBeNull();
      expect(queryByText(/reminders/i)).toBeNull();
      expect(queryByText(/groups/i)).toBeNull();
      expect(queryByText(/coming soon/i)).toBeNull();
    });
  });

  // ── §9.5 — Privacy Policy / Terms: Manual, known-broken, out of scope ────
  // out of scope: Manual layer per TEST_SCENARIOS.md §9.5 (TESTING.md §9.1–9.2 known-broken)

  // ── §9.6 — delete-account entry point opens the confirmation modal ──────

  describe('9.6 delete-account entry point', () => {
    it('9.6 does not show the DELETE confirmation input before "Delete account" is pressed', async () => {
      const { queryByPlaceholderText } = await render(<SettingsScreen />);
      expect(queryByPlaceholderText('DELETE')).toBeNull();
    });

    it('9.6 shows the DELETE confirmation input after pressing "Delete account"', async () => {
      const { getByText, getByPlaceholderText } = await render(<SettingsScreen />);
      await fireEvent.press(getByText('Delete account'));
      await waitFor(() => expect(getByPlaceholderText('DELETE')).toBeTruthy());
      expect(getByText('Delete your account?')).toBeTruthy();
    });
  });

  // ── The whole value pill is editable, not just the digits ────────────────

  // Note on scope: RNTL 14 ships no focus matcher (no toHaveFocus/toBeFocused),
  // and a host TextInput element exposes no instance to spy `focus` on — so the
  // runtime "did the caret land in the field" step isn't assertable here and is
  // left to manual/device checking. What IS assertable, and is the exact thing
  // that regressed, is the prop that lets the tap reach the pill at all: a
  // <Text> that becomes its own touch responder swallows the press before the
  // wrapping Pressable's onPress ever runs.
  describe('value fields are tappable across their whole pill', () => {
    it('marks every unit label non-interactive so taps fall through to the field', async () => {
      const { getByText, getAllByText } = await render(<SettingsScreen />);

      // Units that appear exactly once, both inside a field.
      for (const unit of ['cm', 'yrs']) {
        expect(getByText(unit).props.pointerEvents).toBe('none');
      }

      // 'kg' renders twice (current weight + goal weight) and 'g' three times
      // (protein/carbs/fat) — every one of those is a field unit, so all of
      // them must be inert.
      for (const unit of ['kg', 'g']) {
        for (const node of getAllByText(unit)) {
          expect(node.props.pointerEvents).toBe('none');
        }
      }

      // 'kcal' is the one that appears in two different roles: the plan card's
      // read-only caption and the Calories field's unit. Only the field's copy
      // is expected to be inert — the caption isn't inside a tappable pill.
      expect(getAllByText('kcal').filter((n) => n.props.pointerEvents === 'none')).toHaveLength(1);
    });
  });

  // ── Targets recalculate when the stats behind them change ────────────────

  describe('daily targets follow the stats', () => {
    it('offers recalculated targets when a TDEE input changes, and writes them on confirm', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      // Drop from 65kg to 58kg — a real change to the TDEE inputs.
      await fireEvent.changeText(getByDisplayValue('65'), '58');
      await fireEvent.press(getByText('Save'));

      // Save is intercepted by the preview sheet instead of writing straight away.
      await waitFor(() => expect(getByText('Update your daily targets?')).toBeTruthy());
      expect(mockUpdateProfile).not.toHaveBeenCalled();

      await fireEvent.press(getByText('Update targets'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      const updates = mockUpdateProfile.mock.calls[0][0];
      expect(updates.current_weight_kg).toBe(58);
      // The stale 1800 kcal target must not survive a 7kg change.
      expect(updates.calorie_goal).not.toBe(1800);
      expect(updates.calorie_goal).toBeGreaterThan(0);
    });

    it('keeps the existing targets when the user chooses "Keep mine"', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.changeText(getByDisplayValue('65'), '58');
      await fireEvent.press(getByText('Save'));
      await waitFor(() => expect(getByText('Update your daily targets?')).toBeTruthy());
      await fireEvent.press(getByText('Keep mine'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      const updates = mockUpdateProfile.mock.calls[0][0];
      expect(updates.current_weight_kg).toBe(58);
      expect(updates.calorie_goal).toBe(1800);
    });

    it('never prompts when the user typed a target by hand — a manual number wins', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.changeText(getByDisplayValue('65'), '58');
      await fireEvent.changeText(getByDisplayValue('1800'), '1650');
      await fireEvent.press(getByText('Save'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      expect(mockUpdateProfile.mock.calls[0][0].calorie_goal).toBe(1650);
    });
  });

  // ── A weight edited here must reach the weight history too ───────────────

  describe('two-way weight sync', () => {
    it('logs a changed weight to weight_logs as well as the profile', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.changeText(getByDisplayValue('65'), '58');
      await fireEvent.press(getByText('Save'));
      await waitFor(() => expect(getByText('Update your daily targets?')).toBeTruthy());
      await fireEvent.press(getByText('Update targets'));

      await waitFor(() => expect(mockAddWeightEntry).toHaveBeenCalledWith(58));
    });

    it('does not log a weigh-in when the weight was not touched', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.changeText(getByDisplayValue('Ada Lovelace'), 'Grace Hopper');
      await fireEvent.press(getByText('Save'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      expect(mockAddWeightEntry).not.toHaveBeenCalled();
    });
  });

  // ── Age is editable and maps back onto date_of_birth ─────────────────────

  describe('age editing', () => {
    it('writes a date_of_birth that reads back as the entered age', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);
      const { calculateAge } = require('../../src/utils/tdee');

      const shownAge = calculateAge('1996-01-01');
      await fireEvent.changeText(getByDisplayValue(String(shownAge)), '41');
      await fireEvent.press(getByText('Save'));

      // Age feeds the TDEE formula, so the preview sheet appears first.
      await waitFor(() => expect(getByText('Update your daily targets?')).toBeTruthy());
      await fireEvent.press(getByText('Keep mine'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      const dob = mockUpdateProfile.mock.calls[0][0].date_of_birth;
      expect(calculateAge(dob)).toBe(41);
    });

    it('leaves date_of_birth untouched when the age field is not edited', async () => {
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      await fireEvent.changeText(getByDisplayValue('Ada Lovelace'), 'Grace Hopper');
      await fireEvent.press(getByText('Save'));

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
      expect(mockUpdateProfile.mock.calls[0][0]).not.toHaveProperty('date_of_birth');
    });
  });

  // ── Extra edge coverage: delete-failure alert path ───────────────────────

  describe('delete-account failure path', () => {
    it('shows an inline error when deleteAccount rejects', async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error('network down'));
      const { getByText, getByPlaceholderText } = await render(<SettingsScreen />);

      await fireEvent.press(getByText('Delete account'));
      const input = await waitFor(() => getByPlaceholderText('DELETE'));
      await fireEvent.changeText(input, 'DELETE');
      await fireEvent.press(getByText('Delete forever'));

      await waitFor(() =>
        expect(getByText('Could not delete account. Please check your connection and try again.')).toBeTruthy()
      );
    });
  });

  // ── Edge: null profile must not crash mount (fields render empty) ───────

  describe('edge: no profile loaded yet', () => {
    it('renders without crashing and leaves fields blank when profile is null', async () => {
      mockProfile = null;
      const { getByText, queryByDisplayValue } = await render(<SettingsScreen />);
      expect(getByText('Settings')).toBeTruthy();
      expect(queryByDisplayValue('Ada Lovelace')).toBeNull();
    });
  });
});
