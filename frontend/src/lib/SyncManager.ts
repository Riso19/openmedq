import { db, type LocalProgress, type ReviewLog } from './db';
import { getCurrentMonthStr, getTodayDateStr, getYesterdayDateStr } from './gamification';

export class SyncManager {
  private static deviceIdKey = 'openmedq_device_id';
  
  public static getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';
    let id = localStorage.getItem(this.deviceIdKey);
    if (!id) {
      id = `dev-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString().slice(-4)}`;
      localStorage.setItem(this.deviceIdKey, id);
    }
    return id;
  }

  // Compress string to Base64 using browser-native Gzip CompressionStream
  public static async compressToBase64(str: string): Promise<string> {
    if (!str || str === '[]') return '[]';
    try {
      const bytes = new TextEncoder().encode(str);
      const stream = new Response(bytes).body?.pipeThrough(new (window as any).CompressionStream('gzip'));
      if (!stream) {
        throw new Error('CompressionStream not supported');
      }
      const buffer = await new Response(stream).arrayBuffer();
      const compressedBytes = new Uint8Array(buffer);
      
      let binary = '';
      const len = compressedBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(compressedBytes[i]);
      }
      return btoa(binary);
    } catch (err) {
      console.error('Compression failed.');
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  }

  // Decompress Gzip-compressed Base64 string using browser-native DecompressionStream
  public static async decompressFromBase64(base64Str: string): Promise<string> {
    if (!base64Str || base64Str === '[]') return '[]';
    try {
      const binaryString = atob(base64Str);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const stream = new Response(bytes).body?.pipeThrough(new (window as any).DecompressionStream('gzip'));
      if (!stream) {
        throw new Error('DecompressionStream not supported');
      }
      return await new Response(stream).text();
    } catch (err) {
      console.warn('Decompression failed.');
      try {
        JSON.parse(base64Str);
        return base64Str;
      } catch {
        try {
          const decoded = atob(base64Str);
          JSON.parse(decoded);
          return decoded;
        } catch {
          return '[]';
        }
      }
    }
  }

  // Save local settings from localStorage into IndexedDB progress table under questionId -999
  public static async saveSettingsToIndexedDB() {
    if (typeof window === 'undefined') return;
    const targetExam = localStorage.getItem('openmedq_target_exam') || 'NEET PG';
    const dailyTarget = parseInt(localStorage.getItem('openmedq_daily_target') || '50', 10);
    
    const rawRetention = localStorage.getItem('openmedq_fsrs_retention');
    const rawMaxInterval = localStorage.getItem('openmedq_fsrs_max_interval');
    const retention = rawRetention !== null ? parseFloat(rawRetention) : 0.9;
    const maxInterval = rawMaxInterval !== null ? parseInt(rawMaxInterval, 10) : 36500;
    const fuzz = localStorage.getItem('openmedq_fsrs_fuzz') !== 'false';

    const rawW = localStorage.getItem('openmedq_fsrs_weights');
    let w: number[] | undefined;
    if (rawW) {
      try {
        w = JSON.parse(rawW);
      } catch (e) {}
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
      await db.progress.put(settingsRecord);
      console.log('Saved settings to IndexedDB for sync propagation:', settingsRecord.settings);
    } catch (err) {
      console.warn('Failed to save settings to local storage.');
    }
  }

  // Read settings from synced progress record and apply them to local settings
  public static async applySettingsFromProgress(rec: LocalProgress) {
    if (rec.questionId !== -999 || !rec.settings) return;
    const s = rec.settings;
    let changed = false;

    try {
      if (s.targetExam && localStorage.getItem('openmedq_target_exam') !== s.targetExam) {
        localStorage.setItem('openmedq_target_exam', s.targetExam);
        changed = true;
      }
      if (s.dailyTarget && localStorage.getItem('openmedq_daily_target') !== String(s.dailyTarget)) {
        localStorage.setItem('openmedq_daily_target', String(s.dailyTarget));
        changed = true;
      }
      if (s.fsrsRetention !== undefined && localStorage.getItem('openmedq_fsrs_retention') !== String(s.fsrsRetention)) {
        localStorage.setItem('openmedq_fsrs_retention', String(s.fsrsRetention));
        changed = true;
      }
      if (s.fsrsMaxInterval !== undefined && localStorage.getItem('openmedq_fsrs_max_interval') !== String(s.fsrsMaxInterval)) {
        localStorage.setItem('openmedq_fsrs_max_interval', String(s.fsrsMaxInterval));
        changed = true;
      }
      if (s.fsrsFuzz !== undefined && localStorage.getItem('openmedq_fsrs_fuzz') !== String(s.fsrsFuzz)) {
        localStorage.setItem('openmedq_fsrs_fuzz', String(s.fsrsFuzz));
        changed = true;
      }
      if (s.fsrsWeights !== undefined && localStorage.getItem('openmedq_fsrs_weights') !== JSON.stringify(s.fsrsWeights)) {
        localStorage.setItem('openmedq_fsrs_weights', JSON.stringify(s.fsrsWeights));
        changed = true;
      }

      if (changed) {
        console.log('Applied synced settings to localStorage:', s);
        window.dispatchEvent(new Event('openmedq_settings_updated'));
      }
    } catch (err) {
      console.warn('Failed to apply synced settings.');
    }
  }

  // Two-Way Sync with Cloudflare D1
  public static async syncWithD1(
    getToken: () => Promise<string | null>,
    onStatusChange?: (status: 'synced' | 'syncing' | 'unsynced' | 'error') => void,
    profile?: { displayName?: string; email?: string }
  ): Promise<boolean> {
    try {
      const lastSyncStr = localStorage.getItem('openmedq_last_sync_timestamp');
      const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

      // Check if there are local mutations since lastSync
      let hasLocalChanges = true;
      if (lastSync > 0) {
        try {
          const progressCount = await db.progress.where('updatedAt').above(lastSync).count();
          const logsCount = await db.reviewLogs.where('reviewTime').above(lastSync).count();
          const statsCount = await db.userStats.where('updatedAt').above(lastSync).count();
          hasLocalChanges = progressCount > 0 || logsCount > 0 || statsCount > 0;
        } catch (err) {
          console.warn('Failed to check for local mutations.');
        }
      }

      onStatusChange?.('syncing');
      const token = await getToken();
      if (!token) {
        onStatusChange?.('error');
        return false;
      }

      const baseUrl = import.meta.env.VITE_API_URL || '';

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

      // Early exit if server has no changes and client has no local mutations
      if (!modified && !hasLocalChanges) {
        localStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));
        console.log('D1 Sync: No local changes & server unmodified. Early exit.');
        onStatusChange?.('synced');
        return true;
      }

      // 2. Fetch local progress, review logs, and user stats
      const localProgress = await db.progress.toArray();
      const localLogs = await db.reviewLogs.toArray();
      const localUserStats = await db.userStats.toArray();

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
        const decompressed = await SyncManager.decompressFromBase64(progressDataRaw);
        
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

        // Merge local and remote datasets using LWW
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
        localLogs.forEach(log => {
          const key = `${log.questionId}-${log.reviewTime}`;
          if (!mergedLogsMap.has(key)) {
            mergedLogsMap.set(key, log);
            hasChangesToPush = true;
          }
        });
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

        localUserStats.forEach(l => {
          const remote = mergedMonthlyMap.get(l.month);
          if (!remote) {
            mergedMonthlyMap.set(l.month, {
              month: l.month,
              dopa: l.dopa,
              updatedAt: l.updatedAt || 0,
            });
            hasChangesToPush = true;
          } else {
            if (remote.dopa > 0 && l.dopa === 0) {
              // keep remote
            } else if (l.dopa > 0 && remote.dopa === 0) {
              // keep local
              mergedMonthlyMap.set(l.month, {
                month: l.month,
                dopa: l.dopa,
                updatedAt: l.updatedAt || Date.now(),
              });
              hasChangesToPush = true;
            } else {
              mergedMonthlyMap.set(l.month, {
                month: l.month,
                dopa: Math.max(l.dopa, remote.dopa),
                updatedAt: Math.max(l.updatedAt, remote.updatedAt),
              });
              if (Math.max(l.dopa, remote.dopa) !== remote.dopa) {
                hasChangesToPush = true;
              }
            }
          }
        });

        const latestLocalStats = localUserStats.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        
        finalLifetimeDopa = Math.max(
          latestLocalStats ? latestLocalStats.lifetimeDopa : 0,
          remoteGamification?.lifetimeDopa || 0
        );
        if (latestLocalStats && latestLocalStats.lifetimeDopa > (remoteGamification?.lifetimeDopa || 0)) {
          hasChangesToPush = true;
        }

        const localStreak = latestLocalStats ? latestLocalStats.streakDays : 0;
        const localLastActive = latestLocalStats ? latestLocalStats.lastActiveDate : '';
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

        // Save merged results back to local IndexedDB
        const finalMonthlyDopaList = Array.from(mergedMonthlyMap.values());
        await db.transaction('rw', [db.progress, db.reviewLogs, db.userStats], async () => {
          if (mergedList.length > 0) {
            await db.progress.bulkPut(mergedList);
            
            const settingsRec = mergedList.find(r => r.questionId === -999);
            if (settingsRec) {
              await SyncManager.applySettingsFromProgress(settingsRec);
            }
          }

          if (mergedLogsList.length > 0) {
            const logsToPut = mergedLogsList.map(({ id, ...rest }) => rest);
            await db.reviewLogs.clear();
            await db.reviewLogs.bulkAdd(logsToPut);
          }

          for (const item of finalMonthlyDopaList) {
            await db.userStats.put({
              month: item.month,
              dopa: item.dopa,
              lifetimeDopa: finalLifetimeDopa,
              streakDays: finalStreakDays,
              lastActiveDate: finalLastActiveDate,
              updatedAt: item.updatedAt,
            });
          }
        });

      } else {
        // Delta Flow: Server is unmodified but client has local changes to push
        mergedList = localProgress;
        mergedLogsList = localLogs;

        localUserStats.forEach(l => {
          mergedMonthlyMap.set(l.month, {
            month: l.month,
            dopa: l.dopa,
            updatedAt: l.updatedAt,
          });
        });

        const latestLocalStats = localUserStats.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        finalLifetimeDopa = latestLocalStats ? latestLocalStats.lifetimeDopa : 0;
        finalStreakDays = latestLocalStats ? latestLocalStats.streakDays : 0;
        finalLastActiveDate = latestLocalStats ? latestLocalStats.lastActiveDate : '';
        hasChangesToPush = true;
      }

      if (!hasChangesToPush) {
        localStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));
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
      const compressedProgressData = await SyncManager.compressToBase64(JSON.stringify(payloadObj));
      const postRes = await fetch(`${baseUrl}/api/progress/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
        throw new Error(`Failed to push progress. Status: ${postRes.status}`);
      }

      localStorage.setItem('openmedq_last_sync_timestamp', String(Date.now()));
      console.log(`D1 Sync Complete: Merged ${mergedList.length} progress records.`);
      
      const latestMergedStats = await db.userStats.get(getCurrentMonthStr?.() || new Date().toISOString().slice(0, 7));
      if (latestMergedStats) {
        window.dispatchEvent(new CustomEvent('openmedq_dopa_updated', { detail: latestMergedStats }));
      }

      onStatusChange?.('synced');
      return true;
    } catch (err) {
      console.error('Sync Error.');
      onStatusChange?.('error');
      return false;
    }
  }


}
