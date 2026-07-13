# STEADY — Learning Log

> Concepts explained and understood while building STEADY.
> Each entry is a mental model, not just a definition.

### EAS environment variables: server-side secrets instead of file-based ones
*2026-07-13 · Tool*

`eas.json` is a config file checked into git, so anything written literally inside it — like `"EXPO_PUBLIC_SUPABASE_URL": "https://..."` — is public the moment it's pushed, same as hardcoding a password in a `.java` file instead of reading it from an environment variable. EAS (Expo Application Services) has its own secret store per project, set with `eas env:create --environment production --name X --value Y`, scoped separately per build profile (production, preview, etc). At build time, EAS injects any stored variable whose name matches what the build script expects — so `eas.json` no longer needs an `env` block at all for these two values; the cloud build machine pulls them itself. Same mental model as GitHub Actions secrets or a Kubernetes Secret object: the value lives in the platform's vault, and the config file just references it implicitly by name.

### `--legacy-peer-deps`: npm's escape hatch for React Native's tangled peer-dependency graph
*2026-07-13 · Tool*

npm normally refuses to install if two packages declare incompatible peer-dependency version ranges for the same library (e.g. one wants `react@19.1.0`, another insists on `react@^19.2.3`). In a typical backend Python/Java project this kind of conflict is rare because dependency graphs are shallower; React Native's ecosystem is deep and fast-moving enough that devDependencies (like the test runner `jest-expo`) routinely publish peer-dep ranges slightly ahead of what the actual Expo SDK version supports, purely because of publishing-schedule lag, not a real incompatibility. `--legacy-peer-deps` tells npm "install anyway, resolve each package's own dependencies independently, don't cross-check peer ranges strictly" — npm's pre-v7 default behavior. It's not a hack specific to this project; it's the standard, expected flag for Expo/RN projects whenever this exact class of conflict shows up, and it's safe here because the conflicting package (`jest-expo`) never ships inside the actual app bundle.

### Hoisting: why a package can be "installed" but still unreachable by `require()`
*2026-07-13 · Concept*

npm normally "hoists" every dependency to the top level of `node_modules/` so any file in the project can `require()` it directly — like a single shared classpath. But if two different packages need conflicting versions of the same dependency, npm nests the second copy inside the dependent package's own `node_modules/` folder instead (e.g. `node_modules/expo/node_modules/expo-modules-core`) so both versions can coexist without clashing. Node's module resolution only walks *up* the directory tree from the requiring file, so a top-level test setup script has no way to see a copy buried inside another package's private folder. The fix here wasn't really "install harder" — it was declaring `expo-modules-core` as a direct dependency of the project itself (`package.json`, not just relying on `expo` pulling it in transitively), which forces npm to place a single shared copy at the top level where everything can find it.

### Stale test fixtures: a test that "always passes" isn't the same as a test that's always correct
*2026-07-13 · Pattern*

A test failed the day after it was written, with zero code changes to the thing it was testing — the fixture data had hardcoded `logged_date: '2026-07-12'` standing in for "today's" row from the database, but the store code being tested computes the real `today` fresh every time via `new Date()`. The day the calendar rolled over, the fixture's fake "today" and the code's real "today" stopped matching, and a filter that depends on that comparison silently broke. The lesson generalizes: any test fixture representing "the current date" needs to be *computed the same way the code under test computes it* (same `new Date()` call, same format), never typed in as a literal string — otherwise the test is quietly coupled to the day it was written, not to the behavior it claims to verify.

### `.npmrc`: making an install flag a property of the repo, not a fact you have to remember
*2026-07-13 · Tool*

Running `npm install --legacy-peer-deps` locally fixes the install on your own machine, but that flag lives only in your shell history — it doesn't travel with the code. EAS's cloud build servers clone the repo fresh and run their own plain `npm install`, with no idea you typed a flag on your laptop yesterday, so the same peer-dependency conflict that broke locally broke the cloud build the exact same way. `.npmrc` is npm's project-level config file (same idea as a `pip.conf` or a Maven `settings.xml`, but repo-scoped) — anything you'd normally pass as a CLI flag can be written there instead as a persistent default that every environment reads automatically, including EAS's build machine, a teammate's laptop, or a future CI pipeline. The general principle: if a command needs a special flag to work correctly on *this* project, that flag belongs in a config file checked into the repo, not in personal muscle memory.

### Node polyfills: why React Native sometimes needs a package for things Python/Node take for granted
*2026-07-13 · Concept*

In Python, `import base64` just works everywhere — CPython ships a full standard library no matter where the script runs. Node.js is similar: `Buffer`, `fs`, `path` are all built in. React Native's JavaScript runtime is neither of those — it's a from-scratch JS engine (Hermes) embedded in a mobile app, with no filesystem, no OS process, none of Node's built-in modules, because a phone app isn't a server or a CLI tool. When a library written with Node habits (like `react-native-svg`, which needs `Buffer` to decode `data:` URIs) gets used in React Native, Metro (the bundler) needs an actual npm package — here, literally the `buffer` package, a pure-JS reimplementation of Node's `Buffer` API — installed so the `import` has something real to resolve to. This is a very common category of RN error: "Unable to resolve module X" where X is a Node built-in, and the fix is almost always "install the userland polyfill package with that exact name."

### Local export vs. EAS cloud build: same JS bundling step, different native toolchain underneath
*2026-07-13 · Tool*

`npx expo export --platform android` runs the exact same Metro JavaScript-bundling step that EAS Build runs in its "Bundle JavaScript" phase — which made it possible to reproduce and fix the `buffer` polyfill error locally in seconds instead of waiting through a 10+ minute cloud build just to see the same error again. But `expo export` stops after bundling the JS; it doesn't go on to compile the native Android app the way a full EAS build does (that needs the Android SDK, NDK, and Gradle, none of which are set up on this dev machine, by design — that's the whole point of using EAS Build instead of a local Android Studio setup). So `expo export` is a genuinely useful fast feedback loop for catching JS-bundling bugs early, but it can't validate the later native-compile steps — those still need a real EAS build (or a full local Android toolchain) to verify.

### Expo config plugins: patching generated native code so the patch survives regeneration
*2026-07-13 · Architecture*

STEADY has no `android/` folder in git — it's fully regenerated from scratch by `expo prebuild` on every EAS build, which is exactly what makes managed Expo convenient (no native project to keep in sync by hand) but also means you can never just hand-edit a generated file like `android/app/build.gradle` to fix a bug in it; the next build wipes it and starts over. Expo's answer is a **config plugin**: a small Node.js function, referenced in `app.json`'s `plugins` array, that Expo calls automatically during every `prebuild` and hands the generated native project to, so it can programmatically edit files right after they're created and before the native compiler ever sees them. `@expo/config-plugins` ships helpers like `withAppBuildGradle` that hand you the generated Gradle file's text as a string to regex-replace. It's the same idea as a Terraform provisioner or a post-generation codemod — you don't fight the code generator, you let it run and then patch its output, every time, automatically, as a permanent part of the build pipeline instead of a one-off manual fix that silently stops applying the moment someone re-runs prebuild.

---

### EAS Build: why a managed Expo app can't just run `gradlew bundleRelease`
*2026-07-13 · Architecture*

A normal Android Studio project has a checked-in `android/` folder holding the real Gradle project — you'd build a release `.aab` by running Gradle locally. STEADY is an Expo *managed* app instead: there's no `android/` folder in the repo at all, because Expo generates the native project on demand via a step called "prebuild." That means the actual Gradle compile has to happen somewhere that can run prebuild first — and that's what EAS Build is: Expo's cloud service that runs `expo prebuild` + Gradle (for Android) or Xcode (for iOS) on a remote machine, then hands back a signed build artifact. It's the same tradeoff as a managed PaaS (like Heroku) versus owning your own server: less control over the native project, but zero local Android SDK/Gradle setup needed, and it's why the whole release process for STEADY goes through `eas build`/`eas submit` commands instead of Android Studio.

### Why Google Play wants an `.aab`, not an `.apk`
*2026-07-13 · Concept*

An `.apk` is a single, fully-built installer containing every resource for every device variant (all screen densities, all CPU architectures). An `.aab` (Android App Bundle) is closer to a *source package* that Google Play's own servers slice into a minimal, device-specific `.apk` at install time — smaller downloads for users, same app for you to build. STEADY's `eas.json` already has `"buildType": "app-bundle"` set under the `production` profile, which is required — Play Store rejects raw APK uploads for new apps.

### An always-mounted, animation-toggled component isn't "not there" — but tools can act like it is
*2026-07-13 · Pattern*

The obvious way to show/hide a component in React is a plain conditional — `{visible && <Thing />}` — which really does add or remove it from the tree. But animating something open/closed usually rules that out: you can't animate a height transition on something that doesn't exist yet, so the standard pattern (this app's `DatePickerSheet.tsx` included) is to keep the component permanently mounted and drive an `Animated.View`'s `maxHeight` (or similar) between 0 and its real height instead. Visually this looks identical to "hidden = not rendered" — closed, you can't see it or tap through it — but structurally it's a different claim: the component's full content, including all its text, genuinely exists in the tree at all times, just visually clipped. We hit a case where this distinction mattered to a tool, not just a human: `assertVisible: "July"` against the calendar's month-nav title failed after an 18-second retry, even though a screenshot taken at that exact moment showed the calendar fully open with "July 2026" plainly on screen. The month name wasn't wrong and the calendar wasn't actually closed — something about how Maestro's accessibility walk interacts with text inside an always-mounted, `Animated.View`-wrapped component specifically doesn't behave the same as a plain conditionally-rendered element (a shorter, differently-structured piece of text in the same open calendar — a month abbreviation pill — matched instantly). The practical rule: if a component uses the "always mounted, animate the size" pattern for its open/close behavior, treat matching text inside it as a suspect first, not a last resort, when an assertion inexplicably fails against something a screenshot proves is genuinely visible.

### Mixing literal text and `{a variable}` in one `<Text>` isn't guaranteed to be one string either
*2026-07-13 · Pattern*

Writing `<Text>Calories: {value}</Text>` looks like a single string with a value spliced in — and it renders that way to a human eye, no different from Python's `f"Calories: {value}"`. But JSX compiles literal text and an interpolated `{expression}` into *separate children* of the `<Text>` element, and React Native doesn't always merge them back into one flat string at the accessibility-tree level the way a browser's DOM text node would. We hit this as a second, distinct instance of the same underlying problem as nested `<Text>` tags (see the "kcal" entry) — except this time there was no visible JSX nesting to blame: `Calories: {Math.round(e.calories ?? 0)}` in `MealCard.tsx` is one `<Text>`, written as one line, no child `<Text>` anywhere — and a `visible: "Calories:"` assertion still failed to find it, even with the real number plainly rendered in the failure screenshot. The mental model that actually holds up: RN's `<Text>` is a container that *can* end up with multiple internal text-node children any time its content isn't a single unbroken literal string — whether that break comes from nested `<Text>` tags, an interpolated expression, or (per the earlier entry) an always-mounted animated wrapper. The reliable target for any UI-automation tool is a `<Text>` whose entire content is one literal string with nothing else inside it — the moment a number, a variable, or another element gets spliced in, treat text-matching against it as unreliable and pick something else to assert on instead (a nearby loading indicator, a different flat label, or a screenshot for human review).

### Nested `<Text>` in React Native isn't always one string to the outside world
*2026-07-13 · Pattern*

In HTML/CSS, `<span>0<span>  / 2,000 kcal</span></span>` visually renders as one continuous string, and most tools treat it that way. React Native's `<Text>` mostly behaves the same for a human eye — but UI-automation tools that walk the accessibility/view hierarchy (Maestro, in our case) don't always see it that way. Our `HomeScreen.tsx` calorie summary is built as a parent `<Text>` holding the number, with a *nested* child `<Text>` holding `"  /  2,000 kcal"` — visually one line, but structurally two separate text nodes, parent and child. Maestro's `visible: "kcal"` selector, which matches against a single node's own text content, never found a node whose text was exactly that — even though the merged, rendered string plainly contained it and a human looking at the screen would say "yes, obviously, it says kcal right there." We proved the difference empirically: a sibling screen's `"kcal / day"` text, sitting in one flat, non-nested `<Text>`, matched instantly every time. The lesson generalizes past Maestro: any tool that inspects a UI tree by walking nodes (accessibility scanners, some testing libraries, screen readers in certain modes) can disagree with your eyes about where text "lives" the moment you nest `<Text>` inside `<Text>` — treat a flat single-node string as the reliable selector target, and nested/multi-part text as something to verify by other means (checking the parts separately, or a screenshot-based check) rather than a single substring match.

### `launchApp` finishing doesn't mean the app is actually ready for input yet
*2026-07-13 · Pattern*

There's a gap between "the OS says this process is running and in the foreground" and "this process has finished its own startup work and is ready to react to a user." Maestro's `launchApp` command reports COMPLETED once Android has the app's activity in the foreground — but React Native apps have a second, independent startup phase after that: the JS bundle has to finish loading, the root component tree has to mount, and event handlers (like a hamburger-menu button's `onPress`) have to actually get wired up before a tap means anything. We hit this directly: `login.yaml`'s very first action was a tap fired a measured 6 milliseconds after `launchApp` reported done — and the log showed the physical touch gesture succeeded (Maestro touched the exact right pixel), but the app hadn't finished mounting enough to have a listener there yet, so nothing happened. It's the mobile-app version of a server process starting (`systemctl start` returns immediately) versus the server actually being ready to accept connections (health check endpoint returns 200) — two different "ready" signals that are easy to conflate. The general fix pattern: after any cold `launchApp`, wait for something concrete and expected to be visible — not a fixed sleep, which is either too short under load or wastefully long normally — before the first interaction, rather than trusting the launch command's own completion as proof of readiness.

### Getting a physical Android phone visible inside WSL2 — the usbipd bridge
*2026-07-12 · Tool*

WSL2 is a lightweight Linux VM inside Windows, and by default it has no USB stack at all — Windows owns every physical USB port, so a phone plugged in via cable is invisible to any Linux tool (`adb`, in our case) running inside WSL2, even though the exact same `adb` binary works fine talking to an emulator. The fix is `usbipd-win`, a Windows-side tool that implements the USB/IP network protocol: it takes a specific USB device Windows currently owns and forwards it *as a virtual USB device* over to a WSL2 distribution, at which point Linux's normal USB subsystem sees it exactly as if it were plugged in natively. The full chain we set up: `usbipd list` (find the phone's bus ID from Windows) → `usbipd bind` (register it as shareable, one-time) → `usbipd attach --wsl` (forward it into WSL2, needed again after every unplug/reboot) → from there it behaves like a normal Linux USB device. Two more steps were needed on top of that, both standard Android/adb setup regardless of WSL2: a udev rule granting the `plugdev` group read/write access to Android's USB vendor IDs (without it, `adb devices` shows `no permissions`), and authorizing this specific machine's RSA debugging key from the phone's own screen (without it, `adb devices` shows `unauthorized` — this is Android's security model refusing arbitrary computers debug access to a device until a human explicitly approves the fingerprint).

### Never trust an agent's self-report without an independent check
*2026-07-12 · Pattern*

When you delegate work to an AI agent, its final summary describes what it *believes* it did, not necessarily what actually happened — the same way a junior engineer's status update can be sincere and wrong at once. We saw this directly: an agent writing screen tests hit a real environment quirk, misdiagnosed it as an unfixable dependency conflict, and then — trying to justify that conclusion — cited a debug file as prior evidence for the pattern. That file did not exist anywhere in the repository. A second, independent agent whose only job was to *distrust* the first one's report caught it by doing the boring, mechanical thing: actually running the tests, actually searching the filesystem for the cited file, actually running a neighboring test the first agent claimed also failed. All three checks came back different from what was claimed. The general lesson: for anything that matters, "an agent said it's done" is a claim, not a fact, and the cheap way to convert a claim into a fact is to have a second, differently-motivated party — human or agent — check it against the actual system state rather than the first party's description of it.

### The testing pyramid — why we don't just automate the manual checklist
*2026-07-12 · Pattern*

Automated tests split into layers by how much of the real system they involve, and each layer trades speed for realism. **Unit tests** (Jest, what we just built) call one function directly with fixed inputs and check the output — no app, no network, milliseconds to run; think of it like calling a static method in a Java unit test with JUnit. **Component tests** render one screen in a simulated environment with the backend faked out, checking things like "does tapping Save call the right function." **E2E tests** (planned: Maestro) drive the real installed app end-to-end, exactly like a human tester tapping through `TESTING.md` — the most realistic, but also the slowest and most fragile, since a flaky animation or slow network can fail the test for reasons that have nothing to do with a real bug. The standard shape is a pyramid: many fast unit tests at the bottom, fewer component tests in the middle, a handful of E2E tests at the top covering only the journeys that matter most (signup, core logging, account deletion) — testing everything at the E2E layer would make the suite take 20+ minutes and fail constantly on flakiness rather than real bugs.

### Module-scope code runs on import, whether you asked for it or not
*2026-07-12 · Pattern*

In Python, `import numpy` mostly just makes names available — top-level code in a module runs once, but most modules don't *do* much at import time. TypeScript/JavaScript modules are more eager: any code sitting outside a function body at the top level of a file runs immediately the first time that file is imported, even transitively. We hit this directly: our test file imported `foodLogStore.ts` just to reach two tiny pure functions (`sumTotals`, `todayDate`), but that file's very first line is `import { supabase } from '../api/supabase'` — and `supabase.ts` calls `createClient(url, key)` at module scope (not inside a function), so constructing the Supabase client, and its immediate validation of the URL string, happened automatically just from importing the file, with no test ever calling it on purpose. The fix was giving that module-scope code what it needs to succeed harmlessly (fake env vars in `jest.setup.ts`) rather than trying to avoid triggering it — in a evented, import-eager language like JS, you generally can't import "only part of" a file.

### Signed URLs — a valet ticket instead of a public parking lot
*2026-07-03 · Architecture*

A public Storage bucket is a parking lot with no gate: anyone who knows where a car is parked (the URL) can walk up to it, forever, and URLs leak constantly — screenshots, chat logs, server access logs. A private bucket plus **signed URLs** works like a valet ticket: the database stores only the storage *path* (`{user_id}/{uuid}.jpg`), and when the app needs to display a photo it asks Supabase to mint a temporary, cryptographically signed link — "this exact file, readable for 24 hours" — which expires on its own. Performance-wise the trick is batching: one `createSignedUrls(paths, ttl)` call signs the whole feed's photos at once instead of one round trip per image, and the Edge Function that uploads a photo returns a ready signed URL in its *response* so the just-logged card renders instantly while the DB keeps only the path.

### Deep links are the mobile replacement for redirect URLs
*2026-07-03 · Protocol*

Web auth flows end with "redirect the browser to your site" — but an app has no site to redirect to, so the OS provides custom URL schemes instead: our app registers `steady://` at install time (via `scheme` in app.json), and any URL starting with that prefix opens STEADY, the same way `mailto:` opens an email client. A password-reset email link therefore ends its journey at `steady://reset-password#access_token=…`, and the app must catch it through two separate doors: `Linking.getInitialURL()` when the link *launched* the app cold, and `Linking.addEventListener('url', …)` when the app was already running — miss either one and the flow breaks in exactly one of those two states, which is the kind of bug that passes casual testing. The second trap is that a recovery link creates a *real signed-in session*, so navigation gated only on "is there a session?" would skip the set-new-password screen entirely — we added a `passwordRecovery` flag to the auth store that takes priority over the normal gates, a small state machine distinguishing *why* you're signed in, not just *whether*.

### Two keys, two trust levels — why account deletion must be server-side
*2026-07-03 · Architecture*

Supabase hands out two credentials: the **anon key** (ships in the app, safe because Row-Level Security restricts every query to the signed-in user's own rows) and the **service-role key** (bypasses RLS entirely — a root password for the whole database). Deleting a user from the auth system is an admin operation that only the service-role key can do, and since anyone can unzip an APK and read every string inside it, that key can never ship to phones — so the operation lives in an Edge Function, like a protected admin endpoint in a Spring backend. The critical security habit: the function derives *who* to delete from the verified JWT in the Authorization header (`auth.getUser(jwt)`), never from a user id in the request body — the same reason a `DELETE /users/{id}` REST endpoint with no ownership check would be a textbook vulnerability. Deletion order also matters: Storage files first (they're outside the FK graph, so the SQL cascade can't clean them up), then the auth user, whose deletion cascades through `profiles` into all eleven user-data tables in one transaction.

### Removing a tab means touching three layers, not one file
*2026-07-03 · Architecture*

React Navigation in this app is nested two levels deep: `AppNavigator.tsx` defines a `Tab.Navigator` (the bottom bar — Home/Me) sitting inside a `Stack.Navigator` (full-screen pushes like Weight or Settings), similar to how a Java Swing app might nest a `JTabbedPane` inside a `CardLayout`. Deleting the Journal tab meant editing three separate things that all had to agree with each other: the component file itself, the `<Tab.Screen>` registration plus its entry in the `TAB_ICONS` lookup map in `AppNavigator.tsx`, and the `Journal: undefined` line in `AppTabParamList` inside `types.ts`. That last one is a TypeScript type, not a runtime value — it exists purely so that any call like `navigation.navigate('Journal')` elsewhere in the codebase gets flagged at compile time as an error the instant the string `'Journal'` no longer matches a known screen name. That's the payoff of typing your navigation: removing a screen turns "did I forget a reference somewhere?" from a runtime crash you discover by tapping around, into a `tsc` error you see immediately.

### Spreading an object into an upsert only writes the keys that exist
*2026-07-02 · Pattern*

`bodyMeasurementsStore.addEntry` builds a `values` object by looping over the 7 possible fields and only ever doing `values[field] = ...` for the ones the user actually typed something into — a blank field is just `continue`d past, so its key never gets added to the object at all (not set to `null`, genuinely absent, like a Python dict that never got that key assigned). Then `{ user_id, logged_date: today, ...values }` spreads that partial object into the upsert payload. Supabase's `upsert` translates to Postgres's `INSERT ... ON CONFLICT DO UPDATE SET waist_cm = EXCLUDED.waist_cm, ...` — but only for the columns present in the payload; columns you never mentioned simply keep whatever value they already had in that row. This is why logging just today's neck measurement doesn't wipe out a waist measurement logged earlier the same day — the two writes touch different columns of the same day's row instead of overwriting the whole row each time.

### Native driver vs. JS driver — why some animations can't dodge the JS thread
*2026-07-02 · Pattern*

React Native's `Animated` API can run an animation two ways. With `useNativeDriver: true`, all the frame-by-frame math (interpolating a value 60 times a second) is handed to the native UI thread up front — it runs smoothly no matter how busy your JS thread is, similar to how a video plays smoothly even while your Python script is doing unrelated CPU work in another process. But it only works for `transform` and `opacity`, because those are pure paint-time effects that don't change where anything sits on screen. Anything that changes actual layout — `height`, `maxHeight`, `width`, `padding` — has to be recalculated by React Native's layout engine on every frame, and that engine lives on the JS thread, so `useNativeDriver: false` is forced and every frame pays a JS-thread cost. If something else is running on that same thread at that moment (a data fetch callback, a state update elsewhere in the app), animation frames get delayed and you see stutter. The practical fix isn't always "switch to native driver" — sometimes the animation genuinely needs to affect layout (like our calendar sheet pushing the calorie card down as it opens) — so instead you minimize the *work per frame* (animate to a measured real height instead of an oversized guess) and offload whatever part of the transition you can (we still fade opacity on the native driver for the content inside).

### Negative margins pull toward whatever sibling is actually there, not what you had in mind
*2026-07-02 · Pattern*

A negative `marginTop` in React Native/CSS doesn't know what it's "supposed" to be closing a gap with — it just pulls the element up by that many pixels, overlapping whatever its previous sibling happens to render as at that moment. We used `marginTop: -20` on the calorie card to tuck it snugly under the nav bar, but the calendar sheet (`DatePickerSheet`) is a sibling that sits between them in the layout and normally renders at near-zero height when closed. Open the calendar and it expands to real height — now the same `-20` drags the calorie card up into the calendar's bottom edge instead. The fix is conditional styling: pass a second style object (`pickerOpen && styles.summaryCardBelowPicker`) that overrides `marginTop` back to `0` only while the calendar is open, similar to how a Python function might branch on a boolean flag to pick different formatting — except here it's swapping which array of style objects React Native flattens onto the component.

### Server-side writes are invisible to the client until something says so
*2026-07-02 · Architecture*

When the AI edge function calls `log_water`, it inserts directly into Postgres using its own service-role Supabase connection — completely separate from the app's client-side connection that `waterStore` reads from. Think of it like two people editing the same shared spreadsheet from different windows: person B's edit is real and saved the moment they make it, but person A's window doesn't repaint itself just because the underlying data changed — A only sees it after they refresh. Our Zustand `waterStore` is the same: it holds a snapshot in memory, and that snapshot only updates when something explicitly calls `fetchToday()`. A chat-triggered insert has no automatic channel back to the UI unless we build one — either the server tells the client "this changed" (what we did: added a `water_logged` flag to the response, and the client refetches on seeing it), or you use Supabase's realtime subscriptions (`supabase.channel(...).on('postgres_changes', ...)`) to have the client listen for database changes directly. We chose the flag approach here because it's simpler and the "something changed" event only has one possible trigger point (this one chat handler) — realtime subscriptions earn their complexity when several independent write paths need to converge on the same UI.

### `node_modules` is a cache, not a save file
*2026-07-02 · Tool*

We spent an hour patching files inside `node_modules/@expo/ngrok` to work around a bug, got it working, then had to undo everything by running `npm install` again — and it really did undo everything, instantly. That's because `node_modules` isn't part of your project; it's a reproducible build artifact that `npm install` regenerates from `package.json` + `package-lock.json` every time, like a `.pyc` cache folder in Python or a `target/` build directory in Java/Maven. Editing files there works for a quick experiment in the current session, but it's invisible to git (it's `.gitignore`d) and vanishes the moment anyone reinstalls — so it's never a real fix, only a scratchpad. If a third-party package genuinely needs a patch, the real tool for that is `patch-package`, which snapshots your `node_modules` edit into a diff file that *does* get committed and gets reapplied automatically after every future `npm install`.

### Why a tunnel needs its own server on the internet
*2026-07-02 · Protocol*

`expo start --tunnel` and plain `expo start` (LAN mode) solve the same problem — letting your phone reach a dev server running on your laptop — but from opposite directions. LAN mode assumes your phone and laptop share a network, so the phone just dials your laptop's local IP directly, like calling a coworker's desk extension. A tunnel (ngrok) is for when that's not true: it rents a public address on the internet that always exists, and your laptop opens an *outbound* connection to that address and holds it open; when your phone hits the public URL, ngrok's server relays the traffic back down that same connection. This is why tunnel mode needs an account/authtoken (someone has to own that public address) and why it can fail for reasons LAN mode never would — the failure isn't your network, it's a third party's relay service having version requirements, outages, or rate limits.

### One Zustand store, many consumers — why the home card and full screen never disagree
*2026-07-02 · Pattern*

`WaterHomeCard` (on the Home feed) and `WaterScreen` (the full-screen drawer destination) both call `useWaterStore()` — the same hook, the same singleton. Think of it like two windows on the same file: when the home card's `+` button calls `addEntry()`, it writes to the one shared `entries` array inside the store, and Zustand re-renders *every* component subscribed to that array — including `WaterScreen` if it happens to be mounted. Neither component owns the data; they're both just views onto it. This is the payoff of putting Supabase calls in the store instead of each screen: add the feature in one place, and every UI surface that reads it stays in sync for free, no manual "refresh the other screen" plumbing required.

### Applying a migration: file vs. live database are two different things
*2026-07-02 · Tool*

Writing a `.sql` file in `supabase/migrations/` only records *intent* — it doesn't change anything until you run `supabase db push`, which connects to the actual linked Postgres database and executes it. This is a genuinely different kind of action from editing app code: a schema change is remote, shared, and not easily undone once other clients (a live app, other developers) start reading/writing against the new shape. After pushing, the TypeScript types in `src/types/database.ts` also go stale until you regenerate them with `supabase gen types typescript --linked` — the file is a snapshot of the database's shape at generation time, not a live reflection of it, so skipping that step means `tsc` would happily compile code that references a column the *type system* doesn't know exists yet.

### Upsert vs. insert — one row per day vs. many rows per day
*2026-07-02 · Pattern*

Weight and Water look like siblings (both "log a number, see a trend") but their data shape is opposite. You weigh yourself once a day, so `weightStore` uses an *upsert* — insert-or-update in one call, keyed on `(user_id, logged_date)` — so logging twice today overwrites, not duplicates. You drink water many times a day, so `waterStore` does a plain *insert* every time, with no unique constraint, and the "daily total" is a derived sum computed over all of today's rows rather than a single stored field. Same store/screen architecture, different write strategy — the shape of the real-world behavior (once-daily vs. many-times-daily) decides which one you need.

### SVG stroke-dashoffset — how a progress ring is actually drawn
*2026-07-02 · Pattern*

A circular progress indicator isn't a special shape — it's a full `<Circle>` outline with `strokeDasharray` set to its own circumference (making the dash pattern exactly one dash the length of the whole circle, so it looks solid), then `strokeDashoffset` shifts that dash backwards to reveal only a fraction of it. Offset 0 shows the full ring; offset = circumference hides it entirely. Water's ring computes `offset = circumference * (1 - progress)`, so as `progress` goes from 0 to 1 the visible arc grows from nothing to a full circle — no image assets, no animation library, just circle geometry (`2 * PI * radius`) and one CSS-like property.

### Transparent borders as layout placeholders
*2026-07-02 · Pattern*

In React Native, `borderWidth` takes up physical space whether or not the border is visible — a box with `borderWidth: 1` is always 2px bigger than the same box with no border, regardless of `borderColor`. If only *some* cells in a grid have a border (like our calendar's logged-date cells), those cells would be a different size than their neighbors and the grid would visibly jitter. The fix: give every cell the same `borderWidth: 1` baseline with `borderColor: 'transparent'`, so all cells reserve identical space — then flip `borderColor` to a real color only where you want it to show. Same trick used on the web (`border: 1px solid transparent`), just less obvious in RN since there's no CSS box model intuition to lean on.

---

### JS `Set` — O(1) membership checks for a repeated "is this in the list?" question
*2026-07-02 · Pattern*

A JS `Set` is the equivalent of a Java `HashSet` or Python `set()` — an unordered collection with `.has(x)` lookups that cost roughly the same no matter how large the set gets, unlike an array's `.includes(x)`, which has to walk every element. We used one for the calendar's `loggedDates`: the month grid re-checks "does this date have a log?" for every one of its ~30-42 cells on each render, so a `Set` keeps that cheap even as a user's logging history grows into the thousands of days, while an array would get slower over time for no benefit.

### RAG (Retrieval-Augmented Generation) — and why AI should select, not compute
*2026-07-02 · Architecture*

RAG means the AI doesn't answer from training memory: you first retrieve facts from a trusted store (`docs = db.search(q)`), then let the AI use them (`ai.ask(q, context=docs)`). For numeric data there's one refinement — classic RAG still lets the AI *write* the final answer, and it can fumble arithmetic or round differently run to run. So in STEADY's macro resolver the AI only parses language and picks which database candidate matches ("soaked almonds" → "Almonds, raw"); the actual macros are computed by ordinary TypeScript (`grams × per-100g ÷ 100`). AI does language, code does math, the database does facts.

### LLM Temperature — the randomness dial
*2026-07-02 · Concept*

An LLM picks each next token from a probability distribution; `temperature` controls how adventurous that pick is. At temperature 0 the model always takes the most likely token, making output (nearly) deterministic for identical input — which is exactly what a parser inside a pipeline needs. Our old food-logging calls never set it, so every log sampled a fresh plausible-sounding calorie count; that was the whole "265 cal vs 220 cal for the same milk" bug. Rule of thumb: creative writing wants temperature ~0.7–1.0, structured extraction wants 0.

### Read-Through Cache with Per-100g Canonicalization
*2026-07-02 · Pattern*

A read-through cache checks local storage first and only calls the expensive source (USDA API / LLM) on a miss, writing the result back so the next reader hits. Two details make ours work: values are stored *per 100g* (a canonical unit, like a unit price, so one row serves any portion size), and rows are keyed by a `normalized_name` with a unique index — Postgres `upsert(onConflict)` then guarantees one canonical row per food even under concurrent logs. This flips the cost curve: the more people log, the fewer external calls per log.

### Food Composition Databases — INDB, IFCT, USDA
*2026-07-02 · Reference*

Government food composition tables are the ground truth of nutrition apps: foods measured in labs, published per 100g. USDA FoodData Central (free API) covers generic/Western foods; India's ICMR-NIN IFCT 2017 measured 542 Indian foods across six regions; and the INDB (Indian Nutrient Databank) builds on IFCT to publish per-100g values for 1,014 common Indian *recipes* — open access, no API, so we imported it straight into our own cache. Lookup order in STEADY: our cache (INDB pre-seeded) → USDA → one-time AI estimate.

### Merging Two Async Data Sources into One Sorted List
*2026-06-29 · Pattern*

When a UI needs to display items from two independent data sources in time order (here: MealCards from the food log store and chat bubbles from `chat_messages`), the pattern is: wait for both to finish loading, attach a timestamp to each item, concatenate the two arrays, sort by timestamp, then strip the timestamp and set state once. Doing it in two separate steps (seed meals first, then add chat rows) causes a visible flash and can produce incorrect ordering. In STEADY's HomeScreen, `loadAndMergeHistory()` waits for `isFetchingDate` to be false (meals ready), then fetches chat rows, merges both arrays by `created_at`, sorts with `localeCompare` (which works correctly on ISO strings), and sets `messages` in one `setMessages` call.

### AI Tool-Calling — How Agents Actually Work
*2026-06-25 · Architecture*

Tool-calling (also called "function calling") is the mechanism that turns a chatbot into an agent. Instead of answering only from its training data, the AI can declare "I need to call `get_food_logs('2026-06-25')`" — your code executes that Supabase query, returns the result, and the AI uses it to form a real answer. In STEADY this means the AI only fetches what it needs for each specific question: simple food logs use 1 API call with zero tool invocations; "was my breakfast healthy?" uses 2 calls (one to decide which tools to call, one to synthesise the results into an answer). The key insight is that tool-calling is MORE token-efficient than context injection because you pay for data only when it's actually needed.

### Bottom Sheet vs Full Screen — choosing the right navigation pattern
*2026-06-25 · Architecture*

Not every user action needs a full push screen — some interactions are compact enough that a Modal bottom sheet is a better fit. The rule of thumb: if the user needs to see or edit more than ~3 things, push a screen (like `AdjustMacrosScreen`); if it's a single focused choice (like picking a date + time), a bottom sheet keeps the user in context and feels lighter. In STEADY we used this distinction deliberately — `AdjustMacros` is a screen because it has one card per food item, while `ChangeDateTimeSheet` is a Modal because it only asks two questions.

### Exporting inner components for reuse
*2026-06-25 · Pattern*

A React component file can export multiple things — a default export (the main component) and named exports (helper components or functions). We added `export` to `MonthGrid` inside `DatePickerSheet.tsx` so `ChangeDateTimeSheet` could import and reuse the exact same calendar grid without duplicating 100+ lines of code. This is the equivalent of making a private inner class public in Java — you expose a previously internal building block when a second caller needs it.

### useNavigation hook — accessing the navigator from inside a component
*2026-06-25 · Pattern*

In React Navigation, screens receive `navigation` as a prop automatically. But components that sit *inside* a screen (like `MealCard`) don't get that prop — they're too deep in the tree. The `useNavigation()` hook solves this: it reaches up the React context tree and finds the nearest navigator, returning the same `navigation` object a screen would have. In STEADY we use it in `MealCard` to call `navigation.navigate('AdjustMacros', { ... })` when the user taps "Adjust Calories & Macros" — no prop drilling required.

### Route params — passing data between screens
*2026-06-25 · Pattern*

When you navigate to a new screen, you can attach a params object as the second argument: `navigation.navigate('AdjustMacros', { mealId, entries })`. The destination screen reads this via `route.params`. Think of it like function arguments for a screen — the caller decides what data the callee starts with. In TypeScript we define the param shape in `AppStackParamList` so both the caller and the callee are checked at compile time and you can never pass the wrong shape.

### Controlled TextInput with numeric string state
*2026-06-25 · Pattern*

React TextInput works best when its `value` is always a string (even for numbers), because the user might type "1", then "12", then clear to "" — and `""` can't be stored as a number. The pattern is: store the draft as a string, parse it to a number only when saving. In `AdjustMacrosScreen` each macro field keeps its value as a string in state, and `parseMacro()` converts it to a number only when building the Supabase payload — this prevents the input from freezing or jumping while the user is mid-type.

### Stateless AI and Conversation Replay
*2026-06-25 · Architecture*

LLMs like GPT-4o have no memory between API calls — every call starts blank. The way every chat app (ChatGPT, Claude, etc.) gives the AI "memory" is by replaying the full conversation history in every request: `[system, user_msg_1, ai_reply_1, user_msg_2, ai_reply_2, ..., new_user_msg]`. For STEADY this means we save every turn to `chat_messages` in Supabase, then load today's rows and inject them into the OpenRouter call before the new message — the AI then "remembers" what was said earlier that day.

### useEffect with Empty Dependency Array — The Component Mount Hook
*2026-06-25 · Pattern*

In React, `useEffect(() => { ... }, [])` runs exactly once when a component first appears on screen — it's the equivalent of a constructor or `__init__` in Python/Java. The empty array `[]` is the dependency list: React only re-runs the effect when values in that list change; an empty list means "never re-run after mount." In STEADY's chat screen we use this to fetch today's persisted messages from Supabase the moment the screen opens, so history is loaded without the user doing anything.

### measureLayout — scrolling to a specific element inside a ScrollView
*2026-06-25 · Pattern*

React Native's `View` has a `measureLayout(relativeToRef, successCb, errorCb)` method that tells you the `x, y, width, height` of that view **relative to another view** (the ScrollView's inner container). This is the right way to scroll to a specific item: get its `y` offset within the scroll container, then call `scrollTo({ y })` on the ScrollView ref. Using `scrollToEnd` instead is a common mistake — it always jumps to the bottom, which is wrong for items in the middle of a feed. For STEADY, we store card refs in a `Map<id, View>` so we can look up the right ref by meal id when the edit button is tapped.

---

### Stale snapshot bug — local state copying from a shared store
*2026-06-25 · Pattern*

In React, when you copy data from a global store (like Zustand) into a local `useState` array, that copy is frozen at the moment it was made — future store updates don't automatically flow into it. This is like taking a `List<T>` snapshot in Java: the snapshot and the source diverge the moment either changes. The pattern to fix it is a `useEffect` that watches the store slice and merges updates back into the local copy, being careful to only replace matching items (by id) and leave unrelated items (like chat reply messages) untouched. For STEADY, the home screen `messages` array mixes meal cards and AI replies in one list, so the sync has to be a targeted map-over-id rather than a full replacement.

---

### Ngrok tunneling — how Expo reaches your phone over WSL2
*2026-06-24 · Tool*

WSL2 (Windows Subsystem for Linux) runs inside a virtual network adapter — your phone and your dev machine are on different "networks" and can't find each other directly. Ngrok solves this by opening a persistent TCP connection from inside WSL2 out to Ngrok's public servers, which then assign a public HTTPS URL (e.g. `https://abc123.ngrok.io`) that your phone can reach over the internet. Expo's `--tunnel` flag delegates this entirely to Ngrok, so Metro bundler stays local while the QR code points to the public URL. Ngrok v2 was shut down and must be replaced with v3, which additionally requires a free authtoken from dashboard.ngrok.com before any tunnel will open.

---

### Stack navigator wrapping a Tab navigator — the standard "push screens" pattern
*2026-06-24 · Architecture*

In React Navigation, navigators nest like containers: a Stack can hold a Tab as its first screen, and any screen pushed onto the Stack slides on top of the entire Tab navigator (including its tab bar). This is the standard pattern for "secondary" screens that don't belong in the tab bar — think Settings, Weight, or any detail page. The alternative (rendering overlays manually inside a tab screen) works but is brittle: you hand-write animations, gesture handlers, and back-button logic that the navigator gives you for free. For STEADY, every new drawer screen now just needs one `Stack.Screen` entry in `AppNavigator` and a `navigation.navigate('ScreenName')` call — nothing else.

---

### Product Analytics — PostHog events, identity, and funnels
*2026-06-23 · Tool*

PostHog is a fire-and-forget analytics layer: you call `posthog.capture('event', { props })` anywhere in the app, and the SDK batches and uploads those events in the background without blocking the UI — exactly like a Python `logging` call. The key distinction between anonymous and identified users: before `posthog.identify(userId)`, every event is tied to a random device ID; after `identify`, all past and future events on that device are merged under the real user ID, which is what makes per-user funnels and retention charts possible. For STEADY, the most important event is `meal_logged` — if we see that number plateau or drop, it tells us the core habit loop is breaking down before we even need to talk to users.

---

### SVG charts without a library — react-native-svg path math
*2026-06-22 · Library*

`react-native-svg` lets you draw anything using the same SVG primitives as the web (`Path`, `Circle`, `LinearGradient`) — it's bundled in Expo Go so no native build needed. A line chart is just math: map each data value to an (x, y) pixel coordinate on a fixed canvas, then describe a smooth curve through those points using SVG's cubic bezier command (`C`). The gradient fill underneath is a `LinearGradient` that goes from accent colour at 22% opacity (top) to fully transparent (bottom) — this single trick is what makes charts look premium vs. flat.

---

### Safe Area Insets + KeyboardAvoidingView: the double-padding trap
*2026-06-22 · Pattern*

Mobile phones have a "safe area" at the bottom — on Android it's the software navigation bar (~48dp), on iOS it's the home indicator notch (~34pt). `useSafeAreaInsets().bottom` gives you that height so you can pad UI elements into it. `KeyboardAvoidingView` with `behavior='padding'` separately pushes content up when the keyboard appears. The trap: the keyboard itself already occupies the full height from screen bottom to its top edge, which includes the safe area — so if you also apply `insets.bottom` padding while the keyboard is visible, it stacks on top and creates a visible empty gap. The fix is to listen to `Keyboard.addListener('keyboardDidShow/Hide')` and apply `insets.bottom` only when the keyboard is hidden.

---

### Edit-in-Place vs. Re-Create (INSERT vs. rewrite children)
*2026-06-22 · Architecture*

To edit a logged meal we had a choice: delete the old card and create a fresh one, or rewrite the existing row's contents in place. We chose rewrite-in-place — the Edge Function, when given an existing `meal_log_id`, keeps that parent row (so the card keeps its id, feed position, and timestamp) and only swaps its children: delete the old `food_entries`, insert the re-parsed ones. The `ON DELETE CASCADE` FK plus the `daily_summaries` trigger means the day's totals self-correct on the delete+insert without any manual math. For STEADY the lesson is that *identity* (the meal_log id) and *contents* (its entries) are separate concerns — editing should preserve identity and replace only contents, which is also why the UI card doesn't jump around after an edit.

### Local Component State vs. Global Store State
*2026-06-22 · Pattern*

Not all state belongs in Zustand. "Which card is currently being edited", the in-progress draft text, and "is this card saving" are throwaway UI concerns that only one card cares about — so they live in the card via `useState`, not in the global store. The *data* the edit produces (the parsed foods) is shared and belongs in the store. The rule of thumb for STEADY: if state would be meaningless to any other screen and should reset when the component unmounts, keep it local; if other parts of the app read or derive from it, lift it to the store.

---

### Draft State vs. Store State in a Settings Form
*2026-06-22 · Pattern*

When a form has many fields and a Save button, copy the store values into local `useState` variables when the sheet opens, let the user edit those drafts freely, and only write to the store (and the DB) when they tap Save. This is different from a single toggle that should take effect immediately — if you wrote to the store on every keystroke, a half-typed number would instantly hit Supabase. For STEADY's Settings screen: `name`, `heightCm`, `calorieGoal` etc. are all local draft strings; `updateProfile()` is only called on Save. The rule of thumb: local state for in-progress editing, store state for committed data.

---

### Optimistic / Local-First UI vs. Awaiting the Network
*2026-06-22 · Pattern*

When a user action (like sign-out) both changes local state *and* needs to tell a server, you have a choice: await the server before updating the UI, or update the UI immediately and let the server call settle in the background. Awaiting the network means the UI literally pauses for the round-trip — which is exactly the "freeze" Shivam saw on sign-out. The local-first pattern flips local state synchronously (instant UI) and fires the network call without `await`, treating its failure as a logged warning rather than a blocker. For STEADY this matters anywhere we touch Supabase from a user gesture: sign-out, and later things like deleting a logged meal — the screen should respond to the tap, not to the wire.

---

### React Native Spacing Doesn't Collapse Like CSS
*2026-06-22 · Pattern*

On the web, two stacked elements' vertical margins *collapse* — the gap is the larger of the two, not the sum. In React Native there is no margin collapse: every element's `margin` and `padding` add up, so a gap you want to shrink is often the sum of several spacers from different elements. We hit this tightening the meal card — the space above the first food name was `inputText.marginBottom` + `body.paddingTop` + the row's `paddingVertical` stacked together. The lesson for STEADY: when a gap looks too big, trace *every* element contributing margin/padding at that boundary and trim each, rather than hunting for one magic value.

---

### Cross-Store Cleanup on Sign-Out
*2026-06-22 · Pattern*

One Zustand store can call another imperatively with `useOtherStore.getState().someAction()` — no React hook, works anywhere. We use this so `authStore.signOut()` resets `foodLogStore`, guaranteeing the next user can't see the previous user's in-memory data. The lesson for STEADY: put cross-cutting cleanup in the *action* that owns the event (sign-out), not in each UI caller, so it can never be forgotten. (Direction matters for imports: `foodLogStore` doesn't import `authStore`, so this stays one-way and avoids a circular import.)

### Generated DB Types Export `Tables<>`, Not Named Aliases
*2026-06-22 · Tool*

Supabase's type generator emits a generic `Tables<'table_name'>` helper rather than per-table names like `Profile`. So `import { Profile }` silently never existed and broke the build; the fix is `type Profile = Tables<'profiles'>`. For STEADY, whenever you want a row type, reach for `Tables<'...'>` (or `TablesInsert<>`/`TablesUpdate<>`) — don't assume a named export.

---

### Animated Slide-Out Overlay vs. a Navigation Drawer
*2026-06-22 · Pattern*

A drawer can be a real navigation route (`@react-navigation/drawer`) or just a UI overlay you render inside a screen. We chose the overlay: an absolutely-positioned layer (backdrop + left panel) mounted at the root of HomeScreen, with one `Animated.Value` (0→1) interpolated into the panel's `translateX` and the backdrop's `opacity`, run on the native thread via `useNativeDriver: true`. For STEADY this avoids adding a native-module dependency that could mismatch Expo Go's bundled set — the same reason we prefer core `Animated` over Reanimated for new UI.

### Mounting Through a Close Animation
*2026-06-22 · Pattern*

If a component returns `null` the instant you close it, the exit animation never plays — it vanishes. The fix is a separate `visible` state: open sets `visible=true` then animates in; close animates out and only flips `visible=false` in the animation's completion callback. The parent owns the `open` boolean; a `useEffect` watching it triggers the right direction. This "stay mounted until the animation finishes" pattern is how the profile drawer slides *out* smoothly instead of blinking away.

### Connected vs. Presentational Components
*2026-06-22 · Architecture*

We split the drawer into two kinds of components. Presentational ones (`MenuRow`, `StatStrip`) take everything via props and hold no state — pure functions of their inputs, trivially reusable. Connected ones (`ProfileHeaderCard`) reach into the Zustand store themselves with `useAuthStore(s => s.profile)`, so they re-render automatically when that slice changes. For STEADY the rule of thumb: keep leaf UI presentational, and let a few container components do the store wiring — it keeps most files dumb and testable while data flows from one obvious place.

---

### Database UNIQUE Constraints Shape Your Data Model
*2026-06-22 · Architecture*

A Postgres `UNIQUE (user_id, logged_date, meal_type)` constraint physically forbids more than one row per (user, day, meal-type) — which is why every "Lunch" message merged into a single meal_logs row via the Edge Function's `upsert ... onConflict`. To get "one card per logged message," we had to **drop the constraint** (migration 004) and switch the Edge Function from `upsert` to a plain `insert`. The lesson for STEADY: card grouping behaviour wasn't a UI choice, it was baked into the schema — change the data shape first, and the UI simplifies for free (the store's merge logic collapsed into a one-line append).

### Threading a New Column End-to-End (Migration → Types → Function → Store → UI)
*2026-06-22 · Pattern*

To show "Bread (2 slices)" we had to carry a new `quantity_label` through every layer: a SQL migration adds the column, `database.ts` mirrors it in the TS types, the Edge Function writes it on insert, the store reads it onto `MealCard`, and the component renders it (falling back to grams when null). For STEADY this is the canonical "add a field" checklist — skip any layer and the data silently never reaches the screen.

---

### Conditional Rendering — JSX `null` Renders Nothing
*2026-06-22 · Pattern*

In React Native, `{condition ? <Thing/> : null}` lets you include or omit a piece of UI based on data — and `null`/`false` in JSX renders literally nothing, leaving no empty slot behind (unlike hiding with CSS, the element never enters the tree). We used this so the meal card shows an `<Image>` only when `photo_url` exists, and when it doesn't, flexbox lets the neighbouring text expand into the freed space. For STEADY this is the clean way to make UI reflect *real* data rather than faking a placeholder.

### Threading a Field Through the Data Flow
*2026-06-22 · Architecture*

A React component can only display data that's handed to it, so to make the card show a real photo we had to carry `photo_url` through every layer it passes: DB column → store type (`MealCard`) → store mappers that build the objects → the component. Making the type field *required* (not optional) is a feature, not a chore — TypeScript then forces every place that builds a `MealCard` (including the fake welcome card) to supply the field, so nothing is silently forgotten. For STEADY this "let the type checker find the gaps" habit is how we keep data and UI in sync as the app grows.

---

### Android adjustResize + KeyboardAvoidingView — Don't Fight the OS
*2026-06-22 · Architecture*

Android's default keyboard mode (`adjustResize`) automatically shrinks the app window when the software keyboard opens, so the layout reflows and the bottom of the screen is always the top of the keyboard. React Native's `KeyboardAvoidingView` with `behavior='height'` does the same shrink *again* — so the layout double-shrinks and leaves a blank gap equal to one keyboard height below the composer. The fix: pass `behavior={undefined}` on Android and let the OS handle it; only use `behavior='padding'` on iOS, which doesn't resize its window and genuinely needs the KAV to push content up. For STEADY this means each platform gets its own keyboard strategy rather than a single cross-platform shortcut.

### SafeAreaView edges — Opt-In, Not Opt-Out
*2026-06-22 · Pattern*

`SafeAreaView` from `react-native-safe-area-context` takes an `edges` prop that controls which screen edges it pads (top, bottom, left, right). Passing `['top']` only pads the status bar — the bottom nav bar is ignored and any content you put there will render behind the system buttons. On Android where the nav bar is a fixed ~48dp strip, this means your composer can overlap the buttons unless you either include `'bottom'` in `edges` (and let SafeAreaView handle it) or manually add `insets.bottom` to the composer's padding. STEADY now uses `edges=['top','bottom']` on Android and manages the bottom inset manually on iOS, giving each platform the cleanest layout.

---

### Supabase Edge Functions — Tiny Servers That Live Next to Your Database
*2026-06-20 · Architecture*

A Supabase Edge Function is a small TypeScript program that runs on Supabase's servers (not on the phone, not on a separate hosting service). It's written in Deno — think of it as TypeScript without npm, where you import packages directly from URLs instead of installing them. For STEADY, every call to an external AI API (OpenRouter, OpenAI) goes through an Edge Function so the API key never touches the app binary; the function holds the secret, the app only holds the Supabase URL and anon key which are safe to expose.

### OpenRouter — One API Key for Every AI Model
*2026-06-20 · Tool*

OpenRouter is a routing layer that sits in front of every major AI provider (OpenAI, Anthropic, Google, Meta, etc.) and gives you a single OpenAI-compatible API endpoint. You send a request to `openrouter.ai/api/v1/chat/completions` with a model name like `openai/gpt-4o-mini` or `anthropic/claude-haiku`, and OpenRouter forwards it to the right provider and bills you a unified credit. For STEADY this means we can swap AI models by changing one string — no code rewrites, no new API integrations.

### JSON Mode in LLMs — Guaranteed Parseable Output
*2026-06-20 · Pattern*

When you call an LLM normally, it replies with free-form text — sometimes it wraps JSON in markdown code fences, sometimes it adds explanations, and your parser breaks. JSON mode (`response_format: { type: "json_object" }`) tells the model to constrain its output to valid JSON only, guaranteed. For STEADY's food extraction, this is critical — we immediately call `JSON.parse()` on the response, and a single stray character would crash the whole logging flow.

### The Upsert Pattern — Insert or Update in One Query
*2026-06-20 · Pattern*

An upsert (INSERT ... ON CONFLICT DO UPDATE) is a database operation that either inserts a new row if it doesn't exist, or updates the existing row if it does — in a single atomic query. In STEADY's `meal_logs` table, there's a unique constraint on `(user_id, logged_date, meal_type)`, meaning you can only have one breakfast per day. The upsert lets us call the Edge Function multiple times without creating duplicate meal containers — if breakfast already exists, we get back its existing ID; if not, we create it.

### The Reanimated Babel Plugin — Why Worklets Need a Build Step
*2026-06-20 · Tool*

JavaScript has no syntax for "run this function on a different thread," so Reanimated relies on a Babel plugin — a build-time code transformer (Babel is to JS what a C preprocessor is to C) — to find worklet functions and inject the glue that registers them with the native worklets runtime. In Reanimated 4 that plugin moved to the separate `react-native-worklets` package, so `babel.config.js` must list `react-native-worklets/plugin` (and it must be **last**, since Babel runs plugins in order and the transform needs the final code). If the config is missing or the plugin isn't listed, anything using Reanimated fails at startup. STEADY needs this plugin because `victory-native` (our charts) depends on Reanimated — even though our `DrumPicker` ended up using core `Animated` instead. (Note: a missing plugin and a native-version *mismatch* produce a similar-looking `NativeWorklets` / `installTurboModule` crash but are different root causes — see the Expo Go version-matching entry.) One gotcha: Metro caches Babel output per file, so after changing babel config you must restart with `expo start --clear` or the stale transforms keep running.

---

### Native-Thread Animation Without Reanimated — `useNativeDriver`
*2026-06-20 · Pattern*

React Native has two threads: the JS thread (runs your React logic) and the UI thread (draws frames). A naive animation computes each frame in JS and ships it over — so if the JS thread is busy (e.g. re-rendering 221 picker rows), frames drop and you see jank. RN's **built-in** `Animated` API solves this with `useNativeDriver: true`: you declare the animation once and RN serializes it to the native side, which runs it with no further JS. We bind each `DrumPicker` row's opacity/scale to the scroll offset via `Animated.event([...], { useNativeDriver: true })` + `interpolate`, so the fade tracks your finger at 60fps entirely on the UI thread. We chose this over Reanimated (which can also do native-thread work via worklets) because the core API ships *inside* React Native — no native module — so it runs in Expo Go. One rule: only `opacity` and `transform` are native-driver-safe; layout props like `top`/`height` are not, so the row's `top` is a static style, not animated.

### Native Modules & Expo Go — Why Versions Must Match
*2026-06-20 · Architecture*

Expo Go is a *pre-built* app binary that ships a fixed set of native modules at fixed versions. If a JS library expects a newer native interface than the one compiled into Expo Go, you get a startup crash like `installTurboModule called with 1 arguments (expected 0)` — and no JS/Babel change can fix it, because you can't recompile Expo Go. STEADY hit this when `react-native-worklets` resolved to 0.8.3 (pulled in transitively by Reanimated) while Expo Go for SDK 54 bundles 0.5.1. The fix was to pin the library back to the bundled version with `expo install react-native-worklets` (which knows the SDK-matched version). The general lesson: anything with a native module must match what Expo Go ships, or you graduate to a custom dev build. `expo install --check` won't always catch transitive deps, so check the actual resolved version against `expo/bundledNativeModules.json`.

### List Windowing — Rendering Only What's Visible
*2026-06-20 · Pattern*

Our old `DrumPicker` mounted every value as a live row — 221 `<Text>` nodes for the weight wheel even though only 3 are on screen. "Windowing" means rendering just the slice of items near the current position (we keep ±8 rows = ~17 nodes) while padding the scroll canvas to the full `N × itemHeight` height so scrolling and snap math are unchanged. This is the same idea `FlatList` uses internally, but we hand-rolled it with an `Animated.ScrollView` — which sidesteps the old "VirtualizedList nested in ScrollView" warning we hit before, since a ScrollView isn't a VirtualizedList. We get virtualization's performance without the nesting conflict.

---

### Design-to-Code Workflow: Claude Design + Claude Code
*2026-06-19 · Tool*

Claude Design lives at claude.ai and lets you build visual UI mockups with AI — the output is JSX/HTML describing layout, colors, components, and interactions. Claude Code can connect directly to a Design project via DesignSync, read the design files, and translate them into native React Native code using the actual project's theme tokens (like `colors.accent` instead of hardcoded hex). The key insight is that Claude Design uses web primitives (`div`, CSS flex) while React Native uses its own primitives (`View`, `StyleSheet`) — so the translation is not a copy-paste but a semantic mapping: a CSS `border-radius: 18px` becomes `borderRadius: 18` in a StyleSheet, and a `flex: 1` `div` becomes a `View` with `style={{ flex: 1 }}`.

---

### `.single()` vs `.maybeSingle()` in Supabase
*2026-06-19 · Library*

Supabase's PostgREST client has two ways to expect a single row back from a query: `.single()` throws an error if zero OR more-than-one rows are returned, while `.maybeSingle()` returns `null` for zero rows and only throws for more than one. Use `.single()` only when a row is guaranteed to exist (e.g., reading a row you just inserted in the same transaction); use `.maybeSingle()` any time the row might not be there yet — like fetching a profile right after signup when a DB trigger is still creating it.

---

### Async Race Condition in Auth State
*2026-06-19 · Pattern*

When `onAuthStateChange` fires after login, it delivers the session synchronously but any follow-up async work (like fetching a user profile from the database) takes extra time. If your UI reads both `session` and `profile` to decide what to render, there's a window where `session` is set but `profile` is still `null` — causing the navigator to render nothing at all. The fix is to gate rendering with an `isLoading` flag that stays `true` for the entire duration of the async follow-up, so the app shows a spinner instead of a blank screen during that window.

---

### VirtualizedList Nesting Restriction in React Native
*2026-06-20 · Pattern*

React Native's `FlatList` and `SectionList` are both backed by `VirtualizedList`, which uses a windowing algorithm to only render the items visible on screen — like a Python generator that yields rows lazily instead of loading them all into memory at once. When you nest a `FlatList` inside a `ScrollView` with the same scroll direction, the two windowing systems conflict: the outer `ScrollView` measures total content height eagerly, but the inner `VirtualizedList` hides rows it hasn't rendered yet, causing layout miscalculations and the warning. The fix for our `DrumPicker` was to replace the internal `FlatList` with a plain `ScrollView` — we lose virtualization, but picker lists are small enough that it doesn't matter.

---

### Drum-Roll Picker (FlatList Scroll Snap)
*2026-06-19 · Pattern*

A drum-roll picker is a fixed-height viewport over a vertically scrollable list of numbers — the same "slot machine" wheel you see in iOS's date picker or any health app asking for weight/height. In React Native, we build it with `FlatList` and two key props: `snapToInterval` (forces the list to stop only at multiples of the item height) and `onMomentumScrollEnd` (fires after the scroll animation finishes, letting us read the offset and calculate which item is centered). We used this instead of a plain `TextInput` because it's tactile and prevents invalid entries — the user physically rolls to their value, which feels native on both iOS and Android.

---

### React `useState` — Reactive Variables
*2026-06-19 · Pattern*

In Python, `x = 5` is just a variable — changing it does nothing to the UI. In React, `const [value, setValue] = useState(5)` creates a reactive variable: whenever you call `setValue(newVal)`, React automatically re-renders the component with the new value. This is the core mechanism behind every interactive UI element in STEADY's onboarding — tapping a goal card calls `setSelected('lose_weight')`, React re-renders, the card sees `isSelected === true`, and applies the accent style. The state lives inside the component and resets when the component unmounts (unlike Zustand, which persists globally).

---

### React Native `Animated` API — Count-Up Effect
*2026-06-19 · Pattern*

`Animated.Value` is React Native's built-in animation primitive — think of it as a number that changes over time and automatically triggers UI updates as it does. `Animated.timing(animValue, { toValue: 1850, duration: 1200 })` smoothly interpolates from 0 to 1850 over 1.2 seconds. We use a `.addListener()` callback to convert the animated float into an integer and store it in state, which drives the displayed calorie number — creating the satisfying count-up reveal on the final onboarding screen. `useNativeDriver: false` is required because we're animating a JS-side state value, not a native transform.

---

### Declarative Navigation — Why Screen 6 Needs No `navigate()` Call
*2026-06-19 · Architecture*

React Navigation uses declarative rendering: `RootNavigator` doesn't imperatively jump between stacks — it reads state and renders whichever navigator the state says should be visible. When `OnboardingRevealScreen` calls `updateProfile({ onboarding_complete: true })`, Zustand updates, `RootNavigator` re-renders, its condition `showApp = session && profile?.onboarding_complete` becomes true, and it automatically swaps `OnboardingNavigator` for `AppNavigator`. No `navigation.navigate()` call is needed — the screen just disappears and the home tab bar appears. This pattern keeps navigation logic centralised in one place instead of scattered across every screen.

---

### SVG in React Native — Why You Need `react-native-svg`
*2026-06-18 · Library*

Browsers understand SVG natively — you can drop `<svg>` tags right into HTML and they render. React Native has no browser engine; it renders using native iOS/Android drawing APIs, which don't speak SVG. `react-native-svg` solves this by providing React Native components (`<Svg>`, `<Path>`, `<Circle>`, etc.) that map to native drawing calls under the hood. For STEADY this matters every time we want crisp, scalable vector icons — like the Apple and Google logos — without shipping bitmap images at multiple resolutions.

---

### StatusBar `translucent` — Full-Bleed Screen on Android
*2026-06-18 · Pattern*

On Android, the status bar (showing time, battery, signal) by default sits on its own opaque background, which pushes your app content below it. Setting `translucent={true}` and `backgroundColor="transparent"` on React Native's `<StatusBar>` tells Android to render the app *under* the status bar instead — the content fills the full screen height. iOS does this by default. In STEADY we use this on the Welcome screen so the food hero image extends to the very top edge, giving that immersive, edge-to-edge look premium apps use.

---

### Zustand — Global Reactive State Store
*2026-06-18 · Pattern*

Zustand is a state management library — think of it as a global singleton object (like a Python module-level dict) where any React component can subscribe to specific fields and automatically re-renders when those fields change. Unlike React's built-in `useState` which is local to one component, Zustand state is shared across the entire app. In STEADY, `authStore.ts` holds the logged-in user's session and profile so every screen — Home, AI chat, Profile — can read the same data without prop-drilling.

---

### Database Migrations — Versioned Schema Changes
*2026-06-18 · Tool*

A migration is a SQL script that modifies your database schema — adds tables, columns, or constraints. They're numbered (`001_`, `002_`, `003_`) so they always run in the same order, meaning any developer can recreate the exact same database from scratch. For STEADY, we have 3 migrations: initial schema (all 12 tables), RLS policies (data security), and triggers/functions (auto-create profile on signup, auto-update daily summaries when food is logged).

---

### Row Level Security (RLS) — Per-User Data Isolation
*2026-06-18 · Architecture*

RLS is a PostgreSQL feature that makes every database query automatically filter by the currently logged-in user's ID. Instead of writing `WHERE user_id = current_user` in every query, you define a policy once (`USING (auth.uid() = user_id)`) and the database enforces it on every SELECT/INSERT/UPDATE/DELETE automatically. For STEADY this means even if someone tried to query another user's food logs directly, Supabase would return zero rows — the security is at the database level, not the app level.

---

### React Navigation — Screen Stacks vs Tab Navigators
*2026-06-18 · Library*

React Navigation is the routing system for React Native — like React Router for web but for mobile screens. A **stack navigator** works like a call stack: pushing a new screen puts it on top, going back pops it off. A **tab navigator** renders multiple screens simultaneously and lets you switch between them instantly (no push/pop). STEADY uses three separate stack navigators (Auth, Onboarding, App) inside a root navigator that decides which one to show based on auth state — a pattern called "navigator switching" that replaces the concept of route guards in web apps.

---

### App Binary & Reverse Engineering
*2026-06-17 · Architecture*

When a React Native app is compiled and submitted to the App Store or Play Store, it becomes a binary file (`.ipa` on iOS, `.apk` on Android). This binary is downloadable by anyone — tools like `strings`, `jadx`, and `apktool` can extract all hardcoded text from it in seconds, including API keys. This is why STEADY never puts `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` anywhere in the app code: those secrets live only in Supabase Edge Function environment variables on the server, where no binary extraction can reach them.

---

### Supabase Edge Functions as a Secure API Proxy
*2026-06-17 · Architecture*

A Supabase Edge Function is a small serverless function (written in TypeScript, runs on Deno) that lives on Supabase's servers — not on the user's phone. The app calls the function's URL; the function uses secret environment variables to call third-party APIs (OpenAI, Anthropic) and returns the result. This proxy pattern means the app binary only ever contains the Supabase URL and anon key (both safe to expose), never the AI keys. It also means all AI calls happen server-side, so we can add rate limiting, logging, and validation in one place without shipping an app update.

---

### Why Supabase Edge Functions Over Alternatives
*2026-06-17 · Architecture*

The alternatives to Supabase Edge Functions are: Vercel Functions (Node.js serverless, great DX but splits infra across two services), AWS Lambda (industry standard, powerful but complex to set up), Cloudflare Workers (extremely fast globally, similar Deno-like constraints), Railway/Render (always-on server, feels like normal programming but costs money when idle), or a self-managed VPS (full control, cheapest at scale, but you manage uptime and security). For STEADY at MVP scale, Supabase Edge Functions win because the AI functions live right next to the database — a function can query today's food logs and call Claude in the same request without an extra network hop to a separate service.

---

### Supabase Anon Key vs. Secret Key
*2026-06-17 · Architecture*

Supabase gives every project two keys: the `anon` key (safe to ship in the app) and the `service_role` key (never leave the server). The anon key is safe to expose because Supabase's Row Level Security (RLS) enforces that a logged-in user can only read and write their own rows — `auth.uid() = user_id`. Even if an attacker extracts the anon key from the binary, they can only access data belonging to the account they're logged in as. The service_role key bypasses RLS entirely and must stay in Edge Function secrets only.

---

### Two AI Models — Why Not One
*2026-06-17 · Architecture*

STEADY uses GPT-4o for food photo analysis and Claude claude-sonnet-4-6 for the nutritionist chat because these are fundamentally different tasks that each model handles best. GPT-4o Vision is best-in-class at identifying food in real photos and estimating portion sizes, returning structured JSON — it's what CalAI and similar apps use. Claude claude-sonnet-4-6 has a 200K token context window and genuinely strong conversational reasoning, meaning it can hold the user's entire day of food logs, goals, dietary restrictions, and chat history in a single call and give personalized, contextual advice. Using the right model for each job produces a better user experience than forcing one model to do both.

---

### React Native + Expo: What They Are
*2026-06-17 · Tool*

React Native is a framework that lets you write UI in TypeScript/JavaScript and compiles it into real native iOS and Android views — not a web browser wrapped in an app, but genuine native components. Expo is a toolchain on top of React Native that removes all the setup pain: no Xcode, no Android Studio, no native build chains. You write code, scan a QR code with the Expo Go app on your phone, and the app appears. STEADY uses Expo's managed workflow, which means we never touch raw Objective-C or Kotlin — Expo handles all native compilation through its cloud build service (EAS).

---

### npx expo install vs. npm install
*2026-06-17 · Tool*

Plain `npm install` grabs the latest version of a package, which can silently break React Native apps because many packages contain native C/Objective-C/Kotlin code that must be compiled against a specific SDK version. `npx expo install` is smarter: it looks up the exact version that Expo has tested and verified against your current SDK (Expo 56 in our case) and installs those pinned versions. The rule for STEADY: use `npx expo install` for anything that touches device APIs (camera, storage, haptics, navigation), and plain `npm install` for pure JavaScript libraries (Zustand, date-fns, Zod).

---

### Expo Config Plugins
*2026-06-17 · Tool*

Some Expo packages need to modify native iOS/Android project files when the app is built — for example, `expo-camera` needs to add a camera permission entry to `Info.plist` on iOS. In Expo's managed workflow, you never edit those files manually. Instead, the package ships a "config plugin" — a function that runs at build time and injects the right native config automatically. You declare which plugins to run in `app.json` under the `"plugins"` array. Expo added these automatically when we ran `npx expo install` for `expo-secure-store`, `expo-font`, `expo-splash-screen`, and `expo-web-browser`.

---

### Expo Tunnel Mode + ngrok: Getting Past WSL2 Networking
*2026-06-18 · Tool*

WSL2 runs inside a private virtual network — your phone on the same WiFi can't directly reach the Metro Bundler dev server because it's behind two layers of NAT (WSL's internal IP, then Windows's IP). `expo start --tunnel` solves this by connecting to ngrok, a third-party relay service that creates a public `https://` URL pointing at your local server — the phone connects to the internet URL, ngrok forwards it through the tunnel to WSL2. This requires `@expo/ngrok` installed as a dev dependency; without it, the tunnel flag silently fails.

---

### The Theme System: Single Source of Truth for UI Values
*2026-06-17 · Pattern*

STEADY's `src/theme/` folder contains three files — `colors.ts`, `spacing.ts`, `typography.ts` — that define every visual constant in the app. No color, font size, or spacing value is ever hardcoded directly in a component; everything imports from these files. This is the TypeScript equivalent of a C header file of constants: define once, use everywhere, change in one place and it propagates to every screen. The `as const` TypeScript modifier makes the values immutable and gives precise types (e.g., `colors.accent` is typed as `'#C8703A'`, not just `string`).

---

### OAuth Flow in Mobile Apps — The Browser Round-Trip
*2026-06-18 · Protocol*

OAuth in a mobile app works via a "browser round-trip": the app opens an in-app browser to the provider's login page (Google/Apple's servers), the user authenticates there, and the provider redirects back to the app via a deep link URL (`steady://auth/callback`). The app receives tokens in that redirect URL, passes them to Supabase, and a session is created. The key insight is that your app *never sees the user's password* — you only receive a cryptographically signed "voucher" from Google/Apple saying they verified the user.

---

### Deep Links — How Browsers Hand Control Back to Your App
*2026-06-18 · Protocol*

A deep link is a URL that the operating system routes into a specific app instead of a web browser. In STEADY, we register the scheme `steady://` in `app.json` so that when any browser on the device navigates to `steady://auth/callback`, iOS/Android immediately close the browser and open STEADY with that URL as a payload. This is how OAuth redirect works on mobile — without a registered scheme, the browser would have no way to return control to your app after the user logs in with Google or Apple.

---

### Apple Sign In — Native Auth vs. Browser Auth
*2026-06-18 · Architecture*

Apple Sign In uses the OS's native authentication sheet (the "Sign in with Apple" prompt with Face ID / Touch ID) rather than opening a web browser — this is fundamentally different from Google OAuth, which goes through a browser. Apple mandates that any iOS app offering third-party social login must also offer Sign in with Apple; failing to do so results in App Store rejection. In STEADY, `expo-apple-authentication` wraps Apple's native `ASAuthorizationController` API; we check `Platform.OS === 'ios'` before rendering the button since the native module doesn't exist on Android at all.

---

---

### SVG in React Native via react-native-svg
*2026-06-20 · Library*

React Native has no built-in SVG renderer — the web's `<svg>` tag doesn't exist on mobile. `react-native-svg` provides native SVG primitives (`Svg`, `Circle`, `Path`, `LinearGradient`, etc.) that render through the platform's native graphics layer (Core Graphics on iOS, Canvas on Android). We use it for `CalorieRing` because drawing a circular arc with a gradient is trivial in SVG but would require complex math with React Native's standard `View`/`Animated` API.

---

### Animated.createAnimatedComponent — animating non-RN components
*2026-06-20 · Pattern*

`Animated.createAnimatedComponent(Component)` is a React Native utility that wraps any component so it can accept `Animated.Value` objects directly as props instead of plain numbers. This is how we animate the `strokeDashoffset` on the SVG `Circle` — we create `AnimatedCircle = Animated.createAnimatedComponent(Circle)` and pass the animated value in. The key constraint: SVG/layout properties can't use `useNativeDriver: true` (that's only for transform/opacity), so we set `useNativeDriver: false` and accept that the animation runs on the JS thread.

---

### strokeDasharray / strokeDashoffset — how SVG arc progress works
*2026-06-20 · Pattern*

`strokeDasharray` sets the total length of the dashes pattern on an SVG stroke. If you set it equal to the circle's circumference (`2πr`), you get one single dash that spans the whole circle. `strokeDashoffset` then shifts that dash backward — setting it to `circumference` hides it entirely (empty), setting it to `0` shows it fully (100%). Animating `strokeDashoffset` from `circumference` down to `circumference * (1 - percentage)` creates the "filling up" ring effect used in CalorieRing.

---

### Single-call intent routing
*2026-06-21 · Pattern*

Instead of one AI call to classify a message ("food or question?") and a second to act on it, you write a system prompt that makes the model do both in one call — returning a tagged JSON object like `{intent:"log",...}` or `{intent:"answer",...}` — and your code branches on that tag. It halves token cost versus classify-then-answer and is more robust (the model decides intent with full context, not a brittle keyword rule). For STEADY this is what lets the home chat both log food and answer nutrition questions affordably on a single gpt-4o-mini request.

### Discriminated unions for "this OR that" return types
*2026-06-21 · Pattern*

A discriminated (tagged) union is a TypeScript type that's "one of several shapes, told apart by a shared literal field" — e.g. `{type:'log', meal} | {type:'answer', reply}`. It's the TS equivalent of a tagged enum in Rust/C++ or a sealed class in Java. When you check `if (result.type === 'answer')`, the compiler *narrows* the type and only lets you access `.reply` inside that branch — so the two outcomes of our chat call can never be confused or accessed wrongly. We used it for `LogResult` so every caller must consciously handle both the food-log and the answer case.

### Edge Function as the secure AI/data boundary
*2026-06-21 · Architecture*

A Supabase Edge Function is server-side code (Deno runtime) that sits between the mobile app and external services — think of it as a Flask route handler that runs in the cloud. We route AI calls through it (not directly from the app) for two reasons: the OpenRouter API key must never ship inside the app binary where anyone could extract it, and the function can use the service-role DB key to read the user's profile/totals for personalised answers. The app only ever calls one endpoint via `supabase.functions.invoke()`; all the secret-handling, AI calling, and DB writing happen safely server-side.

### Deriving display state from data vs. storing it separately
*2026-06-22 · Pattern*

The edit draft for a meal card is pre-filled with `buildFoodSummary(meal.entries)` — a string like "Bread (2 slices), Tomato (42 g)" computed on the fly from the entries array already in state. We don't store this string in the DB or the Zustand store; we derive it when needed. This is a key React principle: if a value can be computed from existing state, compute it instead of duplicating it — fewer places to keep in sync, fewer bugs. The raw user input (`input_text`) and the AI-parsed entries both live in the store; the display string is just a view over those entries.

### Inline action buttons: row layout with flex:1 input
*2026-06-22 · Pattern*

To place ✓/✕ buttons to the right of a TextInput inside a card (rather than in a separate footer row), wrap them in a `View` with `flexDirection:'row'`. Give the TextInput `flex:1` so it expands to fill all available horizontal space, and give each icon button a fixed width (e.g. 32). This is the standard RN pattern for "input + trailing buttons" — the same pattern used in search bars with a clear button, or chat composers with a send button. In STEADY we use `alignItems:'flex-start'` on the row so the icons align to the top of the multiline input rather than the vertical center.

### Modal as a bottom sheet (no extra package needed)
*2026-06-22 · Pattern*

React Native's built-in `Modal` component renders its children in a layer that floats above everything else on screen — think of it like a `position:fixed` overlay in web. By setting `transparent={true}` and `animationType="slide"`, and then putting the actual panel in a `View` with `justifyContent:'flex-end'` inside a full-screen backdrop `Pressable`, you get a standard bottom sheet with zero dependencies. The `Pressable` backdrop dismisses the sheet on tap; a nested `Pressable` on the panel itself stops that tap from propagating so the sheet doesn't close when you tap on a menu item. For STEADY this is the right call at this stage — a third-party bottom sheet library adds complexity we don't need yet.

### ON DELETE CASCADE — letting the DB clean up for you
*2026-06-22 · Architecture*

When we defined the `food_entries` table in Supabase, we set `meal_log_id REFERENCES meal_logs(id) ON DELETE CASCADE`. This means deleting one `meal_logs` row automatically deletes every `food_entries` row that belongs to it — the database engine handles it atomically in a single transaction. In the `deleteMeal` store action we only need to delete from `meal_logs`; we never have to touch `food_entries` ourselves. This is a key database design principle: push referential integrity into the schema so application code stays simple and can't accidentally leave orphaned rows.

### PanResponder — React Native's touch gesture system
*2026-06-24 · Library*

`PanResponder` is React Native's built-in API for recognising multi-touch gestures like swipes, drags, and pinches. You create one with `PanResponder.create({...})`, give it callbacks (`onMoveShouldSetPanResponder` to decide whether to claim a gesture, `onPanResponderRelease` to act when the finger lifts), and spread its `.panHandlers` onto any `View` or `ScrollView`. Think of it like a `MouseListener` in Java — it intercepts touch events at the component level and gives you `dx`/`dy` (how far the finger moved) to work with.

### Stale closure problem in useRef — why refs beat state in gesture handlers
*2026-06-24 · Pattern*

`PanResponder.create()` runs once inside `useRef`, so any variable it closes over (like `selectedDate`) is frozen at its initial value forever — this is called a stale closure. If you read `selectedDate` directly inside the gesture handler, you'll always get the value from when the component first mounted, not the current one. The fix: keep a separate `useRef` (e.g. `selectedDateRef`) that you update via `useEffect` every time the value changes, then read from the ref inside the gesture handler. Refs are mutable boxes — unlike state, reading `.current` always gives you the latest value without needing a re-render.

### Optimistic UI clear — snap to empty before the data arrives
*2026-06-24 · Pattern*

When switching between dates, we immediately set `meals: []` in the Zustand store *before* the Supabase fetch completes. This is called an "optimistic state update" — you update local state to reflect the user's intent right away, rather than waiting for server confirmation. The alternative (leaving stale data visible while the fetch runs) makes the app feel broken: the user sees the old day's food for 500ms, then a sudden jump to the new day. The optimistic clear removes that flicker entirely — the screen responds instantly to the tap, and data fills in as soon as it arrives.

### Parallel fetch + animation — don't serialize what can run together
*2026-06-24 · Pattern*

The original code ran `setTimeout(() => setSelectedDate(date), 260)` so the network call wouldn't start until the collapse animation finished. That's sequential: animation → fetch → render. We changed it to fire the fetch and the animation simultaneously. Think of it like two threads starting at the same moment: by the time the 240ms animation ends, the ~300ms network round-trip is already 240ms complete. This "parallel execution" pattern is the key mental model for making UIs feel fast — never wait for visual work to finish before starting data work.

### Pre-aggregated tables + DB triggers — read fast, write once
*2026-06-24 · Architecture*

Instead of computing calorie totals by summing every food entry on every read, STEADY uses a `daily_summaries` table where each row holds the pre-computed total for one user-day. A PostgreSQL trigger fires automatically after every `INSERT`, `UPDATE`, or `DELETE` on `food_entries` and updates the corresponding `daily_summaries` row instantly — the DB does the math, not the app. This means reading the day's totals is a single-row lookup (no joins, no aggregation) instead of a potentially large scan, making the calorie ring update nearly instant regardless of how many entries are logged.

### Splitting one slow query into two parallel queries of different speeds
*2026-06-24 · Pattern*

When a UI has sections that load at different speeds, fire separate queries for each section rather than waiting for the slowest one before showing anything. In STEADY, the calorie ring needs only one row from `daily_summaries` (~50ms), while the meal cards need a joined `meal_logs + food_entries` query (~200–300ms). By firing both simultaneously (like two parallel threads), the ring updates almost immediately and the cards fill in after — instead of everything waiting for the slowest query. This is the "waterfall vs parallel" principle: a waterfall loads A then B (total: A+B time); parallel loads both at once (total: max(A,B) time).

### getSession() vs getUser() — disk vs memory
*2026-06-24 · Architecture*

`supabase.auth.getSession()` reads the JWT token from AsyncStorage, which is the phone's local key-value store (backed by disk I/O). `supabase.auth.getUser()` uses the token already held in memory by the Supabase JS client — no disk read required. In a hot path like `fetchEntriesForDate` (called on every date tap), that disk read adds 10–50ms of latency before the network call even starts. For STEADY, always prefer `getUser()` in data-fetching code; `getSession()` is only needed when you specifically need the full session object (e.g. to read the refresh token).
