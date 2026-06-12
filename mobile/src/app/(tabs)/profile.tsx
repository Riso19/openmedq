import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  Switch, 
  ActivityIndicator 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useUser } from '@clerk/expo';
import { 
  User, 
  Settings, 
  Trash2, 
  Database
} from 'lucide-react-native';
import { triggerHaptic } from '@/lib/haptics';

import { useTheme } from '@/hooks/use-theme';
import { getDB, initDatabase } from '@/lib/db';
import { SyncManager } from '@/lib/SyncManager';
import { optimizeFSRSParameters, rescheduleAllCards } from '@/lib/fsrs';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  // Clerk Auth Hooks
  const { isSignedIn, signOut, getToken } = useAuth();
  const { user } = useUser();

  // FSRS states
  const [retention, setRetention] = useState('0.9');
  const [maxInterval, setMaxInterval] = useState('36500');
  const [fuzz, setFuzz] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);

  // Load FSRS configuration
  useEffect(() => {
    async function loadConfig() {
      const r = await AsyncStorage.getItem('openmedq_fsrs_retention');
      if (r) setRetention(r);

      const mi = await AsyncStorage.getItem('openmedq_fsrs_max_interval');
      if (mi) setMaxInterval(mi);

      const f = await AsyncStorage.getItem('openmedq_fsrs_fuzz');
      if (f) setFuzz(f !== 'false');
    }
    loadConfig();
  }, []);

  useEffect(() => {
    if (isSignedIn && user) {
      const runSync = async () => {
        try {
          const profile = {
            displayName: user.fullName || user.username || undefined,
            email: user.primaryEmailAddress?.emailAddress || undefined,
          };
          await SyncManager.syncWithD1(
            getToken,
            () => {},
            profile
          );
        } catch (e) {
          console.warn('Auto-sync on login failed:', e);
        }
      };
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user]);

  // Log out / Sign Out
  const handleDisconnect = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your progress will remain saved on this device.',
      [
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Save FSRS parameters
  const handleSaveFSRSSettings = async () => {
    const rVal = parseFloat(retention);
    const mVal = parseInt(maxInterval, 10);

    if (isNaN(rVal) || rVal < 0.5 || rVal > 0.99) {
      Alert.alert('Invalid Parameter', 'Target retention must be a number between 0.50 and 0.99.');
      return;
    }

    if (isNaN(mVal) || mVal < 1 || mVal > 100000) {
      Alert.alert('Invalid Parameter', 'Max interval must be a positive number.');
      return;
    }

    await AsyncStorage.setItem('openmedq_fsrs_retention', String(rVal));
    await AsyncStorage.setItem('openmedq_fsrs_max_interval', String(mVal));
    await AsyncStorage.setItem('openmedq_fsrs_fuzz', String(fuzz));

    // Propagate settings to SQLite progress table (questionId: -999) for sync
    await SyncManager.saveSettingsToSQLite();

    Alert.alert('Settings Saved', 'Study gap settings updated. They will sync on your next connection.');
  };

  // Handle FSRS local weights calibration
  const handleCalibrateFSRS = async () => {
    try {
      setOptimizing(true);
      setOptimizationProgress(0);
      
      const newWeights = await optimizeFSRSParameters((progress, loss) => {
        setOptimizationProgress(progress);
      });

      if (!newWeights) {
        Alert.alert('Calibration Skipped', 'Failed to generate optimized parameters.');
        return;
      }

      await AsyncStorage.setItem('openmedq_fsrs_weights', JSON.stringify(newWeights));

      const rVal = parseFloat(retention);
      const mVal = parseInt(maxInterval, 10);
      await rescheduleAllCards(rVal, mVal);
      await SyncManager.saveSettingsToSQLite();

      if (isSignedIn) {
        try {
          await SyncManager.syncWithD1(
            getToken,
            () => {}
          );
        } catch (e) {
          console.warn('Auto-sync on calibration failed:', e);
        }
      }

      Alert.alert(
        'Calibration Complete',
        'Revision scheduler successfully calibrated based on your review history! All cards have been rescheduled.'
      );
    } catch (err: any) {
      console.warn('Calibration failed:');
      Alert.alert('Calibration Error', 'An error occurred during calibration. Please try again.');
    } finally {
      setOptimizing(false);
    }
  };

  // Clear local SQLite database
  const handleClearDatabase = async () => {
    Alert.alert(
      'Reset Local Data',
      'This will delete all downloaded question packs and local practice history. This action CANNOT be undone.',
      [
        {
          text: 'Reset Database',
          style: 'destructive',
          onPress: async () => {
            try {
              const sqlite = await getDB();
              await sqlite.runAsync('DROP TABLE IF EXISTS questions');
              await sqlite.runAsync('DROP TABLE IF EXISTS progress');
              await sqlite.runAsync('DROP TABLE IF EXISTS reviewLogs');
              await sqlite.runAsync('DROP TABLE IF EXISTS userStats');
              
              await initDatabase();
              
              Alert.alert('Database Reset', 'All local data was successfully wiped and tables recreated.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error resetting database');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };
  // Clear local SQLite questions table (cache)
  const handleClearQuestionCache = async () => {
    Alert.alert(
      'Clear Question Cache',
      'This will delete all locally cached questions. Your learning progress, bookmarks, and stats will NOT be affected. Questions will download fresh from CDN when you next practice.',
      [
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              const sqlite = await getDB();
              await sqlite.runAsync('DROP TABLE IF EXISTS questions');
              await initDatabase();
              
              Alert.alert('Cache Cleared', 'All locally cached questions have been deleted successfully.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error clearing question cache');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 32) }]}
    >
      <Text style={[styles.title, { color: theme.text }]}>Settings & Profile</Text>

      {/* User identity & sign-in/up card */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.cardHeader}>
          <User size={20} color={theme.pink} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Identity</Text>
        </View>

        {isSignedIn && user ? (
          <View style={styles.profileBox}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {user.fullName || user.username || 'Aspirant'}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {user.primaryEmailAddress?.emailAddress}
            </Text>
            <Pressable 
              onPress={handleDisconnect} 
              style={({ pressed }) => [
                styles.disconnectButton, 
                { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Text style={[styles.disconnectButtonText, { color: theme.error }]}>Sign Out</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.guestBox}>
            <Text style={[styles.guestText, { color: theme.textSecondary, marginBottom: 16 }]}>
              You are currently playing in Guest Mode. Sign in to sync your progress with our backup servers and join the leaderboards.
            </Text>

            <View style={styles.authButtonsContainer}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  router.push('/login' as any);
                }}
                style={({ pressed }) => [
                  styles.authButton,
                  { backgroundColor: theme.teal, opacity: pressed ? 0.85 : 1 }
                ]}
              >
                <Text style={[styles.authButtonText, { color: '#ffffff' }]}>Sign In</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  router.push('/signup' as any);
                }}
                style={({ pressed }) => [
                  styles.authButton,
                  { backgroundColor: theme.pink, opacity: pressed ? 0.85 : 1 }
                ]}
              >
                <Text style={[styles.authButtonText, { color: '#ffffff' }]}>Create Account</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* FSRS spaced repetition parameters */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.cardHeader}>
          <Settings size={20} color={theme.pink} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Revision Schedule Settings</Text>
        </View>

        {/* Target retention */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Target Retention</Text>
            <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
              Target recall probability (0.75 - 0.95 recommended).
            </Text>
          </View>
          <TextInput
            value={retention}
            onChangeText={setRetention}
            keyboardType="numeric"
            style={[
              styles.numericInput, 
              { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
            ]}
          />
        </View>

        {/* Max interval */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Maximum Interval (days)</Text>
            <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
              Maximum spacing interval for review cards.
            </Text>
          </View>
          <TextInput
            value={maxInterval}
            onChangeText={setMaxInterval}
            keyboardType="numeric"
            style={[
              styles.numericInput, 
              { backgroundColor: theme.background, borderColor: theme.hairline, color: theme.text }
            ]}
          />
        </View>

        {/* Fuzz */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Enable Fuzzing</Text>
            <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>
              Staggers intervals slightly to prevent review card clustering.
            </Text>
          </View>
          <Switch
            value={fuzz}
            onValueChange={setFuzz}
            trackColor={{ false: theme.background, true: theme.pink }}
            thumbColor={fuzz ? '#ffffff' : theme.textSecondary}
          />
        </View>

        <Pressable 
          onPress={handleSaveFSRSSettings}
          style={({ pressed }) => [
            styles.primaryButton, 
            { backgroundColor: theme.teal, opacity: pressed ? 0.8 : 1 }
          ]}
        >
          <Text style={styles.primaryButtonText}>Save Schedule Settings</Text>
        </Pressable>

        <View style={{ height: 8 }} />

        <Pressable 
          onPress={handleCalibrateFSRS}
          disabled={optimizing}
          style={({ pressed }) => [
            styles.primaryButton, 
            { backgroundColor: theme.pink, opacity: pressed || optimizing ? 0.8 : 1 }
          ]}
        >
          {optimizing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Tune Revision Scheduler</Text>
          )}
        </Pressable>
        {optimizing && (
          <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginTop: 4 }}>
            Tuning gaps: {Math.round(optimizationProgress * 100)}%
          </Text>
        )}
      </View>

      {/* Database Utilities */}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <View style={styles.cardHeader}>
          <Database size={20} color={theme.pink} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Storage Utilities</Text>
        </View>

        <Text style={[styles.instructionText, { color: theme.textSecondary }]}>
          If question text or images are loading incorrectly, clear your local question cache. Questions will download fresh from CDN when you next practice.
        </Text>

        <Pressable 
          onPress={handleClearQuestionCache}
          style={({ pressed }) => [
            styles.primaryButton, 
            { backgroundColor: theme.text, opacity: pressed ? 0.8 : 1 }
          ]}
        >
          <Text style={[styles.primaryButtonText, { color: theme.background }]}>Clear Question Cache</Text>
        </Pressable>

        <Text style={[styles.instructionText, { color: theme.textSecondary, marginTop: 8 }]}>
          To perform a complete wipe of all local progress, stats, and downloaded question packs:
        </Text>

        <Pressable 
          onPress={handleClearDatabase}
          style={({ pressed }) => [
            styles.dangerButton, 
            { borderColor: theme.error, opacity: pressed ? 0.8 : 1 }
          ]}
        >
          <Trash2 size={16} color={theme.error} />
          <Text style={[styles.dangerButtonText, { color: theme.error }]}>Reset Local Database</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    gap: 16,
  },
  title: {
    fontFamily: 'Plain Black, Inter, sans-serif',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -0.8,
    marginVertical: 12,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  profileBox: {
    gap: 8,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 13,
  },
  disconnectButton: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  guestBox: {
    paddingVertical: 4,
  },
  guestText: {
    fontSize: 13,
    lineHeight: 18,
  },
  instructionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  authButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  authButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  authButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  settingDesc: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 220,
  },
  numericInput: {
    borderWidth: 1,
    borderRadius: 8,
    width: 65,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dangerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
});
