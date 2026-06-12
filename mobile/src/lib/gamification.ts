import { getDB, getLocalUserStats, saveLocalUserStats, type LocalUserStats } from './db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getLevelInfo, 
  getCurrentMonthStr, 
  getTodayDateStr, 
  getYesterdayDateStr 
} from '@openmedq/shared';
import { SyncManager } from './SyncManager';

// Earn Dopa locally in SQLite
export async function earnDopaLocal(amount: number, reason: string): Promise<LocalUserStats> {
  const currentMonth = getCurrentMonthStr();
  const today = getTodayDateStr();
  const sqlite = await getDB();

  let stats = await getLocalUserStats(currentMonth);

  if (!stats) {
    // If stats don't exist for the current month, carry forward previous stats
    const allStatsRows = await sqlite.getAllAsync<any>(
      'SELECT * FROM userStats ORDER BY month DESC'
    );
    let lifetimeDopa = 0;
    let streakDays = 0;
    
    if (allStatsRows.length > 0) {
      lifetimeDopa = allStatsRows[0].lifetimeDopa;
      streakDays = allStatsRows[0].streakDays;
    }

    stats = {
      month: currentMonth,
      dopa: 0,
      lifetimeDopa,
      streakDays,
      lastActiveDate: today,
      updatedAt: Date.now()
    };
  }

  const oldLevel = getLevelInfo(stats.dopa).level;

  stats.dopa += amount;
  stats.lifetimeDopa += amount;
  stats.lastActiveDate = today;
  stats.updatedAt = Date.now();

  const newLevel = getLevelInfo(stats.dopa).level;
  if (newLevel > oldLevel) {
    // Save level-up details to AsyncStorage for celebration triggers
    await AsyncStorage.setItem('openmedq_pending_levelup', JSON.stringify({
      oldLevel,
      newLevel,
      dopa: stats.dopa,
      levelName: getLevelInfo(stats.dopa).name,
      badgeUrl: getLevelInfo(stats.dopa).badgeUrl
    }));
  }

  await saveLocalUserStats(stats);
  console.log(`Earned ${amount} Dopa for: ${reason}. New Month Dopa: ${stats.dopa} | Lifetime: ${stats.lifetimeDopa}`);

  // Notify listeners
  SyncManager.notifySyncListeners('openmedq_dopa_updated', stats);
  return stats;
}

// Initialize and verify streaks on app startup or daily rollover
export async function checkDailyStreakAndReset(): Promise<{
  streakDays: number;
  streakUpdated: boolean;
  streakBonus: number;
  monthRollover: boolean;
}> {
  const currentMonth = getCurrentMonthStr();
  const today = getTodayDateStr();
  const yesterday = getYesterdayDateStr();
  let monthRollover = false;
  const sqlite = await getDB();

  let stats = await getLocalUserStats(currentMonth);

  // Month rollover check
  if (!stats) {
    monthRollover = true;
    const allStatsRows = await sqlite.getAllAsync<any>(
      'SELECT * FROM userStats ORDER BY month DESC'
    );
    let prevStats: LocalUserStats | null = null;
    
    if (allStatsRows.length > 0) {
      prevStats = {
        month: allStatsRows[0].month,
        dopa: allStatsRows[0].dopa,
        lifetimeDopa: allStatsRows[0].lifetimeDopa,
        streakDays: allStatsRows[0].streakDays,
        lastActiveDate: allStatsRows[0].lastActiveDate,
        updatedAt: allStatsRows[0].updatedAt,
      };
    }

    // Save previous month summary to show rollover modal
    if (prevStats && prevStats.dopa > 0) {
      await AsyncStorage.setItem('openmedq_last_month_stats', JSON.stringify({
        month: prevStats.month,
        dopa: prevStats.dopa,
        level: getLevelInfo(prevStats.dopa).level,
        levelName: getLevelInfo(prevStats.dopa).name,
        badgeUrl: getLevelInfo(prevStats.dopa).badgeUrl
      }));
    }

    stats = {
      month: currentMonth,
      dopa: 0,
      lifetimeDopa: prevStats ? prevStats.lifetimeDopa : 0,
      streakDays: prevStats ? prevStats.streakDays : 0,
      lastActiveDate: prevStats ? prevStats.lastActiveDate : '',
      updatedAt: Date.now()
    };
    await saveLocalUserStats(stats);
  }

  let streakUpdated = false;
  let streakBonus = 0;

  if (stats.lastActiveDate === today) {
    // Already logged in today, keep current streak
    return { streakDays: stats.streakDays, streakUpdated: false, streakBonus: 0, monthRollover };
  }

  if (stats.lastActiveDate === yesterday) {
    // Logged in consecutive day, increment streak
    stats.streakDays += 1;
    streakUpdated = true;
    streakBonus = Math.min(100, 10 * stats.streakDays); // 10 Dopa per streak day, max 100
    stats.dopa += streakBonus;
    stats.lifetimeDopa += streakBonus;
    stats.lastActiveDate = today;
    stats.updatedAt = Date.now();
    await saveLocalUserStats(stats);
  } else if (stats.lastActiveDate !== '') {
    // Active before, but missed a day -> Streak broken
    stats.streakDays = 1;
    streakUpdated = true;
    stats.lastActiveDate = today;
    stats.updatedAt = Date.now();
    await saveLocalUserStats(stats);
  } else {
    // Brand new user
    stats.streakDays = 1;
    streakUpdated = true;
    stats.lastActiveDate = today;
    stats.updatedAt = Date.now();
    await saveLocalUserStats(stats);
  }

  if (streakUpdated) {
    SyncManager.notifySyncListeners('openmedq_dopa_updated', stats);
  }

  return { streakDays: stats.streakDays, streakUpdated, streakBonus, monthRollover };
}
