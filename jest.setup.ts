// Runs once before every test file (wired via package.json's "jest.setupFiles").
//
// src/api/supabase.ts calls createClient(url, key) at MODULE LOAD TIME (not
// lazily) — so anything that imports a Zustand store, even just to reach a
// pure helper function inside it, drags this call along for free. The
// supabase-js client validates its URL argument immediately and throws if
// it's missing, so tests need *some* well-formed value here even though
// none of our current unit tests ever make a real network call.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
