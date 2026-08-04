// Component tests for src/screens/auth/SetNewPasswordScreen.tsx
// Traces TEST_SCENARIOS.md §1.3.5–1.3.8 (the Component-layer subset of the
// Set New Password flow). Scenario IDs are referenced in test names so a
// failure can be looked up directly in that document.
//
// NOTE: the @testing-library/react-native version installed here (v14) has an
// async `render` and async `fireEvent.*` API (both return Promises), unlike
// older RNTL majors — every render()/fireEvent call below is awaited.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockCompletePasswordReset = jest.fn();
const mockSignOut = jest.fn();

// SetNewPasswordScreen calls useAuthStore twice, each time with a single-field
// selector (useAuthStore(s => s.completePasswordReset), useAuthStore(s => s.signOut)),
// not one combined object selector. The mock below must invoke whatever selector
// function it's given against a fake full-state object so both call sites work.
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (state: any) => any) =>
    selector({
      completePasswordReset: mockCompletePasswordReset,
      signOut: mockSignOut,
    }),
}));

import SetNewPasswordScreen from '../../src/screens/auth/SetNewPasswordScreen';

describe('SetNewPasswordScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  // §1.3.5 — password 6-7 chars is a DIFFERENT threshold than SignupScreen's 8-char
  // minimum (see 1.1.5). This screen's actual code requires >= 6, so 5 chars fails
  // and 6 chars passes local validation. We test the failing boundary here.
  it("1.3.5 rejects a password under 6 characters with an inline error", async () => {
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), '12345'); // 5 chars
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), '12345');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(getByText('Use at least 6 characters.')).toBeTruthy();
    });
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  // §1.3.5 (boundary continued) — 6 chars is the exact minimum and must NOT trip
  // the "too short" error (it should proceed past that check, matching fields).
  it('1.3.5 does not reject a password that is exactly 6 characters long', async () => {
    mockCompletePasswordReset.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText, queryByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), '123456'); // 6 chars
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), '123456');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(mockCompletePasswordReset).toHaveBeenCalledWith('123456');
    });
    expect(queryByText('Use at least 6 characters.')).toBeNull();
  });

  // §1.3.6 — password and confirm fields don't match
  it("1.3.6 rejects mismatched password and confirm fields with an inline error", async () => {
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), 'password1');
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'password2');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(getByText("Passwords don't match. Both fields must be identical.")).toBeTruthy();
    });
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  // §1.3.7 — successful save
  it("1.3.7 calls completePasswordReset and shows an inline confirmation on success", async () => {
    mockCompletePasswordReset.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), 'newSecret123');
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newSecret123');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(mockCompletePasswordReset).toHaveBeenCalledWith('newSecret123');
    });
    await waitFor(() => {
      expect(getByText('Password updated. You are signed in with your new password.')).toBeTruthy();
    });
  });

  // §1.3.7 (failure path, same success scenario's error branch) — completePasswordReset
  // rejects, so the screen must show the failure message inline with the thrown message.
  it("1.3.7 shows sanitised copy inline on failure", async () => {
    // Shaped like a real Supabase AuthApiError: the status, not the message
    // text, is what classify() reads — so an expired reset link produces
    // "sign in again" copy rather than the generic apology.
    mockCompletePasswordReset.mockRejectedValueOnce(
      Object.assign(new Error('Session expired'), { status: 401 }),
    );
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), 'newSecret123');
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newSecret123');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(getByText('Your session has expired. Please sign in again.')).toBeTruthy();
    });
  });

  // §1.3.7 (failure fallback) — an error without a .message must fall back to generic text.
  it("1.3.7 falls back to the generic message when the thrown error has no message", async () => {
    mockCompletePasswordReset.mockRejectedValueOnce({});
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), 'newSecret123');
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'newSecret123');
    await fireEvent.press(getByText('Save new password'));

    await waitFor(() => {
      expect(getByText("Something went wrong. Please try again.")).toBeTruthy();
    });
  });

  // §1.3.8 — "Cancel and sign out" is an escape hatch: it must call signOut()
  // directly, bypass completePasswordReset entirely, and not require the
  // password fields to be filled in first.
  it('1.3.8 calls signOut directly and does not call completePasswordReset, even with empty fields', async () => {
    const { getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.press(getByText('Cancel and sign out'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  // §1.3.8 (edge continued) — even with fields filled in (as if mid-form), Cancel
  // still bypasses validation and completePasswordReset, going straight to signOut.
  it('1.3.8 bypasses password validation and completePasswordReset when fields are filled but Cancel is tapped', async () => {
    const { getByPlaceholderText, getByText } = await render(<SetNewPasswordScreen />);

    await fireEvent.changeText(getByPlaceholderText('New password'), 'ab'); // would fail the 6-char check
    await fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'mismatch');
    await fireEvent.press(getByText('Cancel and sign out'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
