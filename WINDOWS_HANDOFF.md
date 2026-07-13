# Handoff: E2E Testing (Maestro) — Continue on Windows

**Read this file first, in full, before doing anything.** It contains everything needed to continue this work with zero other context from the previous session. Do not ask the user to re-explain what's already answered here.

## What this project is

STEADY is a React Native/Expo app (iOS + Android) — AI calorie tracking. This repo has three layers of automated tests already built and passing:

1. **Unit tests** (Jest) — `__tests__/unit/*.test.ts` — pure functions and Zustand stores with mocked Supabase.
2. **Component tests** (Jest + React Native Testing Library) — `__tests__/component/*.test.tsx` — screens rendered headless.
3. **E2E tests** (Maestro) — `.maestro/*.yaml` — drives the real installed app on a real device. **This is what's in progress and what you're picking up.**

Both layers 1 and 2 are complete: 163 tests, all passing. Run `npm test` to confirm. Nothing needed there.

Layer 3 (Maestro E2E) is where we got blocked — not on logic, but on infrastructure, explained below.

## The spec these tests trace to

`TEST_SCENARIOS.md` at the repo root is the master spec — every scenario has an ID (e.g. `1.1.1`), a Type (Positive/Negative/Edge), and a Layer (Unit/Component/E2E/Manual). The `.maestro/*.yaml` flows implement the rows tagged `E2E`. Read that file's sections 1–2 (Auth, Onboarding) for the scenarios the current flows cover.

## What's already built and working

Two flow files exist in `.maestro/`:

- **`.maestro/signup-onboarding-home.yaml`** — signs up with a throwaway, timestamp-unique email, walks all 6 onboarding screens, lands on Home. Covers TEST_SCENARIOS.md §1.1.1 and §2.4.1.
- **`.maestro/login.yaml`** — depends on the signup flow having just run (same `RUN_ID`), signs out, logs back in with the same account. Covers §1.2.1.

**Both files are syntax-valid** (`maestro check-syntax <file>` returns `OK`) and **the flow logic has been partially verified against a real device** — in one run, the app launched, the conditional sign-out logic correctly skipped (device was already at Welcome), and the flow reached `assertVisible: "Get Started"` before a connection failure interrupted it (not a flow bug — see below). A full run completed once, informally, as a `_smoke.yaml` test (now deleted) that proved `Launch app "com.steadyapp.android"... COMPLETED` — see `smoke-launch.png` in the repo root for the actual screenshot Maestro captured.

**Do not rewrite these flows from scratch.** They are correct. Read them before touching them.

## Key facts learned the hard way (do not re-derive these)

- **`launchApp: { clearState: true }` FAILS on real devices with locked-down OEM adb shells** (confirmed on an OPPO/ColorOS device) — `SecurityException: ... does not have permission android.permission.CLEAR_APP_USER_DATA`. Neither flow uses `clearState`. Don't add it back.
- **The signup flow is defensively self-sufficient**: it starts with `launchApp` (no clearState), then a `runFlow: { when: { visible: "kcal" }, commands: [...] }` block that signs out ONLY if the app happens to already be on Home — so it works whether the device starts signed-in or signed-out. This pattern is required because there's no reliable way to force a clean app state on real devices here.
- **Maestro's real YAML syntax differs from what you'd guess by analogy with other tools.** `assertVisible` does NOT take a `{text, timeout}` object — that's invalid (`Unknown Property: timeout`). For a timed wait, use:
  ```yaml
  - extendedWaitUntil:
      visible: "some text"
      timeout: 10000
  ```
  **Always run `maestro check-syntax <file>` before running against a device.** It's instant and catches this class of mistake for free — don't burn a slow device run on a syntax typo.
- **There are no `testID` props anywhere in this app's screens.** Selectors must be exact visible text (`tapOn: "Get Started"`) or, for icon-only buttons (e.g. the Home screen's hamburger menu, which has no accessibilityLabel), a position selector: `tapOn: { point: "9%, 8%" }` (percentage of screen, derived from a real screenshot — see below for how to get one).
- **Exact selector strings for every screen** were surveyed in the previous session and are accurate as of the current code — see the "Confirmed screen text" section below. Trust these; don't re-derive from scratch unless the UI has visibly changed.
- **Test data safety**: the app's `preview` and `production` EAS build profiles point at the SAME Supabase backend (`xfrwzwayibenskyoakmi.supabase.co`) — there is no separate test project. The user explicitly approved running E2E flows against this real backend using throwaway, uniquely-timestamped accounts (see the `RUN_ID` env var mechanism in the signup flow) — this mirrors the existing manual-testing convention in `TESTING.md` §8 ("use a throwaway signup, not your main account"). Do not create a separate Supabase project unless asked.

## Why we stopped and moved to Windows — READ THIS BEFORE RETRYING ON WINDOWS TOO

The previous session ran entirely inside **WSL2** (Windows Subsystem for Linux) on this same physical machine. WSL2 has no native USB stack, so the phone was bridged in via `usbipd-win` (`usbipd attach --wsl`), which forwards USB-over-IP from Windows into the WSL2 Linux kernel's `vhci_hcd` virtual USB driver.

**This bridge is unreliable under sustained load.** Across ~6 attempts to run the signup flow to completion:
- 1 attempt succeeded on a trivial single-step smoke test flow (`launchApp` + `takeScreenshot` only).
- Every attempt at the multi-step signup flow either hung indefinitely or died with a connection error.
- We confirmed via `dmesg` (Linux kernel log) the exact same failure signature — `vhci_hcd: urb->status -104` (a USB request being reset) — **on two different physical Android devices**, ruling out a device-specific cause. The USB device number kept incrementing (2 → 3 → 4 → 5) as it silently disconnected and reattached throughout the session.
- One `dmesg` line explicitly showed `WSL (238) ERROR: CheckConnection: getaddrinfo() failed: -5` — WSL2's own networking layer failing a connectivity check, which the USB-over-IP forwarding depends on.

**Conclusion: this is a WSL2 + usbipd infrastructure instability, not a bug in the flow files, not a bug in Maestro, and not a device problem.** The fix is to stop bridging through WSL2 and run Maestro natively on Windows instead, where Windows owns the USB connection to the phone directly — no `vhci_hcd`/`usbipd` bridge layer at all.

**If you are now running on native Windows (not WSL2) and still see connection instability, do not assume it's the same root cause — investigate fresh.** The WSL2 bridge is provably gone from the picture; a new instability would have a new cause (different USB driver stack, different adb version, Windows Defender/antivirus interference with adb, etc.).

## Environment setup needed on Windows (none of this exists yet on the Windows side — do it in this order)

1. **Node.js + npm** — confirm with `node --version` / `npm --version`. Install from nodejs.org if missing (LTS version).
2. **Android platform-tools (adb)** — needed for `adb devices`, `adb install`, etc. Either install Android Studio (which bundles it) or just the standalone platform-tools from developer.android.com/tools/releases/platform-tools, and add its folder to PATH.
3. **The phone**: plug it into this Windows machine directly via USB (no usbipd needed now — Windows owns the port natively). On the phone: Settings → About Phone → tap Build Number 7× → Developer Options → enable USB debugging. Run `adb devices` — it should show the phone as `unauthorized` at first; a popup appears on the phone asking to allow the connection — tap Allow (and check "always allow from this computer").
4. **Maestro CLI** — install via `curl -fsSL "https://get.maestro.mobile.dev" | bash` if on Windows via WSL/Git Bash, or check maestro.mobile.dev for the native Windows install method (may require running through WSL still for the CLI itself, but critically the device connection should now go through Windows' native adb, not a WSL-forwarded one — verify `adb devices` shows the phone BEFORE invoking Maestro, from whatever shell you end up running Maestro in).
5. **Clone/copy this repo** to the Windows filesystem (not a WSL path like `\\wsl$\...` — use a real Windows path like `C:\dev\STEADY`) and run `npm install` fresh there (native node_modules don't cross the WSL/Windows boundary cleanly — do not copy `node_modules` itself, reinstall it).
6. **The app must be installed on the phone** before Maestro can drive it. Either:
   - Download the existing preview build directly: `npx eas build:list --platform android --limit 5` will show recent builds; the most recent one's `Application Archive URL` is a direct APK download link. `curl` it and `adb install -r <file>.apk`. (This is what worked in the previous session — no new EAS build needed.)
   - Or run `npx eas build:list` yourself to get a fresh URL if the one below has expired.
   - Last known-good APK URL (may still work): `https://expo.dev/artifacts/eas/MQThn_5agqq7kZWuAkN3D8qJwcKgHWR-M2spXbkUHRc.apk`

## Immediate next steps once environment is ready

1. `maestro check-syntax .maestro/signup-onboarding-home.yaml` — should print `OK`. If not, something about the environment/Maestro version differs — investigate before running against the device.
2. Run it for real:
   ```
   RUN_ID=$(date +%s)  # bash/WSL — for native Windows cmd/powershell use a different unique-value method
   maestro test -e RUN_ID=$RUN_ID .maestro/signup-onboarding-home.yaml
   ```
3. If it completes, immediately run the login flow with the SAME `RUN_ID` (it depends on the account the signup flow just created):
   ```
   maestro test -e RUN_ID=$RUN_ID .maestro/login.yaml
   ```
4. If both pass, we have a working E2E foundation. Next flows to write (not yet started): forgot password (§1.3.1–1.3.3), water/weight logging (§5, §6), settings edit (§9), account deletion (§1.5 — use a throwaway account, never the user's real one).

## Confirmed screen text (exact strings, for writing more flows)

**WelcomeScreen**: `"Get Started"` (→ Signup), `"I already have an account"` (→ Login).

**SignupScreen**: placeholders `"Full name"`, `"Email address"`, `"Password"`. Button `"Create Account"` (→ `"Creating account…"` while loading). Google button `"Continue with Google"`.

**LoginScreen**: placeholders `"Email address"`, `"Password"`. Button `"Log In"` (→ `"Logging in…"`). `"Forgot password?"` link (→ `"Sending…"`).

**Onboarding** (6 screens, `SelectableCard`/`Chip` components, always end with a `"Continue"` button):
- Goal: cards `"Lose weight"`, `"Gain weight"`, `"Maintain weight"`, `"Build muscle"`.
- Stats: drum/wheel pickers (Age, Weight, Height) — NOT text inputs, don't try `inputText` on these. Accept defaults unless a flow specifically needs to test picker interaction.
- Target weight: drum picker + timeline chips `"1 month"`, `"3 months"` (default), `"6 months"`, `"1 year"`. Secondary button `"Not sure yet — skip"`.
- Activity: cards `"Desk life"`, `"Light mover"`, `"On my feet"`, `"Very active"`, `"Athlete mode"`.
- Diet: multi-select chips (10 options e.g. `"Vegetarian"`, `"Vegan"`...). Secondary button `"No restrictions"`. Primary button text is dynamic: `"Continue"` or `"Continue (N selected)"`.
- Reveal: wait for `"kcal / day"` to appear (count-up animation), labels `"Protein"`/`"Carbs"`/`"Fat"`, final button `"Let's start! →"`.

**HomeScreen**: menu button is ICON ONLY, no text/label — use position selector. Streak chip `"🔥 N days"`. Calorie summary shows `"N  /  N kcal"`. Composer placeholder varies by state (`"What did you eat or exercise?"` typically). No visible send button text (icon only).

**ProfileDrawer** rows (exact text): `"Progress Charts"`, `"Weight"`, `"Water"`, `"Body Measurements"`, `"My Foods"`, `"Reminders"`, `"Groups"`, `"Refer a Friend"`, `"Settings"`, `"Help & Support"`, `"Go Premium"`, `"Sign Out"` (exact casing — not "Sign out").

**WaterScreen**: title `"Water"`. Quick-add chips `"100 ml"`/`"250 ml"`/`"350 ml"`/`"500 ml"`. Custom input placeholder `"e.g. 250"`. Button `"Log"`.

**WeightScreen**: title `"Weight"`. Section `"Log today's weight"`. Input placeholder `"e.g. 75"`. Note placeholder `"Add a note (optional)"`. Button `"Log"`.

## Project conventions to follow (from CLAUDE.md at repo root — read that file too)

- **Log every meaningful action to `DEVLOG.md`** at the repo root — first-person plural, conversational, explains what+why. Read the existing entries for tone/format before adding one.
- **Explain before building** — log conceptual learnings to `LEARNING.md`. The user (Shivam) has a Python/Java/C++ background, not JS/TS — explain React Native/Expo/testing concepts in those terms.
- Full rules: `.claude/rules.md`.

## What NOT to do

- Don't recreate the Jest unit/component test suites — they're done and passing (163 tests).
- Don't rewrite the two existing `.maestro/*.yaml` flows from scratch — fix/extend them if needed, but they encode real, hard-won lessons (see above).
- Don't assume Maestro YAML syntax by analogy — always `check-syntax` first.
- Don't run destructive flows (account deletion) against a real/main account — always throwaway accounts, and always verify with the user first if in doubt.
- Don't spend more than one or two retries fighting a connection issue silently — if something looks like an infrastructure problem (not a flow logic problem), say so and ask before burning more time, the same way the previous session eventually did.
