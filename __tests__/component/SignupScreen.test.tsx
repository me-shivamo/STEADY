// Component tests for src/screens/auth/SignupScreen.tsx
// Traces TEST_SCENARIOS.md §1.1 (Sign Up) — only rows tagged Component (or Unit/Component)
// are covered here. E2E/Manual rows (1.1.1, 1.1.9, 1.1.11, 1.1.12) are out of scope: E2E/Manual.
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

const mockSignUp = jest.fn();
const mockSignInWithGoogle = jest.fn();

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
  }),
}));

import SignupScreen from '../../src/screens/auth/SignupScreen';

const fakeNavigation = { navigate: jest.fn() } as any;

function renderScreen() {
  return render(<SignupScreen navigation={fakeNavigation} />);
}

describe('SignupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(async () => {
    (Alert.alert as jest.Mock).mockRestore();
    await cleanup();
  });

  // §1.1.2 — blank full name
  it('1.1.2 shows Missing fields alert when full name is blank and does not call signUp', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), '');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.3 — blank email
  it('1.1.3 shows Missing fields alert when email is blank and does not call signUp', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), '');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.4 — blank password
  it('1.1.4 shows Missing fields alert when password is blank and does not call signUp', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), '');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.7 — all fields whitespace-only
  it('1.1.7 shows Missing fields alert when all fields are whitespace-only ("   ")', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), '   ');
    await fireEvent.changeText(getByPlaceholderText('Email address'), '   ');
    await fireEvent.changeText(getByPlaceholderText('Password'), '   ');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.7 — whitespace-only name specifically, valid-looking rest
  it('1.1.7 shows Missing fields alert when only full name is whitespace-only', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), '   ');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.7 — whitespace-only email specifically
  it('1.1.7 shows Missing fields alert when only email is whitespace-only', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), '   ');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.7 — whitespace-only password specifically
  it('1.1.7 shows Missing fields alert when only password is whitespace-only', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), '   ');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Missing fields', 'Please fill in all fields.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.5 — password exactly 7 characters fails the weak-password boundary
  it('1.1.5 shows Weak password alert for a 7-character password and does not call signUp', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), '1234567');
    await fireEvent.press(getByText('Create Account'));

    expect(Alert.alert).toHaveBeenCalledWith('Weak password', 'Password must be at least 8 characters.');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // §1.1.6 — password exactly 8 characters passes local validation, proceeds to signUp()
  it('1.1.6 an 8-character password passes local validation and calls signUp', async () => {
    mockSignUp.mockResolvedValueOnce(undefined);
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), '12345678');
    await fireEvent.press(getByText('Create Account'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('test@example.com', '12345678', 'Jane Doe'));
    expect(Alert.alert).not.toHaveBeenCalledWith('Weak password', expect.anything());
    expect(Alert.alert).not.toHaveBeenCalledWith('Missing fields', expect.anything());
  });

  // §1.1.8 / 1.1.9 — signUp() rejects (duplicate email / network failure) surfaces "Sign up failed"
  it('1.1.8 shows Sign up failed with the error message when signUp rejects (e.g. duplicate email)', async () => {
    mockSignUp.mockRejectedValueOnce(new Error('User already registered'));
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Sign up failed', 'User already registered')
    );
  });

  // §1.1.9 — network failure surfaces the generic fallback when the rejected error has no message
  it('1.1.9 shows Sign up failed with the generic fallback when the rejected error has no message', async () => {
    mockSignUp.mockRejectedValueOnce({});
    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(getByText('Create Account'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Sign up failed', 'Something went wrong.')
    );
  });

  // §1.1.10 — Google cancel suppression: no alert when error.message === 'User cancelled'
  it('1.1.10 shows no alert when Google sign-in is cancelled by the user', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('User cancelled'));
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  // §1.1.10 (companion) — a genuine Google failure (not cancellation) DOES show an alert
  it('1.1.10 shows Sign in failed for a genuine Google sign-in error (not cancellation)', async () => {
    mockSignInWithGoogle.mockRejectedValueOnce(new Error('Network error'));
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Continue with Google'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Sign in failed', 'Network error')
    );
  });

  // §1.1.13 — double-tap Create Account: button disabled while isLoading, second press must not fire signUp twice
  it('1.1.13 disables Create Account while loading so a rapid second tap does not call signUp twice', async () => {
    let resolveSignUp: () => void;
    mockSignUp.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSignUp = resolve;
      })
    );

    const { getByPlaceholderText, getByText } = await renderScreen();

    await fireEvent.changeText(getByPlaceholderText('Full name'), 'Jane Doe');
    await fireEvent.changeText(getByPlaceholderText('Email address'), 'test@example.com');
    await fireEvent.changeText(getByPlaceholderText('Password'), 'password123');

    // Do NOT await this press: signUp() is deliberately left pending (resolveSignUp
    // is called later below), and awaiting fireEvent.press() here would await the
    // internal act() flush, which itself waits on the in-flight handler promise —
    // a deadlock. Firing without awaiting lets us observe the loading state via
    // waitFor while the promise is still unresolved.
    fireEvent.press(getByText('Create Account'));
    // Button label switches to loading text; the underlying element is now disabled.
    await waitFor(() => expect(getByText('Creating account…')).toBeTruthy());
    // Rapid second tap while still loading — same reasoning, fire without awaiting.
    fireEvent.press(getByText('Creating account…'));

    resolveSignUp!();
    await waitFor(() => expect(getByText('Create Account')).toBeTruthy());

    expect(mockSignUp.mock.calls.length).toBe(1);
  });
});
