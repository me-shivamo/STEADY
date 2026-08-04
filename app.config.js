const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

/**
 * Dynamic Expo config.
 *
 * app.json remains the single source of truth for everything static; this file
 * exists only to attach the Android FCM credential, which cannot live in
 * app.json for two reasons:
 *
 *   1. google-services.json contains project identifiers we keep out of git, so
 *      it is supplied per-environment (locally as a file, on EAS as a file-type
 *      environment variable). app.json is static JSON and cannot read env vars.
 *
 *   2. Naming a file that does not exist makes `expo prebuild` fail outright.
 *      Since the credential is added by a human step (creating the Firebase
 *      project), the reference has to be conditional or every build breaks until
 *      that step is done.
 *
 * WHY THE APP NEEDS THIS AT ALL
 * -----------------------------
 * On Android an Expo push token is derived from an FCM device token, and FCM
 * needs a configured default FirebaseApp — which is exactly what
 * google-services.json provides at build time. Without it,
 * getExpoPushTokenAsync() throws, no token is ever registered for the installed
 * app, and the backend keeps delivering reminders to whatever stale token is
 * still on file (in our case one left over from Expo Go). Expo Go itself ships
 * its own Firebase config, which is why notifications appeared to "work" during
 * development and silently stopped working in the Play Store build.
 *
 * TO ACTIVATE (both steps are required — receiver side and sender side):
 *   1. Firebase console → create/choose a project → add an Android app with
 *      package name exactly `com.steadyapp.android` → download
 *      google-services.json into this directory (it is gitignored).
 *      For EAS builds also run:
 *        eas env:create --name GOOGLE_SERVICES_JSON --type file \
 *          --environment production,preview --value ./google-services.json
 *   2. `eas credentials -p android` → upload the FCM V1 service account key.
 *      Step 1 alone lets the device MINT a token; step 2 is what lets Expo's
 *      push service DELIVER to it. Doing only one leaves push just as dead,
 *      with a different error.
 */
module.exports = () => {
  const config = { ...appJson.expo };

  // EAS exposes file-type env vars as a path to the materialised file.
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = fromEnv || (fs.existsSync(local) ? './google-services.json' : null);

  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  } else {
    // Loud, because a build without it produces an app that cannot receive a
    // single push notification — and does so completely silently at runtime.
    console.warn(
      '\n[STEADY] google-services.json not found — this build will NOT be able to\n' +
        '         receive push notifications. See app.config.js for setup steps.\n',
    );
  }

  return config;
};
