# STEADY — Build in Public Devlog

> A chronological story of building STEADY, an AI-powered calorie tracking app for iOS and Android.
> Written as it happens — raw, real, and ready to share.

### Shipped the database layer for Groups — STEADY's first-ever multi-user feature
*2026-08-01 · Feature*

We started building Groups today — the social/gamification layer meant to turn solo calorie-tracking into something people come back to with friends. The full UI was already designed (5 screens: intro, create, invite, join, dashboard with a leaderboard and activity feed), so we started at the bottom instead — the database — since this is the first thing STEADY has ever built where one user is allowed to see another user's data. Every table before this used dead-simple security ("you can only touch your own rows"); Groups needed "you can see this row because we're both in the same group," which is a genuinely different kind of rule and came with a classic trap: a security policy on the membership table that checks the membership table can recurse into itself. We solved it with a small `SECURITY DEFINER` helper function that breaks the loop, which is now the pattern for every cross-member check in the schema.

We also made a deliberate privacy call: group members can see each other's streaks, points, and "logged today" status, but never actual calories or macros. That meant building a new denormalized ledger table (`group_daily_activity`) fed by a trigger off `meal_logs`, instead of just exposing the existing nutrition tables to the group. Shipped as `019_groups.sql` — 5 tables, RLS policies, and 10 Postgres functions (create/join/leave/remove/delete group, leaderboard, activity feed, activity score) — all reasoned as RPCs rather than Edge Functions, since nothing here needs external APIs or secrets, just atomic multi-table writes and controlled reads across the new privacy boundary.

Before writing a line of app code, we ran a real two-account verification pass directly against the live database (simulating both users' JWTs) and it earned its keep immediately: a batch-insert of 3 meals in one transaction silently produced zero activity-feed events, because the trigger's "was this the first meal of the day" check compared against a `meal_logs` row count that isn't stable when multiple rows land in the same statement. Fixed in `020_fix_group_activity_trigger.sql` by checking the ledger's own prior state instead, re-verified with the same batch-insert scenario, and confirmed clean cascade deletes and admin-only enforcement on `remove_member`/`delete_group`. Next up: the Zustand store and the 5 screens themselves.

### Fixed the timezone bug that was quietly mis-dating logs for anyone outside UTC
*2026-08-01 · Bug*

Shivam flagged that dates needed to respect the user's own timezone without asking for location access, and the audit turned up a genuinely widespread bug: almost every "what day is it" computation across the app used `new Date().toISOString().split('T')[0]`, which converts to UTC before slicing — so a weigh-in at 1am in India (UTC+5:30) got stamped with *yesterday's* date, every time. We fixed it in two layers. On the client, we centralized a `toLocalDateString()` helper in a new `src/utils/localDate.ts` that reads the phone's own local getters (`getFullYear()`/`getMonth()`/`getDate()`) instead of converting to UTC first, and swapped it in across every store and screen that had the bug: food logging, weight, water, body measurements, progress, TDEE, the home-screen date swipe, both date-picker sheets, and the stat strip. We also caught a second, sneakier instance of the same bug — the server was guessing "breakfast vs. lunch vs. dinner" from its own UTC clock whenever the client omitted a meal type, so dinner in India was getting labeled "lunch." Fixed by having the client send its own local hour alongside the request. The harder half was the daily AI-usage-quota reset, which runs on a schedule inside Postgres (pg_cron) with no notion of any individual user's clock — that one needed `profiles.timezone` (an IANA name like "Asia/Kolkata"), so we made sure it gets saved the moment a session starts, not only when someone happens to enable push notifications like before, and rewrote the reset function to compute each user's own local date via `AT TIME ZONE` instead of one shared instant for everyone. Same fix landed on the reminder "already logged today" check, which had the identical bug. All of this shipped as migration `018_timezone_aware_dates.sql` plus three redeployed edge functions, with the full Jest suite green (172/172) and `tsc --noEmit` clean throughout.

### Reworked the "My Foods" and "Help & Support" copy after a round of feedback
*2026-08-01 · Decision*

Shivam came back with three notes on the drawer features from the previous session: the "My Foods" ping modal leaned too hard on "(fake)" language, which undercut the joke instead of landing it; "Help & Support" read as "you can't actually reach me," which wasn't the intent; and there was a stray em-dash style creeping into user-facing copy throughout the app that read more like internal dev notes than natural writing. Rewrote both modals — "My Foods" now says the admin "just felt that ping" and is "counting every single one," no fake caveats attached, and added a real error state so a failed network call shows an actual message instead of silently displaying a blank counter. "Help & Support" flipped from "there is no support team" to "skip the ticket, just tell me," making clear the person behind the app is genuinely reachable and reads every message. Then did a full sweep of the app's user-facing strings (not code comments, and not the "—" empty-value placeholders used for un-logged stats, which Shivam confirmed should stay) and rewrote every dash-joined sentence into plain punctuation across insights, onboarding, settings, and the home screen greetings.

### BUG_FIX.md tracker fully closed out (bar one dashboard config step)

*2026-08-01 · Milestone*

Went through `BUG_FIX.md` with Shivam and closed out the last few open items instead of trusting stale notes. #1 (onboarding splash) — confirmed on-device look is right, and confirmed with Shivam the current Unsplash bowl photo stays as the final image rather than waiting on a custom asset. N7/N8 (meal card image layout, removing "Logged by STEADY") were marked reverted from an earlier session, but Shivam said they'd since been rebuilt and shipped — verified that directly in code rather than taking the label at face value: `MealCard.tsx` genuinely renders the photo as an inline thumbnail now, and grepping the whole `src/` tree for "Logged by STEADY" comes back with zero matches. Both N-tables are now fully ✅ Done end to end. Only two items remain open on the whole tracker: `#3c` (Supabase email verification/OTP — a dashboard config step, not app code, needs Shivam directly) and `#6d` (Home's bottom text box layout — explicitly deferred, needs his direction before any design work starts). Re-ran the full verification pass while updating the tracker: `tsc --noEmit` clean, Jest 171/172 passing in isolation (one `SettingsScreen.test.tsx` timeout under full-suite parallel load, confirmed a pre-existing flake and not a regression — passes clean standalone).

### Turned two unbuilt menu items into a running joke with a real database behind it
*2026-08-01 · Feature*

"My Foods" and "Help & Support" in the profile drawer were both dead `comingSoon` rows — faded out, untappable, doing nothing for testers except signaling "not done yet." Instead of leaving them dark, we turned them into personality. Tapping "My Foods" now opens a "feature request filed" modal that fake-pings the admin (that's Shivam) and shows a shared, global counter of how many times *anyone* has ever tapped it — a new `admin_pings` table in Supabase with a single row and an `increment_admin_ping()` Postgres function that atomically bumps the count and hands back the new total, so concurrent taps from different testers can't race each other and silently lose an increment. "Help & Support" got a simpler joke sheet: "there is no support team, it's just one guy," styled identically to the existing "Go Premium" sheet so it feels native to the app rather than bolted on. Both reuse the drawer's existing sheet visual language (`premiumSheet`/`premiumBackdrop` styles) instead of inventing new UI patterns. This is the first RPC call anywhere in the app — everything before this used plain `select`/`insert`/`update` through the Supabase client, so this is also the first time we've needed a `SECURITY DEFINER` Postgres function as the *only* door into a table, with RLS blocking direct writes entirely.

### N11 finally confirmed fixed — root cause was the outside-tap-to-close layer, four attempts deep

*2026-08-01 · Bug*

Closed the loop on N11 for real this time, and it's worth being straight about how many attempts it took: four. Shivam kept testing on-device after each fix and kept reporting it still frozen, which was the right call every time — three of those four fixes addressed real, verifiable bugs that just weren't the one causing the freeze. The diagnostic test (`__DrumModalTest.tsx`, a floating button visible on every screen) is what actually cracked it, built progressively closer to the real `ReminderTimeSheet.tsx` one variable at a time: bare Modal + DrumPicker worked fine; adding the remount-on-open `drumKey` pattern still worked fine; adding the outer backdrop back as a `Pressable` with a real `onPress` — reproduced the freeze, on-device, for the first time in this whole debugging arc. That's the actual root cause: both `ReminderTimeSheet.tsx` and `ChangeDateTimeSheet.tsx` wrap their entire Modal content in `<Pressable style={styles.backdrop} onPress={onClose}>`, meant only to close the sheet on an outside tap — but a `Pressable` enters Android's touch-responder negotiation, and it was winning that negotiation before the nested drum `ScrollView`s could ever recognize a drag. An earlier fix had already caught this exact mechanism one layer further in (the sheet wrapper), but missed that the *outer* backdrop had the identical problem. Fix: swapped the backdrop from `Pressable` to a plain `View` in both files, same as the sheet layer before it. Real tradeoff, confirmed acceptable with Shivam first: these two sheets can no longer be dismissed by tapping outside them — closing now only works via the Save/Close button or the Android hardware back button (`Modal`'s `onRequestClose`, unaffected). Deleted the diagnostic test and its two-line wiring in `App.tsx` now that it's done its job. `tsc --noEmit` clean, Jest clean at 171/171. Shivam confirmed scrolling works on-device before any of this got applied to the real files — this is the first time in the whole N11 saga a fix was proven correct *before* being shipped, not after.

### N11: stopped guessing, built a real test instead of a fourth fix

*2026-08-01 · Bug*

Take three didn't fix it either — Shivam pushed back hard on the pattern of "confident explanation, still broken," which was the right call. Instead of a fourth source-only fix, laid the entire onboarding drum tree and the entire Reminders sheet tree side by side, layer by layer, and found exactly one structural difference left standing once the earlier `Pressable` fix was already in place: onboarding's `DrumPicker` has zero `Modal` ancestors, full stop, while both broken sheets mount theirs inside one. That's a real, checkable fact — not proof of *why* it breaks, since a `Modal` on Android is a genuinely different native rendering path (a separate OS-level `Dialog` window, not just a styled `View`), and touch delivery into it goes through an extra Android-to-RN handoff that a plain screen never has to do. Rather than ship a fourth guess about what that handoff does, built `__DrumModalTest.tsx` — a floating "Drum Test" button, visible on every screen via a two-line addition to `App.tsx`, that opens the barest possible reproduction: one unmodified `DrumPicker` inside one `Modal`, nothing else around it. If it scrolls, the Modal theory is dead and the real bug is still out there. If it freezes too, the Modal boundary is confirmed for real, on-device, not just in reasoning. `tsc --noEmit` clean. Both the test component and its two-line wiring in `App.tsx` are marked TEMPORARY and will be fully deleted once this answers the question either way.

### N11 take three: it was never the drum, it was the sheet wrapping it

*2026-08-01 · Bug*

Two fixes deep on N11 and Shivam sent screenshots showing the sheets rendering correctly — right values, right position — but confirmed the drums still don't move at all while dragging on Android. That single detail ("nothing moves" during the drag itself, not "moves but lands wrong") ruled out both previous theories at once: take one's `SimpleDrum`-vs-`DrumPicker` swap and take two's `contentOffset`-timing fix both address *where the drum starts or ends up*, not whether it receives the drag gesture in the first place. A gesture that never starts isn't a positioning bug. Traced it to `<Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>` — both `ChangeDateTimeSheet.tsx` and `ReminderTimeSheet.tsx` wrap their entire sheet content in a `Pressable`, whose only real job is "don't let a tap inside the sheet bubble up and close it via the backdrop's `onPress`." But `Pressable` participates in RN's touch-responder negotiation the same way a `ScrollView` does, and on Android that negotiation can go to the outer `Pressable` before a nested `ScrollView`'s drag gesture ever gets a chance to claim it — so any drag starting on the drums never reached them. The confirming check: onboarding's `OnboardingStatsScreen.tsx` and `OnboardingTargetWeightScreen.tsx`, both working, mount `DrumPicker` with zero `Modal` or `Pressable` ancestors at all — that's the one structural difference between "works" and "doesn't," and it was never about which drum component was used. Fix: swapped the sheet wrapper from `Pressable` to a plain `View` in both files (a `View` never claims the touch responder, so it doesn't need `stopPropagation` either — the backdrop's `onPress` only fires for a press that starts and ends on the backdrop's own surface). Left the backdrop itself as `Pressable`, since it genuinely needs `onPress` to close on an outside tap. `tsc --noEmit` clean, Jest fully clean at 171/171. This is the third attempt at N11 — logging it honestly: the first two fixes were real, defensible fixes for real bugs each theory correctly diagnosed, they just weren't *this* bug. Still needs on-device confirmation before calling N11 closed.

### Unified the chat bubble design for user and AI messages on Home
*2026-08-01 · Decision*

Shivam flagged that the "Log + Coach" chat on the Home screen looked off — the user's outgoing message and STEADY's incoming reply were styled like two completely different UIs stitched together, not one conversation. Digging into `HomeScreen.tsx` confirmed it: the user bubble was 12.5px text in a pale lilac tint with a border, while the AI bubble was 14.5px text on a plain white card with a drop shadow — different font size, different visual language, no shared design system between them. We went looking for the canonical STEADY design in Claude Design first (per the project's "always check the design system" rule), but the project our memory pointed to had vanished — only two unrelated "Silver Intelligence" projects existed in the account, so that link was stale and got flagged rather than guessed around. Shivam then designed the target look himself in Claude Design and shared it directly: solid indigo (`#6366F1`, already our `homeColors.accent`) filled bubbles for outgoing messages with white text, solid light-gray (`homeColors.surface`) filled bubbles for incoming messages with dark text, both at matching 14.5px type, matching rounded corners with a "tail" corner squared off, and a timestamp under each bubble. Implemented that exactly — restyled `userBubble`/`aiBubble`, and since the app had never stored a timestamp on chat messages (only on logged meals), added an optional `sentAt` field to `ChatMsg`, threaded through both the Supabase-rehydrated history path (which already had `created_at` sitting unused in each row) and every live `push`/`replace` call site so it stamps `new Date().toISOString()` at send time.

### Deleting a meal card always failed — the bug was in a trigger, not the app

*2026-08-01 · Bug*

Shivam reported the delete button on meal cards just doesn't work. Read through the whole chain first — `MealCard.tsx`'s options sheet → `ConfirmSheet.tsx` → `foodLogStore.deleteMeal()` → the Supabase `meal_logs` delete — and every layer was wired correctly: right id types, right table, RLS policy scoped to `auth.uid() = user_id` and covering `DELETE` via `FOR ALL`, errors caught and surfaced (not swallowed) as "Could not delete. Please try again." A background agent independently traced the same path and came back clean too, which was the tell that the bug wasn't in application code at all.

Found it in `update_daily_summary()`, the trigger from migration 003 that keeps the `daily_summaries` cache table in sync whenever `food_entries` changes. Deleting a `meal_logs` row cascades (`ON DELETE CASCADE`) to its `food_entries` children within the same statement, which fires this trigger once per deleted entry. Inside the trigger, it looked up the meal's date via `SELECT logged_date FROM meal_logs WHERE id = OLD.meal_log_id` — but that `meal_logs` row is the one being deleted right now, so the lookup came back `NULL`. That `NULL` then flowed into an `INSERT INTO daily_summaries (..., summary_date, ...)`, and `summary_date` is `NOT NULL` — so Postgres rejected the insert, which aborted the *entire* transaction, including the original meal delete. Every single meal-card delete was hitting this, 100% of the time, for any meal with food entries.

Fixed it the minimal way (Shivam's call, over adding a `logged_date` column to `food_entries` or handling recompute from the app instead): the trigger now checks if the date lookup came back `NULL` and just returns early instead of attempting the insert — if the parent's gone, there's nothing to recompute, and the cache row is already correct since this only happens mid-cascade-delete. Shipped as `016_fix_delete_meal_trigger.sql`. Hit one deployment snag getting it live: `supabase db push` failed because migrations 014 and 015 had already been applied directly against the remote database at some point outside the CLI's tracking (a `saved_entries already exists` conflict), so the migration-history table didn't match reality — same class of drift as migration 013 a few days back. Repaired history for 014/015 (`migration repair --status applied`, metadata-only, doesn't touch schema or data) before pushing 016 for real.

### N11 take two: the deleted comment was half right, and the real fix was one prop, not a component swap

*2026-08-01 · Bug*

Shivam confirmed on-device that yesterday's N11 fix didn't actually work — the reminder/date-time drums were still frozen after swapping `SimpleDrum` for `DrumPicker`. That meant the previous entry's conclusion was wrong: dismissing `SimpleDrum`'s original comment (which warned that `DrumPicker`'s native-driven `Animated.ScrollView` loses a layout race inside Android `Modal`s) was a mistake — the comment's *diagnosis* was correct, even though `SimpleDrum` was also, separately, genuinely broken as a component. Re-reading `DrumPicker.tsx` line by line found the actual mechanism: it seeds its scroll position with a declarative `contentOffset` prop, which React Native only applies once, at the moment the native view is first measured. Inside a `Modal`, that native view lives in its own separate native window that can still be mid-layout when `DrumPicker` mounts — so the prop silently loses the race and the drum starts stuck. Onboarding never hit this because those screens aren't inside a `Modal`. The real fix: keep `DrumPicker` as the one shared component (no more duplicate widget), but add an imperative `onLayout` → `scrollTo()` path alongside the existing `contentOffset`, so positioning happens only after the native view confirms it has actually finished laying out — reliable in a Modal, harmless everywhere else. The trickiest part was typing the ref correctly: `Animated.ScrollView`'s ref can resolve to either the real `ScrollView` instance or a legacy `{ getNode(): ScrollView }` wrapper depending on RN internals, so the ref is typed as the union and unwrapped via `getNode` when present, instead of force-casting past the type checker. `tsc --noEmit` clean, Jest back to a fully clean 171/171 pass (the earlier `SettingsScreen` timeout didn't recur, confirming it really was a load-flake, not a regression from this work). Lesson for next time, logged in full in `LEARNING.md`: when a fix based on one theory doesn't hold up on-device, the right move is re-deriving the mechanism from the code again, not assuming the first theory was simply "more wrong" than a second one.

### Killed the second drum picker — the "fix" for a Modal bug turned out to be the actual bug

*2026-08-01 · Bug*

Reopened N11 from `BUG_FIX.md`, the reminders-drum item that a prior session had left unresolved after code review couldn't reproduce the reported freeze. Shivam gave us the missing piece: the onboarding drums (weight, height, age) work perfectly, but every drum in the Reminders screen and the "Change Date & Time" sheet is frozen. Turned out the codebase had two completely separate drum-picker components — `DrumPicker.tsx`, using React Native's native-driven `Animated` API, and a second, hand-duplicated `SimpleDrum`, built plain-JS-only inside both `ChangeDateTimeSheet.tsx` and `ReminderTimeSheet.tsx`. A comment on `SimpleDrum` explained why it existed: a claim that `DrumPicker`'s native-driver approach breaks inside a `Modal` on Android. Shivam's on-device report says the opposite is true — proof beats an untested comment. Deleted `SimpleDrum` entirely from both files (component + its dedicated styles + now-dead height constants) and swapped all six call sites over to the shared `DrumPicker`, keeping each file's existing "label below the drum" layout instead of switching to `DrumPicker`'s own built-in label so nothing shifts visually. `tsc --noEmit` is clean on all three touched files, and Jest is back to the prior 171-passed baseline (one `SettingsScreen` timeout flake under full-suite load, confirmed unrelated and non-reproducing in isolation). Next: an on-device check to confirm the drums actually scroll now — this was a from-code fix responding to a hands-on-device bug report, so it still needs the same kind of verification to close out.

### Removed the "Logged by STEADY" label above meal cards
*2026-08-01 · Decision*

Shivam wanted the small "Logged by STEADY" attribution row gone from the home screen — it was sitting right above every meal card, paired with a little checkmark icon, once a meal had entries. Since the checkmark was only ever decoration for that label, we pulled the whole row (`loggedRow` view, checkmark icon, and `Text`) out of `HomeScreen.tsx` rather than leaving an orphaned icon behind, and cleaned up the now-unused `loggedRow`/`loggedLabel` style definitions from the stylesheet. Meal cards now go straight from the chat message into the `MealCard` component with no attribution row above them.

### Confirmed: "Log + Coach" chat history actually persists now
*2026-07-31 · Bug*

Closed the loop on today's chat-history saga. After deploying the `loggedAt` typo fix and the new `analyze-food-photo` chat-persistence code to Supabase, Shivam tested it live with a fresh conversation on `test@gmail.com` — sent a message, refreshed the app, and it was still there. Confirms the whole chain actually works end to end in production, not just in local code: the Edge Function writes the chat turn correctly now, and `HomeScreen`'s merge effect picks it up on reload without racing ahead of the fetch. One casualty: anything sent before today's deploy was never saved (the bug silently dropped every insert), so those earlier conversations are gone for good — but everything from here on should stick.

### Built ai_logs — the missing black box recorder for our three AI call sites
*2026-07-31 · Feature*

Shivam asked a deceptively simple question: "how do I see what's going wrong with the AI chats?" Turned out the honest answer was "you mostly can't, yet." We have three places that call an LLM — `analyze-food-photo` (vision), `log-food-from-text` (the agent loop that does both food logging and coaching), and `macroResolver.ts`'s internal match call — and all three only ever wrote the *final* text into `chat_messages`. No system prompt, no model name, no raw request/response, no latency, and failures went straight to `console.error` in Supabase's short-retention Edge Function logs. So we built `ai_logs`: a new Postgres table (`supabase/migrations/015_ai_logs.sql`) plus one shared helper, `_shared/aiLogger.ts`, that every OpenRouter call now routes through. It captures model, full request payload (minus the raw base64 image bytes, to keep rows small), raw response, latency, token counts, and — critically — the error message on failure, which we've never had before. RLS is enabled with zero policies attached, which in Postgres means deny-all for `anon`/`authenticated` and full access for `service_role` — so Edge Functions can write freely but nothing in the app can read it; it's a developer-only debugging tool, queried straight from the Supabase SQL Editor. Also found and fixed a bug along the way: `.claude/settings.json`'s `PreToolUse` hook was matching `.*` (every tool), re-injecting the entire rules file on every single tool call instead of just before actions that write something — narrowed it to `Write|Edit|Bash`.

### Found the real reason chat history never came back — two bugs deep, not one
*2026-07-31 · Bug*

Turned out the `isFetchingDate` race we fixed earlier today was only the first layer. Shivam pushed back: "I'm still not seeing my conversation" — and digging into `saveChatTurn()` (the function that's supposed to write every chat turn to `chat_messages`) turned up a straight-up typo: `created_at: loggedAt` in `log-food-from-text/index.ts`, referencing a variable that doesn't exist anywhere in that function — the parameter is called `userSentAt`. That's a `ReferenceError` thrown while building the insert payload, before Supabase is ever contacted, on *every single call*, for *every user*. It was getting swallowed by an inner `try/catch` that just logs and moves on, so the app always saw `success: true` and never knew chat history wasn't being saved at all — not a timing bug, a total silent failure. Fixed the typo. Separately, found that `analyze-food-photo/index.ts` (the photo-logging path) never called anything like `saveChatTurn` in the first place — captions typed alongside a photo were never persisted to `chat_messages`, architecturally, regardless of timing or typos. Added a matching `saveChatTurn` there, plus fixed `HomeScreen.tsx`'s photo-send handler to push the caption as its own chat bubble locally too (it was going straight from "thinking…" to the meal card, skipping the caption bubble even in the same session). Three fixes, one bug report — the `isFetchingDate` race, the `loggedAt` typo, and the missing photo-path persistence — all needed for "Log + Coach" to actually remember a conversation.

### Fixed the "Log + Coach" blank-screen bug after refresh or re-login
*2026-07-31 · Bug*

Shivam flagged a nasty one: log a meal by photo, everything shows up fine in both feed views — but close the app, log out, or refresh, and the "Log + Coach" view goes completely blank even though the food is still safely in the database. Root cause was a classic race condition: `HomeScreen` builds its on-screen message list by waiting for `isFetchingDate` to flip to `false` before merging fetched meals with chat history, but `isFetchingDate` *started out* `false` too — meaning "haven't fetched yet" and "already fetched" were indistinguishable on the very first render. On a cold start, the merge effect ran once, immediately, against an empty `meals` array, then permanently marked itself "already seeded" — so when the real data arrived a beat later, it was silently ignored. Fixed by making `isFetchingDate` start (and reset-on-logout) as `true` instead of `false` in `foodLogStore.ts`, so the merge effect always waits for the real fetch to resolve before building the message list. Also worth noting: we went in expecting to find two separate screens ("Food Log" and "Log + Coach") that needed merging, but it turns out they're already one screen (`HomeScreen.tsx`) with a view-mode toggle — the bug was purely in the timing, not the architecture.

### Switched WelcomeScreen off its one-off cream background onto the shared app background
*2026-07-31 · Decision*

Shivam wanted to try the welcome screen on the same background the rest of the app uses, instead of its own custom cream tone, just to compare. Swapped `container.backgroundColor` in `WelcomeScreen.tsx` from a hardcoded `#F6F1E7` to `colors.bgPrimary` (`#FAFAFA`) — the shared theme constant every other screen already pulls from. Tried it, Shivam liked it better, keeping it. Flagged but didn't touch: the tagline color and ghost-button border were originally tuned to sit against the warmer cream, so they might be worth a follow-up look now that the base is a cooler near-white — no complaints yet, just something to watch.

### Tightened the gap between "STEADY" and its tagline
*2026-07-31 · Feature*

Small polish pass on the welcome screen: pulled the "know every bite" tagline up right under the "STEADY" wordmark by dropping `tagline.marginTop` from `12` to `0` in `WelcomeScreen.tsx`. Unlike the bowl illustration's coordinate system, the wordmark/tagline block is styled with plain React Native flexbox (`marginTop` in real screen-space units), so this was a direct one-line style tweak — no scaling math involved.

### Added a per-arrow gap override on top of the shared ARROW_GAP
*2026-07-31 · Feature*

Same idea as the offsetX/offsetY change, one step further: Shivam asked whether an individual arrow's starting-point distance could be set on its own instead of all six sharing `ARROW_GAP`. Added a 5th optional parameter, `gapOverride`, to `arrowFromAngle()` — when passed, it replaces `ARROW_GAP` just for that call; when omitted (`undefined`, the default), the arrow falls back to the shared constant exactly as before. `arrowFromAngle()` now has full per-arrow control over every geometric property (angle, curve direction, x/y offset, gap) while keeping a single shared default for anything not explicitly overridden — no arrow needs to specify more than what actually differs from the norm.

### Gave each WelcomeScreen arrow its own optional left/right, up/down nudge
*2026-07-31 · Feature*

Shivam wanted to shift individual arrows sideways without disturbing the others — but `ARROW_GAP`/`ARROW_TIP_GAP`/`CURVE_BEND` were all shared constants applied to every arrow equally, and the angle argument in `arrowFromAngle()` controls direction, not a flat pixel offset. Added two new optional parameters, `offsetX` and `offsetY`, to `arrowFromAngle()` — they shift an arrow's start, control, and end points together in flat screen-space, after the angle-based geometry is computed, so the arrow keeps pointing the same way but the whole shaft slides over. Both default to `0`, so all six existing calls (which don't pass them) render pixel-identical to before — purely additive, no risk to the current layout.

### Fixed arrow tips getting hidden behind the bowl image on WelcomeScreen
*2026-07-31 · Bug*

Shivam wanted the nutrient-callout arrows to dip slightly inside the bowl's ring instead of stopping right at its edge. Making that geometric change (a negative `ARROW_TIP_GAP`, pulling each arrow tip inward toward the bowl center) worked correctly, but the arrows then visually vanished — because React Native draws JSX elements in the order they appear, and the `<Svg>` arrows were declared *before* the `<Image>` bowl in the markup, so the bowl painted over them like a later Photoshop layer covering an earlier one. Fixed by moving the `<Svg>` block to right after the `<Image>` element, so arrows now draw on top of the bowl instead of underneath it — same coordinates, same math, just reordered paint order. Good reminder that in RN/CSS-like layout systems, "where is it positioned" and "what's on top" are two separate questions with two separate answers (coordinates vs. render/DOM order).

### Moved the WelcomeScreen bowl illustration up as one rigid cluster
*2026-07-31 · Feature*

Shivam wanted the bowl on the "Get Started" welcome screen nudged up, but was worried it'd knock the six nutrient arrows and labels (Calories, Protein, Carbs, Vitamins, Fat, Minerals) out of alignment. Turned out the arrows were already safe — they're computed from the bowl's center via `polarPoint()`, so they follow the bowl automatically. The labels weren't, though: their `box.top` values in `CALLOUTS` were independent fixed canvas coordinates. Added one shared constant, `DESIGN_CLUSTER_SHIFT_Y = 40`, subtracted from both `DESIGN_BOWL_CENTER_Y` and every label's `top`, so the bowl, arrows, and labels all translate up together as one rigid group instead of drifting apart. One number to tweak later if Shivam wants more or less shift.

### Started tracking deferred design issues in a new BUG.md
*2026-07-31 · Decision*

Shivam wanted to tweak the arrows and bowl position in the splash screen image, but when we actually looked at `assets/splash-icon.png`, it turned out to be a single flattened blue chevron with no bowl in it at all — a rasterized PNG, not something we can nudge pixel-by-pixel with any precision. Rather than guess at a redesign, we're parking it: created `BUG.md` at the repo root as a lightweight home for known issues that need a real look later (separate from `DEVLOG.md`, which is the story log, not a task tracker). First entry logs the splash asset issue and notes the open question of whether to regenerate it from the Claude design system reference or start from a new reference image.

### Two more edge-to-edge cleanup items: a stray SafeAreaView import and a stale warning
*2026-07-28 · Bug*

Two more console warnings to chase down, and they turned out to be very different in size. The real one: four auth screens (`WelcomeScreen`, `LoginScreen`, `SignupScreen`, `SetNewPasswordScreen`) were still importing `SafeAreaView` straight from `react-native` instead of `react-native-safe-area-context` — the other 12 screens in the app already had this right, so this was just four leftover stragglers from before that convention was established. React Native's own `SafeAreaView` only ever worked properly on iOS and has been formally deprecated in favor of the community package (which is also what React Navigation itself relies on internally); Expo SDK 54 / RN 0.81 just started actually surfacing the warning in the console. Swapped the import in all four — same component, same props, zero behavior change, just silences the warning.

The second one, `setPositionAsync is not supported with edge-to-edge enabled`, turned out to already be fixed — grepped the whole codebase and there's no `setPositionAsync` call left anywhere. Another session working on this same repo had already rebuilt `WelcomeScreen` (new flat cream design, replacing the old photo-background version) and dropped that call along with the `setBackgroundColorAsync` one from the last round of edge-to-edge cleanup. So that warning was almost certainly a stale one from a Metro bundle cached before the rebuild landed, not a real leftover in the code. `tsc` clean, 171 tests still passing.

### A batch of 14 fixes, one real bug hunt, and a mistake we caught fast
*2026-07-28 · Bug*

Shivam dropped 15 new items into `BUG_FIX.md` — onboarding polish, a home-screen keyboard bug, reminder drums, a "coming soon" nav cleanup, and a Go Premium message. We worked through them one by one, checking in with Shivam whenever a fix touched something ambiguous (the onboarding unit-toggle pairing, the scope of "fix the calorie card," the exact meaning of "AI text above the food card") instead of guessing. We also attempted a meal-card header redesign against a reference image Shivam sent — got it wrong on scope ("not ready for this yet"), reverted it cleanly back to the original card, and left it parked for a future session. Good reminder that a confirmed reference image doesn't mean the whole surrounding change is greenlit — worth checking readiness, not just design, before a structural rewrite.

The most interesting one was the "AI text should be above the food log card, even after restart" bug. Turned out to be a genuine backend bug, not a UI issue: the `log-food-from-text` Edge Function's `saveChatTurn()` stamped the user's own chat message with `new Date()` called at the *end* of the request — after the `meal_log` row (created earlier in the same request, with its own DB-default timestamp) already existed. So on reload, sorting by `created_at` put the meal card *before* the user's own message that created it. Fixed by capturing the timestamp once at the top of the request handler and reusing it for the user's row, then redeployed the function live.

The reminder-screen drum bug was the other interesting case — Shivam described it as "frozen/unresponsive," which is the exact symptom of a known Android Modal + nested-ScrollView bug that had already been fixed once in a sibling component (`ChangeDateTimeSheet.tsx`). But comparing the two files line by line, `ReminderTimeSheet.tsx`'s drum implementation was already byte-for-byte identical to the fixed version — no nested scroll, no double-modal. We couldn't reproduce or root-cause the freeze from code alone. What we could confirm and fix: the AM/PM picker was still a static label, never upgraded to a real interactive drum like the other two — so we rebuilt it using the exact proven 3-drum pattern (hour-12 + minute + period) and flagged the freeze itself for an on-device recheck rather than claiming a blind fix.

### Silenced the (expected, harmless) Expo Go push notification warning
*2026-07-28 · Bug*

Shivam saw `expo-notifications: ... functionality ... was removed from Expo Go with the release of SDK 53` while running the app. Not a regression — Expo Go itself dropped push-token support in SDK 53, and this was already known and planned around (documented in the `expo_go_native_module_constraint` memory, and called out as a testing caveat in earlier session notes). The actual gap was in `pushNotifications.ts`'s guard: it checked `Device.isDevice` (real hardware vs. simulator) but had no check for *which app* is running — a physical phone running Expo Go still trips this, since Expo Go itself can't hold a push token regardless of the hardware underneath it. Added a check for `Constants.appOwnership === 'expo'` at the very top of `registerForPushNotificationsAsync()`, so the function returns immediately, before ever calling anything push-related, whenever it's running inside the Expo Go client specifically. Confirmed no new `tsc` errors. Real push registration still needs testing via the existing EAS build, not Expo Go — that hasn't changed, this fix just stops the noisy (but harmless) warning from firing during normal Expo Go development.

### Two runtime warnings, two different root causes
*2026-07-28 · Bug*

Two console messages showed up together, but they had nothing to do with each other. The `setBackgroundColorAsync is not supported with edge-to-edge enabled` warning is a platform change, not a bug in our code: Expo SDK 54 turned on Android's "edge-to-edge" mode by default, where the system nav bar background is always transparent by OS policy — no app can tint it anymore, full stop. `useScreenChrome.ts` and `WelcomeScreen.tsx` were both still calling `NavigationBar.setBackgroundColorAsync()` per-screen, which is now a guaranteed no-op that just logs a warning every time. Removed both calls and kept only `setButtonStyleAsync` (icon color), which edge-to-edge still honors.

The second one — `Cannot update a component while rendering a different component` — was a real bug in `TypewriterText.tsx`. Its `onDone` callback was being invoked from *inside* the `setWordCount(prev => ...)` updater function, and since `WelcomeBubble` passes `onDone={() => setIntroDone(true)}`, that meant one component's state updater was triggering another component's `setState` mid-update — exactly what that React warning exists to catch. Fixed by moving the `onDone` call into its own `useEffect` watching `wordCount`, so it fires as an independent, properly-scheduled update instead of a nested one. Good reminder that a `setState` updater function should only ever compute and return the next state — no side effects, no calling other functions that themselves update state.

### Notification platform is live end-to-end: Edge Functions, real types, admin dashboard running
*2026-07-28 · Milestone*

Finished the deployment side of the push notification platform. Confirmed all four Edge Functions (`register-push-token`, `send-scheduled-notifications`, `generate-template-variants`, `admin-send-notification`) were already ACTIVE — from the same earlier testing session that left migration 013 untracked — and redeployed all four anyway to guarantee the live code exactly matches what's in the repo right now, since Supabase's own `sha256` in `functions list` hashes its bundled output, not the raw source, so there was no cheap way to confirm a match without redeploying.

Regenerated `src/types/database.ts` for real via `supabase gen types typescript --linked`, replacing the hand-patched stopgap from earlier — diffed it first to confirm the notification tables and `is_admin`/`timezone` matched what had been hand-typed, then swapped it in and re-ran `tsc --noEmit` clean. Noticed in passing that `saved_entries` (from the unrelated, still-`migration list`-unapplied `014_saved_entries.sql`) also already exists live, same untracked-migration situation as 013 — didn't touch it, that's not this work.

Set `profiles.is_admin = true` for Shivam's account after confirming the id belonged to "Shivam Bhawsar" first. Wrote `ting`'s `.env.local` (Supabase URL, anon key, service-role key — gitignored, confirmed via the existing `.gitignore` rules) and smoke-tested the dev server: booted clean, `/` correctly 307-redirects to `/users`, `/login` renders 200. That's the whole chain (`requireAdmin()` → redirect-to-login-when-logged-out) working as designed. Backend is now fully deployed and reachable; what's left is purely Shivam's to do — log into `ting` locally, and whenever ready, decide on pushing the repo to GitHub / deploying it somewhere.

### `db push` collided with itself — migration 013 was already live, just untracked
*2026-07-28 · Bug*

`supabase db push` failed immediately on migration 013 with `column "is_admin" of relation "profiles" already exists`. Checked the live table directly and confirmed the column really was already there — plus, checking further, so were all four new notification tables, the `pg_cron`/`pg_net` extensions, the `find_due_reminders()` function, and the cron job itself, already scheduled and running every 5 minutes. None of this went through `db push` — it landed from the earlier session's `supabase db query --linked` calls (used to test the Vault-secret fix), which run arbitrary SQL directly against the database and have no concept of "this is migration 013," so Supabase's own migration-tracking table never got told 013 had run. `supabase migration list` still showed 013 as unapplied on the remote side even though its contents were fully live — tracking state and actual state had split apart.

The fix is `supabase migration repair --status applied 013 --linked`, which only edits Supabase's internal migration-history bookkeeping (a small metadata table) — it does not touch `profiles`, the notification tables, the cron job, or anything else. Confirmed nothing else changed by checking that all four tables were still present and still empty (0 rows, since no real data has been sent yet), the cron job still existed, and both Vault secrets were untouched, all before and after the repair. `migration list` now shows 013 as applied on both sides, matching reality; migration `014_saved_entries.sql` (someone else's in-progress work, untouched by any of this) correctly still shows as unapplied.

The lesson: `supabase db query` is a raw SQL execution tool, not a migration tool — running migration content through it works for testing, but it silently detaches the database's *actual* state from what the migration tracker *believes* happened, and the two need to be manually reconciled with `migration repair` afterward if that gets mixed with real `db push` usage on the same project.

### Fixed a real bug in the cron job's secret handling — hosted Supabase has no superuser
*2026-07-28 · Bug*

Migration 013's cron job was designed to read its Edge Function URL and service-role key via `current_setting('app.settings.*')`, set once with `ALTER DATABASE ... SET`. That's the standard pattern on a self-managed Postgres box, but it assumes superuser rights — and confirmed by actually trying it against the linked project, hosted Supabase rejects it outright (`permission denied to set parameter`), since Supabase deliberately doesn't grant superuser on managed projects. Replaced it with Supabase's own supported answer: **Vault**, an encrypted secrets table built into Postgres (`vault.secrets`, readable back out via `vault.decrypted_secrets`) — think of it as a secrets manager living inside the database itself rather than an OS-level env var. `supabase_vault` turned out to already be enabled on the project by default, so no extra setup was needed beyond calling `vault.create_secret(value, name)` twice (once for the Edge Function URL, once for the service-role key) via `supabase db query --linked`, then updating the cron job's `net.http_post` call to pull both from `vault.decrypted_secrets` instead of `current_setting`. Verified both landed correctly by querying `vault.secrets` for just the names (never the decrypted values) afterward. Migration 013 hadn't been pushed to the live project yet when this was caught, so no already-running cron job needed fixing — just the file, before it ever went out.

### Tunnel mode broke with "remote gone away" — a stale ngrok client, not an outage
*2026-07-28 · Bug*

`npx expo start --tunnel` started failing with `CommandError: failed to start tunnel — remote gone away`, which sounds like an ngrok outage but wasn't — ngrok's own status page was green the whole time. The real cause: `@expo/ngrok`, the npm package Expo's CLI calls internally for `--tunnel`, is a completely separate thing from the system `ngrok` binary (we have both installed, at different versions), and Expo only ever uses its own bundled copy. That copy's local install was stale, so its tunnel handshake no longer matched what ngrok's relay servers expect. Fixed by uninstalling `@expo/ngrok`, deleting `node_modules/.cache` and `.expo`, then reinstalling and relaunching with `expo start --tunnel --clear` — confirmed "Tunnel connected. Tunnel ready." on the next run. No app code involved; this was dev-tooling plumbing one layer below React Native itself.

### Built ting — the admin dashboard for the notification platform, in its own repo
*2026-07-28 · Milestone*

Companion piece to the backend work from earlier today: a Next.js (App Router + Tailwind) admin dashboard, in a fresh separate repo (`ting`, not inside this one), since a React Native app has no server side to safely hold a Supabase service-role key and a web dashboard does. Login reuses STEADY's existing Supabase Auth (`auth.users` — log in with the same account), gated by a single `requireAdmin()` check that verifies `profiles.is_admin = true` via the service-role client before any admin page renders anything. Everything else — the actual admin data reads/writes — happens in Server Components and Server Actions, so the service-role key never leaves the server; the browser only ever holds a session cookie.

Four pages: Users (search, drill into one user's reminder prefs/registered devices/recent notification history), Templates (grouped by reminder type, a "Generate variants" button that calls STEADY's `generate-template-variants` Edge Function through a thin API-route proxy, plus manual add/activate/deactivate/delete via Server Actions), Send (pick a template + target either one user or everyone with a reminder type enabled, proxied to `admin-send-notification`), and Logs (filterable delivery history with sent/failed/opened counts). Since this repo has no access to STEADY's generated Supabase types, hand-wrote a small `database.types.ts` mirroring exactly the tables in migration 013 — same tradeoff as the stopgap in STEADY's own `database.ts` earlier today.

Hit one real build error worth remembering: `next build` failed on `/login` with "useSearchParams() should be wrapped in a suspense boundary" — Next.js tries to statically pre-render every page by default, but reading a query string (`?error=not_authorized`) can only happen per-request, not ahead of time. Fixed by splitting the login form into its own component and wrapping it in `<Suspense>` from the page's default export. Full `next build` passes clean after that — all four admin pages and both API routes correctly marked dynamic (server-rendered per request), login and the 404 page static.

Not done yet: hasn't been deployed anywhere (no Vercel project), the STEADY-side migration this all depends on hasn't been pushed to production Supabase, and nobody's account has `is_admin = true` yet. Committed locally in the `ting` repo but not pushed to its GitHub remote — that's Shivam's call to make.

### First Android bundle after the notifications work: Metro couldn't resolve a real file
*2026-07-28 · Bug*

First time reloading on Android since the push-notification backend landed, and the bundler failed hard: `Unable to resolve "./internal/errors" from "node_modules/assert/build/assert.js"`. Traced the import chain — `expo-notifications` → `@ide/backoff` → Node's `assert` module, which doesn't exist in React Native, so a browser polyfill package (also named `assert`) stands in for it. That polyfill's own build output does `require('./internal/errors')` with no `.js` extension, and unlike Node or webpack, Metro doesn't reliably auto-append the extension for relative requires resolved from inside `node_modules` — so it choked on a file that's genuinely sitting right there on disk. This project had no `metro.config.js` at all before now (running on bare Expo defaults), so added one that special-cases just this one module id, appending `.js` only when the request is exactly `./internal/errors` coming from `assert/build/assert.js`, and falls through to Metro's normal resolution for everything else. Couldn't fully verify by launching the actual bundler in this environment (no Android emulator here), so this needs a real `npx expo start -c` + Android reload to confirm — flagging that as the next check.

### Closing out the bug list: a status table for all 24 items
*2026-07-28 · Milestone*

`BUG_FIX.md` started as a wall of raw, unstructured notes — 6 numbered items, several of them bundling 4-5 distinct asks each once you counted every onboarding screen and every Home screen sub-issue separately. Added a status table at the top of the file (kept the original text below, untouched, as the source of record) breaking all of it into 24 tracked rows tagged by type — Bug, Fix, Feature, Experiment, Plan — with a status and a one-line note per row. Final count: 21 done, 1 explicitly deferred because Shivam flagged it as "not thought through yet" (the composer's bottom text box layout), and 1 that isn't app code at all — enabling email verification/OTP is a Supabase dashboard setting, not something to fix in this repo, so it's called out as a standing reminder instead of marked done. Every "done" row was verified against the actual current code, not just checked off from memory.

### Saved Entries: turning any logged meal into a one-tap re-log
*2026-07-28 · Feature*

The last big item on the bug/feature list: let someone save a meal they've logged ("Eggs on toast") as a template, then re-log it later without retyping or re-photographing anything. The key design decision came from re-reading how macros already flow through the app — every `food_entries` row already carries fully-resolved calories/protein/carbs/fat plus a reference into the shared `food_items` cache, resolved once via the cache→USDA→AI-estimate pipeline. A saved entry just **snapshots those already-resolved numbers** into a new `saved_entries` table (one JSONB column holding the item array, since it's always read/written as one atomic blob, never queried per-item). That one decision means re-logging a saved entry is a **plain Supabase insert with zero AI or network cost** — no Edge Function, no OpenAI call, no USDA lookup — it just copies numbers that were already correct.

Built the migration (`014_saved_entries.sql`, standard `auth.uid() = user_id` RLS policy, plus extending `food_entries`'s `source` CHECK constraint to allow `'saved_entry'`), a new `savedEntriesStore.ts` (fetch/save/delete/log-as-new-meal), and a `SavedEntriesSheet.tsx` bottom sheet reusing the same Modal pattern as every other sheet in the app. Two entry points: MealCard's "Add to Saved Entries" row (previously a `Coming soon` placeholder) now actually saves, with a checkmark flash instead of a popup; and a new bookmark button in the Home composer opens the sheet to browse and re-log with one tap — the new meal card appears in the feed instantly, with no "thinking" delay, since there's genuinely no AI step in this path. Wrote 9 new unit tests, including one that explicitly asserts `supabase.functions.invoke` is never called during `logSavedEntry` — proving the "no Edge Function" design holds, not just describing it. Full suite: 171 passed, 1 skipped, tsc clean.

### Built the push notification backend — Expo Notifications, pg_cron, and four new Edge Functions
*2026-07-28 · Feature*

This picks up right where the Reminders screen left off: every action in `reminderStore.ts` had a `TODO` waiting for a real backend, and now it has one. After weighing OneSignal and raw Firebase Cloud Messaging against Expo Notifications (documented in earlier sessions) and landing on Expo Notifications for the delivery layer, we built the whole pipeline — schema, scheduling, and the client wiring — while deliberately keeping AI out of the hot path. Migration `013_notifications.sql` adds `device_push_tokens`, `notification_preferences`, `notification_templates`, and `notification_log`, plus `is_admin` and `timezone` onto `profiles`. This is also the project's first use of `pg_cron`/`pg_net` — a `find_due_reminders()` SQL function does the actual "is it this user's reminder time right now" check entirely inside Postgres using `AT TIME ZONE`, rather than hand-rolling UTC-offset math in JS, so fractional-hour zones (India's UTC+5:30) and DST are handled correctly for free.

Four new Edge Functions: `register-push-token` (mobile client → stores an Expo push token), `send-scheduled-notifications` (invoked only by the pg_cron heartbeat every 5 minutes — checks quiet hours, checks whether the reminder's condition is already satisfied today via a join through `food_entries`/`meal_logs` or `water_logs`, interpolates a template, and calls Expo's push API), `generate-template-variants` (admin-only, calls Claude via OpenRouter to write 3–5 copy variants for a reminder type — this is the *only* place an LLM touches the notification pipeline, called on-demand from the future admin dashboard, never per-send), and `admin-send-notification` (admin-only manual/targeted send, reusing the same interpolate → push → log flow as the scheduled sender). `reminderStore.ts` was rewritten from local-only state to real Supabase reads/writes, with an optimistic-update-then-rollback pattern on toggle/time-change so the UI still feels instant even though it's now a network call. A new `src/lib/pushNotifications.ts` handles permission + token registration + saving the device's IANA timezone, wired into `App.tsx` once a session exists.

Hit one real snag along the way: since `013_notifications.sql` hasn't been applied to the live Supabase project yet, the generated `src/types/database.ts` had no idea the new tables existed, so every `supabase.from('notification_preferences')` call failed to type-check. Hand-wrote the missing table types (`device_push_tokens`, `notification_log`, `notification_preferences`, `notification_templates`, plus `is_admin`/`timezone` on `profiles`) into `database.ts` matching the migration exactly, as a stopgap — these should be thrown away and replaced by a real `supabase gen types` run once the migration is actually pushed. Also had an unrelated scare mid-session: ran `git stash` to sanity-check whether a couple of type errors pre-dated this work, which jumped the whole working tree back to an old commit and briefly looked like it had eaten a bunch of in-progress screens (Progress, reminders, etc.) plus a partially-finished `SettingsScreen.tsx` inline-error change from before this session. Nothing was actually lost — `git stash list` still had it — but the right lesson is: never use `git stash` as a quick diagnostic on a dirty tree with pre-existing uncommitted work sitting in it; `git log -- <file>` or a worktree does the same check without touching anything live.

Still explicitly not built: the admin dashboard itself (that's a separate repo, `ting`, up next), the actual migration hasn't been pushed to Supabase yet, and `expo-notifications` can only be tested on a real device via the existing EAS build — Expo Go dropped remote push support as of SDK 53.

### Batch 5: chat cards reorder on time-edit, calendar dots stop clashing, photos shrink to thumbnails
*2026-07-28 · Bug*

Three smaller fixes rounded out the bug list. First: editing a meal card's logged time via "Change Date & Time" now actually moves the card in the Home chat feed — the sync effect used to patch a card's data in place without ever re-checking its position, so a card moved to 8am would still show up wherever it originally landed in the scroll. Fixed by detecting when `created_at` actually changed and, only then, re-sorting just the meal-card slots among themselves (chat bubbles stay pinned where they are, since they have no timestamp to sort by). Second: the calendar's logged-day highlight, the "today" ring, and the "selected" fill were three independent partial styles stacking in an array with no combined variants, so a day that was both logged and selected showed a wrong mismatched border. Added an explicit priority (selected > today > logged) with real combined styles instead of hoping RN's last-property-wins array merging would sort it out. Third: MealCard's photo went from a 130px-tall banner sitting above the whole card to a 48px thumbnail next to the food-log text, matching what was asked.

### Batch 4: swapping every native popup for the app's own UI
*2026-07-28 · Feature*

The biggest chunk of this pass: React Native's `Alert.alert` is a real OS dialog, not a themeable component, so "no more popup notifications" meant building two real replacements. `ConfirmSheet.tsx` is a bottom-sheet confirm dialog (same rounded-corner, backdrop-tap-to-dismiss look as the existing `ChangeDateTimeSheet`) for anything destructive — delete a meal, a water entry, a weight log, a body measurement — with an optional inline error slot so a failed delete keeps the sheet open for a retry instead of losing the user's place. Everything else (missing-field validation, save/sign-in/sign-up failures, permission-denied messages) became local `useState` + a `<Text>` rendered in red near the relevant field, cleared at the start of each retry so a fixed error doesn't linger.

This touched eleven files in total — both auth screens, Home's camera/gallery permission prompts, Settings' save and delete-account errors (its bespoke type-DELETE confirmation modal was left alone, since ConfirmSheet's simple two-button shape doesn't fit a text-confirmation flow), AdjustMacros, SetNewPassword, the profile drawer's sign-out error, and Water/Weight/BodyMeasurements' delete confirms. Along the way we hit a real scare: two Claude Code sessions were pointed at the same working tree at once, and a stash briefly swept up (then restored) every uncommitted change from both, including a background subagent's half-finished edit to Settings that left state declared but never rendered. Caught it because `git status` stopped matching what we expected, stopped everything, confirmed with Shivam that a second session was open, then re-verified file-by-file against a fresh `git status` before finishing the remaining conversions by hand. Four component test files (Login, Signup, Settings, SetNewPassword) needed updating afterward since they were still asserting against the old `Alert.alert` spy instead of the new inline text — 162 tests green again once that was done.

### Batch 3: units, custom timelines, and a much shorter diet screen
*2026-07-28 · Feature*

Onboarding only ever asked for weight in kg and height in ft+in, with no way to switch — a real gap for anyone who thinks in pounds. `OnboardingStatsScreen` now has a metric/imperial toggle: imperial shows the existing ft+in height drums and a new lbs weight drum, metric shows a single cm height drum and the original kg weight drum. Whatever the user picks is written to `profile.units_system`, the same field Water/Weight/BodyMeasurements/Progress already read — so the choice actually sticks app-wide, not just for onboarding's own math. Everything is still stored in kg/cm underneath; only the displayed drum values convert, at the screen boundary, right before saving. `OnboardingTargetWeightScreen` picks up the same units automatically (reading the profile just saved on the previous screen) and got its own lbs/kg drum swap, plus a free-typed "custom timeline" months field that overrides the four preset chips (1/3/6/12 months) when filled in.

The diet screen went from 10 multi-select chips (Vegetarian, Vegan, Pescatarian, Gluten-free, Dairy-free, Keto, Low-carb, Paleo, Halal, Kosher) down to 4 (Veg, Non-veg, Keto, Low-carb) plus a comma-separated custom text field for anything else ("no peanuts, halal"). Checked first whether this would break anything downstream — `dietary_restrictions` is just a `string[]` that `analyze-food-photo`'s prompt builder `.join(', ')`s into a hint with no special-casing on exact values, so shrinking the preset list and allowing arbitrary custom strings needed no edge-function changes at all.

### Batch 2: chasing down why the drum pickers went blank mid-flick
*2026-07-28 · Bug*

Two separate "the scroll picker is broken" reports turned out to be two different bugs in two different components. `DrumPicker.tsx` (used for age/weight/height in onboarding) only virtualizes a ±8-row window around the selected value for performance — mounting all 221 rows for a weight picker would be real jank — but it only re-centered that window in `onMomentumScrollEnd`, i.e. after a fling fully stopped. Flick it hard enough and the visible area outran the mounted rows mid-scroll, showing blank space until the fling settled. Fixed by also re-centering the window on the raw `onScroll` event (via the `listener` option, which runs alongside `useNativeDriver: true` without breaking the native-driven fade animation), so the window can never fall behind a fast flick.

`ChangeDateTimeSheet.tsx`'s time picker had a different problem: its own lighter drum component, `SimpleDrum`, was nested — vertical `ScrollView` inside a vertical `ScrollView` (the sheet's outer body). That's a classic Android gesture-arbitration conflict where the outer scroller wins the touch and the inner drum never gets to move, which reads exactly like "the drum is frozen." Swapped the outer wrapper to a plain `View` — the calendar grid plus one row of drums is a fixed height well under the sheet's cap, so it never actually needed to scroll. While in there we also built the real AM/PM picker Shivam asked for: the old version only computed AM/PM as a text label from a 24-hour value with no way to actually change it. Now Hour is a proper 12-hour drum (1–12) and there's a third scrollable drum for AM/PM, converted back to 24-hour under the hood via two small helpers (`to12Hour`/`to24Hour`) right before saving.

### Batch 1 of the big bug-fix pass: status bars, the vanishing "S" icon, and a typewriter greeting
*2026-07-28 · Bug*

Shivam handed us a single `BUG_FIX.md` with ~20 bugs, features, and experiments across nearly every screen, so before touching anything we had a background research pass map every item to real code — turned out a few "bugs" (Terms/Privacy links, the TDEE formula, meal deletion) were already working correctly, and the real complaint was elsewhere (an ugly `Alert.alert` popup, not a broken link). We're working it in ordered batches rather than one long grind so quality doesn't drop off on item 15 of 20. Batch 1: status bar and Android nav bar color were completely inconsistent app-wide — some screens hardcoded a transparent bar, most just read `StatusBar.currentHeight` for padding and never actually set a style, so screens inherited whatever the previous screen last configured (StatusBar is a global OS overlay, not a real component in the tree). We installed `expo-navigation-bar` (SDK-54-matched via `expo install`) and wrote one shared hook, `useScreenChrome(bg, iconStyle)`, that every screen now calls once to pin its own status bar and Android nav bar color — no more cross-screen bleed.

We also removed the blue "S" avatar bubble from chat everywhere it appeared — `ChatBubble.tsx` (used by all six onboarding screens) and five separate inline occurrences on `HomeScreen.tsx`, which turned out to have its own hand-rolled copy of the same avatar markup instead of reusing the shared component. Built a first-time typewriter greeting for the Home welcome bubble (`TypewriterText.tsx`, word-by-word reveal on a plain `setInterval` — no animation library needed) with three rotating greeting variants. Added a real "Skip for now" on the very first onboarding screen that jumps straight to Home; since none of the profile/goal data exists yet in that case, Home now shows a "finish your profile" prompt card instead of a calorie ring with made-up numbers, linking straight to Settings.

### Reminders start all-off, not pre-populated
*2026-07-28 · Bug*

Shivam caught that the reference screenshot's "3 active by default" state was just the mock's example data, not something we should actually ship — a fresh install shouldn't silently assume the user wants Workout, Track Meal, and Water reminders firing before they've touched the screen. Flipped all 7 entries in `DEFAULT_REMINDERS` (`reminderStore.ts`) to `enabled: false`, so "Active Reminders" starts empty (the card is conditionally rendered only when non-empty, so it just doesn't show) and every reminder lives under "Reminders you can set" until the user taps SET and picks a time themselves.

### Built the Reminders screen — UI first, delivery mechanism deliberately deferred
*2026-07-28 · Feature*

The side drawer has had a "Reminders" row since early on, but tapping it just popped a "Coming soon" alert — there was no screen behind it. Shivam wanted the real UI built to match a reference screenshot (an Active Reminders section with EDIT actions, and a "Reminders you can set" section with SET actions), but the actual notification delivery mechanism is still an open decision — local `expo-notifications` scheduling vs. a full push pipeline (Supabase + pg_cron + Edge Function) — and so is whether reminder prefs live on-device or sync through Supabase. So we scoped this pass to exactly the screen: all 7 reminder types from the mock (Workout, Track Meal, Water, Walking, Log Weight, Health Log, Medicine), backed by a new `reminderStore.ts` that's entirely local/in-memory for now. Every action that will eventually need to call `Notifications.scheduleNotificationAsync()` or write to Supabase is marked with a `TODO` comment instead, so swapping in real persistence later only touches the store's internals, not the screen or navigation.

Built three new files — `reminderStore.ts` (Zustand state), `ReminderTimeSheet.tsx` (a bottom-sheet time picker), and `RemindersScreen.tsx` (the screen itself) — plus wired up navigation across `types.ts`, `AppNavigator.tsx`, and `ProfileDrawer.tsx`'s existing (previously dead) Reminders menu entry. The time picker reuses `ChangeDateTimeSheet.tsx`'s `SimpleDrum` component almost verbatim rather than reinventing it, since that component already carries a real fix for an Android bug: the more common Animated-driven drum picker (`DrumPicker.tsx`) doesn't lay out correctly inside a `Modal` on Android, and `SimpleDrum`'s plain-`ScrollView`-with-`snapToInterval` approach was written specifically to route around that. Confirmed zero new `tsc` errors introduced (same pre-existing Deno-only errors in `supabase/functions/**`, untouched). Couldn't visually verify in a running app this round — no Android/iOS emulator or device is attached in this environment (`adb devices` came back empty) — so this still needs a real look via Expo Go on-device before calling the visuals final.

### Progress screen v2 — trend weight, an auto-estimated TDEE, and a smarter insight engine
*2026-07-28 · Feature*

Shivam asked us to make the Progress screen richer and pointed us at competitor apps for ideas, so we researched MyFitnessPal, Cal AI, MacroFactor, Lose It!, and Noom before writing any code. The clear standout: MacroFactor's Trend Weight + auto-adjusting TDEE (Total Daily Energy Expenditure) estimate is the single most-cited "why I switched apps" feature, and — unlike a lot of "AI insights" marketing — it's a real algorithm, not a reskinned chart, computable entirely from data we already had (calorie logs + weight logs). We built it: `weightStore.ts` gained `computeWeightTrend()`, an EWMA (exponentially weighted moving average) that smooths noisy day-to-day weigh-ins into a real trend line, with the smoothing factor scaled up for bigger gaps between log entries so infrequent weigh-ins still move the line sensibly. A new `tdeeStore.ts` uses energy-balance math (avg calories eaten vs. trend-weight change, using the standard ~7700 kcal/kg approximation) to estimate true maintenance calories, gated behind a 14-day minimum data requirement so it doesn't show a garbage number to a brand-new user, with a one-tap "update my goal" button wired to the existing profile update function. We also expanded the single hardcoded insight sentence into a small rule-based priority engine (`insights.ts`) that now considers streak milestones, the new TDEE estimate, weekend-vs-weekday eating patterns, and a best-week comparison — and added a current+best streak card, reusing the schema's already-defined-but-never-used `streaks` table concept purely client-side rather than standing up a new DB trigger for it this round. A small "Body Measurements" trend card also now links out from Progress, since that screen existed but had no path into it before.

### Built the Progress Charts screen — the "Coming soon" alert finally does something
*2026-07-28 · Feature*

Shivam asked us to design and build the "Progress Chart" section, so we started by pulling the canonical mockup from the Claude Design project rather than guessing — turned out "Progress Chart" in the design is actually a full "Weekly Report" screen (`ProgressScreen` in `steady-screens-c.jsx`): a week navigator, a daily calorie/macro breakdown list, weekly average bars per macro with an AI insight line, and the weight trend chart at the bottom. We confirmed scope with Shivam before building since a narrower "just the chart" reading was also plausible. Good news on the data side: almost nothing new was needed. The `daily_summaries` table already has one pre-aggregated row per user per day (calories, protein, carbs, fat), so the whole daily-breakdown and weekly-averages sections are just one new range query away — we added `fetchWeek()` to a new `progressStore.ts`, following the exact same Zustand pattern as the existing `weightStore`. The weight-trend chart section reuses the same SVG line-chart math already living in `WeightScreen.tsx`. We also discovered the Profile drawer already had a "Progress Charts" row sitting there since early on, wired to a `Alert.alert('Coming soon')` — flipping its `action` from `'comingSoon'` to `'navigate'` was the one-line payoff of finally building the screen it was always meant to open.

### Mapping out the Play Store release path
*2026-07-13 · Decision*

Shivam asked for the full step-by-step to get STEADY's first build onto the Google Play Store, so before touching anything we audited the current config: `app.json`, `eas.json`, and `package.json`. Confirmed STEADY is a pure Expo managed-workflow app — no `android/` folder checked in — which means the Play Store bundle has to come from EAS Build (Expo's cloud build service) rather than a local `gradlew bundleRelease`, since there's no native project to run Gradle against locally. `eas.json`'s `production` profile is already set up correctly with `"buildType": "app-bundle"` (Google requires `.aab`, not `.apk`) and `"autoIncrement": true` for `versionCode`, so no changes were needed there. Also checked `src/` for any client-side OpenAI/Claude API key usage that would need adding to `eas.json`'s env block — found none, only Supabase keys, which strongly suggests the AI food-photo and nutritionist calls are routed through a Supabase Edge Function server-side. That's the right call security-wise (secret keys embedded in a mobile bundle can be extracted by anyone), so we didn't touch the build profile. No code was written this session — just explained the release pipeline (`eas build` → Play Console listing → `eas submit` or manual upload) since Shivam hasn't shipped a mobile app to Play before.

### Closing out the last two edge cases — a real AI water-log and a real calendar tap
*2026-07-13 · Milestone*

Went back through `TEST_SCENARIOS.md` looking specifically for Edge-tagged rows marked E2E that hadn't actually been built yet, and found two: §3.3 (a chat message that isn't food but makes the AI call `log_water` server-side) and the full version of §10.4 (actually picking a day on the calendar, not just opening/closing the sheet). Both now pass, first try, no bugs found — but both needed a bit of care to test honestly rather than just get a green checkmark.

### Pulling Supabase credentials out of `eas.json` before the real production build
*2026-07-13 · Decision*

Before kicking off the actual production build, we caught `eas.json` committing the Supabase URL and anon key in plain text under both the `preview` and `production` build profiles — the same pattern that caused an earlier leaked-credentials incident this project already had to scrub from git history. Rather than repeat it, we moved both values into EAS's own secret store (`eas env:create`, scoped per-environment) and stripped the literal `env` blocks out of `eas.json` entirely. EAS auto-injects environment variables that match a build profile's name at build time, so the build behaves identically — the only thing that changed is where the secret lives. The anon key itself is lower-risk than a service-role key (it's constrained by Postgres Row Level Security on the Supabase side), but "lower risk" isn't a reason to keep committing it.

### Confirmed the privacy policy blocker was already solved, just undocumented
*2026-07-13 · Bug*

`ROADMAP.md` still listed the Play Store privacy-policy requirement as a pending blocker, citing a separate `steady-legal` repo that needed to be pushed to GitHub and have Pages turned on. Checked it directly: the repo is pushed, and `curl` against all three live URLs (privacy, terms, delete-account) returned `200`. The blocker was actually cleared days ago — the roadmap doc just never got updated to reflect it, which is worth remembering next time a "still pending" note is trusted at face value instead of re-verified.

### Local dev environment was quietly broken since the last dependency bump
*2026-07-13 · Bug*

Running the test suite ahead of the production build surfaced a broken `node_modules`: `expo-modules-core` was missing entirely, and a plain `npm install` failed outright on a peer-dependency conflict (`jest-expo@57.0.1` wants `react@^19.2.3`, but the app is correctly pinned to `react@19.1.0` for Expo SDK 57 compatibility — a devDependency-only mismatch upstream in the `jest-expo` package itself, not something in our control). Fixed it three ways: reinstalled with `--legacy-peer-deps` (the standard, well-worn escape hatch for this exact class of RN peer-dep conflict), added `expo-modules-core` as an explicit direct dependency since nearly every native Expo module in this project actually needs it and it was only ever present as an unhoisted transitive copy nested inside `expo`'s own `node_modules`, and added the oddly-named `test-renderer` package (a real npm package, a thin wrapper around `react-test-renderer`) that `@testing-library/react-native@14` declares as a peer dependency but which was never installed. None of this touches what ships in the actual APK/AAB — `jest`, `jest-expo`, and the testing-library packages are devDependencies that never leave the build machine — but a broken local install meant nobody could actually run the test suite before shipping, which defeats the point of having one.

### A test that hardcoded "today" quietly broke the day after it was written
*2026-07-13 · Bug*

With the test environment fixed, one real failure showed up in `bodyMeasurementsStore.test.ts`: a test asserting that logging a second measurement field (say, hips, after already logging waist earlier the same day) merges into one row instead of creating a duplicate. Traced it back to the test fixture, not the store — the fixture hardcoded `logged_date: '2026-07-12'` for its fake "server response," but the store computes the real `today` via `new Date()` at call time, and today is actually `2026-07-13`. The store's local-state merge logic filters out "today's" old entry before appending the new one; since the fixture's fake date no longer matched the real `today`, the filter silently stopped matching and both fake rows survived, failing the length assertion. The store code itself was correct the whole time — this was purely a stale fixture that happened to keep passing for exactly one calendar day. Fixed by computing `TODAY` once from a real `new Date()` at the top of the test file, same pattern the range-cutoff tests in the same file already used, instead of a hardcoded string.

### First production build attempt failed — `--legacy-peer-deps` doesn't travel with you
*2026-07-13 · Bug*

Kicked off the real `eas build --platform android --profile production` and it failed at "Install dependencies" within 15 seconds — the exact same `npm install` peer-dependency conflict we'd hit and fixed locally (`jest-expo` wanting a newer React than the app targets), because fixing it locally with a one-off `--legacy-peer-deps` flag on the command line doesn't help EAS's cloud build machine, which runs its own plain `npm install` with no memory of how we installed things on our laptop. The real fix was a `.npmrc` file at the repo root with `legacy-peer-deps=true` — npm reads this automatically on every install, in every environment, so the flag becomes a property of the project instead of a fact you have to remember to type. Verified it works with a from-scratch install in a throwaway directory (copying only `package.json`, `package-lock.json`, `.npmrc` — no reused `node_modules` or npm cache) before committing and retriggering the build, since burning another 10-15 minute EAS build cycle just to test a guess would've been wasteful.

### Second build attempt got further, failed bundling JS — a missing Node polyfill for `react-native-svg`
*2026-07-13 · Bug*

The retriggered build got past dependency install this time and failed later, in the "Bundle JavaScript" phase — Metro (the bundler that turns all our TS/JS into one file the phone can run) couldn't resolve `import { Buffer } from 'buffer'` inside `react-native-svg`'s own source. React Native's JS runtime isn't Node — there's no built-in `Buffer`, `fs`, `path`, etc. the way there would be in a server or Node script, so any library (like `react-native-svg`, which uses `Buffer` internally for handling `data:` URIs) that expects those Node globals needs an explicit polyfill package installed alongside it. Rather than wait another 10+ minutes for a third EAS build to confirm the fix, reproduced the exact same bundling step locally with `npx expo export --platform android` (this runs the identical Metro bundle EAS runs, just without the native Gradle compile after it) — confirmed the error, installed the `buffer` package, reran, and confirmed the module-resolution error was gone (bundling proceeded past it to Hermes bytecode compilation, which fails locally only because this dev machine lacks a full Android/Hermes toolchain — a local-only limitation, not something that should affect EAS's build servers, which provision their own).

### Third build attempt got all the way to Gradle — and hit a genuine bug in Expo SDK 57's build.gradle template
*2026-07-13 · Bug*

Third time was the charm for getting furthest: install fixed, JS bundling fixed, and this attempt reached the actual native Android compile (Gradle) before failing with `Cannot invoke method getAbsolutePath() on null object` at `android/app/build.gradle` line 14. That line shells out to Node to resolve a package called `hermes-compiler` and calls `.getParentFile().getAbsolutePath()` on the result — but `hermes-compiler` isn't a real npm package for `react-native@0.81.5` (Hermes ships bundled inside `react-native` itself, at `sdks/hermesc/`). Traced the exact same lookup in `@expo/metro-config`'s own `exportHermes.js`, where a code comment gave it away: `// react-native 0.83+ moved hermesc to a separate package` — this is a forward-looking path for a future RN version, and Metro's own code wraps it in a try/catch with a working fallback to the real bundled path. The generated Gradle template copied the same lookup *without* the fallback, so it throws uncaught, Node prints nothing, and Groovy's `new File("").getParentFile()` comes back null. This is a real bug in Expo SDK 57's Android template — not anything wrong in STEADY's code — confirmed by checking that `@expo/metro-config@57.0.3` is the current latest release, so there's no patch upgrade waiting to fix it. Since `android/` is regenerated fresh on every build (gitignored, never hand-edited directly), wrote a small Expo config plugin (`plugins/withHermesCommandFix.js`) that patches the broken line right after `prebuild` generates it, every time — pointing `hermesCommand` straight at the real `sdks/hermesc/` path instead of the broken lookup. Verified by running `expo prebuild --platform android --clean` locally and confirming both that the generated file has the patched line and that the path it resolves to is a real, executable file on disk.

### Fourth build attempt got past bundling into deep native compile, then hit a second unrelated upstream bug
*2026-07-13 · Bug*

With the Hermes fix in, the fourth attempt sailed through Metro bundling, dozens of native module compiles, resource merging, and manifest processing — genuinely deep into the real build this time — before failing on a Kotlin compile error inside `expo-modules-core` itself: `Promise.kt`'s `toBridgePromise()` implements `com.facebook.react.bridge.Promise` with `reject(code: String?, ...)` (nullable `code`), but `react-native@0.81.5`'s own `Promise.kt` interface — recently ported from Java to Kotlin — declares every `reject()` overload with a non-nullable `code: String`. A nullable override doesn't satisfy a non-nullable interface member in Kotlin, so it's a genuine, hard compile error: `expo-modules-core@57.0.3` (again, the current latest — no patch upgrade available) hasn't caught up to a real breaking API tightening in RN 0.81.5. Neither of the two previous local checks (`expo export`, JS-only; `expo prebuild`, file generation only) could have caught this — only a real Gradle build invokes the Kotlin compiler, which needs the Android/Kotlin toolchain EAS provides and this dev machine doesn't have.

Used `patch-package` for this one instead of a config plugin, since the bug lives inside a `node_modules` source file rather than a generated one: hand-edited the ten `reject()` overrides in the installed `expo-modules-core` package to match RN's tightened non-nullable `code: String` signature, then ran `npx patch-package expo-modules-core` to snapshot that edit as a small `.diff` committed to `patches/`, and added a `postinstall: "patch-package"` script so the diff reapplies automatically after every `npm install` — local or on EAS, since both run from the same `package.json`. Verified the whole loop for real: deleted `node_modules` entirely, ran a from-scratch `npm install`, and confirmed `postinstall` fired and reapplied the patch on its own, with both this fix and the earlier Hermes config-plugin fix still intact afterward.

### Found the actual root cause — and it made both patches obsolete
*2026-07-13 · Decision*

The fifth build attempt failed with the exact same `KPromiseWrapper.kt:16:26` error as before, even though the `patch-package` fix was confirmed applied and pushed. That was the tell: something else was still resolving to an *unpatched* copy of `expo-modules-core`. Shivam ran `expo doctor` and pasted the results, and it named the real problem directly: `expo-modules-core` should never have been added as a direct dependency (that was an earlier fix in this session, meant to solve a hoisting problem) — and, far more importantly, **21 packages were badly out of date**, including `react-native` itself pinned at `0.81.5` when `expo@57.0.4` actually expects `0.86.0`. The last "chore: update dependencies" commit before this session had bumped `expo` alone without ever running Expo's own dependency-alignment check, so every native module in the app — camera, image picker, secure store, the works — was still on versions built for an older SDK. Every build failure this session, in order, was actually one root cause surfacing in stages: `expo-modules-core` mismatched with `react-native`'s Promise API is exactly what happens when the Expo-managed native modules and React Native itself drift out of lockstep with each other.

Ran the official fixer, `npx expo install --fix`, which upgraded all 21 packages in one pass — `react-native` 0.81.5→0.86.0, `react` 19.1.0→19.2.3, `expo-camera`, `expo-image-picker`, and the rest all bumped to their SDK 57-matched versions. This immediately obsoleted both patches written earlier in the session: at RN 0.86.0, `Promise.reject()`'s `code` parameter reverted to nullable (matching `expo-modules-core` natively, no patch needed — removed the `patch-package` diff), and Hermes's packaging genuinely did move to a real `hermes-compiler` npm package at this RN version, exactly as the forward-looking code comment we'd found earlier predicted (removed the config plugin, since the original unpatched Gradle template is now correct again). Verified locally with a full clean reinstall, a full test run (162/163 passing again after one flaky cold-cache timeout on the first run), a clean typecheck, and — for the first time this session — `expo export` produced not just a bundled JS file but a fully Hermes-compiled `.hbc` bytecode file locally, meaning the exact compile step that failed four times on EAS now succeeds on this machine too. The upgrade also surfaced three real, unrelated breakages: `StyleSheet.absoluteFillObject` was renamed to `StyleSheet.absoluteFill` between these RN versions, breaking three screens (`ProfileDrawer`, `WaterScreen`, `WelcomeScreen`) that spread it into their style objects — fixed by swapping the property name, since the new export is still a plain spreadable style object.

For §3.3, the real risk wasn't the app — it was `WaterHomeCard.tsx`'s `{fmt(totalMl)} {unitLabel}` text, which mixes a literal string with an interpolated value inside one `<Text>`, the exact same pattern that already burned an assertion earlier this session (`Calories: {N}`). Learned that lesson once, so this time the flow verifies success a different way: enable water tracking, confirm zero entries, send "I just drank a big glass of water" to the AI, then check the Water screen's "Today" history section appears where it didn't before — sidestepping the interpolated text entirely. It worked immediately: the AI logged a genuine 500ml entry, timestamped, showing up in the ring and the history list, over a real network round trip through the Edge Function and back.

For §10.4, the earlier best-effort version only proved the calendar sheet opens and closes, because picking a specific day meant tapping plain digit text ("1"–"31") with real ambiguity risk against other numbers on screen. This time we did it properly: pulled a real screenshot of the open calendar already captured earlier in the session, measured the day-grid's column spacing from the "S M T W T F S" header (evenly spaced, ~99px pitch) to derive a coordinate for July 11 rather than guessing, and it landed correctly on the very first attempt. The proof it actually worked wasn't just "the tap succeeded" — the app's own empty-state message spelled it out: "Nothing was logged on July 11," the header switched to "Saturday / July 11," and even the composer's placeholder changed from "What did you eat or exercise?" to the historical-day variant "Ask about this day…" A distinctive meal logged against today (`"calendar test today marker"`) was confirmed gone from the reloaded view — real proof the feed swapped dates, not just that a tap landed somewhere on the grid.

### Seven new E2E flows, seven passes, and a running list of "the text is there but Maestro won't see it"
*2026-07-13 · Milestone*

With the WSL2 blocker gone and the first two flows (signup, login) proven, we went after the rest of `TEST_SCENARIOS.md`'s E2E-tagged rows in one long session: forgot password, sign-out + cross-user data isolation, text food logging (the real AI pipeline), water logging, weight logging, cold-launch navigation/session state, and — last, with explicit sign-off first since it's genuinely destructive — account deletion. All seven now pass. Read the actual screen source before writing each flow rather than trusting the previous session's screen-text notes blind, and it paid off immediately: `WaterScreen.tsx` turned out to have water tracking **off by default** for a fresh account, gated behind an "Enable water tracking" prompt neither of us knew about until we went looking.

The recurring theme this session, though, wasn't new bugs in the app — it was a pattern in how Maestro fails to match text that's genuinely on screen, and we hit three separate flavors of it before it clicked as one lesson instead of three surprises. First: `HomeScreen.tsx`'s calorie summary text (`Calories: {Math.round(...)}`) failed a `visible: "Calories:"` assertion even though the failure screenshot plainly showed "227 kcal" and macro chips rendered correctly — turns out mixing literal text with an interpolated `{expression}` inside one `<Text>` creates separate child text nodes at the React Native level, same underlying issue as nested `<Text>` tags, just triggered by interpolation instead of visible JSX nesting. Second: the calendar's month-nav title ("July 2026") failed an 18-second `assertVisible: "July"` even with the sheet fully open in the screenshot — that component (`DatePickerSheet.tsx`) is *always mounted*, toggled via an `Animated.View` `maxHeight` interpolation instead of conditional rendering, and something about matching text inside that wrapper doesn't behave like a plain element. Swapping to the month pill ("Jul", a structurally simpler `TouchableOpacity`+`Text`) fixed it instantly. Third, much more mundane: Settings is a real scrollable page and "Delete account" sits below the fold — that one was just a missing `scrollUntilVisible`, no mystery at all. The pattern that emerged: when an assertion fails but the screenshot shows the text is there, stop guessing at coordinates or capitalization first — check whether the target `<Text>` is flat, single-node, and conditionally (not animation-toggled) rendered, because that's reliably where the real fault line is in this codebase.

Also worth its own line: we tried `pressKey: enter` to submit the chat composer instead of guessing a send-button coordinate, on the theory that `returnKeyType="send"` + `onSubmitEditing={handleSend}` would fire from a simulated Enter press. It didn't — the failure screenshot showed the message still sitting unsent with the keyboard up, because the same `TextInput` also has `multiline: true`, and RN's Enter-inserts-a-newline-on-multiline behavior wins over `onSubmitEditing`. But that same failure screenshot handed us the fix directly: a real, visible send button at a precise, derivable screen position (93%, 62% with the keyboard open) — one more instance of "let a failure screenshot tell you the real answer instead of theorizing further."

The account-deletion flow got its own explicit go-ahead before running, given it permanently deletes a real row in the live Supabase backend — same throwaway-account convention as every other flow, just with an irreversible outcome instead of a reversible one. It covers all three related scenarios in one pass: the real deletion works, the exact-case "DELETE" confirmation genuinely blocks a wrong-input attempt (typed "delete" lowercase, tapped the button, confirmed we were still on the modal — not deleted), and the deleted email can never log in again afterward, proving it's gone, not just signed out.

### Off WSL2, onto native Windows — both E2E flows pass, and we found two real bugs doing it
*2026-07-13 · Milestone*

Picked up exactly where `WINDOWS_HANDOFF.md` left off: fresh Windows machine, nothing installed. Java (Microsoft's OpenJDK 17, via winget — Maestro is a JVM app under the hood, even though flows are YAML), Android platform-tools, and Maestro CLI all went in clean, and the phone connected on the first try with Windows owning the USB port directly — no `usbipd`, no `vhci_hcd`, none of the bridge machinery that kept failing last session. One real hiccup along the way: a PowerShell command meant to *append* Maestro's folder to the persistent user PATH instead *replaced* the whole thing, because a variable set in one PowerShell tool call doesn't carry over to the next one (each call is a fresh process — only the working directory persists, not shell state). Caught it within the same turn by re-reading the PATH immediately after, and restored it from the exact value we'd captured and printed two steps earlier. Worth remembering: capture-and-print state before mutating it, specifically so a mistake like this is recoverable rather than silent.

First real signup run went end-to-end on the first try — genuine account creation against the live Supabase backend, all six onboarding screens, zero connection drops, landing cleanly on Home. That alone confirms the WSL2 USB bridge really was the entire problem last session; native Windows just doesn't have it. The run still reported FAILED, though, on its very last line — `assertVisible: "kcal"` timed out on Home. A manual `adb exec-out screencap` of the live device showed the calorie summary sitting right there, `0 / 1,644 kcal`, fully rendered — a WhatsApp notification banner had been covering exactly that part of the screen at the instant Maestro's assertion fired, then dismissed itself a few seconds later. A real, if rare, category of physical-device flakiness, not a bug in the app or the flow.

The second attempt taught us something we caused ourselves: running our own `adb` screenshot commands *while* Maestro's background process was also mid-flow, both talking to the same physical device at once, is a bad idea — the run failed with the phone's Camera app open and briefly recording video, almost certainly some input collision between the two concurrent controllers. Lesson locked in for the rest of the session: once a `maestro test` is running, hands off the device entirely — no concurrent `adb` — and only inspect state either before a run starts or after a task-notification confirms it's finished.

With that discipline in place, two *real* bugs surfaced, both pre-existing in the flow files (invisible until an actual full run could ever reach them):

1. **The defensive sign-out guard silently failed on Home.** `runFlow: { when: { visible: "kcal" }, ... }` kept reporting SKIPPED even with the calorie summary genuinely on screen — confirmed by grabbing a live screenshot mid-failure. Traced it to how the calorie text is built in `HomeScreen.tsx`: the number and "kcal" live in a **nested** `<Text>` inside a parent `<Text>`, not one flat string — and Maestro's `visible` selector doesn't reliably match text split across nested Text nodes (a documented category of Maestro issue, not unique to us). Confirmed by comparing against `OnboardingRevealScreen.tsx`'s `"kcal / day"`, which sits in a single flat `<Text>` and passed cleanly in every run. Fix: assert against the chat composer's placeholder text instead — `"What did you eat or exercise?"`, a plain string in a `TextInput`, structurally guaranteed to be one node.
2. **`login.yaml`'s very first tap raced the app's own startup.** Right after `launchApp` reports COMPLETED, the flow immediately tapped the hamburger icon — and `maestro.log`'s timestamps showed that tap firing a mere 6 milliseconds later. `launchApp` completing apparently only means the Android activity is in the foreground, not that React Native's JS thread has finished mounting and wiring up touch handlers yet; the tap landed on the right pixel but nothing was listening. `signup-onboarding-home.yaml` never hit this because its first tap sits behind a `runFlow`/`when` condition, which itself takes several seconds to resolve — an accidental settle delay this flow didn't have. Fix: an explicit `extendedWaitUntil` for the composer text before the first tap.

We nearly shipped a wrong fix first — misread the same nested-Text sign-out bug's symptom in `login.yaml` as a bad tap coordinate (`6%, 8%` vs. the proven `9%, 8%`), edited it, reran, and got the identical failure. The screenshot after the "fix" showed the drawer never opened at all, which is what forced the real timing diagnosis instead. Left the wrong theory's disproof in the file's own comment history rather than hiding it — the corrected comment explains both what was true and what wasn't.

Both flows now pass clean, every step COMPLETED, on the fourth and third attempts respectively. `signup-onboarding-home.yaml` and `login.yaml` are updated in place — same structure the previous session wrote, no rewrite, just the two real bugs and their comments explaining why.

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

### First production build succeeded
*2026-07-13 · Milestone*

Sixth time was the charm. After tracing five straight EAS build failures down through a missing Node polyfill, a broken Expo SDK 57 Gradle template, and finally an entire dependency tree that had drifted out of sync with `expo@57.0.4`, the real fix — running `expo install --fix` to bring all 21 packages back into alignment — produced a clean production build on the first try. STEADY has a real, signed Android App Bundle: versionCode 7, app version 1.0.0, built from commit `a421c29`. Every fix that got us here is committed and will apply automatically to every future build, so this isn't a one-off — the pipeline itself is fixed, not just this build.

### Created a dedicated Play Store reviewer account
*2026-07-13 · Setup*

Google's app reviewers need real login access to test STEADY, and handing them a personal account would expose real health data for no reason — so we created a dedicated Supabase auth user (`shivambhawsar.next+playreview@gmail.com`, a Gmail alias that still lands in Shivam's inbox but reads as a distinct account to Supabase) purely for Play Console's "Sign in details" declaration. Created it via Supabase's Admin API using the service role key rather than through the app's own signup screen, since no device was handy — verified afterward that the `handle_new_user()` trigger fired correctly and created the matching `profiles` row, confirming this account behaves identically to a real signup. The one-off script and the service role key were never written to any file in the repo, only passed as command-line arguments and deleted immediately after running.

### Built the Play Store feature graphic from real design-system tokens, not guesswork
*2026-07-18 · Setup*

Needed a 1024×500 feature graphic for the Play Store listing and had zero source assets — no logo file, no brand kit. Rather than invent a new look, pulled up the existing Claude Design project for STEADY (`steady-components.jsx`, `index.html`) and read the actual CSS custom properties and component styling already defined there: the indigo `#818CF8 → #6366F1` gradient used on the avatar and calorie ring, the exact macro colors (protein blue `#2F6FED`, carbs amber `#F5A623`, fat purple `#9B51E0`), and the soft radial background gradient. Built the graphic as a plain HTML/CSS file using those exact tokens — including a simplified recreation of the real `CalorieRing` component on the right side — so it reads as authentically STEADY rather than generic stock marketing art. Rendered it locally with headless Chrome at 1024×600 and cropped to the exact 1024×500 spec with `sharp` (already a project devDependency), after first catching and fixing two rendering bugs: no network access meant a Google Fonts `@import` silently failed (swapped to the locally-installed Ubuntu Sans, visually close to Inter), and Chrome's headless window sizing left a stray whitespace band that the crop step fixed. Saved to `assets/store/feature-graphic.png`.

### Downgraded from Expo SDK 57 to SDK 54 to match Shivam's Expo Go client
*2026-07-22 · Decision*

Shivam's phone runs Expo Go pinned to SDK 54, but the app had drifted to SDK 57 during last week's `expo install --fix` — so nothing loaded in Expo Go for real device testing. Rather than update the Expo Go app, Shivam explicitly chose to roll the whole project back to SDK 54, since that's the environment he needs to test against right now. Ran the downgrade the same official way the SDK 57 upgrade was originally done — `expo` pinned to `~54.0.9` in `package.json`, then `npx expo install --fix` to snap all 27 `expo-*` and native peer packages (react, react-native, reanimated, worklets, screens, svg, gesture-handler, safe-area-context) to their exact SDK-54-matched versions — rather than hand-picking version numbers, which risks missing a transitive peer requirement Expo's own resolver would've caught.

### Chased down a silent crash in expo config caused by a stray plugin entry
*2026-07-22 · Bug*

After the SDK 54 downgrade, `npx expo-doctor` died instantly with no error message at all — just a bare non-zero exit, no stdout, no stderr, even with Node's own uncaught-exception tracing on. Bisected it by commenting out `app.json`'s six `plugins` entries in halves, then thirds, until it isolated to exactly one: `expo-status-bar`. Turns out `expo-status-bar` is a plain React component (`<StatusBar />`) with no `plugin/` folder or `app.plugin.js` at all — it was never a valid config plugin to begin with. SDK 57's `expo config` tolerated the mistake silently; SDK 54's underlying `@expo/config-plugins` throws when a plugin string can't be resolved. Git blame traced the bad entry back to the exact commit that ran `expo install --fix` for the SDK 57 upgrade — it seems that pass added the line without it ever being exercised, since nothing in `src/` even imports `expo-status-bar` as a component. Removed the one `plugins` entry (kept the package itself installed) and `expo-doctor` went from a silent crash to 18/18 green.

### Confirmed the RN 0.81.5 Kotlin Promise.kt bug doesn't apply to SDK 54's expo-modules-core
*2026-07-22 · Bug*

SDK 54 pins `react-native@0.81.5` — the exact patch version that, per last week's DEVLOG entry, broke `expo-modules-core@57.0.3`'s Kotlin `Promise.reject()` override (RN tightened `code` from nullable to non-nullable, `expo-modules-core@57.0.3` hadn't caught up). Before assuming the downgrade would resurrect that bug, checked SDK 54's actual pinned `expo-modules-core@~3.0.30` directly: `fun reject(code: String, ...)` is already non-nullable on every overload. The two were never actually mismatched — the SDK 57 bug was `expo-modules-core@57.0.3` lagging behind a *newer* RN's tightened interface, and SDK 54's older, matched-at-release `expo-modules-core` was built against RN 0.81.5's interface from day one. No patch needed. Also dropped `expo-modules-core` as a direct `package.json` dependency (it was only pinned there so `patch-package` could target it — with no patch, `expo-doctor` correctly flags direct installs of internal Expo packages as wrong, since `expo` re-exports it) and confirmed the checked-in `postinstall: patch-package` step now runs and correctly finds nothing to apply.

### Fixed StyleSheet.absoluteFill spreads that don't type-check on SDK 54's RN version
*2026-07-22 · Bug*

`tsc --noEmit` failed on three files (`ProfileDrawer.tsx`, `WaterScreen.tsx`, `WelcomeScreen.tsx`) after the downgrade, all with `TS2698: Spread types may only be created from object types` on `...StyleSheet.absoluteFill`. Checked RN 0.81.5's actual source: `absoluteFill` and `absoluteFillObject` are the same object at runtime (`absoluteFillObject: absoluteFill`, a direct alias) — but `absoluteFill` is typed as `declare const absoluteFill: any` while `absoluteFillObject` carries the real structured type, and TypeScript refuses to spread an `any`. Would never have crashed the app itself (JS doesn't care about TS types), but it's a real regression in the typecheck gate, so swapped all three spreads to `absoluteFillObject` — the same property name the code used before last week's SDK 57 upgrade renamed it forward. Confirmed clean with a full re-run: `expo-doctor` 18/18, `tsc --noEmit` zero app-level errors (a pre-existing, unrelated set of Deno-runtime type errors in `supabase/functions/**` remains — those come from typechecking Deno Edge Function code with a Node-configured `tsc` and predate this change entirely), and the Jest suite back to 162/163 passing (the first post-reinstall run threw 8 cold-cache timeouts from Jest rebuilding its Haste map and Babel transform cache from scratch — a clean second run confirmed it wasn't a real regression).

### Sped up photo logging: resize on-device, parallelize the network calls, batch the DB writes
*2026-07-28 · Feature*

Shivam asked why photo analysis felt slow and wanted it fixed, not just diagnosed — so after the earlier research pass mapped out every step of the pipeline, went through and fixed the four highest-impact findings, in priority order.

**Client-side image resize (the big one).** `expo-image-picker` was capturing at 70% JPEG quality but never capping dimensions — a modern phone photo can be 1-4MB as JPEG, which becomes 1.3-5.5MB as base64 text (base64 inflates size ~33%), and that same oversized string gets transmitted twice server-side (once to Supabase Storage, once forwarded to OpenRouter). Added `src/utils/imageResize.ts` using `expo-image-manipulator` (already installed, v14's newer context-based API — `ImageManipulator.manipulate(uri).resize({...}).renderAsync()` then `.saveAsync({ base64: true, compress, format })`, not the deprecated static `manipulateAsync` function from older versions) to cap the longest edge at 1024px before the photo ever leaves the device. That's comfortably enough resolution to read a nutrition label's fine print while cutting a typical multi-MB photo down dramatically — and it shrinks both network hops at once since the same base64 travels both places. Wired into both `handleCameraPress` and `handleGalleryPress` in `HomeScreen.tsx`.

**Parallelized the storage upload with the OpenRouter vision call.** These had zero dependency on each other but ran fully sequentially — restructured `analyze-food-photo/index.ts` so the upload+signed-URL chain and the vision call now run concurrently via `Promise.all`, each wrapped in its own async IIFE. `buildContextLine` (the nutrition-context DB queries) moved inside the vision-call IIFE alongside it, since it only feeds the OpenRouter prompt and was needlessly gating the whole thing before. Error propagation is unchanged — a throw inside either IIFE still rejects the `Promise.all` and hits the same outer `catch`.

**Batched the food_entries inserts.** Both `analyze-food-photo` and `log-food-from-text` had a `for` loop awaiting one `.insert().single()` call per food item — for a 4-item meal, 4 sequential DB round trips where Supabase's `.insert()` already accepts an array natively. Collapsed both into one batched `.insert([...]).select()` call each. Fixed both functions since they had the identical pattern, after checking with Shivam first since he'd only asked about the photo path.

**Investigated `detail: 'low'` and left it alone.** The vision call's `detail: 'low'` hint (cheap low-res tiling, ~85 base tokens vs. much higher for full-res) had a stale comment saying "provider may ignore it" — worth actually checking rather than leaving as an open question. Found a live OpenAI developer-community thread confirming GPT-5 models do have a real bug ignoring `detail`, but it's specific to OpenAI's newer Responses API; the Chat Completions API with standard `image_url` content blocks — which is exactly what this function uses — reportedly still honors it. So no code change here, just replaced the stale uncertain comment with what was actually verified, including the caveat that this is based on a community report, not something independently measured, and worth re-checking if latency ever looks off.

Confirmed via stash-diff that none of this introduced new `tsc` errors (same pre-existing Deno-vs-Node noise in the edge functions, zero errors in the new/touched client files). Deployed both edge functions — `analyze-food-photo` (v10→v11) and `log-food-from-text` (v17→v18). The client-side resize ships separately, on the next app build/reload rather than through a Supabase deploy.

### Fixed photo-log ignoring the user's stated portion size in the caption
*2026-07-28 · Bug*

Shivam caught another one: sent a nutrition-label photo along with the caption "I ate 90 gram of this," and got back macros for 60g anyway — the caption was silently ignored. Traced it and the caption genuinely was reaching the model (it's sent as a normal text content block right alongside the image in the OpenRouter call), the bug was that `SYSTEM_PROMPT` never told the model the caption could specify or override the portion size — every instruction about `quantity_g` said "your best gram estimate based on what you can see" or "your best gram conversion of the label's serving size," with no mention that user-stated text should take priority. The model was doing exactly what it was told; it just was never told the right thing.

Added a "QUANTITY PRIORITY" section to the prompt: the user's accompanying message is the source of truth for portion size whenever it states one (explicit grams, fractions like "half of it," multiples like "2 servings"), and only falls back to visual estimation or the label's stated serving when the message says nothing about quantity.

That alone would've repeated the exact class of bug we just fixed in the edit-entry flow, though — the original label-photo prompt was asking the model to *compute* the scaled macros itself ("label reads 150 cal at 100g, user says 90g → report 135 cal"), which is LLM arithmetic with no code-level check, precisely what burned us before. Redesigned Case 2 instead: the model now reports two raw, unscaled numbers — `label_macros` (exactly as printed) and a new `label_serving_g` (the gram weight those printed numbers are for, e.g. 100 for "per 100g") — and never attempts to scale them itself, no matter what quantity_g ends up being. `resolveLabelFoods()` in `macroResolver.ts` does the actual scaling in code: `label_macros × (quantity_g / label_serving_g)`, deterministically, both for the per-100g cache write and the final logged totals. This incidentally fixed a real latent bug in the original label-photo code too — it had assumed `label_macros` was already scaled to `quantity_g`, so a "per 100g" label logged at any portion other than exactly 100g would've been silently double-wrong even before the caption issue existed. Confirmed via stash-diff that this introduces zero new `tsc` errors in either file (same 9 pre-existing Deno-vs-Node errors, shifted lines). Deployed both `analyze-food-photo` (v9→v10) and `log-food-from-text` (v16→v17) — the latter needed redeploying too since it bundles the same shared `macroResolver.ts` and would otherwise be running a stale copy of the type definitions.

### Fixed edit-entry silently re-deriving macros instead of rescaling them
*2026-07-28 · Bug*

Shivam caught this fast: logged a food from a nutrition label photo (245 cal / 43g carb / 4g protein / 6g fat at 60g), edited the quantity to 90g, and got back numbers with a completely different macro *ratio* (410 cal / 47g carb / 3g protein / 25g fat) — not the ~368 cal a simple linear rescale should've produced. Traced it end to end: `MealCard`'s "edit entry" doesn't have a quantity field at all — it reconstructs the whole meal as one joined text string (`"Bread (2 slices), Tomato (42 g)"`), lets the user edit that raw string, and on save sends the entire thing to `log-food-from-text` exactly like a brand-new food log. That function then deletes every existing `food_entries` row for the meal and re-parses + re-resolves everything from scratch, with zero knowledge of what the old entries were — no `food_item_id`, no `macro_source`, nothing. So a quantity-only edit silently became "forget this was ever a verified label reading, re-guess the food from its name," and the resolver's cache/USDA/AI-match pipeline landed on a different nutrition profile entirely.

The fix needed to survive an AI potentially getting it wrong, not just ask it nicely to behave — Shivan pushed back correctly when we first floated a pure-math-only fix (breaks the moment someone edits the food name, not just quantity) and then again on "just trust the AI with more context" (an LLM told the right numbers can still round differently, ignore the hint, or re-derive from its own training knowledge instead of the one number that's ground truth). Landed on a hybrid: `foodLogStore.editMealFromText` now sends `previous_entries` (name, quantity_g, macros, food_item_id, macro_source) for the whole meal alongside the edited text. `log-food-from-text` injects those as extra system-prompt context on edits only — telling the model "these are the current foods; if a food's identity is unchanged, don't reconsider what it is, only its gram amount" — but that's advisory, not the actual guarantee. The real fix is a deterministic guard added right after the AI parses the edited text: for every parsed food, look up whether its normalized name matches a previous entry; if it does (and doesn't carry a fresh `label_macros` override from a re-scanned label), skip `resolveFoods()` for it entirely and just multiply the *old* entry's macros by `new_quantity_g / old_quantity_g`, keeping the same `food_item_id`/`macro_source`. Only genuinely unmatched foods (name actually changed) fall through to the normal cache→USDA→AI pipeline. This means a pure quantity edit can no longer drift regardless of what the model does with the extra context — the guard overrides it either way.

Fresh food logging (no `meal_log_id`) is untouched — the new rescale-matching logic is gated entirely behind `editMealLogId` being present, so `previousByName` is never even populated on a normal log. Confirmed via a stash-diff that this and the `foodLogStore.ts` change introduced zero new `tsc` errors (same 15 pre-existing Deno-vs-Node errors, shifted line numbers only). Deployed to production immediately after — `log-food-from-text` bumped to version 16. Still needs real testing of the original repro case (label photo → edit quantity → confirm the ratio holds) to fully confirm the fix in practice.

### Deployed the label-photo and clarification-flow changes to production
*2026-07-28 · Milestone*

Pushed migration 012 and redeployed `analyze-food-photo` — the first deploy attempt caught a real mistake before it could bite in production: the migration tried to add `'label'` to a `food_items.macro_source` constraint that doesn't exist, because `macro_source` actually lives on `food_entries` (confirmed by re-reading migration 008 in full — an earlier grep had only matched isolated lines without checking which `ALTER TABLE` they belonged to). Postgres rejected the bad migration cleanly and the whole file rolled back inside its transaction, so nothing was left half-applied — `supabase migration list` still showed 012 as unapplied on remote afterward, confirming the failure was atomic. Fixed the migration to target `food_entries_macro_source_check` (the correct auto-generated constraint name, since migration 008's inline `CHECK` had no explicit name) and re-pushed clean. `analyze-food-photo` redeployed afterward, bumping from version 8 to 9, uploading `index.ts` plus its two shared dependencies (`macroResolver.ts`, `usda.ts`). Both changes are now live — no app store review needed for either, since one's a database migration and the other's a Supabase Edge Function.

### Taught the photo-log prompt to handle nutrition labels and low-confidence guesses
*2026-07-28 · Feature*

Shivam wanted two new cases handled in `analyze-food-photo`: if the photo is of a nutrition label rather than actual food, read the printed macro numbers directly instead of guessing; and if the food genuinely can't be identified, ask the user to type it in chat instead of logging a bad guess. This wasn't a pure prompt-wording change — the resolver architecture's whole point is that the LLM never gets to invent final macro numbers, so letting label photos bypass that required a real, explicit branch in both the prompt's output contract and the code reading it, not just better instructions. Rewrote `SYSTEM_PROMPT` into three explicit cases (regular meal / nutrition label / unidentifiable), each with its own JSON shape: CASE 1 is the existing `{meal_name, foods[]}` schema unchanged; CASE 2 adds an optional `label_macros` object per food item, populated only with values actually printed on the label; CASE 3 returns `{status: "needs_clarification", message}` instead of a food log entirely.

On the code side, `index.ts` now checks for `needs_clarification` first and returns it straight to the app with zero DB writes — no meal log, no resolver call, nothing to log yet since there's nothing confirmed. For food arrays, items are split by whether they carry `label_macros`: label items go through a new `resolveLabelFoods()` in `macroResolver.ts` that upserts them into the `food_items` cache with a new `'label'` source (so a repeat photo of the same product becomes an ordinary cache hit later) and computes macros directly from the label's numbers scaled to the photographed quantity; everything else still goes through the existing `resolveFoods()` cache→USDA→AI-estimate pipeline unchanged. Both resolve in parallel via `Promise.all`, then get merged back into the model's original array order by index (they were split into two differently-sized lists, so simple concatenation would've scrambled the order) before totals are computed and rows get written.

Caught one thing that would've been an easy-to-miss production bug: Postgres enforces its own `CHECK` constraints on `food_items.source` and `food_items.macro_source` (`'usda' | 'indb' | 'ai_estimated' | 'user_created'`, from migration 008) — completely independent of the TypeScript `MacroSource` type. Adding `'label'` to the TS type alone would've compiled fine and then thrown a runtime constraint-violation error the first time a label photo tried to write to the DB, since the database doesn't know about TypeScript's opinion of what's valid. Added migration `012_label_macro_source.sql` to extend both constraints — not yet applied, needs a `supabase db push` before this feature will actually work end-to-end. Confirmed via a stash-diff that no *new* `tsc` errors were introduced by any of this (the pre-existing Deno-vs-Node noise in these files is unchanged, just at shifted line numbers).

### Swapped the photo-log vision model from GPT-4o to GPT-5 mini
*2026-07-28 · Decision*

Shivam wanted to move `analyze-food-photo`'s vision call off GPT-4o onto GPT-5 mini, mainly for cost — GPT-5 mini is meaningfully cheaper per call than GPT-4o. Before touching the code, checked that GPT-5 mini actually supports image input at all: OpenRouter's own model page was ambiguous (it lists a separate `gpt-5-image-mini` variant that bundles a dedicated image-generation model, which could've meant plain `gpt-5-mini` was text-only), so we cross-checked OpenAI's own API docs directly, which confirmed the plain model natively accepts image input alongside text — no need for the `-image-mini` variant. Changed exactly one line, `supabase/functions/analyze-food-photo/index.ts`'s `model: 'openai/gpt-4o'` → `'openai/gpt-5-mini'`, since this function is a Supabase Edge Function (a small server-side program Supabase hosts, not code baked into the app binary) — the model swap ships by redeploying that one function, with zero app store review and zero user update required. Left the `detail: 'low'` image param in place since OpenRouter should pass it through even if GPT-5 mini interprets it differently than GPT-4o did, but flagged it as worth watching post-swap. Did not touch `log-food-from-text` or `macroResolver.ts`, which still run `gpt-4o-mini` for text parsing and macro-matching — this change was scoped to the photo path only. Not deployed yet — since this is live in production, the plan is to test on a staging Supabase project first before running `supabase functions deploy analyze-food-photo` against prod.

### Switched the whole app to TikTok Sans
*2026-07-27 · Feature*

Shivam wanted TikTok Sans as STEADY's main font. Good timing: TikTok open-sourced it on Google Fonts earlier this year (designed with Grilli Type, Contrast Foundry, and Type Network), so it's genuinely free to use — no license workaround needed, confirmed by checking the actual Google Fonts listing and TikTok's own developer blog post before touching any code. Pulled it in via `@expo-google-fonts/tiktok-sans`, which ships one static `.ttf` per weight rather than the single variable font file Google Fonts hosts directly — a better fit for React Native, since RN's text renderer expects a distinct font file per weight anyway rather than one variable file it can interpolate at render time. Loaded four weights matching our existing `fontWeight` scale (regular/medium/semibold/bold) via `useFonts()` in `App.tsx`, holding Expo's splash screen up with `expo-splash-screen` until the fonts finish registering — otherwise there'd be a one-frame flash of the OS system font before snapping to TikTok Sans.

### Rebuilt the Welcome screen from the Claude Design splash concept
*2026-07-28 · Feature*

Kicking off BUG_FIX.md item #1, Shivam pointed us at the "Steady - Splash Screen" file in the Claude Design project instead of describing the layout from scratch. Good thing we checked it first — the real `WelcomeScreen.tsx` was a full-bleed hero photo with a dark scrim and white text, while the design was a completely different concept: cream background, a small circular bowl photo floating dead center, a wordmark + tagline above it, and six handwritten-style nutrient callouts (Calories, Protein, Carbs, Vitamins, Healthy fat, Minerals) radiating outward from the bowl with curved arrows pointing at it. Confirmed with Shivam this was a full rebuild, not a tweak, before touching any code — and confirmed the wordmark/tagline text that had already been deleted in an uncommitted working-tree change was intentional, so we built forward from that empty state rather than restoring the old copy.

Pulled in a new font — Caveat, a handwritten Google Font — via `@expo-google-fonts/caveat`, following the exact same loading pattern TikTok Sans already used (`useFonts()` in `App.tsx`, new `fontFamily.hand*` entries in `theme/typography.ts`). Added `vitamins`/`minerals` to `theme/colors.ts` alongside the existing macro colors, since STEADY's palette had never needed those two before (the app doesn't track vitamins/minerals as loggable macros — they're illustrative-only on this one screen). The six arrows are drawn with `react-native-svg` (already installed, so no new native module), each arrow's curve-and-arrowhead built from the same trig the design file's own JS helper used. Kept the six callouts' label position and arrow endpoint as two fields on one shared array (`CALLOUTS`) instead of two separately-hand-copied coordinate lists, specifically so the labels and arrows can't drift out of sync with each other on a future edit.

Went through a few false starts on layout before landing on the right approach — first tried converting the design's fixed pixel coordinates to percentages so the illustration would "responsively" resize, which broke the arrows away from their labels since the SVG's `viewBox` and the label `View`s scaled independently. Landed on one fixed 390×600 canvas, centered as a single rigid block — same numbers the design used, no conversion math. The bowl photo itself is still the placeholder Unsplash stock photo from the design file, not a real STEADY asset — Shivam knows and will hand off a real one later.

### Fixed the Welcome screen clipping/overlapping on real devices, shrunk the bowl and buttons
*2026-07-28 · Bug*

Shivam sent a real on-device screenshot right after the first pass, and it exposed exactly the risk flagged at the end of the last entry — the fixed 390px-wide canvas was hardcoded to one specific iPhone's reference width, and his actual device is narrower. "Protein" was clipped off the left edge, "Carbs" and "Healthy fat" were clipped off the right, and the fixed 600px canvas height plus the button area together ran taller than his screen, so the bottom two callouts ("Vitamins", "Healthy fat") were sitting underneath the "Get Started" button instead of above it. He also asked for smaller buttons (height only, same width) and a smaller, better-centered bowl.

Replaced the fixed `CANVAS_WIDTH = 390` with a live calculation using `useWindowDimensions()` — a hook that reads the device's actual current screen width, unlike a hardcoded constant. Introduced a `scale = (windowWidth − 2×sidePadding) / DESIGN_WIDTH` ratio and multiplied every ported coordinate by it — bowl position and size, all six callout box positions, and both label font sizes — so the whole illustration now shrinks or grows as one proportional unit to fit any screen, always leaving `SIDE_PADDING` (24px) of guaranteed clear space on both edges. Also tightened the callouts' vertical spread (top callout moved up, bottom callout moved up) so the total illustration height comfortably clears the button area instead of needing the full original 600px band. Shrunk the base bowl size from 262→200 units (before scaling) and both button heights from 56→46, leaving button width/`paddingHorizontal` untouched per Shivam's "don't reduce the width" instruction.

Corrected the LEARNING.md entry from the previous pass, too — it described the canvas as "a fixed 390×600 block," which stopped being true the moment this fix landed; left it accurate rather than letting it go stale, and added a new entry on the general lesson (a mockup's fixed pixel width is a reference frame to scale, not a constraint to hardcode). `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) both still clean, unchanged from before this fix.

### Dropped the Welcome illustration's side margin, confirmed the bowl was already correctly centered
*2026-07-28 · Bug*

Two quick follow-ups from Shivam: "remove the padding" and "add the bowl in the center." First one was genuinely ambiguous — there's padding around the illustration and separate padding around the buttons — so asked which one before touching anything, rather than guessing and risking undoing the exact clipping fix from the previous entry. Turned out to be the illustration's `SIDE_PADDING` (24px), now set to 0 so the bowl+callouts scale to the device's full width instead of a narrower centered strip.

The "center the bowl" part needed more digging before any code changed. Went in assuming it meant vertical position was off — did rough arithmetic on `wordmarkArea` vs. `buttonArea`'s heights (roughly 112px vs. 148px, using the app's actual `spacing` constants) and floated two possible fixes: a quick `minHeight`-balancing hack, or a more robust `onLayout`-measured true-screen-center calculation. Asked Shivam which he wanted rather than picking one — and his answer reframed the actual requirement: he wants the bowl centered specifically *between* the STEADY wordmark and the "Get Started" button, not centered against the literal screen edges. That's a different, better-specified target than either fix on offer, and it turned out the existing layout already produces exactly that — `bowlArea` sits between those two elements as the only `flex: 1` sibling in the column, which in React Native's flex model means it always claims precisely the leftover space between two fixed-size neighbors, and `justifyContent: 'center'` inside it centers within that space. No layout change was needed here at all; asking surfaced that the real spec matched what was already built, saving a rebuild that would've solved the wrong problem. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) unchanged.

### Nudged the Welcome screen's wordmark down and bowl up, a small manual offset on top of the flex centering
*2026-07-28 · Bug*

Shivam wanted the STEADY wordmark a little lower and the bowl a little higher — asked which mechanism he meant for the bowl move specifically, since the illustration is centered by flex layout rather than a fixed position, and there were two different ways to interpret "move it up": shift the illustration within its existing space, or shrink the space itself (which would've also pulled the buttons closer). He confirmed the former, so the button area stays completely untouched by this change.

Two small, independent tweaks: `wordmarkArea`'s `paddingTop` went from `spacing.xxl` (48px) to `spacing.xxl + 20` (68px), pushing the wordmark+tagline block down. The illustration's wrapper `View` (inside `bowlArea`) picked up `marginTop: -28`, pulling it up from its centered position. Because `bowlArea` is still the sole `flex: 1` element between two fixed-size siblings — the same structural guarantee logged after the last fix — growing the wordmark's height automatically shrinks the leftover space `bowlArea` gets, with no compensating math required on the button side; the two changes just compose. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) unchanged.

### Found and fixed a real geometry bug: four of the six arrows were drawing underneath the bowl, invisible
*2026-07-28 · Bug*

Shivam's next screenshot looked genuinely good — clean text, no clipping, no button overlap — but flagged two things: a large empty gap above the illustration, and the arrows barely visible. The gap turned out to be minor (last round's `-28` nudge wasn't nearly enough to counter how much extra vertical room a taller device gives `bowlArea`), but the missing arrows were a real bug, not a sizing issue, and traced cleanly once the actual numbers were checked instead of guessed at: the bowl (`DESIGN_BOWL_SIZE = 200`, centered at `(195, 300)`) has a 100-unit radius, so its edge sits 100 units out from center in every direction — but four of the six arrows (Protein, Carbs, Vitamins, Healthy fat) had endpoints at roughly 95-120 units from center, meaning most of each arrow's length was drawn *underneath the bowl image itself*, which paints over it since the `<Image>` renders after the `<Svg>` in the JSX. Only Calories and Minerals were visible, and only by luck — their arrows point straight up/down at the bowl's top/bottom edge from further away, so more of their length happened to clear the bowl's boundary. This was a leftover math error from re-deriving the callout coordinates two rounds ago when the bowl was shrunk from 262→200 units: the label box positions got recalculated for the new size, but the arrow endpoints didn't get correspondingly moved out to the smaller bowl's actual new edge.

Fixed properly instead of nudging numbers by trial and error: introduced `BOWL_RADIUS` and `DIAG` (the bowl radius projected onto a 45° diagonal, via `Math.SQRT1_2` — the same `cos(45°)`/`sin(45°)` value) as named constants, then rewrote every arrow's six coordinates as an offset from the bowl's actual center and radius rather than hardcoded numbers that happened to almost line up. Any future change to `DESIGN_BOWL_SIZE` now automatically keeps every arrow correctly anchored to the bowl's real edge, instead of silently drifting the way this bug did.

Also reworked how the illustration's height is determined, since a fixed-margin hack was the wrong tool for "too much empty space on a tall screen." Added `onLayout` on `bowlArea` — a React Native callback that fires once the component's real rendered size is known, the same shape as a container asking a child for its measured size after layout — to read the actual available height, then compute `scale` as the smaller of a width-based ratio and a height-based ratio, so the illustration now caps its own size against whichever dimension is tighter instead of assuming width is always the binding constraint. Removed the now-obsolete `marginTop: -28`. One accepted tradeoff: the very first render still uses the width-only scale (height isn't known before the first layout pass), so there's a brief one-frame flash before the height-corrected size takes over — inherent to `onLayout`-based measurement, not a bug. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) both still clean.

### Fixed the arrows for real this time — last round's fix made them visible but accidentally straight
*2026-07-28 · Bug*

Shivam confirmed the arrows were fixed but pointed out something the last entry should've caught: they were straight lines, not the curved ones from the design. Traced it back to the exact edit that fixed visibility — every arrow's `[x1,y1, cx,cy, x2,y2]` had all three points sitting on the same straight ray out from the bowl center (start further out, control point closer, end right at the edge), which correctly solved "arrow tip lands on the bowl's edge" but happened to also make the shaft perfectly straight, since a quadratic Bézier curve only bends when its control point is offset *sideways* from the start→end line, not along it. A visible bug replaced an invisible one, both from the same line of code.

Rebuilt the whole callout system around compass angles instead of raw coordinates — each arrow is now defined by one angle (0° = straight up from bowl center, clockwise, plus a bend direction), and two new small functions do the actual geometry: `polarPoint()` converts an angle + distance into an x/y point via `sin`/`cos` (the same trig STEADY's arrowhead code already used, just applied to placement instead of the chevron shape), and `arrowFromAngle()` builds the full six-number tuple by putting the start and end points on the same ray from center (guaranteeing the tip still lands exactly on the bowl's edge, so the last bug can't come back) while nudging the control point sideways — perpendicular to that ray — by a named `CURVE_BEND` constant, which is what actually produces a curve. Verified the math held before trusting it in the app: ran the exact same formulas through a quick Node script, checked the cross product of the three points was non-zero (confirms genuinely not a straight line) and that the tip's distance from bowl center matched the expected value, rather than just eyeballing the numbers again.

Also added back a deliberate upward shift for the whole illustration, since Shivam asked for the block moved higher — reintroduced as a named `ILLUSTRATION_UPWARD_SHIFT` constant (30 units) applied via `marginTop` on top of the still-centered layout from two rounds ago, rather than replacing `justifyContent: 'center'` with `flex-start`, which would've undone the "centered between wordmark and button" guarantee confirmed correct earlier. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) both still clean.

### Made the wordmark spacing and illustration's upward shift responsive, fixed a stale-reference crash, confirmed buttons still pin correctly
*2026-07-28 · Bug*

Shivam flagged that `ILLUSTRATION_UPWARD_SHIFT` (the constant from the last entry) was a flat pixel number that wouldn't scale with device size — exactly right, and a real gap in what "responsive" meant so far. Every other number driving the illustration's size (`scale`, `widthScale`, `heightScale`) was already computed live per-device, but this one and `wordmarkArea`'s `paddingTop: spacing.xxl + 20` were both still hardcoded pixel math that could read as too much or too little depending on screen size — the two odd ones out. Had a subagent check how the rest of the app handles spacing first, rather than guessing: confirmed there's no shared responsive-scaling utility anywhere in STEADY — every other screen just uses the fixed `spacing.*` constants directly, no proportional math. So the fix was two different corrections for two different problems: `wordmarkArea`'s padding became `spacing.xxl + spacing.md`, composed from the same shared scale every other screen already uses (matching convention, not inventing a new one); the illustration's upward shift got renamed to `DESIGN_ILLUSTRATION_UPWARD_SHIFT` (following the file's own `DESIGN_WIDTH`/`DESIGN_BOWL_SIZE` naming pattern) and multiplied by `scale` at its one usage site, so it now grows and shrinks proportionally with the rest of the illustration exactly the way the bowl size and arrow coordinates already do. Bumped its base value from 30 to 60 units per "move that a bit more above."

Also hit the reported `ReferenceError: Property 'ILLUSTRATION_UPWARD_SHIFT' doesn't exist` head-on — turned out to be the exact class of bug the fix above was already walking into: the file's declaration and its one usage site had drifted out of sync (the constant got renamed at its declaration but the reference at the JSX usage site still pointed at the old name), something TypeScript's own editor diagnostics caught immediately once the rename touched that area. Fixed by making both sides agree, then explained to Shivam that Metro's Fast Refresh can sometimes patch a running app incrementally in a way that leaves a stale binding from a previous version of the file, and a full reload (not just Fast Refresh) clears that class of error since it forces the whole module to re-evaluate from scratch.

Last thing: had the subagent independently confirm the button-pinning structure (`bowlArea` as the sole `flex: 1` sibling, `buttonArea` with no flex at all) matches the one comparable pattern elsewhere in the auth stack (SignupScreen's flex-1 scroll area + plain footer sibling) — grepped both style blocks directly afterward to confirm neither had been touched by any of today's edits, rather than assuming. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) both still clean.

### Nudged the button block a few pixels closer to the bottom edge
*2026-07-28 · Bug*

Shivam asked to "move the buttons to the bottom, with some padding" — worth checking first whether the layout was actually structurally wrong, since `buttonArea` already sits at the true bottom via the same flex mechanism confirmed correct in the last entry, and already had 48px of its own bottom padding. Asked what specifically looked off rather than guessing at a fix; turned out the ask was much smaller than it sounded — just move the block down a few pixels, not a structural change. Reduced `buttonArea`'s `paddingBottom` from `spacing.xxl` (48) to `spacing.lg` (24), which pulls the whole button block closer to the screen edge while still leaving real padding above `SafeAreaView`'s own safe-area inset (the home indicator / gesture bar clearance), rather than removing padding entirely. `tsc --noEmit` and Jest (171 passed, 1 skipped, 12 suites) both still clean.

The bigger part of this was scope, not the font loading itself: nobody had ever set a `fontFamily` anywhere in the app before, so every screen was silently riding the OS default (San Francisco / Roboto). React Native doesn't synthesize a bold variant from one font file the way a browser does — each weight is its own physical file/PostScript name, so `fontWeight: '700'` alone does nothing once a custom family is registered; it needs a matching `fontFamily` right next to it. That meant touching every `fontWeight` site in the app — 168 of them across 25 files — to add the correct paired `fontFamily`. Delegated that mechanical fan-out to a subagent with an exact weight→family mapping and hard scope rules (don't touch View/container styles, don't touch SVG text props, keep existing `fontWeight` lines as-is), then verified the result myself: spot-checked the diffs, confirmed `tsc --noEmit` came back clean on the app side (the only remaining errors are the pre-existing, unrelated Deno ones in `supabase/functions/**`). Metro's already running from an earlier session, so this should hot-load — though a full reload (not just Fast Refresh) is probably needed since `App.tsx`'s top-level font-loading/splash-screen logic changed, not just a component body.
