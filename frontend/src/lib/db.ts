import Dexie, { type Table } from 'dexie';

export interface LocalQuestion {
  id: number;
  questionText: string;
  opa: string;
  opb: string;
  opc: string;
  opd: string;
  correctOption: number;
  subjectId: number;
  topicId: number;
  examType?: string;
  examYear?: number;
  explanation?: string;
  hasImage?: boolean;
  imageUrl?: string;
  explanationImageUrl?: string;
  opaImageUrl?: string;
  opbImageUrl?: string;
  opcImageUrl?: string;
  opdImageUrl?: string;
}

export interface LocalProgress {
  questionId: number;
  status: 'CORRECT' | 'INCORRECT' | 'BOOKMARKED';
  timeTaken?: number;
  answeredAt: number;
  previousStatus?: 'CORRECT' | 'INCORRECT' | 'BOOKMARKED';
  
  // FSRS Scheduling Metadata
  due?: number;            // Timestamp (ms) representing next review date
  stability?: number;      // Memory stability (days)
  difficulty?: number;     // Card difficulty (1-10)
  elapsedDays?: number;    // Days since last review
  scheduledDays?: number;  // Scheduled interval in days
  reps?: number;           // Total repetitions
  lapses?: number;         // Lapses count
  state?: number;          // FSRS state: 0=New, 1=Learning, 2=Review, 3=Relearning
  lastReview?: number;     // Timestamp (ms) of the last review
  
  // CRDT Sync Metadata
  updatedAt: number;       // The timestamp of the last write/update
  isDeleted?: boolean;     // Tombstone for P2P/D1 synchronization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: any;          // Optional user settings (stored under questionId: -999)
}

export interface ReviewLog {
  id?: number;            // Auto-increment primary key
  questionId: number;     // Reference to question
  rating: number;         // 1=Again, 2=Hard, 3=Good, 4=Easy
  state: number;          // State before review (0=New, 1=Learning, 2=Review, 3=Relearning)
  reviewTime: number;     // Timestamp in ms
  timeTaken: number;      // Duration in seconds
  stability: number;      // Card stability at review time
  difficulty: number;     // Card difficulty at review time
}

export interface LocalUserStats {
  month: string;          // "YYYY-MM" (primary key)
  dopa: number;           // Monthly Dopa
  lifetimeDopa: number;   // Lifetime Dopa
  streakDays: number;     // Daily streak
  lastActiveDate: string; // YYYY-MM-DD
  updatedAt: number;      // Last updated timestamp for sync
}

export interface CachedImage {
  url: string;
  blob: Blob;
  cachedAt: number;
}

export class OpenMedQDatabase extends Dexie {
  questions!: Table<LocalQuestion>;
  progress!: Table<LocalProgress>;
  reviewLogs!: Table<ReviewLog>;
  userStats!: Table<LocalUserStats>;
  cachedImages!: Table<CachedImage>;

  constructor() {
    super('OpenMedQDatabase');
    this.version(1).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt',
    });
    this.version(2).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due',
    });
    this.version(3).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due',
    }).upgrade(async tx => {
      await tx.table('questions').where('id').equals(0).delete();
    });
    this.version(4).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due, updatedAt',
    }).upgrade(async tx => {
      // Backfill missing updatedAt timestamps with answeredAt or now
      await tx.table('progress').toCollection().modify(progress => {
        if (!progress.updatedAt) {
          progress.updatedAt = progress.answeredAt || Date.now();
        }
      });
    });
    this.version(5).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due, updatedAt',
      reviewLogs: '++id, questionId, reviewTime, rating',
    });
    this.version(6).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due, updatedAt',
      reviewLogs: '++id, questionId, reviewTime, rating',
      userStats: 'month, updatedAt',
    });
    this.version(7).stores({
      questions: 'id, subjectId, topicId, examType',
      progress: 'questionId, status, answeredAt, due, updatedAt',
      reviewLogs: '++id, questionId, reviewTime, rating',
      userStats: 'month, updatedAt',
      cachedImages: 'url',
    });
  }
}

export const db = new OpenMedQDatabase();

function shuffleArray<T>(arr: T[]): T[] {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = newArr[i];
    newArr[i] = newArr[j];
    newArr[j] = temp;
  }
  return newArr;
}

export async function getRandomQuestionsFiltered({
  subjectIds,
  topicIds,
  status,
  limit,
  newCardsLimit,
  examType,
  examYear,
}: {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  limit: number;
  newCardsLimit?: number;
  examType?: string;
  examYear?: number;
}): Promise<LocalQuestion[]> {
  let qs: LocalQuestion[];
  if (examType) {
    qs = await db.questions.where('examType').equals(examType).toArray();
    if (examYear) {
      qs = qs.filter(q => q.examYear === examYear);
    }
  } else if (topicIds && topicIds.length > 0) {
    qs = await db.questions.where('topicId').anyOf(topicIds).toArray();
  } else if (subjectIds.length > 0) {
    qs = await db.questions.where('subjectId').anyOf(subjectIds).toArray();
  } else {
    qs = await db.questions.toArray();
  }

  const progressList = await db.progress.toArray();
  const progressMap = new Map<number, LocalProgress>();
  progressList.forEach(p => {
    if (!p.isDeleted) {
      progressMap.set(p.questionId, p);
    }
  });

  if (status === 'SPACED_REPETITION') {
    const now = Date.now();
    const dueCards: { q: LocalQuestion; due: number }[] = [];
    const newCards: LocalQuestion[] = [];

    qs.forEach(q => {
      const p = progressMap.get(q.id);
      if (!p || p.due === undefined) {
        newCards.push(q);
      } else if (p.due <= now) {
        dueCards.push({ q, due: p.due });
      }
    });

    // Sort due cards by due date ascending (most overdue first)
    dueCards.sort((a, b) => a.due - b.due);

    // Take the portion of due cards that will fit in the limit
    const activeDueCards = dueCards.slice(0, limit);
    // Shuffle the active due cards subset to break sequence context bias
    const shuffledDueQs = shuffleArray(activeDueCards.map(item => item.q));

    // Shuffle new cards to fill the queue
    const shuffledNew = shuffleArray(newCards);

    // Apply cap to new cards (default to 10 if unspecified)
    const maxNew = newCardsLimit !== undefined ? newCardsLimit : 10;
    const remainingSlots = Math.max(0, limit - shuffledDueQs.length);
    const selectedNew = shuffledNew.slice(0, Math.min(maxNew, remainingSlots));

    const combined = [...shuffledDueQs, ...selectedNew];
    return combined.slice(0, limit);
  }

  const filtered = qs.filter(q => {
    const p = progressMap.get(q.id);
    if (status === 'UNATTEMPTED') {
      return !p || (p.status !== 'CORRECT' && p.status !== 'INCORRECT');
    }
    if (status === 'LEECHES') {
      if (!p) return false;
      const difficulty = p.difficulty ?? 0;
      const lapses = p.lapses ?? 0;
      return (lapses >= 3 && difficulty >= 7.0) || (p.status === 'INCORRECT' && difficulty >= 7.5);
    }
    const qStatus = p?.status;
    if (status === 'INCORRECT') {
      return qStatus === 'INCORRECT';
    }
    if (status === 'CORRECT') {
      return qStatus === 'CORRECT';
    }
    if (status === 'BOOKMARKED') {
      return qStatus === 'BOOKMARKED';
    }
    return true;
  });

  // Shuffle
  const shuffled = shuffleArray(filtered);
  return shuffled.slice(0, limit);
}

export async function getFilteredQuestionsCount({
  subjectIds,
  topicIds,
  status,
  examType,
  examYear,
}: {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  examType?: string;
  examYear?: number;
}): Promise<number> {
  let qs: LocalQuestion[];
  if (examType) {
    qs = await db.questions.where('examType').equals(examType).toArray();
    if (examYear) {
      qs = qs.filter(q => q.examYear === examYear);
    }
  } else if (topicIds && topicIds.length > 0) {
    qs = await db.questions.where('topicId').anyOf(topicIds).toArray();
  } else if (subjectIds.length > 0) {
    qs = await db.questions.where('subjectId').anyOf(subjectIds).toArray();
  } else {
    qs = await db.questions.toArray();
  }

  const progressList = await db.progress.toArray();
  const progressMap = new Map<number, LocalProgress>();
  progressList.forEach(p => {
    if (!p.isDeleted) {
      progressMap.set(p.questionId, p);
    }
  });

  let count = 0;
  qs.forEach(q => {
    const p = progressMap.get(q.id);
    const qStatus = p?.status;
    let match = false;
    if (status === 'UNATTEMPTED') {
      match = qStatus !== 'CORRECT' && qStatus !== 'INCORRECT';
    } else if (status === 'LEECHES') {
      if (p) {
        const difficulty = p.difficulty ?? 0;
        const lapses = p.lapses ?? 0;
        match = (lapses >= 3 && difficulty >= 7.0) || (p.status === 'INCORRECT' && difficulty >= 7.5);
      }
    } else if (status === 'INCORRECT') {
      match = qStatus === 'INCORRECT';
    } else if (status === 'CORRECT') {
      match = qStatus === 'CORRECT';
    } else if (status === 'BOOKMARKED') {
      match = qStatus === 'BOOKMARKED';
    } else if (status === 'SPACED_REPETITION') {
      const now = Date.now();
      match = !p || p.due === undefined || p.due <= now;
    } else {
      match = true;
    }
    if (match) count++;
  });

  return count;
}

export async function getSpacedRepetitionCounts({
  subjectIds,
  topicIds,
}: {
  subjectIds: number[];
  topicIds?: number[];
}): Promise<{ due: number; new: number }> {
  let qs: LocalQuestion[];
  if (topicIds && topicIds.length > 0) {
    qs = await db.questions.where('topicId').anyOf(topicIds).toArray();
  } else if (subjectIds.length > 0) {
    qs = await db.questions.where('subjectId').anyOf(subjectIds).toArray();
  } else {
    qs = await db.questions.toArray();
  }

  const progressList = await db.progress.toArray();
  const progressMap = new Map<number, LocalProgress>();
  progressList.forEach(p => {
    if (!p.isDeleted) {
      progressMap.set(p.questionId, p);
    }
  });

  let due = 0;
  let newCards = 0;
  const now = Date.now();

  qs.forEach(q => {
    const p = progressMap.get(q.id);
    if (!p || p.due === undefined) {
      newCards++;
    } else if (p.due <= now) {
      due++;
    }
  });

  return { due, new: newCards };
}


