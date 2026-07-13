// Supabase's real query builder is "thenable" — `await supabase.from(...).select(...).eq(...)`
// resolves without ever calling `.single()`. This mock builder supports both styles so store
// code doesn't need special-casing to be testable.
export function makeQueryResult<T>(data: T, error: unknown = null) {
  const result = { data, error };
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

export type SupabaseMock = {
  from: jest.Mock;
  functions: { invoke: jest.Mock };
  storage: { from: jest.Mock };
  auth: {
    getUser: jest.Mock;
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    signUp: jest.Mock;
    signInWithPassword: jest.Mock;
    signInWithOAuth: jest.Mock;
    setSession: jest.Mock;
    signInWithIdToken: jest.Mock;
    signOut: jest.Mock;
    resetPasswordForEmail: jest.Mock;
    exchangeCodeForSession: jest.Mock;
    updateUser: jest.Mock;
  };
};

export function createSupabaseMock(): SupabaseMock {
  return {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
    storage: { from: jest.fn() },
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
      setSession: jest.fn(),
      signInWithIdToken: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      updateUser: jest.fn(),
    },
  };
}
