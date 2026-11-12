# STEADY — Manual Test Pass

> **Build:** _fill in — EAS build id + profile + date_
> **Device:** _fill in — model + Android/iOS version_
> **Tester:** Shivam

Fill in **Result** (✅ Pass / ❌ Fail / ⚠️ Works but off) and **Remarks** as you go.
Anything ❌ or ⚠️ needs a remark explaining exactly what happened — screenshots welcome if easy.

> This checklist is **reset per build**. Findings graduate to `STATUS.md`, which is the
> permanent tracker; this file only ever holds the current pass.
> The durable spec these cases trace to is `TEST_SCENARIOS.md`.

---

## 1. Install & launch

| # | Test case | Result | Remarks |
|---|---|---|---|
| 1.1 | APK/AAB installs from the build link | | |
| 1.2 | App icon looks correct on the home screen (STEADY wordmark, no seam) | | |
| 1.3 | App launches without crashing; splash shows the bowl on `#FAFAFA` | | |
| 1.4 | In-app `AnimatedSplash` hands over from the native splash invisibly | | |
| 1.5 | Lands on Welcome / Login (not a blank or stuck loading screen) | | |

## 2. Sign up (email/password)

| # | Test case | Result | Remarks |
|---|---|---|---|
| 2.1 | Sign up with a fresh email + password | | |
| 2.2 | Redirected into onboarding (goal → stats → target weight → activity → diet → reveal) | | |
| 2.3 | Reveal screen shows calculated calorie/macro goals | | |
| 2.4 | Goal-pace line is sane for the chosen goal and deadline | | |
| 2.5 | Completing onboarding lands on Home with the calorie ring | | |
| 2.6 | Signup screen's "Terms" and "Privacy Policy" links open the live steady.chat URLs | | |

## 3. Google sign-in

| # | Test case | Result | Remarks |
|---|---|---|---|
| 3.1 | Sign out, tap "Continue with Google" from Login | | |
| 3.2 | Native account picker opens and shows **STEADY** as the app name | | |
| 3.3 | After choosing an account, the app regains focus | | |
| 3.4 | Signed in — lands on Home (or onboarding if new) | | |
| 3.5 | If it fails: capture `adb logcat \| grep -i googleSignIn` — the diagnostic prints an ordered checklist | | |

## 4. Core logging — AI chat + photo

| # | Test case | Result | Remarks |
|---|---|---|---|
| 4.1 | Type a meal in plain English ("2 eggs and toast") → MealCard with reasonable macros | | |
| 4.2 | Camera FAB opens the OS camera → logs with the photo on the card | | |
| 4.3 | Gallery picker path also logs correctly | | |
| 4.4 | Meal photo displays in the feed (signed-URL path — confirm not blank) | | |
| 4.5 | Photo thumbnail is tappable and opens the full-size viewer | | |
| 4.6 | Ask a question instead of logging ("how much protein left?") → answers, logs nothing | | |
| 4.7 | Calorie ring and macro rows update immediately | | |
| 4.8 | Edit a logged meal (change quantity) — rescales without re-resolving the food | | |
| 4.9 | Delete a meal via the options sheet — disappears and totals update | | |
| 4.10 | "Adjust Calories & Macros" manual override works | | |
| 4.11 | "Change Date & Time" moves the meal to another day | | |
| 4.12 | "Add to Saved Entries" shows a toast confirmation | | |
| 4.13 | Re-log from Saved Entries (no AI round trip) | | |
| 4.14 | Composer has no phantom padding after the keyboard closes | | |
| 4.15 | Options sheet clears the Android nav bar | | |

## 5. Water / Weight / Body Measurements

| # | Test case | Result | Remarks |
|---|---|---|---|
| 5.1 | Drawer → Water → log an entry → reflects in today's total | | |
| 5.2 | Drawer → Weight → log today's weight → chart updates | | |
| 5.3 | Drawer → Body Measurements → log a measurement → saves | | |
| 5.4 | Home streak chip shows a real number | | |
| 5.5 | Drawer streak matches the Home streak | | |

## 6. Progress & date history

| # | Test case | Result | Remarks |
|---|---|---|---|
| 6.1 | Tap the date block on Home → calendar sheet opens smoothly | | |
| 6.2 | Tap a past date → feed reloads with that day's logs (or empty state) | | |
| 6.3 | Composer still answers questions on a past date, no DB writes | | |
| 6.4 | Drawer → Progress Charts → week navigation works | | |
| 6.5 | Weekly average line reflects the real numbers, not filler copy | | |
| 6.6 | TDEE card appears once there's enough data (and is absent before) | | |

## 7. Reminders & notifications

| # | Test case | Result | Remarks |
|---|---|---|---|
| 7.1 | Drawer → Reminders → all 7 types listed | | |
| 7.2 | Time drum scrolls (12h + AM/PM) — no freeze | | |
| 7.3 | Set a reminder, then disable it via the × | | |
| 7.4 | Medicine reminder: add a medicine with a day pattern | | |
| 7.5 | Notification arrives at the right **local** time | | |
| 7.6 | Notification shows a real title, not just "STEADY" | | |
| 7.7 | Notification shows a channel label (e.g. "STEADY • Reminder") | | |
| 7.8 | Tapping a notification opens the right screen | | |
| 7.9 | Tapping from a **killed** app also deep-links correctly | | |
| 7.10 | Medicine notification names the actual medicine | | |
| 7.11 | System settings show all 8 channels, individually mutable | | |

## 8. Groups

| # | Test case | Result | Remarks |
|---|---|---|---|
| 8.1 | Drawer → Groups → intro screen | | |
| 8.2 | Create a group → invite code screen → copy/share works | | |
| 8.3 | Join by code on a second account | | |
| 8.4 | Leaderboard shows both members | | |
| 8.5 | Activity feed shows a log event; cheering works | | |
| 8.6 | A group push with `deep_link: group` opens the right group | | |

## 9. Forgot password

| # | Test case | Result | Remarks |
|---|---|---|---|
| 9.1 | Login → "Forgot password?" → enter email → confirmation | | |
| 9.2 | Reset email arrives (check spam) | | |
| 9.3 | Tapping the link opens the STEADY app, not a browser dead-end | | |
| 9.4 | App shows "Set a new password", not Home | | |
| 9.5 | Setting a new password succeeds | | |
| 9.6 | Sign out and back in with the NEW password works | | |

## 10. Account deletion — **use a throwaway signup, not your main account**

| # | Test case | Result | Remarks |
|---|---|---|---|
| 10.1 | Create a brand-new throwaway account | | |
| 10.2 | Settings → Account → "Delete account" row visible | | |
| 10.3 | Tapping it opens the confirmation modal | | |
| 10.4 | Delete stays disabled until exactly "DELETE" is typed | | |
| 10.5 | Confirming deletes and signs out to Welcome | | |
| 10.6 | Logging back in with that email fails | | |

## 11. Settings & legal

| # | Test case | Result | Remarks |
|---|---|---|---|
| 11.1 | Settings → About → "Privacy Policy" opens the live page **and it's the current version** | | |
| 11.2 | Settings → About → "Terms of Service" opens the current version | | |
| 11.3 | Editing profile fields and saving persists | | |
| 11.4 | Units toggle converts displayed values correctly (and survives a save round-trip) | | |

## 12. Navigation / general polish

| # | Test case | Result | Remarks |
|---|---|---|---|
| 12.1 | Profile drawer opens/closes smoothly from ☰ | | |
| 12.2 | Every drawer row reaches a real screen (only "Refer a Friend" is disabled) | | |
| 12.3 | "My Foods" opens the admin-ping sheet without crashing | | |
| 12.4 | Sign out returns to Welcome | | |
| 12.5 | Backgrounding and reopening doesn't lose state or crash | | |
| 12.6 | No raw developer errors surface anywhere in the UI | | |

---

## Summary

**Overall verdict:** _fill in — Ready for production build / Needs fixes first_

**Blocking issues found:**
- 

**Non-blocking issues / polish notes:**
- 

> Carried-over product asks (tracked in `STATUS.md`, not defects of this build):
> AI-driven onboarding instead of the manual flow; a first-run interactive chat on Home
> that teaches the user what they can do; and the unreproduced "chat box coming up" issue
> — flagged high severity but with **no repro detail recorded**, so it needs a repro
> before it can become a test case.

---

# E2E (Maestro)

Flows live in `.maestro/`. Run them from **native Windows**, not WSL2 — WSL2 has no USB
passthrough for adb.

```bash
RUN_ID=$(date +%s)
maestro test -e RUN_ID=$RUN_ID .maestro/signup-onboarding-home.yaml
maestro test -e RUN_ID=$RUN_ID .maestro/login.yaml
```

## Facts learned the hard way — do not re-derive these

- **`launchApp: { clearState: true }` FAILS on locked-down OEM adb shells** (confirmed on
  OPPO/ColorOS): `SecurityException: … does not have permission CLEAR_APP_USER_DATA`.
  Neither flow uses it. Don't add it back. The signup flow is instead defensively
  self-sufficient — a `runFlow: { when: { visible: "kcal" } }` block signs out only if the
  app happens to already be on Home.
- **Maestro's YAML is not what you'd guess by analogy.** `assertVisible` does **not** take
  a `{text, timeout}` object. For a timed wait use `extendedWaitUntil: { visible: …, timeout: … }`.
  Always run `maestro check-syntax <file>` first — it's instant and catches this for free.
- **There are no `testID` props anywhere in this app.** Selectors must be exact visible text,
  or a position selector for icon-only buttons: `tapOn: { point: "9%, 8%" }` for the Home
  hamburger, which has no accessibility label either.
- **`pressKey: enter` doesn't submit the composer** — `multiline: true` wins over
  `onSubmitEditing`. Tap the send coordinate instead.
- **Interpolated text can't be matched.** A `{expression}` inside a `<Text>` creates separate
  nodes; `DatePickerSheet`'s always-mounted `maxHeight` wrapper and HomeScreen's nested
  calorie `<Text>` both resist assertion.
- ⚠️ **Test data safety: `preview` and `production` point at the SAME Supabase project.**
  There is no separate test backend. E2E runs against real production data using throwaway,
  uniquely-timestamped accounts (the `RUN_ID` mechanism). Don't create a separate Supabase
  project unless asked.

## Confirmed screen text (exact strings, for writing new flows)

**WelcomeScreen**: `"Get Started"` (→ Signup), `"I already have an account"` (→ Login).

**SignupScreen**: placeholders `"Full name"`, `"Email address"`, `"Password"`. Button `"Create Account"` (→ `"Creating account…"`). Google button `"Continue with Google"`.

**LoginScreen**: placeholders `"Email address"`, `"Password"`. Button `"Log In"` (→ `"Logging in…"`). `"Forgot password?"` (→ `"Sending…"`).

**Onboarding** (6 screens, all end with `"Continue"`):
- Goal: `"Lose weight"`, `"Gain weight"`, `"Maintain weight"`, `"Build muscle"`.
- Stats: drum pickers (Age, Weight, Height) — **not** text inputs, don't `inputText` them.
- Target weight: drum + chips `"1 month"`, `"3 months"` (default), `"6 months"`, `"1 year"`. Secondary `"Not sure yet — skip"`.
- Activity: `"Desk life"`, `"Light mover"`, `"On my feet"`, `"Very active"`, `"Athlete mode"`.
- Diet: multi-select chips (`"Vegetarian"`, `"Vegan"`, …). Secondary `"No restrictions"`. Primary is dynamic: `"Continue"` or `"Continue (N selected)"`.
- Reveal: wait for `"kcal / day"` (count-up animation), labels `"Protein"`/`"Carbs"`/`"Fat"`, final button `"Let's start! →"`.

**HomeScreen**: menu button is icon-only — use a position selector. Streak chip `"🔥 N days"`. Calorie summary `"N  /  N kcal"`. Composer placeholder varies by state. No send-button text.

**ProfileDrawer** rows (exact casing): `"Progress Charts"`, `"Weight"`, `"Water"`, `"Body Measurements"`, `"My Foods"`, `"Reminders"`, `"Groups"`, `"Refer a Friend"`, `"Settings"`, `"Help & Support"`, `"Go Premium"`, `"Sign Out"`.

**WaterScreen**: title `"Water"`. Chips `"100 ml"`/`"250 ml"`/`"350 ml"`/`"500 ml"`. Input `"e.g. 250"`. Button `"Log"`.

**WeightScreen**: title `"Weight"`. Section `"Log today's weight"`. Input `"e.g. 75"`. Note `"Add a note (optional)"`. Button `"Log"`.
