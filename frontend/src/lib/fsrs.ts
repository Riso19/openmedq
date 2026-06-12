import { fsrs } from 'ts-fsrs';
import { db, type LocalProgress } from './db';
import {
  type FSRSSettings,
  progressToCard,
  cardToProgressFields,
  formatFSRSInterval,
  getSafeWeights
} from '@openmedq/shared';

// Retrieve user customized parameters from localStorage
export { type FSRSSettings, progressToCard, cardToProgressFields, formatFSRSInterval, getSafeWeights };

export function getFSRSSettings(): FSRSSettings {
  if (typeof window === 'undefined') {
    return {
      request_retention: 0.9,
      maximum_interval: 36500,
      enable_fuzz: true,
    };
  }

  const rawRetention = localStorage.getItem('openmedq_fsrs_retention');
  const rawMaxInterval = localStorage.getItem('openmedq_fsrs_max_interval');

  let retention = rawRetention !== null ? parseFloat(rawRetention) : 0.9;
  if (isNaN(retention) || !Number.isFinite(retention) || retention < 0 || retention > 1) {
    retention = 0.9;
  }

  let maxInterval = rawMaxInterval !== null ? parseInt(rawMaxInterval, 10) : 36500;
  if (isNaN(maxInterval) || !Number.isFinite(maxInterval) || maxInterval <= 0) {
    maxInterval = 36500;
  }

  const fuzz = localStorage.getItem('openmedq_fsrs_fuzz') !== 'false';

  const rawW = localStorage.getItem('openmedq_fsrs_weights');
  let w: number[] | undefined;
  if (rawW) {
    try {
      const parsed = JSON.parse(rawW);
      w = getSafeWeights(parsed);
    } catch (e) {}
  }

  return {
    request_retention: retention,
    maximum_interval: maxInterval,
    enable_fuzz: fuzz,
    w,
  };
}

export function saveFSRSSettings(settings: Partial<FSRSSettings>) {
  if (typeof window === 'undefined') return;
  if (settings.request_retention !== undefined) {
    localStorage.setItem('openmedq_fsrs_retention', String(settings.request_retention));
  }
  if (settings.maximum_interval !== undefined) {
    localStorage.setItem('openmedq_fsrs_max_interval', String(settings.maximum_interval));
  }
  if (settings.enable_fuzz !== undefined) {
    localStorage.setItem('openmedq_fsrs_fuzz', String(settings.enable_fuzz));
  }
  if (settings.w !== undefined) {
    localStorage.setItem('openmedq_fsrs_weights', JSON.stringify(settings.w));
  }
}

// Instantiate and configure scheduler dynamically
export function getScheduler() {
  const settings = getFSRSSettings();
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
    const allProgress = await db.progress.toArray();
    const updatedProgress: LocalProgress[] = [];
    const settings = getFSRSSettings();
    
    // Resolve weights (either custom or from default scheduler)
    let w = getSafeWeights(settings.w);

    const decay = -w[20];

    // Guard subsequent calculations for decay and intervalModifier with Number.isFinite(newRetention) and Number.isFinite(decay)
    if (!Number.isFinite(newRetention) || !Number.isFinite(decay) || decay === 0 || newRetention <= 0 || newRetention >= 1) {
      throw new Error("Failed to reschedule cards due to invalid settings.");
    }

    const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
    if (!Number.isFinite(factor) || factor === 0) {
      throw new Error("Failed to reschedule cards due to invalid calculated parameters.");
    }

    const intervalModifier = (Math.pow(newRetention, 1 / decay) - 1) / factor;
    if (!Number.isFinite(intervalModifier)) {
      throw new Error("Failed to reschedule cards due to invalid modifier.");
    }

    for (const p of allProgress) {
      // Only reschedule Review cards (state 2). Learning/Relearning cards use step-based schedules.
      if (p.stability !== undefined && p.state === 2) {
        const stability = p.stability;
        const lastReview = p.lastReview || p.answeredAt || Date.now();
        
        // FSRS Interval equation: I = S * intervalModifier
        const calculatedInterval = stability * intervalModifier;
        const scheduledDays = Math.min(newMaxInterval, Math.max(1, Math.round(calculatedInterval)));
        
        const newDue = lastReview + scheduledDays * 24 * 60 * 60 * 1000;

        updatedProgress.push({
          ...p,
          scheduledDays,
          due: newDue,
          updatedAt: Date.now(),
        });
      }
    }

    if (updatedProgress.length > 0) {
      await db.progress.bulkPut(updatedProgress);
      console.log(`Rescheduled ${updatedProgress.length} cards.`);
    }
  } catch (err) {
    console.error("Failed to reschedule cards.");
    throw err;
  }
}
