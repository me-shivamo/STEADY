# Widgets, Quick-Input Surfaces, and Visual Design for STEADY (as of 27 Oct 2026)

Scope: which quick-input surfaces STEADY could build from React Native + Expo, and how. The surfaces covered are iOS widgets, Lock Screen widgets, Control Center controls, the Action button, Live Activities, Siri/App Shortcuts, Android Glance widgets, Assistant/Gemini, and Wear OS. The notes also cover the evidence that these surfaces matter, and the visual, motion, and brand language for a dark + cream minimal health app.

Version context: STEADY runs in Expo Go on SDK 54. Expo's docs currently go up to SDK 58, and the React Native docs are at 0.87. iOS 27 was announced at WWDC26 (June 2026). Wear OS 7 was announced at I/O (May 2026). Every widget, control, or Live Activity needs a native extension target, so none can run in Expo Go. They all need development builds plus EAS builds.

## 1. iOS: interactive widgets, voice from a widget, controls, Lock Screen, Live Activities, Siri/App Shortcuts, Action button

### Takeaway
A widget button cannot reliably start voice recording without opening the app. Widget intents run in the widget-extension process, and Apple says a button "should do more than open the app". Recording without opening the app needs `AudioRecordingIntent` (iOS 18+). That intent runs in the app process, must keep a Live Activity alive or the recording stops, and developers report it failing on device unless the app was foregrounded. Recommended split:
- **Mic button**: deep-links (`widgetURL`/`Link`/`OpenIntent`) into an already-listening screen.
- **In-widget App Intent buttons**: for non-audio one-taps ("repeat last meal", "+water", favourite quick-add). These update the ring instantly.
- **One `ControlWidgetButton` + `OpenIntent`**: a single "Log meal" control covers Control Center, the Lock Screen, and the Action button.

### Cited Findings
**Interactive widgets**
- Interactive widgets (buttons/toggles backed by App Intents) are supported in systemSmall/Medium/Large/ExtraLarge/ExtraLargePortrait and in accessoryCircular/accessoryRectangular (Lock Screen) on iPhone/iPad. Live Activities can have buttons/toggles in the expanded and Lock Screen presentations. — [Apple: Adding interactivity to widgets and Live Activities](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- "An interaction with a button or toggle should do more than open the app. If you want to offer an interaction that opens the app, use `Link` and `widgetURL(_:)`." — [Apple: Adding interactivity…](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- "On a locked device, buttons and toggles are inactive and the system doesn't perform actions unless a person authenticates and unlocks their device." — [Apple: Adding interactivity…](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- Process model: widget code runs "in an independent process that's separate from your app", and the system renders archived views, so it "can't run your code or update data bindings at the time it renders your widget." "By default, the system runs the app intent in the same process as the widget extension. However, if the app intent's `openAppWhenRun` property is `true`, or if the intent conforms to `AudioPlaybackIntent`, `ForegroundContinuableIntent`, `LiveActivityIntent`, or `PushToTalkTransmissionIntent`, the system performs the app intent in the app's process." — [Apple: Adding interactivity…](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- When `perform()` returns, the system reloads the timeline ("Interactions with a toggle or button always guarantee a timeline reload"). Apple recommends awaiting the shared-database write before returning, and using `invalidatableContent()` on views awaiting data. Widgets can't resolve parameters interactively, so parameters must be pre-populated. — [Apple: Adding interactivity…](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)

**Recording audio**
- `AudioRecordingIntent` is available on iOS/iPadOS 18.0+, watchOS 11.0+, and macOS 15.0+. When used, "the system displays an audio recording indicator". **"In iOS, iPadOS, and watchOS, When you adopt the `AudioRecordingIntent` protocol, you must start a Live Activity when you begin the audio recording and keep it active as long as you record audio. If you don't start a Live Activity, the audio recording stops."** — [Apple: AudioRecordingIntent](https://developer.apple.com/documentation/appintents/audiorecordingintent)
- Developer reports:
  - iOS 17: `audioRecorder.record()` from a widget intent returned `false` on device but worked in the simulator. The only answer, from a non-Apple user in Jan 2025, says "you can start a recording only while the device is in foreground". No Apple engineer replied. — [Apple Developer Forums #737258](https://developer.apple.com/forums/thread/737258)
  - A Control Center/Action-button control's mic permission request fails inside the widget extension, so audio-session init fails. Unresolved. — [Hacking with Swift forums](https://www.hackingwithswift.com/forums/swift/starting-an-audio-recording-liveactivity-with-action-button/29100)
  - Mic recording fails when the app is launched from a Shortcut (error 561015905). — [Apple Developer Forums #756507](https://developer.apple.com/forums/thread/756507)
  - One developer's write-up says AudioRecordingIntent "is not a magic permission". Activating the audio session from the background is blocked, but if a session is already active, starting the engine can work. This is a single-developer account. — [Level Up Coding: A better(?) way to make a dictation app](https://levelup.gitconnected.com/swift-ios-a-better-way-to-make-a-dictation-app-7badd94103e0)

**Controls (iOS 18+)**
- "A control allows your app to execute an action, launch your app to a specific view, or launch a locked camera capture extension from Control Center, the Lock Screen, or by using the Action button." Controls come as `ControlWidgetButton` or `ControlWidgetToggle`. To open the app, use an `OpenIntent`; "the Target Membership of the app intent [must] be set to both the app and the widget extension". A control button "can launch a locked camera capture extension, start a live activity, or take someone to a specific area of your app". Controls reload on interaction, via `ControlCenter` reload from the app, or via APNs push. — [Apple: Creating controls to perform actions across the system](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system)

**App Shortcuts and Siri**
- App Shortcuts are declared in code via `AppShortcutsProvider`. They "are available as soon as someone installs your app, and you don't have to register them yourself". They bundle an intent with a title, image, spoken phrases, and preconfigured parameters, and surface in Siri, Spotlight, and the Shortcuts app. `SiriTipView` teaches the phrase in-app. — [Apple: App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts)

**iOS 27 (WWDC26)**
- iOS 27 adds an extra-large 4×6 iPhone widget size. At launch only a few Apple widgets supported it. — [9to5Mac, 8 Jun 2026](https://9to5mac.com/2026/06/08/ios-27-adds-extra-large-widgets-for-your-extra-large-needs/)
- TechCrunch reports full-screen home-screen widgets in iOS 27. — [TechCrunch, 9 Jun 2026](https://techcrunch.com/2026/06/09/ios-27-features-we-didnt-see-on-stage/)
- Apple's interactivity doc lists `systemExtraLargePortrait` as interactive. — [Apple: Adding interactivity…](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)

### Inferences
**Surface-by-surface plan for iOS**

| Surface | Min iOS | What STEADY does | Opens app? |
|---|---|---|---|
| Home widget, small/medium | 17 | Ring + "kcal left" + mic button (deep link) + 1–2 intent buttons (repeat last meal, +water) | Mic: yes. Intent buttons: no |
| Lock Screen accessoryCircular | 17 (interactive) | Calorie ring gauge. Tap deep-links | Yes (needs unlock) |
| Control (Control Center / Lock Screen button / Action button) | 18 | "Log meal" `OpenIntent` → listening screen. Optional "Snap meal" via locked camera capture extension | Yes |
| App Shortcut / Siri | 16+ (App Intents) | "Log food in STEADY" → opens to voice screen, or takes a dictated string parameter | Configurable |
| Live Activity | 16.1+ | Only if building AudioRecordingIntent background capture, or for a fasting/meal timer. Not a v1 need | — |

**Other implications**
- Widgets have no text fields. Any free-text or voice input must happen in the app, in Siri/App Shortcuts, or in a Live Activity flow.
- Lock Screen widget buttons are inert until the device is unlocked. Design the Lock Screen surface as glanceable output plus a deep link.

### Gaps
- No Apple doc explicitly says whether `AVAudioSession` recording is allowed in the widget-extension process. Only forum anecdotes exist. Test on a physical device.
- Not found: iOS 27 App Intents or controls API changes from WWDC26 sessions. Also not found: whether a `String` parameter dictated to Siri can be passed straight into a "log food" App Shortcut on all locales. This matters for Indian English/Hinglish.

## 2. Android: Jetpack Glance, launching voice capture, Google Assistant/Gemini App Actions in 2026, Wear OS

### Takeaway
Android is more permissive than iOS. A Glance widget tap can launch an activity directly. Android also exempts "interacting with app widgets" from the rule that blocks starting a microphone foreground service from the background. A "tap mic on widget → instant recording overlay" flow is therefore feasible.

Glance is the modern toolkit, and in-app pinning (`requestPinGlanceAppWidget`) helped Gratitude's adoption. Google Assistant was removed from most Android phones from 4 Sept 2026 in favour of Gemini. The App Actions docs still exist without a deprecation banner, but nothing confirms that they work with Gemini, so voice-assistant integration is not a dependable 2026 bet. Wear OS Tiles are becoming "Wear Widgets" (Wear OS 7, Remote Compose).

### Cited Findings
**Glance and voice capture**
- Glance: attach `GlanceModifier.clickable(action)`. Targets are an activity class, `ComponentName`, or `Intent`, converted to a `PendingIntent`. Other actions: `actionStartService` (with an `isForegroundService` flag), `actionSendBroadcast`, and `actionRunCallback`/lambda. Parameters go through `actionParametersOf`. Only Glance composables work, because they are translated to RemoteViews. — [Android: Glance — handle user interaction](https://developer.android.com/develop/ui/compose/glance/user-interaction)
- Foreground-service rules:
  - Apps targeting Android 12+ "can't start foreground services while the app is running in the background, except for a few special cases".
  - A service needing while-in-use permissions (camera, microphone, location, body sensors) "cannot create the service while the app is in the background".
  - **Exemptions include "The service starts by interacting with app widgets" and "…by interacting with a notification."**
  - On Android 14+, a missing permission for the FGS type throws `SecurityException`. Logcat shows "Foreground service started from background can not have location/camera/microphone access" when restricted.
  — [Android: Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)

**Gratitude case study** ([Android Developers Blog, 8 May 2026](https://android-developers.googleblog.com/2026/05/how-gratitude-widgets-boosted-user-retention-25-percent.html))
- The RemoteViews → Glance migration shipped in under a month and saved about 50% of dev time. Glance made dynamic colour, resizing, and configuration easier.
- They used `requestPinGlanceAppWidget` for in-app pinning, which skips the system picker.
- Warning: keep the receiver class name/package unchanged when migrating, or users' widgets get deleted.
- Generated-preview rate limit reset: `adb shell device_config put systemui generated_preview_api_reset_interval_ms 0`.

**Assistant → Gemini transition**
- Google began removing Assistant from Android phones, tablets, Wear OS, earbuds, and Android Auto from 4 Sept 2026. — [Let's Data Science](https://letsdatascience.com/news/google-retires-assistant-from-android-devices-september-4-8702bddf)
- Devices on Android 9 or older, or with less than 2 GB RAM, keep Assistant for now. Google TV, Home speakers, and displays also keep it. — [Khaleej Times](https://www.khaleejtimes.com/business/tech/google-assistant-is-being-discontinued-what-android-users-need-to-know)
- A 28 Sept report found Assistant gone on all checked US/EU devices. — [9to5Google, 28 Sep 2026](https://www.9to5google.com/2026/09/28/google-assistant-gemini-android/)
- A secondary source advises developers with Assistant integrations to act now. — [Byteiota](https://byteiota.com/google-assistant-ends-september-4-what-developers-must-do-now/)

**App Actions status**
- Google says the App Actions path is unaffected by the Conversational Actions sunset, the shortcuts API is GA, and `shortcuts.xml` is supported. — [Google: Conversational Actions sunset overview](https://developers.google.com/assistant/ca-sunset)
- The App Actions overview (updated 16 Jul 2026) shows no deprecation banner and does not mention Gemini. "Users can only access App Actions on Android phones. Assistant on Android Go does not support App Actions." It names the health BII `actions.intent.START_EXERCISE`. I found no food-logging BII. — [Android: App Actions overview](https://developer.android.com/develop/devices/assistant/overview)

**Wear OS**
- Wear OS 7 (19 May 2026): Tiles are rebranded and redesigned as "Wear Widgets" in 2×1 and 2×2 layouts, powered by Remote Compose. Early partners: Spotify, WhatsApp, Peloton, Todoist. A Canary emulator is available, with release later in 2026. — [Android Authority](https://www.androidauthority.com/google-wear-os-7-wear-widgets-early-partners-availability-features-3670112/); [Engadget](https://www.engadget.com/2177050/google-announces-wear-os-7/); [9to5Google](https://9to5google.com/2026/05/19/google-announces-wear-os-7/); [Android Developers Blog: What's new in Wear OS 7](https://android-developers.googleblog.com/2026/05/whats-new-wear-os-7.html)
- Wear OS 6 (2025) brought Material 3 Expressive to Compose for Wear OS and ProtoLayout, with a three-slot tile layout. — [TechCrunch, 20 May 2025](https://techcrunch.com/2025/05/20/google-releases-wear-os-6-with-material-expressive-design-refresh); [Android: Wear OS 6 features](https://developer.android.com/training/wearables/versions/6/features)
- Tiles and complications are native services the system binds to. The app UI isn't running. — [wear_os_tiles package docs](https://pub.dev/documentation/wear_os_tiles/latest/)

### Inferences
- Android mic flow: widget mic → `actionStartActivity` to a translucent, dialog-themed "listening" activity that starts recording on open. That is a single tap, with no FGS needed because the activity is visible. In React Native this can be a separate lightweight entry screen opened via deep link.
- Don't build "Hey Google, log food". It is unsupported on Gemini phones, as far as the evidence goes, and Android Go phones (common in India) don't support App Actions anyway. Use Android static/dynamic app shortcuts (long-press the launcher icon) as the cheap "quick action" instead. That is a Gap to verify for RN.
- Watch apps are low priority for an India-heavy, low-end-Android base, and Wear OS's tile API is in transition. Revisit after the Wear Widgets docs mature.

### Gaps
- No official 2026 Google statement found on whether App Actions/`shortcuts.xml` capabilities trigger from Gemini.
- Not verified: Glance's minimum SDK, and how to render a smooth ring in Glance. RemoteViews has no custom Canvas, so rings are typically pre-rendered bitmaps or `CircularProgressIndicator`.
- Not found: Remote Compose / Wear Widgets API docs.

## 3. Expo/React Native implementation: libraries, data sharing, dev builds, EAS

### Takeaway
As of Oct 2026, the default choice is **`expo-widgets`**: official, stable since SDK 56, with iOS widgets incl. Lock Screen families, Live Activities, and opt-in Android widgets. It needs SDK ≥56, and STEADY is on 54. Fallbacks:
- **`@bacons/apple-targets`**: hand-written SwiftUI. Needed for Control Center controls, AudioRecordingIntent, and custom App Intents/App Shortcuts, which expo-widgets doesn't document.
- **Callstack's Voltra**: JSX → SwiftUI and Glance, cross-platform.
- **`react-native-android-widget`**: Android-only.

All of these drop Expo Go for development builds.

### Cited Findings
**expo-widgets**
- Status history:
  - SDK 55: "alpha… not available in the Expo Go app, use development builds." — [Expo docs v55: Widgets](https://docs.expo.dev/versions/v55.0.0/sdk/widgets)
  - Expo blog, 18 Jun 2026: "iOS widgets and Live Activities are stable in Expo SDK 56". CNG generates the Widget Extension target, App Group config, and SwiftUI scaffolding. Widget code "runs in a sandboxed JS runtime separate from your main app". Updates "can be pushed from your server via APNs or triggered from the app directly". — [Expo blog](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo)
- Current docs (SDK 58) — [Expo docs: Widgets (latest)](https://docs.expo.dev/versions/latest/sdk/widgets/):
  - Platforms: Android + iOS home-screen widgets, iOS Live Activities. Not available in Expo Go.
  - iOS families: `systemSmall`/`Medium`/`Large`/`ExtraLarge` (iPad) plus Lock Screen `accessoryCircular`/`accessoryRectangular`/`accessoryInline`.
  - Interactivity: `Button.onPress` returns new props, which are persisted. Interactive widgets need iOS 17+.
  - Update APIs: `updateSnapshot(props)`, `updateTimeline(entries)` (iOS only), `reload()`.
  - Shared storage: `widgetsDirectory` is a `file://` path in the shared App Group (`groupIdentifier` defaults to `group.<bundleId>`). Widget images must live there.
  - Widget code restrictions: no hooks, state, async, imports, or top-level constants. Data comes via props/`environment`.
  - Live Activities: `createLiveActivity`, `start`/`update`/`end`, push tokens, `addPushToStartTokenListener` (iOS 17.2+).
  - Android: opt-in via `enableAndroid`. Supports a Compose subset (incl. `Checkbox`, `Switch`, `RadioButton`), with no timelines, configurable widgets, or Live Activities. `addUserInteractionListener` only fires while the app process is alive.
  - Control Center controls and custom App Intents are not documented.

**Other libraries**
- `@bacons/apple-targets` (Evan Bacon): a config plugin for Apple targets (widgets, App Clips, share extensions) outside `/ios`, keeping CNG. The README (v3.0.2) says "highly experimental and not part of any official Expo workflow". It requires CocoaPods ≥1.16.2, Xcode 16, and Expo SDK 53+. — [@bacons/apple-targets README](https://unpkg.com/@bacons/apple-targets@3.0.2/README.md)
- A 2026 guide calls apple-targets + WidgetKit + App Groups + App Intents the "production-ready path". This conflicts with the README's "experimental" framing. — [React Native Relay (2026)](https://reactnativerelay.com/article/react-native-ios-widgets-expo-apple-targets-2026)
- Voltra (Callstack, v2):
  - "Voltra turns JSX into SwiftUI and Jetpack Compose Glance."
  - iOS: Live Activities, Dynamic Island, home-screen widgets. Android: home-screen widgets and ongoing notifications.
  - Server-driven widgets, push updates via APNs/FCM, and an in-app `VoltraWidgetPreview`.
  - Expo config plugin. "needs an Expo Dev Client or a bare React Native app".
  - Requires iOS 16.4+. Push-to-start needs iOS 17.2, and broadcast push needs iOS 18.
  — [Voltra docs](https://www.use-voltra.dev/)
- `expo-targets` (third-party): Apple extensions plus "first-class" Android widgets (Glance and RemoteViews). It warns against combining it with `expo-widgets`. — [expo-targets README](https://cdn.jsdelivr.net/npm/expo-targets@1.9.10/README.md)
- `react-native-android-widget` (sAleksovski): "Build Android Widgets with React Native". New Architecture support and an Expo config plugin. — [Docs](https://saleksovski.github.io/react-native-android-widget/); [GitHub](https://github.com/sAleksovski/react-native-android-widget)

### Inferences
**Data flow**: Zustand store → on each log, write `{kcalEaten, kcalGoal, protein, carbs, fat, lastMealName, updatedAt}` to the widget snapshot (`updateSnapshot`) → `reload()`. In v1 the widget never talks to Supabase. Supabase stays the source of truth, and the widget is a cache.
- For background freshness (e.g., a meal logged on another device), the later option is a server push: APNs widget push or FCM through STEADY's existing push/Edge Function stack.

**Suggested path**
1. Upgrade SDK 54 → 56+. This is required anyway, and it affects every native module version.
2. Adopt `expo-widgets` for the iOS widgets + Lock Screen gauge and the Android widget.
3. Add `@bacons/apple-targets` only for the iOS 18 Control/App Shortcut targets.

Avoid mixing `expo-targets` and `expo-widgets`.

**EAS**: each extension is a separate bundle ID with its own provisioning profile and App Group entitlement. Plan EAS credentials for each target. The widget runtime cannot be tested in Expo Go, so the team needs a dev-client workflow.

### Gaps
- Not checked: the per-library GitHub issues for open bugs (e.g., expo-widgets Android maturity, Voltra 2's exact version).
- Not confirmed: whether expo-widgets' iOS `Button` can carry a custom `AppIntent` that opens the app versus only updating props.

## 4. Evidence of user value: do widgets raise engagement/logging?

### Takeaway
There is one credible, platform-published data point: Gratitude saw **25% higher retention for widget users**, with **10% of DAU** adopting widgets. That is a correlation, not an A/B test, since motivated users self-select into widgets. Broad widget adoption is "middling", so a widget should be promoted in-app (pinning prompts, Siri tips) rather than assumed to be discovered.

### Cited Findings
- Gratitude (6M+ downloads, 100M journal entries): **25% higher retention for widget users; ~1K weekly journal entries from widgets; 10% of total DAU adopted widgets.** In-app pinning improved discoverability. — [Android Developers Blog, 8 May 2026](https://android-developers.googleblog.com/2026/05/how-gratitude-widgets-boosted-user-retention-25-percent.html)
- Walkers (vendor case study): ~10.9% higher retention past 28 days and ~11.87% more active users from a widget + push + gamification bundle. The widget effect is not isolated. — [Netmera: Walkers](https://netmera.com/walkers-app-case-study)
- TidBITS reader poll (~350 respondents, Jan 2024; non-representative): only ~14% use Home/Lock Screen widgets heavily, and roughly half never use widgets. — [TidBITS](https://tidbits.com/2024/01/15/do-you-use-it-widgets-see-middling-adoption/)
- Sensor Tower (2020): top widget-customisation apps were installed on ~15% of US iPhones after iOS 14. This measures installs, not usage. — [iMore](https://www.imore.com/15-us-iphone-users-using-widgets-customize-ios-14)

### Inferences
- Expect roughly 5–15% of active users to add a widget unless it is prompted. Measure it: PostHog events for widget install, widget tap, and logs-from-widget. Compare 30-day retention against a matched cohort. Don't claim causation.
- Food logging is a multiple-times-daily, friction-sensitive job, a closer fit to widgets than a once-daily gratitude journal. That fit is plausible but unproven.

### Gaps
- Found nothing from Apple on widget engagement, and no nutrition/fitness-app-specific widget data (MyFitnessPal, Lose It, Cal AI, etc.).

## 5. Visual design: dark + cream palettes, Cal AI, Apple rings, Oura/Bevel/Gentler Streak/Whoop/Opal, accessible contrast, colour-blind-safe rings

### Takeaway
Build on near-black charcoal (not #000) and warm cream/off-white (not #FFF). Desaturate accents on dark surfaces. Never let ring identity depend on hue alone: red/green, Apple's Move/Exercise pairing, collapses for ~6% of men (deuteranopes). Use position, labels, icons, and a CVD-safe hue set (e.g., Okabe-Ito-derived).

Cal AI's documented language is structural, not chromatic: macro progress rings, a calorie summary card, a calendar strip, a FAB, a health score, and one-question onboarding. Peers that win on design (Oura, Gentler Streak, Opal) pair restraint with one signature object.

### Cited Findings
**Cal AI and minimal peers**
- Cal AI (147-screen teardown):
  - Home: daily calorie summary card; macro cards/carousel with **progress rings**; calendar strip; recently-logged list; FAB to add a meal; "health score" (e.g., 7/10).
  - Help screen "Ring Colors Explained" with a 4-item legend. Selectable dark mode.
  - Onboarding: one question per screen with "Continue", and a "97% completion" gradient progress bar.
  - Exact colours and fonts are not documented.
  — [ScreensDesign: Cal AI](https://screensdesign.com/apps/cal-ai-calorie-tracker/?av=3193&id=1739&vt=1)
- Minimal AI calorie competitors (e.g., 0xCal) market "dark mode first" and a minimal UI against cluttered legacy trackers. — [Feedbagel: 0xCal](https://feedbagel.com/post/0xcal-ai-powered-calorie-tracking-app-with-apple-health-sync-and-minimalist-desi)
- An AI-calorie-app case study targets under 10 seconds per meal logged. — [Contra case study](https://contra.com/p/OOeMMoQl-ai-calorie-tracking-app-full-case-study)

**Apple rings**
- Move = red, Exercise = green, Stand = blue (`HKActivityRingView`). On iPhone without a paired Watch, only the Move ring may show. — [Apple: HKActivityRingView](https://developer.apple.com/documentation/healthkitui/hkactivityringview)
- The ring design "was born from an exercise of minimalistic restraint" borrowing from Apple Watch UI (Close Your Rings campaign, 2017). — [Cannes Lions: Close Your Rings](https://lovethework.com/work-awards/campaigns/apple-watch-series-2-close-your-rings-29598)
- The ring-closing sparkle/fireworks celebration is user-loved. Developers try to recreate it with particle systems. — [Apple Developer Forums #750711](https://developer.apple.com/forums/thread/750711); [Apple Community #252009834](https://discussions.apple.com/thread/252009834)
- Apple ran a 10-year rings anniversary challenge with a limited badge plus animated stickers. — [Android Authority](https://androidauthority.com/apple-rings-ten-year-anniversary-3547546)

**Peer brands**
- Oura brand guidelines: primary palette Oura Black, White, Helsinki Blue (from the Finnish-flag sea blue), and Skin Tone. — [Oura Brand Guidelines v1 (PDF)](https://static.ouraring.com/pdfs/Oura_BrandGuidelines_v1.pdf)
- Instrument's Oura app work built a unified semantic colour system so users see how habits affect health. — [Instrument: Oura app](https://www.instrument.com/work/oura-app)
- Gentler Streak:
  - Awards: 2024 Apple Design Award (Social Impact) and 2022 Apple Watch App of the Year. — [App Store](https://apps.apple.com/us/app/gentler-streak-fitness-tracker/id1576857102)
  - Design challenge: presenting "tons of numbers in a simple way that everyone could understand". — [Sketch blog](https://sketch.com/blog/gentler-streak)
  - Positioned as a lifestyle "compass" rather than a tracker. — [Apple Developer News (JP)](https://developer.apple.com/jp/news/?id=3m0ht22s)
  - 2025 redesign merged Wellbeing into a customisable "For You" tab because users couldn't find metrics. — [9to5Mac, Mar 2025](https://9to5mac.com/2025/03/18/gentler-streak-update-health/); [BGR](https://bgr.com/tech/gentler-streak-gets-a-major-redesign-focused-on-your-wellbeing/)
- Opal:
  - Identity is built on an opal gem that grows "brighter, more vibrant, and more intricate" as focus improves. Apple's Screen Time API sandbox prevented animating the home gem. — [Opal blog: Designing for wellbeing](https://opal.so/blog/designing-for-wellbeing); [Opal blog: new home screen](https://opal.so/blog/introducing-the-new-opal-home-screen-track-your-screen-time-and-improve-your-focus)
  - The agency describes "shifting gradients, elegant type", "soft, and confident" UI. — [Pixeto: Opal case study](https://www.pixeto.co/casestudy/opal)
  - Milestones unlock 3D gems. Onboarding is dark-themed. — [ScreensDesign: Opal](https://screensdesign.com/showcase/opal-screen-time-control)

**Dark-theme colour and contrast**
- Material recommends #121212 as the dark surface rather than pure black. Saturated accents fail 4.5:1 for body text on dark backgrounds and "vibrate". Reserve saturated brand colour for the most prominent elements. — [UXcel: 12 principles of dark mode](https://uxcel.com/blog/12-principles-of-dark-mode-design-627); [UX Design Institute: dark mode](https://www.uxdesigninstitute.com/blog/dark-mode/) (secondary summaries of Material; the original Material page did not render for fetching)
- Cream is "gentler on the eyes than pure white" and pairs with black/navy text. Charcoal is "less harsh than black". — [Figma: Cream](https://www.figma.com/colors/cream/); [Figma: Charcoal](https://www.figma.com/colors/charcoal/)
- Highly saturated colours on dark backgrounds cause eye strain and often fail accessibility. — [Affective: dark mode eye strain](https://weareaffective.com/learning-centre/how-do-i-make-sure-my-apps-dark-mode-doesnt-strain-users-eyes)

**Colour-blind safety**
- Colour blindness affects up to 8% of men and 0.5% of women. — [WashU Inclusion](https://sites.wustl.edu/inclusion/?p=862)
- Deuteranopes are ~6% of men. — [Polychrome vignette: Color deficits](https://cran.csail.mit.edu/web/packages/Polychrome/vignettes/color-deficits.html)
- Okabe-Ito (orange, sky blue, bluish green, yellow, blue, vermillion, reddish purple, black) stays distinguishable under common CVDs. Red/green pairs collapse under deutan/protan. — [arXiv 2303.04918: Coloring in R's Blind Spot](https://arxiv.org/pdf/2303.04918)

### Inferences
**Proposed token direction (to validate with a contrast checker)**
- `bg` charcoal in the #121212–#1A1A1A range.
- `surface` one step lighter.
- `text` warm cream (off-white, slightly yellow/peach-tinted).
- `light-mode bg` = cream with charcoal text, so the "dark + cream" identity inverts cleanly.

**Rings**
- Concentric rings (calories outer; protein/carbs/fat inner, or a single calorie ring + macro bars).
- Desaturated, CVD-distinct hues. Okabe-Ito vermillion/sky-blue/bluish-green/orange are a starting set; hex values aren't verified here.
- Each ring labelled with an icon and ordered by position.
- Every ring must meet ≥3:1 non-text contrast against the background (WCAG 2.1 SC 1.4.11; the spec was not fetched this session).
- Never encode "over goal" by red alone. Add an overflow lap/marker plus text.

**Brand and legal risk**
- Copying Apple's exact three-ring red/green/blue look invites both a CVD problem and a "looks like Apple Fitness" brand problem. Differentiate on ring count, gap, and end-cap treatment.

### Gaps
- No authoritative hex values for Apple's ring colours found. Apple's HIG "Activity rings" page could not be fetched (JS-rendered). Check it manually, including whether it restricts using ring visuals for non-Activity data.
- No sourced information on Bevel's or Whoop's visual design systems, or Cal AI's exact palette and typeface.
- Material's original "15.8:1" body-text-on-#121212 figure is unverified.

## 6. Motion and haptics: low-end Android performance, Reanimated vs core Animated vs Skia, haptics, frame budgets

### Takeaway
Frame budget is 16 ms at 60 Hz (8 ms at 120 Hz). Android drops any frame that overruns. On low-end Android, Software Mansion caps Reanimated at about 100 simultaneously animated components, and recommends transform/opacity animations and Skia for heavier drawing.

For STEADY's Expo-Go-era constraint, the important points are:
- **`@shopify/react-native-skia` is included in Expo Go**, so a Skia ring can be prototyped now.
- Core `Animated` with `useNativeDriver` only handles non-layout props (transform/opacity). Animating an SVG ring's stroke on the native driver is therefore not straightforward.

On haptics, use `expo-haptics` `performAndroidHapticsAsync` (no VIBRATE permission) for Android-native feel.

### Cited Findings
**Frame budgets**
- "your app must render frames in under 16ms to achieve 60 frames per second… 90 fps… 11ms, and for 120 fps it's 8ms." "If you overrun this window by 1ms… Choreographer drops the frame entirely." Slow frames take 16–700 ms, frozen frames 700 ms–5 s, and anything over 5 s is an ANR. — [Android: Slow rendering](https://developer.android.com/topic/performance/vitals/render)

**Core Animated**
- (RN 0.87 docs) The native driver runs animations on the UI thread, so "the JS thread can be blocked without affecting the animation". "you can only animate non-layout properties: things like `transform` and `opacity` will work, but Flexbox and position properties will not." `Animated.event` works only with direct events (not `PanResponder`). Long animations can block `VirtualizedList` rendering; use `isInteraction: false`. — [React Native: Animations](https://reactnative.dev/docs/animations)

**Reanimated** ([Reanimated: Performance guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance))
- Limits: up to ~100 animated components on low-end Android, ~500 on iOS. For heavier effects use Reanimated + Skia.
- Prefer `transform`/`opacity`/`backgroundColor` over layout props.
- New Architecture regressions are acknowledged, including from Expo SDK 53+. Fixes:
  - `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` (4.0+) and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` (4.2+) give a fast path for non-layout props.
  - `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` (RN 0.80+, Reanimated 4.2+) helps scroll FPS.
- Reanimated 3 is unmaintained. Debug builds overstate jank. RN 0.82+ has an Android `debugOptimized` variant.
- 120 fps on iOS needs `CADisableMinimumFrameDurationOnPhone`.
- For counters, animate a `TextInput` from a shared value instead of re-rendering `Text`.
- Latest listed release: Reanimated 4.5.5 (27 Aug 2026), which fixed the Android build on RN 0.83/0.84. — [Software Mansion changelog](https://swmansion.com/changelog/react-native-reanimated/)

**Skia and Lottie**
- `@shopify/react-native-skia` is "Included in Expo Go". Platforms: Android, iOS, tvOS, Web (via CanvasKit). — [Expo docs: Skia](https://docs.expo.dev/versions/latest/sdk/skia/)
- Skia guidance: drive canvas props with Reanimated shared/derived values on the UI thread, and avoid reading shared values on JS. — [react-native-skia performance docs (Mintlify mirror)](https://www.mintlify.com/shopify/react-native-skia/advanced/performance)
- `react-native-skottie` (Lottie on Skia) reports a 63% frame-rate gain over `lottie-react-native` on a low-end Android device. — [margelo/react-native-skottie](https://github.com/margelo/react-native-skottie)

**Haptics** ([Expo docs: Haptics](https://docs.expo.dev/versions/latest/sdk/haptics/))
- Android uses the `Vibrator` service for `impactAsync`/`notificationAsync`/`selectionAsync`.
- `performAndroidHapticsAsync(type)` is recommended and "does not require VIBRATE permission". Types include `Confirm`, `Reject`, `Segment_Tick`, `Segment_Frequent_Tick` (may not vibrate on some devices), `Toggle_On`/`Toggle_Off`, `Long_Press`, `Gesture_Start`/`End`, and `Clock_Tick`.
- The iOS Taptic Engine does nothing in Low Power Mode, when disabled by the user, while the Camera is active, or **while iOS dictation is active**.

### Inferences
**Ring implementation options for STEADY**
- (a) Skia `Path` with animated `end` (trim) driven by Reanimated. This is best quality: gradients, round caps, and overlap shading. Skia is in Expo Go, though Reanimated version-matching must follow the Expo Go-bundled version.
- (b) Two-half-circle masks rotated via `transform` with core Animated + native driver. Works in Expo Go and is very cheap, but limits gradients and end caps.
- (c) `react-native-svg` `strokeDashoffset` with JS-driven Animated. Simple, but it runs on the JS thread and may jank on low-end phones during logging/network work.

Prefer (a) for the hero ring, and keep only one or two animated rings on screen. Build a static fallback when `AccessibilityInfo.isReduceMotionEnabled()` is on (not fetched this session; standard RN API).

**Haptics and motion budget**
- Map haptics to meaning: `Confirm` on a meal logged, `Segment_Tick` on portion slider steps, `Reject` on a failed parse, and a light impact when a ring closes.
- Don't rely on haptics during voice capture on iOS, because the Taptic Engine is silent while dictation is active.
- Keep celebration particles short (well under 1 s), and test in **release builds** on a low-end Android device with Perfetto or the "Profile HWUI rendering" bars.

### Gaps
- No published device-tier benchmarks comparing Reanimated 4, core Animated, and Skia rings on low-end Android. This needs in-house measurement.
- Not verified: the Skia version bundled with Expo Go SDK 54 specifically.

## 7. Signature brand elements in health apps

### Takeaway
Memorable health-app signatures are a **single, ownable object that encodes progress and changes state with the user's behaviour**: Apple's closing rings, Duolingo's emotional owl tied to streaks, Whoop's 0–21 Strain with a live daily ceiling, Oura's 0–100 Readiness, Opal's growing gem. Each is minimal in form but has rich state, and each is celebrated at completion. STEADY's equivalent should be one ownable progress object (its ring) with distinctive states: under, on target, over, and goal-aware, for gainers vs cutters.

### Cited Findings
- Apple rings: minimal, borrowed from the Watch UI ("minimalistic restraint"), with "Close Your Rings" as the behavioural call to action. — [Cannes Lions](https://lovethework.com/work-awards/campaigns/apple-watch-series-2-close-your-rings-29598)
- Duolingo's 2019 Duo redesign:
  - Simplified, geometric shapes made Duo easier to animate and gave him a "full spectrum of emotions" beyond the earlier happy/crying states. — [Duolingo blog: Reshaping Duo](https://blog.duolingo.com/reshaping-duo/); [Design Week](https://www.designweek.co.uk/issues/2-6-january-2019/duolingo-owl-receives-makeover-as-app-becomes-more-gamified); [Creative Bloq](https://www.creativebloq.com/news/duolingos-redesigned-mascot-is-a-hoot)
  - Duo's mood is tied to streaks. — [Creative Bloq](https://www.creativebloq.com/news/duolingos-redesigned-mascot-is-a-hoot)
  - Duolingo even changed the app icon (an "exhausted", then a "melting" Duo) to nudge opens. — [Outlook India](https://outlookindia.com/international/us/duolingos-new-sick-app-icon-why-users-are-concerned-and-how-to-change-it-explained)
- Whoop:
  - Strain is a 0–21 logarithmic scale from heart-rate-zone time. Morning Recovery sets a target Strain, and you watch yourself approach the live ceiling. — [AthleteData: Oura vs Whoop](https://www.athletedata.health/guides/oura-vs-whoop); [Asian Efficiency](https://www.asianefficiency.com/technology/whoop-vs-oura-ring/)
  - Whoop's design goal is action: summarising rather than flooding users with raw metrics. — [WHOOP podcast 189](https://www.whoop.com/thelocker/podcast-189-will-ahmed-shares-the-story-of-building-whoop)
- Oura Readiness is a 0–100 score blending HRV, skin temperature, prior activity, and multi-day recovery balance. — [AthleteData](https://www.athletedata.health/guides/oura-vs-whoop)
- Opal's gem is designed to grow brighter and more intricate as focus improves. Milestones reveal collectible 3D gems. — [Opal blog](https://opal.so/blog/designing-for-wellbeing); [Opal: milestone reveal moment](https://opal.so/blog/the-milestone-reveal-moment); [ScreensDesign: Opal](https://screensdesign.com/showcase/opal-screen-time-control)

### Inferences
- Common pattern: (1) one shape, used everywhere (app icon, widget, Lock Screen gauge, share card); (2) a numeric anchor with a bounded scale; (3) behaviour-linked state change; (4) a ritualised completion moment.
- For STEADY, the ring should be the same object in the app, the widget, the Lock Screen `accessoryCircular`, notifications, and share images. That consistency is what makes it a brand, not just a chart.
- Goal-aware semantics (a "lean-pro gainer" should be rewarded for hitting a surplus) is a differentiator. Apple's rings and most calorie apps treat "more" as uniformly good or bad.

### Gaps
- Found no published research quantifying recall/recognition of these brand elements. The evidence is design commentary, not measurement.

## 8. Where to find design references; notable 2025–2026 nutrition-app redesigns

### Takeaway
Mobbin, Refero, and ScreensDesign hold real shipped-app screens and flows. ScreensDesign has full Cal AI (147 screens) and Opal teardowns. Refero offers an MCP server usable by AI agents. The most instructive 2025–26 nutrition redesign is a cautionary one: MyFitnessPal's "Today" tab, tested Oct 2025 and rolled out in v26.16.0 (21 Apr 2026), reportedly added taps to core logging, and ratings dropped sharply. That figure comes from secondary sources.

### Cited Findings
- Mobbin: a library of real screens, flows, and website sections from launched apps. — [Manus connector listing: Mobbin](https://manus.im/hi/connectors/mobbin)
- Refero:
  - Web + iOS reference library, ~125K+ screens from 400+ products (vendor counts vary). Filters by page type, flow, UX pattern, UI element, and font. — [EveryDev: Refero](https://www.everydev.ai/tools/refero); [Refero 3.0 launch](https://hunted.space/product/refero-3-0-2)
  - A first-party MCP server needs Pro and is capped at 8,000 tool calls/month. Pricing is reported inconsistently. — [Lazylanding: Mobbin vs Refero](https://lazylanding-labs.onrender.com/compare/mobbin-vs-refero.md); [AppLaunchpad: Refero alternatives (Oct 2026)](https://theapplaunchpad.com/blog/refero-alternatives/)
- ScreensDesign teardowns: [Cal AI](https://screensdesign.com/apps/cal-ai-calorie-tracker/?av=3193&id=1739&vt=1), [Opal](https://screensdesign.com/showcase/opal-screen-time-control)
- AlternativeTo maintains a list of design-reference libraries. — [AlternativeTo list](https://alternativeto.net/lists/44740/design-reference-libraries-for-real-world-inspiration/)
- MyFitnessPal:
  - Tested a redesign in Oct 2025 to make the diary central. — [r/Myfitnesspal mirror](https://redlib.hackliberty.org/r/Myfitnesspal)
  - v26.16.0 (21 Apr 2026) reportedly replaced the Diary tab with "Today". Users reported more taps, loss of single-item copy between meals, and a drop of about 1.7 stars in average rating. These specifics are unverified (market-intelligence site). — [MWM: MyFitnessPal v26.16.0](https://mwm.ai/articles/myfitnesspal-v26-16-0-replaces-diary-with-new-ui-sparking-rating-drop-in-april-2026)
- Gentler Streak 2025 redesign: reorganised because users couldn't find metrics. — [9to5Mac](https://9to5mac.com/2025/03/18/gentler-streak-update-health/)
- A designer case study on MyFitnessPal UX. — [UX Collective: improved MyFitnessPal experience](https://uxdesign.cc/ui-ux-case-study-designing-an-improved-myfitnesspal-experience-3492bbe4923c/)

### Inferences
- Lesson for STEADY's redesign: never add taps to the core log loop. Ship redesigns behind a flag or a cohort, and preserve power-user shortcuts (copy meal, repeat yesterday). MyFitnessPal's backlash is a live example of the risk.
- Workflow: pull Cal AI, Opal, Oura, and Gentler Streak flows from ScreensDesign/Mobbin into a moodboard, then validate STEADY's tokens against CVD simulators (Color Oracle, Viz Palette) before building.

### Gaps
- Not confirmed: Page Flows, Screenlane, and Dribbble 2026 status/pricing (searches returned nothing usable).
- Found no verified 2025–26 redesign announcements from Lose It!, MacroFactor, Cronometer, or Cal AI.
- The MyFitnessPal rating-drop figures lack a primary source.
