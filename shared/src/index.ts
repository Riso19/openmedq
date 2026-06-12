import { createEmptyCard, State, type Card as FsrsCard, fsrs, checkParameters, clipParameters } from 'ts-fsrs';

export function getSafeWeights(customW?: number[]): number[] {
  if (customW && Array.isArray(customW)) {
    try {
      const validated = Array.from(checkParameters(customW));
      return clipParameters(validated, 0);
    } catch (e) {
      console.warn("Invalid FSRS weights, falling back to default:", e);
    }
  }
  return Array.from(fsrs().parameters.w);
}

// --- FSRS Types & Converters ---

export interface FSRSSettings {
  request_retention: number;
  maximum_interval: number;
  enable_fuzz: boolean;
  w?: number[];
}

export interface MinimalProgress {
  due?: number;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  lastReview?: number;
  answeredAt?: number;
}

// Convert minimal progress representation to ts-fsrs Card structure
export function progressToCard(progress: MinimalProgress | undefined): FsrsCard {
  const empty = createEmptyCard(progress?.lastReview ? new Date(progress.lastReview) : new Date());

  if (!progress || progress.due === undefined) {
    return empty;
  }

  empty.due = new Date(progress.due);
  empty.stability = progress.stability ?? empty.stability;
  empty.difficulty = progress.difficulty ?? empty.difficulty;
  empty.elapsed_days = progress.elapsedDays ?? empty.elapsed_days;
  empty.scheduled_days = progress.scheduledDays ?? empty.scheduled_days;
  empty.reps = progress.reps ?? empty.reps;
  empty.lapses = progress.lapses ?? empty.lapses;
  if (progress.state !== undefined) {
    const parsedState = Number(progress.state);
    if (Number.isInteger(parsedState) && parsedState >= 0 && parsedState <= 3) {
      empty.state = parsedState as State;
    }
  }
  empty.last_review = progress.lastReview ? new Date(progress.lastReview) : undefined;

  return empty;
}

// Convert ts-fsrs Card structure back to progress fields
export function cardToProgressFields(card: FsrsCard): Partial<MinimalProgress> {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.getTime() : undefined,
  };
}

export function formatFSRSInterval(dueDate: Date, now: Date): string {
  const diffMs = dueDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';

  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) {
    return '<1m';
  }
  if (diffMins < 60) {
    return `${diffMins}m`;
  }

  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 30) {
    return `${diffDays}d`;
  }

  const diffMonths = diffDays / 30;
  if (diffMonths < 12) {
    return `${diffMonths.toFixed(1).replace(/\.0$/, '')}mo`;
  }

  const diffYears = diffDays / 365;
  return `${diffYears.toFixed(1).replace(/\.0$/, '')}y`;
}

// --- Gamification ---

export interface LevelInfo {
  level: number;
  name: string;
  threshold: number;
  badgeUrl: string;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: 'Seeker', threshold: 0, badgeUrl: '/badge/seeker-badge-1.png' },
  { level: 2, name: 'Scribe', threshold: 200, badgeUrl: '/badge/scribe-badge-2.png' },
  { level: 3, name: 'Medic', threshold: 600, badgeUrl: '/badge/medic-badge-3.png' },
  { level: 4, name: 'Scholar', threshold: 1500, badgeUrl: '/badge/scholar-badge-4.png' },
  { level: 5, name: 'Savant', threshold: 3500, badgeUrl: '/badge/savant-badge-5.png' },
  { level: 6, name: 'Prodigy', threshold: 7000, badgeUrl: '/badge/prodigy-6.png' },
];

export const getMonthStr = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const getCurrentMonthStr = () => getMonthStr(new Date());

export const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getYesterdayDateStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function getLevelInfo(dopa: number): LevelInfo {
  let active = LEVELS[0];
  for (const lvl of LEVELS) {
    if (dopa >= lvl.threshold) {
      active = lvl;
    } else {
      break;
    }
  }
  return active;
}

export function getNextLevelInfo(dopa: number): {
  nextLevel: LevelInfo | null;
  remaining: number;
  pct: number;
} {
  const current = getLevelInfo(dopa);
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1;

  if (nextIdx >= LEVELS.length) {
    return { nextLevel: null, remaining: 0, pct: 100 };
  }

  const next = LEVELS[nextIdx];
  const range = next.threshold - current.threshold;
  const earnedInRange = dopa - current.threshold;
  const remaining = next.threshold - dopa;
  const pct = Math.min(100, Math.max(0, Math.round((earnedInRange / range) * 100)));

  return { nextLevel: next, remaining, pct };
}

export * from './subjects';
