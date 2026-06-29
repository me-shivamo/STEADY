import 'react-native-gesture-handler';
import React from 'react';
import { PostHogProvider } from 'posthog-react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { posthog } from './src/utils/posthog';

export default function App() {
  return (
    <PostHogProvider client={posthog} autocapture={{ captureScreens: false }}>
      <RootNavigator />
    </PostHogProvider>
  );
}
