import { fsrs, createEmptyCard, type Card as FsrsCard } from 'ts-fsrs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB } from './db';
import { 
  type FSRSSettings, 
  progressToCard, 
  cardToProgressFields, 
  formatFSRSInterval,
  getSafeWeights
} from '@openmedq/shared';

export { type FSRSSettings, progressToCard, cardToProgressFields, formatFSRSInterval, getSafeWeights };

export async function getFSRSSettings(): Promise<FSRSSettings> {
  const rawRetention = await AsyncStorage.getItem('openmedq_fsrs_retention');
  const rawMaxInterval = await AsyncStorage.getItem('openmedq_fsrs_max_interval');

  let retention = rawRetention !== null ? parseFloat(rawRetention) : 0.9;
  if (isNaN(retention) || !Number.isFinite(retention) || retention < 0 || retention > 1) {
    retention = 0.9;
  }

  let maxInterval = rawMaxInterval !== null ? parseInt(rawMaxInterval, 10) : 36500;
  if (isNaN(maxInterval) || !Number.isFinite(maxInterval) || maxInterval <= 0) {
    maxInterval = 36500;
  }

  const fuzz = (await AsyncStorage.getItem('openmedq_fsrs_fuzz')) !== 'false';

  const rawW = await AsyncStorage.getItem('openmedq_fsrs_weights');
  let w: number[] | undefined;
  if (rawW) {
    try {
      const parsed = JSON.parse(rawW);
      w = getSafeWeights(parsed);
    } catch {}
  }

  return {
    request_retention: retention,
    maximum_interval: maxInterval,
    enable_fuzz: fuzz,
    w,
  };
}

export async function saveFSRSSettings(settings: Partial<FSRSSettings>) {
  if (settings.request_retention !== undefined) {
    await AsyncStorage.setItem('openmedq_fsrs_retention', String(settings.request_retention));
  }
  if (settings.maximum_interval !== undefined) {
    await AsyncStorage.setItem('openmedq_fsrs_max_interval', String(settings.maximum_interval));
  }
  if (settings.enable_fuzz !== undefined) {
    await AsyncStorage.setItem('openmedq_fsrs_fuzz', String(settings.enable_fuzz));
  }
  if (settings.w !== undefined) {
    await AsyncStorage.setItem('openmedq_fsrs_weights', JSON.stringify(settings.w));
  }
}

export async function getScheduler() {
  const settings = await getFSRSSettings();
  return fsrs({
    request_retention: settings.request_retention,
    maximum_interval: settings.maximum_interval,
    enable_fuzz: settings.enable_fuzz,
    w: getSafeWeights(settings.w),
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  });
}

export async function rescheduleAllCards(newRetention: number, newMaxInterval: number) {
  try {
    const sqlite = await getDB();
    const rows = await sqlite.getAllAsync<any>('SELECT * FROM progress');
    const settings = await getFSRSSettings();
    
    // Resolve weights
    let w = getSafeWeights(settings.w);

    const decay = -w[20];

    if (!Number.isFinite(newRetention) || !Number.isFinite(decay) || decay === 0 || newRetention <= 0 || newRetention >= 1) {
      throw new Error("Failed to reschedule cards due to invalid settings.");
    }

    const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
    const intervalModifier = (Math.pow(newRetention, 1 / decay) - 1) / factor;

    await sqlite.withTransactionAsync(async () => {
      for (const row of rows) {
        // Only reschedule Review cards (state 2). Learning/Relearning cards use step-based schedules.
        if (row.stability !== null && row.stability !== undefined && row.state === 2) {
          const stability = row.stability;
          const lastReview = row.lastReview || row.answeredAt || Date.now();
          
          const calculatedInterval = stability * intervalModifier;
          const scheduledDays = Math.min(newMaxInterval, Math.max(1, Math.round(calculatedInterval)));
          const newDue = lastReview + scheduledDays * 24 * 60 * 60 * 1000;

          await sqlite.runAsync(
            `UPDATE progress SET 
              scheduledDays = ?, 
              due = ?, 
              updatedAt = ? 
             WHERE questionId = ?`,
            [scheduledDays, newDue, Date.now(), row.questionId]
          );
        }
      }
    });
    
    console.log(`Rescheduled ${rows.length} cards.`);
  } catch (err) {
    console.error("Failed to reschedule cards.");
    throw err;
  }
}

// Mathematical parameter bounds for FSRS v6 (21 parameters)
const FSRS_BOUNDS = [
  [0.001, 100], // w[0] (initial stability for Again)
  [0.001, 100], // w[1] (initial stability for Hard)
  [0.001, 100], // w[2] (initial stability for Good)
  [0.001, 100], // w[3] (initial stability for Easy)
  [1, 10],      // w[4] (initial difficulty base)
  [1e-3, 4],    // w[5] (initial difficulty multiplier)
  [1e-3, 4],    // w[6] (difficulty multiplier)
  [1e-3, 0.75], // w[7] (mean reversion weight)
  [0, 4.5],     // w[8] (recall stability exponent)
  [0, 0.8],     // w[9] (recall stability exponent)
  [1e-3, 3.5],  // w[10] (recall stability exponent)
  [1e-3, 5],    // w[11] (forget stability base)
  [1e-3, 0.25], // w[12] (forget stability difficulty exponent)
  [1e-3, 0.9],  // w[13] (forget stability stability exponent)
  [0, 4],       // w[14] (forget stability retrievability exponent)
  [0, 1],       // w[15] (hard penalty)
  [1, 6],       // w[16] (easy bonus)
  [0, 2],       // w[17] (short-term stability weight)
  [0, 2],       // w[18] (short-term stability weight)
  [0.01, 0.8],  // w[19] (short-term stability weight)
  [0.1, 0.8]    // w[20] (decay factor)
];

export function filterSameDayReviewLogs(logs: any[]): any[] {
  const seen = new Set<string>();
  return logs.filter(log => {
    const date = new Date(log.reviewTime);
    // Group by questionId and local calendar date
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const key = `${log.questionId}-${dateKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    return false;
  });
}

// Helper to compute average Log Loss for a given set of weights
function computeLoss(w: number[], logs: any[]): number {
  const cardMap = new Map<number, FsrsCard>();
  let totalLoss = 0;
  let count = 0;

  const scheduler = fsrs({
    w,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  });

  const decayVal = -w[20];
  const factor = Math.exp(Math.pow(decayVal, -1) * Math.log(0.9)) - 1;

  for (const log of logs) {
    const card: FsrsCard = cardMap.get(log.questionId) || createEmptyCard(new Date(log.reviewTime));

    if (card.last_review) {
      const elapsedDays = (log.reviewTime - card.last_review.getTime()) / (24 * 60 * 60 * 1000);
      if (elapsedDays > 0) {
        const stability = card.stability;
        if (stability > 0) {
          const r = Math.pow(1 + factor * elapsedDays / stability, decayVal);
          const clampedP = Math.max(1e-5, Math.min(1 - 1e-5, r));
          const y = log.rating > 1 ? 1 : 0;
          totalLoss += -(y * Math.log(clampedP) + (1 - y) * Math.log(1 - clampedP));
          count++;
        }
      }
    }

    // Advance card state in simulation
    const res = scheduler.next(card, new Date(log.reviewTime), log.rating as any);
    cardMap.set(log.questionId, res.card);
  }

  return count > 0 ? totalLoss / count : Infinity;
}

/**
 * Optimizes FSRS parameters based on local reviewLogs.
 * Returns the optimized weights array, or null if insufficient logs.
 */
export async function optimizeFSRSParameters(
  onProgress?: (progress: number, loss: number) => void
): Promise<number[] | null> {
  const sqlite = await getDB();
  const rawLogs = await sqlite.getAllAsync<any>('SELECT * FROM reviewLogs ORDER BY reviewTime ASC');
  const logs = filterSameDayReviewLogs(rawLogs);
  
  const minRequiredLogs = 50;
  if (logs.length < minRequiredLogs) {
    throw new Error(`Insufficient data: Revision scheduler requires at least ${minRequiredLogs} review logs to calibrate parameters. Currently, you have ${logs.length}.`);
  }

  // Warm-start from user's current weights (or defaults if none exist)
  const settings = await getFSRSSettings();
  const currentW = [...getSafeWeights(settings.w)];
  
  const activeLogs = logs.slice(-2000);

  let bestW = [...currentW];
  let bestLoss = computeLoss(bestW, activeLogs);

  if (bestLoss === Infinity) {
    throw new Error('Not enough repeat reviews found in history. Keep practicing to build up spaced repetition reviews.');
  }

  const bounds = FSRS_BOUNDS.slice(0, currentW.length);
  const numParams = currentW.length;
  
  const maxIterations = 5;
  let step = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    for (let i = 0; i < numParams; i++) {
      const paramBounds = bounds[i];
      const origValue = bestW[i];

      const paramStep = i < 4 ? step * 5.0 : step * 0.1;

      // Evaluate addition
      const plusVal = Math.min(paramBounds[1], origValue + paramStep);
      if (plusVal !== origValue) {
        const testW = [...bestW];
        testW[i] = plusVal;
        const loss = computeLoss(testW, activeLogs);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestW = testW;
          improved = true;
        }
      }

      // Evaluate subtraction
      const minusVal = Math.max(paramBounds[0], origValue - paramStep);
      if (minusVal !== origValue) {
        const testW = [...bestW];
        testW[i] = minusVal;
        const loss = computeLoss(testW, activeLogs);
        if (loss < bestLoss) {
          bestLoss = loss;
          bestW = testW;
          improved = true;
        }
      }
    }

    onProgress?.((iter + 1) / maxIterations, bestLoss);

    // Yield execution to the browser/React Native event loop to avoid UI freezing
    await new Promise(resolve => setTimeout(resolve, 0));

    if (!improved) {
      step *= 0.5;
    }
  }

  return getSafeWeights(bestW);
}
