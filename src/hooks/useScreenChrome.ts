import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

/**
 * Syncs the OS status bar (top) and Android system nav bar (bottom) to a
 * screen's own background color. StatusBar/NavigationBar are global OS
 * overlays, not part of the component tree — whichever screen last called
 * them "wins" until the next screen calls them again. Call this once per
 * screen (top of the component) so there's no cross-screen bleed.
 *
 * Android's nav bar background itself is not settable here: edge-to-edge
 * (default since Expo SDK 54) forces it transparent at the OS level, so
 * NavigationBar.setBackgroundColorAsync is a no-op that only warns — only
 * button/icon style is still ours to control.
 */
export function useScreenChrome(backgroundColor: string, iconStyle: 'dark' | 'light' = 'dark') {
  useEffect(() => {
    StatusBar.setBarStyle(iconStyle === 'dark' ? 'dark-content' : 'light-content');
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(backgroundColor);
      NavigationBar.setButtonStyleAsync(iconStyle === 'dark' ? 'dark' : 'light');
    }
  }, [backgroundColor, iconStyle]);
}
