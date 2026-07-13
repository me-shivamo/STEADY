# STEADY — Build Roadmap & Checkpoint Tracker

> Track every feature, milestone, and task as we build STEADY.
> Update status as work is completed. DEVLOG.md tells the story; this file tracks the progress.

---

## v1 MVP Scope Lock (2026-07-03)

> Decided after a full codebase audit against this roadmap. These calls define what "v1" means —
> everything else in this file outside the MVP list is explicitly deferred, not forgotten.

| Decision | Call | Why |
|---|---|---|
| Journal tab | **Cut entirely for v1** | Was a bare "Coming soon" stub sitting in the main tab bar — visible dead end on day one. Removed `JournalScreen.tsx`, the `Journal` tab, and its nav types rather than ship a stub. Re-add properly in v1.1+. |
| Monetization | **None for v1 — fully free** | No RevenueCat, no paywall, no `usePremium`. Ship free, monetize once there are real users. Phase 7 stays deferred as a whole. |
| AI Nutritionist Chat (Phase 4) | **Deferred to v1.1** | Core differentiator (AI food logging via chat + photo) already works without it. Streaming chat is a meaningfully-sized feature (Edge Function, SSE hook, system prompt, persistence) — not a "quick" v1 add. |

**App nav for v1 is 2 tabs: Home + Me.** (Was 3: Home / Journal / Me.)

---

## Status Key
| Symbol | Meaning |
|---|---|
| ✅ | Done |
| 🔄 | In progress |
| ⬜ | Not started |
| ⏸ | Deferred to later |

---

## Phase 0 — Before Code

| # | Task | Status | Date |
|---|---|---|---|
| 0.1 | Define product vision, UX, and tech stack | ✅ | 2026-06-12 |
| 0.2 | Build interactive design prototype (9 screens, `design/index.html`) | ✅ | 2026-06-17 |
| 0.3 | Lock in design decisions: palette, navigation, home screen layout | ✅ | 2026-06-17 |
| 0.4 | Understand security architecture (API keys → Edge Functions only) | ✅ | 2026-06-17 |
| 0.5 | Evaluate and confirm backend choice (Supabase Edge Functions) | ✅ | 2026-06-17 |

---

## Dev Overrides (must revert before shipping)

| # | Task | Status | Date |
|---|---|---|---|
| DEV-1 | ~~REVERT `RootNavigator.tsx` dev override~~ — N/A: verified `RootNavigator.tsx` already does real auth gating (session → onboarding → app); no override exists | ✅ | 2026-06-22 |

---

## Phase 1 — Foundation

| # | Task | Status | Date |
|---|---|---|---|
| 1.1 | Init Expo project (`blank-typescript` template) | ✅ | 2026-06-17 |
| 1.2 | Install all npm packages | ✅ | 2026-06-17 |
| 1.3 | Create `src/` folder structure + theme system | ✅ | 2026-06-17 |
| 1.4 | Get app running on physical device via tunnel | ✅ | 2026-06-18 |
| 1.5 | Create Supabase project + run DB migrations (3 files) | ✅ | 2026-06-18 |
| 1.6 | Generate TypeScript types from Supabase schema | ✅ | 2026-06-18 |
| 1.7 | Build `src/api/supabase.ts` (Supabase client) | ✅ | 2026-06-18 |
| 1.8 | Build `src/store/authStore.ts` (Zustand auth state) | ✅ | 2026-06-18 |
| 1.9 | Build Auth screens: Welcome, Login, Signup | ✅ | 2026-06-18 |
| 1.10 | Build `RootNavigator.tsx` (auth / onboarding / app split) | ✅ | 2026-06-18 |
| 1.11 | Google OAuth + Apple Sign In | ✅ | 2026-06-18 |
| 1.12 | Build 6-screen conversational onboarding flow | ✅ | 2026-06-20 |
| 1.13 | Build `src/utils/tdee.ts` (Mifflin-St Jeor TDEE calculator) | ✅ | 2026-06-20 |
| 1.14 | Dashboard shell + `CalorieRing.tsx` component | ✅ | 2026-06-20 |
| **🏁** | **Milestone: Sign up → onboarding → empty home screen with calorie ring** | ✅ | 2026-06-20 |

---

## Phase 2 — AI Food Logging (Core Feature)

> **Decision:** We're leading with AI chat logging — the user describes a meal in plain English,
> Claude extracts the food items and nutrition, and a card appears on the home screen.
> This is the core differentiator. Manual search and barcode scanning are deferred to Phase 5.

| # | Task | Status | Date |
|---|---|---|---|
| 2.1 | Deploy `log-food-from-text` Supabase Edge Function (Claude extracts foods + nutrition from natural language) | ✅ | 2026-06-20 |
| 2.2 | `src/store/foodLogStore.ts` (Zustand store — today's food entries, daily totals) | ✅ | 2026-06-20 |
| 2.3 | `MealCard.tsx` component (displays a logged meal in the home feed) | ✅ | 2026-06-20 |
| 2.4 | `FoodLogChatScreen.tsx` — chat UI → calls Edge Function → saves to Supabase → updates home feed | ✅ | 2026-06-20 |
| 2.5 | Wire `HomeScreen.tsx` feed to `foodLogStore` — replace empty state with real `MealCard` list | ✅ | 2026-06-20 |
| 2.6 | Deploy `analyze-food-photo` Supabase Edge Function (GPT-4o Vision via OpenRouter image key → food items + nutrition + Storage upload) | ✅ | 2026-06-24 |
| 2.7 | Inline camera flow in `HomeScreen.tsx` — camera FAB opens OS camera, photo thumbnail in composer, `logMealFromPhoto()` in `foodLogStore`, photo shown on MealCard | ✅ | 2026-06-24 |
| 2.7a | `supabase/migrations/005_meal_photos_bucket.sql` — `meal-photos` Storage bucket + RLS policies | ✅ | 2026-06-24 |
| **🏁** | **Milestone: Type a meal or snap a photo → AI logs it → card appears on home screen** | ✅ | 2026-06-24 |

---

## Phase 3 — Dashboard + Journal Polish

| # | Task | Status | Date |
|---|---|---|---|
| 3.1 | Connect `HomeScreen` CalorieRing + MacroRows to live `daily_summaries` + Supabase realtime | ✅ | 2026-06-24 |
| 3.2 | Animated CalorieRing fill + haptic feedback on food logged | ✅ | 2026-06-24 |
| 3.3 | `WaterCard.tsx` component + `water_logs` inserts | ⬜ | — |
| 3.4a | `DatePickerSheet.tsx` — home screen date picker: 7-day strip + animated month grid + month pills. Tap any past date → feed reloads with that day's logs. Composer stays for AI questions; no DB writes on past days. | ✅ | 2026-06-24 |
| 3.4 | ~~`JournalScreen.tsx` (full calendar screen)~~ — **Cut from v1.** Was a bare stub occupying a main tab slot; removed `JournalScreen.tsx`, the `Journal` tab, and its nav types entirely (2026-07-03). `DatePickerSheet` on Home already covers past-day browsing for v1. Revisit as a dedicated screen in v1.1+. | ✅ (cut) | 2026-07-03 |
| 3.5 | Swipe-to-delete on MealCards | ⬜ | — |
| 3.7 | MealCard options — Adjust Calories & Macros (manual per-food override form) | ✅ | — |
| 3.8 | MealCard options — Change Date & Time (move log to a different day) | ✅ | — |
| 3.9 | MealCard options — Add to Saved Entries (meal templates / favourites, needs `saved_meals` table) | ⬜ | — |
| 3.6 | DB trigger for `daily_summaries` auto-upsert (already built in migration 003) | ✅ | 2026-06-18 |
| **🏁** | **Milestone: Live dashboard data; Journal cut from v1, DatePickerSheet covers past-day browsing** | ✅ | 2026-07-03 |

---

## Phase 4 — AI Nutritionist Chat (deferred to v1.1)

> **Scope call (2026-07-03):** Core AI logging (chat + photo) already works without this.
> Not in v1 — revisit as the first thing after launch.

| # | Task | Status | Date |
|---|---|---|---|
| 4.1 | Deploy `chat-nutritionist` Edge Function (Claude claude-sonnet-4-6 with today's food context) | ⬜ | — |
| 4.2 | `useStreaming.ts` hook (SSE reader for streaming Claude responses) | ⬜ | — |
| 4.3 | Wire streaming into `FoodLogChatScreen.tsx` — AI replies appear word by word | ⬜ | — |
| 4.4 | `TypingIndicator.tsx` (3 animated dots while AI is thinking) | ⬜ | — |
| 4.5 | Persist chat messages to `chat_messages` table | ⬜ | — |
| 4.6 | System prompt: inject today's macros, goal, and dietary restrictions into every request | ⬜ | — |
| **🏁** | **Milestone: Real-time streaming AI nutritionist with personalized food context** | ⬜ | — |

---

## Phase 5 — Manual Logging (Barcode + Search)

> Added as a secondary logging method after the core AI flow is working.

| # | Task | Status | Date |
|---|---|---|---|
| 5.1 | `src/api/usda.ts` + `FoodSearchScreen.tsx` (debounced USDA food search) | ⬜ | — |
| 5.2 | `FoodDetailScreen.tsx` (nutrition display, quantity stepper, Add button) | ⬜ | — |
| 5.3 | `src/api/openFoodFacts.ts` + `BarcodeScreen.tsx` (scan barcode → log food) | ⬜ | — |
| **🏁** | **Milestone: All 3 logging methods (AI chat, photo, manual) working end-to-end** | ⬜ | — |

---

## Phase 6 — Progress + Profile

| # | Task | Status | Date |
|---|---|---|---|
| 6.1 | `WeightLogScreen.tsx` + `weight_logs` writes | ⬜ | — |
| 6.2 | `ProgressChartsScreen.tsx` (WeightChart + CalorieHistoryChart) | ⬜ | — |
| 6.3 | `MeasurementsScreen.tsx` | ⬜ | — |
| 6.4 | Profile UI — shipped as a **slide-out drawer** from the Home ☰ icon (`ProfileDrawer.tsx` + `ProfileHeaderCard`/`StatStrip`/`MenuRow`). Live: avatar/name/goal/kcal + Sign Out. Pending: avatar upload (Supabase Storage), live streak/stats, wiring menu destinations | 🔄 | 2026-06-22 |
| 6.5 | `SettingsScreen.tsx` — Profile, Body, Goals, Preferences (units toggle, name, sex, height, weight, goal type, activity, macros) | ✅ | 2026-06-23 |
| 6.6 | Profile photo upload — `expo-image-picker` + Supabase Storage bucket + `avatar_url` write. Deferred: needs Storage RLS policies and bucket setup before UI. | ⏸ | — |
| 6.7 | `MyFoodsScreen.tsx` (personalized food calibration) | ⬜ | — |
| **🏁** | **Milestone: Full progress tracking + profile working** | ⬜ | — |

---

## Phase 7 — Monetization (deferred past v1)

> **Scope call (2026-07-03):** v1 ships fully free, no paywall anywhere. Whole phase deferred —
> revisit once there are real users to monetize.

| # | Task | Status | Date |
|---|---|---|---|
| 7.1 | `usePremium()` hook + usage limit checks | ⬜ | — |
| 7.2 | Paywall modals at all trigger points | ⬜ | — |
| 7.3 | `SubscriptionScreen.tsx` (feature comparison + pricing) | ⬜ | — |
| 7.4 | RevenueCat (`react-native-purchases`) integration | ⬜ | — |
| 7.5 | `revenuecat-webhook` Edge Function → updates `subscription_tier` | ⬜ | — |
| **🏁** | **Milestone: Freemium gates enforced, paywall flows complete** | ⬜ | — |

---

## Phase 8 — Testing + Polish

| # | Task | Status | Date |
|---|---|---|---|
| 8.1 | Physical device testing on iOS + Android | ⬜ | — |
| 8.2 | Layout testing across screen sizes (SE, Pro Max, Android mid-range) | ⬜ | — |
| 8.3 | Offline handling (show cached Zustand data when network unavailable) | ⬜ | — |
| 8.4 | Performance pass (`React.memo`, `FlatList`, `useMemo`) | ⬜ | — |
| 8.5 | Accessibility labels on all touchable elements | ⬜ | — |

---

## Phase 9 — App Store Launch

> v1 targets **Google Play first** (per 2026-07-03 scope call). The tasks below marked
> "**blocker**" are confirmed missing from the repo as of the audit — none of these exist yet:
> no `eas.json`, no Android `package` identifier in `app.json`, no privacy policy anywhere in-repo.

| # | Task | Status | Date |
|---|---|---|---|
| 9.0a | `eas.json` build profile — preview (APK) + production (AAB, autoIncrement) profiles with EXPO_PUBLIC env vars baked in | ✅ | 2026-07-03 |
| 9.0b | Android `package` identifier `com.steadyapp.android` + `versionCode 1` set in `app.json` | ✅ | 2026-07-03 |
| 9.1 | Android screenshots for Play Store listing | ⬜ | — |
| 9.2 | Play Store listing copy (title, short description, full description) | ⬜ | — |
| 9.3 | Privacy policy + terms + delete-account pages written (`~/steady-legal`, committed) — **pending: Shivam pushes repo + enables GitHub Pages**; in-app links wired in Signup + Settings | 🔄 | 2026-07-03 |
| 9.3a | Clean app icon + adaptive icon + splash assets (regenerated guide-free with sharp; splash configured in app.json) | ✅ | 2026-07-03 |
| 9.4 | `eas build --profile production --platform android` | ⬜ | — |
| 9.5 | `eas submit --platform android` | ⬜ | — |
| **🏁** | **Milestone: STEADY v1 is live on Google Play** | ⬜ | — |

> iOS App Store submission (screenshots for 6.7" iPhone, `--platform ios`) deferred until after
> the Android v1 launch — not blocking Play Store.

---

## Analytics — PostHog Integration

> Track user behaviour, onboarding funnels, feature usage, and retention.
> PostHog Cloud free tier (1M events/month). SDK: `posthog-react-native`.

### Setup & Infrastructure

| # | Task | Status | Date |
|---|---|---|---|
| PH-1 | Install `posthog-react-native` SDK | ✅ | 2026-06-23 |
| PH-2 | Create `src/utils/posthog.ts` — initialize client with API key | ✅ | 2026-06-23 |
| PH-3 | Wrap app in `<PostHogProvider>` in `App.tsx` | ✅ | 2026-06-23 |
| PH-4 | Add PostHog API key to environment / Expo config | ✅ | 2026-06-23 |

### Identity & Session

| # | Task | Status | Date |
|---|---|---|---|
| PH-5 | `posthog.identify(userId)` on sign-in / session restore (`authStore`) | ✅ | 2026-06-23 |
| PH-6 | `posthog.reset()` on sign-out (`authStore`) | ✅ | 2026-06-23 |
| PH-7 | Set user properties on identify: `goal`, `diet_type`, `platform` | ⬜ | — |

### Core Events

| # | Event | Where | Key Properties | Status |
|---|---|---|---|---|
| PH-8 | `app_opened` | `RootNavigator` | `platform`, `app_version` | ⬜ |
| PH-9 | `sign_up` | `authStore.signUp` | `method` (email/google/apple) | ✅ | 2026-06-23 |
| PH-10 | `sign_in` | `authStore.signIn/Google/Apple` | `method` | ✅ | 2026-06-23 |
| PH-11 | `onboarding_step_completed` | Each onboarding screen | `step` (goal/stats/diet/activity/target/reveal) | ✅ | 2026-06-23 |
| PH-12 | `onboarding_completed` | `OnboardingRevealScreen` | `goal`, `diet_type`, `target_calories` | ✅ | 2026-06-23 |
| PH-13 | `meal_logged` | `FoodLogChatScreen` | `meal_type`, `calories`, `item_count` | ✅ | 2026-06-23 |
| PH-14 | `ai_chat_error` | `FoodLogChatScreen` | `error_message` | ✅ | 2026-06-23 |
| PH-15 | `weight_logged` | `WeightScreen` | — | ⬜ |
| PH-16 | `sign_out` | `authStore.signOut` | — | ✅ | 2026-06-23 |

### Future Events (add as features ship)

| # | Event | When to add | Status |
|---|---|---|---|
| PH-17 | `photo_analyzed` | Phase 2 (camera feature) | ⏸ |
| PH-18 | `food_search_used` | Phase 5 (manual logging) | ⏸ |
| PH-19 | `barcode_scanned` | Phase 5 (barcode) | ⏸ |
| PH-20 | `paywall_shown` | Phase 7 (monetization) | ⏸ |
| PH-21 | `subscription_started` | Phase 7 (monetization) | ⏸ |
| PH-22 | `nutritionist_chat_sent` | Phase 4 (AI nutritionist) | ⏸ |

### PostHog Dashboards to Build (once events are flowing)

| Dashboard | What it answers |
|---|---|
| Onboarding Funnel | Where do users drop off between sign-up and first meal logged? |
| Day-1 / Day-7 / Day-30 Retention | Are users forming a habit? |
| Feature Usage | AI chat vs photo vs manual — which logging method wins? |
| Error Rate | How often does AI logging fail, and on which inputs? |

---

## Deferred (v2)

| Feature | Reason deferred |
|---|---|
| Meal Plan screen | Complexity vs. value tradeoff — nail logging first |
| Voice input in AI chat | v2 feature |
| Android adaptive icon assets | Design polish after core features done |
| **Social / Referrals** (Groups, Refer a Friend, Redeem Referral Code) | Added as inert rows in the profile drawer (2026-06-22) to match the design, but no tables/backend exist yet. Needs new schema + Edge Functions before wiring. |

---

## Pending Side Panel Features

> These are all the menu items in `ProfileDrawer.tsx` that currently show "Coming soon". Tracked here so we don't lose sight of them.

### From the drawer MENU array

| Menu Item | What it needs | Target Phase |
|---|---|---|
| **Progress Charts** | `ProgressChartsScreen.tsx` — weight-over-time line chart, calorie history bar chart, macro trends | Phase 6 (6.2) |
| **Water** | `WaterCard.tsx` + `water_logs` table + daily water store | Phase 3 (3.3) |
| **Body Measurements** | `MeasurementsScreen.tsx` — log waist/hips/arms over time, `body_measurements` table | Phase 6 (6.3) |
| **My Foods** | `MyFoodsScreen.tsx` — real learned/custom food library; badge "Learned 12 foods" is hardcoded. **v1 must-fix:** this fake badge shows fabricated data for a feature that doesn't exist yet — remove the badge (or the row) before launch, don't ship a lie. | Phase 6 (6.7) |
| **Reminders** | Push notification scheduling UI — `expo-notifications`, local trigger setup | Phase 8+ |
| **Groups** | Social/accountability groups — new schema, Edge Functions, full social layer | v2 |
| **Refer a Friend** | Share sheet + referral link generation | v2 |
| **Help & Support** | In-app FAQ or link to external support | Phase 8+ |
| **Go Premium** | `SubscriptionScreen.tsx` + `usePremium()` hook + RevenueCat | Phase 7 |

### Stubbed composer buttons (HomeScreen.tsx)

| Button | Icon | What it needs |
|---|---|---|
| **Bookmark** | `bookmark-outline` | Save/favourite a food or meal to `saved_meals` — wires to Phase 3 task 3.9 |
| **Image / Photo log** | `image-outline` | Full camera/gallery flow → `analyze-food-photo` Edge Function → MealCard — **next priority** (Phase 2, tasks 2.6–2.7) |
| **Camera FAB** (no-text state) | `camera` | Same as above — currently falls back to `handleSend` with no text |
