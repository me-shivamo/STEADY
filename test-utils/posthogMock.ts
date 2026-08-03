// PostHog's real client throws in the Jest environment (no AsyncStorage-backed device
// available), and it's a fire-and-forget analytics side effect anyway — never something
// a test should assert on — so every test transitively touching a store gets this no-op
// instead, via the `moduleNameMapper` entry in package.json's jest config.
//
// This must mirror every method src/utils/analytics.ts calls on the real client
// (capture, identify, reset, screen). A missing method here surfaces as a
// confusing "not a function" failure inside an unrelated test.
export const posthog = {
  identify: jest.fn(),
  capture: jest.fn(),
  reset: jest.fn(),
  screen: jest.fn(),
  flush: jest.fn(),
};
