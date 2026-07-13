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
// Ionicons for decorative glyphs (back chevron, trash icon, external-link
// icon) that no test here asserts on, so a lightweight stub avoids the
// missing-module resolution error without touching any src/ file.
jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Stub = (props: any) => ReactLib.createElement(Text, props, props.name ?? '');
  return { Ionicons: Stub };
});

type Profile = Tables<'profiles'>;

const mockGoBack = jest.fn();
const mockUpdateProfile = jest.fn();
const mockDeleteAccount = jest.fn();

let mockProfile: Partial<Profile> | null;

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({
      profile: mockProfile,
      updateProfile: mockUpdateProfile,
      deleteAccount: mockDeleteAccount,
    }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

// Base fixture profile used across most tests.
function baseProfile(overrides: Partial<Profile> = {}): Partial<Profile> {
  return {
    full_name: 'Ada Lovelace',
    sex: 'female',
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
    it('9.1 shows "Could not save" / "Please check your connection and try again." when updateProfile rejects', async () => {
      mockUpdateProfile.mockRejectedValueOnce(new Error('network down'));
      const { getByText } = await render(<SettingsScreen />);

      await fireEvent.press(getByText('Save'));

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          'Could not save',
          'Please check your connection and try again.'
        )
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
  });

  // ── §9.2 — draft discarded without Save ──────────────────────────────────

  describe('9.2 draft discarded without save', () => {
    it('9.2 does not call updateProfile after editing a field without pressing Save', async () => {
      const { getByDisplayValue } = await render(<SettingsScreen />);

      const nameInput = getByDisplayValue('Ada Lovelace');
      await fireEvent.changeText(nameInput, 'Unsaved Name');

      // Simulate "navigating away" — nothing in the component triggers a
      // commit except the Save button, so simply never pressing it and
      // letting the screen unmount is the discard path.
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
    it('9.3 converts height/weight to imperial and back to the original metric values (within rounding)', async () => {
      // 170cm -> 67in (round(170/2.54)=66.9->67), 65kg -> 143lbs (round(65/0.453592)=143.3->143)
      const { getByText, getByDisplayValue } = await render(<SettingsScreen />);

      // Starts in metric: original stored values displayed as-is.
      expect(getByDisplayValue('170')).toBeTruthy(); // height cm
      expect(getByDisplayValue('65')).toBeTruthy(); // current weight kg

      // Toggle to Imperial.
      await fireEvent.press(getByText('Imperial'));

      // 170 / 2.54 = 66.9 -> rounds to 67
      expect(getByDisplayValue('67')).toBeTruthy();
      // 65 / 0.453592 = 143.3 -> rounds to 143
      expect(getByDisplayValue('143')).toBeTruthy();

      // Toggle back to Metric — raw stored cm/kg strings are untouched by
      // the round-trip since conversion is display-only (toDisplayHeight/
      // toDisplayWeight), so we get the exact original values back.
      await fireEvent.press(getByText('Metric'));

      expect(getByDisplayValue('170')).toBeTruthy();
      expect(getByDisplayValue('65')).toBeTruthy();
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

  // ── Extra edge coverage: delete-failure alert path ───────────────────────

  describe('delete-account failure path', () => {
    it("shows 'Could not delete account' / 'Please check your connection and try again.' when deleteAccount rejects", async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error('network down'));
      const { getByText, getByPlaceholderText } = await render(<SettingsScreen />);

      await fireEvent.press(getByText('Delete account'));
      const input = await waitFor(() => getByPlaceholderText('DELETE'));
      await fireEvent.changeText(input, 'DELETE');
      await fireEvent.press(getByText('Delete forever'));

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          'Could not delete account',
          'Please check your connection and try again.'
        )
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
