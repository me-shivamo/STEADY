// Unit tests for src/store/authStore.ts
// Traces TEST_SCENARIOS.md §1 (Authentication), rows tagged Unit / "Unit (mock)" /
// Component that are testable at the store layer (no screen render needed).
// Screen-level form-validation scenarios (e.g. 1.1.2-1.1.7, 1.2.2, 1.3.2-1.3.3,
// 1.3.5-1.3.6, 1.5.2) live in their own screen Component test files, not here.

jest.mock('../../src/api/supabase', () => {
  const { createSupabaseMock } = require('../../test-utils/supabaseMock');
  return { supabase: createSupabaseMock() };
});

// makeRedirectUri() ultimately calls into expo-linking, which needs a real
// app.json/app.config manifest (via expo-constants) to resolve the URI scheme --
// unavailable in the Jest environment. Only requestPasswordReset/signInWithGoogle
// call it; we stub just this one export so the rest of the real module (unused by
// authStore's tested paths) stays intact.
jest.mock('expo-auth-session', () => ({
  ...jest.requireActual('expo-auth-session'),
  makeRedirectUri: jest.fn(() => 'steady://reset-password'),
}));

const mockReset = jest.fn();
jest.mock('../../src/store/foodLogStore', () => ({
  useFoodLogStore: {
    getState: () => ({ reset: mockReset }),
  },
}));

import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/authStore';

const mockSupabase = supabase as unknown as import('../../test-utils/supabaseMock').SupabaseMock;

// Zustand stores are singletons in this app (useXStore.getState()/.setState()).
// Snapshot the pristine initial state once so every test can restore it exactly,
// regardless of what a previous test mutated.
const INITIAL_STATE = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(INITIAL_STATE, true);
  mockReset.mockClear();
  jest.clearAllMocks();
});

describe('signUp', () => {
  // §1.1.8 — Supabase returns an error (e.g. email already has an account)
  it('1.1.8 propagates the Supabase error when the email already has an account', async () => {
    mockSupabase.auth.signUp.mockResolvedValueOnce({
      error: { message: 'User already registered' },
      data: { user: null },
    });

    await expect(
      useAuthStore.getState().signUp('taken@example.com', 'password123', 'Jane Doe')
    ).rejects.toMatchObject({ message: 'User already registered' });
  });

  // Positive path: successful signUp resolves cleanly and forwards the right args.
  it('1.1.1 calls supabase.auth.signUp with email/password/full_name and resolves without throwing', async () => {
    mockSupabase.auth.signUp.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'user-1' } },
    });

    await expect(
      useAuthStore.getState().signUp('new@example.com', 'password123', 'Jane Doe')
    ).resolves.toBeUndefined();

    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { full_name: 'Jane Doe' } },
    });
  });

  // Edge: signUp resolves with no error and no user (e.g. email-confirmation-required
  // flows return data.user: null) — must not throw, must not crash on posthog calls.
  it('1.1.1e does not throw when signUp succeeds but returns no user (e.g. confirmation required)', async () => {
    mockSupabase.auth.signUp.mockResolvedValueOnce({ error: null, data: { user: null } });

    await expect(
      useAuthStore.getState().signUp('pending@example.com', 'password123', 'Jane Doe')
    ).resolves.toBeUndefined();
  });
});

describe('signIn', () => {
  // §1.2.3 — correct email, wrong password
  it('1.2.3 rejects wrong password with the Supabase error propagated to the caller', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
      data: { user: null },
    });

    await expect(
      useAuthStore.getState().signIn('user@example.com', 'wrongpass')
    ).rejects.toMatchObject({ message: 'Invalid login credentials' });
  });

  // §1.2.4 — email that has no account at all: store does not distinguish this from
  // wrong-password, it just surfaces whatever Supabase returns (avoids account enumeration
  // upstream at the screen layer, but at the store layer it's simply the same error path).
  it('1.2.4 rejects a non-existent account with the same error path as wrong password', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
      data: { user: null },
    });

    await expect(
      useAuthStore.getState().signIn('nobody@example.com', 'somepass')
    ).rejects.toMatchObject({ message: 'Invalid login credentials' });
  });

  // §1.2.5 — password is forwarded verbatim (not trimmed) by the store; trimming (email
  // only) is a screen-level concern per the spec, so the store must pass through exactly
  // what it's given, trailing space and all.
  it('1.2.5 forwards email and password to Supabase verbatim, without trimming', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'user-1' } },
    });

    await useAuthStore.getState().signIn('user@example.com', 'secret123 ');

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret123 ',
    });
  });

  // §1.2.1 — valid credentials succeed
  it('1.2.1 resolves without throwing on valid credentials', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'user-1' } },
    });

    await expect(
      useAuthStore.getState().signIn('user@example.com', 'correctpass')
    ).resolves.toBeUndefined();
  });

  // Edge: signing in again while a session is already present in the store — the store
  // has no guard against this, it should just proceed and call Supabase again (Supabase
  // itself is the source of truth for session replacement, not client-side state).
  it('1.2.1e signs in again even when a session is already present in store state', async () => {
    useAuthStore.setState({
      session: { user: { id: 'old-user' } } as any,
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'new-user' } },
    });

    await expect(
      useAuthStore.getState().signIn('user@example.com', 'pass')
    ).resolves.toBeUndefined();
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

describe('requestPasswordReset', () => {
  // §1.3.1 — calls the right Supabase method with the right args (the "don't leak
  // account existence" UI behavior lives in LoginScreen, not here).
  it('1.3.1 calls supabase.auth.resetPasswordForEmail with the email and a steady redirectTo', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });

    await useAuthStore.getState().requestPasswordReset('user@example.com');

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    const [emailArg, optionsArg] = mockSupabase.auth.resetPasswordForEmail.mock.calls[0];
    expect(emailArg).toBe('user@example.com');
    expect(optionsArg).toEqual({ redirectTo: expect.any(String) });
    expect(optionsArg.redirectTo).toEqual(expect.stringContaining('reset-password'));
  });

  // Edge: Supabase returns an error (e.g. rate-limited) — must propagate, not swallow.
  it('1.3.1e propagates an error from resetPasswordForEmail to the caller', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: 'Email rate limit exceeded' },
    });

    await expect(
      useAuthStore.getState().requestPasswordReset('user@example.com')
    ).rejects.toMatchObject({ message: 'Email rate limit exceeded' });
  });
});

describe('handleAuthDeepLink', () => {
  // §1.3.4 — implicit-flow reset link: tokens in the URL hash fragment.
  it('1.3.4 sets passwordRecovery true after setSession succeeds on an implicit-flow reset link', async () => {
    mockSupabase.auth.setSession.mockResolvedValueOnce({ error: null, data: { user: { id: 'u1' } } });

    await useAuthStore
      .getState()
      .handleAuthDeepLink('steady://reset-password#access_token=AT123&refresh_token=RT456');

    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'AT123',
      refresh_token: 'RT456',
    });
    expect(useAuthStore.getState().passwordRecovery).toBe(true);
  });

  // PKCE-flow reset link: a one-time ?code= param instead of hash tokens.
  it('1.3.4b sets passwordRecovery true after exchangeCodeForSession succeeds on a PKCE reset link', async () => {
    mockSupabase.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'u1' } },
    });

    await useAuthStore.getState().handleAuthDeepLink('steady://reset-password?code=abc123');

    expect(mockSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(useAuthStore.getState().passwordRecovery).toBe(true);
  });

  // Edge: a URL that does not contain 'reset-password' at all must be a total no-op —
  // e.g. the Google OAuth callback path, which is consumed elsewhere and should never
  // reach this handler in practice, but if it did it must not touch any auth state.
  it('1.3.9a is a no-op for a URL that does not contain "reset-password"', async () => {
    await useAuthStore.getState().handleAuthDeepLink('steady://auth/callback#access_token=AT&refresh_token=RT');

    expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
    expect(mockSupabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().passwordRecovery).toBe(false);
  });

  // Edge: reset-password URL with neither hash tokens nor a ?code= param — must be a
  // silent no-op (the `else return;` branch), not a crash.
  it('1.3.9b is a no-op for a reset-password URL with no tokens and no code param', async () => {
    await useAuthStore.getState().handleAuthDeepLink('steady://reset-password');

    expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
    expect(mockSupabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().passwordRecovery).toBe(false);
  });

  // Edge: setSession fails (e.g. expired/invalid tokens) — must throw and must NOT set
  // passwordRecovery, since the session was never actually established.
  it('1.3.9c throws and leaves passwordRecovery false when setSession fails on an implicit-flow link', async () => {
    mockSupabase.auth.setSession.mockResolvedValueOnce({
      error: { message: 'Token expired' },
      data: { user: null },
    });

    await expect(
      useAuthStore
        .getState()
        .handleAuthDeepLink('steady://reset-password#access_token=AT&refresh_token=RT')
    ).rejects.toMatchObject({ message: 'Token expired' });
    expect(useAuthStore.getState().passwordRecovery).toBe(false);
  });

  // Edge: exchangeCodeForSession fails on the PKCE path — same contract as above.
  it('1.3.9d throws and leaves passwordRecovery false when exchangeCodeForSession fails on a PKCE link', async () => {
    mockSupabase.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: 'Invalid code' },
      data: { user: null },
    });

    await expect(
      useAuthStore.getState().handleAuthDeepLink('steady://reset-password?code=bad-code')
    ).rejects.toMatchObject({ message: 'Invalid code' });
    expect(useAuthStore.getState().passwordRecovery).toBe(false);
  });
});

describe('completePasswordReset', () => {
  // §1.3.7 — successful password update clears passwordRecovery.
  it('1.3.7 clears passwordRecovery after updateUser succeeds', async () => {
    useAuthStore.setState({ passwordRecovery: true });
    mockSupabase.auth.updateUser.mockResolvedValueOnce({ error: null, data: { user: { id: 'u1' } } });

    await useAuthStore.getState().completePasswordReset('newSecret123');

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newSecret123' });
    expect(useAuthStore.getState().passwordRecovery).toBe(false);
  });

  // Edge: updateUser fails — passwordRecovery must remain true so the user stays on
  // SetNewPasswordScreen rather than silently being kicked into the app.
  it('1.3.7e leaves passwordRecovery true when updateUser fails', async () => {
    useAuthStore.setState({ passwordRecovery: true });
    mockSupabase.auth.updateUser.mockResolvedValueOnce({
      error: { message: 'Password too weak' },
      data: { user: null },
    });

    await expect(useAuthStore.getState().completePasswordReset('weak')).rejects.toMatchObject({
      message: 'Password too weak',
    });
    expect(useAuthStore.getState().passwordRecovery).toBe(true);
  });
});

describe('signOut (§1.4)', () => {
  // §1.4.1 — local state clears synchronously, even without ever awaiting the
  // background supabase.auth.signOut() call.
  it('1.4.1 clears session/profile/passwordRecovery synchronously without awaiting the background revoke', () => {
    useAuthStore.setState({
      session: { user: { id: 'u1' } } as any,
      profile: { id: 'u1' } as any,
      passwordRecovery: true,
    });
    // Never resolves -- proves the store doesn't wait on it to clear local state.
    mockSupabase.auth.signOut.mockReturnValueOnce(new Promise(() => {}));

    useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.passwordRecovery).toBe(false);
  });

  // §1.4.3 — the food log store must be reset so a new user on the same device never
  // sees the previous user's meals/totals.
  it('1.4.3 resets the food log store as part of sign-out', () => {
    mockSupabase.auth.signOut.mockReturnValueOnce(new Promise(() => {}));

    useAuthStore.getState().signOut();

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  // §1.4.2 — background revoke fails (e.g. offline): must not throw or block, only warn.
  it('1.4.2 does not throw when the background supabase.auth.signOut resolves with an error (offline)', async () => {
    mockSupabase.auth.signOut.mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => useAuthStore.getState().signOut()).not.toThrow();
    // Flush the microtask queue so the fire-and-forget .then() handler runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('Background sign-out failed:', 'Network request failed');
    warnSpy.mockRestore();
  });

  // Edge: the background call rejects outright (thrown network error, not a resolved
  // {error}) — the .catch() must swallow it too.
  it('1.4.2b does not throw when the background supabase.auth.signOut call rejects entirely', async () => {
    mockSupabase.auth.signOut.mockReturnValueOnce(Promise.reject(new Error('fetch failed')));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => useAuthStore.getState().signOut()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('Background sign-out threw:', expect.any(Error));
    warnSpy.mockRestore();
  });

  // Edge: double sign-out (calling it twice back-to-back) must not throw and must
  // leave state cleared both times -- and reset() gets called once per invocation.
  it('1.4.1e handles a double sign-out without throwing, calling reset() each time', () => {
    mockSupabase.auth.signOut.mockReturnValue(new Promise(() => {}));
    useAuthStore.setState({ session: { user: { id: 'u1' } } as any });

    expect(() => {
      useAuthStore.getState().signOut();
      useAuthStore.getState().signOut();
    }).not.toThrow();

    expect(useAuthStore.getState().session).toBeNull();
    expect(mockReset).toHaveBeenCalledTimes(2);
  });
});

describe('deleteAccount (§1.5)', () => {
  // §1.5.1 — happy path: Edge Function confirms success, local state clears and
  // the food log store resets, same as sign-out.
  it('1.5.1 clears local state and resets food log store when the Edge Function confirms success', async () => {
    useAuthStore.setState({
      session: { user: { id: 'u1' } } as any,
      profile: { id: 'u1' } as any,
      passwordRecovery: true,
    });
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    mockSupabase.auth.signOut.mockResolvedValueOnce({ error: null });

    await useAuthStore.getState().deleteAccount();

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('delete-account');
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.passwordRecovery).toBe(false);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  // §1.5.4 (error shape 1) — functions.invoke resolves with an `error` set. Local
  // session must NOT be cleared since the server-side delete never confirmed.
  it('1.5.4a throws and does NOT clear local state when functions.invoke resolves with an error', async () => {
    const session = { user: { id: 'u1' } } as any;
    useAuthStore.setState({ session, profile: { id: 'u1' } as any });
    mockSupabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge Function crashed' },
    });

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('Edge Function crashed');

    const state = useAuthStore.getState();
    expect(state.session).toBe(session);
    expect(state.profile).not.toBeNull();
    expect(mockReset).not.toHaveBeenCalled();
  });

  // §1.5.4 (error shape 2) — functions.invoke resolves successfully (no `error`) but
  // data.success is falsy. This is the exact case the spec flags: "local session must
  // NOT be cleared if the server-side delete didn't confirm success."
  it('1.5.4b throws and does NOT clear local state when data.success is falsy despite no transport error', async () => {
    const session = { user: { id: 'u1' } } as any;
    useAuthStore.setState({ session, profile: { id: 'u1' } as any });
    mockSupabase.functions.invoke.mockResolvedValueOnce({
      data: { success: false, error: 'User has active subscription' },
      error: null,
    });

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('User has active subscription');

    const state = useAuthStore.getState();
    expect(state.session).toBe(session);
    expect(mockReset).not.toHaveBeenCalled();
  });

  // Edge: data.success is falsy AND data.error is missing -- must fall back to the
  // generic "Account deletion failed" message rather than throwing "undefined".
  it('1.5.4c falls back to a generic message when data.success is falsy and data.error is absent', async () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as any });
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: { success: false }, error: null });

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('Account deletion failed');
    expect(mockReset).not.toHaveBeenCalled();
  });

  // Edge: data is entirely null/undefined (e.g. malformed response) -- `data?.success`
  // must not throw a TypeError, it should fail with the generic message instead.
  it('1.5.4d falls back to the generic message when data itself is null', async () => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as any });
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: null, error: null });

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('Account deletion failed');
    expect(mockReset).not.toHaveBeenCalled();
  });

  // Edge: functions.invoke rejects entirely (network error, not a resolved {error}
  // shape) -- deleteAccount must propagate the rejection and must not clear state.
  it('1.5.4e propagates a full network rejection from functions.invoke without clearing state', async () => {
    const session = { user: { id: 'u1' } } as any;
    useAuthStore.setState({ session });
    mockSupabase.functions.invoke.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('Network request failed');

    expect(useAuthStore.getState().session).toBe(session);
    expect(mockReset).not.toHaveBeenCalled();
  });

  // Edge: the best-effort background signOut after a successful delete also swallows
  // its own errors silently (`.catch(() => {})`) -- must not surface or throw.
  it('1.5.1e does not throw even if the post-delete background signOut rejects', async () => {
    mockSupabase.functions.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    mockSupabase.auth.signOut.mockReturnValueOnce(Promise.reject(new Error('revoke failed')));

    await expect(useAuthStore.getState().deleteAccount()).resolves.toBeUndefined();
    expect(useAuthStore.getState().session).toBeNull();
  });
});

describe('updateProfile no-session guard', () => {
  // Referenced by the spec's session-state edge cases: updateProfile must no-op
  // (not throw, not call Supabase) when there is no active session.
  it('no-session updateProfile returns early without calling supabase.from', async () => {
    useAuthStore.setState({ session: null });

    await expect(useAuthStore.getState().updateProfile({ full_name: 'New Name' })).resolves.toBeUndefined();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});
