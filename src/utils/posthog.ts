import PostHog from 'posthog-react-native';

// ── The PostHog client singleton ──────────────────────────────────────────────
// This is the transport layer only: one long-lived client that owns an
// in-memory event queue and a background flush timer. Nothing in the app
// should call `posthog.capture()` directly — go through `track()` in
// ./analytics, which is type-checked against the event registry. The raw
// client is exported because App.tsx has to hand it to <PostHogProvider>.
//
// The project API key is a WRITE-ONLY client key: it can send events but
// cannot read anything back, which is why it's safe to ship inside an app
// bundle at all. It still belongs in .env rather than hardcoded in source —
// same reasoning as the Supabase anon key — so that a public repo doesn't
// hand strangers a labelled firehose into our analytics project, and so that
// dev/prod can point at different projects without a code change.
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

if (!apiKey && __DEV__) {
  console.warn(
    '[analytics] EXPO_PUBLIC_POSTHOG_KEY is not set — analytics is disabled for this run. ' +
      'Add it to .env if you want events to reach PostHog.'
  );
}

export const posthog = new PostHog(apiKey || 'phc_missing_key', {
  host,
  // `disabled` turns every capture/identify into a no-op at the client level.
  // Without it, a missing key would still queue events in AsyncStorage and
  // retry forever against a project that can't accept them — silent battery
  // and storage waste. The placeholder key above exists only so the
  // constructor has a well-formed string to work with in that disabled state.
  disabled: !apiKey,
  // Emits Application Installed / Updated / Opened / Backgrounded for us, so
  // we get install and session counts without writing a single lifecycle hook.
  captureAppLifecycleEvents: true,
});
