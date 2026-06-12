import * as Haptics from 'expo-haptics';

/**
 * Safely trigger a haptic feedback event, catching any errors on unsupported platforms 
 * (like web, emulators, or older simulators).
 */
export async function triggerHaptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  try {
    await Haptics.impactAsync(style);
  } catch (error) {
    console.debug('Haptic feedback not supported in this environment:', error);
  }
}

/**
 * Safely trigger a haptic notification event, catching any errors on unsupported platforms.
 */
export async function triggerNotificationHaptic(type: Haptics.NotificationFeedbackType) {
  try {
    await Haptics.notificationAsync(type);
  } catch (error) {
    console.debug('Haptic notification feedback not supported in this environment:', error);
  }
}

