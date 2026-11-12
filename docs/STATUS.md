# STEADY — Status Tracker

> **The single source of truth for what's built, what's pending, and what's broken.**
> Tick rows as they change. Every row cites a `file:line` or migration number so any claim
> can be re-checked in seconds. `DEVLOG.md` tells the story; this file tracks the state.
>
> **Last full audit:** 2026-09-02 · database (47 migrations + 7 Edge Functions), all MD files, and the whole `src/` tree.

## Status key

| Key | Meaning |
|---|---|
| ✅ | Done and working |
| 🟡 | Partly built — works, but a piece is missing |
| 🔴 | Broken |
| ⬜ | Not built |
| ⏸ | Deferred on purpose |

Every table below uses the same four columns: **Item · Status · Where · Next action**.
`Next action` is `—` on ✅ rows, so your eye goes straight to what's left.

---

## 1 · Snapshot

| Item | Status | Where | Next action |
|---|---|---|---|
| Release stage | 🟡 | Play closed test | Production-access questionnaire submitted 2026-08-20 — **outcome not recorded anywhere** |
| Users | ✅ | ~36 accounts, ~21 with real devices | — |
| Notification reach | ✅ | 21 users reachable (token + timezone) | — |
| TypeScript (`npx tsc --noEmit`) | ✅ | Exits 0 (2026-11-12) | — Deno functions and `scripts/` are excluded; shared server code imported by unit tests is still checked |
| Tests (`npx jest`) | ✅ | 215 pass · 1 skip · 1 fail | The 1 failure is a known flake (`SettingsScreen` §1.5.2, timeout under parallel load, passes standalone) |
| Database | ✅ | 47 migrations · 26 tables · 41 functions · 12 triggers · 4 cron jobs · 0 views | — |
| RLS coverage | ✅ | All 26 tables have RLS enabled | Table-level RLS is solid; **the gap is function `EXECUTE` grants** — see P0 #1 and #2 |
| Uncommitted work | ✅ | Committed and pushed 2026-10-26 and 2026-11-12 | — v1.2 work is on branch `v1.2-accuracy` |

---

## 2 · Features

### Auth & onboarding

| Item | Status | Where | Next action |
|---|---|---|---|
| Email sign-up / sign-in | ✅ | `authStore.ts`, `SignupScreen`, `LoginScreen` | — |
| Google Sign-In | ✅ | `googleSignIn.ts` | Fixed 2026-08-04 (Play app-signing SHA-1). Both Android OAuth clients needed — Play + EAS |
| Apple Sign-In | 🟡 | `authStore.ts`, `app.json:14` | Code ready; **bundle ID not yet added to Supabase's Apple provider** — every iOS sign-in will fail on `aud` mismatch |
| Forgot password + deep link | ✅ | `SetNewPasswordScreen`, `authStore.ts` | — |
| Email confirmation / OTP | ⏸ | `.claude/plans/email.md:18` | Off for v1 by decision. All 4 steps must ship together |
| 6-screen conversational onboarding | ✅ | `src/screens/onboarding/` | — |
| TDEE / macro targets | ✅ | `utils/tdee.ts` (20 tests) | — |
| Account deletion | ✅ | `delete-account` Edge Function | — |

### Food logging (the core loop)

| Item | Status | Where | Next action |
|---|---|---|---|
| AI text logging | ✅ | `log-food-from-text` (805 ln, 8-tool agent loop) | — |
| AI photo logging | ✅ | `analyze-food-photo` (482 ln, GPT-5 mini) | — |
| Nutrition-label photos | ✅ | `analyze-food-photo:69-94` (CASE 2) | — |
| Low-confidence clarification | 🔴 | `analyze-food-photo:255-262` | See P1 #6 — the AI's question is swallowed |
| Conversational Q&A (non-logging) | ✅ | `log-food-from-text` `type: 'answer'` | — |
| Macro resolution ladder | ✅ | `_shared/macroResolver.ts` — cache → fuzzy → USDA → AI | — |
| Indian food seeds (INDB + IFCT) | ✅ | `scripts/seed-indb.ts`, `024` | — |
| Portion correction from USDA measures | ✅ | `023`, `macroResolver.ts:147` (9 tests) | — |
| Edit meal (rescale vs re-resolve) | ✅ | `foodLogStore.ts:369` | — |
| Delete meal | ✅ | `027` CASCADE + recompute trigger | — |
| Change meal date/time | ✅ | `ChangeDateTimeSheet.tsx` | — |
| Adjust macros manually | ✅ | `AdjustMacrosScreen.tsx` | — |
| Saved entries (re-log without AI) | ✅ | `014`, `savedEntriesStore.ts` | — |
| Meal photo thumbnails + viewer | ✅ | `ImageViewerModal.tsx` | — |
| Swipe-to-delete on meal cards | ⬜ | `foodLogStore.ts:517` has an unused `deleteEntry` | Roadmap 3.5. Deletion works via the options sheet |
| **Logging accuracy** | 🟡 | `scripts/eval/` | **v1.2 baseline (2026-11-12, dataset-v4 held out, ×3 repeats, live `log-food-from-text`):** 73.7% strict · 76.3% calories in band · **median error 19.9%** · lean −5.4% overall (drinks −37%, raw −22%, western +10%) · protein median error 16.5% · **consistency 75.3%** (the first log of a food is often different, then the shared cache freezes it) · p50 3.2 s / p95 7.0 s · ~$0.0005 per log · 2 HTTP errors. Note: eval runs write into the shared `food_items` cache until Phase 3 lands. **After Phase 3 (live 2026-11-12 12:31 UTC; same dataset, ×3, memory cold):** 72.6% strict · 78.3% calories in band · median error 22.2% · lean −2.4% (Indian +9.6%, from portion sizes like "3 dhoklas" = 180 g; that's Phase 5's job) · protein error 15.4% · consistency 78.3% cold, **100% with memory on** · p50 4.7 s / p95 7.9 s cold (3.25 s p50 warm) · ~$0.0007 per log · 0 unsure · 3 errors (2 known 422 refusals, 1 transient empty response). The baseline was helped by matches earlier eval runs had cached into the shared table; the cold run has no such help. |
| `ai_confidence` / `macro_source` | 🟡 | Written on every entry, read by nothing | Surface in the UI — a "low confidence, tap to adjust" affordance, and USDA-verified vs AI-guessed |

### Water · Weight · Body

| Item | Status | Where | Next action |
|---|---|---|---|
| Water logging | ✅ | `WaterScreen.tsx`, `waterStore.ts`, `009` | — |
| Weight logging + profile sync | ✅ | `WeightScreen.tsx`, `weightStore.ts` | — |
| Body measurements (7 fields) | ✅ | `BodyMeasurementsScreen.tsx` | — |
| Input bounds validation | 🟡 | `bodyMeasurementsStore`, `weightStore` | No client-side bounds check — a negative waist saves as-is (`TEST_SCENARIOS.md` 6.7, 7.6) |

### Progress & profile

| Item | Status | Where | Next action |
|---|---|---|---|
| Progress screen + weekly charts | ✅ | `ProgressScreen.tsx` (723 ln) | — |
| Adaptive TDEE estimate | ✅ | `tdeeStore.ts` | — |
| Data-driven insights | ✅ | `utils/insights.ts` | — |
| Streaks | ✅ | `042` — derived from `meal_logs`, gaps-and-islands | Fixed 2026-08-13. **No streak trigger had ever existed** — it was decoration since day one |
| Profile drawer | ✅ | `ProfileDrawer.tsx` | — |
| Settings (profile, units, macros) | ✅ | `SettingsScreen.tsx` (1426 ln, 25 tests) | — |
| Avatar upload | ⬜ | `ProfileHeaderCard.tsx:42` renders `avatar_url` only | Needs a Storage bucket + RLS policies first |
| My Foods | ⬜ | `ProfileDrawer.tsx:51` → admin-ping easter egg | Roadmap 6.7 |

### Reminders & notifications

| Item | Status | Where | Next action |
|---|---|---|---|
| 7 reminder types | ✅ | `RemindersScreen.tsx:20-28` — workout · meal · water · walking · weight · healthLog · medicine | — |
| Per-medicine day patterns + names | ✅ | `022`, `046`, `047` | — |
| Event system (33 events, 225 templates) | ✅ | `034`–`047`, `NOTIFICATIONS.md` | Reach went from 1 user to 21 without anyone updating the app |
| Clock reminders (48 templates) | ✅ | `035`, `find_due_reminders` (`029`) | — |
| Adaptive send-time | ✅ | `033` — personal peak → population prior → default | — |
| Quiet hours (08:00–21:00 local) | ✅ | `send-scheduled-notifications:359-360` | — |
| Daily cap / 90-min gap | ⏸ | `045`, removed 2026-09-02 | Removed by decision. Only quiet hours + the dormant carve-out limit volume now |
| Android channels (8) | 🟡 | `pushNotifications.ts:140-149`, `037` | Capability-negotiated; only works for users on a new build |
| Push receipts + dead-token pruning | ✅ | `044` | — |
| Tap tracking (`opened`) | 🟡 | `pushNotifications.ts:215-227` | Code complete, both cold and warm paths. **Needs an EAS build to prove** — Expo Go can't receive push |
| Deep links | 🟡 | `navigationRef.ts:29-43` | All 9 server values resolve. But `camera`/`chat` both land on Home with no intent, and `group` passes no id — see P1 #7 |
| Tone locking | 🟡 | `preferred_tone` read in 3 places, **written nowhere** | Permanently stuck in the 20% explore branch. Needs open data, which needs the build |
| `group_never_opened` event | 🔴 | `043` | RPC, column, enqueuer and hourly cron all exist — **`mark_group_opened` has no caller in `src/`**. 7 templates unreachable |
| `{{weight_change}}` | 🔴 | `036:272-277` | See P0 #3 |
| Group nudge | ⬜ | `groupStore.ts:364-372` | Throws "coming soon" **and has no UI caller**, so its demand-signal event reads zero |

### Groups

| Item | Status | Where | Next action |
|---|---|---|---|
| Create / join by code / invite | ✅ | `019` (5 tables, 15 RPCs), 5 screens | — |
| Leaderboard + activity score | ✅ | `get_group_leaderboard`, `get_group_activity_score` | — |
| Activity feed + cheers | ✅ | `019` | — |
| Privacy model (no nutrition shared) | ✅ | `group_daily_activity` — `did_log`, `meal_count` only | — |
| Group challenges | ⬜ | `GroupHomeScreen.tsx:141` "Coming soon" | User-visible placeholder card |
| `record_group_milestone` | 🔴 | `019:447`, granted, **never called** | `streak_milestone` and `goal_hit` never enter the feed |

### Analytics

| Item | Status | Where | Next action |
|---|---|---|---|
| PostHog + typed event registry | ✅ | `utils/analytics.ts` — 71 events, compile-time checked | — |
| Privacy boundary | ✅ | `ErrorReason` closed union; body metrics bucketed | No raw health data or free text leaves the device |
| Screen views | ✅ | `RootNavigator.tsx:51-56` | — |
| Outcome events | ✅ | 104 `track()` call sites across `src/` | — |
| `chat_message_sent` | 🔴 | Only call site is a dead screen | See P1 #8 — **no measure of chat volume at all** |
| `photo_discarded` | 🔴 | Control exists at `HomeScreen.tsx:998`, no `track()` | Add it — the photo funnel has a hole |
| `settings_row_tapped` | 🔴 | Declared `analytics.ts:199`, zero call sites | Wire or remove |
| Intent events on Groups / Reminders / Progress | 🟡 | 0 interaction events on 5 group screens + 2 reminder screens | Outcomes are covered via stores; intents aren't. `ProgressScreen`'s "Update goal" CTA fires nothing |

---

## 3 · Broken — P0 · fix before the next release

**All five are server-side only. No app rebuild needed.**
**2026-11-12: all five fixed by migrations `048` and `049`.** Verified live: logged-out probes are refused (`42501`), `ai_logs` exists, and cron and the sender run clean. One check is still open: confirm that a due medicine reminder still renders names, because no reminder was due at verification time.

| # | Item | Status | Where | Next action |
|---|---|---|---|---|
| 1 | **`medicines_due_at` leaked other users' medicine names** (live check: callable even when **logged out**) | ✅ | `048` | — Now `service_role` only. |
| 2 | **`enqueue_event` let anyone notify anyone** | ✅ | `048` | — Ten server-only definer functions now `service_role` only, including `pick_send_hour` / `user_activity_by_hour`, which leaked any user's active hours. New functions no longer default to public. |
| 2b | **`build_user_state` readable by logged-out callers** (found while verifying 048: the `auth.uid() IS NOT NULL AND …` guard lets NULL through) | ✅ | `049` | — Now `service_role` only. No app function is callable logged-out. Known minor leak left: `is_group_member` / `is_group_admin` (RLS needs them; revisit with Groups). |
| 3 | **`{{weight_change}}` has no producer** | 🟡 | `048` | `weight_milestone` switched off, so nothing broken ships. **v2.0 notification rework:** render `notification_events.payload` into the template vars, then turn it back on. |
| 4 | **`on_weight_logged` treated a NULL goal as "gaining"** | ✅ | `048` | — Also noted: `build_muscle` users (14 of 36) never get weight milestones. Decide in the v2.0 notification rework. |
| 5 | **`ai_logs` never existed** (history said 015 was applied; `to_regclass` returned NULL) | ✅ | `048` | — Created, with 30-day retention (`ai-logs-retention` cron). Every AI call is now logged for cost, latency and errors. |

---

## 4 · Broken — P1 · needs an app rebuild

| # | Item | Status | Where | Next action |
|---|---|---|---|---|
| 6 | **Photo AI clarification swallowed** | 🔴 | `foodLogStore.ts:335` | Server returns `{ success:false, type:'needs_clarification', message }`; the client reads `data?.error`, which that response doesn't contain. The user sees a generic "Photo analysis failed" instead of "is that dal or sambar?". The whole CASE 3 branch of the vision prompt is dead in practice. |
| 7 | **`GroupHome` strands groupless users** | 🔴 | `GroupHomeScreen.tsx:100-107` | `navigateToDeepLink` passes no params (`navigationRef.ts:62`), so a `deep_link: 'group'` push (24 seeded) arrives with `groupId` undefined and falls back to `activeGroupId`. For a user in zero groups that stays null → permanent spinner, **and no back button**, because the header sits inside the `groupId && group` branch. |
| 8 | **`chat_message_sent` never fires** | 🔴 | `FoodLogChatScreen.tsx:132` | Its only call site is a dead screen. `HomeScreen.handleSend` — the real composer — never fires it, so the app measures successful logs but not attempts. Every failed, abandoned or question turn is uncounted. |
| 9 | Deep links `camera` / `chat` have no intent | 🟡 | `navigationRef.ts:29-43` | Both resolve to `Home` with the camera closed and the composer unfocused. `camera` is the highest-volume deep link in the system (88 seeds) and is currently a no-op for anyone already on Home. |
| 10 | Cold-start opens can double-count | 🟡 | `App.tsx:97` | Effect deps are `[session?.user]`; if the session object identity changes, `getLastNotificationResponseAsync()` replays the same response. The DB is safe (`032:41` guards on `status <> 'opened'`) but the PostHog event fires again with `recorded: false`, which the schema defines as meaning something else. |

---

## 5 · On-device verification debt

Seven fixes from the 2026-08-04 round are marked 🧪 in the archived `BUG.md` — written and shipped, never confirmed on a device.

| # | Item | Status | Where | Next action |
|---|---|---|---|---|
| 8 | Composer phantom padding after keyboard closes | 🧪 | `HomeScreen` composer | Confirm on-device |
| 9 | Options menu behind the Android nav bar | 🧪 | `MealCard` sheet, `ConfirmSheet` (6 call sites) | Confirm on-device |
| 11 | Photo not shown in the sent message | 🧪 | chat message type | Confirm on-device |
| 12 | Meal-card image not tappable | 🧪 | `ImageViewerModal` | Confirm on-device |
| 13 | No confirmation after "Add to saved entries" | 🧪 | `toastStore` + `ToastHost` | Confirm on-device |
| 14 | Weekly average message hardcoded | 🧪 | `describeWeeklyAverages()` | Confirm on-device |
| 16 | Push notifications went to Expo Go | 🧪 | FCM in build 11 | Install, then **purge stale tokens**: `DELETE FROM public.device_push_tokens;` — no record this was ever run |

---

## 6 · Dormant / half-wired

| Item | Status | Where | Next action |
|---|---|---|---|
| `mark_group_opened` never called | 🔴 | `043:126`, type at `database.ts:1347` | Call it when a group screen opens — then `group_never_opened` switches itself on |
| `preferred_tone` written nowhere | 🟡 | read at `send-scheduled-notifications:80`, `:472` | Close the loop that `030`/`032` were built to enable |
| `reset_daily_usage_limits` | 🔴 | `003:126`, `018:15` | Defined twice, **scheduled zero times**. With `usage_limits` never read or written after signup, the whole free-tier quota feature is inert |
| `record_group_milestone` | 🔴 | `019:447` | Granted, never called |
| `nudgeMember` | ⬜ | `groupStore.ts:364` | No UI caller; its TODO claims push infra "doesn't exist yet" — it shipped in `034`–`047` |
| Vault secrets not in any migration | 🟡 | `025:34-37` | `edge_function_url` and `service_role_key` are created by hand. A fresh environment running 001–047 gets a cron job that resolves to NULL and fails silently forever |
| `admin-send-notification` drifted | 🟡 | `admin-send-notification:130` | Hardcodes `title: 'STEADY'`, interpolates only `{{streak_days}}`, sends no `log_id` (so admin sends are untrackable) and no `ticket_id` |
| `generate-template-variants` will fail | 🔴 | `:61-66`, `:81-83` | Inserts no `tone`/`title`, and its prompt says nothing about em-dashes while `034:188-190` adds `CHECK (variant_text !~ '[—–]')`. One em-dash fails the whole batch |
| `get_water_intake` uses UTC | 🟡 | `log-food-from-text:601-611` | Filters `logged_at` by UTC day while everything else uses the user's local `logged_date` — wrong day's water for an India user |

---

## 7 · Dead code

| Item | Status | Where | Next action |
|---|---|---|---|
| `FoodLogChatScreen.tsx` | 🔴 | 470 lines, in no navigator, imported nowhere | Delete. Superseded by the inline chat in `HomeScreen`. Move `chat_message_sent` out first (P1 #8) |
| `foodLogStore.deleteEntry` | 🔴 | `:517` | No caller — was for the never-built swipe-to-delete |
| `adminPingStore.fetchCount` | 🔴 | `:20` | No caller |
| `'unavailable'` ErrorReason branches | 🔴 | `analytics.ts:351`, `errors.ts:118` | Only classify the unreachable `nudgeMember` throw |
| `@react-navigation/bottom-tabs` | 🔴 | `package.json:12` | Tab nav removed; dependency remains |
| Tables `usage_limits`, `user_food_preferences` | 🔴 | `001` | Zero references outside migrations and generated types |
| `notification_events.payload` | 🔴 | `034:108` | Written by two triggers, never selected — this is the direct cause of P0 #3 |
| `notification_preferences.quiet_hours_*` | 🔴 | `013:39-40` | Never written by the client; the real protection is hardcoded 08–21 |
| Duplicate streak hooks | 🟡 | `useStreak.ts` / `useStreaks.ts` | Identical 366-row query; both mount at once, so opening Progress from the drawer fires it up to 3× |
| `tsconfig.json` exclude | ✅ | `tsconfig.json` | — Added 2026-11-12; `tsc --noEmit` is now a green gate |
| Generated types | ✅ | `src/types/database.ts` | — Regenerated 2026-11-12, after `049` |

---

## 8 · Not built · deferred by decision

| Item | Status | Where | Why |
|---|---|---|---|
| AI Nutritionist chat (streaming) | ⏸ | **Zero code exists** — `nutritionist` appears nowhere in the repo | v1.1. Core AI logging already works without it; streaming is a real feature, not a quick add |
| Manual food search (USDA UI) | ⏸ | `_shared/usda.ts` is server-side only | Phase 5 |
| Barcode scanning | ⏸ | — | Open Food Facts **actively rejected**: 5 of 6 queries returned 503, and it matched "maggi noodles" to *Fromage Blanc Nature*. Plus ODbL licence contamination |
| Monetization / RevenueCat | ⏸ | — | v1 ships fully free. `ProfileDrawer` shows "You're already premium 💛" instead |
| Refer a Friend | ⏸ | `ProfileDrawer.tsx:54` | Rendered disabled. The only remaining `comingSoon` row |
| Journal tab | ⏸ | Removed 2026-07-03 | Was a bare stub in a main tab slot. `DatePickerSheet` covers past-day browsing |
| Offline handling | ⬜ | — | Roadmap 8.3 |
| Accessibility labels | ⬜ | — | **No `testID` props anywhere in the app** — also blocks E2E selectors |
| Voice input · Meal plan screen | ⏸ | — | v2 |

### Product asks from testing (not defects)

| Item | Status | Where | Next action |
|---|---|---|---|
| AI-driven onboarding | ⬜ | Shivam, `TESTING.md` test round | Replace the 6-screen manual flow with a chat-based one the AI drives end to end |
| First-run interactive chat on Home | ⬜ | Shivam, `TESTING.md` test round | On first arrival at Home, an interactive chat that teaches what the app can do and how |
| "Chat box coming up" issue | 🔴 | — | Flagged **high severity** but with no repro detail recorded. **Needs a repro before it can be fixed or tested** |

---

## 9 · Release blockers

### Google Play (the live track)

| Item | Status | Next action |
|---|---|---|
| Production-access questionnaire | 🟡 | Submitted 2026-08-20 — **record the outcome here when it lands** |
| Store screenshots | ⬜ | Roadmap 9.1 |
| Listing copy (title, short + full description) | ⬜ | Roadmap 9.2 |
| Privacy / T&C pages | 🔴 | `TESTING.md:101`: *"We strongly needs to work again on the privacy and T&C pages all over again this is not the correct at all"* |
| `steady-legal` shared stylesheet | 🟡 | Written, **not pushed** — the live site still has drifted per-page CSS |
| Supabase Authorized Client IDs | ⬜ | Add both Android client IDs. Safety net for Android; matters more for iOS |
| Purge stale push tokens | ⬜ | `DELETE FROM public.device_push_tokens;` after the FCM build is live |

### iOS

| Item | Status | Next action |
|---|---|---|
| Apple Distribution Certificate | 🔴 | **Hard blocker.** Needs your Apple ID password + a 2FA code on your phone. One-time — EAS stores it after that |
| Apple provider bundle ID | 🔴 | Add `com.steadyapp.steady` to Supabase → Auth → Apple → client IDs, or **every** Apple sign-in fails on `aud` mismatch |
| App Store Connect setup | ⬜ | No record of an Apple Developer account anywhere |
| iOS screenshots (6.7") | ⬜ | Deferred until after the Android launch |

---

## 10 · Testing gaps

| Item | Status | Where | Next action |
|---|---|---|---|
| Unit + component suites | ✅ | 14 suites, 215 tests | — |
| `groupStore` (375 ln) | ⬜ | — | Zero tests. 14 analytics events, invite-code join, roles |
| `reminderStore` (335 ln) | ⬜ | — | Zero tests. This decides **what actually fires** — a bug here is silent and user-visible |
| `progressStore`, `tdeeStore` | ⬜ | — | Zero tests |
| `foodLogStore` | 🟡 | ~9% covered | Only `sumTotals` + `todayDate`. **Every network action is untested** — the core value proposition |
| `utils/insights.ts`, `utils/errors.ts` | ⬜ | — | Both pure functions — the cheapest possible test wins |
| Screens | 🟡 | 4 of 15 tested | `HomeScreen` (1339 ln) untested |
| Manual APK pass | 🔴 | `TESTING.md` | ~60% blank and pinned to a July build. Sections 2, 4, 5, 6, 7, 8, 10 have no results at all |
| Maestro E2E | 🟡 | `.maestro/` | Only 2 flows. The **7 more** written on the Windows machine (`DEVLOG.md:861-863`) never made it into this repo |
| Test data isolation | 🔴 | `TESTING.md` § E2E | **Preview and production point at the same live Supabase project.** Every E2E run writes to production, using throwaway timestamped accounts |

---

## 11 · Doc drift register

| Date | Change |
|---|---|
| 2026-09-02 | `STATUS.md` created as the single source of truth — 14 root MD files became 9. |
| 2026-09-02 | Removed (tracked, recoverable from git history): `ROADMAP.md`, `NOTES.md`, `WINDOWS_HANDOFF.md`. |
| 2026-09-02 | Archived to `docs/archive/`: `BUG.md`, `BUG_FIX.md`, `WHATTODO.md` — **moved, not deleted**, because all three were untracked and deletion would have been permanent. |
| 2026-09-02 | `TESTING.md` reset to a blank per-build checklist and absorbed the Maestro selectors + E2E facts from `WINDOWS_HANDOFF.md`. |
| 2026-09-02 | `README.md` corrected (5-tab nav and 7-step onboarding removed, roadmap checkboxes fixed); `BUILD.md` repointed here; `.claude/plans/notifications.md` no longer claims "nothing here is built yet"; `.claude/memory/project_steady_vision.md` marked which original decisions were later reversed. |
| 2026-09-02 | `NOTIFICATIONS.md` catalogue regenerated. Fixed `scripts/gen-notification-docs.py` first — it was the source of the stale "⚠️ Not wired up" labels on `group_member_joined` and `weight_milestone`, both wired by migration 043. |
| 2026-11-11 | All docs moved under `docs/` (index in `docs/README.md`): `STATUS.md`, `BUILD.md`, `NOTIFICATIONS.md` at `docs/`; `DEVLOG.md` and `LEARNING.md` in `docs/journal/`; `TESTING.md` and `TEST_SCENARIOS.md` in `docs/testing/`; `reports/` and `research_notes/` became `docs/research/reports/` and `docs/research/notes/`. Path references repointed, including `scripts/gen-notification-docs.py`. Only `README.md` and `CLAUDE.md` stay at the root. |

**Archive:** `docs/archive/` holds the superseded trackers. `BUG.md` is worth keeping for its root-cause writeups and its "Verified NOT the cause" section, which exists to stop anyone re-investigating settled questions.

> **Why this file exists:** on 2026-08-04, `WHATTODO.md` claimed a Google Sign-In step was `[x]` done while `BUILD.md` §9 said `[ ]` not done. The on-device `DEVELOPER_ERROR` settled it — and the contradiction cost a full debugging session. Four status files disagreeing isn't a documentation problem, it's a defect source. Keep this one current, and delete rather than duplicate.
