import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { hc } from 'hono/client';
import type { AppType } from '../../../backend/src/index';

/**
 * Resolve backend URL for mobile environments.
 * 
 * 1. localhost only works on iOS simulators.
 * 2. 10.0.2.2 is required for Android emulators to reach the host machine.
 * 3. A local network IP (e.g., 192.168.x.x) is required for physical devices.
 */
const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  
  // Extract host IP dynamically in development to support physical devices
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp) {
      return `http://${hostIp}:8787`;
    }
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8787';
  }
  
  // Default to localhost for iOS/Web
  return 'http://localhost:8787';
};

export const API_URL = getBaseUrl();
export const api = hc<AppType>(API_URL);
export default api;

