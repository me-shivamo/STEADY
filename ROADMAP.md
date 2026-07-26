# STEADY — Build Roadmap & Checkpoint Tracker (Production)

> This file tracks only what is actually built and shipping on the `production` branch.
> Deferred/unbuilt features (AI Nutritionist chat, monetization, barcode scanning, progress
> charts, v2 ideas) are tracked on `master`, not here — production stays a record of what's real.

---

## Status Key
| Symbol | Meaning |
|---|---|
| ✅ | Done |
| 🔄 | In progress |
| ⬜ | Not started |

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

## Phase 1 — Foundation

| # | Task | Status | Date |
|---|---|---|---|
| 1.1 | Init Expo project (`blank-typescript` template) | ✅ | 2026-06-17 |
| 1.2 | Install all npm packages | ✅ | 2026-06-17 |
| 1.3 | Create `src/` folder structure + theme system | ✅ | 2026-06-17 |
| 1.4 | Get app running on physical device via tunnel | ✅ | 2026-06-18 |
| 1.5 | Create Supabase project + run DB migrations | ✅ | 2026-06-18 |
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

| # | Task | Status | Date |
|---|---|---|---|
| 2.1 | Deploy `log-food-from-text` Supabase Edge Function (extracts foods + nutrition from natural language) | ✅ | 2026-06-20 |
| 2.2 | `src/store/foodLogStore.ts` (Zustand store — today's food entries, daily totals) | ✅ | 2026-06-20 |
| 2.3 | `MealCard.tsx` component (displays a logged meal in the home feed) | ✅ | 2026-06-20 |
| 2.4 | `FoodLogChatScreen.tsx` — chat UI → calls Edge Function → saves to Supabase → updates home feed | ✅ | 2026-06-20 |
| 2.5 | Wire `HomeScreen.tsx` feed to `foodLogStore` — replace empty state with real `MealCard` list | ✅ | 2026-06-20 |
| 2.6 | Deploy `analyze-food-photo` Supabase Edge Function (GPT-4o Vision → food items + nutrition + Storage upload) | ✅ | 2026-06-24 |
| 2.7 | Inline camera flow in `HomeScreen.tsx` — camera FAB opens OS camera, photo thumbnail in composer, `logMealFromPhoto()` in `foodLogStore`, photo shown on MealCard | ✅ | 2026-06-24 |
| 2.7a | `supabase/migrations/005_meal_photos_bucket.sql` — `meal-photos` Storage bucket + RLS policies | ✅ | 2026-06-24 |
| **🏁** | **Milestone: Type a meal or snap a photo → AI logs it → card appears on home screen** | ✅ | 2026-06-24 |

---

## Phase 3 — Dashboard Polish

| # | Task | Status | Date |
|---|---|---|---|
| 3.1 | Connect `HomeScreen` CalorieRing + MacroRows to live `daily_summaries` + Supabase realtime | ✅ | 2026-06-24 |
| 3.2 | Animated CalorieRing fill + haptic feedback on food logged | ✅ | 2026-06-24 |
| 3.3 | `WaterCard.tsx` component + `water_logs` inserts | ✅ | — |
| 3.4 | `DatePickerSheet.tsx` — home screen date picker: 7-day strip + animated month grid + month pills. Tap any past date → feed reloads with that day's logs. | ✅ | 2026-06-24 |
| 3.5 | MealCard options — Adjust Calories & Macros (manual per-food override form) | ✅ | — |
| 3.6 | MealCard options — Change Date & Time (move log to a different day) | ✅ | — |
| 3.7 | DB trigger for `daily_summaries` auto-upsert | ✅ | 2026-06-18 |
| **🏁** | **Milestone: Live dashboard data; date navigation works end-to-end** | ✅ | 2026-07-03 |

---

## Phase 4 — Progress + Profile

| # | Task | Status | Date |
|---|---|---|---|
| 4.1 | `WeightScreen.tsx` + `weight_logs` writes | ✅ | — |
| 4.2 | `BodyMeasurementsScreen.tsx` + `body_measurements` table | ✅ | — |
| 4.3 | Profile UI — slide-out drawer from the Home ☰ icon (`ProfileDrawer.tsx` + `ProfileHeaderCard`/`StatStrip`/`MenuRow`) | ✅ | 2026-06-22 |
| 4.4 | `SettingsScreen.tsx` — Profile, Body, Goals, Preferences (units toggle, name, sex, height, weight, goal type, activity, macros) | ✅ | 2026-06-23 |
| **🏁** | **Milestone: Weight, water, and measurement tracking working alongside profile/settings** | ✅ | 2026-07-03 |

---

## Phase 5 — App Store Launch

| # | Task | Status | Date |
|---|---|---|---|
| 5.1 | `eas.json` build profile — preview (APK) + production (AAB, autoIncrement) profiles with env vars baked in | ✅ | 2026-07-03 |
| 5.2 | Android `package` identifier `com.steadyapp.android` + `versionCode 1` set in `app.json` | ✅ | 2026-07-03 |
| 5.3 | In-app account deletion (Play Store requirement) | ✅ | — |
| 5.4 | Privacy policy + terms + delete-account pages (`steady-legal/`) | ✅ | — |
| 5.5 | Android screenshots for Play Store listing | ⬜ | — |
| 5.6 | Play Store listing copy (title, short description, full description) | ⬜ | — |
| 5.7 | Clean app icon + adaptive icon + splash assets | ✅ | 2026-07-03 |
| 5.8 | `eas build --profile production --platform android` | ⬜ | — |
| 5.9 | `eas submit --platform android` | ⬜ | — |
| **🏁** | **Milestone: STEADY v1 is live on Google Play** | ⬜ | — |

---

## Analytics — PostHog Integration

| # | Task | Status | Date |
|---|---|---|---|
| PH-1 | Install `posthog-react-native` SDK | ✅ | 2026-06-23 |
| PH-2 | Create `src/utils/posthog.ts` — initialize client with API key | ✅ | 2026-06-23 |
| PH-3 | Wrap app in `<PostHogProvider>` in `App.tsx` | ✅ | 2026-06-23 |
| PH-4 | Add PostHog API key to environment / Expo config | ✅ | 2026-06-23 |
| PH-5 | `posthog.identify(userId)` on sign-in / session restore (`authStore`) | ✅ | 2026-06-23 |
| PH-6 | `posthog.reset()` on sign-out (`authStore`) | ✅ | 2026-06-23 |
| PH-9 | `sign_up` event | ✅ | 2026-06-23 |
| PH-10 | `sign_in` event (email/google/apple) | ✅ | 2026-06-23 |
| PH-11 | `onboarding_step_completed` event | ✅ | 2026-06-23 |
| PH-12 | `onboarding_completed` event | ✅ | 2026-06-23 |
| PH-13 | `meal_logged` event | ✅ | 2026-06-23 |
| PH-14 | `ai_chat_error` event | ✅ | 2026-06-23 |
| PH-16 | `sign_out` event | ✅ | 2026-06-23 |
