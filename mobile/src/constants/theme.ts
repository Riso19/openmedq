/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';
import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme } from 'expo-router';

export const Colors = {
  light: {
    text: '#0a0a0a',
    background: '#fffaf0', // Warm cream canvas
    backgroundElement: '#f5f0e0', // surface-card
    backgroundSelected: '#ebe6d6', // surface-strong
    textSecondary: '#6a6a6a', // muted
    primary: '#0a0a0a',
    pink: '#ff4d8b',
    teal: '#1a3a3a',
    lavender: '#b8a4ed',
    peach: '#ffb084',
    ochre: '#e8b94a',
    mint: '#a4d4c5',
    coral: '#ff6b5a',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    hairline: '#e5e5e5',
  },
  dark: {
    text: '#ffffff',
    background: '#000000', // Pure black for AMOLED
    backgroundElement: '#121212', // Very dark grey surface
    backgroundSelected: '#1e1e1e', // Slightly lighter dark surface
    textSecondary: '#a0a0a0',
    primary: '#ffffff',
    pink: '#ff4d8b',
    teal: '#a4d4c5', // lighter teal for dark contrast
    lavender: '#b8a4ed',
    peach: '#ffb084',
    ochre: '#e8b94a',
    mint: '#a4d4c5',
    coral: '#ff6b5a',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    hairline: '#2d2d2d', // Hairline borders to be visible but subtle in pure black background
  },
};
export const ClayLightTheme = {
  ...NavDefaultTheme,
  colors: {
    ...NavDefaultTheme.colors,
    primary: '#0a0a0a',
    background: '#fffaf0',
    card: '#fffaf0',
    text: '#0a0a0a',
    border: '#e5e5e5',
    notification: '#ff4d8b',
  },
};

export const AmoledDarkTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    primary: '#ff4d8b',
    background: '#000000',
    card: '#000000',
    text: '#ffffff',
    border: '#2d2d2d',
    notification: '#ff4d8b',
  },
};

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
