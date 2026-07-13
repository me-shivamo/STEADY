const { withAppBuildGradle } = require('@expo/config-plugins');

// SDK 57's generated android/app/build.gradle tries to resolve a package called
// "hermes-compiler" to locate the hermesc binary. That package doesn't exist for
// react-native@0.81.x — @expo/metro-config's own exportHermes.js treats the same
// lookup as forward-looking (it's meant for RN 0.83+) and wraps it in a try/catch
// with a fallback to react-native's actual bundled hermesc at sdks/hermesc/. The
// Gradle template copies the lookup without the fallback, so require.resolve()
// throws, Gradle's `.execute().text` comes back empty, and `new File(...).getParentFile()`
// on that blank string is null — crashing every build at project-config time with
// "Cannot invoke method getAbsolutePath() on null object".
//
// This plugin rewrites the generated hermesCommand line to resolve hermesc's real,
// always-present location directly, skipping the broken hermes-compiler lookup.
const BROKEN_HERMES_COMMAND_REGEX =
  /hermesCommand = new File\(\["node", "--print", "require\.resolve\('hermes-compiler\/package\.json'[^\n]*\n/;

const FIXED_HERMES_COMMAND =
  'hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n';

function withHermesCommandFix(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }
    if (!BROKEN_HERMES_COMMAND_REGEX.test(config.modResults.contents)) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      BROKEN_HERMES_COMMAND_REGEX,
      FIXED_HERMES_COMMAND
    );
    return config;
  });
}

module.exports = withHermesCommandFix;
