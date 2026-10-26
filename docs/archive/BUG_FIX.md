# BUG_FIX Tracking

Status table for every item in the original list below (kept intact underneath, unedited, for reference). Each row is tagged by type — **Bug** (something broken), **Fix** (a working thing changed to spec), **Feature** (new capability, net-new code), **Experiment** (explicitly called "not sure yet" by Shivam), **Plan** (needed a written plan before code, per project rule) — and by status.

| # | Item | Type | Status | Notes |
|---|------|------|--------|-------|
| 1 | Onboarding: remove center text, transparent status bar + nav bar | Feature/Fix | ✅ Done — confirmed on-device | Scope grew per Shivam's follow-up: rebuilt to match the Claude Design splash concept (cream bg, circular bowl photo, wordmark + tagline, 6 handwritten nutrient callouts w/ arrows). Seven rounds of on-device feedback fixed clipping/overlap, centering, arrow curvature, and responsive spacing (see prior notes/DEVLOG for detail); `tsc`+Jest clean throughout. Shivam confirmed the on-device look is correct. Bowl photo is the design file's Unsplash stock photo (`WelcomeScreen.tsx` line 28) — confirmed with Shivam this stays as the final image, not swapped for a custom asset |
| 2 | Signup screen: status bar matches background, off-black icons | Fix | ✅ Done | Covered by `useScreenChrome` hook |
| 3a | Terms/Privacy links open properly | Bug | ✅ Done | |
| 3b | Password eye icon → Phosphor icons | Fix | ✅ Done (Ionicons, not Phosphor) | User confirmed Ionicons instead of Phosphor in round 1 Q&A |
| 3c | Reminder: enable Supabase email verification/OTP | Reminder | ⏳ Not done | This is a Supabase dashboard config step, not app code — still pending, flagging back to Shivam |
| 4a | Login screen password eye icon → Phosphor | Fix | ✅ Done (Ionicons) | Same as #3b |
| 4b | Forgot password button not working | Bug | ✅ Done | |
| 4c | Remove all popups, use inline red error text | Fix | ✅ Done | Extended app-wide in Batch 4, confirmed by Shivam ("convert them all") |
| 4d | Forgot-password flow — new screen if needed | Feature | ✅ Done | `SetNewPasswordScreen.tsx` |
| 5a | Onboarding: status bar + off-black icons, all screens | Fix | ✅ Done | |
| 5b | Screen 1: remove "S" avatar, fix alignment (center/lower, not top) | Bug/Fix | ✅ Done | |
| 5c | Screen 1: add "Skip" to home | Feature | ✅ Done | |
| 5d | Screen 2: remove "S" avatar (repeat of 5b) | Bug | ✅ Done | |
| 5e | Drum picker goes blank mid-scroll | Bug | ✅ Done | Root cause: window re-centered only on scroll-end, not during scroll |
| 5f | Weight units kg/lbs, height units cm/ft+in toggle | Feature | ✅ Done | Canonical storage stays metric; conversion only at display/save edges |
| 5g | Screen 3: chat/alignment/status-bar (repeat), target-weight drum blank bug, units toggle, custom timeline | Bug/Feature | ✅ Done | |
| 5h | Screen 4: options centered/lower | Fix | ✅ Done | |
| 5i | Screen 5 (diet): reduce to Veg/Non-veg/Keto/Low-carb + custom | Fix | ✅ Done | Confirmed with Shivam before cutting the other 6 options |
| 5j | Screen 6: verify calorie/macro formula is correct, research best practice | Bug/Research | ✅ Done | Verified against standard Mifflin-St Jeor + activity multiplier approach |
| 6a | Home: status bar + nav bar match background, off-black icons, no overlap | Fix | ✅ Done | |
| 6b | Home: remove "S" avatar from AI chat bubbles | Bug | ✅ Done | Two passes needed — first `replace_all` missed differently-indented instances |
| 6c | Typewriter greeting message on first visit | Feature | ✅ Done | New `TypewriterText.tsx`, word-by-word reveal |
| 6d | Change bottom text box layout | Experiment | ⏳ Deferred | Explicitly marked "not thought through yet" by Shivam — needs his direction before design |
| 6e | Chronological ordering of cards/messages; edits shouldn't reorder unless time itself changes | Bug | ✅ Done | Re-sort only triggers on `created_at` change, not on macro/content edits |
| 6f | Adjust Macros → back to Home keeps card position with updated values | Bug | ✅ Verified | Falls out of 6e's fix — position keyed on time, not edit-order |
| 6g | Change Date & Time sheet: time drum (incl. AM/PM) doesn't work | Bug | ✅ Done | Rebuilt as a real 12h+AM/PM drum, fixed nested-ScrollView freeze |
| 6h | Delete meal card: no confirmation UI, doesn't remove from DB | Bug | ✅ Done | New `ConfirmSheet.tsx` in-brand confirm dialog, deletes from both screens + DB |
| 6i | Add to Saved Entries — build feature, plan first | Plan → Feature | ✅ Done | Planned via plan mode (approved), then built: migration, store, sheet, both entry points, 9 tests |
| 6j | Composer quick-access button for Saved Entries | Feature | ✅ Done | Bookmark icon in composer opens `SavedEntriesSheet`, logs instantly (no AI step) |
| 6k | Food photo shown too large — shrink to small thumbnail next to text | Fix | ✅ Done | 130px banner → 48px thumbnail |
| 6l | Calendar: logged-day highlight overlaps other day states | Bug | ✅ Done | Added explicit style priority: selected > today > logged |

**Totals:** 22 done · 1 deferred by design (Experiment, #6d) · 1 pending external config (#3c, Supabase dashboard — not app code)

All fixes verified with `npx tsc --noEmit` (clean) and `npx jest` (171 passed, 1 skipped, 12 suites) as of 2026-07-28.

---

## New batch (below the `<!-- NEW BUGS and FIX -->` marker)

| # | Item | Type | Status | Notes |
|---|------|------|--------|-------|
| N1 | Onboarding screen 1: typewriter animation for card text | UI | ✅ Done | `ChatBubble` got an opt-in `animated` prop (reuses existing `TypewriterText`); turned on only for screen 1 so other screens' bubbles are unaffected |
| N2 | Onboarding screen 2: Kg + Ft/Inch and cm + lbs together | Bug | ✅ Done | Confirmed with Shivam: re-paired the existing 2-option toggle (was kg+cm / lbs+ft-in) rather than building 4 independent combos |
| N3 | Onboarding screen 2: text message card not visible | UI | ✅ Done | Root cause: shared `OnboardingScreen` frame centers content (`justifyContent: 'center'`) for short scrolling screens; this screen's `scroll={false}` tall content got pushed off-top. Added a `bodyContentTop` variant that stacks from the top instead |
| N4 | All onboarding screens: compact, smaller text | Bug | ✅ Done | StyleSheet-only pass (shared frame + `ChatBubble` + `SelectableCard` + all 6 screens); global `typography.ts`/`spacing.ts` untouched since they're used app-wide; no tap target dropped below 44px |
| N5 | Home: text box hidden behind keyboard | Bug | ✅ Done | `KeyboardAvoidingView` had no `keyboardVerticalOffset`, so it didn't know about `topBar`'s height above it. Now measures `topBar` via `onLayout` and passes that as the iOS offset |
| N6 | Home: AI text should be above the food log card, survive restart | Bug | ✅ Done | Clarified with Shivam: means the *user's own message*, not an AI confirmation. Root cause found in the Edge Function: `saveChatTurn()` stamped the user's chat row with a timestamp taken at the *end* of the request — after the meal_log row (created earlier in the same request) already existed — so on reload the meal card sorted before the user's own message. Fixed by capturing the timestamp at the top of the handler and using it for the user's row. Deployed live |
| N7 | Meal card: image next to text | UI | ✅ Done | Revisited after the initial revert — photo now renders as a small square thumbnail inline alongside the input-text line (`MealCard.tsx`, `photoThumb` style), not a separate full-width banner. Verified present in code |
| N8 | Meal card: remove "Logged by STEADY" | UI | ✅ Done | Verified: zero remaining occurrences of "Logged by STEADY" anywhere in `src/` |
| N9 | Home: 8-10 varied first-time greeting texts, personalized | Fix | ✅ Done | 10 templates with an optional `{name}` clause (drops cleanly when no name is set); pulls first name from `profile.full_name` |
| N10 | Home: fix calorie/macro card so only the feed scrolls | UI | ✅ Done | Confirmed scope with Shivam: top bar + date picker + calorie card all fixed, only the chat/log feed scrolls. Moved that block out of the `ScrollView`; had to also fix stale `marginTop: -20` / `marginHorizontal: -20` spacing hacks that assumed the old scroll-padding context |
| N11 | Reminders: drum scrolls not working, 12h + AM/PM | Bug | ✅ Done — confirmed on-device | Four attempts total; first three fixed real, verifiable bugs (component duplication, `contentOffset` seeding race, sheet-wrapper `Pressable`) that each survived code review but still didn't stop the freeze on-device. What finally cracked it: a temporary diagnostic component (`__DrumModalTest.tsx`, floating button, deleted once done) built *incrementally* from a proven-working baseline — bare `Modal` + `DrumPicker` confirmed working on-device, then the remount-on-open pattern added and re-confirmed working, then the backdrop's `Pressable`+`onPress` added — which is what finally reproduced the freeze live, for the first time in the whole debugging arc. Root cause: `<Pressable style={styles.backdrop} onPress={onClose}>` — the outer tap-outside-to-close layer, one level further out than the earlier sheet-wrapper fix reached — competes with the drum `ScrollView`s for Android's touch-responder negotiation and can win before a drag is ever recognized. Fix: swapped the backdrop from `Pressable` to a plain `View` in both `ReminderTimeSheet.tsx` and `ChangeDateTimeSheet.tsx`. Confirmed tradeoff with Shivam first and he accepted it: **these two sheets can no longer be dismissed by tapping outside them** — closing works via the Save/Close button or the Android back button only. Shivam confirmed scrolling works on-device via the diagnostic *before* this was applied to the real files — the first time in this saga a fix was proven correct before shipping rather than after. `tsc --noEmit` clean, Jest clean at 171/171 |
| N12 | Reminders: allow unsetting an active reminder | Bug | ✅ Done | `toggleReminder` existed in the store but had no call site for disabling; added a small "×" icon next to EDIT on active rows |
| N13 | Side nav: don't show red "coming soon" errors | UI/Fix | ✅ Done | Added a `disabled` prop to `MenuRow` (faded, `onPress` blocked) for Groups/Refer a Friend/Help & Support/My Foods (same mechanism, same fix); removed the inline red-text path entirely |
| N14 | Go Premium: free-access message for early users | Fix | ✅ Done | Split off from the generic "coming soon" handling into its own action; confirmed message wording with Shivam before writing it; small dedicated single-button sheet (not the destructive-style `ConfirmSheet`) |

All N-items now ✅ Done — the N-batch is complete. Re-verified 2026-08-01 with `npx tsc --noEmit` (clean, pre-existing `supabase/functions/*` Deno errors excluded) and `npx jest` (171 passed, 1 skipped, 12 suites in isolation; one `SettingsScreen.test.tsx` timeout under full-suite parallel load — a known pre-existing flake, confirmed passing standalone, not a regression). `log-food-from-text` Edge Function redeployed live for N6.

---

# Original list (unedited)

1. In the onboarding screen, I want to change the screen and remove the text from the center of the screen. (ask me for the new image which you want me to add here) and let the both "Get Started" and "Already have account" buttons remain same here. make sure that both the bottom phone's button background and the status bar on the top's background should be transparent. 

2. When the user is click on the "Get Started" Button in that case we are going to the Create your account screen. In that screen first make sure that the top status bar background color should match with that screen's background color and the icons color should be little off black, over all the screens. 

3. "Create your account" Screen. Make sure that the terms and P&C buttons are working properly and it will open the actual links. And change the icon eye icon form the password text box and use phosphor icons here for see the password and hide the password. (remind me - to enable the email verification from the supabase, and for that I need to add the proper mail with OTP)

4. In the Login Screen, again change the icon in the password text box for see and hide password icon and use the phosphor icons here as well. Forget password button is not working make sure that when the user is click on the forget password button it should works properly and I don't want to show any pop up notifications on the screen, remove all  the pop up notifications with the in line text error message in the red color line on the right position in the app. 
(Think) Find the best method of find the forget password way, even it required to create a new separate screen do that as well. 

5. Onboarding Screen - I want that here the top status bar background color should be matched with the screen's background color and all the icons should be in the little off black color. in all the onboarding screens. 
In The very first screen.  Remove the "S" icon from the chat which looks like a profile picture. make the message looks more better and align in the screen and even you can see in the screen that all the components are more likely to top aligned, this should be either centre or little down. (here in that case login and signup screens are the best examples). 
Add a skip now option as well, if the user want's to skip this and just go to the home page. 

In the second onboarding screen, again I want the same thing with respect to the chat and remove the icon of the blue S. 
There are some bugs in the drum scroll (bug) when I'm doing the full scrolling in the app either up or down, it comes to the blank number and when I release it then the numbers came, make sure that this bug will get resolve. 
Add an option to switch the weight units between kg and height units between cm and ft + in

In the third screen again the same chat issue and the alignment issue, status bar color. Target weight drum roller blank text bug, allow to change the units of the weight. Allow to add the custom timeline. 

In the fourth screen, solve the same issue as mentioned above, specifically that the options should come in the center or little at the bottom. 
In the fifth screen, I want you to show only three options for the food options, Veg, non-veg, keto, low-carb, and other custom options. 
And in the last sixth screen of the onboarding, make sure that the formula we are using to calculate the intake kcal/day, protein, carbs, and fat this all should be come properly, I want you to check online that what is the best way to calculate this values and use that formula. 

6. Home Screen - IMPORTANT 

On the home screen first I want that here the top status bar background color should be matched with the screen's background color and all the icons should be in the little off black color. Make sure that the bottom phone buttons background color should be same as the screen background color and it should never overlap with any buttons in the app. 

I want to remove the icon as well form the chat coming from the steady side, (that blue color steady "S" icon). 
When the user is come first time on the screen, give them some messages in the typewriter format (words are coming one after each), that should be the greeting messages and explain the user that what they need to do. (Think - and Give me some couple of examples for this)

I want to change the bottom text box layout as well. (Experimental) Not think yet how exactly I want, I'll see this later. 

In the home screen the sequence of the food cards and messages sent by the user are not coming in the chronological order, we need to make sure that all the logs, messages, conversations should be in the chronological order (backed with the time it created). 
And if the user is making any changes in the food log card, such as food items changes, macros changes, re analysis the food, uploading any new food information/logging any new food item then in that case do not change the chronological order of all the previous components in the chat (logs, messages, conversations) and even do not make anything hide. Only of the user is changing the time of the food card logged then arrange that card position accordingly in the chat window. Always make sure that I want to see everything in the "Log + Coach" window whenever user comes there I mean everything has put there in the chronological order and in the "Food Log" just show the food log cards but that too in the chronological order. 

(quick checks) - If I click on the adjust macros button and make any changes in the food and when I come back to the home screen "Log + Coach" screen make sure that I am able to see that card at the same chronological position with the updated new values. 

In the "Change Date & Time" Section the time picker roll drum is not working and I'm not able to pick any time from there, even not the AM and PM picker. (Fix this bug)

Delete Food logged card option is not working - (bug) first of all I don't want to see an generic pop up notification box here when the user is clicking on the Delete button and we are asking for the confirmation, here create a proper confirmation notification component that match with out design style and after confirming the delete, the meal card should be get removed from both screens (Food Log and log + coach ) and from the database as well. 

"Add to save entires" this feature is also not working right now, build this feature first plan and confirm this with me. And for easy access to this save entire I want to add a another button in the text box pannle where user can click and see the save entire and easily pick from there and use it to do the food logging easily and qucikly. Plan this as well. 

Very impoartant change, right now when the user is sending any photo for the food logging, we are showing that photo in a too big card, I want that we just show that photo in small size section in the same card next to the text of the food infomration. That's 


In the Calander View, the dates in which the user is logged the food items are covered with a hue color rectangular box. which are overlaping, we need to make sure that those are not overalpped and should also looks proper. 	



waht is the issue with this 5e and how to fix this ? 
This is still freez and I'm unable to scroll, in the change Date & Time section. 
However this same thing of scroll is working in the onboarinf screen 





<!-- NEW BUGS and FIX  -->

Here are few more changes - 

UI - In the onboarding screen 1 - Make the text written in the card in the typewriter animation for each words. 

BUG - In In the onboarding screen 2 - Make it Kg + Ft/Inch and cm + lbs together
UI -  In In the onboarding screen 2 - The text message cad is not visible

BUG - In all the onboarding screens, make this compact and reduce the text sizes. 

BUG - In the Home screen, make sure that the text box should come above the keyboard, it should not hide behind the keyboard. 

BUG - In the home screen, if the user is sent any message for the food log and the AI is give us the output, then the text should come first above the food log card created, even after user is refresh/closed the screen or restart the app

UI - In the food meal card - if there is any image then add the image next to the text (ask an example image to me, I'll explain you how I want)

UI - Remove the "Logged by STEADY" text from above the food meal cards. 

FIX - I want to change the initial text, when the user is come to the home screen for the first time, I want to show them some different set of text each time. Write some 8-10 variants and if possible then make it personalized using the user name. 

UI - I want to fix the calories + Protein + Carbs + Fat card in the home screen, if the user is do scroll on the screen then only rest of the components move not the calorie ring card and above that, above that whatever should also be fixed. 

BUG - In the reminder screen, none of the drum scrolls are working to pick the time and make the time zone to 12 hours and make sure that AM / PM shift is also working

BUG - Allow the user to unset the reminder as well. 

UI - Fix - Don't show the coming soon errors in the side nav bar in the red color, instead make that button disable/fade/ not clickable. such as Groups, Refer a friend, and Help and Support. 	

Fix - If the user is click on the Go Premium Feature - Then show a very cute and thoughtful message to the user, that no need to pay anything to you, you are the first of few user of this app, feel free to use this for few months. (First confirm the message with me, then only write)


