// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-notifications -> @ide/backoff -> the browser "assert" polyfill package,
// whose build output does `require('./internal/errors')` with no extension.
// Metro won't auto-append .js to that relative require, so it fails to find
// a file that genuinely exists on disk. Special-case just this one module id
// so the resolver appends the extension itself; everything else still goes
// through Metro's normal resolution.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './internal/errors' &&
    context.originModulePath.endsWith(path.join('assert', 'build', 'assert.js'))
  ) {
    return context.resolveRequest(context, './internal/errors.js', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
