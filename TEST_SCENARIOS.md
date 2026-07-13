# STEADY — Test Scenarios (Positive / Negative / Edge)

> This is the structured counterpart to the manual `TESTING.md` checklist. Where `TESTING.md`
> is a one-time pass against a specific APK build, this document is the durable spec: every
> scenario here is grounded in the actual current code (stores, screens, `utils/tdee.ts`) and
> tagged with which automation layer should cover it, per `LEARNING.md`'s testing-pyramid entry.
>
> **Layer key** — `Unit` = Jest, pure function, no app. `Component` = Jest + React Native Testing
> Library, one screen rendered headless. `E2E` = Maestro, drives the real installed app.
> `Manual` = not practically automatable (e.g. real Google account picker, real email inbox).

---

## 1. Authentication

### 1.1 Sign Up (email/password) — `SignupScreen.tsx` → `authStore.signUp`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 1.1.1 | Fill name + valid email + 8+ char password, tap Create Account | Positive | E2E | `signUp()` called, no alert, app swaps to onboarding once session exists (declarative nav, no explicit `navigate()`) |
| 1.1.2 | Leave full name blank, fill the rest | Negative | Component | Alert "Missing fields" — "Please fill in all fields." No network call made |
| 1.1.3 | Leave email blank | Negative | Component | Same "Missing fields" alert |
| 1.1.4 | Leave password blank | Negative | Component | Same "Missing fields" alert |
| 1.1.5 | Password exactly 7 characters | Negative | Unit/Component | Alert "Weak password" — "Password must be at least 8 characters." (boundary: 7 fails, 8 passes — check both) |
| 1.1.6 | Password exactly 8 characters | Edge | Component | Passes local validation, proceeds to `signUp()` call |
| 1.1.7 | All fields are only whitespace (`"   "`) | Negative | Component | `.trim()` on name/email/password makes this equivalent to empty — "Missing fields" alert |
| 1.1.8 | Sign up with an email that already has an account | Negative | E2E | Supabase returns an error; Alert "Sign up failed" shows `err.message` |
| 1.1.9 | Network offline during sign up | Negative | Manual | `supabase.auth.signUp` rejects; Alert "Sign up failed" with generic fallback text |
| 1.1.10 | Tap "Continue with Google" then cancel the browser sheet | Edge | Manual | No alert shown — code explicitly suppresses `error.message === 'User cancelled'` |
| 1.1.11 | Tap "Continue with Google", complete real flow | Positive | Manual | Requires a real Google account; not automatable — keep on the manual `TESTING.md` checklist |
| 1.1.12 | Tap Terms / Privacy Policy links | Positive | E2E (partial) | Opens `TERMS_URL` / `PRIVACY_URL` in the system browser — Maestro can assert the tap doesn't crash the app; verifying the *destination content* is manual (already flagged broken in `TESTING.md` §9.1–9.2) |
| 1.1.13 | Double-tap "Create Account" quickly | Edge | Component | Button is `disabled` once `isLoading` is true — second tap must not fire a second `signUp()` call |

### 1.2 Log In (email/password) — `LoginScreen.tsx` → `authStore.signIn`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 1.2.1 | Valid email + correct password | Positive | E2E | `signIn()` succeeds, app swaps to Home (or onboarding if `onboarding_complete` is false) |
| 1.2.2 | Blank email or blank password | Negative | Component | Alert "Missing fields" — "Please enter your email and password." |
| 1.2.3 | Correct email, wrong password | Negative | E2E | Alert "Login failed" — shows `err.message`, falls back to "Invalid email or password." |
| 1.2.4 | Email that has no account at all | Negative | E2E | Same "Login failed" alert — code does not distinguish "no such user" from "wrong password" (good: avoids account enumeration) |
| 1.2.5 | Email/password with leading/trailing spaces | Edge | Component | `.trim()` is applied to email only, not password — a password with a trailing space the user didn't intend would fail login (worth a regression test: type `"secret123 "` and confirm it's sent verbatim) |

### 1.3 Forgot Password — `LoginScreen.handleForgotPassword` → `authStore.requestPasswordReset`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 1.3.1 | Tap "Forgot password?" with email filled in | Positive | E2E | Alert "Check your email" with generic wording regardless of whether the account exists — deliberately doesn't leak account existence |
| 1.3.2 | Tap "Forgot password?" with email field empty | Negative | Component | Alert "Enter your email" — no network call made |
| 1.3.3 | Tap "Forgot password?" twice rapidly | Edge | Component | `resetLoading` guard returns early on the second tap — only one reset email is sent |
| 1.3.4 | Tap the reset link from the email | Positive | Manual | Opens `steady://reset-password#...`; `authStore.handleAuthDeepLink` sets `passwordRecovery: true`; `RootNavigator` must show `SetNewPasswordScreen`, not Home, even though a session now exists |
| 1.3.5 | Set new password, 6–7 chars | Negative | Unit/Component | `SetNewPasswordScreen` requires ≥6 chars (note: **different threshold than signup's 8** — worth flagging as a product inconsistency) — Alert "Password too short" |
| 1.3.6 | Password and Confirm fields don't match | Negative | Component | Alert "Passwords don't match" |
| 1.3.7 | Set new password successfully | Positive | Component + E2E | Alert "Password updated" is Component-tested (`SetNewPasswordScreen.test.tsx`); the full `passwordRecovery`-clears-and-navigates-to-Home journey still needs a real E2E pass since navigation-on-recovery-clear lives in `RootNavigator`, outside this screen |
| 1.3.8 | Tap "Cancel and sign out" on SetNewPasswordScreen | Edge | Component | Calls `signOut()` directly, bypassing the password change — must land back on Welcome, not leave a half-recovered session |
| 1.3.9 | Reset link opened cold (app not already running) vs. warm (app in background) | Edge | Manual | Per `LEARNING.md`'s deep-link entry, this is handled by two different code paths (`getInitialURL` vs. `addEventListener('url')`) — historically the kind of bug that only breaks one of the two states, so both must be tested independently |

### 1.4 Sign Out — `authStore.signOut`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 1.4.1 | Sign out from Settings/drawer | Positive | E2E | UI returns to Welcome screen **instantly** (local-first: state clears synchronously, network revoke happens in background) — no spinner/freeze |
| 1.4.2 | Sign out while offline | Edge | Manual | Local sign-out still succeeds; background `supabase.auth.signOut` fails silently (`console.warn` only) — user is not blocked or shown an error |
| 1.4.3 | Sign out, then sign back in as a different user on the same device | Edge | E2E | Food log store must be fully reset (`useFoodLogStore.getState().reset()`) — previous user's meals/totals must never flash for the new user |

### 1.5 Account Deletion — `authStore.deleteAccount` → `delete-account` Edge Function

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 1.5.1 | Type exactly "DELETE" and confirm | Positive | E2E (throwaway account only) | Edge Function deletes the auth user (cascades through all 11 tables) + storage photos; app signs out to Welcome |
| 1.5.2 | Delete button state before "DELETE" is typed exactly | Negative | Component | Button stays disabled for `"delete"`, `"DELETE "`, `"DELET"`, empty string — must be an exact case-sensitive match |
| 1.5.3 | Attempt login with the deleted account's email afterward | Negative | E2E | Must fail — account is truly gone, not just signed out |
| 1.5.4 | Edge Function call fails mid-flight (network drop) | Negative | Manual | `deleteAccount()` throws; local session must **not** be cleared if the server-side delete didn't confirm success (`data.success` check) — otherwise the user would look "signed out" while their account still exists |

---

## 2. Onboarding & Calorie/Macro Calculation — `utils/tdee.ts`

This is pure, dependency-free logic — the highest-value unit-test target in the whole app.

### 2.1 `calculateTDEE()`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 2.1.1 | Typical adult male, moderately active, lose_weight | Positive | Unit | BMR (Mifflin-St Jeor male formula) × 1.55 activity multiplier, minus 500 kcal, macros split 30/40/30 |
| 2.1.2 | Typical adult female, sedentary, maintain | Positive | Unit | Female BMR formula, ×1.2, +0 adjustment, 25/50/25 split |
| 2.1.3 | `sex: 'other'` | Edge | Unit | BMR = **average** of the male and female formulas (not a third formula) — this is an easy regression to silently break |
| 2.1.4 | Every `activity_level` value (5 total) | Positive | Unit | Multiplier table: sedentary 1.2 / lightly_active 1.375 / moderately_active 1.55 / very_active 1.725 / super_active 1.9 |
| 2.1.5 | Every `goal` value (4 total) | Positive | Unit | Adjustment table: lose_weight −500 / gain_weight +300 / maintain 0 / build_muscle +200, each with its own macro split |
| 2.1.6 | Very low BMR input (e.g. very low weight/height/high age) pushed through `lose_weight` | Edge | Unit | `calorieGoal` must floor at **1200** (`Math.max(1200, ...)`) — verify the floor actually engages, not just documents intent |
| 2.1.7 | Macro grams sum sanity check | Edge | Unit | `proteinG*4 + carbsG*4 + fatG*9` should reconcile to ~`calorieGoal` (±rounding) for every goal — catches a wrong calories-per-gram constant |
| 2.1.8 | Negative or zero weight/height (malformed profile data) | Negative | Unit | Function has no input guards — confirm what actually comes out (likely `NaN` or a nonsensical number) so we know whether a guard needs adding upstream |

### 2.2 `calculateAge()`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 2.2.1 | Birthday already passed this year | Positive | Unit | Simple year subtraction |
| 2.2.2 | Birthday **later** this year (hasn't happened yet) | Edge | Unit | Age must be one **less** than naive year subtraction — this is the `monthDiff < 0` branch |
| 2.2.3 | Birthday is today | Edge | Unit | Exact boundary of the `monthDiff === 0 && today.getDate() < dob.getDate()` check |
| 2.2.4 | Date of birth is in the future (bad data) | Negative | Unit | Confirm behavior is at least non-crashing (likely negative age) |

### 2.3 `estimateWeeksToGoal()` — source of the known "~37 weeks" bug in `TESTING.md`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 2.3.1 | `maintain` goal (`dailyAdjustment === 0`) | Positive | Unit | Returns `null` — UI shows "no deficit needed" message instead of a pace card |
| 2.3.2 | Current weight already within 0.5kg of goal weight | Edge | Unit | Returns `null` ("already at goal") even with a non-zero adjustment |
| 2.3.3 | **Regression case**: 65kg → 75kg goal, `gain_weight` (+300 kcal/day) | Edge | Unit | Currently returns **37 weeks** (`10kg × 7700 ÷ 300 ÷ 7`) — this is mathematically correct given a fixed +300/day surplus, but it's the exact input from the `TESTING.md` bug report ("I choose to gain the weight... in one month?"). The bug isn't the math — it's that `TDEEInput` has **no user-settable timeframe/deadline** at all, so any large weight delta with the fixed goal-adjustment table produces a number the user never asked for. Lock in today's output with a test so a future fix (e.g. adding a `deadline_date` input) is a deliberate, visible change, not a silent one. |
| 2.3.4 | Large deficit goal (e.g. 100kg → 60kg, `lose_weight`) | Edge | Unit | Confirms the same fixed-adjustment behavior on the other direction — sanity check before any deadline-aware rework |
| 2.3.5 | `dailyAdjustment` edge value very close to 0 but not exactly 0 (shouldn't occur given the current table, but guards against future goal types) | Edge | Unit | Should return a very large (not infinite/NaN) week count, not divide-by-zero |

### 2.4 Onboarding flow (screens)

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 2.4.1 | Complete all 6 onboarding steps in order | Positive | E2E | Ends on `OnboardingRevealScreen`; count-up animation reaches the calculated `calorieGoal`; tapping "Let's start!" calls `updateProfile({ onboarding_complete: true, ... })` and the app declaratively swaps to `AppNavigator` (no explicit `navigate()` — per `LEARNING.md`) |
| 2.4.2 | Reach RevealScreen with incomplete profile data (missing weight/height/DOB/activity/goal) | Negative | Component | `result` stays `null` → shows "Crunching the numbers…" spinner indefinitely instead of a crash or garbage numbers |
| 2.4.3 | Backgrounding the app mid-onboarding and resuming | Edge | Manual | Already flagged as a general regression risk in `TESTING.md` §10.6 |

---

## 3. Food Logging — Text (Chat) — `foodLogStore.logMealFromText`, `FoodLogChatScreen.tsx`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 3.1 | Type a clear meal description ("2 eggs and toast") | Positive | E2E | Edge Function returns `{type: 'log'}`; a new MealCard is appended to `meals`; `totals` recomputed via `sumTotals`; calorie ring updates |
| 3.2 | Ask a question instead of logging food ("was my breakfast healthy?") | Positive | E2E | Returns `{type: 'answer', reply, waterLogged}` — no MealCard created, chat shows the reply bubble instead |
| 3.3 | A question that also triggers a water log server-side | Edge | E2E | `waterLogged: true` in the response — per `LEARNING.md`'s "server-side writes are invisible" entry, the client must explicitly refetch water state on seeing this flag, or the water card silently goes stale |
| 3.4 | Empty string submitted (e.g. whitespace-only message) | Negative | Component | Should be blocked client-side before ever calling `logMealFromText` — verify the composer's send button/validation actually prevents this |
| 3.5 | Edge Function returns `success: false` | Negative | Unit (mock) | `logMealFromText` throws with `data.error` or "Logging failed" fallback; `isLogging` resets to `false`; `error` state is set |
| 3.6 | Edge Function network call rejects entirely | Negative | Unit (mock) | Same failure path — confirm `isLogging` doesn't get stuck `true` |
| 3.7 | Log two messages back-to-back quickly | Edge | Unit (mock) | Each call appends independently to `get().meals` — verify no lost update if the second call's `set()` reads stale `get().meals` (check for a race: both calls capture `meals` before either resolves) |
| 3.8 | Ambiguous/gibberish text ("asdf1234") | Negative | Manual | Depends entirely on the AI's classification — not deterministically testable client-side; document expected behavior (should ideally return `answer` asking for clarification, not fabricate food) |
| 3.9 | Very long message (near/at any server-side length limit) | Edge | Manual | No client-side length cap observed in the composer — confirm server behavior separately |
| 3.10 | Edit an existing meal's text via `editMealFromText` | Positive | Unit (mock) | Card is swapped **in place** at the same array index, `created_at` preserved from the original — feed order must not shift |
| 3.11 | Edit a meal and the AI reclassifies it as a question, not food | Negative | Unit (mock) | Throws "That didn't look like food — try describing what you ate." — the card must remain unchanged (edit is rejected, not silently emptied) |
| 3.12 | Manually override macros via AdjustMacrosScreen | Positive | Unit (mock) | `updateEntryMacros` patches only that one `food_entries` row; `totals` recomputed from the full local `meals` array afterward |
| 3.13 | Move a meal to a different date via "Change Date & Time" | Positive | Unit (mock) | If new date ≠ `selectedDate`, card is **removed** from the current feed (it'll reappear when navigating to that date); if new date === `selectedDate`, card stays with updated timestamp |
| 3.14 | Delete a meal | Positive | Unit (mock) | DB delete first, then local filter — confirm DB error prevents the local removal (no optimistic-then-rollback needed since it awaits first) |
| 3.15 | Delete the last remaining food entry inside a meal (not the whole meal) | Edge | Unit (mock) | `deleteEntry` filters out meals whose `entries.length` becomes 0 — the now-empty card should disappear entirely, not render as a blank card |

## 4. Food Logging — Photo — `foodLogStore.logMealFromPhoto`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 4.1 | Camera FAB → snap a real food photo | Positive | E2E | Opens OS camera; on capture, `analyze-food-photo` is called; resulting card shows the photo and reasonable macros |
| 4.2 | Gallery picker → choose an existing photo | Positive | E2E | Same success path via the picker instead of live camera |
| 4.3 | Photo of something that isn't food | Negative | Manual | AI-dependent outcome — document expected behavior (should fail gracefully, not fabricate a meal) rather than assert a specific value |
| 4.4 | Deny camera/gallery permission when prompted | Negative | Manual | App must not crash; should show some fallback/explanation rather than a silent no-op |
| 4.5 | Photo upload with a flaky/dropped connection mid-upload | Negative | Manual | `isLogging` must reset to `false` and `error` must be set — verify the composer doesn't stay stuck in a "logging…" state forever |
| 4.6 | Newly logged photo appears in the feed immediately | Positive | E2E | Per `LEARNING.md`'s signed-URL entry, the Edge Function returns a ready signed URL in its response so the card renders instantly, without waiting for a separate fetch — regression-test this specifically since it's a deliberate perf optimization that's easy to accidentally revert |
| 4.7 | Reopen the app later and view a day with photo meals | Positive | E2E | `fetchEntriesForDate` batch-signs all non-`http` photo paths in one `createSignedUrls` call — verify N photos in a day cost 1 signing call, not N |
| 4.8 | A photo path that's already an `http` URL (legacy data) | Edge | Unit (mock) | Must pass through unchanged, not get re-signed or break the batch call |

---

## 5. Water Tracking — `waterStore.ts`, `WaterScreen.tsx`, `WaterHomeCard.tsx`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 5.1 | Log a water entry from the Home card | Positive | E2E | Plain `insert` (not upsert) — appears in both `WaterHomeCard` and `WaterScreen` since both read the same store singleton |
| 5.2 | Log water multiple times in one day | Positive | Unit (mock) | Each call inserts a **new row** — daily total is the sum of all of today's rows, never overwritten |
| 5.3 | Log water while signed out / session missing | Negative | Unit | `addEntry` returns early (`if (!userId) return`) — no crash, no Alert, simply a no-op |
| 5.4 | Insert fails (DB error / offline) | Negative | Unit (mock) | `Alert.alert('Could not log water', ...)`, local `entries` unchanged |
| 5.5 | Delete a water entry that belongs to another user (shouldn't be reachable via UI, but as a defense check) | Negative | Unit (mock) | Delete query filters on `.eq('user_id', userId)` too — confirm a mismatched id genuinely no-ops rather than relying on RLS alone |
| 5.6 | Progress ring at 0%, 50%, 100%, and > 100% of goal | Edge | Component | Per `LEARNING.md`'s SVG entry, `strokeDashoffset` math — confirm over-100% doesn't produce a negative offset or visual glitch |

---

## 6. Weight Tracking — `weightStore.ts`, `WeightScreen.tsx`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 6.1 | Log today's weight for the first time today | Positive | E2E | Upsert inserts a new row; profile's `current_weight_kg` synced afterward |
| 6.2 | Log weight again later the same day | Edge | Unit (mock) | Upsert **overwrites** today's row (unique on `user_id, logged_date`) — entry count for today stays at 1, value updates |
| 6.3 | Profile sync (`updateProfile`) fails after weight log succeeds | Edge | Unit (mock) | Weight row is already saved and shown; the profile-sync failure is caught and only `console.warn`'d — must **not** throw up to the UI or roll back the weight entry |
| 6.4 | Switch chart range (7d / 30d / 90d) | Positive | Unit (mock) | Refetches with the correct `since` cutoff date for each range |
| 6.5 | Log weight while offline | Negative | Manual | `Alert.alert('Could not save weight', ...)` |
| 6.6 | Delete a weight entry | Positive | Unit (mock) | Local list filtered after successful DB delete |
| 6.7 | Log an implausible weight (e.g. 0, negative, or 500kg) | Negative | Unit | No client-side bounds-checking observed in the store — confirm what actually happens (likely saved as-is); flag as a validation gap if so |

---

## 7. Body Measurements — `bodyMeasurementsStore.ts`, `BodyMeasurementsScreen.tsx`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 7.1 | Log only one field today (e.g. just waist) | Positive | Unit (mock) | Per `LEARNING.md`'s spread-into-upsert entry: only the typed field's column is written; other fields already logged today for other measurements are **not** nulled out |
| 7.2 | Log a second field later the same day | Positive | Unit (mock) | Both fields now present on today's single row — confirms the partial-upsert doesn't clobber the first field |
| 7.3 | Log all 7 fields at once | Positive | E2E | All saved in one upsert call |
| 7.4 | Submit with all fields empty | Negative | Component | Should be blocked client-side (nothing meaningful to save) — verify the Save action actually guards this rather than sending an empty upsert |
| 7.5 | Switch chart range (30d / 90d / 1y) | Positive | Unit (mock) | Correct `since` cutoff per range |
| 7.6 | Negative or absurd values (e.g. `waist_cm: -5` or `9999`) | Negative | Unit | No bounds-checking observed — same class of gap as weight (6.7) |

---

## 8. Streak — `useStreak.ts`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 8.1 | User has logged calories every day for the last N days including today | Positive | Unit (mock) | Streak = N |
| 8.2 | User logged yesterday but hasn't logged anything yet today | Edge | Unit (mock) | Today is "forgiven" — streak counts from yesterday backward, doesn't drop to 0 just because today is still empty |
| 8.3 | User has a gap (e.g. logged Mon, Tue, skipped Wed, logged Thu) | Positive | Unit (mock) | Streak = 1 (just today/most-recent contiguous run), not 3 |
| 8.4 | Brand new user with zero logged days ever | Edge | Unit (mock) | Streak = 0, not `null` forever and not a crash on empty data |
| 8.5 | `refreshKey` changes right after the first log of the day | Positive | Component | Streak recalculates immediately without needing a full remount — this is the entire reason the hook takes a `refreshKey` param |
| 8.6 | Home screen streak chip vs. Profile drawer streak | Edge | Manual | `TESTING.md` §5.4–5.5 already calls out these must match — both should be reading the same hook/computation, not two divergent implementations |

---

## 9. Settings & Profile — `SettingsScreen.tsx`

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 9.1 | Edit name/height/weight/goals and Save | Positive | Component | Draft-state pattern (per `LEARNING.md`) — local edits only commit to the store/DB on explicit Save, not per-keystroke. Covered in `SettingsScreen.test.tsx`, mocked `updateProfile` — currently only asserts a single-field edit; a real Supabase round-trip is still worth one E2E pass |
| 9.2 | Open Settings, edit a field, then navigate away without saving | Negative | Component | Draft is discarded; store/DB values unchanged. Covered in `SettingsScreen.test.tsx` |
| 9.3 | Toggle metric ⇄ imperial units | Positive | Component | Displayed values convert correctly in both directions (round-trip: convert to imperial and back to metric should return the original, modulo rounding). Covered in `SettingsScreen.test.tsx` |
| 9.4 | Tap a "Coming soon" row (Progress Charts, Reminders, Groups, etc.) | Positive | Component | Shows the expected alert, does not crash or navigate anywhere. Covered in `SettingsScreen.test.tsx` |
| 9.5 | Tap Privacy Policy / Terms of Service | Negative | Manual | Currently known-broken per `TESTING.md` §9.1–9.2 (stale content, missing email) — regression-test once fixed |
| 9.6 | Delete account entry point from Settings | Positive | Component | Opens the confirmation modal (see §1.5). Covered in `SettingsScreen.test.tsx` |

---

## 10. Navigation & Session State

| # | Scenario | Type | Layer | Expected behavior |
|---|---|---|---|---|
| 10.1 | Cold app launch with a valid persisted session | Positive | E2E | Lands directly on Home, no flash of Welcome/Login |
| 10.2 | Cold app launch with no session | Positive | E2E | Lands on Welcome |
| 10.3 | Session exists but profile fetch is still in flight | Edge | Manual | Per `LEARNING.md`'s async-race entry — `isLoading` must stay true for the whole window so the navigator shows a spinner, never a blank screen |
| 10.4 | Tap a past date on the calendar sheet | Positive | E2E | Feed reloads for that date; the empty-state bubble must not flash before `isFetchingDate` resolves (`setSelectedDate` sets it true immediately) |
| 10.5 | Ask the AI a question while viewing a past date | Edge | Manual | Composer must not accidentally write today's date into a historical log — `TESTING.md` §6.3 already flags this as worth checking |
| 10.6 | Background the app, then resume | Edge | Manual | No state loss, no crash (`TESTING.md` §10.6) |
| 10.7 | Deep link opens the app while it's already running vs. cold | Edge | Manual | Two separate code paths (`getInitialURL` vs `url` event listener) — see 1.3.9 |

---

## Known issues already surfaced (from `TESTING.md`) — track as regression scenarios once fixed

- Onboarding pace estimate can show a demotivating/unexpected number for large weight-goal deltas (§2.3.3 above) — root cause identified: `TDEEInput` has no user-settable timeframe.
- First-time Home screen is missing an interactive onboarding chat walkthrough (product gap, not a code defect to unit-test — track as a feature).
- "Chat box coming up" issue flagged as high severity in `TESTING.md` but with no repro detail recorded — needs a repro before it can become an automated scenario.
- Privacy Policy / Terms of Service pages are stale/incorrect (§9.5 above).
- Splash tagline/icon/button placement polish (`TESTING.md` §1.4) — visual, not suited to Jest/Maestro assertions; keep on the manual checklist or add Maestro screenshot capture for human review.

---

## Automation coverage summary

| Layer | What it covers here | Where |
|---|---|---|
| Unit (Jest) | `utils/tdee.ts` (all of §2), full store logic with a mocked Supabase client: `authStore` (§1.1–1.5), `weightStore` (§6), `waterStore` (§5), `bodyMeasurementsStore` (§7), `useStreak` (§8.1–8.5) | `__tests__/unit/` |
| Component (Jest + RNTL) | Form validation on Signup/Login (§1.1, 1.2), Forgot Password (§1.3.1–1.3.3), SetNewPassword (§1.3.5–1.3.8), Settings & Profile (§1.5.2, §9.1–9.4, 9.6) | `__tests__/component/` |
| E2E (Maestro) | Full journeys: signup → onboarding → home, login, forgot password, text food logging, water/weight logging (marked "E2E" throughout); still the only layer for §9.1's real Supabase round-trip and §1.3.7's full recovery-navigation flow | `.maestro/` (not yet built) |
| Manual only | Real Google/Apple sign-in, real email delivery, AI-response-dependent outcomes, visual/splash polish | stays in `TESTING.md` |

**Known coverage gaps in the current Component suite** (found by adversarial verification, not yet closed):
- §9.1: `SettingsScreen.test.tsx` only exercises a single-field edit+save; multi-field edits and the imperial→metric unit-conversion-on-save path are untested.
- §1.3.3 / §1.1.13 (double-tap guards): tests confirm the *observable outcome* (only one call fires) but don't isolate whether the button's `disabled` prop or the handler's own internal guard is what's actually blocking the second call.
