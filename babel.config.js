module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated (which victory-native depends on for
    // animated charts). Reanimated 4 moved its worklet engine into the separate
    // `react-native-worklets` package, so the plugin lives there. It MUST be the
    // last plugin in the list. Our DrumPicker no longer uses Reanimated, but the
    // charting library does, so this stays.
    plugins: ['react-native-worklets/plugin'],
  };
};
