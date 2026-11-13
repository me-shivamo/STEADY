// Render-order test for the splash handover in App.tsx.
//
// The native splash is blank #FAFAFA and AnimatedSplash's first frame is the
// same blank #FAFAFA (see AnimatedSplash.test.tsx / splashConfig.test.ts). That
// only stays invisible if the native splash is lifted AFTER AnimatedSplash is
// in the tree — hide it any earlier and whatever is behind (the window
// background, a half-built navigator) shows for a frame.
//
// So the order under test is:
//   1. preventAutoHideAsync() at module load (before any render),
//   2. nothing rendered and the native splash kept up while fonts load,
//   3. hideAsync() exactly once, only after AnimatedSplash has been committed.
//
// RNTL calls are awaited for the reason given in SettingsScreen.test.tsx.

import React from 'react';
import { render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import App from '../../App';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

let mockFontsLoaded = false;
jest.mock('@expo-google-fonts/tiktok-sans', () => ({
  useFonts: () => [mockFontsLoaded],
  TikTokSans_400Regular: 1,
  TikTokSans_500Medium: 1,
  TikTokSans_600SemiBold: 1,
  TikTokSans_700Bold: 1,
}));
jest.mock('@expo-google-fonts/caveat', () => ({
  Caveat_500Medium: 1,
  Caveat_600SemiBold: 1,
  Caveat_700Bold: 1,
}));

// Everything else App mounts is irrelevant to the splash order.
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// Like the real provider on its first render (insets still null): it renders
// NO children. AnimatedSplash must therefore live outside it, or the splash
// would miss the first frame on a device (review of the single-splash fix).
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: () => null,
  initialWindowMetrics: null,
}));
jest.mock('../../src/navigation/RootNavigator', () => () => null);
jest.mock('../../src/components/common/ToastHost', () => () => null);
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({ session: null }),
}));
jest.mock('../../src/lib/pushNotifications', () => ({
  registerForPushNotificationsAsync: jest.fn(() => Promise.resolve()),
  attachNotificationTapListener: jest.fn(() => () => {}),
}));
jest.mock('../../src/components/common/BowlIllustration', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactLib.createElement(View, { testID: 'bowl' }),
    DESIGN_WIDTH: 390,
    DESIGN_CANVAS_HEIGHT: 480,
  };
});

const preventAutoHide = SplashScreen.preventAutoHideAsync as jest.Mock;
const hide = SplashScreen.hideAsync as jest.Mock;

describe('App splash handover order', () => {
  it('holds the native splash until AnimatedSplash is on screen, then hides it once', async () => {
    // 1. Called at import time, before any render.
    expect(preventAutoHide).toHaveBeenCalledTimes(1);
    expect(hide).not.toHaveBeenCalled();

    // 2. Fonts still loading: App renders nothing, native splash stays up.
    mockFontsLoaded = false;
    const screen = await render(<App />);
    expect(screen.queryByTestId('animated-splash')).toBeNull();
    expect(hide).not.toHaveBeenCalled();

    // 3. Fonts ready: AnimatedSplash must already be committed when hideAsync runs.
    let splashOnScreenAtHide: boolean | null = null;
    hide.mockImplementation(() => {
      splashOnScreenAtHide = screen.queryByTestId('animated-splash') !== null;
      return Promise.resolve();
    });
    mockFontsLoaded = true;
    await screen.rerender(<App />);

    expect(hide).toHaveBeenCalledTimes(1);
    expect(splashOnScreenAtHide).toBe(true);
    expect(preventAutoHide.mock.invocationCallOrder[0]).toBeLessThan(
      hide.mock.invocationCallOrder[0],
    );

    // A later re-render (e.g. session change) must not hide it again.
    await screen.rerender(<App />);
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
