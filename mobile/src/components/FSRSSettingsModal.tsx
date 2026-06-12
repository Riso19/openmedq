import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  ActivityIndicator, 
  Switch,
  ScrollView,
  Alert
} from 'react-native';
import { X, Settings, HelpCircle, Save, Award } from 'lucide-react-native';
import { getFSRSSettings, saveFSRSSettings, rescheduleAllCards, optimizeFSRSParameters } from '../lib/fsrs';
import { getDB } from '../lib/db';
import { SyncManager } from '../lib/SyncManager';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

interface FSRSSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function FSRSSettingsModal({ isOpen, onClose, onSave }: FSRSSettingsModalProps) {
  const theme = useTheme();
  
  const [retention, setRetention] = useState<number>(0.9);
  const [maxInterval, setMaxInterval] = useState<number>(36500);
  const [fuzz, setFuzz] = useState<boolean>(true);
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // Parameter calibration states
  const [logsCount, setLogsCount] = useState<number>(0);
  const [optimizeStatus, setOptimizeStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [optimizerProgress, setOptimizerProgress] = useState<string>('');
  const [optimizeErrorMsg, setOptimizeErrorMsg] = useState<string>('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      async function loadSettings() {
        const current = await getFSRSSettings();
        setRetention(current.request_retention);
        setMaxInterval(current.maximum_interval);
        setFuzz(current.enable_fuzz);

        // Reset optimizer status and query reviewLogs count from SQLite
        setOptimizeStatus('idle');
        setOptimizerProgress('');
        setRescheduleError(null);
        
        try {
          const sqlite = await getDB();
          const row = await sqlite.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM reviewLogs');
          setLogsCount(row?.count || 0);
        } catch (err) {
          console.error("Failed to query log count.");
        }
      }
      loadSettings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsRescheduling(true);
    setRescheduleError(null);
    try {
      await saveFSRSSettings({
        request_retention: retention,
        maximum_interval: maxInterval,
        enable_fuzz: fuzz,
      });
      await SyncManager.saveSettingsToSQLite();
      await rescheduleAllCards(retention, maxInterval);
      if (onSave) onSave();
      onClose();
    } catch (err: any) {
      console.error("Rescheduling failed.");
      setRescheduleError("Failed to reschedule cards. Please try again.");
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizeStatus('running');
    setOptimizerProgress('Gathering logs...');
    try {
      const optimizedW = await optimizeFSRSParameters((progress, loss) => {
        setOptimizerProgress(`Tuning weights... ${Math.round(progress * 100)}% (Loss: ${loss.toFixed(4)})`);
      });

      if (optimizedW) {
        // Apply optimized weights
        await saveFSRSSettings({
          request_retention: retention,
          maximum_interval: maxInterval,
          enable_fuzz: fuzz,
          w: optimizedW
        });

        // Sync settings to SQLite progress table
        await SyncManager.saveSettingsToSQLite();

        // Reschedule all card intervals based on new optimized weights
        await rescheduleAllCards(retention, maxInterval);

        setOptimizeStatus('success');
        
        const sqlite = await getDB();
        const row = await sqlite.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM reviewLogs');
        setLogsCount(row?.count || 0);

        if (onSave) onSave();
      }
    } catch (err: any) {
      console.error("Calibration failed.");
      setOptimizeStatus('error');
      setOptimizeErrorMsg('Calibration failed. Please try again.');
    }
  };

  const formatInterval = (days: number) => {
    if (days >= 36500) {
      return '100 years (No limit)';
    }
    if (days >= 365) {
      const yrs = Math.round((days / 365) * 10) / 10;
      return `${yrs} year${yrs !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  const adjustRetention = (amount: number) => {
    const newVal = Math.min(0.97, Math.max(0.70, Math.round((retention + amount) * 100) / 100));
    setRetention(newVal);
  };

  const adjustMaxInterval = (amount: number) => {
    const newVal = Math.min(36500, Math.max(30, maxInterval + amount));
    setMaxInterval(newVal);
  };

  const setMaxIntervalPreset = (val: number) => {
    setMaxInterval(val);
  };

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
          
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
            <View style={styles.headerTitleContainer}>
              <Settings size={18} color={theme.pink} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>Revision Schedule Settings</Text>
            </View>
            <Pressable 
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <X size={16} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Memory Target Rate */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Memory Target Rate</Text>
                <Text style={[styles.sectionValue, { color: theme.pink }]}>{Math.round(retention * 100)}%</Text>
              </View>
              
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={() => adjustRetention(-0.01)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>-1%</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustRetention(-0.05)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>-5%</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustRetention(0.05)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>+5%</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustRetention(0.01)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>+1%</Text>
                </Pressable>
              </View>

              <View style={styles.infoRow}>
                <HelpCircle size={12} color={theme.pink} style={{ marginTop: 2 }} />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                  A higher target (90-95%) helps you remember more, but requires you to revise more often. Default: 90%.
                </Text>
              </View>
            </View>

            {/* Maximum Revision Gap */}
            <View style={[styles.section, { borderTopWidth: 1, borderTopColor: theme.hairline, paddingTop: 16 }]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>Maximum Revision Gap</Text>
                <Text style={[styles.sectionValue, { color: theme.pink }]}>{formatInterval(maxInterval)}</Text>
              </View>

              <View style={styles.controlsRow}>
                <Pressable
                  onPress={() => adjustMaxInterval(-30)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>-30d</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustMaxInterval(-365)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>-1 yr</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustMaxInterval(365)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>+1 yr</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustMaxInterval(30)}
                  style={({ pressed }) => [styles.adjustBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.adjustBtnText, { color: theme.text }]}>+30d</Text>
                </Pressable>
              </View>

              <View style={styles.presetRow}>
                <Pressable
                  onPress={() => setMaxIntervalPreset(30)}
                  style={[styles.presetBtn, maxInterval === 30 && { backgroundColor: theme.text }, { borderColor: theme.hairline }]}
                >
                  <Text style={[styles.presetBtnText, { color: maxInterval === 30 ? theme.background : theme.textSecondary }]}>30d</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMaxIntervalPreset(90)}
                  style={[styles.presetBtn, maxInterval === 90 && { backgroundColor: theme.text }, { borderColor: theme.hairline }]}
                >
                  <Text style={[styles.presetBtnText, { color: maxInterval === 90 ? theme.background : theme.textSecondary }]}>90d</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMaxIntervalPreset(365)}
                  style={[styles.presetBtn, maxInterval === 365 && { backgroundColor: theme.text }, { borderColor: theme.hairline }]}
                >
                  <Text style={[styles.presetBtnText, { color: maxInterval === 365 ? theme.background : theme.textSecondary }]}>1 yr</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMaxIntervalPreset(36500)}
                  style={[styles.presetBtn, maxInterval >= 36500 && { backgroundColor: theme.text }, { borderColor: theme.hairline }]}
                >
                  <Text style={[styles.presetBtnText, { color: maxInterval >= 36500 ? theme.background : theme.textSecondary }]}>No limit</Text>
                </Pressable>
              </View>

              <View style={styles.infoRow}>
                <HelpCircle size={12} color={theme.pink} style={{ marginTop: 2 }} />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                  The longest time to wait before reviewing a question again.
                </Text>
              </View>
            </View>

            {/* Enable Fuzz (Spread out Reviews) */}
            <View style={[styles.switchSection, { borderTopWidth: 1, borderTopColor: theme.hairline, paddingTop: 16 }]}>
              <View style={styles.switchTextContainer}>
                <Text style={[styles.switchTitle, { color: theme.text }]}>Spread Out Reviews</Text>
                <Text style={[styles.switchDesc, { color: theme.textSecondary }]}>
                  Slightly varies when questions show up so you don{"'"}t get overwhelmed with too many questions on a single day.
                </Text>
              </View>
              <Switch
                value={fuzz}
                onValueChange={setFuzz}
                trackColor={{ false: theme.backgroundElement, true: theme.mint }}
                thumbColor={fuzz ? theme.text : '#f4f3f4'}
              />
            </View>

            {/* Personal Memory Calibration */}
            <View style={[styles.calibrationSection, { borderTopWidth: 1, borderTopColor: theme.hairline, paddingTop: 16 }]}>
              <View style={styles.calibrationHeader}>
                <Award size={16} color={theme.ochre} />
                <Text style={[styles.calibrationTitle, { color: theme.text }]}>Personal Study Gap Tuning</Text>
              </View>
              <Text style={[styles.calibrationDesc, { color: theme.textSecondary }]}>
                Tuning study gaps adapts the revision scheduling directly to your practice history to make reviews highly efficient.
              </Text>

              {optimizeStatus === 'running' && (
                <View style={[styles.statusBox, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <ActivityIndicator size="small" color={theme.pink} style={{ marginBottom: 4 }} />
                  <Text style={[styles.statusText, { color: theme.text }]}>{optimizerProgress}</Text>
                </View>
              )}

              {optimizeStatus === 'success' && (
                <View style={[styles.statusBox, { backgroundColor: theme.mint + '20', borderColor: theme.mint }]}>
                  <Text style={[styles.statusText, { color: theme.text }]}>
                    ✓ Revision scheduler successfully calibrated!
                  </Text>
                </View>
              )}

              {optimizeStatus === 'error' && (
                <View style={[styles.statusBox, { backgroundColor: theme.error + '15', borderColor: theme.error }]}>
                  <Text style={[styles.statusText, { color: theme.error }]}>⚠ {optimizeErrorMsg}</Text>
                </View>
              )}

              {optimizeStatus === 'idle' && (
                <View style={[styles.calibrationCtaRow, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
                  <View style={styles.logsMeta}>
                    <Text style={[styles.logsCountText, { color: theme.text }]}>History Logs: {logsCount} / 50</Text>
                    <Text style={[styles.logsCountDesc, { color: theme.textSecondary }]}>Requires 50 review logs minimum to tune.</Text>
                  </View>
                  <Pressable
                    disabled={logsCount < 50}
                    onPress={handleOptimize}
                    style={({ pressed }) => [
                      styles.calibrateBtn,
                      { backgroundColor: theme.pink, opacity: logsCount < 50 ? 0.5 : pressed ? 0.8 : 1 }
                    ]}
                  >
                    <Text style={styles.calibrateBtnText}>Calibrate</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {rescheduleError && (
              <View style={[styles.statusBox, { backgroundColor: theme.error + '15', borderColor: theme.error, marginTop: 12 }]}>
                <Text style={[styles.statusText, { color: theme.error }]}>⚠ {rescheduleError}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: theme.hairline }]}>
            <Pressable
              onPress={onClose}
              disabled={isRescheduling || optimizeStatus === 'running'}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: theme.hairline, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={isRescheduling || optimizeStatus === 'running'}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.text, opacity: (isRescheduling || optimizeStatus === 'running') ? 0.6 : pressed ? 0.9 : 1 }
              ]}
            >
              {isRescheduling ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <>
                  <Save size={14} color={theme.background} />
                  <Text style={[styles.saveBtnText, { color: theme.background }]}>Save Settings</Text>
                </>
              )}
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  adjustBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  adjustBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  infoText: {
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  switchSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  switchDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  calibrationSection: {
    marginBottom: 8,
  },
  calibrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  calibrationTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  calibrationDesc: {
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 10,
  },
  statusBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
    fontWeight: 'bold',
  },
  calibrationCtaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  logsMeta: {
    flex: 1,
    paddingRight: 8,
  },
  logsCountText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  logsCountDesc: {
    fontSize: 8,
  },
  calibrateBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calibrateBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
}) as any;
