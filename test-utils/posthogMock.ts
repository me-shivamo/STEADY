// PostHog's real client throws in the Jest environment (no AsyncStorage-backed device
// available), and it's a fire-and-forget analytics side effect anyway — never something
// a test should assert on — so every test transitively touching authStore gets this no-op
// instead, via the `moduleNameMapper` entry in package.json's jest config.
export const posthog = {
  identify: jest.fn(),
  capture: jest.fn(),
  reset: jest.fn(),
};
