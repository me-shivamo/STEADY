I'm currently testing the issues with the app, and this is going to be the final testing, after this I'll upload the app. 

                
## Pre-upload blockers — Play Console (DONE 2026-08-03)

- [x] **Update Privacy policy URL** → `https://steady.chat/privacy.html`
- [x] **Update Data deletion URL** → `https://steady.chat/delete-account.html`

## Also pending (Google Sign-In branding work)

- [x] Google Cloud → Branding: app name STEADY, authorized domain `steady.chat`,
      and the three steady.chat legal links.
- [x] `eas credentials -p android` → SHA-1 → create Android OAuth client
      `STEADY Android (EAS dev)`. Signs the sideloaded dev/preview APK.
- [ ] **← THIS IS THE GOOGLE SIGN-IN BUG (2026-08-04).** Was marked done here,
      but BUILD.md §9 records it as NOT done, and the on-device
      `DEVELOPER_ERROR` proves BUILD.md right. Play Console → Test and release →
      Setup → App integrity → App signing → **App signing key certificate**
      SHA-1 → create a SECOND Android OAuth client `STEADY Android (Play)`.
      Signs anything installed from Play, including the internal test track.
      Both are needed; they are not alternatives. (NOT the "Upload key" or
      "Internal app sharing" certs — those are different certificates.)
      Note: this is a server-side change. No rebuild needed; the installed app
      starts working a few minutes after the client is created.
- [ ] Sanity check: Play's *Upload key certificate* SHA-1 must equal what
      `eas credentials` prints. If not, the next AAB upload gets rejected.
- [x] Paste Web client ID into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`.
- [ ] Add BOTH Android client IDs to Supabase → Auth → Providers → Google →
      Authorized Client IDs (comma-separated). Leave Client ID/Secret alone —
      those are the Web client and Supabase still needs them.
- [ ] `eas env:list` — confirm EXPO_PUBLIC_* vars actually reach EAS builds.
      `.env` is gitignored and EAS excludes gitignored files, so if this is
      empty the build ships with no Supabase URL and no Google client ID.
- [ ] `eas build --profile development --platform android`, then verify the
      native picker says STEADY.


