import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Animated, Appearance, useColorScheme } from 'react-native';
import { Sun, Moon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/use-theme';
import { triggerHaptic } from '@/lib/haptics';

export function ThemeToggle() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Animation value: 0 for light, 1 for dark
  const [animation] = useState(() => new Animated.Value(isDark ? 1 : 0));

  useEffect(() => {
    // Run animation when system/manual scheme changes
    Animated.timing(animation, {
      toValue: isDark ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isDark, animation]);

  const toggleTheme = async () => {
    try {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
      const nextScheme = isDark ? 'light' : 'dark';
      
      // Set scheme globally (overrides system)
      Appearance.setColorScheme(nextScheme);
      
      // Persist to AsyncStorage for app launches
      await AsyncStorage.setItem('openmedq_theme', nextScheme);
    } catch (err) {
      console.warn('Failed to save theme setting:', err);
    }
  };

  // Interpolate rotation: 0 => 0deg, 1 => 180deg
  const rotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Interpolate sun opacity (fades out in dark mode)
  const sunOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });

  // Interpolate moon opacity (fades in in dark mode)
  const moonOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // Interpolate scale for pop effect
  const scale = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.85, 1],
  });

  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.button,
        { 
          backgroundColor: theme.backgroundElement,
          borderColor: theme.hairline,
          opacity: pressed ? 0.8 : 1,
        }
      ]}
    >
      <Animated.View style={[
        styles.iconContainer,
        {
          transform: [{ rotate: rotation }, { scale: scale }],
        }
      ]}>
        {/* Sun Icon */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconAlign, { opacity: sunOpacity }]}>
          <Sun size={18} color={theme.pink} />
        </Animated.View>

        {/* Moon Icon */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.iconAlign, { opacity: moonOpacity }]}>
          <Moon size={18} color="#b8a4ed" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 20,
    height: 20,
    position: 'relative',
  },
  iconAlign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
