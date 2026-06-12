import { db, type LocalUserStats } from './db';
import {
  type LevelInfo,
  LEVELS,
  getLevelInfo,
  getNextLevelInfo,
  getMonthStr,
  getCurrentMonthStr,
  getTodayDateStr,
  getYesterdayDateStr
} from '@openmedq/shared';

export {
  type LevelInfo,
  LEVELS,
  getLevelInfo,
  getNextLevelInfo,
  getMonthStr,
  getCurrentMonthStr,
  getTodayDateStr,
  getYesterdayDateStr
};


// Earn Dopa locally in Dexie IndexedDB
export async function earnDopaLocal(amount: number, reason: string): Promise<LocalUserStats> {
  const currentMonth = getCurrentMonthStr();
  const today = getTodayDateStr();

  return await db.transaction('rw', db.userStats, async () => {
    let stats = await db.userStats.get(currentMonth);

    if (!stats) {
      // If stats don't exist for the current month, initialize it by carrying forward previous lifetimeDopa and streak
      const allStats = await db.userStats.toArray();
      let lifetimeDopa = 0;
      let streakDays = 0;
      
      if (allStats.length > 0) {
        allStats.sort((a, b) => b.month.localeCompare(a.month));
        lifetimeDopa = allStats[0].lifetimeDopa;
        streakDays = allStats[0].streakDays;
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
      sessionStorage.setItem('openmedq_pending_levelup', JSON.stringify({
        oldLevel,
        newLevel,
        dopa: stats.dopa,
        levelName: getLevelInfo(stats.dopa).name,
        badgeUrl: getLevelInfo(stats.dopa).badgeUrl
      }));
    }

    await db.userStats.put(stats);
    console.log(`Earned ${amount} Dopa for: ${reason}. New Month Dopa: ${stats.dopa} | Lifetime: ${stats.lifetimeDopa}`);

    // Dispatch global custom event so the UI updates immediately
    window.dispatchEvent(new CustomEvent('openmedq_dopa_updated', { detail: stats }));
    return stats;
  });
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

  return await db.transaction('rw', db.userStats, async () => {
    let stats = await db.userStats.get(currentMonth);

    // Month rollover check
    if (!stats) {
      monthRollover = true;
      const allStats = await db.userStats.toArray();
      let prevStats: LocalUserStats | null = null;
      
      if (allStats.length > 0) {
        allStats.sort((a, b) => b.month.localeCompare(a.month));
        prevStats = allStats[0];
      }

      // Save previous month summary to show rollover modal on dashboard
      if (prevStats && prevStats.dopa > 0) {
        localStorage.setItem('openmedq_last_month_stats', JSON.stringify({
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
      await db.userStats.put(stats);
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
      await db.userStats.put(stats);
    } else if (stats.lastActiveDate !== '') {
      // Active before, but missed a day -> Streak broken
      stats.streakDays = 1;
      streakUpdated = true;
      stats.lastActiveDate = today;
      stats.updatedAt = Date.now();
      await db.userStats.put(stats);
    } else {
      // Brand new user
      stats.streakDays = 1;
      streakUpdated = true;
      stats.lastActiveDate = today;
      stats.updatedAt = Date.now();
      await db.userStats.put(stats);
    }

    if (streakUpdated) {
      window.dispatchEvent(new CustomEvent('openmedq_dopa_updated', { detail: stats }));
    }

    return { streakDays: stats.streakDays, streakUpdated, streakBonus, monthRollover };
  });
}
