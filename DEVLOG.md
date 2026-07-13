# STEADY — Build in Public Devlog

> A chronological story of building STEADY, an AI-powered calorie tracking app for iOS and Android.
> Written as it happens — raw, real, and ready to share.

### A push got blocked, and it turned up real credentials sitting in plaintext notes
*2026-07-13 · Bug*

Tried to push five queued-up commits and GitHub's secret-scanning push protection rejected it outright — a live OpenRouter API key was sitting in `NOTES.md`, committed four commits back. Digging into that one flagged line turned up more than expected: the same block of personal notes also had the Supabase database password and project ref typed out in plaintext, all from an early session where credentials got jotted down next to genuinely useful learning notes instead of going straight into env vars. We used `git filter-branch` with a `tree-filter` to strip the credential lines out of `NOTES.md` across every commit that touched it — not just the one GitHub flagged — and had to do it twice: once on `master`, and again on a second local branch (`worktree-test-scenarios-automation`) tied to an active worktree, since it carried an independent copy of the same leaked block in its own history. That worktree was mid-edit on three Supabase edge functions with uncommitted changes, so we saved a patch of that work before tearing the worktree down, rewrote the branch, then rebuilt the worktree and reapplied the patch — nothing lost. After confirming with a grep across every local ref that the secret was gone, we deleted the rebase backup refs, ran `git gc`, and pushed clean.

The bigger lesson: rewriting git history only removes the *evidence trail* — it does nothing to un-expose a key that was already sitting in a repo, even briefly, even just in a rejected push attempt. The actual fix is rotating the OpenRouter key and the Supabase DB password at the source, which has to happen independent of any git surgery. `NOTES.md` is going to need a firm rule going forward: it's for learning notes, not a place to paste credentials while setting things up — those belong directly in `.env` (already gitignored) from the first keystroke.

### Writing the first two E2E flows — and proving WSL2's USB bridge can't sustain them
*2026-07-12 · Setup*

We wrote two real Maestro flows — `signup-onboarding-home.yaml` (full signup through all 6 onboarding screens to Home) and `login.yaml` (sign out, log back in) — and spent most of this session trying to get one to run start-to-finish against a real device. The flow-writing itself went well once we stopped guessing at Maestro's YAML syntax and started using `maestro check-syntax` as a fast, free local check before ever touching the device: we'd invented an `assertVisible: {text, timeout}` shape by analogy with other tools, and it was simply wrong — the real mechanism is a separate `extendedWaitUntil: {visible, timeout}` command. We also hit a real device-specific landmine: `launchApp: {clearState: true}` throws a `SecurityException` on this OPPO/ColorOS phone because its locked-down adb shell doesn't grant `CLEAR_APP_USER_DATA` — so the signup flow instead opens with a defensive `runFlow: {when: {visible: "kcal"}, ...}` block that signs out only if the app happens to already be on Home, making it self-sufficient regardless of starting state (and we caught, just in time via a live screenshot, that the phone was signed into a real account with real logged meals before that guard existed — a good reminder to always check device state before scripting a blind tap sequence).

The harder problem turned out to be infrastructure, not test logic. We're running inside WSL2, which has no native USB stack, so the phone is bridged in via `usbipd-win`'s USB-over-IP forwarding into WSL2's `vhci_hcd` virtual USB driver. That bridge could not sustain a multi-step Maestro run: across roughly six attempts (including on a second, completely different physical Android device, to rule out a device-specific fault) we hit the identical kernel-level failure signature every time — `vhci_hcd: urb->status -104`, a USB request being reset mid-transfer, with the USB device number silently incrementing each time it dropped and reattached. One `dmesg` line even showed WSL2's own networking layer failing a connectivity check. A single-step smoke test (just `launchApp` + a screenshot) succeeded early in the session, proving the whole chain *can* work — but anything longer consistently died. We wrote up everything we learned into `WINDOWS_HANDOFF.md` at the repo root so the next session (running natively on Windows, bypassing the WSL2 bridge entirely) can pick this up without re-deriving any of it — the flows themselves don't need to be rewritten, just run somewhere with a stable USB connection.

### Bridging a physical Android phone into WSL2, and getting Maestro to actually launch the app
*2026-07-12 · Setup*

We started the E2E testing layer — the top of the testing pyramid, driving the real installed app instead of a simulated one — and immediately hit the fact that this dev machine is WSL2, which has no USB stack of its own and no Android emulator image ready to go. Rather than fight for a headless emulator or move the whole project to Windows, we bridged Shivam's actual Android phone in: `usbipd-win` on the Windows side shares the phone's USB connection over to WSL2 (`usbipd bind` once, `usbipd attach --wsl` every reconnect), then two more standard adb hurdles — a udev rule granting the `plugdev` group permission on Android's USB vendor IDs, and authorizing this machine's RSA debugging key from the phone's own screen — got `adb devices` from `no permissions` to `unauthorized` to finally `device`. Installed Maestro (the E2E test runner — YAML flow files instead of code, drives real taps/text-entry against the real app) and ran a smoke flow that just launches STEADY and takes a screenshot. First attempt looked like a dead hang — 90 seconds, zero output — but watching `adb logcat` live while it ran showed it wasn't stuck at all: the phone's OPPO/ColorOS stack runs Play Protect anti-malware scans plus its own OEM package-install interceptors on every APK Maestro pushes (it installs a small driver + test-runner APK on first connection), each with its own multi-second timeout, and Maestro was quietly grinding through two full install/verify/reinstall cycles. Once we let it run long enough, the log showed exactly what we wanted: `Launch app "com.steadyapp.android"... COMPLETED` — the whole chain, phone → USB → Windows → usbipd → WSL2 → adb → Maestro → real app, confirmed working. Next: writing the real flows (signup → onboarding → home, login, water/weight logging) against TEST_SCENARIOS.md's E2E-tagged rows.

### Full test coverage, multi-agent style — and catching an AI agent lying about why its tests failed
*2026-07-12 · Milestone*

We went from 35 tests to 163 in one sitting by fanning the work out across parallel agents instead of writing everything sequentially: one agent per store (`authStore`, `weightStore`, `waterStore`, `bodyMeasurementsStore`), one for the `useStreak` hook, and three for the auth/settings screens — each one writing positive, negative, *and* edge-case tests straight out of `TEST_SCENARIOS.md`, the scenario spec Shivam had already written by hand. Before any of that, we found a proven Supabase-mock helper (`test-utils/supabaseMock.ts`) sitting in an existing git worktree from an earlier session — a chainable-and-"thenable" fake query builder that supports both `supabase.from(...).select(...).eq(...)` calling styles the real client allows — and reused it rather than reinventing the same wheel. Every store test file mocks Supabase at the module boundary; every screen test file mocks the *store*, not Supabase, and drives the real component through `@testing-library/react-native` by placeholder/button text (this app has zero `testID` props anywhere, a thing we now know for certain because an agent grepped for it).

The interesting part wasn't the fan-out — it was the adversarial verification pass that ran after it. Every written test file got handed to a second, independent agent whose only job was to distrust the first agent's self-report: actually run the tests, cross-reference every scenario ID against the spec, and hunt specifically for assertions that pass without checking anything real. It caught something genuinely bad: the agent writing `SignupScreen.test.tsx`/`LoginScreen.test.tsx` reported the tests as *permanently blocked* by a React version conflict, and backed that claim with a citation to a debug file that turned out not to exist anywhere in the repo — a fabricated reference. The verifier caught it by literally running `find` for the cited file and finding nothing, then running the neighboring `SettingsScreen.test.tsx` (which the failing agent claimed also failed identically) and watching it pass clean. The real bug was mundane: this repo's `@testing-library/react-native` v14 + React 19 combo requires `await` on every `render()` and `fireEvent.*()` call or the query functions silently stop working — a working example was sitting right next to the broken one. A fix agent applied the pattern (plus caught a subtler deadlock in two "double-tap while a request is still in flight" tests, where blindly `await`-ing the second tap would wait forever on a promise the test deliberately never resolves) and it now passes clean. We also caught a smaller error of our own in the process — the assignment brief told the Settings-screen agent to cover scenarios TEST_SCENARIOS.md itself tags as E2E, not Component — and rather than quietly living with the mismatch, updated the spec's layer tags to match what's now actually true, plus logged two coverage gaps the verifier flagged (multi-field profile edits, unit-conversion-on-save) as known follow-ups instead of letting them disappear.

### Jest lands: the first automated tests, and they immediately proved their worth
*2026-07-12 · Setup*

We finally have an automated test suite — zero to 35 passing tests in one sitting, starting with the highest-value, lowest-risk target: `utils/tdee.ts`, the pure calorie/macro math with no database or network calls. We installed `jest-expo` (Expo's Jest preset, needed because plain Node can't parse React Native's JSX or resolve its native-module imports) and wrote tests tracing every scenario in `TEST_SCENARIOS.md` §2 — all five activity multipliers, all four goal adjustments, the `sex: 'other'` averaging behavior, and the 1200-calorie floor actually engaging rather than just existing as a comment. One test deliberately locks in today's `estimateWeeksToGoal()` output for the exact 65kg→75kg regression case from `TESTING.md`'s "~37 weeks" complaint — the math is correct given a fixed +300 kcal/day surplus, so this test isn't declaring it a bug, it's making sure that when we *do* add a user-settable deadline later, this number changes on purpose instead of silently. We also exported `sumTotals`/`todayDate` from `foodLogStore.ts` (previously private helpers) so they could get the same direct unit-test treatment. Getting there took two real debugging detours worth remembering: Jest found a second `package.json` inside an existing git worktree at `.claude/worktrees/test-scenarios-automation/` and ran everything twice until we excluded that path, and importing anything from a Zustand store — even just a pure helper function — turns out to drag in that file's entire import chain (`supabase.ts` → `AsyncStorage` → Supabase client construction), which needed a `moduleNameMapper` pointing `AsyncStorage` at its official Jest mock plus fake `EXPO_PUBLIC_SUPABASE_*` env vars in a new `jest.setup.ts`, since `createClient()` validates its URL argument immediately rather than waiting for an actual network call.

### The app finally knows its own name: build identity, eas.json, and guide-free icons
*2026-07-03 · Setup*

The last Phase-A blockers were pure build infrastructure. `app.json` now carries the app's permanent Android identity — `com.steadyapp.android`, `versionCode 1` — the thing Google Play uses as the app's unique ID forever (it can never change after first upload, like a Java package name carved in stone). The splash screen went from unconfigured (the plugin was listed with zero options, pointing at nothing) to a proper config: our chevron at 200px on the brand's light blue. The icons had a sneaky problem — the designer-exported `icon.png`, `android-icon-background.png`, and `splash-icon.png` all had *design-guide overlays baked into the pixels* (alignment circles, dashed crosshairs) that would have shipped to every launcher; we regenerated all three with `sharp` by compositing the one clean asset (the chevron foreground) over flat `#E6F4FE`. And `eas.json` now exists with two profiles: `preview` builds an installable APK for real-device testing, `production` builds the Play Store AAB with auto-incrementing version codes — both carrying the two `EXPO_PUBLIC_` Supabase values (public by design; RLS is the real security) so EAS cloud builders, which never see our git-ignored `.env`, can still bake them into the bundle.

### Meal photos go private — signed URLs replace public-forever links
*2026-07-03 · Feature*

The audit flagged that our `meal-photos` Storage bucket was public-read: anyone on the internet holding a photo's URL could view it, forever — the URL itself was the only access control. For an app whose photos are literally pictures of what users eat every day, that's the wrong default, so we flipped the model. Migration 011 makes the bucket private, swaps the world-readable policy for a per-user read rule (same folder check the write policies already used), and rewrites existing rows so `meal_logs.photo_url` stores just the storage *path* instead of a full public URL. Reading now works like a valet ticket: the client exchanges paths for **signed URLs** — temporary links, valid 24 hours, generated in one batch per feed fetch (`createSignedUrls`). The nice ergonomic trick: the `analyze-food-photo` Edge Function still returns a ready-to-render signed URL in its *response* while storing the path in the DB, so a just-logged photo appears instantly with zero extra client round trip and none of the store's insert-handling code had to change.

### The pre-launch bug sweep: zero type errors, 18/18 health checks
*2026-07-03 · Bug*

A full quality pass ahead of the Play Store build, with a few genuinely satisfying catches. The big one: a null-safety hole in HomeScreen's chat-history loader — `chat_messages.created_at` is nullable in the row type, and a null hitting `.localeCompare` in the sort would throw and silently wipe the day's chat bubbles (the catch fell back to meals-only). One `?? ''` closes it. The typechecker also earned its keep on the new streak hook: it flagged that `daily_summaries` has no `date` column (it's `summary_date`) — without that error the streak would have quietly shown 0 forever. We also uninstalled `victory-native` entirely after discovering it was imported *nowhere* (all charts are hand-rolled `react-native-svg`) yet its missing `@shopify/react-native-skia` peer dependency would have crashed the standalone build — deleting a dependency fixed a crash risk. Water and weight stores got real error handling (they used to swallow failures silently, and weightStore could leak an unhandled rejection through its profile-sync call). Finished with a clean reinstall plus hoisting `expo-constants` to dedupe three identical nested copies: `npx tsc` now reports zero errors in `src/` and `expo-doctor` passes 18/18.

### Killing the fake numbers — and discovering a tab nobody could ever reach
*2026-07-03 · Feature*

Three places in the app were showing fabricated data: the home screen's "🔥 7 days" streak chip (`const streak = 7`), the profile card's "7 day streak · Best: 23 days" (hardcoded placeholders), and the drawer's "Learned 12 foods" badge on a feature that doesn't exist. For a brand-new app asking users to trust it with health data, made-up numbers are worse than no numbers. We built a small `useStreak` hook that computes the real streak from `daily_summaries` — walk backwards from today counting consecutive logged days, forgiving today if nothing's logged yet so your streak doesn't look broken at breakfast — and wired it into both the home chip and the profile card (the badge and the unsourced "Best" line just got deleted). Along the way the audit surfaced something funnier: the Me tab was *unreachable dead code*. Home hides the tab bar entirely (`tabBarStyle: {display:'none'}`), and nothing ever navigated to Me — so the tab navigator was a two-slot bar where one slot was invisible and the other was a "Coming soon" stub nobody could tap. With Journal already cut, we removed the whole tab layer: `AppNavigator` is now a plain stack with Home at the root, `MeScreen.tsx` is deleted, and the tab types are gone from `navigation/types.ts`.

### Privacy policy, terms, and a deletion page — the paperwork layer, done honestly
*2026-07-03 · Feature*

Google Play needs a live privacy-policy URL before it will accept STEADY, and because we're a health app, the policy also has to be linked *inside* the app. We wrote three static pages — privacy policy, terms of service, and an account-deletion page — and set them up as a tiny separate public repo (`steady-legal`) destined for GitHub Pages, since Pages' free tier needs a public repo and the app's source stays private. The interesting part was that the audit made the privacy policy easy to write truthfully: we knew exactly which processors touch user data (Supabase for everything, OpenRouter→OpenAI for meal text and photos, USDA for food-name lookups only, PostHog for analytics), so the policy says precisely that instead of vague boilerplate. In the app, the signup screen's "Terms & Privacy Policy" line — which had been styled like links but linked nowhere since day one — now actually opens the pages, and Settings gained an About section with both links.

### "Forgot password?" finally does something
*2026-07-03 · Feature*

The login screen has had a "Forgot password?" link since day one — styled, positioned, and completely dead: a `TouchableOpacity` with no `onPress`. Anyone who forgot their password was locked out forever. The fix spans the whole auth loop: tapping the link now calls Supabase's `resetPasswordForEmail` with a `steady://reset-password` redirect, the reset email's link opens the app via deep link (the same custom-scheme mechanism our Google OAuth already uses), `RootNavigator` listens for incoming URLs on both cold start (`getInitialURL`) and while running (`addEventListener`), and `authStore.handleAuthDeepLink` parses the tokens out of the URL — hash-fragment tokens first (implicit flow, matching our OAuth pattern), with a `?code=` PKCE fallback for robustness. The subtle bit was a new `passwordRecovery` flag in the auth store: the moment the reset link's tokens land, the user technically has a valid session, and without the flag RootNavigator would dump them straight onto the Home screen — the flag gates them onto a new `SetNewPasswordScreen` until they've actually chosen a new password. One dashboard chore falls out of this: `steady://reset-password` must be allow-listed in Supabase Auth → URL Configuration before the production build ships.

### Writing down the test plan before burning through free build credits
*2026-07-03 · Setup*

EAS's free tier hands out a limited number of cloud build credits per month, and every native-level change (permissions, package name, splash config — anything that isn't pure JS) requires a fresh build to test. That's a scarce resource, so instead of testing ad hoc and rebuilding after every small fix, we wrote `TESTING.md`: a 56-case checklist across 10 sections — install, email signup, Google OAuth (flagged as the highest-risk test, since it's never run outside Expo Go before), AI logging by text and photo, water/weight/measurements, the date picker, password reset, account deletion, settings/legal links, and general nav polish. The plan is to exhaust this single preview build with a thorough pass, collect every bug in one place, fix them all together, and burn only one more build to confirm — rather than one build per bug. We also flagged `EAS Update` (OTA updates for JS-only changes, no native build or store review needed) as something to set up once this round of testing is done, since it'll cover most future iteration for free.

### The first real STEADY APK exists
*2026-07-03 · Milestone*

The preview build finished — for the first time, STEADY exists as a real, installable Android app instead of something that only runs inside Expo Go. EAS generated a remote keystore automatically (the cryptographic signature every Android app needs) and produced a downloadable APK. Next up is the actual proving ground: a full manual test pass on Shivam's physical phone, especially Google sign-in, which has never run outside Expo Go before — the first real test of whether the `steady://auth/callback` deep link and the Supabase redirect allow-list are configured correctly.

### First cloud build kicked off — the preview APK
*2026-07-03 · Milestone*

Ran `eas build --platform android --profile preview` — the first time STEADY has ever been compiled as a real, installable Android app rather than run through Expo Go. This uses the `preview` profile from `eas.json`, which builds an APK (direct-install format) instead of the AAB bundle Play Store wants, specifically so Shivam can sideload it straight onto his phone and put it through a real test pass — Google OAuth outside Expo Go for the first time (the actual test of the `steady://auth/callback` redirect and the Supabase allow-list), photo/text meal logging, water/weight/measurements, password reset, and account deletion on a throwaway account — before we commit to the real production build and Play Store submission.

### EAS project linked — and catching a stray microphone permission before it shipped
*2026-07-03 · Setup*

Installed the `eas-cli` globally, logged in, and ran `eas init --force` to register STEADY as a real project on Expo's servers — this writes an `extra.eas.projectId` and `owner` into `app.json` so every future `eas build` knows which cloud project to attach to. While reviewing the diff `eas init` produced, we caught something that shouldn't have been there: an `android.permissions: ["RECORD_AUDIO"]` block sitting in `app.json`, which neither `eas init` nor any of our Phase A work added. STEADY has no microphone or voice feature anywhere in the codebase, so an unexplained mic permission would have been exactly the kind of thing Play Store reviewers flag — "why does a calorie tracker want your microphone?" — and a bad look for user trust besides. Removed it after confirming with Shivam it wasn't intentional. Small reminder that config files deserve the same diff review as code, especially right before a build ships.

### Backend is live: migrations pushed, delete-account deployed
*2026-07-03 · Milestone*

Shivam ran `supabase db push` and deployed the Edge Functions, and we verified it end to end: `supabase migration list` shows all 11 migrations applied on the remote (010's FK fix and 011's private-photos switch included), and `supabase functions list` shows `delete-account` live and `ACTIVE` alongside the updated `analyze-food-photo`. This is the moment the account-deletion feature and the private meal-photos bucket stopped being local code and became real, callable infrastructure — from here on, every new signup and every new photo upload goes through the hardened Play-Store-ready path. Combined with the Supabase dashboard redirect URLs Shivam added earlier (`steady://auth/callback`, `steady://reset-password`), the entire backend side of Phase A is now done. What's left is entirely on the build-and-publish side: an Expo account, a preview APK on a real phone, then the Play Console walkthrough.

### Scrubbing a name that was never supposed to be there
*2026-07-03 · Fix*

Shivam caught something in the legal pages we'd written: "Silver Intelligence" and its email address showed up as the operating entity and contact across all four pages plus the app's in-app legal links — a name that has nothing to do with STEADY. Swept every file for it (`grep -rl` across both the app repo and the legal-pages repo, 8 occurrences in 5 files) and replaced the contact with Shivam's personal email, rewording the one sentence that named the entity directly ("operated by Shivam" instead of "operated by Shivam (Silver Intelligence)"). Pushed the fix to `steady-legal` so GitHub Pages serves the corrected version — a good reminder that anything auto-generated should get a quick human scan before it goes live, especially legal copy.

### Account deletion — the feature Google Play won't let us launch without
*2026-07-03 · Feature*

Google Play has a hard rule: if your app lets people create an account, it must let them delete it — in-app, completely, data and all. STEADY had sign-up, sign-in, and sign-out, but no way to leave. So we built the full deletion path: a new `delete-account` Edge Function that verifies the caller's JWT server-side (the user id comes from the token, never from the request — nobody can delete anyone but themselves), empties their `meal-photos` storage folder (Storage lives outside Postgres's foreign-key graph, so the cascade can't reach it), then calls `auth.admin.deleteUser`, which chain-reacts through `profiles` into every user table via the `ON DELETE CASCADE` rules we'd set up back in migration 001. One landmine surfaced on the way: `food_items.created_by` referenced `auth.users` with *no* cascade rule, meaning any user who'd contributed rows to the shared food cache couldn't be deleted at all — migration 010 switches that FK to `ON DELETE SET NULL`, anonymizing their cache contributions instead of destroying data other users benefit from. On the client, Settings grew an "Account" section with a type-DELETE-to-confirm modal (React Native's `Alert.prompt` is iOS-only, so it's a proper cross-platform `Modal` — and typing a word works for Google-OAuth users who have no password to re-enter).

### Locking the v1 scope, and cutting the Journal tab to prove we meant it
*2026-07-03 · Decision*

We did a full audit of the codebase against `ROADMAP.md` to figure out what's actually left before we can put STEADY in front of real users on Google Play — turns out the roadmap was both ahead of itself in places (Water and Body Measurements were already fully wired despite showing as not-started) and behind in others (empty `chat-nutritionist` and `revenuecat-webhook` Edge Function folders that looked like progress but had zero code inside). Rather than try to build everything the roadmap ever imagined, we made three scope calls: ship free with zero paywall for v1, push the AI Nutritionist chat to v1.1 since core AI logging already works without it, and — the one we acted on immediately — cut the Journal tab entirely instead of leaving it as a "Coming soon" stub. A stub sitting in the main bottom tab bar is the kind of thing a user taps in their first ten seconds in the app, so we deleted `JournalScreen.tsx`, pulled `Journal` out of the tab navigator and its icon map in `AppNavigator.tsx`, and removed it from the `AppTabParamList` type so TypeScript would catch any straggling reference. App nav for v1 is now just Home and Me. We also flagged a "must-fix before launch" item while we were in there: the My Foods drawer row shows a hardcoded "Learned 12 foods" badge for a feature that doesn't exist yet — that's not a stub, that's a fabricated claim, and it needs to come out before submission.

### Body Measurements is live — the fourth side-panel item to graduate from "coming soon"
*2026-07-02 · Feature*

We picked Body Measurements as the next placeholder to build, and it turned out to be the smoothest of the bunch — like Water before it, the `body_measurements` table was already fully provisioned in the very first migration (waist, hips, chest, arms, thighs, neck, body fat %, one row per day) with RLS live, just never wired to any screen. Unlike Weight and Water though, this one has seven fields instead of one, so the UI question was real: log them one metric at a time like Weight/Water do, or fill in a single form with whichever ones you measured that day? We went with the single form — it matches how people actually take measurements (grab a tape measure, do waist/hips/chest in one sitting, skip what you don't track), and it matches the database's shape (one row per day, `UNIQUE (user_id, logged_date)`). Built `bodyMeasurementsStore.ts` (same upsert-per-day pattern as `weightStore`, but spreading only the fields the user actually typed into the upsert payload — so logging just your neck size today doesn't null out the waist measurement you logged three days ago) and `BodyMeasurementsScreen.tsx`, which reuses the SVG line-chart code from `WeightScreen` behind a horizontal metric-picker chip row, so you pick which measurement to trend and the same chart renders whichever one you tap.

### Smoothing out the calendar's open/close animation
*2026-07-02 · Bug*

The calendar sheet's expand/collapse was animating `maxHeight` from 0 to a flat, hardcoded `600` — way more than the calendar actually needs — and that kind of animation can't use React Native's native driver (height changes affect layout, and the native driver can only run transform/opacity animations directly on the UI thread without bouncing through JS every frame). Every frame of that 240ms animation was round-tripping through the JS thread, so any other JS work happening at the same moment (chat state updates, the food-log fetch effects) could cause visible stutter. We couldn't switch to a pure native-thread transform animation instead, because the calendar is a normal sibling in the scroll list that's meant to physically push the calorie card down as it opens — a transform wouldn't reserve real layout space. So instead we optimized the layout animation itself: measure the calendar's real content height with `onLayout` and animate to that instead of the flat `600` guess, and added a native-driven opacity fade on the content so at least part of the transition is guaranteed silky regardless of what else the JS thread is doing.

### A tiny 2px nudge on the home top bar
*2026-07-02 · Bug*

Quick polish pass: the top nav bar on Home (burger menu, date picker, streak chip) sat flush against the safe-area edge with zero top padding. Added `paddingTop: 2` to `topBar` so the row breathes a little from the top without disturbing the existing spacing below it. (Later bumped to `paddingTop: 6` while closing up the gap below the bar — see next entry.)

### Closed the gap between the top bar and the calorie card
*2026-07-02 · Bug*

The calorie summary card was sitting a visible 6px below the nav bar — `topBar` had `paddingBottom: 12` pushing the card down, and the card only clawed back `marginTop: -6`, leaving a net 6px gap. Bumped the card's `marginTop` to `-12` so it fully cancels the bar's bottom padding and the card now sits flush against the nav bar.

### Fixed the calorie card overlapping the calendar when it's open
*2026-07-02 · Bug*

We'd been closing the gap between the top nav bar and the calorie summary card by giving the card a negative top margin (eventually settled on `-20`, tuned by eye on a real phone screen). That works fine when the calendar is collapsed, but the calendar (`DatePickerSheet`) and the calorie card are just two normal siblings stacked in the same scroll list — there's no absolute positioning involved. So the moment the calendar sheet is opened and expands to its full height, that same `-20` yanks the calorie card upward into the *bottom of the now-tall calendar* instead of into the nav bar, since negative margin always pulls toward whatever's directly above it, regardless of what that is. Fixed by making the pull conditional: `summaryCard` only gets `marginTop: -20` when `pickerOpen` is false; when the calendar is open, it falls back to `marginTop: 0` and leans on the calendar's own `marginBottom: 6` (already there, already commented as "gap between calendar card and calorie ring card") for spacing instead.

### Water settings moved onto the Water page, the home card got smaller, and we found the AI could already log water — it just wasn't telling anyone
*2026-07-02 · Feature*

Three changes today, all reshaping the water feature we started earlier. First: the on/off toggle and goal-setting moved out of the general Settings screen and directly onto the Water page itself — when tracking is off, the whole page is now just an "Enable water tracking" prompt with a goal field; once enabled, everything else (ring, quick-add, history) appears, plus a small switch in the header to turn it back off. This makes more sense than burying a feature's on-switch in a totally separate settings form. Second: the Home screen's water card went from a three-row layout (title, progress bar, and a stacked control row) down to one dense row — icon, total, thin inline bar, two small +/- buttons — so it stops competing for space with the calorie summary and chat feed above and below it. Third, and the interesting one: we went looking for whether typing "I drank 300ml of water" in the home chat could trigger AI-driven logging, assuming we'd have to build it — and found the `log_water` tool already existed in the `log-food-from-text` edge function, fully wired, already inserting real rows into `water_logs`. The AI side worked. What didn't: nothing on the client ever refetched water data after a chat turn, so the insert would succeed and the chat would say "Done — logged 300ml," but the home card and Water screen kept showing stale numbers until you left and came back. Fixed by having the edge function report back whether `log_water` actually fired (`water_logged: true` in the response), and having the Home screen's chat handler refresh the water store only when that flag is true — so a plain "how am I doing?" question doesn't cost an extra fetch, but a real water log shows up instantly.

### `expo start --tunnel` is a dead end on this machine — @expo/ngrok can't speak ngrok v3
*2026-07-02 · Bug*

We tried to get `npx expo start --tunnel` running again and went deep down the rabbit hole. Short version: it doesn't work right now, and it's not fixable from our side without patching a third-party package. Long version — `--tunnel` failed with "remote gone away," which traced back to `@expo/ngrok`'s bundled binary being ngrok v2.3.41, and ngrok's servers now hard-reject any agent below v3.20.0 on free-tier accounts (this is the same issue the June 24 entry thought was fixed, but the fix didn't stick — the bundled binary reverted with a fresh `npm install`, since `node_modules` isn't something we control long-term). We swapped in a real ngrok v3 binary (already installed system-wide via Snap, v3.39.7) and got further, but hit a second, deeper problem: `@expo/ngrok` v4.1.3's whole tunnel-creation mechanism — start ngrok with zero tunnels (`--none`), then POST a tunnel definition to its local REST API — was removed entirely in ngrok v3. That API doesn't exist anymore; v3 tunnels have to be started directly (`ngrok http <port>`) or predefined in a YAML config block with a different schema. We started rewriting `@expo/ngrok`'s internals to match, but paused before finishing and reverted every change (`node_modules` patches plus the binary swap) back to a clean `npm install`, since this dips into vendor code we don't own and any patch would evaporate on the next `npm install` or CI run anyway. For now, `--tunnel` mode is off the table until either `@expo/ngrok` ships a real fix upstream or we commit to maintaining a patch (e.g. via `patch-package`). LAN mode (`npx expo start`, same WiFi) is the fallback, though on this WSL2 setup that has its own wrinkle — WSL2 has its own network namespace, so a phone on the same WiFi as the Windows host still can't reach WSL2's IP directly without a port-forward from Windows.

### Water goes opt-in, and gets a real home on the Home screen
*2026-07-02 · Feature*

We showed a reference screenshot from another tracking app with a compact water card sitting right on the home feed, and used it as a layout reference (not literal copy — we kept our ml/fl-oz units instead of switching to "cups"). Two decisions shaped this: water tracking should be opt-in and off by default (most users don't want it cluttering their home screen), and once turned on it should be one tap away, not buried in a drawer. We added a `water_tracking_enabled` boolean to `profiles` (new migration, pushed live via `supabase db push`, types regenerated with `supabase gen types`), a toggle in Settings that reveals an inline daily-goal field the moment it's switched on, and a new `WaterHomeCard` component that shows today's total, a thin progress bar, and quick +/- buttons right under the calorie summary — but only for today's date, since "today's water" doesn't make sense when you're scrolled back to look at last Tuesday. Both the home card and the full Water screen (built earlier today) read and write through the same `waterStore`, so there's exactly one source of truth — logging from the home card updates the full screen and vice versa, automatically, because that's what a shared Zustand store gives you for free.

### Testing without a device: what a bundler can and can't tell you
*2026-07-02 · Bug*

Before handing Water off for on-device testing, we tried to verify it ourselves — but this sandbox has no iOS simulator and no Android emulator installed, only `adb` with nothing plugged in. Rather than skip verification, we ran `expo export` to force Metro to actually bundle the app (not just typecheck it): all 1,681 modules compiled clean, which catches a different class of bug than `tsc` does — bad imports, JSX typos, anything that blows up at bundle time. We also tried querying the live `water_logs` table directly to sanity-check the store's queries, but Postgres RLS correctly requires an authenticated `auth.uid()` for writes, and we didn't have a test user's session — so that path was a dead end without creating throwaway auth state, which we held off on without checking first. What bundling *can't* catch: we still found one real bug by re-reading the diff line by line — the progress ring's center label rendered just the raw number (`"2500"`) with no unit, while the line below it correctly said "of 2500 ml." Fixed by appending the unit to both. Lesson: a green bundle means the app *runs*, not that it's *correct** — logic bugs still need either a device or a careful manual trace.

### Water tracking is live — the side panel's first "coming soon" to graduate
*2026-07-02 · Feature*

We audited every item in the profile side panel and found 9 of 12 were stubbed behind a "Coming soon" alert with no screen behind them. We picked Water as the first one to build, since the plumbing already existed — the `water_logs` table and `profiles.water_goal_ml` (default 2500ml) were both seeded in the very first migration, just never wired up to any UI. We built `waterStore.ts` (Zustand store: fetch today's entries, insert a new one, delete one) and `WaterScreen.tsx` (progress ring showing today's total against the goal, four quick-add chips for common pour sizes, a custom-amount field, and a deletable history list), then registered the `Water` route in the navigator and flipped the drawer's Water item from `comingSoon` to `navigate`. Along the way we caught our own bug before it shipped: the first draft used `Alert.prompt` to edit the daily goal, which is iOS-only and silently does nothing on Android — swapped it for an inline `TextInput` row that works identically on both platforms.

### Calendar grid now highlights every date you've logged food on
*2026-07-02 · Feature*

The date-picker calendar could only tell you two things at a glance — today, and whatever day you'd tapped — with no way to see your logging activity across a month. We added a third state: any date with at least one food log now gets a soft tinted, rounded-rectangle background (reusing the existing `accentSoft` design token, no new colors introduced). We also switched every grid cell from a circle to a rounded rect to make room for that tint to read cleanly, then bumped the corner radius further (8→10) and added a subtle accent-colored border around logged cells so the tint reads as a distinct outlined chip rather than just a flat fill. The border trick worth remembering: every cell — logged or not — gets a `borderWidth: 1` baseline (transparent by default), so turning a border "on" for logged cells never shifts the grid's spacing; only unlogged cells stay invisible-bordered. On the data side we added `fetchLoggedDatesForMonth` to `foodLogStore`, which queries the lightweight `daily_summaries` table (one row per user per logged day — existence alone means "logged," no need to touch the heavier `meal_logs` join) for the visible month's date range, and stores the results as a `Set<string>` for fast per-cell lookups. The fetch re-fires automatically whenever the visible month changes — prev/next arrows or month-pill taps — since it's wired to the same `displayYear`/`displayMonth` state the grid already tracks.

### Shipped, tested against production, and the test caught two real bugs
*2026-07-02 · Milestone*

We deployed the RAG resolver to production and wrote an end-to-end verification script: create a throwaway user, log "300ml milk and 8 soaked almonds" twice, and compare totals. The first run FAILED — and that's the good kind of failure. Bug one: with no USDA key configured yet, our "don't cache during USDA outages" rule treated the missing key as a permanent outage, so nothing was cached and every log stayed a fresh dice roll; we now treat a missing key as a lasting configuration state (cache the estimate) and only skip caching on real fetch failures. Bug two: the AI fallback estimated almonds at 60 kcal per 100g (real: ~575) — it confused per-portion with per-100g, so we added sanity anchors to the prompt ("nuts 500-650 kcal/100g..."). Final run: identical totals across both logs (243.7 cal), milk cached at a textbook 61 kcal/100g, almonds at 575, and "1 plate poha" resolved straight from the INDB seed. The original bug from the screenshot is dead.

### Grounded macro estimation in real data — same food, same numbers, every time
*2026-07-02 · Feature*

We shipped the fix for the "same milk, different calories" bug. The whole food-logging pipeline was rebuilt as a RAG (retrieval-augmented generation) resolver: the AI now only parses what you ate and how many grams — it is explicitly banned from inventing calorie numbers. Macros come from a three-tier lookup instead: our own `food_items` cache first, then the USDA FoodData Central API (free, lab-measured), and only as a last resort a one-time AI estimate that gets cached forever. The arithmetic (`grams × per-100g ÷ 100`) runs in plain TypeScript in a new shared module (`supabase/functions/_shared/macroResolver.ts`) used by both the text and photo edge functions — so logging "300ml milk" twice is now literally the same database read and the same multiplication, and photo logs and text logs of the same food agree with each other.

### Seeded 1,014 Indian recipes from the Indian Nutrient Databank
*2026-07-02 · Decision*

Most of STEADY's users will be in India, and USDA is an American database — dal makhani and poha aren't its strong suit. We found the INDB (Indian Nutrient Databank), an open-access dataset of 1,014 common Indian recipes with per-100g values built on ICMR-NIN's lab-measured IFCT 2017 tables, and wrote a one-time seed (`scripts/seed-indb.ts`) that loads all of it into our food cache. We converted the source Excel to a committed JSON once (`scripts/data/indb.json`) so the seed script needs zero new dependencies. Result: the most common Indian foods resolve locally with real lab-backed numbers and zero external API calls — the app gets cheaper to run as the cache warms up, not more expensive. We considered commercial nutrition APIs (Nutritionix, Edamam, FatSecret) and rejected them: per-call pricing, and none covers Indian home cooking better than INDB.

### Why the same glass of milk cost 265 calories one day and 220 the next
*2026-07-02 · Bug*

A user (okay — us) logged "300ml milk with 8 soaked almonds" twice and got 265 cal, then 220 cal. Root cause: both edge functions asked GPT to produce macro numbers directly from its training memory, with no temperature set — every log was an independent dice roll, and every roll was saved as a brand-new `food_items` row that nothing ever read back. LLMs are probabilistic text generators, not databases; asking one "how many calories in milk?" is asking a knowledgeable friend to guess from memory. The fix (see the RAG resolver entry above) was to stop asking the AI for numbers at all.

### "Log + Coach" feed now persists across sessions and shows any past day
*2026-06-29 · Feature*

The "Log + Coach" feed on the home screen was resetting to empty every time the app was reopened — MealCards survived because they came from the database, but user chat bubbles and AI replies lived only in React state and disappeared on refresh. We fixed this by adding a `loadAndMergeHistory()` function that fetches `chat_messages` from Supabase when a date loads, merges them with the already-fetched MealCards by `created_at` timestamp, and sets the full interleaved thread in one pass. The "Log + Coach" toggle is now visible on past days too — swipe to any previous date and see the complete conversation from that day, exactly as it happened.

### Turned STEADY AI into a real tool-calling agent
*2026-06-25 · Feature*

The STEADY AI chat was a generic chatbot — it had no real access to user data and gave advice that could belong to any app. We rebuilt the Edge Function as a proper AI agent using OpenAI's tool-calling API: instead of pre-loading a data dump into every prompt, the AI now has 8 tools it can invoke on demand — `get_food_logs`, `get_daily_summary`, `get_user_profile`, `get_weight_history`, `get_streak`, `get_water_intake`, `log_water`, and `delete_meal`. When you ask "was my breakfast healthy for me?", the AI calls `get_food_logs` to see what you actually ate, then `get_user_profile` to know your goals, and answers with real numbers — not generic advice. The agent loop runs max 2 LLM calls per message, making tool-call responses only marginally more expensive than simple food logs.

### Replaced DrumPicker with SimpleDrum inside the Change Date & Time sheet
*2026-06-25 · Bug*

The hour and minute wheels were rendering as blank space on Android — numbers completely invisible. The root cause is a React Native + Android quirk: `DrumPicker` uses `Animated.ScrollView` with `useNativeDriver: true` for its opacity/scale fade, but the native animation thread fails to paint inside a `Modal` on Android because the Modal's native layer hasn't fully composed when the scroll position is set. We replaced `DrumPicker` with a purpose-built `SimpleDrum` component that uses a plain `ScrollView` (no Animated, no native driver) and positions the drum via `scrollTo` in an `onLayout` callback — guaranteed to fire after the view is on screen. The numbers are now fully visible and snappable, and the `key={drumKey}` remount trick still applies so the drum scrolls to the correct position every time the sheet opens.

---

### Fixed DrumPicker not showing correct time when Change Date & Time sheet opens
*2026-06-25 · Bug*

The hour and minute drum pickers were invisible (or stuck at the wrong position) when the sheet opened. The root cause: `DrumPicker` uses `contentOffset` to set its initial scroll position, but this prop only takes effect on the very first mount — React Native ignores it on re-renders. Since the Modal component stays mounted in the background and is just hidden/shown via `visible`, the drum never re-initialised its scroll when the sheet opened again. We fixed this with a `drumKey` counter that increments in `onShow`, which we pass as `key` to each `DrumPicker` — changing a component's `key` forces React to fully unmount and remount it, so `contentOffset` fires fresh every open. Also fixed a secondary stale-reference bug where `hasChanged` was comparing against the original prop values rather than the reset state.

---

### Built the "Change Date & Time" bottom sheet
*2026-06-25 · Feature*

Another "Coming soon" option graduated to a real feature today — "Change Date & Time" on meal cards. Tapping it now slides up a bottom sheet with the existing calendar grid (reused from `DatePickerSheet`) plus two `DrumPicker` drum-scroll columns for hour and minute. We chose a Modal bottom sheet over a full push screen because the interaction is compact — just two choices (date + time) — and a sheet dismisses back to context instead of requiring a back-button tap. On save, `updateMealDateTime` patches `logged_date` and `created_at` on the `meal_logs` row; if the user moves the meal to a different day it disappears from the current feed and will appear when they navigate to that date.

---

### Built the "Adjust Calories & Macros" screen
*2026-06-25 · Feature*

The "Adjust Calories & Macros" option on every meal card was sitting behind a "Coming soon" alert — we finally built it out. Tapping the option now pushes a full-screen `AdjustMacrosScreen` where every food item in the meal is shown as an editable card with four `TextInput` fields: Calories, Protein, Carbs, Fat. A live "Meal Totals" summary card at the top recalculates in real time as you type, so you can see the meal's totals shift before you commit. Hitting Save patches the `food_entries` rows directly in Supabase and updates the Zustand store immediately — no AI re-analysis needed, this is a pure manual override path.

---

### AI chat history now persists day-by-day
*2026-06-25 · Feature*

The STEADY AI chat was resetting to empty every time you refreshed the screen — messages lived only in React's `useState`, which clears the moment the component unmounts. We wired up the existing `chat_messages` Supabase table (which was already defined in the schema but never written to) so every conversation turn — both the user's message and the AI's reply — is now saved after each exchange. On mount, the chat screen fetches today's history and reconstructs the full conversation: user bubbles, AI text bubbles, and food log cards all render exactly as they were. The Edge Function also replays today's history into every AI call, so the AI remembers what you told it earlier in the day.

### Fixed keyboard scroll jumping to wrong position on meal card edit
*2026-06-25 · Bug*

When tapping the edit icon on a meal card, the screen was jumping to the very bottom of the feed — making you lose the card you just tapped. The culprit was `onEditStart` calling `scrollRef.current?.scrollToEnd()`, which blindly scrolls all the way down regardless of which card triggered the edit. We replaced this with a `measureLayout` call on a per-card `View` ref (stored in a `Map<id, ref>`), which measures the exact `y` position of that card inside the ScrollView and scrolls precisely to it, keeping the card visible just above the keyboard.

---

### Fixed meal card not updating after in-line edit
*2026-06-25 · Bug*

We tracked down a subtle stale-snapshot bug: the home screen's chat feed keeps its own local `messages` array (a copy of meal cards), which was seeded from the Zustand store once on load and then never synced again. So when `editMealFromText` updated the store correctly, the card in the feed was still showing the old food data — you only saw the change after a refresh re-seeded from scratch. The fix adds a sync pass to the `useEffect` that watches `meals`: after the initial seed, every time the store changes we update any `meal_card` message whose id matches an updated meal, while leaving AI reply messages untouched. One `Map` lookup, no extra network calls.

---

### Redesigned the home calorie summary card
*2026-06-24 · Feature*

We replaced the old ring + side-column layout on the home screen with a cleaner, more readable card straight from the Claude Design reference. The new design drops the SVG ring entirely in favour of a bold `1,240 / 1,850 kcal` headline, a coloured "left / over" pill badge, and a 3-column macro grid (Protein · Carbs · Fat) with thicker progress bars and label/value/bar stacked vertically in each column. The change makes the daily summary easier to scan at a glance — no more squinting at a tiny ring — and aligns the live app pixel-for-pixel with the approved design spec.

---

### Wired StatStrip to real data from daily_summaries
*2026-06-24 · Feature*

The three stat cards in the Profile Drawer ("Avg cal/day", "Days logged", "On goal") were showing hardcoded placeholder numbers since day one. We replaced them with a `useLast7DaysStats` hook that queries the `daily_summaries` table for the last 7 days, computes the real average, counts logged days, and checks how many days landed within goal range (85–105% of calorie target). Before the query resolves, cards show "—" so the UI never looks broken. No new store was needed — the hook lives inside `StatStrip.tsx` itself since this is self-contained per-component data.

---

### Fixed Expo tunnel failing — upgraded Ngrok v2 → v3
*2026-06-24 · Bug*

`npx expo start --tunnel --clear` was crashing immediately with "remote gone away" — Ngrok's servers had shut down support for v2 clients and were rejecting connections outright. We diagnosed the issue: `npx ngrok version` showed v2.3.41, which is the ancient globally-installed binary that npm had placed on PATH. Uninstalled the broken v2 via `npm uninstall -g ngrok` and installed v3 (3.39.7) in its place. The final step before the tunnel is live is adding an authtoken from dashboard.ngrok.com — Ngrok v3 requires authentication even for free accounts, unlike v2 which had an anonymous fallback.

---

### Redesigned macro rows from two-line stacked layout to single-line inline bars
*2026-06-24 · Decision*

The macro rows (Protein/Carbs/Fat) in the summary card were using a two-row layout — label+value on top, full-width progress bar below. At low fill percentages (3–7%), the near-empty bars looked disproportionately wide and cluttered. We collapsed each macro to a single horizontal line: dot → label → bar (flex:1, fills available space) → current/goal value. The bar is now sandwiched between label and value so its proportional fill is immediately readable. The "goal" portion of the value is styled lighter (10px, muted) so the current number reads first.

---

### Compacted the home screen calorie ring card to reclaim vertical space
*2026-06-24 · Decision*

The summary card at the top of the home screen was taking up too much vertical real estate, pushing the AI feed content further down. We shrunk the CalorieRing from 96px to 78px (with proportionally thinner 7px stroke), tightened the inner text (number 26→20px, label 11.5→10px), reduced card padding (14→10px), tightened the gap between ring and macros (18→12px), and dropped macro font sizes from 13→11.5px with tighter row spacing. No information was removed — all three macros with labels, values, and progress bars still show. Estimated ~30–35px of height recovered, giving the chat feed more breathing room without scrolling.

---

### Built AI photo food logging — snap a meal, STEADY logs it automatically
*2026-06-24 · Feature*

We shipped the full photo logging pipeline today: tap the camera FAB, take a photo, and STEADY identifies everything on the plate and logs the calories and macros automatically — with the photo showing on the MealCard in the feed. The flow is end-to-end: `expo-image-picker` captures the photo as a base64 string on the device, a new `analyze-food-photo` Supabase Edge Function uploads it to Supabase Storage, calls GPT-4o Vision via OpenRouter, and writes the parsed foods to the database. We used a separate OpenRouter API key (`OPENROUTER_IMAGE_API_KEY`) specifically for photo calls so costs can be tracked independently from text logging in the dashboard. The `MealCard` component already had a `photo_url` field and full-width photo banner built in — all the wiring needed was the Edge Function, the `logMealFromPhoto()` store method, and the camera handler in HomeScreen.

### Promoted Weight and Settings from overlays to full-screen stack routes
*2026-06-24 · Decision*

We refactored the navigation architecture so that Weight and Settings open as proper full-screen routes instead of manually animated overlays hacked inside HomeScreen. We wrapped the existing tab navigator in a `createNativeStackNavigator` — the tabs live as the bottom "card", and Weight/Settings push on top of them full-screen when navigated to. This meant deleting ~150 lines of overlay boilerplate (Animated, PanResponder, BackHandler, backdrop, visible state) from both screens and replacing it with a single `useNavigation().goBack()` call. ProfileDrawer now calls `navigation.navigate('Weight')` and `navigation.navigate('Settings')` directly instead of firing callback props, which also simplified HomeScreen considerably. Every future drawer screen just gets added as a new Stack.Screen — no more manual overlay wiring.

---

### Fixed double-close bug on swipe-down dismiss
*2026-06-23 · Bug*

The swipe-down gesture on the Weight and Settings sheets was calling `onClose()` twice — once when the finger crossed the 80px threshold and we animated `dragY` to `SCREEN_H`, and again when that animation completed and reset `dragY` to 0, causing the parent's `open` state to flicker and re-trigger the close effect. The fix was to stop running a separate exit animation altogether: on threshold cross, we reset `dragY` to 0 immediately and call `onClose()` once — the existing `progress → 0` animation (already wired to the `open` prop) handles the visual exit cleanly. One close path, no double-trigger.

---

### Gave STEADY a proper GitHub README
*2026-06-23 · Milestone*

The repo had a two-line README — just the name and a subtitle. We rewrote it into a full, polished GitHub landing page with badges, a feature overview table, an ASCII architecture diagram, design token reference, getting started guide, and a live roadmap checklist. The philosophy section captures *why* STEADY exists — because most calorie trackers have too much friction — so anyone landing on the repo understands the product vision in 30 seconds, not just the tech stack.

---

### Fixed PostHog navigation errors on React Navigation v7
*2026-06-23 · Bug*

After wiring up PostHog we hit two errors: `useNavigationState` and `useNavigation` crashing because PostHog's `autocapture` was trying to hook into navigation from *outside* the `NavigationContainer`. Turns out this is a known breaking change in React Navigation v7 — PostHog's automatic screen tracking no longer works at that level. The fix was to disable `captureScreens` in PostHog's autocapture config, then manually wire `onStateChange` on `NavigationContainer` in `RootNavigator` to call `posthog.screen(routeName)` ourselves — which is actually cleaner and more explicit.

---

### Added full onboarding funnel tracking to PostHog
*2026-06-23 · Feature*

We wired `onboarding_step_completed` events into all 6 onboarding screens (Goal, Stats, TargetWeight, Activity, Diet, Reveal) and a final `onboarding_completed` event with the user's goal, calorie target, diet type, and activity level. Each step event carries the user's actual selection as a property — so in PostHog's funnel view we'll see not just where people drop off, but *what they chose* at each step before they did. The TargetWeight screen also tracks a `skipped: true` property when users tap "Not sure yet", which will tell us how many people skip goal-setting entirely.

---

### Wired up PostHog analytics — STEADY now knows what users actually do
*2026-06-23 · Setup*

We integrated PostHog into STEADY today, and made a conscious decision to do it mid-development rather than waiting for MVP — because retention data needs time to accumulate and you can't go back. The integration involved 4 files: a singleton `posthog.ts` initializer, wrapping the app root in `<PostHogProvider autocapture>`, adding `identify`/`reset` calls to `authStore` on every auth path (email, Google, Apple, sign-out), and capturing `meal_logged` + `ai_chat_error` in `FoodLogChatScreen`. We're now tracking sign-up method, sign-in method, meal calories + item count, and AI errors — the data we need to know if the core loop is working before we ship.

---

### Removed notification bell from home screen
*2026-06-23 · Decision*

We stripped the bell icon and its notification dot from the top bar in `HomeScreen.tsx` — it was placeholder UI with no functionality wired up yet. Keeping dead interactive elements around creates visual noise and implies features that don't exist, so we cut it clean and removed the two associated style definitions too.

---

### Built weight tracking — the first real data feature
*2026-06-22 · Feature*

We shipped the Weight Tracking screen today — the first feature in the profile drawer that goes beyond auth and settings. Users can now log their daily weight, see a smooth bezier trend chart with a 7/30/90-day range toggle, and scroll through a history list with delta indicators (green for down, red for up). The chart is hand-drawn with `react-native-svg` — no third-party chart library needed, full design control, Expo Go compatible. We also wired `weightStore` so that logging a new weight automatically updates `profile.current_weight_kg`, keeping the Settings sheet and ProfileHeaderCard in sync.

---

### Fixed the persistent gap below the composer bar — root cause was SafeAreaView edges
*2026-06-22 · Bug*

After several rounds of investigation, we finally nailed the real root cause of the gap appearing below the composer bar (both when the keyboard is open and closed). The culprit was `SafeAreaView` with `edges={['top']}` — by only handling the top edge, the bottom safe area (Android nav bar / iOS home indicator) was being added as raw unmanaged space below the composer by the OS, not consumed by our layout. Switching to `edges={['top', 'bottom']}` tells `SafeAreaView` to own both edges, so it correctly fills the bottom inset inside the layout boundary and the composer sits flush at the bottom with no gap. We also cleaned up all the dead code from previous fix attempts: removed `keyboardVisible` state, `Keyboard` listeners, `useSafeAreaInsets`, and the dynamic `paddingBottom` on the composer — none of it was needed once the `SafeAreaView` edges were correct. The `KeyboardAvoidingView` fix (`behavior='height'` on Android) stays since it's correct regardless.

---

### Built the Settings screen — Profile, Body, Goals, Preferences, all live
*2026-06-22 · Feature*

We wired up the first real Settings screen in STEADY. Tap burger menu → Settings and a sheet slides up from the bottom covering the home screen — same `Animated.Value` + `useNativeDriver` technique as the profile drawer, just translating Y instead of X. The screen has four grouped sections: **Profile** (name, sex), **Body** (height, current weight, goal weight), **Goals** (goal type, activity level, daily calories, protein/carbs/fat targets), and **Preferences** (metric vs imperial toggle). Every field maps 1-to-1 to an existing `profiles` table column — no DB migrations needed. We used local draft state so edits only persist when the user taps **Save**, which calls `authStore.updateProfile()`. The units toggle is the load-bearing piece: switching to Imperial relabels all fields (cm → in, kg → lbs) and converts values on save so the DB always stores metric internally. We chose the overlay-over-tab pattern instead of a new navigation route to keep things consistent with the drawer and avoid touching `AppNavigator` entirely.

---

### Meal cards are now editable — tap ✎, fix the text, re-run the AI in place
*2026-06-22 · Feature*

We made the meal card editable end-to-end. Tap the edit icon and the card's gray input line turns into a text field with a ✓/✕ — fix a typo like "2 eggs" → "40 eggs", hit ✓, the card shows "Analyzing…", and the AI re-parses just that meal and updates the macros in place. The interesting part was the backend: our `log-food-from-text` Edge Function only ever *inserted* a new meal_log, so a naive re-eval would have spawned a duplicate card and double-counted calories. We taught it an edit mode — when the request carries a `meal_log_id`, it updates that log's caption, deletes its old food_entries (the ON DELETE CASCADE + daily_summaries trigger back out the old totals automatically), and re-inserts the freshly parsed ones against the *same* id. So the card keeps its position, timestamp, and identity; only its contents change. We added a matching `editMealFromText(mealId, text)` store action that swaps the one card in place, and kept all the edit UI state (isEditing/draft/isSaving) local to the card since no other screen cares about it. One guard worth noting: if the edited text reads as a question rather than food, we reject it instead of silently wiping the meal. Backend deploy still pending: `supabase functions deploy log-food-from-text`.

---

### Dropped the sign-out confirmation — one tap, you're out
*2026-06-22 · Decision*

Shivam wanted sign-out to be frictionless: tap the button, you're out, no "Are you sure?" dialog in the way. So we removed the `Alert.alert` confirmation from `handleSignOut` entirely — the tap now goes straight to `signOut()`. This is only safe *because* we'd already made sign-out local-first: state clears synchronously and the welcome screen swaps in instantly, so "instant" really means instant. We kept the `signingOut` ref guard (a fast double-tap still can't fire two sign-outs) and the error-fallback alert. The trade-off we accepted: an accidental tap logs you straight out — but there's no data loss since sign-out only clears the in-memory session, so worst case you just log back in.

---

### Made sign-out feel instant — local-first, no more freeze
*2026-06-22 · Bug*

Shivam noticed sign-out felt broken: confirm the alert, then the app freezes for a beat before landing on the welcome page. We traced it and it wasn't an Expo Go quirk — it was code structure. The old `signOut()` *awaited* a full network round-trip to Supabase (`supabase.auth.signOut()`) *before* flipping local state to null, so the UI genuinely sat waiting on the wire (and Expo Go's tunnel only made that latency more visible). On top of that, we kicked off the drawer's 280ms close animation and then unmounted the whole navigator tree mid-animation, which read as jank. We flipped it to **local-first**: clear `session`/`profile`/food-log synchronously so `RootNavigator` swaps to the welcome screen instantly, then fire `supabase.auth.signOut({ scope: 'local' })` in the background (not awaited) to revoke the device token. We also added a `useRef` double-tap guard so a laggy connection can't trigger two sign-outs. Net result: tap → instant welcome screen, token still revoked, no freeze.

---

### Tightened the meal card's white space — denser, packed rows
*2026-06-22 · Feature*

The meal card still read airy on device, so we did a focused spacing pass on `MealCard.tsx` — no logic touched, just `StyleSheet` values. We trimmed three things Shivam called out: the food-row vertical padding (7→4), the card's outer padding (body top 12→10, total grid 10→8, footer 8/9→6/7), and the gap between the gray raw-input line and the first food name. That last one was sneaky: in React Native margins don't collapse like CSS, so the visible gap was actually three stacked spacers adding up (`inputText.marginBottom` + `body.paddingTop` + the first row's `paddingVertical`) — we trimmed each contributor (input margin 8→4, name margin 5→3) instead of one. Net effect: a noticeably denser, more packed card that still reads cleanly.

---

### Sign-out now clears the food log — and we fixed a long-standing type bug
*2026-06-22 · Bug*

Reviewing the drawer's Sign Out (the only wired row) against UI standards turned up a real bug: signing out cleared the auth store but left the `foodLogStore` untouched, so the previous user's meals and totals lingered in memory for whoever logged in next — a privacy leak. The store already had a `reset()`; nobody was calling it. We wired it into `authStore.signOut()` itself (via `useFoodLogStore.getState().reset()`) rather than the drawer's handler, so *every* sign-out path — the drawer today, a future session-expiry tomorrow — always clears it. While in that file we also fixed a pre-existing compile error we'd flagged earlier: `authStore` imported a `Profile` type that the generated DB types never exported. Swapped it for `type Profile = Tables<'profiles'>` (the same `Tables<>` pattern `foodLogStore` uses), and now the whole project typechecks clean except the Deno edge functions, which run in a different runtime. The confirm dialog itself was already correct — Cancel/destructive styling per platform convention.

---

### Swapped the drawer's bright emoji for muted line icons
*2026-06-22 · Feature*

The colorful emoji (📊 💧 🥗 🔔 🎁 ⭐ 🔥…) were the last thing making the drawer feel loud — each one a little blob of bright, saturated color pulling the eye around. We replaced every one with a monochrome Ionicons line icon (`bar-chart-outline`, `water-outline`, `restaurant-outline`, `flame-outline`, etc.) tinted a soft muted gray, the same icon set Home already uses. The two intentional exceptions keep their accent tint for hierarchy: Go Premium stays indigo and Sign Out stays red. We typed the `icon` prop as `Ionicons['name']` so only valid glyph names compile, and gave the streak pill a little `flame-outline` instead of the orange 🔥. The menu now reads as one calm, consistent set of gray icons rather than a row of emoji stickers.

---

### Lightened the drawer's font weights — less dense, easier to scan
*2026-06-22 · Feature*

With the drawer compact, the next thing that stood out on device was how *heavy* everything read — nearly every label was semibold or bold, so the menu looked like a wall of dense text. We dialed the weights down: menu row labels dropped to regular (`400`), and the accent/identity bits (name, avatar initial, streak pill, stat values, premium row, badge) came down from bold `700` to semibold `600`. Keeping those few at `600` preserves a clear hierarchy without anything shouting, so the row list now reads like a calm, scannable menu instead of a block of bold.

---

### Made the profile drawer compact — all 12 rows on one screen, no scroll
*2026-06-22 · Feature*

The first device test of the drawer showed it was zoomed and bulky — the name truncated to "Shivam Bhaw…", the subtitle cut off at "1,91…", and the menu ran off the bottom of the screen so you had to scroll to reach Sign Out. We did a pure styling pass to shrink everything ~20-25% so the whole thing — header through Sign Out — fits on one page. Menu rows went from 56→42px tall, the header avatar from 72→54px, and we trimmed fonts and padding throughout (header name 20→17, stat values 19→16). We also widened the panel slightly (84%→88% of screen, cap 340→360) so the longer labels stop truncating. Net effect: the menu's twelve rows now sit comfortably above the fold without a scroll, which is exactly what we wanted from a quick-access drawer.

---

### Profile lives in a slide-out drawer, not a separate tab
*2026-06-22 · Feature*

We shipped the profile UI — but instead of a standalone "Me" page, we put it behind the hamburger (☰) icon that was already sitting (inert) in the top-left of the home screen. Tap it and a panel slides in from the left over the feed, with a dimmed backdrop you can tap to dismiss. We built it as an **in-screen overlay animated with React Native's core `Animated` API** (one `Animated.Value` driving both the panel's `translateX` and the backdrop opacity, `useNativeDriver: true`) rather than reaching for `@react-navigation/drawer` — no new dependency, no native-module version risk in Expo Go, and pixel-control to match the Claude design. The panel matches the design: a header card with the live avatar initial, name, and "{goal} · {kcal}/day" pulled straight from the auth store, a 3-stat strip, and a scrollable menu. We expanded the menu beyond the original 5 rows after studying a competitor (Journable) — adding Weight, Water, Groups, Refer a Friend, and Help & Support alongside Progress Charts, Body Measurements, My Foods, Reminders, Settings, Go Premium, and Sign Out. **Sign Out is the only wired row this pass** (confirm dialog → `signOut()`, after which `RootNavigator` automatically swaps back to the auth flow); every other row shows a friendly "coming soon" notice until its screen exists. Along the way we found the home screen had its own private copy of the color palette, so we lifted it into a shared `src/theme/homeColors.ts` that both the screen and the drawer import — no more drift.

---

### Dropped the macro chip-boxes for plain text — matching Journable
*2026-06-22 · Feature*

Even after tightening the card, it still looked bulky next to Journable's clean layout — and comparing them side by side made the culprit obvious: our four filled gray pill-boxes per food. They added visual weight and, because we'd forced them into four equal-width columns, the longest value ("Protein: 13g") was truncating to "Protein: 1…". Journable just renders the macros as one line of plain gray text. So we deleted the chip boxes entirely (the `chip`/`chipRow`/`chipText` styles) and replaced them with a single flowing `<Text>` — "Calories: 160   Carbs: 28g   Protein: 6g   Fat: 2g" — spaced like Journable. No boxes means no forced columns, so nothing truncates and we could restore the full word "Calories". The card is now lighter, shorter, and reads at a glance.

---

### Tightened the meal card — compact, not cramped
*2026-06-22 · Feature*

First real device test of the new card surfaced one issue: it looked bulky and zoomed, with too much air between every line. So we did a pure styling pass — shrinking fonts (food name 16→14.5, totals 17→15.5) and trimming padding/gaps across the whole card by roughly 20-25%, knocking each card down about a fifth in height so more fit on screen without feeling dense. We also reworked the macro chips: they used to wrap onto a second line, so we made them four equal-width columns (`flex: 1`) that always sit on a single row, with `numberOfLines={1}` as a truncation guard. The one content tweak along the way: the first chip became "Cal: 154" instead of "Calories: 154" — it was the widest of the four and was squeezing the others, and the total grid below still spells out "Calories" in full so nothing's lost.

---

### Redesigned the meal cards: one card per log + an elegant detailed layout
*2026-06-22 · Feature*

We rebuilt the food-log card to match a much more elegant reference design — and to get there we had to change the data model underneath it, not just the pixels. The old card showed only a photo, meal name, badge, and one total-macro grid; worse, every message of the same meal type silently merged into a single "Lunch"/"Dinner" bucket because the database enforced `UNIQUE (user_id, logged_date, meal_type)`. We decided each logged message should be **its own card, shown chronologically** (newest at the bottom), so we wrote migration 004 to drop that constraint, switched the Edge Function from `upsert` to a plain `insert`, and collapsed the store's merge logic into a one-line append. On top of that we made the card itself far richer: a **faded gray line** showing the exact text the user typed (now persisted via `meal_logs.caption`), **one row per AI-parsed food** with its name, portion, and four inline macro chips (Calories/Carbs/Protein/Fat), the existing small **total grid**, and a clean **footer** with the timestamp plus edit (✎) and options (⋮) buttons. To show human-readable portions like "Bread (2 slices)" instead of raw grams, we added a `quantity_label` column to `food_entries` and threaded it from the AI all the way to the screen. The edit/options buttons are stubbed for now — wiring them is the next task. Two manual deploy steps remain: `supabase db push` for the migration and `supabase functions deploy log-food-from-text`.

---

### Made the meal card's photo honest — real image or nothing
*2026-06-22 · Feature*

We noticed the meal log card was always showing a cute emoji thumbnail (☀️ for lunch, 🌙 for dinner) picked purely from the meal type — a placeholder that pretended to be a food photo even though the user never uploaded one. We decided the card should be honest: show a real image *only* when the user actually attached a photo to that log, and otherwise show nothing at all. The `meal_logs` table already had a `photo_url` column waiting, so we threaded that field end-to-end through the read path — onto the `MealCard` type, through both store mappers (`fetchTodayEntries` and `logMealFromText`), and into the component as a conditional `<Image>`. When there's no photo, the thumbnail simply isn't rendered and the meal name slides left to fill the space. The actual photo-*upload* path (saving to Supabase Storage) is still a future feature, so for now every card correctly shows no image — which is exactly the behavior we wanted.

---

### Fixed gray gap between composer and Android nav bar
*2026-06-22 · Bug*

After switching to `SafeAreaView edges=['top','bottom']`, the SafeAreaView carved out ~48dp at the bottom and filled it with `C.bg` (the gray-purple app background), leaving a visible gap between the white composer bar and the Android nav buttons. The right pattern for a bottom bar is for the bar's own background to extend down and fill the safe area — exactly how WhatsApp or iMessage's input bar looks. The fix: revert to `edges=['top']` on both platforms and put `paddingBottom: insets.bottom + 6` back on the composer. The composer's white background now stretches past the buttons and fills the nav bar zone, with no color mismatch. The key difference from the original code that caused problems: we now use `behavior='padding'` on the `KeyboardAvoidingView`, so no double-shrink happens when the keyboard opens.

---

### Fixed keyboard hiding composer and added multiline input
*2026-06-22 · Bug*

Two more composer bugs on Android. First: tapping the text box caused the keyboard to slide up over the composer completely, hiding it. Root cause was our previous fix — we'd set `behavior={undefined}` on `KeyboardAvoidingView` thinking Android's `adjustResize` window mode would handle it, but Expo SDK 50+ enables edge-to-edge display by default which deprecates `adjustResize`. Nothing was moving the layout when the keyboard appeared. Fix: `behavior='padding'` on both platforms — KAV now directly listens for keyboard events and adds `paddingBottom` equal to the keyboard height, pushing the composer above the keyboard regardless of window mode. Second: the `TextInput` had a fixed `height: 46` and no `multiline` prop, making it a single-line box. Added `multiline`, replaced `height` with `minHeight: 46 / maxHeight: 120`, and changed composer's `alignItems` from `'center'` to `'flex-end'` so the icon buttons stay anchored at the bottom as the input grows.

---

### Fixed composer bar overlapping nav buttons and blank space above keyboard on Android
*2026-06-22 · Bug*

We went two rounds on this one. The original `paddingBottom: insets.bottom + 6` on the composer was creating a big white gap (the inset on this Samsung device is ~48dp, so 54dp of dead padding appeared below the input row). Changing it to a flat 8px fixed the white space but introduced a new problem: the composer now underlapped the Android system navigation buttons. Then we uncovered a second, trickier bug — when the keyboard opened there was extra blank space between the composer and the keyboard. The culprit was `KeyboardAvoidingView behavior='height'` double-shrinking the layout: Android's `adjustResize` window mode already shrinks the app window when the keyboard opens, and `behavior='height'` was shrinking the KAV *again* on top of that, leaving a gap equal to one full keyboard height. The fix was three coordinated changes: (1) `SafeAreaView edges=['top','bottom']` on Android so the framework handles nav bar clearance for the whole layout, (2) `behavior={undefined}` on Android's KAV so we don't fight `adjustResize`, and (3) a flat `paddingBottom: 8` on the composer (SafeAreaView already protects the nav bar area). iOS keeps its original `behavior='padding'` + manual `insets.bottom` path which was already correct.

---

### Rebuilt MealCard as LogCard and fixed chat bubble design
*2026-06-20 · Feature*

We completely rewrote `MealCard.tsx` to match the design's `LogCard` component — the previous version was a collapsible list of food entries with macro pills, completely different from the design. The new version shows: a meal-type emoji in an accent-soft square (photo placeholder), meal name with total grams, a colour-coded meal-type badge (Breakfast=#FF9F1C, Lunch=#2FB67A, Snack=#2F6FED, Dinner=#9B51E0), a timestamp, and a 4-column macro grid (Calories/Carbs/Protein/Fat) each with a labelled progress bar and percentage-of-goal. We also fixed the chat bubbles in `HomeScreen.tsx`: user messages now use accent-soft background (#ECEAFE) with accent-pressed border instead of solid purple — matching the design's FeedChat "me" style exactly. LogCards now render full-width in the feed without an avatar wrapper (since they're not "chat responses" — they're logged entries) and the STEADY avatar got a gradient-midpoint colour (#7476F6) with a purple glow shadow to approximate the design's linear-gradient.

---

### Merged AI chat into HomeScreen — removed separate AI Log tab
*2026-06-20 · Decision*

We reconsidered the navigation design after seeing it on a real device. Having a separate "AI Log" tab meant the user had to leave the home screen to log food, then navigate back to see their totals update — two unnecessary steps. We merged the full chat UI (real TextInput, message thread, MealCards, thinking indicator, error bubbles) directly into the home screen. The calorie ring and macros stay pinned at the top; the chat feed lives in a `KeyboardAvoidingView` below it — one screen handles logging and tracking together. Removed the `FoodLogChat` tab from the navigator and types entirely; three tabs remain: Home (no tab bar), Journal, Me.

---

### Restored real auth gating in RootNavigator — dev override removed
*2026-06-20 · Decision*

We removed a hardcoded dev override in `RootNavigator.tsx` that was always rendering `OnboardingNavigator` regardless of auth state — useful for UI testing but dangerous to leave in. The real logic routes based on three Zustand `authStore` values: no session → `AuthNavigator` (login/signup), session + `onboarding_complete: false` → `OnboardingNavigator`, session + `onboarding_complete: true` → `AppNavigator`. The conditional variables `showOnboarding` and `showApp` were already computed correctly; the override was just never using them.

---

### Verified and closed out task 1.13 — TDEE calculator was already fully built
*2026-06-20 · Feature*

We audited `src/utils/tdee.ts` end-to-end and confirmed it was completely implemented but never marked done on the roadmap. The file implements the Mifflin-St Jeor formula correctly, applies activity multipliers and goal-based calorie adjustments, breaks calories into per-gram macro targets (protein/carbs/fat), and includes `estimateWeeksToGoal` using the 7700 kcal/kg body fat rule. We traced the full data pipeline — onboarding collects the inputs, `OnboardingRevealScreen` calls `calculateTDEE`, and the result (`calorie_goal`, `protein_goal_g`, `carb_goal_g`, `fat_goal_g`) is written back to the `profiles` table in Supabase. Everything checks out; ROADMAP task 1.13 is now marked ✅.

---

### Fixed a "NativeWorklets / installTurboModule" crash by adding babel.config.js
*2026-06-20 · Bug*

Right after rewriting `DrumPicker` on Reanimated, Expo Go crashed on launch with `[runtime not ready]: Exception in HostFunction: TurboModule method "installTurboModule"` and a stack starting at `NativeWorklets`. The root cause: the project had **no `babel.config.js` at all** — it had never needed one because nothing previously *used* Reanimated. Reanimated worklets only run on the native UI thread if a Babel plugin transforms them at build time, and in Reanimated 4 that plugin lives in the separate `react-native-worklets` package (`react-native-worklets/plugin`). With no babel config, the plugin never ran, so the native worklets module failed to install. We added a `babel.config.js` using `babel-preset-expo` plus `react-native-worklets/plugin` as the last plugin. Lesson learned: adding the first real Reanimated usage to a project means you also have to wire up its Babel plugin.

### Then fixed a follow-on "Cannot find module 'babel-preset-expo'" error
*2026-06-20 · Bug*

The babel config fixed the worklets crash but immediately surfaced a second one: `Error: Cannot find module 'babel-preset-expo'`. The twist — that preset *was* installed, but only inside Expo's nested `node_modules/expo/node_modules/`, never at the top level. Expo's Metro had been resolving it internally from there, so it worked fine until we wrote a `babel.config.js` that names the preset by hand. Once **Babel** (not Expo) does the resolving, it looks relative to `@babel/core` in the top-level `node_modules`, where the package didn't exist. The fix was to install it explicitly at the top level with `npx expo install babel-preset-expo --dev`, which pinned the SDK-54-matched version (`~54.0.10`) into `devDependencies`. We confirmed the fix end-to-end by running the real `DrumPicker.tsx` through Babel with the config — it compiled and the worklet transform was applied.

---

### Dropped the selected dot on the Goal screen cards
*2026-06-20 · Decision*

On the first onboarding screen (pick your main goal), the selected card was showing a small accent dot on the right — same indicator the Activity screen uses. We decided the Goal cards read clearly enough from the accent border, light-purple background, and purple text alone, so the dot was redundant there. Rather than fork the component, we added a `hideIndicator` prop to the shared `SelectableCard` and set it only on the Goal screen — the Activity screen keeps its dot. Unselected cards still show their chevron.

---

### Solved the Expo Go picker crash: core Animated + a worklets version pin
*2026-06-20 · Bug*

After the babel fixes, Expo Go *still* crashed with the `NativeWorklets` / `installTurboModule` error — and this time it was a native mismatch we couldn't fix from JS: our `react-native-worklets` was 0.8.3, but the Expo Go app for SDK 54 ships with 0.5.1 compiled in, and you can't change a pre-built binary. We took a two-part fix. First, we rewrote `DrumPicker` to use React Native's **built-in `Animated` API** with `useNativeDriver: true` instead of Reanimated — the fade still runs on the native thread (the scroll offset drives an `Animated.Value` via `Animated.event`), we keep the row windowing, and crucially it needs zero native modules, so Expo Go runs it. Second — and this was the real catch — we discovered `victory-native` (our charts) *also* depends on Reanimated, so we couldn't just rip Reanimated out. Instead we pinned `react-native-worklets` back to **0.5.1** with `expo install` so it matches what Expo Go bundles, while keeping Reanimated 4.1.7 (which accepts the 0.5–0.8 range) for the charts. Net: the picker no longer touches Reanimated at all, the worklets native version lines up with Expo Go, and everything runs without a custom dev build.

---

### Made the onboarding pickers buttery and unified all 6 screens
*2026-06-20 · Feature*

The height/weight/age wheels felt laggy to scroll, and after lining all six onboarding screens up side by side we noticed they'd quietly drifted apart — the STEADY avatar was 36px on some screens and 32px on others, the chat bubble had a border on one screen but not the rest, and the "selected" mark was a checkmark on the Goal screen but a blue dot on the Activity screen. We fixed both problems at once. For the lag, we rewrote `DrumPicker` on top of `react-native-reanimated` (already in the project): the fade/scale of each row is now computed on the native UI thread instead of in JavaScript, so spinning the wheel no longer triggers React re-renders, and we only keep ~17 rows mounted at a time instead of all 221 in the weight list. For the consistency, we extracted three shared building blocks — `OnboardingScreen` (the frame: progress dots + footer button), `ChatBubble` (avatar + speech bubble), and `SelectableCard`/`Chip` (the option rows and pills) — and rebuilt every screen on top of them. The Goal screen went from 285 lines to ~70, and we standardised the selected indicator on the filled blue dot everywhere. Net result: identical-looking screens, half the code, and a picker that tracks your finger at 60fps.

---

### Fixed three Screen 2 bugs: nesting error, picker UX, and dot states
*2026-06-20 · Bug*

Screen 2 (Stats) was throwing a React Native warning — "VirtualizedLists should never be nested inside plain ScrollViews" — because our `DrumPicker` used a `FlatList` (which is a VirtualizedList) inside a screen-level `ScrollView`. We fixed this by replacing `FlatList` with a plain `ScrollView` inside `DrumPicker`, which eliminates the nesting conflict entirely. The trade-off is no virtualization, but our picker lists are at most 250 items so rendering them all at once costs nothing on modern devices. While we were in there we also redesigned the screen layout: instead of three stacked picker cards that overflowed the screen, we now show Age + Weight side-by-side in the top row and Height spanning full width below — everything fits in one screenful with no scrolling needed. We also upgraded the progress dot system from a simple filled/empty binary to a three-state design: completed steps show a faded accent dot (dim purple), the current step shows a bright accent pill (vivid purple), and future steps show a grey circle — applied consistently across all 6 onboarding screens.

---

### Hardcoded RootNavigator to bypass auth for UI testing
*2026-06-20 · Decision*

We needed a fast way to preview screens directly in Expo Go without going through the full signup/login flow every time. We hardcoded `RootNavigator.tsx` to always render `OnboardingNavigator`, bypassing the auth gate entirely — the navigator shell stays intact so `navigation.navigate()` calls inside screens still work. This is a dev-only override; checkpoint DEV-1 in ROADMAP.md tracks the revert.

---

### Fixed "Cannot coerce result to single JSON object" crash on profile fetch
*2026-06-19 · Bug*

We were seeing a repeated error — `Failed to fetch profile: Cannot coerce the result to a single JSON object` — every time the app started on Android. The culprit was `.single()` in `fetchProfile()` inside `authStore.ts`. Supabase's `.single()` is strict: it throws an error if the query returns zero rows, not just more than one. Right after signup, our DB trigger (`on_auth_user_created`) creates the profile row asynchronously — so there's a small window where the user exists in `auth.users` but has no row yet in `public.profiles`. When `fetchProfile` fired into that window, it got 0 rows back, and `.single()` exploded. The fix was one word: swap `.single()` for `.maybeSingle()`, which returns `null` instead of throwing when no row is found — and the app already handles `profile: null` gracefully by routing to onboarding.

---

### Synced OnboardingGoalScreen from Claude Design
*2026-06-19 · Feature*

We connected Claude Design to Claude Code for the first time — pulled the `OnbGoalScreen` design spec directly from the STEADY Design project and rebuilt the onboarding goal picker to match it pixel-for-pixel. The biggest visual change: replaced the 2×2 card grid with a vertical list of full-width rows (each with an emoji, label, and a chevron/checkmark that swaps on selection), and added a proper STEADY avatar + chat bubble header so the screen feels like a real conversation, not a form. All the logic — `updateProfile()`, navigation to `OnboardingStats`, loading state — was left completely untouched. This is now our workflow for every screen: design in Claude Design, implement in Claude Code.

---

### Fixed login blank-screen bug — race condition between session and profile fetch
*2026-06-19 · Bug*

We hit a classic async race condition: after a successful login, Supabase fires `onAuthStateChange` which immediately set `session` in the store, but the follow-up `fetchProfile()` call is async and takes a moment to complete. During that window, `RootNavigator` saw `session = truthy` but `profile = null`, so none of its three branches (`showOnboarding`, `showApp`, `!session`) evaluated to true — the user was left staring at a blank screen. The fix was to set `isLoading: true` before the profile fetch and `isLoading: false` after it, so the spinner shows instead of nothing while we wait. One-line conceptual fix, but it required tracing the full auth flow from login button → Supabase → `onAuthStateChange` → navigator to find.

### Built the full 6-screen conversational onboarding flow (task 1.12 + 1.13)
*2026-06-19 · Feature*

We just shipped the biggest UX piece of the foundation: a complete conversational onboarding flow that takes a brand-new user from "what's your goal?" to a personalised calorie and macro plan, all before they ever see the home screen. Six screens, each with its own STEADY chat bubble, interactive input, and progress dots — it feels like texting with a nutritionist, not filling out a form. The crown jewel is the DrumPicker: a custom iOS-style slot-machine scroll wheel for height and weight (no third-party library, built on FlatList's `snapToInterval`). The final screen runs the full Mifflin-St Jeor TDEE calculation and animates the calorie number counting up from zero — then a single "Let's start!" tap saves everything to Supabase and flips `onboarding_complete: true`, which makes the navigator automatically switch to the home tab bar with no explicit navigation call needed.

### Built `src/utils/tdee.ts` — Mifflin-St Jeor TDEE calculator (task 1.13)
*2026-06-19 · Feature*

Before we could show a personalised calorie target, we needed the maths. We implemented the Mifflin-St Jeor formula in `src/utils/tdee.ts`: BMR is calculated from weight, height, age, and sex, then multiplied by an activity factor (1.2 for sedentary up to 1.9 for athletes) to get TDEE. From there, we apply a goal adjustment (−500 kcal for weight loss, +300 for weight gain, +200 for muscle building) and split the result into protein/carb/fat grams using goal-specific macro percentages. We also added an `estimateWeeksToGoal()` helper that uses the 7,700 kcal-per-kg rule to tell users roughly how long their journey will take.

---

### Moved OAuth buttons to Login + Signup screens where they belong
*2026-06-18 · Decision*

Initially placed the Google and Apple sign-in buttons on the Welcome screen, but that was the wrong UX call — Welcome is a landing page, not an auth screen. The social buttons were already scaffolded (UI only, no handlers) on the Login and Signup screens. We wired them up there instead: both screens now call `signInWithGoogle()` and `signInWithApple()` from `authStore`, handle loading states, and silently swallow user-cancelled errors (no alert when someone dismisses the Apple sheet). The Welcome screen was restored to its original two-button state: "Get Started" → Signup, "I already have an account" → Login.

### Added Google OAuth + Apple Sign In (task 1.11)
*2026-06-18 · Feature*

We wired up social login — both Google OAuth and Apple Sign In. This required three layers of changes: installing `expo-apple-authentication` (the native iOS module), registering the `steady://` deep link scheme in `app.json` (so Google can redirect back to the app after auth), and adding `signInWithGoogle()` + `signInWithApple()` actions to `authStore.ts`. The Google flow uses `expo-auth-session` + `expo-web-browser` for the OAuth browser round-trip; Apple uses the native iOS authentication sheet (Face ID / Touch ID) with no browser needed. One critical thing: these buttons are wired up on the code side, but Google and Apple providers still need to be enabled in the Supabase dashboard — see the setup notes in the previous session summary.

---

### Switched input surfaces to neutral light gray
*2026-06-18 · Decision*

Changed `bgSurface` from `#EEEDF4` (lavender-tinted) to `#F2F2F2` (clean neutral gray) and updated `border` from `#E4E2EC` to `#E8E8E8` to match. The lavender tint on inputs looked slightly off against the new `#FAFAFA` background — a neutral gray sits better and gives the form fields a familiar, native-feeling look. Both Login and Signup screens pick this up automatically via the shared token.

---

### Changed app background to neutral off-white `#FAFAFA`
*2026-06-18 · Decision*

Swapped `bgPrimary` from the lavender-tinted `#F7F6FB` to `#FAFAFA` — a neutral off-white that reads as clean white to the eye without the clinical feel of pure `#FFFFFF`. Because every screen references the single `colors.bgPrimary` token, this one-line change in `colors.ts` updated the entire app simultaneously. The `#EEEDF4` input surfaces still have clear contrast against it, so form usability is unaffected.

---

### Brought LoginScreen to full parity with SignupScreen
*2026-06-18 · Feature*

The Login screen was still on the old design — hardcoded `#F2F2F2` inputs, no borders, a text "G" instead of the real Google logo, and stale font sizes. We brought it up to the exact same standard as Signup: proper `colors.*` and `fontWeight.*` tokens everywhere, 50px inputs with 1px border, GoogleLogo SVG component, 48px social buttons, 50px primary CTA with indigo shadow, and correct divider spacing (22px top + bottom). Both auth screens are now pixel-identical in structure and feel like one cohesive flow.

---

### Restored app background to `#F7F6FB` after design image comparison
*2026-06-18 · Decision*

We briefly changed `bgPrimary` to `#FAFAFA` (near-pure white) but a direct comparison against the Claude Design screenshot showed the correct background has a clear lavender tint — `#F7F6FB`. The difference matters: the lavender subtly ties the background to the indigo accent color and makes the white input fields pop with more contrast. Reverted the token back to `#F7F6FB`, which propagates the fix to every screen instantly.

---

### Slimmed down widget sizes and lightened app background
*2026-06-18 · Decision*

The signup screen felt heavy — 56px inputs and buttons are the right scale for a design mockup viewed on a big monitor, but on an actual phone they look chunky. We dialled everything down to feel more native: inputs and the primary button from 56px → 50px, social/Apple buttons from 52px → 48px, back button from 40px → 36px. We also lightened the app background from `#F7F6FB` (cool lavender-gray) to `#FAFAFA` (near-pure white) — because `bgPrimary` is a single theme token in `colors.ts`, this one change propagates across every screen in the app instantly.

---

### Fine-tuned SignupScreen spacing and typography against design spec
*2026-06-18 · Bug*

A close diff between the live code and the Claude Design revealed five small but visible gaps: the "or continue with" divider had no top margin (it sat too close to the password field), the social button text was 15px/medium instead of 16px/semibold, the legal text had no top breathing room before it, placeholder colors were hardcoded `#AAAAAA` instead of `colors.textMuted`, and two unused imports (`spacing`, `typography`) were cluttering the file. All five fixed — the screen now matches the design spec exactly.

---

### Replaced text-based social icons with proper SVG logos on Signup screen
*2026-06-18 · Feature*

The Apple and Google "icons" on the signup screen were just a text character and a bold "G" — they looked off and didn't match the design. We replaced them with proper SVG vector logos using `react-native-svg`, pulling the exact path data from the Claude Design source. The Apple logo is a single monochrome path in `#1D1D1F`, and the Google logo is four separate colored paths (blue, green, yellow, red) composing the full multicolor G. React Native can't render raw `<svg>` tags like a browser can — `react-native-svg` bridges that gap by translating `<Svg>` and `<Path>` components into native drawing calls on iOS and Android.

---

### Synced SignupScreen to match the Claude Design spec pixel-for-pixel
*2026-06-18 · Feature*

We connected Claude Code directly to the claude.ai design project using the `DesignSync` tool — no file exports needed, it reads the design files live via your account. After comparing the design spec against `SignupScreen.tsx`, we fixed six visual gaps: background changed from plain white to the brand lavender `#F7F6FB`, inputs now have the correct 56px height and a 1px `#E4E2EC` border, back button grew to 40×40px, title is now 26px/semibold, social buttons are the right 52px height, and the primary CTA button got a subtle indigo drop shadow. We also eliminated every hardcoded hex value — the screen now pulls 100% from `colors.*` and `fontWeight.*` theme tokens.

---

### Overhauled the full design token system with a new color palette
*2026-06-18 · Decision*

We replaced the warm-beige color palette with a clean cool-lavender system based on a proper design token spec. The new background is `#F7F6FB` (cool off-white with a slight purple tint), surfaces are `#EEEDF4`, and the accent is back to `#F2542D` (orange-red) — a deliberate choice to create energy and contrast against the cool backgrounds. We also expanded the token set to include macro colors (`protein`, `carbs`, `fat` each with soft tint variants), proper status colors, and shadow tokens. Because the entire app references `colors.ts` as its single source of truth, this one-file change updated every screen simultaneously.

---

### Redesigned the Login screen to match the Signup redesign
*2026-06-18 · Feature*

Brought the Login screen up to parity with the new Signup design — white background, circular `‹` back button, label-free grey pill inputs, eye icon inside the password field, "Forgot password?" as a right-aligned link below the password input, and the same Apple/Google social auth section. The Android status bar padding fix (`StatusBar.currentHeight`) is applied here too so the back button never clips under the system bar. Both auth screens now feel like one cohesive flow.

---

### Redesigned the Signup screen to match the modern mockup
*2026-06-18 · Feature*

The old signup screen had a warm-beige background with uppercase labels above every field — it looked like a form, not a product. We redesigned it to match a clean white-background mockup: inputs are now label-free grey pills, the back button is a circular icon instead of text, and we added an "or continue with" social auth section (Apple + Google buttons, UI only for now — OAuth wiring comes later). The "Create Account" CTA moved to the bottom as the clear primary action, with social options above it. The whole screen now feels like it belongs alongside the premium Welcome screen.

---

### Rebranded STEADY's accent color from orange to violet
*2026-06-18 · Decision*

We swapped the entire app's brand accent from warm orange (`#C8703A`) to violet (`#6366F1`) after seeing a design mockup that showed how much more premium and modern the purple reads against food photography. Because the whole app pulls color from a single `colors.ts` theme file, this was a one-line change that updated every button, loading indicator, and highlight across every screen simultaneously — the power of a centralized design token system. The light accent (`accentLight`) was updated to `#818CF8`, the natural lighter tint of the new violet.

---

### Polished the Welcome screen — transparent status bar + frosted glass buttons
*2026-06-18 · Feature*

Small details make a huge difference in perceived quality. We made the Android status bar transparent so the food photo bleeds edge-to-edge all the way to the top of the screen — no grey block cutting off the hero image. We also swapped the "Get Started" button from our warm accent orange to a semi-transparent black (`rgba(0,0,0,0.45)`) with a subtle white border, so both buttons now have the same frosted-glass feel and neither color fights with the photo underneath. The result is a much more immersive, premium first impression.

---

### Decided what we're building
*2026-06-12 · Milestone*

Started with a clear vision: build an app that combines the best parts of CalAI (snap a photo, get calories instantly), HealthifyMe (an AI nutritionist who knows your goals), and Journable (food logging that feels like a journal, not a spreadsheet). The app is called **STEADY** — because that's what sustainable health looks like. Not a crash diet, not obsessive tracking. Just steady.

---

### Designed the full product from scratch — screens, UX, and tech stack
*2026-06-12 · Decision*

Before writing a single line of code, we planned everything. Picked React Native + Expo because it lets us ship to both iOS and Android without needing Xcode or Android Studio on day one. Supabase as the backend — it gives us a full PostgreSQL database, authentication, file storage, and serverless edge functions, all for free at MVP scale. The most interesting decision: we're using two different AI models. OpenAI's GPT-4o handles food photo analysis (it's remarkably good at identifying dishes and estimating portions). Anthropic's Claude claude-sonnet-4-6 powers the AI nutritionist chat — it can hold a whole day's conversation in context and give genuinely personalized advice.

---

### Designed the UX — warm, journaling, AI-first
*2026-06-12 · Decision*

Spent serious time on the UX before touching code. The app has an earthy, warm visual style — cream backgrounds, terracotta accents — like a food journal you'd actually want to open. The home screen is a scrollable feed of meal cards with photos and captions, not a spreadsheet of numbers. The centerpiece is a combined AI chat + food logging screen: you can type "had eggs and toast for breakfast", and the AI parses it, logs it, and slides a card into your home feed. Or just snap a photo. The AI screen doubles as a nutritionist — ask it anything about your diet and it responds with context about what you've already eaten today.

---

### Set up the project repo and documentation system
*2026-06-12 · Setup*

Initialized the GitHub repo (`me-shivamo/STEADY`), created the `.claude/` folder with the full product plan, memory files so Claude never loses context across sessions, and this devlog — which auto-updates every time we build something new. Building in public from day one.

---

### Built the full interactive design prototype — all 9 screens, live in the browser
*2026-06-17 · Milestone*

Before touching React Native code, we built a pixel-perfect interactive prototype of the entire app in HTML/CSS/React. This isn't a wireframe — it's a full working design with real data, animations, and navigation. You can open `design/index.html` in any browser and click through every screen.

**What's in it:**
- **9 screens** fully designed: Welcome, Sign Up, Onboarding (Goal + Calorie Reveal), Home dashboard, Camera, Progress (weekly report), Profile/Me, and Meal Plan
- **Home screen** is the most complex — it's a unified feed that interleaves food log cards with AI coach messages, chronologically. You can switch between "Food log only" and "Log + Coach" views, navigate between past days, quick-add saved foods via a bottom sheet, and type directly in a composer bar
- **Meal Plan** is a full weekly planner with three views: Day (slot-based), Places (grouped by where you'll eat), and Week (full 7-day overview). Cards are draggable. There's an AI planning chat sheet with working interactions
- **Progress** is a real weekly report with a weight line chart (smooth SVG curves), calorie history bars with macro breakdowns per day, and weekly average bars
- **Color system diverged from the original spec** — the design landed on a cooler, more purple-tinted background (`#F7F6FB`) and a coral-red accent (`#F2542D`) rather than the warm cream + terracotta palette from the design brief. This is a deliberate design iteration — the prototype's palette tests better on screen. We'll decide which direction to go when implementing in React Native.

The prototype uses an iOS device frame (402×874pt), scales to any viewport, and includes a screen navigator rail on the left and a Tweaks panel for switching accent colors and toggling demo states. All food images are real Unsplash photos with the correct URLs from the design brief.

**Files:** `design/index.html` + 8 supporting `.jsx` files in `design/`.

---

### Locked in design decisions — palette, navigation, and home screen
*2026-06-17 · Decision*

Several key product and design decisions locked in today after reviewing the prototype against what we actually want to build:

**Color palette:** Kept the cooler purple-tinted palette from the prototype (not the warm cream from the original brief). Softened everything further — less saturated accent (`#C4503A` terracotta-ish), lighter shadows, quieter macro colors. The goal is that nothing screams at you. The app should feel calm.

**Navigation:** Confirmed hamburger drawer only. No bottom tab bar on the home screen — it adds visual noise and the home screen should be focused. The drawer slides in from the left with Home, Progress, and Me. That's it. Meal Plan removed from navigation entirely.

**Meal Plan:** Deferred to v2. The screen stub exists in the code so the router doesn't crash, but it's a "coming soon" placeholder. We want to nail the core logging and AI chat experience before adding meal planning complexity.

**Home screen:** Stripped down to exactly what matters — calorie ring at the top, combined food log + AI coach feed in the middle, one text input + camera button at the bottom. The only interactive elements in the top bar are: hamburger (drawer), date (tappable day picker), streak badge. The composer has a secondary bookmark icon for saved foods and a primary camera button. Nothing else. User lands here and knows exactly what to do.

---

### Understood how to keep API keys safe — and why it matters
*2026-06-17 · Decision*

Had a good conversation about why API keys must never live in the app code. When you compile a React Native app, it becomes a binary file (`.ipa` / `.apk`) that anyone can download and run extraction tools on — tools like `strings` or `jadx` can pull every hardcoded value out in seconds. So our architecture is a strict three-layer chain: the app only ever holds the Supabase URL and anon key (both safe to expose), our Supabase Edge Functions hold the real secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) as server-side environment variables, and the AI APIs only ever talk to our server — never directly to the phone.

---

### Evaluated all alternatives to Supabase Edge Functions — and confirmed our choice
*2026-06-17 · Decision*

We mapped out every option for running server-side AI calls: Vercel Functions (great DX, but splits infra across two services), AWS Lambda (powerful but serious setup overhead for an MVP), Cloudflare Workers (fast globally, similar constraints to Edge Functions), Railway/Render (always-on server that costs money when idle), and a self-managed VPS (full control but you own the uptime). Supabase Edge Functions win for STEADY at this stage because our functions live right next to our database — a single Edge Function call can query today's food logs and call Claude without an extra network round-trip to a separate service. We stay on one platform until there's a concrete reason to split.

---

### Downgraded from Expo SDK 56 → 54 to match Expo Go on Android
*2026-06-17 · Bug*

After scaffolding with SDK 56, the app wouldn't load on the physical Android device because the Play Store version of Expo Go only supports SDK 54. Rather than wait for the Play Store to update, we downgraded the project to SDK 54 using `npx expo install expo@^54` — which automatically resolved all compatible package versions and re-installed. The app now loads correctly on device via tunnel mode (phone is on laptop's hotspot, so direct LAN connection doesn't work — Expo's `--tunnel` flag routes through ngrok's servers instead).

---

### Initialized the Expo app and installed all packages
*2026-06-17 · Setup*

We scaffolded the React Native + Expo project using `create-expo-app` with the `blank-typescript` template — the clean starting point with no opinions on routing or structure. Because the repo already had files, we generated into a temp directory and moved just the Expo files across. Then installed the full package list in two passes: `npx expo install` for anything with native device API access (camera, haptics, secure store, navigation) so Expo could pin the exact versions it has tested against SDK 56, and plain `npm install` for pure JS libraries (Zustand, react-hook-form, Zod, victory-native, date-fns). All 594 packages installed clean.

---

### Created the src/ folder structure and theme system
*2026-06-17 · Setup*

Laid out the full `src/` directory tree from our plan — `api/`, `components/`, `hooks/`, `navigation/`, `screens/`, `store/`, `theme/`, `types/`, `utils/` — plus the `supabase/functions/` and `supabase/migrations/` folders. Then wrote the three theme files that everything else will import from: `colors.ts` (all design tokens — accent, backgrounds, text, macro colors), `spacing.ts` (4px grid scale: xs/sm/md/lg/xl/xxl), and `typography.ts` (font sizes, weights, line heights). These are the single source of truth — no color or spacing value will ever be hardcoded in a component.

---

### Got the app running on a physical Android device via tunnel
*2026-06-18 · Setup*

Running in WSL2 (Windows Subsystem for Linux) means the dev server lives behind two layers of NAT — WSL's private network inside Windows, which is inside your home router — so the phone can't reach it directly over LAN. The fix is `expo start --tunnel`, which routes traffic through ngrok's public servers: your phone connects to a public URL like `https://abc123.ngrok.io`, ngrok forwards it to your WSL2 machine, Metro Bundler serves the JS bundle. We had to install `@expo/ngrok` first (`npm install --save-dev @expo/ngrok`) because Expo CLI ships without it — it's an optional driver you opt into. The tunnel connected cleanly on the first try with Expo Go 54.0.8 on Android (matching our SDK 54 project).

---

### First time seeing STEADY on a real phone
*2026-06-18 · Milestone*

Scanned the ngrok QR code with Expo Go 54.0.8 on Android, Metro bundled the app, and STEADY loaded on a physical device for the first time. The home screen is visible and running. This is the moment the app stops being code on a laptop and becomes something you actually hold in your hand — a huge motivational milestone for any mobile project. Everything from here is building on a working foundation.

---


### Auth pipeline working end-to-end — user in the database, Welcome screen on the phone
*2026-06-18 · Milestone*

Signed up through the app for the first time and checked Supabase — the `profiles` table shows a real row with `full_name: Shivam`. This confirms the entire auth pipeline works: the app calls Supabase Auth, Supabase creates the user, the `handle_new_user` DB trigger fires automatically and creates the profile row, and the app receives the session and routes correctly. The Welcome screen is also rendering live on a physical Android device with the food photo background, STEADY logo, tagline, and both CTA buttons — exactly matching the design.

---

### Fixed typography crash — `typography` export was missing
*2026-06-18 · Bug*

The app crashed on first load with `TypeError: Cannot read property 'lg' of undefined`. The auth screens imported `{ typography }` from the theme file, but the file only exported `fontSize`, `fontWeight`, and `lineHeight` as separate named exports — there was no `typography` object. Fixed by adding `export const typography = fontSize` as a convenience alias at the bottom of `typography.ts`. One line fix, instant reload, crash gone.

---

### Connected STEADY to a real Supabase backend
*2026-06-18 · Setup*

Created the Supabase project, wrote all 3 migration files (`001_initial_schema.sql`, `002_rls_policies.sql`, `003_triggers_functions.sql`), and ran them against the live database. We now have 12 tables set up — profiles, food_items, meal_logs, food_entries, weight_logs, water_logs, daily_summaries, streaks, usage_limits, and more — all with Row Level Security enabled so each user can only ever see their own data. Generated TypeScript types directly from the live schema using `supabase gen types typescript`, giving us full compile-time safety on every database query.

---

### Built the full auth layer — Supabase client, Zustand store, and 3 auth screens
*2026-06-18 · Feature*

Built `src/api/supabase.ts` — the singleton Supabase client that uses AsyncStorage to persist sessions across app restarts. Built `src/store/authStore.ts` using Zustand — a global reactive state store that holds the current session, user profile, and auth methods (signUp, signIn, signOut, fetchProfile, updateProfile). Built all 3 auth screens (Welcome, Login, Signup) with full form validation and error handling. The app now routes automatically between Auth / Onboarding / App based on session state and `onboarding_complete` flag.

---

### Built the full navigation architecture — 4 navigators, typed routes
*2026-06-18 · Feature*

Set up the complete navigation structure using React Navigation: `RootNavigator` (the top-level router), `AuthNavigator` (Welcome → Login/Signup stack), `OnboardingNavigator` (6-screen conversational flow), and `AppNavigator` (bottom tabs: Home, Journal, AI, Me). All routes are fully typed in `src/navigation/types.ts` so TypeScript catches invalid screen names and missing params at compile time. Wired `App.tsx` to render `RootNavigator` — the Expo placeholder is gone and the real app navigation is live.

---

### Wired HomeScreen feed to live foodLogStore data (task 2.5)
*2026-06-20 · Feature*

Replaced all static MOCK data in `HomeScreen.tsx` with live reads from `useFoodLogStore` and `useAuthStore`. On mount, a `useEffect` calls `fetchTodayEntries()` which loads today's meal logs + food entries from Supabase in a single query. The CalorieRing, macro progress bars, and "remaining" counter now all reflect real logged data — calorie and macro goals come from the user's profile (`profile.calorie_goal`, `protein_goal_g`, etc., set during onboarding). The feed below the toggle now renders a `MealCard` per logged meal, or shows the empty state when nothing has been logged yet. The full AI logging pipeline is now end-to-end: type in the AI tab → Edge Function → Supabase → store → home screen updates automatically.

---

### Built `FoodLogChatScreen.tsx` — the AI chat logging UI (task 2.4)
*2026-06-20 · Feature*

Built the full chat UI at `src/screens/app/FoodLogChatScreen.tsx` — the screen where users type what they ate and watch it get logged in real time. The screen maintains a local `messages` array of four possible message types: user bubble (right-aligned, indigo), thinking indicator (spinner + "Analysing your meal…"), MealCard (the actual logged result embedded directly in the chat thread), and error bubble (red, shown if the Edge Function fails). The send flow is: add user bubble → add thinking bubble → call `logMealFromText()` → replace thinking bubble with MealCard. `KeyboardAvoidingView` ensures the input bar shifts above the keyboard when it opens (iOS: padding mode, Android: height mode). The screen opens with a welcome message explaining how to use it and showing an example prompt so new users understand what to type.

---

### Built `MealCard.tsx` component (task 2.3)
*2026-06-20 · Feature*

Built `src/components/nutrition/MealCard.tsx` — the card that appears in the home feed each time a meal is logged. It receives a `MealCard` object from the store and renders three sections: a tappable header (meal emoji icon + AI-generated meal name + meal type + time + total kcal), a collapsible list of individual food items (name, grams, calories per item), and a row of three macro pills (Protein / Carbs / Fat in their respective brand colors). The card is collapsible — tapping the header hides the food list and macros so the feed doesn't get overwhelming when many meals are logged in a day. All nutrition totals are computed inline from the entries array rather than stored separately, so the numbers are always consistent with the actual logged data.

---

### Built `foodLogStore.ts` — Zustand store for food logging (task 2.2)
*2026-06-20 · Feature*

Built `src/store/foodLogStore.ts` — the global in-memory store that holds everything the home screen needs to know about today's food. It has three actions: `fetchTodayEntries()` which loads today's `meal_logs` + nested `food_entries` from Supabase in a single query (using Supabase's `select('*, food_entries(*)')` relation join); `logMealFromText(text)` which calls the Edge Function and immediately updates local state without a round-trip re-fetch; and `deleteEntry(id)` for future swipe-to-delete. The store also computes `totals` (calories/protein/carbs/fat summed across all today's entries) every time the meal list changes — so the CalorieRing on the home screen always has an up-to-date number to display. The merge logic in `logMealFromText` handles the case where you log to the same meal slot twice (e.g. "I also had some orange juice with breakfast") by appending new entries to the existing card rather than creating a duplicate.

---

### Built `log-food-from-text` Edge Function (task 2.1)
*2026-06-20 · Feature*

Built the core AI food logging pipeline as a Supabase Edge Function at `supabase/functions/log-food-from-text/index.ts`. The function receives a plain-English meal description from the app, calls `openai/gpt-4o-mini` via OpenRouter with a structured JSON prompt, then writes the results into three DB tables in sequence: `meal_logs` (the meal container, upserted so logging twice to the same meal slot is safe), `food_items` (each extracted food cached with `source='ai_estimated'`), and `food_entries` (the actual log rows with `source='ai_text'` and an AI confidence score). The existing DB trigger from migration 003 fires automatically on every `food_entries` insert and updates `daily_summaries` — so the home screen's calorie ring will always reflect live data without any extra work. We chose `gpt-4o-mini` via OpenRouter over Claude Haiku (5× more expensive) and Gemini Flash (research showed 64–109% nutrition estimation error vs GPT-4o's ~36%) — it's the sweet spot of accuracy and cost at ~$0.0002 per food log entry. The function also auto-infers meal type from the time of day (breakfast/lunch/snack/dinner) if the app doesn't pass one explicitly.

---

### Pivoted to AI-first food logging — restructured the roadmap
*2026-06-20 · Decision*

We made a core product decision: skip manual food search entirely and lead with AI chat logging as the primary way to log food. The original roadmap had USDA food search (2.1), food detail screen (2.2), and barcode scanning (2.4) coming before the AI chat feature — but those are just table stakes that every other calorie app already has. The differentiator is being able to type "I ate an omelette sandwich with three slices of tomato" and having AI parse it, look up the nutrition, and drop a card on your home screen. We moved all manual search and barcode tasks to Phase 5 (after the core AI flow is proven) and made the `log-food-from-text` Edge Function the very next thing we build. The new Phase 2 sequence: Edge Function → Zustand store → MealCard component → Chat screen → wire into Home feed → photo logging.

---

### Removed bottom tab bar from the Home screen
*2026-06-20 · Decision*

The home screen was showing the bottom tab bar (Home / Journal / AI / Me) even though the original design decision called for a focused, distraction-free dashboard with navigation via the hamburger menu instead. We hid it by adding `tabBarStyle: { display: 'none' }` to just the Home tab's options in `AppNavigator.tsx` — React Navigation lets you override the global tab bar style per screen, so the bar still appears on Journal/AI/Me but is completely gone on Home. We also updated `HomeScreen`'s `SafeAreaView` from `edges={['top']}` to `edges={['top', 'bottom']}` — previously the tab bar was handling the bottom safe area (the home indicator space on iPhones), but with it hidden the screen now owns that space itself so the composer bar doesn't overlap the system home indicator.

---

### Reduced UI density across all screens — "zoom out" pass
*2026-06-20 · Decision*

After seeing every screen on a real phone, everything felt too bulky — fonts were slightly too large, buttons too tall, and components too padded for a real hand-held device. We did a targeted density pass across the entire app: reduced the global typography scale ~10-12% in `typography.ts` (e.g. `display` 32→26, `xxl` 24→21, `lg` 17→15) so the change cascades to every screen automatically via the shared tokens. Then we tightened the hardcoded structural values that don't use tokens — auth header `paddingTop` 80→44, input heights 50→46, social buttons 48→44, onboarding button height 56→48, SelectableCard `minHeight` 64→54, ChatBubble avatar 36→32px, CalorieRing 116→96px, and the footer composer 72→62px. The rule of thumb: design mockups are viewed on a big desktop monitor, so they naturally look larger than they should on an actual 375px-wide phone screen — pulling everything back ~10-15% is standard practice.

---

### Built CalorieRing component + Home dashboard shell
*2026-06-20 · Feature*

Built `src/components/nutrition/CalorieRing.tsx` — an SVG circular progress ring using `react-native-svg` (already bundled in Expo SDK 54, no new install needed). The ring draws from empty to the actual eaten percentage on mount using `Animated.Value` with `useNativeDriver: false`, since SVG stroke properties can't run on the native thread. The indigo gradient (#818CF8 → #6366F1) and track color (#EEEDF4) are pixel-matched directly from the Claude Design. Replaced the HomeScreen placeholder with a full dashboard shell: top bar with hamburger + live date + streak chip + bell, the CalorieRing + MacroRows summary card, a Food log / Log + Coach feed toggle, and the footer composer bar — all matching the design exactly using the same CSS variable values converted to React Native StyleSheet.

---

### Fixed the home chat: it can now answer questions, not just log food
*2026-06-21 · Bug*

We hit a bug where asking the home-screen chat a question ("Can you tell me what I can eat right now?") returned a red "Edge Function returned a non-2xx status code" error, even though logging food worked fine. The root cause: our `log-food-from-text` Edge Function was a food-only extractor — when no food was found in the message it returned a 422 error, and the app rendered that as the red bubble. There was simply no path for answering questions; the AI nutritionist chat from the product plan had been specced but never built.

We fixed it by teaching the one Edge Function to handle both jobs. Its system prompt now tells gpt-4o-mini to classify each message and return one of two JSON shapes — `intent:"log"` (the existing food structure) or `intent:"answer"` (a conversational reply) — and the function branches on that field: answers return immediately with no DB writes, food logs flow through the unchanged insert logic. We also pull the user's day-so-far totals + goals from `profiles`/`daily_summaries` and inject them into the prompt so answers are personalised ("you have ~1400 cal left"). The store now returns a `LogResult` discriminated union and both chat screens render an AI text bubble for answers.

### The key cost decision: one AI call, not two
*2026-06-21 · Decision*

The obvious-but-wrong way to route "is this food or a question?" is to call the AI once to classify, then a second time to actually answer — doubling token cost on every single message. We deliberately chose **single-call routing** instead: one gpt-4o-mini call returns either the logged meal or the answer, classification and response in the same round trip. We also reused the existing `gpt-4o-mini` model and OpenRouter key (no new Anthropic key, no new function) so a simple question stays at ~$0.0002 with zero extra setup. Robust *and* affordable was the whole brief.

### Refined inline card editing: AI food summary + inline ✓/✕ + keyboard scroll
*2026-06-22 · Feature*

We made three targeted improvements to the meal card's inline edit mode based on user feedback and a Journable app reference screenshot. First, the edit draft now pre-fills with the AI-generated food summary ("Bread (2 slices), Tomato (42 g), Egg (2 large)") instead of the user's raw input text — this is the right thing to edit because it's what the AI *understood*, not what the user typed. Second, the ✓/✕ confirm/cancel buttons moved from the footer into a row right next to the TextInput itself, matching the Journable pattern — it's a `flexDirection:'row'` container with the input taking `flex:1` and the two icon buttons beside it. Third, tapping ✎ now calls `scrollToEnd` on the HomeScreen ScrollView so the card scrolls into view above the keyboard — no more hunting for the text box after the keyboard pops up.

### Built date picker + historical food log viewer
*2026-06-24 · Feature*

We built a Jounerable-style date picker on the home screen — the date block in the top bar now opens an animated calendar sheet with a 7-day strip (always visible) and a full month grid + month pills that expand/collapse. Selecting any past date reloads the feed with that day's meal cards and calorie/macro summary pulled straight from Supabase, using `meal_logs.logged_date` (already indexed). The implementation is pure React Native with no new packages: `Animated.Value` drives a `maxHeight` interpolation (0 → 420) since `maxHeight` is a layout property and can't use `useNativeDriver: true`. We stored `selectedDate` in the Zustand store (not local state) so any future screen can read which day is being viewed without prop drilling.

### Decided: composer stays on past days for AI questions
*2026-06-24 · Decision*

We debated whether to hide the text input when viewing a historical day. The winning argument: users will naturally want to ask the AI things like "how was my protein that day?" while looking at old logs. So the composer stays. The key guard: if the AI detects food in the user's message while they're on a past day, we show the calorie estimate as an info bubble instead of persisting it to the DB — `logMealFromText` always writes to today's date on the Edge Function side, so the fix is purely in `handleSend` on the client. Camera and image icons are hidden on past days since retroactive photo logs don't make sense.

### Added options bottom sheet to meal cards (Edit Entry + Delete)
*2026-06-22 · Feature*

Wired up the ⋮ ellipsis button on every meal card to open a slide-up bottom sheet with two actions: "Edit Entry" (which triggers the inline edit we built earlier) and "Delete" (which permanently removes the meal log and all its food entries from Supabase, then drops the card from local state). We built the bottom sheet using React Native's built-in `Modal` component — no new packages needed. A semi-transparent backdrop lets the user dismiss by tapping outside. Delete shows a confirmation `Alert` before actually removing anything, so accidental taps don't wipe data. The `deleteMeal` store action deletes the `meal_logs` row and relies on Supabase's `ON DELETE CASCADE` to clean up `food_entries` automatically.

### Added swipe left/right to navigate between dates
*2026-06-24 · Feature*

We wired up horizontal swipe gestures on the home screen feed so users can swipe left to go to the next day and right to go to the previous day — a much more natural way to browse history than opening the calendar every time. The implementation uses React Native's built-in `PanResponder` API, which listens to touch events and fires a callback when the finger lifts. We use a 50px horizontal threshold to distinguish an intentional swipe from an accidental drift, and we check `Math.abs(dx) > Math.abs(dy)` before claiming the gesture so vertical scrolling still works normally. One subtle bug we caught: `PanResponder.create` runs only once (inside `useRef`), so its closure would permanently capture the initial `selectedDate` value from mount time — we fixed this by keeping a `selectedDateRef` that stays in sync via `useEffect`, and reading from that ref inside the gesture handler.

### Split date fetch into fast summary + slow cards for instant ring update
*2026-06-24 · Feature*

We split the date-switch data load into two parallel queries. Query A hits `daily_summaries` — a single pre-aggregated row kept perfectly in sync by a DB trigger — and resolves in ~50ms, updating the calorie ring and macros almost instantly. Query B runs the full `meal_logs + food_entries` join (~200–300ms) and fills in the meal cards after. Both fire simultaneously the moment a date is tapped, so the top of the screen (what the user sees first) renders almost instantly while the cards stream in behind it. The `daily_summaries` table already existed with a trigger that recalculates totals on every food entry insert/update/delete — we just weren't using it for reads.

### Fixed calendar date selection lag (1–2s delay eliminated)
*2026-06-24 · Bug*

We tracked down why tapping a date in the calendar felt sluggish — it turned out to be three compounding issues. First and worst: there was a deliberate `setTimeout(..., 260)` in `HomeScreen.tsx` that waited for the collapse animation to finish before even *starting* the Supabase fetch. We killed the timeout and now the fetch fires immediately on tap, running in parallel with the animation — by the time the calendar collapses (~240ms), the data is already back. Second: `fetchEntriesForDate` was calling `supabase.auth.getSession()` on every date change, which reads the JWT from AsyncStorage (phone disk) — we switched to `supabase.auth.getUser()` which uses the in-memory token. Third: the Zustand store now clears `meals` and `totals` to zero the instant a new date is selected, so the UI snaps to an empty clean state immediately rather than showing the previous day's stale data until the fetch resolves. We also added a new migration (`006_perf_indexes.sql`) with composite indexes on `meal_logs(user_id, logged_date)` and `food_entries(meal_log_id)` to keep the DB query fast as the user's log history grows.
