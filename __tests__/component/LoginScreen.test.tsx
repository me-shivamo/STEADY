// Component tests for src/screens/auth/LoginScreen.tsx
// Traces TEST_SCENARIOS.md §1.2 (Log In) and §1.3 (Forgot Password) — only rows tagged
// Component (or Unit/Component) are covered here. E2E/Manual rows (1.2.1, 1.2.3, 1.2.4,
// 1.3.1, 1.3.4, 1.3.5-1.3.9 which live on other screens) are out of scope: E2E/Manual.
// Note: 1.2.3/1.2.4 are nominally E2E in the spec, but both collapse to the same
// generic "Login failed" alert path, which we exercise here as a Component-level check
// on the alert text itself (no distinguishing logic exists to assert on otherwise).
//
// NOTE on async RNTL calls: in this environment's installed
// @testing-library/react-native@14 + jest-expo/React 19 combo, `render()`,
// `fireEvent.press()`, and `fireEvent.changeText()` all return Promises that
// must be awaited (confirmed against __tests__/component/SettingsScreen.test.tsx,
// which documents and relies on the same fix) — otherwise their internal
// act() batches overlap with the next call/test and corrupt the returned
// query functions ("You seem to have overlapping act() calls"). Every call
// here is awaited.

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockRequestPasswordReset = jest.fn();

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
    requestPasswordReset: mockRequestPasswordReset,
  }),
}));

import LoginScreen from '../../src/screens/auth/LoginScreen';

const fakeNavigation = { navigate: jest.fn() } as any;

function renderScreen() {
  return render(<LoginScreen navigation={fakeNavigation} />);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(async () => {
    (Alert.alert as jest.Mock).mockRestore();
    await cleanup();
  });

  // §1.2.2 — blank email
  it('1.2.2 shows Missing fields alert when email is blank and does not call signIn', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), '');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Log In'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please enter your email and password.');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // §1.2.2 — blank password
  it('1.2.2 shows Missing fields alert when password is blank and does not call signIn', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), '');
    await fireEvent.press(getByText('Log In'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please enter your email and password.');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // §1.2.2 — both blank
  it('1.2.2 shows Missing fields alert when both email and password are blank', async () => {
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Log In'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please enter your email and password.');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // §1.2.3 — correct email, wrong password: generic "Login failed" alert with err.message
  it('1.2.3 shows Login failed with the error message when signIn rejects (wrong password)', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpassword');
    await fireEvent.press(getByText('Log In'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Login failed', 'Invalid login credentials')
    );
  });

  // §1.2.4 — no such account: SAME generic alert, code does not distinguish (avoids account enumeration)
  it('1.2.4 shows the same generic Login failed alert for a non-existent account (no enumeration)', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'nosuchaccount@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Log In'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Login failed', 'Invalid login credentials')
    );
  });

  // §1.2.4 (fallback) — rejected error with no message falls back to the generic copy
  it('1.2.4 falls back to "Invalid email or password." when the rejected error has no message', async () => {
    mockSignIn.mockRejectedValueOnce({});
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Log In'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Login failed', 'Invalid email or password.')
    );
  });

  // §1.2.5 — regression: email is trimmed, password is NOT — trailing spaces sent verbatim
  it('1.2.5 trims the email but sends the password verbatim, including leading/trailing spaces', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), '  test@example.com  ');
    await fireEvent.changeText(getByPlaceholderText('Password'), ' secret123 ');
    await fireEvent.press(getByText('Log In'));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', ' secret123 ')
    );
  });

  // §1.3.2 — Forgot password with empty email: alert, no network call
  it('1.3.2 shows Enter your email alert when Forgot password is tapped with email empty, no network call', async () => {
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Forgot password?'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Enter your email',
      'Type your email address above first, then tap "Forgot password?" again.'
    );
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  // §1.3.1 — success path: "Check your email" alert containing the email address
  it('1.3.1 shows Check your email with a message containing the trimmed email on success', async () => {
    mockRequestPasswordReset.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), '  test@example.com  ');
    await fireEvent.press(getByText('Forgot password?'));

    await waitFor(() => expect(mockRequestPasswordReset).toHaveBeenCalledWith('test@example.com'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Check your email',
      "If an account exists for test@example.com, we've sent it a password-reset link. Open the link on this phone to set a new password."
    );
  });

  // §1.3.1 (failure branch) — Could not send reset email alert with err.message
  it('1.3.1 shows Could not send reset email with the error message when requestPasswordReset rejects', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(new Error('Rate limited'));
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.press(getByText('Forgot password?'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not send reset email', 'Rate limited')
    );
  });

  // §1.3.1 (failure branch fallback text)
  it('1.3.1 falls back to "Please try again." when the reset rejection has no message', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce({});
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.press(getByText('Forgot password?'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not send reset email', 'Please try again.')
    );
  });

  // §1.3.3 — rapid double-tap of Forgot password only sends one reset email (resetLoading guard)
  it('1.3.3 only calls requestPasswordReset once when Forgot password is tapped twice rapidly', async () => {
    let resolveReset: () => void;
    mockRequestPasswordReset.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      })
    );

    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');

    // Do NOT await this press: requestPasswordReset() is deliberately left
    // pending (resolveReset is called later below), and awaiting
    // fireEvent.press() here would await the internal act() flush, which
    // itself waits on the in-flight handler promise — a deadlock. Firing
    // without awaiting lets us observe the loading state via waitFor while
    // the promise is still unresolved.
    fireEvent.press(getByText('Forgot password?'));
    await waitFor(() => expect(getByText('Sending…')).toBeTruthy());
    // Rapid second tap while still sending — same reasoning, fire without awaiting.
    fireEvent.press(getByText('Sending…'));

    resolveReset!();
    await waitFor(() => expect(getByText('Forgot password?')).toBeTruthy());

    expect(mockRequestPasswordReset.mock.calls.length).toBe(1);
  });

  // Google sign-in cancellation suppression (mirrors 1.1.10's logic, shared code path on this screen)
  it('1.2.x shows no alert when Google sign-in is cancelled by the user', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('User cancelled'));
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
