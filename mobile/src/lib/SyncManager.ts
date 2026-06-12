import AsyncStorage from '@react-native-async-storage/async-storage';
import { gzip, ungzip } from 'pako';
import * as Network from 'expo-network';
import { API_URL } from './api';
import { 
  getDB, 
  saveProgressRecord, 
  saveReviewLog,
  getLocalUserStats, 
  saveProgressRecordsBatch,
  saveReviewLogsBatch,
  saveLocalUserStatsBatch,
  type LocalProgress, 
  type ReviewLog 
} from './db';
import { getCurrentMonthStr, getTodayDateStr, getYesterdayDateStr } from '@openmedq/shared';

// Base64 helper for React Native (Hermes)
function base64Encode(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const len = bytes.length;
  for (i = 0; i < len - 2; i += 3) {
    result += chars[bytes[i] >> 2];
    result += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += chars[bytes[i + 2] & 63];
  }
  if (i < len) {
    result += chars[bytes[i] >> 2];
    if (i === len - 1) {
      result += chars[(bytes[i] & 3) << 4];
      result += '==';
    } else {
      result += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      result += chars[(bytes[i + 1] & 15) << 2];
      result += '=';
    }
  }
  return result;
}

function base64Decode(str: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = str.length * 0.75;
  if (str[str.length - 1] === '=') {
    bufferLength--;
    if (str[str.length - 2] === '=') {
      bufferLength--;
    }
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < str.length; i += 4) {
    const encoded1 = lookup[str.charCodeAt(i)];
    const encoded2 = lookup[str.charCodeAt(i + 1)];
    const encoded3 = lookup[str.charCodeAt(i + 2)];
    const encoded4 = lookup[str.charCodeAt(i + 3)];
    
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (p < bufferLength) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }
  return bytes;
}

type SyncListener = (event: string, data?: any) => void;
const listeners = new Set<SyncListener>();

export class SyncManager {
  private static netInfoSubscription: any = null;

  public static addSyncListener(l: SyncListener) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  }

  public static notifySyncListeners(event: string, data?: any) {
    listeners.forEach(l => l(event, data));
  }

  public static async getDeviceId(): Promise<string> {
    let id = await AsyncStorage.getItem('openmedq_device_id');
    if (!id) {
      id = `dev-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString().slice(-4)}`;
      await AsyncStorage.setItem('openmedq_device_id', id);
    }
    return id;
  }

  // Compress string to Base64 using pako gzip
  public static async compressToBase64(str: string): Promise<string> {
    if (!str || str === '[]') return '[]';
    try {
      const binaryString = gzip(str);
      return base64Encode(binaryString);
    } catch (err) {
      console.error('Compression failed.');
      const codeUnits = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        codeUnits[i] = str.charCodeAt(i);
      }
      return base64Encode(codeUnits);
    }
  }

  // Decompress Gzip-compressed Base64 string using pako ungzip
  public static async decompressFromBase64(base64Str: string): Promise<string> {
    if (!base64Str || base64Str === '[]') return '[]';
    try {
      const bytes = base64Decode(base64Str);
      return ungzip(bytes, { to: 'string' });
    } catch (err) {
      console.warn('Decompression failed.');
      try {
        const decoded = new TextDecoder().decode(base64Decode(base64Str));
        JSON.parse(decoded);
        return decoded;
      } catch {
        return '[]';
      }
    }
  }

  // Save settings from AsyncStorage to SQLite progress table (questionId: -999)
  public static async saveSettingsToSQLite() {
    const targetExam = (await AsyncStorage.getItem('openmedq_target_exam')) || 'NEET PG';
    const dailyTarget = parseInt((await AsyncStorage.getItem('openmedq_daily_target')) || '50', 10);
    const rawRetention = await AsyncStorage.getItem('openmedq_fsrs_retention');
    const rawMaxInterval = await AsyncStorage.getItem('openmedq_fsrs_max_interval');
    const retention = rawRetention !== null ? parseFloat(rawRetention) : 0.9;
    const maxInterval = rawMaxInterval !== null ? parseInt(rawMaxInterval, 10) : 36500;
    const fuzz = (await AsyncStorage.getItem('openmedq_fsrs_fuzz')) !== 'false';
    const rawW = await AsyncStorage.getItem('openmedq_fsrs_weights');
    
    let w: number[] | undefined;
    if (rawW) {
      try {
        w = JSON.parse(rawW);
      } catch {}
    }

    const settingsRecord: LocalProgress = {
      questionId: -999,
      status: 'BOOKMARKED',
      answeredAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        targetExam,
        dailyTarget,
        fsrsRetention: retention,
        fsrsMaxInterval: maxInterval,
        fsrsFuzz: fuzz,
        fsrsWeights: w
      }
    };

    try {
      await saveProgressRecord(settingsRecord);
      console.log('Saved settings to SQLite progress table:', settingsRecord.settings);
    } catch (err) {
      console.warn('Failed to save settings to local storage.');
    }
  }

  // Read settings from synced progress record and apply them to AsyncStorage
  public static async applySettingsFromProgress(rec: LocalProgress) {
    if (rec.questionId !== -999 || !rec.settings) return;
    const s = rec.settings;
    let changed = false;

    const getOrSet = async (key: string, val: string) => {
      const current = await AsyncStorage.getItem(key);
      if (current !== val) {
        await AsyncStorage.setItem(key, val);
        changed = true;
      }
    };

    try {
      if (s.targetExam) await getOrSet('openmedq_target_exam', s.targetExam);
      if (s.dailyTarget) await getOrSet('openmedq_daily_target', String(s.dailyTarget));
      if (s.fsrsRetention !== undefined) await getOrSet('openmedq_fsrs_retention', String(s.fsrsRetention));
      if (s.fsrsMaxInterval !== undefined) await getOrSet('openmedq_fsrs_max_interval', String(s.fsrsMaxInterval));
      if (s.fsrsFuzz !== undefined) await getOrSet('openmedq_fsrs_fuzz', String(s.fsrsFuzz));
      if (s.fsrsWeights !== undefined) await getOrSet('openmedq_fsrs_weights', JSON.stringify(s.fsrsWeights));

      if (changed) {
        console.log('Applied synced settings to AsyncStorage:', s);
        this.notifySyncListeners('openmedq_settings_updated');
      }
    } catch (err) {
      console.warn('Failed to apply synced settings.');
    }
  }

  // Helper to execute SQLite operations in a transaction on native, and sequentially on web
  private static async runInTransaction(sqlite: any, operation: () => Promise<void>): Promise<void> {
    if (typeof window !== 'undefined') {
      await operation();
    } else {
      await sqlite.execAsync('BEGIN TRANSACTION;');
      try {
        await operation();
        await sqlite.execAsync('COMMIT;');
      } catch (err) {
        try {
          await sqlite.execAsync('ROLLBACK;');
        } catch {}
        throw err;
      }
    }
  }

  // Two-Way Sync with Cloudflare D1
  public static async syncWithD1(
    getToken: (options?: { skipCache?: boolean }) => Promise<string | null>,
    onStatusChange?: (status: 'synced' | 'syncing' | 'unsynced' | 'error') => void,
    profile?: { displayName?: string; email?: string },
    force = false
  ): Promise<boolean> {
    try {
      const now = Date.now();
      const lastSyncStr = await AsyncStorage.getItem('openmedq_last_sync_timestamp');
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

      // Check if there are unsynced changes since lastSync
      let hasLocalChanges = true;
      if (lastSync > 0) {
        try {
          const sqlite = await getDB();
          const progressCount = await sqlite.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM progress WHERE updatedAt > ?',
            [lastSync]
          );
          const logsCount = await sqlite.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM reviewLogs WHERE reviewTime > ?',
            [lastSync]
          );
          const statsCount = await sqlite.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM userStats WHERE updatedAt > ?',
            [lastSync]
          );
          hasLocalChanges =
            (progressCount?.count || 0) > 0 ||
            (logsCount?.count || 0) > 0 ||
            (statsCount?.count || 0) > 0;
        } catch (err) {
          console.warn('Failed to check for unsynced local mutations.');
        }
      }

      if (!force && now - lastSync < 300000) { // 5 minutes throttle
        console.log('Skipping D1 sync: synced recently.');
        onStatusChange?.('synced');
        return true;
      }

      // If this is an auto-sync or routine sync (not forced) and we have no local changes, we can skip
      if (!force && !hasLocalChanges) {
        console.log('Skipping routine sync: no local changes.');
        onStatusChange?.('synced');
        return true;
      }

      onStatusChange?.('syncing');
      const token = await getToken();
      if (!token) {
        onStatusChange?.('error');
        return false;
      }

      const baseUrl = API_URL;

      // 1. Pull current remote state from D1
      const getRes = await fetch(`${baseUrl}/api/progress/sync?since=${lastSync}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!getRes.ok) {
        throw new Error(`Failed to pull progress. Status: ${getRes.status}`);
      }

      const getBody = (await getRes.json()) as any;
      const modified = getBody.data?.modified !== false;

      // If server is unmodified AND client has no local changes, we exit early!
      if (!modified && !hasLocalChanges) {
        await AsyncStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));
        console.log('D1 Sync: No local changes & server unmodified. Early exit.');
        onStatusChange?.('synced');
        return true;
      }

      // 2. Fetch local progress, review logs, and user stats
      const sqlite = await getDB();
      
      const localProgressRows = await sqlite.getAllAsync<any>('SELECT * FROM progress');
      const localProgress: LocalProgress[] = localProgressRows.map(p => {
        let parsedSettings: any = undefined;
        if (p.settings) {
          try {
            parsedSettings = JSON.parse(p.settings);
          } catch {}
        }
        return {
          questionId: p.questionId,
          status: p.status,
          answeredAt: p.answeredAt,
          previousStatus: p.previousStatus || undefined,
          due: p.due ?? undefined,
          stability: p.stability ?? undefined,
          difficulty: p.difficulty ?? undefined,
          elapsedDays: p.elapsedDays ?? undefined,
          scheduledDays: p.scheduledDays ?? undefined,
          reps: p.reps ?? undefined,
          lapses: p.lapses ?? undefined,
          state: p.state !== null ? p.state : undefined,
          lastReview: p.lastReview ?? undefined,
          updatedAt: p.updatedAt,
          isDeleted: p.isDeleted === 1,
          settings: parsedSettings,
        };
      });

      const localLogs = await sqlite.getAllAsync<ReviewLog>('SELECT * FROM reviewLogs');
      const currentMonth = getCurrentMonthStr();
      const localStats = await getLocalUserStats(currentMonth);

      let mergedList: LocalProgress[] = [];
      let mergedLogsList: ReviewLog[] = [];
      let finalLifetimeDopa = 0;
      let finalStreakDays = 0;
      let finalLastActiveDate = '';
      const mergedMonthlyMap = new Map<string, { month: string; dopa: number; updatedAt: number }>();
      let hasChangesToPush = false;

      if (modified) {
        // Full Sync Flow: Parse remote BLOB and merge
        const progressDataRaw = getBody.data?.progressData || '[]';
        const decompressed = await this.decompressFromBase64(progressDataRaw);
        
        let remoteProgress: LocalProgress[] = [];
        let remoteLogs: ReviewLog[] = [];
        try {
          const parsed = JSON.parse(decompressed);
          if (Array.isArray(parsed)) {
            remoteProgress = parsed;
          } else if (parsed && Array.isArray(parsed.progressList)) {
            remoteProgress = parsed.progressList;
            remoteLogs = parsed.reviewLogs || [];
          }
        } catch (err) {
          console.warn('Failed to parse progress data.');
        }

        // Merge local and remote progress using LWW
        const mergedMap = new Map<number, LocalProgress>();
        remoteProgress.forEach(r => {
          mergedMap.set(r.questionId, r);
        });

        localProgress.forEach(localRec => {
          const remoteRec = mergedMap.get(localRec.questionId);
          if (!remoteRec) {
            mergedMap.set(localRec.questionId, localRec);
            hasChangesToPush = true;
          } else {
            const localTime = localRec.updatedAt || localRec.answeredAt || 0;
            const remoteTime = remoteRec.updatedAt || remoteRec.answeredAt || 0;
            if (localTime >= remoteTime) {
              mergedMap.set(localRec.questionId, {
                ...remoteRec,
                ...localRec,
                updatedAt: Math.max(localTime, remoteTime)
              });
              hasChangesToPush = true;
            }
          }
        });

        mergedList = Array.from(mergedMap.values());

        // Merge review logs
        const mergedLogsMap = new Map<string, ReviewLog>();
        remoteLogs.forEach(log => {
          const key = `${log.questionId}-${log.reviewTime}`;
          mergedLogsMap.set(key, log);
        });
        let hasLocalLogs = false;
        localLogs.forEach(log => {
          const key = `${log.questionId}-${log.reviewTime}`;
          if (!mergedLogsMap.has(key)) {
            mergedLogsMap.set(key, log);
            hasLocalLogs = true;
          }
        });
        if (hasLocalLogs) {
          hasChangesToPush = true;
        }
        mergedLogsList = Array.from(mergedLogsMap.values());

        // Merge monthly stats
        const remoteGamification = getBody.data?.gamification;
        const remoteMonthlyDopaList: any[] = remoteGamification?.monthlyDopaList || [];

        remoteMonthlyDopaList.forEach(r => {
          mergedMonthlyMap.set(r.month, {
            month: r.month,
            dopa: r.dopa,
            updatedAt: r.updatedAt || 0,
          });
        });

        if (localStats) {
          const remote = mergedMonthlyMap.get(localStats.month);
          if (!remote) {
            mergedMonthlyMap.set(localStats.month, {
              month: localStats.month,
              dopa: localStats.dopa,
              updatedAt: localStats.updatedAt,
            });
            if (localStats.dopa > 0) {
              hasChangesToPush = true;
            }
          } else {
            if (remote.dopa > 0 && localStats.dopa === 0) {
              // Keep remote
            } else if (localStats.dopa > 0 && remote.dopa === 0) {
              mergedMonthlyMap.set(localStats.month, {
                month: localStats.month,
                dopa: localStats.dopa,
                updatedAt: localStats.updatedAt || Date.now(),
              });
              hasChangesToPush = true;
            } else {
              const mergedDopa = Math.max(localStats.dopa, remote.dopa);
              const mergedUpdatedAt = Math.max(localStats.updatedAt, remote.updatedAt);
              mergedMonthlyMap.set(localStats.month, {
                month: localStats.month,
                dopa: mergedDopa,
                updatedAt: mergedUpdatedAt,
              });
              if (mergedDopa !== remote.dopa || mergedUpdatedAt !== remote.updatedAt) {
                hasChangesToPush = true;
              }
            }
          }
        }

        finalLifetimeDopa = Math.max(
          localStats ? localStats.lifetimeDopa : 0,
          remoteGamification?.lifetimeDopa || 0
        );
        if (localStats && localStats.lifetimeDopa > (remoteGamification?.lifetimeDopa || 0)) {
          hasChangesToPush = true;
        }

        const localStreak = localStats ? localStats.streakDays : 0;
        const localLastActive = localStats ? localStats.lastActiveDate : '';
        const remoteStreak = remoteGamification?.streakDays || 0;
        const remoteLastActive = remoteGamification?.lastActiveDate || '';

        const todayStr = getTodayDateStr();
        const yesterdayStr = getYesterdayDateStr();

        if (!localLastActive) {
          finalStreakDays = remoteStreak;
          finalLastActiveDate = remoteLastActive;
        } else if (!remoteLastActive) {
          finalStreakDays = localStreak;
          finalLastActiveDate = localLastActive;
        } else if (localLastActive === todayStr && remoteLastActive === yesterdayStr) {
          finalStreakDays = Math.max(localStreak, remoteStreak + 1);
          finalLastActiveDate = todayStr;
        } else if (remoteLastActive === todayStr && localLastActive === yesterdayStr) {
          finalStreakDays = Math.max(remoteStreak, localStreak + 1);
          finalLastActiveDate = todayStr;
        } else if (localLastActive === remoteLastActive) {
          finalStreakDays = Math.max(localStreak, remoteStreak);
          finalLastActiveDate = localLastActive;
        } else if (localLastActive > remoteLastActive) {
          finalStreakDays = localStreak;
          finalLastActiveDate = localLastActive;
        } else {
          finalStreakDays = remoteStreak;
          finalLastActiveDate = remoteLastActive;
        }

        if (finalStreakDays > remoteStreak || (finalLastActiveDate && finalLastActiveDate !== remoteLastActive)) {
          hasChangesToPush = true;
        }

        // Save merged results back to local SQLite in transactions
        await this.runInTransaction(sqlite, async () => {
          if (mergedList.length > 0) {
            await saveProgressRecordsBatch(sqlite, mergedList);
            
            const settingsRec = mergedList.find(r => r.questionId === -999);
            if (settingsRec) {
              await this.applySettingsFromProgress(settingsRec);
            }
          }

          await sqlite.runAsync('DELETE FROM reviewLogs');
          if (mergedLogsList.length > 0) {
            await saveReviewLogsBatch(sqlite, mergedLogsList);
          }

          const finalMonthlyDopaList = Array.from(mergedMonthlyMap.values());
          if (finalMonthlyDopaList.length > 0) {
            await saveLocalUserStatsBatch(sqlite, finalMonthlyDopaList.map(item => ({
              month: item.month,
              dopa: item.dopa,
              lifetimeDopa: finalLifetimeDopa,
              streakDays: finalStreakDays,
              lastActiveDate: finalLastActiveDate,
              updatedAt: item.updatedAt,
            })));
          }
        });

      } else {
        // Delta Flow: Server is unmodified but client has local changes to push
        mergedList = localProgress;
        mergedLogsList = localLogs;
        
        if (localStats) {
          mergedMonthlyMap.set(localStats.month, {
            month: localStats.month,
            dopa: localStats.dopa,
            updatedAt: localStats.updatedAt,
          });
        }
        
        finalLifetimeDopa = localStats ? localStats.lifetimeDopa : 0;
        finalStreakDays = localStats ? localStats.streakDays : 0;
        finalLastActiveDate = localStats ? localStats.lastActiveDate : '';
        hasChangesToPush = true;
      }

      if (!hasChangesToPush) {
        await AsyncStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));
        console.log('D1 Sync: No local changes to push. Skipping push.');
        onStatusChange?.('synced');
        return true;
      }

      const activeProgress = mergedList.filter(p => !p.isDeleted);
      const incorrectIds = activeProgress.filter(p => p.status === 'INCORRECT').map(p => p.questionId);
      const bookmarkedIds = activeProgress.filter(p => p.status === 'BOOKMARKED').map(p => p.questionId);

      const payloadObj = {
        progressList: mergedList,
        reviewLogs: mergedLogsList
      };
      const compressedProgressData = await this.compressToBase64(JSON.stringify(payloadObj));

      // Refresh token to avoid expiration during long DB merges
      const freshToken = (await getToken({ skipCache: true })) || token;

      const postRes = await fetch(`${baseUrl}/api/progress/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          incorrectIds,
          bookmarkedIds,
          progressData: compressedProgressData,
          gamification: {
            streakDays: finalStreakDays,
            lastActiveDate: finalLastActiveDate,
            lifetimeDopa: finalLifetimeDopa,
            monthlyDopaList: Array.from(mergedMonthlyMap.values()),
          },
          profile
        })
      });

      if (!postRes.ok) {
        let errorMsg = `Failed to push progress. Status: ${postRes.status}`;
        try {
          const body = await postRes.json();
          if (body?.error) {
            errorMsg += ` - ${body.error}`;
          }
        } catch {
          try {
            const text = await postRes.text();
            if (text) errorMsg += ` - ${text.substring(0, 100)}`;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      await AsyncStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));

      console.log(`D1 Sync Complete: Merged ${mergedList.length} progress records.`);
      
      const latestMergedStats = await getLocalUserStats(currentMonth);
      if (latestMergedStats) {
        this.notifySyncListeners('openmedq_dopa_updated', latestMergedStats);
      }

      onStatusChange?.('synced');
      return true;
    } catch (err) {
      console.error('Sync Error.');
      onStatusChange?.('error');
      return false;
    }
  }

  // --- NetInfo Background Auto-Sync ---
  public static initAutoSync(getToken: (options?: { skipCache?: boolean }) => Promise<string | null>) {
    if (this.netInfoSubscription) return;

    this.netInfoSubscription = Network.addNetworkStateListener(async state => {
      if (state.isConnected && state.isInternetReachable) {
        try {
          const lastSyncStr = await AsyncStorage.getItem('openmedq_last_sync_timestamp');
          const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

          if (lastSync > 0) {
            const sqlite = await getDB();
            const progressCount = await sqlite.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM progress WHERE updatedAt > ?',
              [lastSync]
            );
            const logsCount = await sqlite.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM reviewLogs WHERE reviewTime > ?',
              [lastSync]
            );
            const statsCount = await sqlite.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM userStats WHERE updatedAt > ?',
              [lastSync]
            );

            const hasUnsyncedLocal =
              (progressCount?.count || 0) > 0 ||
              (logsCount?.count || 0) > 0 ||
              (statsCount?.count || 0) > 0;

            if (!hasUnsyncedLocal) {
              console.log('Skipping background D1 auto-sync: no local changes since last sync.');
              return;
            }
          }

          console.log('Network connected. Triggering background D1 auto-sync...');
          await this.syncWithD1(getToken);
        } catch (err) {
          console.warn('Background auto-sync failed.');
        }
      }
    });
    console.log('SyncManager auto-sync listener initialized successfully');
  }

  public static stopAutoSync() {
    if (this.netInfoSubscription) {
      this.netInfoSubscription.remove();
      this.netInfoSubscription = null;
      console.log('SyncManager auto-sync listener stopped');
    }
  }
}
