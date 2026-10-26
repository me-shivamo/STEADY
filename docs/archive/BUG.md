# STEADY — Known Issues

Tracked bugs and design issues. Live tracking table for the post-build (2026-08-04) test round is at
the top; older deferred items are kept underneath.

---

## Post-build test round — 2026-08-04

Sixteen issues found after installing the Play Store internal-testing build on-device. Every root
cause below was established by reading the code (and, for several, by inspecting the shipped
`.aab` and querying the live database) before any fix was written.

**Status key:** ✅ Fixed · 🧪 Fixed, needs on-device check · ⏸️ Blocked on Shivam · 🔍 Investigating

| # | Issue | Priority | Status | Root cause | Fix |
|---|-------|----------|--------|------------|-----|
| 1 | App launcher icon | Med | ✅ **In build 11** (minor: faint square seam, deferred) | Icon was never replaced after `create-expo-app` — the blue chevron is the stock Expo template art, byte-identical to the first commit | New icon set generated from your `steady-icon-1024.png` by `scripts/generate-app-assets.mjs`. Wordmark pre-shrunk to 71% so the adaptive-icon mask stops clipping the "S" and trailing dot |
| 2 | Notification icon | High | ✅ **Verified in build 11** — `hasAlpha=TRUE`, was `FALSE` | `app.json` pointed expo-notifications at `./assets/icon.png` — a **fully opaque** image. Android discards RGB and silhouettes on alpha, so a zero-transparency icon renders as a solid indigo square. Verified against the shipped `.aab`: `notification_icon.png` is RGB, `hasAlpha=false`, at all 5 densities | New `assets/notification-icon.png` — white "S." on transparent, legible down to 24 px. `app.json` repointed |
| 3 | Splash showed Expo default; wanted bowl **+ macro callouts** | Med | ✅ **Full illustration done 2026-08-05** (needs rebuild) | `splash-icon.png` was a **pixel-exact duplicate** of the Expo chevron (0 of 1,048,576 bytes differ) | Two parts. Native splash: bowl bundled locally (it renders before JS starts, so it cannot fetch the Welcome screen's remote Unsplash URL); background `#E6F4FE` → `#FAFAFA` to match `colors.bgPrimary`. The **callouts cannot go in the native splash** — Android 12+ masks `windowSplashScreenAnimatedIcon` to a circle showing only the inner ~2/3, so labels spread across a 390×480 canvas are cropped by the OS. Solved with an in-app `AnimatedSplash` that renders the full artwork the instant JS boots, over the same `#FAFAFA` with the bowl in the same position, so the handover is invisible. Illustration extracted to `BowlIllustration` and shared with WelcomeScreen — one copy of the geometry, not two |
| 4 | Google Sign-In not working | **Critical** | ✅ **FIXED & VERIFIED on-device 2026-08-04** | **DIAGNOSED 2026-08-04 — `DEVELOPER_ERROR` (code 10) confirmed on-device.** Not app code: the shipped `.aab` has the web client ID correctly inlined and `RNGoogleSigninModule` in `classes3.dex`. The app is installed **from Play internal testing**, and Play App Signing strips the upload signature (`EB:23:27:83:…:CC:A7:C7`, verified with `keytool -printcert -jarfile`) and re-signs with its own key. So the certificate Google Play Services checks at runtime has **never been registered** as an Android OAuth client. `BUILD.md` §9 recorded this step as `[ ]` not done; `WHATTODO.md` wrongly claimed `[x]` — the on-device error settles the contradiction | App side done: error-code mapping, self-contained `DEVELOPER_ERROR` diagnostic logged to `adb logcat` (package + GCP project + ordered checklist), dead `'User cancelled'` guard replaced with a real status-code check, `iosClientId: '' → undefined`. **Root cause was a wrong fingerprint on an existing client:** `STEADY Android (Play)` had SHA-1 `75:67:E3:8D:…:BC:EF:94:54` — a *third* certificate (likely Internal-app-sharing), neither the upload key nor the app-signing key. Replaced with the Play app-signing SHA-1 `C9:0E:F9:F4:DB:A9:07:62:80:CF:31:AC:2E:45:78:5E:31:CC:57:54`. Server-side change; the already-installed build started working with no rebuild |
| 5 | Terms vs Privacy colours differ | Low | ✅ | **Not app code.** Both open via bare `Linking.openURL`. `privacy.html` was rewritten in GitHub's web editor (commit `4d55efd`) with a whole different stylesheet: body `#1a1a1a` vs `#1a2b3c`, links `#1a56db` vs `#1e6fd9`, bordered tables, underlined h2s — and `:root { color-scheme: light }` with the dark-mode block deleted, so Privacy stayed light while Terms followed the system theme | All four pages in `steady-legal` now share one `legal.css`, so they can't drift again. **Not pushed** — live site, your call |
| 6 | Google button / layout | Low | ✅ | The real defect wasn't contrast — it was **render order**: "Log In" rendered *below* the Google button and below the "or continue with" divider that introduces it | Primary CTA moved above the divider on both screens; divider copy shortened to "or"; button extracted to `GoogleSignInButton.tsx` with Google's official unmodified mark and a 48dp touch target |
| 7 | Raw developer errors in the UI | High | ✅ | No error→copy boundary existed. `err.message ?? 'friendly fallback'` at 14 sites — the fallback never fires, because every real throw has a non-empty `.message`. Users saw `"Edge Function returned a non-2xx status code"`, RLS policy text, Google's `DEVELOPER_ERROR` | New `src/utils/errors.ts`: `toUserMessage()` classifies on **type and status**, not message text (supabase-js compresses every Edge Function failure into one opaque sentence with no code in it). All 14 sites converted; originals still `console.error`'d |
| 8 | Composer phantom padding after keyboard closes | **High** | 🧪 | RN's Android `KeyboardAvoidingView` **cannot return to zero**. It feeds both show and hide into one handler that reads `endCoordinates.screenY` — but native fills that field with a Y coordinate on show and a *height* on hide, so the reset lands on the status-bar height. Its `if (_keyboardEvent == null) setBottom(0)` escape never fires because the hide event is non-null | KAV made inert on Android (`behavior={undefined}`); explicit `keyboardDidShow`/`keyboardDidHide` listeners with a literal `0` on hide. Also fixed a second, separate gap: `SafeAreaView edges` dropped `'bottom'`, inset moved onto the composer so its card colour fills the nav-bar strip |
| 9 | Options menu behind Android nav bar | **High** | 🧪 | App runs edge-to-edge (`edgeToEdgeEnabled=true`), so a Modal's window extends under the nav bar. The sheet had a hardcoded `paddingBottom: 8` against a ~48dp 3-button bar. RN forces `navigationBarTranslucent` true under edge-to-edge, so the props can't opt out | `Math.max(insets.bottom, 8) + 8` on MealCard's sheet **and** `ConfirmSheet` (which covers 6 call sites, including the Delete confirmation itself) |
| 10 | Delete meal doesn't work | High | ✅ **FIXED — migration applied & proven 2026-08-04** | **Not a URL change.** `chat_messages.meal_log_id` has no `ON DELETE` rule, so Postgres defaults to NO ACTION and blocks every delete. Every AI-logged meal writes such a row on the same request — all 361 on the live DB. Reproduced in a rolled-back transaction: `ERROR 23503 … violates foreign key constraint "chat_messages_meal_log_id_fkey"`. It looked mysterious because `confirmDelete` used a bare `catch {}` that discarded the Postgres code | Migration `027`: `ON DELETE CASCADE`, plus an `AFTER DELETE` trigger to recompute `daily_summaries` (measured stale by 511 kcal otherwise), plus the same guard on `update_water_summary()` which was blocking account deletion. Applied to production 2026-08-04 and verified two ways: `pg_constraint.confdeltype` is now `c` (CASCADE), and a rolled-back `DO` block deleted a real meal successfully (cascading 1 chat_message + 1 food_entry) where it previously raised 23503. **Works on the already-installed build — no rebuild needed** (though reaching the Delete button still needs the #9 inset fix) |
| 11 | Photo not shown in sent message | Med | 🧪 | The `'user'` chat message type had **no image field at all**, so there was nowhere to put the photo. Photo-only sends pushed no bubble whatsoever | `imageUri` added to the message type; a bubble is now always pushed, with the photo rendered above the caption and tappable |
| 12 | Meal-card image not tappable | Med | 🧪 | The 48 px thumbnail was a bare `<Image>` with no press handler | New `ImageViewerModal`, shared by the meal card and the chat bubble |
| 13 | No confirmation after "Add to saved entries" | Med | 🧪 | The `justSaved` confirmation was rendered **inside the options Modal that the same handler closes** — mounted into a container being unmounted, so it could never be seen. No toast primitive existed anywhere in the app | `toastStore` + `ToastHost` mounted at the app root so it outlives any sheet. Core `Animated` with `useNativeDriver`, respects the bottom inset |
| 14 | Weekly average message hardcoded | Med | 🧪 | `evaluateInsights()`'s rules are all about streaks / TDEE / weekend patterns — **none of them read the calorie average or days-logged**, so the line under a calorie chart could say "tracking right where they should be" during a 2-day, 900 kcal week | New `describeWeeklyAverages()` — every branch chosen by real numbers, sample size checked before accuracy. The rule-based insight still shows, but only when a specific rule fires (generic `strong_week` filler suppressed) |
| 15 | Profile name field numeric | Low | ✅ | `Field`'s destructured default is `keyboardType = 'numeric'` and the Name row never overrode it | Explicit text props on the Name row. Also opted it out of `selectTextOnFocus`, which was selecting the whole name on every tap |
| 17 | Deleted meal's user message survives, and next log merges deleted + new food | **High** | ✅ **FIXED live 2026-08-05** | One bug, two symptoms. `saveChatTurn` set `meal_log_id` only on the ASSISTANT row, so 027's CASCADE deleted half the pair. The stranded user message then broke `loadChatHistory`'s filter, which identifies a food-log turn by checking whether the **next** row is a `food_log_confirmation` — cascading that neighbour away flipped the test, so the orphan replayed as a live user turn. The model saw two consecutive user messages with no assistant turn between, read them as one utterance, and logged both | Both Edge Functions now stamp `meal_log_id` on the user row; `loadChatHistory` checks the row's own `meal_log_id` instead of its neighbour's existence; migration 028 backfilled 94 existing rows + indexed the column. Deployed live — no rebuild needed |
| 16 | Push notifications go to Expo Go | **Critical** | 🧪 **FCM in build 11** — `google_app_id` confirmed in artifact; needs install + token purge | Two independent causes, both required. **(a)** The build has **no FCM config** — `strings` over the shipped `.aab` finds no `google_app_id` / `gcm_defaultSenderId`, so `getExpoPushTokenAsync()` throws and the standalone app has *never once* registered a token. It failed silently: no try/catch, and a fire-and-forget call site. **(b)** The one row in `device_push_tokens` is a stale Expo Go token from 2026-07-28, and all three senders take exactly one row (`.limit(1)`), so it wins every send | App side done: `setNotificationHandler` added (without it foreground pushes are silently discarded — the fix would have *looked* broken), registration wrapped with PostHog telemetry, `app.config.js` wires `googleServicesFile` conditionally. **Needs you** — see below |

> Numbering note: your original list had 15 items; #1 covered both the launcher and notification
> icons, which have different root causes and different asset rules, so they're split here.

### Verified NOT the cause (ruled out, so nobody re-investigates)

- **Delete meal was never a URL problem.** `src/api/supabase.ts` is 15 lines with no custom fetch or rewriting; RLS policies are correct (`cmd=ALL`, `auth.uid() = user_id`), and FK constraint triggers bypass RLS anyway.
- **Google Sign-In env vars DO reach the build.** The gitignored-`.env`-never-reaches-EAS theory is dead — the client ID is inlined in the shipped bundle.
- **The `Constants.appOwnership === 'expo'` push guard is correct.** It's `null` in standalone builds, so it doesn't fire. Deprecated, not defective.

---

## Blocked on Shivam

These cannot be fixed from code. Both are hard gates for their feature.

**Push notifications (#16)** — receiver *and* sender must both be configured; doing one gives the
same dead feature with a different error:
1. Firebase console → add an Android app with package **exactly** `com.steadyapp.android` → download
   `google-services.json` into the repo root (already gitignored; `app.config.js` picks it up
   automatically and warns loudly at build time while it's missing).
   For EAS: `eas env:create --name GOOGLE_SERVICES_JSON --type file --environment production,preview`
2. `eas credentials -p android` → upload the **FCM V1 service account key**.
3. *After* the new build is live: `DELETE FROM public.device_push_tokens;` — one stale Expo Go row,
   provably unreachable by STEADY. Every device re-registers on next launch.
4. Testing note: **background the app** before sending a test push, or rely on the new foreground
   handler. Check the receipt from `/push/getReceipts`, not just the send ticket.

**Google Sign-In (#4) — DIAGNOSED, one console step to fix.** No rebuild, no re-upload; this is a
server-side change and the app already on the phone will pick it up within minutes.

*Why:* the app is installed from Play internal testing. Play App Signing re-signs the app with
**its own** certificate, so the fingerprint on the device is not the `EB:23:27:83:…:CC:A7:C7` your
AAB carries. Google matches sign-in requests by `package name + signing SHA-1`, finds no Android
OAuth client for the Play certificate, and returns `DEVELOPER_ERROR`.

1. **Play Console** → STEADY → *Test and release* → *Setup* → **App integrity** → *App signing* tab.
   Copy the **SHA-1** under **"App signing key certificate"**.
   ⚠️ Not "Upload key certificate" (that's the `EB:23:…` one you already have) and not
   "Internal app sharing" — three different certificates, easy to grab the wrong one.
2. **Google Cloud Console** → confirm the project selector shows the project whose number is
   **853928970205** (same one the web client ID belongs to — a client in a different project fails
   with this identical error) → *APIs & Services* → **Credentials** → *Create credentials* →
   *OAuth client ID* → Application type **Android**:
   - Name: `STEADY Android (Play)`
   - Package name: `com.steadyapp.android` (must match exactly)
   - SHA-1: the value from step 1
3. Wait ~5 minutes, then just retry sign-in on the phone — **no new build required**.
4. If it still fails, grab `adb logcat | grep -i googleSignIn`. The new diagnostic prints the
   package, the GCP project number, and an ordered checklist. Read the code:
   - still `DEVELOPER_ERROR` → wrong SHA-1, wrong project, or package mismatch (re-check step 2)
   - "Access blocked" / 403 → the OAuth consent screen is still in **Testing**; publish it or add
     your Google account as a test user. Nothing in the repo records this ever being configured.
   - a Supabase-shaped message → the token was minted and the break is downstream; add both Android
     client IDs to Supabase → Auth → Providers → Google → Authorized Client IDs.

> Keep the existing `STEADY Android (EAS dev)` client too. It covers sideloaded `--profile preview`
> APKs, which are signed with the EAS keystore. The two are not alternatives — you need both,
> because the same app has a different certificate depending on how it was installed.

**Also pending:** `supabase db push` to apply migration `027` (#10), and `git push` in
`steady-legal` to publish the shared stylesheet (#5).

---

## Deferred / older

### Splash screen arrows + bowl need adjustment
*2026-07-31 · Design*

The current splash screen image (`assets/splash-icon.png`) is a single blue chevron/arrow shape. Shivam wants to adjust the arrows and reposition the bowl in the splash graphic — but the checked-in asset is a flattened PNG with no bowl element present and no accessible source/vector file to edit precisely. Before making changes we need to decide whether to regenerate the asset from the Claude design system reference (see `.claude/memory/reference_claude_design.md`) or source a new reference image. Deferred until Shivam has time to look at it properly.

*Resolved by #3 above — the splash is now the bowl photo, bundled locally.*

*Note on the callouts:* Shivam asked for the bowl **plus** the macro/micro callouts on the splash.
That isn't possible in the native splash: `android/.../values/styles.xml` wires it through
`windowSplashScreenAnimatedIcon`, the Android 12+ SplashScreen API, which hard-masks the image to a
circle showing only the inner ~2/3. Six labels spread across a 390×480 canvas would be cropped away.
The full illustration would need an **in-app** splash component rendered after JS boots — that's a
small piece of new UI, not an asset swap, and is worth deciding on separately.
