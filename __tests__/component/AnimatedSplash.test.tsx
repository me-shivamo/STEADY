// Component tests for src/components/common/AnimatedSplash.tsx.
//
// The native splash is blank #FAFAFA (see __tests__/unit/splashConfig.test.ts).
// For the handover to be invisible, AnimatedSplash's FIRST frame must be that
// same blank screen: background = the app.json splash colour, wordmark and bowl
// at opacity 0. If the content were visible on frame one, the user would see
// it "pop" in over the native splash — a second splash, which is the bug in
// TASKS.md item 2.
//
// RNTL calls are awaited for the reason given in SettingsScreen.test.tsx.

import React from 'react';
import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import AnimatedSplash from '../../src/components/common/AnimatedSplash';

// The illustration's internals (SVG arrows, bundled photo) are not under test
// here — only that it lives inside the faded content layer.
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

const appJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf8'));
const nativeSplashBackground: string = appJson.expo.plugins.find(
  (p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen',
)[1].backgroundColor;

function flatStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as any) ?? {};
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AnimatedSplash first frame matches the blank native splash', () => {
  it('paints the native splash colour with all content invisible', async () => {
    const screen = await render(<AnimatedSplash isAppReady={false} onFinish={jest.fn()} />);

    const container = screen.getByTestId('animated-splash');
    expect(String(flatStyle(container).backgroundColor).toUpperCase()).toBe(
      nativeSplashBackground.toUpperCase(),
    );
    expect(flatStyle(container).opacity).toBe(1);

    const content = screen.getByTestId('animated-splash-content');
    expect(flatStyle(content).opacity).toBe(0);
    // Wordmark, tagline and bowl all sit inside the faded layer, so none of
    // them can show on frame one.
    expect(content).toContainElement(screen.getByText('STEADY'));
    expect(content).toContainElement(screen.getByText('know every bite'));
    expect(content).toContainElement(screen.getByTestId('bowl'));
  });
});

describe('AnimatedSplash exit timing', () => {
  it('stays up for the minimum time even when the app is ready immediately', async () => {
    const onFinish = jest.fn();
    await render(<AnimatedSplash isAppReady onFinish={onFinish} />);

    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    expect(onFinish).not.toHaveBeenCalled();

    // Two phases: the minimum-time timer fires and its state update starts the
    // fade when this act() settles; the next one lets the fade run out.
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(onFinish).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('never leaves while the app is not ready, then leaves once it is', async () => {
    const onFinish = jest.fn();
    const screen = await render(<AnimatedSplash isAppReady={false} onFinish={onFinish} />);

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(onFinish).not.toHaveBeenCalled();

    await screen.rerender(<AnimatedSplash isAppReady onFinish={onFinish} />);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
