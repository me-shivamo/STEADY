# BUILD.md — How to build STEADY

Runbook for producing an installable APK or an uploadable AAB. Written after the
2026-08-03 build session, where three separate things went wrong before an
artifact appeared. Everything below is verified on this machine.

---

## TL;DR

```bash
cd /home/shivam/STEADY

./scripts/seed-gradle-dist.sh                      # one-time per Gradle version

export ANDROID_SDK_ROOT="$ANDROID_HOME"
EAS_LOCAL_BUILD_ARTIFACTS_DIR="$PWD/build-output" \
  npx eas-cli build --local --profile production --platform android --non-interactive
```

Output lands in `build-output/build-<timestamp>.aab`. Takes ~30 minutes.

For an **installable APK** instead, swap `--profile production` → `--profile preview`.

---

## 1. Which profile do I want?

The word "build" hides three different artifacts. They are configured in
`eas.json` and they are *not* interchangeable:

| Profile | Produces | Installable on a phone? | Use it for |
|---|---|---|---|
| `development` | APK with `developmentClient: true` | ❌ No | Debugging with a live Metro server attached |
| `preview` | Standalone APK | ✅ **Yes** | Sideloading, sending to a tester, testing native modules |
| `production` | `.aab` (Android App Bundle) | ❌ No | **Uploading to Play Store** |

Two things that trip people up:

- **`development` is not a normal app.** It's a shell containing native code but
  no JavaScript — on launch it goes hunting for a Metro dev server to stream the
  bundle from. Useless on a phone that isn't on your network. `preview` runs
  Metro once at build time and bakes the bundle into the binary.
- **An AAB cannot be installed.** It's a *publishing* format: a container of
  per-architecture, per-density slices that Google's servers re-package into
  device-specific APKs at download time. Android has no installer for it. If you
  want to hold the app in your hand, you want `preview`.

Mental model: closer to Gradle's debug-vs-release than to anything in Python
packaging.

---

## 2. Prerequisites (one-time)

```bash
java -version                # need JDK 17  (have: openjdk 17.0.19)
echo "$ANDROID_HOME"         # need Android SDK  (have: /home/shivam/android-sdk)
npx eas-cli whoami           # need login  (have: me-shivamo)
free -h                      # want 4GB+ free; Gradle is configured for -Xmx2048m
```

If `whoami` fails: `npx eas-cli login`.

---

## 3. Check the environment variables FIRST

**Do not skip this.** It is the failure mode that produces a build which
compiles perfectly and is broken at runtime.

```bash
npx eas-cli env:list --environment production
```

You should see **all five**:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_POSTHOG_HOST
EXPO_PUBLIC_POSTHOG_KEY
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_SUPABASE_URL
```

**Why this matters.** `EXPO_PUBLIC_*` variables are not read at runtime the way
`os.environ` is in Python. Metro **inlines them into the bundle at build time**,
so whatever value exists when the bundle compiles is permanently baked in. Our
`.env` file is gitignored, and EAS uploads the project *respecting `.gitignore`*
— so the builder never sees `.env` at all. The only source of truth for a build
is the EAS environment variable store, which is a completely separate place with
no syncing between them.

The failure is silent: nothing errors, the variable is just `undefined`, and code
with a graceful fallback behaves plausibly while doing the wrong thing. A missing
Supabase URL means no backend. A missing PostHog key means analytics quietly
disabled. A missing Google client ID drops native sign-in to the browser flow.

Each profile in `eas.json` names its environment explicitly (`"environment":
"production"` etc.), so you can answer "which vars does this build get?" by
reading the repo instead of querying a remote service.

> As of 2026-08-03: `production` and `preview` have all five.
> `development` is missing both PostHog vars — deliberate, so debugging sessions
> don't pollute analytics.

---

## 4. Seed the Gradle distribution

```bash
./scripts/seed-gradle-dist.sh
```

Safe to re-run — it exits immediately if already cached.

**Why this exists.** `gradlew` is a ~60 KB script whose only job is to download
the real Gradle before any compilation starts, and `gradle-wrapper.properties`
caps that download with `networkTimeout=10000`. The catch:
`services.gradle.org` isn't a file host, it **307-redirects** to GitHub's
release-asset CDN — and the 10-second budget applies to connecting to *that*
host, which you never named and won't find in any config file. From this network
it takes longer than 10s, so the build dies with `SocketTimeoutException` before
compiling anything.

The giveaway that it's a timeout and not a blocked host: `curl -L` pulls the
identical URL at 12 MB/s.

The script fetches the distribution with `curl` (retries, no 10s cap), verifies
the zip, unpacks it into Gradle's wrapper cache, and drops the empty `.ok` marker
file the wrapper trusts to conclude it already downloaded successfully.

It computes the cache directory the same way Gradle does —
`base36(md5(distributionUrl))` — so it keeps working when Expo bumps the Gradle
version. Because `distributionBase=GRADLE_USER_HOME`, the cache lives in
`~/.gradle` and **survives EAS regenerating `android/`** from `app.json` on every
managed-workflow build. Editing `gradle-wrapper.properties` in the repo would
*not* work, because prebuild overwrites it.

---

## 5. Build

```bash
cd /home/shivam/STEADY
export ANDROID_SDK_ROOT="$ANDROID_HOME"

EAS_LOCAL_BUILD_ARTIFACTS_DIR="$PWD/build-output" \
  npx eas-cli build --local --profile production --platform android --non-interactive
```

**Why `--local`.** It compiles on this machine, so there's no queue — but it
still pulls the **keystore and environment variables down from EAS**, so the
artifact is signed identically to a cloud build. That last part is the whole
point: running `./gradlew bundleRelease` by hand signs with a *debug* keystore,
giving a different SHA-1, and Google Sign-In fails for reasons that look nothing
like a signing problem.

**Why not the cloud** (`npx eas-cli build --profile production --platform android`):
it works and is one command less, but on the free tier the queue has historically
been hours — two Android builds on 2026-07-13 took `11:52 → 16:00` and
`10:21 → 14:53` wall-clock, nearly all of it waiting. Use the cloud when you
don't care when it finishes.

Expect **~30 minutes** (measured: `BUILD SUCCESSFUL in 31m 13s`). Most of it is
C++: Reanimated and Gesture Handler ship native source that CMake compiles once
per ABI, and an AAB carries all four (`armeabi-v7a`, `arm64-v8a`, `x86`,
`x86_64`).

Run it in the background or in a separate terminal — it's long enough that you
don't want to babysit it.

---

## 6. Verify the artifact

```bash
A=$(ls -t build-output/*.aab | head -1)
ls -lh "$A"
keytool -printcert -jarfile "$A" | grep -E 'SHA1|Valid'
```

Expected signing fingerprint — this is the EAS keystore:

```
SHA1: EB:23:27:83:58:49:41:0D:5B:4E:71:46:6A:5E:B8:B7:E8:CC:A7:C7
```

**If you see a different SHA-1, stop.** It means the build signed with a debug
key rather than the EAS keystore, and Google Sign-In will fail on every device.

Useful because the fingerprint is a property of the *file*, so you never need
Play Console to answer "what is this signed with?" — ask the artifact. (Handy,
since Google moved app signing out of "App integrity" and buried it under
"Protected with Play". Direct link, if you do need it:
`https://play.google.com/console/u/2/developers/7509193530257845958/app/4972759200716066915/keymanagement`)

Optional structural check:

```bash
python3 -c "
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1]); n = z.namelist()
print('entries:', len(n))
print('ABIs:', sorted(set(e.split('/')[2] for e in n if e.startswith('base/lib/'))))
" "$A"
```

Expect ~1509 entries and all four ABIs.

---

## 7. Version codes

`eas.json` sets `appVersionSource: "remote"` and `autoIncrement: true` on
`production`, so EAS keeps the counter server-side and bumps it per build.

**It increments per *attempt*, not per success.** Our failed Gradle run consumed
8; the successful retry got 9. Harmless — Play only requires that each upload's
version code be strictly greater than what's already on the track — but don't be
surprised by gaps.

Check the current value:

```bash
npx eas-cli build:version:get --platform android
```

---

## 8. ⚠️ Local build logs contain your signing key

`eas build --local` hands a base64-encoded "job" blob to a helper package, and
that blob carries everything the build needs offline — including
`buildCredentials.keystore.dataBase64` plus the keystore, key, and alias
**passwords in clear text**.

On success you never see it. **On failure the helper echoes the failing command,
blob and all, straight into the log.**

For STEADY that blob is the Play Store *upload key* — the credential proving to
Google that an upload is genuinely ours. So:

- **Never** paste a raw `eas build --local` log into a GitHub issue, Discord, a
  bug report, or a pastebin.
- If you need to share one, strip any line containing
  `eas-cli-local-build-plugin ... eyJ` first.

General lesson: anything that serialises credentials to pass them between
processes will eventually serialise them into an error message.

---

## 9. After the build — before uploading

- [ ] **Register the Play app-signing SHA-1** as an Android OAuth client
      (`STEADY Android (Play)`). ← **This was the 2026-08-04 `DEVELOPER_ERROR`.**

      **Where the page actually is** (took four wrong turns to find, 2026-08-04 —
      it is NOT under any menu item containing the word "signing"):
      ```
      https://play.google.com/console/u/2/developers/<devId>/app/<appId>/keymanagement
      ```
      By menu: **Protected with Play** → expand **Play Store protection** →
      *Play app signing*. The old `Test and release → Setup → App signing` path
      no longer exists; `Test and release → App integrity` now redirects to the
      Protected with Play landing page, which is the trap.

      The two fingerprints for STEADY, recorded so they can be told apart at a
      glance (both are public certificate hashes, not secrets):
      | Certificate | SHA-1 | What it signs |
      |---|---|---|
      | **App signing key** | `C9:0E:F9:F4:DB:A9:07:62:80:CF:31:AC:2E:45:78:5E:31:CC:57:54` | Everything installed **from Play** — register THIS for Google Sign-In |
      | Upload key (EAS) | `EB:23:27:83:58:49:41:0D:5B:4E:71:46:6A:5E:B8:B7:E8:CC:A7:C7` | The `.aab` you upload, and sideloaded `--profile preview` APKs |

      **What actually went wrong (2026-08-04).** The OAuth client
      `STEADY Android (Play)` (`853928970205-2utal884a987lbpd53htbk89ohu78nan`)
      *did* exist, created 2026-08-03 — correct name, correct package name — but
      its SHA-1 was `75:67:E3:8D:D3:F3:0D:3C:32:1E:E3:46:48:3A:A7:1B:BC:EF:94:54`,
      which is **neither** of the two certificates above. Most likely the
      Internal-app-sharing fingerprint or a debug keystore, copied from the wrong
      row. So the checklist item looked done, and was wrong in the only field
      that matters. Lesson: when ticking this step, paste the fingerprint and
      then *diff it against the two known values* — a plausible-looking hex
      string is not evidence.

      Note also that an Android OAuth client holds **exactly one** SHA-1 — they
      cannot be stacked. Every signing channel you distribute through (Play,
      EAS sideload, Internal app sharing) needs its own client.

      *Why:* Play App Signing **strips the `EB:23:…` signature and re-signs**
      with Google's own key before shipping to devices. The certificate on a
      tester's phone is not the one you just verified. Registering only the EAS
      fingerprint produces the nastiest symptom available: sign-in works on your
      device and fails for every tester.
      *Note:* this is a **server-side** change — no rebuild or re-upload needed.
      An app already installed from Play starts working within a few minutes.

- [ ] **Supabase → Auth → Providers → Google → Authorized Client IDs** — add
      *both* Android client IDs, comma-separated. Leave Client ID/Secret alone;
      those are the Web client and Supabase still needs them.
      *Why (corrected 2026-08-04):* an earlier version of this note claimed the
      ID token's `aud` is the **Android** client ID. That is wrong for the path
      we actually ship. `Utils.java:66` calls
      `googleSignInOptionsBuilder.requestIdToken(webClientId)`, and
      `requestIdToken` sets the audience to the client ID it is given — so `aud`
      is the **Web** client ID, which is exactly what Supabase's provider is
      already configured with. This step is therefore a cheap safety net (and
      useful ahead of an iOS build), **not** a fix for a failing Android
      sign-in. If sign-in fails at the *Supabase* step rather than on-device,
      revisit it; if the error is `DEVELOPER_ERROR`, this is not the cause.
- [ ] If distributing via **Internal app sharing**, that channel re-signs with a
      *third* certificate again — it needs its own OAuth client too.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Downloading ... gradle-X-bin.zip failed: timeout (10000ms)` | Wrapper's 10s cap vs. redirect to GitHub CDN | `./scripts/seed-gradle-dist.sh` |
| Build status `canceled`, artifact URL `null` | Cloud queue, or cancelled in dashboard | Build locally instead |
| App installs but has no backend / no analytics | Env vars missing from the EAS environment | `eas env:list --environment <env>` |
| Google Sign-In fails only for testers | Play re-signs with its own key | Register the app-signing SHA-1 |
| Google Sign-In fails for everyone | Android client IDs not in Supabase allowlist | See §9 |
| Gradle OOM / `Killed` | WSL memory | `.wslconfig` sets 10GB; check `free -h` |
| `.aab` won't install on phone | Working as designed | Build `--profile preview` for an APK |
| Play: *"completely shadowed by one or more APKs with higher version codes"* | The release draft still contains the **previous** release's bundle alongside the new one — Play pre-fills new drafts with what's already on that track | On the Create release page, scroll to **App bundles** and remove the older version code. Only the newest should remain |
| Play: *"no deobfuscation file associated with this App Bundle"* | Harmless — `minifyEnabled` is false, so nothing is obfuscated and there's no mapping file to upload | Ignore. Enabling R8 would shrink the ~75 MB, but needs ProGuard keep-rules for the RN bridge — don't attempt it just before a release |
| Play: *"Version code N has already been used. Try another version code."* | Play burns a version code **permanently** the moment a bundle carrying it is uploaded — discarding the draft does **not** release it | Don't rebuild first: the bundle is already in your library, so **Upload app bundles → "Add from library"** and pick that version code. Only rebuild (which auto-bumps) if you actually need changed code |

---

## Reference

| | |
|---|---|
| EAS account | `me-shivamo` |
| EAS project ID | `7f4eb847-e9f4-43b5-a83f-7a91b92dae08` |
| Package | `com.steadyapp.android` |
| Keystore | `Build Credentials 7E-NgVcyxT (default)`, remote on EAS |
| Signing SHA-1 | `EB:23:27:83:58:49:41:0D:5B:4E:71:46:6A:5E:B8:B7:E8:CC:A7:C7` |
| Expo SDK / RN | 54.0.0 / 0.81.5 |
| Gradle | 8.14.3 |
| Typical AAB size | ~75 MB |
| Typical build time | ~31 min local |

Related: `DEVLOG.md` (the story of the 2026-08-03 session), `LEARNING.md`
(the concepts), `WHATTODO.md` (open pre-upload items).
