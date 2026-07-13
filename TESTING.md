# STEADY — Preview APK Test Pass

> Build: `34a37027-f66b-42de-ad65-1bed7404ac80` (preview profile, 2026-07-03)
> Device: _fill in — model + Android version_
> Tester: Shivam

Fill in **Result** (✅ Pass / ❌ Fail / ⚠️ Works but off) and **Remarks** as you go.
Anything ❌ or ⚠️ needs a remark explaining exactly what happened — screenshots welcome if easy.

---

## 1. Install & launch

| # | Test case | Result | Remarks |
|---|---|---|---|
| 1.1 | APK downloads from the Expo build link |✅| |
| 1.2 | Android "install unknown apps" prompt appears and install completes |✅| |
| 1.3 | App icon on home screen looks correct (no design-guide overlay, correct chevron logo) |✅| |
| 1.4 | App launches without crashing; splash screen shows briefly with correct background color |⚠️ | We need to work on the tag line of this app and as well the icon/logo od this app, second that the button as mispalced think about the best possible way to place this correctly|
| 1.5 | Lands on Welcome / Login screen (not stuck on a blank or loading screen) |✅| |

## 2. Sign up (email/password)

| # | Test case | Result | Remarks |
|---|---|---|---|
| 2.1 | Sign up with a fresh email + password | | |
| 2.2 | Redirected into onboarding (goal → stats → target weight → activity → diet → reveal) | | |
| 2.3 | Onboarding reveal screen shows calculated calorie/macro goals | | |
| 2.4 | Completing onboarding lands on Home screen with calorie ring | | |
| 2.5 | Signup screen's "Terms" and "Privacy Policy" links actually open the GitHub Pages URLs | | |

## 3. Google sign-in — **highest-risk test, first time outside Expo Go**

| # | Test case | Result | Remarks |
|---|---|---|---|
| 3.1 | Sign out, tap "Continue with Google" from Login screen |✅ | |
| 3.2 | Google account picker / browser opens correctly |✅| |
| 3.3 | After choosing an account, app regains focus (returns from browser) |✅| |
| 3.4 | Successfully signed in — lands on Home (or onboarding if new Google user) | ✅| |
| 3.5 | If this fails: note the exact error message/behavior (likely a Supabase redirect URL allow-list issue) | | |

## 4. Core logging — AI chat + photo

| # | Test case | Result | Remarks |
|---|---|---|---|
| 4.1 | Type a meal in plain English (e.g. "2 eggs and toast") → MealCard appears with reasonable macros | | |
| 4.2 | Camera FAB opens the OS camera, snap a food photo → logs correctly with photo visible on the card | | |
| 4.3 | Gallery/photo picker path (pick an existing photo) also logs correctly | | |
| 4.4 | Meal photo displays properly in the feed (this is the new signed-URL path — confirm it's not broken/blank) | | |
| 4.5 | Calorie ring and macro rows update immediately after logging | | |
| 4.6 | Edit a logged meal (tap edit, change description) — updates correctly | | |
| 4.7 | Delete a meal via the options sheet — disappears from feed and totals update | | |
| 4.8 | "Adjust Calories & Macros" manual override on a food entry works | | |
| 4.9 | "Change Date & Time" on a meal moves it to a different day correctly | | |

## 5. Water / Weight / Body Measurements

| # | Test case | Result | Remarks |
|---|---|---|---|
| 5.1 | Drawer → Water → log an entry → reflects in today's total | | |
| 5.2 | Drawer → Weight → log today's weight → chart updates | | |
| 5.3 | Drawer → Body Measurements → log at least one measurement → saves correctly | | |
| 5.4 | Home screen streak chip shows a real number (not always "7") | | |
| 5.5 | Profile drawer streak (header card) matches the Home screen streak | | |

## 6. Date picker / history

| # | Test case | Result | Remarks |
|---|---|---|---|
| 6.1 | Tap the date block on Home → calendar sheet opens smoothly | | |
| 6.2 | Tap a past date → feed reloads with that day's logs (or empty state) | | |
| 6.3 | Composer still works for AI questions on a past date (no accidental DB writes) | | |

## 7. Forgot password

| # | Test case | Result | Remarks |
|---|---|---|---|
| 7.1 | Login screen → "Forgot password?" → enter email → confirmation alert appears | | |
| 7.2 | Reset email arrives (check inbox/spam) | | |
| 7.3 | Tapping the link in the email opens the STEADY app directly (not a browser dead-end) | | |
| 7.4 | App shows "Set a new password" screen, not the normal Home screen | | |
| 7.5 | Setting a new password succeeds and lands in the app | | |
| 7.6 | Signing out and back in with the NEW password works | | |

## 8. Account deletion — **use a throwaway signup, not your main account**

| # | Test case | Result | Remarks |
|---|---|---|---|
| 8.1 | Create a brand-new throwaway account for this test | | |
| 8.2 | Settings → Account section → "Delete account" row visible | | |
| 8.3 | Tapping it opens the confirmation modal | | |
| 8.4 | Delete button stays disabled until exactly "DELETE" is typed | | |
| 8.5 | Confirming deletes and immediately signs out to Welcome screen | | |
| 8.6 | Trying to log back in with that email fails (account truly gone) | | |

## 9. Settings & legal links

| # | Test case | Result | Remarks |
|---|---|---|---|
| 9.1 | Settings → About → "Privacy Policy" opens the live GitHub Pages URL |⚠️| Yes the [age is open but this pages are not updated one|
| 9.2 | Settings → About → "Terms of Service" opens correctly |❌| The newly updated html pages are not pushed yet, I cannot see my email id in the pages. ❌ We strongly needs to work again on the privacy and T&C pages all over again this is not the correct at all |
| 9.3 | Editing profile fields (name, height, weight, goals) and Save persists correctly | | |
| 9.4 | Units toggle (metric/imperial) converts displayed values correctly | | |

## 10. Navigation / general polish

| # | Test case | Result | Remarks |
|---|---|---|---|
| 10.1 | No "Journal" or "Me" tab visible anywhere (both were removed) | | |
| 10.2 | Profile drawer opens/closes smoothly from the ☰ icon | | |
| 10.3 | "My Foods" row no longer shows the fake "Learned 12 foods" badge | | |
| 10.4 | Remaining "Coming soon" rows (Progress Charts, Reminders, Groups, etc.) show the expected alert, don't crash | | |
| 10.5 | Sign out works and returns to Welcome screen | | |
| 10.6 | Backgrounding the app and reopening doesn't lose state or crash | | |

---

## Summary

**Overall verdict:** _fill in once done — Ready for production build / Needs fixes first_

**Blocking issues found:**
- 
- We need ro make the onbaoarding process more better and smooth, like an AI chat based accproch. 
- There is an issue that comes up when we are showing the personlized plan to user, there is the bitton card text coming up that "At this pace you'll reach your goal in ~37 weeks!!? (Bro I choose to gain the weight from 65 to 75 in one month? ) This is coming up totally worng. "
- At the home screen when the user is cmoing to the home screen for the very first time we need to show them the interactive tha chat that tells the user that what he/she can do and how. Like an onboarding chat. 
- (This even the user is no need to do manual onboarding, AI can handle this all over. )
- THAT CHAT BOX IS COMING UP ISSUE (THIS is HIGE)

**Non-blocking issues / polish notes:**
-
