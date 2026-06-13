import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Animated } from 'react-native';
import * as Updates from 'expo-updates';
import { ArrowUpCircle, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export function UpdateNotifier() {
  const theme = useTheme();
  const { isUpdatePending } = Updates.useUpdates();
  
  // Slide animation value
  const [slideAnim] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isUpdatePending) {
      Promise.resolve().then(() => {
        setVisible(true);
      });
      // Slide up
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      // Slide down
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        Promise.resolve().then(() => {
          setVisible(false);
        });
      });
    }
  }, [isUpdatePending, slideAnim]);

  const handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch (err) {
      console.warn('Failed to reload app for update:', err);
    }
  };

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible) return null;

  // Interpolate slideAnim from screen height offset to 0
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0],
  });

  return (
    <Animated.View style={[
      styles.container,
      {
        backgroundColor: theme.backgroundElement,
        borderColor: theme.hairline,
        transform: [{ translateY }],
      }
    ]}>
      <View style={styles.content}>
        <ArrowUpCircle size={20} color={theme.pink} style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: theme.text }]}>Update Ready</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            A new version is downloaded and ready to apply.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.text,
              opacity: pressed ? 0.85 : 1,
            }
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>Restart</Text>
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={({ pressed }) => [
            styles.dismissButton,
            {
              borderColor: theme.hairline,
              opacity: pressed ? 0.7 : 1,
            }
          ]}
        >
          <X size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 12,
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
