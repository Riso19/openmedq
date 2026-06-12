import { db, type ReviewLog } from './db';
import { fsrs, createEmptyCard, type Card as FsrsCard } from 'ts-fsrs';
import { getSafeWeights, getFSRSSettings } from './fsrs';

export function filterSameDayReviewLogs(logs: ReviewLog[]): ReviewLog[] {
  const seen = new Set<string>();
  return logs.filter(log => {
    const date = new Date(log.reviewTime);
    // Group by questionId and the local calendar date
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const key = `${log.questionId}-${dateKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    return false;
  });
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

// Helper to compute average Log Loss for a given set of weights
function computeLoss(w: number[], logs: ReviewLog[]): number {
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
  const rawLogs = await db.reviewLogs.orderBy('reviewTime').toArray();
  const logs = filterSameDayReviewLogs(rawLogs);
  
  // FSRS optimization requires a minimal size of historical logs to be statistically stable
  const minRequiredLogs = 50;
  if (logs.length < minRequiredLogs) {
    throw new Error(`Insufficient data: FSRS optimizer requires at least ${minRequiredLogs} review logs to calibrate parameters. Currently, you have ${logs.length}.`);
  }

  // Warm-start from user's current weights (or defaults if none exist)
  const settings = getFSRSSettings();
  const currentW = [...getSafeWeights(settings.w)];
  
  // Limit to the most recent 2,000 logs for computation speed and learning relevance
  const activeLogs = logs.slice(-2000);

  let bestW = [...currentW];
  let bestLoss = computeLoss(bestW, activeLogs);

  if (bestLoss === Infinity) {
    throw new Error('Not enough repeat reviews found in history. Keep practicing to build up spaced repetition reviews.');
  }

  const bounds = FSRS_BOUNDS.slice(0, currentW.length);
  const numParams = currentW.length;
  
  // Coordinate Descent optimization
  const maxIterations = 5;
  let step = 0.1;

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    for (let i = 0; i < numParams; i++) {
      const paramBounds = bounds[i];
      const origValue = bestW[i];

      // Initial stabilities (indices 0-3) scale higher, requiring larger steps
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

    // Yield execution to the browser event loop to avoid UI freezing
    await new Promise(resolve => setTimeout(resolve, 0));

    if (!improved) {
      step *= 0.5;
    }
  }

  return getSafeWeights(bestW);
}
