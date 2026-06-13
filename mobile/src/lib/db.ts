import * as SQLite from 'expo-sqlite';
import { subjectsList, NEET_PG_PYQ_SUBJECT } from '@openmedq/shared';

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
  due?: number;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  lastReview?: number;
  updatedAt: number;
  isDeleted?: boolean;
  settings?: any;
}

export interface ReviewLog {
  id?: number;
  questionId: number;
  rating: number;
  state: number;
  reviewTime: number;
  timeTaken: number;
  stability: number;
  difficulty: number;
}

export interface LocalUserStats {
  month: string;
  dopa: number;
  lifetimeDopa: number;
  streakDays: number;
  lastActiveDate: string;
  updatedAt: number;
}

export interface LeechDetail {
  questionId: number;
  questionText: string;
  lapses: number;
  difficulty: number;
  subjectId: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('openmedq.db');
  }
  return dbInstance;
}

export async function initDatabase() {
  const db = await getDB();
  
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  
  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY NOT NULL,
      subjectId INTEGER NOT NULL,
      topicId INTEGER NOT NULL,
      examType TEXT,
      examYear INTEGER,
      questionText TEXT NOT NULL,
      opa TEXT NOT NULL,
      opb TEXT NOT NULL,
      opc TEXT NOT NULL,
      opd TEXT NOT NULL,
      correctOption INTEGER NOT NULL,
      explanation TEXT,
      imageUrl TEXT,
      explanationImageUrl TEXT,
      opaImageUrl TEXT,
      opbImageUrl TEXT,
      opcImageUrl TEXT,
      opdImageUrl TEXT
    );
    
    CREATE TABLE IF NOT EXISTS progress (
      questionId INTEGER PRIMARY KEY NOT NULL,
      status TEXT NOT NULL,
      answeredAt INTEGER NOT NULL,
      due INTEGER,
      stability REAL,
      difficulty REAL,
      elapsedDays REAL,
      scheduledDays REAL,
      reps INTEGER,
      lapses INTEGER,
      state INTEGER,
      lastReview INTEGER,
      updatedAt INTEGER NOT NULL,
      isDeleted INTEGER DEFAULT 0,
      settings TEXT,
      previousStatus TEXT
    );
    
    CREATE TABLE IF NOT EXISTS reviewLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      questionId INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      state INTEGER NOT NULL,
      reviewTime INTEGER NOT NULL,
      timeTaken INTEGER NOT NULL,
      stability REAL NOT NULL,
      difficulty REAL NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS userStats (
      month TEXT PRIMARY KEY NOT NULL,
      dopa INTEGER NOT NULL DEFAULT 0,
      lifetimeDopa INTEGER NOT NULL DEFAULT 0,
      streakDays INTEGER NOT NULL DEFAULT 0,
      lastActiveDate TEXT,
      updatedAt INTEGER NOT NULL
    );
  `);
  
  // Add index on reviewLogs.reviewTime for optimizer query performance
  try {
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_reviewLogs_reviewTime ON reviewLogs(reviewTime);');
  } catch (err) {
    // Index may already exist
  }
  
  // Add indices to optimize local question querying and spaced repetition
  try {
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_questions_subjectId ON questions(subjectId);');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_questions_topicId ON questions(topicId);');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(examType, examYear);');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_progress_due ON progress(due);');
  } catch (err) {
    console.warn('Failed to create SQLite indices:', err);
  }
  
  // Migration for previousStatus column
  try {
    await db.execAsync('ALTER TABLE progress ADD COLUMN previousStatus TEXT;');
    console.log('Successfully added previousStatus column to progress table');
  } catch (err) {
    // Column already exists or table was just created with previousStatus
  }

  // Migration for image columns in questions table
  const columns = [
    'imageUrl',
    'explanationImageUrl',
    'opaImageUrl',
    'opbImageUrl',
    'opcImageUrl',
    'opdImageUrl'
  ];
  for (const col of columns) {
    try {
      await db.execAsync(`ALTER TABLE questions ADD COLUMN ${col} TEXT;`);
      console.log(`Successfully added ${col} column to questions table`);
    } catch (err) {
      // Column already exists or table was just created with the column
    }
  }

  console.log('SQLite database tables initialized successfully');
}

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
  examYears,
}: {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  limit: number;
  newCardsLimit?: number;
  examType?: string;
  examYear?: number;
  examYears?: number[];
}): Promise<LocalQuestion[]> {
  const db = await getDB();
  
  // 1. Fetch questions matching filters (id, subjectId, topicId only)
  let qsQuery = 'SELECT id, subjectId, topicId FROM questions';
  const params: any[] = [];
  const whereClauses: string[] = [];
  
  const hasStandardSubjects = subjectIds.some(id => id !== NEET_PG_PYQ_SUBJECT.id);
  const hasPYQ = subjectIds.includes(NEET_PG_PYQ_SUBJECT.id) || examType === 'NEET PG';

  if (examType && !subjectIds.includes(NEET_PG_PYQ_SUBJECT.id)) {
    // direct legacy mode
    whereClauses.push('examType = ?');
    params.push(examType);
    if (examYears && examYears.length > 0) {
      const placeholders = examYears.map(() => '?').join(',');
      whereClauses.push(`examYear IN (${placeholders})`);
      params.push(...examYears);
    } else if (examYear) {
      whereClauses.push('examYear = ?');
      params.push(examYear);
    }

    if (topicIds && topicIds.length > 0) {
      const placeholders = topicIds.map(() => '?').join(',');
      whereClauses.push(`topicId IN (${placeholders})`);
      params.push(...topicIds);
    } else if (subjectIds && subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      whereClauses.push(`subjectId IN (${placeholders})`);
      params.push(...subjectIds);
    }
  } else {
    if (subjectIds.length === 0) {
      // no subject filter
    } else if (hasPYQ) {
      const selectedYears = topicIds ? topicIds.filter(id => id < 0).map(id => -id) : [];
      const effectiveYears = selectedYears.length > 0 ? selectedYears : (examYears && examYears.length > 0 ? examYears : (examYear ? [examYear] : [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]));

      whereClauses.push("examType = 'NEET PG'");
      
      const yearPlaceholders = effectiveYears.map(() => '?').join(',');
      whereClauses.push(`examYear IN (${yearPlaceholders})`);
      params.push(...effectiveYears);

      if (hasStandardSubjects) {
        const standardSubjectIds = subjectIds.filter(id => id !== NEET_PG_PYQ_SUBJECT.id);
        const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];

        if (standardTopicIds.length > 0) {
          const placeholders = standardTopicIds.map(() => '?').join(',');
          whereClauses.push(`topicId IN (${placeholders})`);
          params.push(...standardTopicIds);
        } else {
          const placeholders = standardSubjectIds.map(() => '?').join(',');
          whereClauses.push(`subjectId IN (${placeholders})`);
          params.push(...standardSubjectIds);
        }
      }
    } else {
      // Standard QBank path
      const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];
      if (standardTopicIds.length > 0) {
        const placeholders = standardTopicIds.map(() => '?').join(',');
        whereClauses.push(`topicId IN (${placeholders})`);
        params.push(...standardTopicIds);
      } else {
        const placeholders = subjectIds.map(() => '?').join(',');
        whereClauses.push(`subjectId IN (${placeholders})`);
        params.push(...subjectIds);
      }
    }
  }

  if (whereClauses.length > 0) {
    qsQuery += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  const questionsMeta = await db.getAllAsync<{ id: number; subjectId: number; topicId: number }>(qsQuery, params);
  
  // 2. Fetch progress
  const progressList = await db.getAllAsync<any>('SELECT * FROM progress');
  const progressMap = new Map<number, LocalProgress>();
  progressList.forEach(p => {
    if (p.isDeleted !== 1) {
      let parsedSettings: any = undefined;
      if (p.settings) {
        try {
          parsedSettings = JSON.parse(p.settings);
        } catch {}
      }
      progressMap.set(p.questionId, {
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
        settings: parsedSettings,
      });
    }
  });
  
  let targetIds: number[] = [];
  
  if (status === 'SPACED_REPETITION') {
    const now = Date.now();
    const dueCards: { id: number; due: number }[] = [];
    const newCards: number[] = [];
    
    questionsMeta.forEach(q => {
      const p = progressMap.get(q.id);
      if (!p || p.due === undefined) {
        newCards.push(q.id);
      } else if (p.due <= now) {
        dueCards.push({ id: q.id, due: p.due });
      }
    });
    
    // Sort due cards by due date ascending (most overdue first)
    dueCards.sort((a, b) => a.due - b.due);
    
    // Take portion of due cards that will fit in the limit
    const activeDueCards = dueCards.slice(0, limit);
    // Shuffle active due subset
    const shuffledDueIds = shuffleArray(activeDueCards.map(item => item.id));
    
    // Shuffle new cards to fill queue
    const shuffledNew = shuffleArray(newCards);
    
    const maxNew = newCardsLimit !== undefined ? newCardsLimit : 10;
    const remainingSlots = Math.max(0, limit - shuffledDueIds.length);
    const selectedNew = shuffledNew.slice(0, Math.min(maxNew, remainingSlots));
    
    targetIds = [...shuffledDueIds, ...selectedNew].slice(0, limit);
  } else {
    const filtered = questionsMeta.filter(q => {
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
    
    // Shuffle & slice
    const shuffled = shuffleArray(filtered.map(q => q.id));
    targetIds = shuffled.slice(0, limit);
  }
  
  if (targetIds.length === 0) return [];
  
  // 3. Query full questions for target IDs
  const idPlaceholders = targetIds.map(() => '?').join(',');
  const fullQs = await db.getAllAsync<any>(
    `SELECT * FROM questions WHERE id IN (${idPlaceholders})`,
    targetIds
  );
  
  // Sort fullQs in the order of targetIds to preserve the custom FSRS ordering/shuffling
  const qsMap = new Map<number, LocalQuestion>();
  fullQs.forEach(q => {
    qsMap.set(q.id, {
      id: q.id,
      questionText: q.questionText,
      opa: q.opa,
      opb: q.opb,
      opc: q.opc,
      opd: q.opd,
      correctOption: q.correctOption,
      subjectId: q.subjectId,
      topicId: q.topicId,
      examType: q.examType || undefined,
      examYear: q.examYear || undefined,
      explanation: q.explanation || undefined,
      imageUrl: q.imageUrl || undefined,
      explanationImageUrl: q.explanationImageUrl || undefined,
      opaImageUrl: q.opaImageUrl || undefined,
      opbImageUrl: q.opbImageUrl || undefined,
      opcImageUrl: q.opcImageUrl || undefined,
      opdImageUrl: q.opdImageUrl || undefined,
    });
  });
  
  return targetIds.map(id => qsMap.get(id)).filter(q => q !== undefined) as LocalQuestion[];
}

export async function getFilteredQuestionsCount({
  subjectIds,
  topicIds,
  status,
  examType,
  examYear,
  examYears,
}: {
  subjectIds: number[];
  topicIds?: number[];
  status: 'ALL' | 'UNATTEMPTED' | 'INCORRECT' | 'CORRECT' | 'BOOKMARKED' | 'SPACED_REPETITION' | 'LEECHES';
  examType?: string;
  examYear?: number;
  examYears?: number[];
}): Promise<number> {
  const db = await getDB();
  
  // 1. Fetch questions matching filters (id, subjectId, topicId only)
  let qsQuery = 'SELECT id FROM questions';
  const params: any[] = [];
  const whereClauses: string[] = [];
  
  const hasStandardSubjects = subjectIds.some(id => id !== NEET_PG_PYQ_SUBJECT.id);
  const hasPYQ = subjectIds.includes(NEET_PG_PYQ_SUBJECT.id) || examType === 'NEET PG';

  if (examType && !subjectIds.includes(NEET_PG_PYQ_SUBJECT.id)) {
    // direct legacy mode
    whereClauses.push('examType = ?');
    params.push(examType);
    if (examYears && examYears.length > 0) {
      const placeholders = examYears.map(() => '?').join(',');
      whereClauses.push(`examYear IN (${placeholders})`);
      params.push(...examYears);
    } else if (examYear) {
      whereClauses.push('examYear = ?');
      params.push(examYear);
    }

    if (topicIds && topicIds.length > 0) {
      const placeholders = topicIds.map(() => '?').join(',');
      whereClauses.push(`topicId IN (${placeholders})`);
      params.push(...topicIds);
    } else if (subjectIds && subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      whereClauses.push(`subjectId IN (${placeholders})`);
      params.push(...subjectIds);
    }
  } else {
    if (subjectIds.length === 0) {
      // no subject filter
    } else if (hasPYQ) {
      const selectedYears = topicIds ? topicIds.filter(id => id < 0).map(id => -id) : [];
      const effectiveYears = selectedYears.length > 0 ? selectedYears : (examYears && examYears.length > 0 ? examYears : (examYear ? [examYear] : [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]));

      whereClauses.push("examType = 'NEET PG'");
      
      const yearPlaceholders = effectiveYears.map(() => '?').join(',');
      whereClauses.push(`examYear IN (${yearPlaceholders})`);
      params.push(...effectiveYears);

      if (hasStandardSubjects) {
        const standardSubjectIds = subjectIds.filter(id => id !== NEET_PG_PYQ_SUBJECT.id);
        const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];

        if (standardTopicIds.length > 0) {
          const placeholders = standardTopicIds.map(() => '?').join(',');
          whereClauses.push(`topicId IN (${placeholders})`);
          params.push(...standardTopicIds);
        } else {
          const placeholders = standardSubjectIds.map(() => '?').join(',');
          whereClauses.push(`subjectId IN (${placeholders})`);
          params.push(...standardSubjectIds);
        }
      }
    } else {
      // Standard QBank path
      const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];
      if (standardTopicIds.length > 0) {
        const placeholders = standardTopicIds.map(() => '?').join(',');
        whereClauses.push(`topicId IN (${placeholders})`);
        params.push(...standardTopicIds);
      } else {
        const placeholders = subjectIds.map(() => '?').join(',');
        whereClauses.push(`subjectId IN (${placeholders})`);
        params.push(...subjectIds);
      }
    }
  }

  if (whereClauses.length > 0) {
    qsQuery += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  const questionsMeta = await db.getAllAsync<{ id: number }>(qsQuery, params);
  
  // 2. Fetch progress
  const progressList = await db.getAllAsync<any>('SELECT questionId, status, due, stability, difficulty, lapses, isDeleted, previousStatus FROM progress');
  const progressMap = new Map<number, any>();
  progressList.forEach(p => {
    if (p.isDeleted !== 1) {
      progressMap.set(p.questionId, p);
    }
  });
  
  let count = 0;
  const now = Date.now();
  
  questionsMeta.forEach(q => {
    const p = progressMap.get(q.id);
    const qStatus = p?.status;
    let match = false;
    
    if (status === 'UNATTEMPTED') {
      match = qStatus !== 'CORRECT' && qStatus !== 'INCORRECT';
    } else if (status === 'LEECHES') {
      if (p) {
        const difficulty = p.difficulty ?? 0;
        const lapses = p.lapses ?? 0;
        match = (lapses >= 3 && difficulty >= 7.0) || (qStatus === 'INCORRECT' && difficulty >= 7.5);
      }
    } else if (status === 'INCORRECT') {
      match = qStatus === 'INCORRECT';
    } else if (status === 'CORRECT') {
      match = qStatus === 'CORRECT';
    } else if (status === 'BOOKMARKED') {
      match = qStatus === 'BOOKMARKED';
    } else if (status === 'SPACED_REPETITION') {
      match = !p || p.due === null || p.due === undefined || p.due <= now;
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
  examType,
  examYears,
}: {
  subjectIds: number[];
  topicIds?: number[];
  examType?: string;
  examYears?: number[];
}): Promise<{ due: number; new: number }> {
  const db = await getDB();
  const now = Date.now();

  if (subjectIds.length === 0 && (!topicIds || topicIds.length === 0)) {
    // Return global FSRS due counts from progress table directly
    const dueRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM progress WHERE due <= ? AND isDeleted = 0 AND questionId != -999',
      [now]
    );
    
    // For new cards globally, count total MBBS questions (9500) minus all active progress records
    const attemptedRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM progress WHERE isDeleted = 0 AND questionId != -999"
    );
    const attemptedCount = attemptedRow?.count || 0;
    const totalQuestions = subjectsList.reduce((sum, s) => sum + s.count, 0);
    const newCards = Math.max(0, totalQuestions - attemptedCount);
    
    return { due: dueRow?.count || 0, new: newCards };
  }
  
  let qsQuery = 'SELECT id FROM questions';
  const params: any[] = [];
  const whereClauses: string[] = [];
  
  const hasStandardSubjects = subjectIds.some(id => id !== NEET_PG_PYQ_SUBJECT.id);
  const hasPYQ = subjectIds.includes(NEET_PG_PYQ_SUBJECT.id) || examType === 'NEET PG';

  if (examType && !subjectIds.includes(NEET_PG_PYQ_SUBJECT.id)) {
    // direct legacy mode
    whereClauses.push('examType = ?');
    params.push(examType);
    if (examYears && examYears.length > 0) {
      const placeholders = examYears.map(() => '?').join(',');
      whereClauses.push(`examYear IN (${placeholders})`);
      params.push(...examYears);
    }

    if (topicIds && topicIds.length > 0) {
      const placeholders = topicIds.map(() => '?').join(',');
      whereClauses.push(`topicId IN (${placeholders})`);
      params.push(...topicIds);
    } else if (subjectIds && subjectIds.length > 0) {
      const placeholders = subjectIds.map(() => '?').join(',');
      whereClauses.push(`subjectId IN (${placeholders})`);
      params.push(...subjectIds);
    }
  } else {
    if (subjectIds.length > 0) {
      if (hasPYQ) {
        const selectedYears = topicIds ? topicIds.filter(id => id < 0).map(id => -id) : [];
        const effectiveYears = selectedYears.length > 0 ? selectedYears : (examYears && examYears.length > 0 ? examYears : [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]);

        whereClauses.push("examType = 'NEET PG'");
        
        const yearPlaceholders = effectiveYears.map(() => '?').join(',');
        whereClauses.push(`examYear IN (${yearPlaceholders})`);
        params.push(...effectiveYears);

        if (hasStandardSubjects) {
          const standardSubjectIds = subjectIds.filter(id => id !== NEET_PG_PYQ_SUBJECT.id);
          const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];

          if (standardTopicIds.length > 0) {
            const placeholders = standardTopicIds.map(() => '?').join(',');
            whereClauses.push(`topicId IN (${placeholders})`);
            params.push(...standardTopicIds);
          } else {
            const placeholders = standardSubjectIds.map(() => '?').join(',');
            whereClauses.push(`subjectId IN (${placeholders})`);
            params.push(...standardSubjectIds);
          }
        }
      } else {
        const standardTopicIds = topicIds ? topicIds.filter(id => id > 0) : [];
        if (standardTopicIds.length > 0) {
          const placeholders = standardTopicIds.map(() => '?').join(',');
          whereClauses.push(`topicId IN (${placeholders})`);
          params.push(...standardTopicIds);
        } else {
          const placeholders = subjectIds.map(() => '?').join(',');
          whereClauses.push(`subjectId IN (${placeholders})`);
          params.push(...subjectIds);
        }
      }
    }
  }

  if (whereClauses.length > 0) {
    qsQuery += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  const questionsMeta = await db.getAllAsync<{ id: number }>(qsQuery, params);
  
  const progressList = await db.getAllAsync<any>('SELECT questionId, due, isDeleted FROM progress WHERE isDeleted = 0');
  const progressMap = new Map<number, any>();
  progressList.forEach(p => {
    progressMap.set(p.questionId, p);
  });
  
  let due = 0;
  let newCards = 0;
  
  questionsMeta.forEach(q => {
    const p = progressMap.get(q.id);
    if (!p || p.due === null || p.due === undefined) {
      newCards++;
    } else if (p.due <= now) {
      due++;
    }
  });
  
  return { due, new: newCards };
}

export async function saveProgressRecord(p: LocalProgress) {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO progress (
      questionId, status, answeredAt, due, stability, difficulty, 
      elapsedDays, scheduledDays, reps, lapses, state, lastReview, updatedAt, isDeleted, settings, previousStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(questionId) DO UPDATE SET
      status=excluded.status,
      answeredAt=excluded.answeredAt,
      due=excluded.due,
      stability=excluded.stability,
      difficulty=excluded.difficulty,
      elapsedDays=excluded.elapsedDays,
      scheduledDays=excluded.scheduledDays,
      reps=excluded.reps,
      lapses=excluded.lapses,
      state=excluded.state,
      lastReview=excluded.lastReview,
      updatedAt=excluded.updatedAt,
      isDeleted=excluded.isDeleted,
      settings=excluded.settings,
      previousStatus=excluded.previousStatus`,
    [
      p.questionId,
      p.status,
      p.answeredAt,
      p.due ?? null,
      p.stability ?? null,
      p.difficulty ?? null,
      p.elapsedDays ?? null,
      p.scheduledDays ?? null,
      p.reps ?? null,
      p.lapses ?? null,
      p.state ?? null,
      p.lastReview ?? null,
      p.updatedAt,
      p.isDeleted ? 1 : 0,
      p.settings ? JSON.stringify(p.settings) : null,
      p.previousStatus ?? null,
    ]
  );
}

export async function saveReviewLog(log: ReviewLog) {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO reviewLogs (
      questionId, rating, state, reviewTime, timeTaken, stability, difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      log.questionId,
      log.rating,
      log.state,
      log.reviewTime,
      log.timeTaken,
      log.stability,
      log.difficulty,
    ]
  );
}

export async function getLocalUserStats(month: string): Promise<LocalUserStats | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM userStats WHERE month = ?',
    [month]
  );
  if (!row) return null;
  return {
    month: row.month,
    dopa: row.dopa,
    lifetimeDopa: row.lifetimeDopa,
    streakDays: row.streakDays,
    lastActiveDate: row.lastActiveDate,
    updatedAt: row.updatedAt,
  };
}

export async function saveLocalUserStats(stats: LocalUserStats) {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO userStats (month, dopa, lifetimeDopa, streakDays, lastActiveDate, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       dopa=excluded.dopa,
       lifetimeDopa=excluded.lifetimeDopa,
       streakDays=excluded.streakDays,
       lastActiveDate=excluded.lastActiveDate,
       updatedAt=excluded.updatedAt`,
    [
      stats.month,
      stats.dopa,
      stats.lifetimeDopa,
      stats.streakDays,
      stats.lastActiveDate,
      stats.updatedAt,
    ]
  );
}

export async function getActiveLeechesDetails(limit: number = 3): Promise<LeechDetail[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(`
    SELECT p.questionId, p.lapses, p.difficulty, q.questionText, q.subjectId
    FROM progress p
    JOIN questions q ON p.questionId = q.id
    WHERE p.isDeleted = 0 
      AND ((p.lapses >= 3 AND p.difficulty >= 7.0) OR (p.status = 'INCORRECT' AND p.difficulty >= 7.5))
    ORDER BY p.difficulty DESC, p.lapses DESC
    LIMIT ?
  `, [limit]);

  return rows.map(r => ({
    questionId: r.questionId,
    questionText: r.questionText,
    lapses: r.lapses,
    difficulty: r.difficulty,
    subjectId: r.subjectId
  }));
}

export async function getSyllabusProgress(subjectId: number): Promise<{
  solvedProgress: Record<number, number>;
  cachedCounts: Record<number, number>;
}> {
  const db = await getDB();
  
  // 1. Get cached counts per topicId
  const cachedRows = await db.getAllAsync<{ topicId: number; count: number }>(
    'SELECT topicId, COUNT(id) as count FROM questions WHERE subjectId = ? GROUP BY topicId',
    [subjectId]
  );
  const cachedCounts: Record<number, number> = {};
  cachedRows.forEach(r => {
    cachedCounts[r.topicId] = r.count;
  });

  // 2. Get solved progress per topicId
  const solvedRows = await db.getAllAsync<{ topicId: number; count: number }>(
    `SELECT q.topicId, COUNT(p.questionId) as count
     FROM progress p
     JOIN questions q ON p.questionId = q.id
     WHERE q.subjectId = ? AND p.status IN ('CORRECT', 'INCORRECT') AND p.isDeleted = 0
     GROUP BY q.topicId`,
    [subjectId]
  );
  const solvedProgress: Record<number, number> = {};
  solvedRows.forEach(r => {
    solvedProgress[r.topicId] = r.count;
  });

  return { solvedProgress, cachedCounts };
}

export async function getQuestionsSolvedToday(): Promise<number> {
  const db = await getDB();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startTimestamp = startOfToday.getTime();
  
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(questionId) as count 
     FROM progress 
     WHERE answeredAt >= ? AND status IN ('CORRECT', 'INCORRECT') AND isDeleted = 0 AND questionId != -999`,
    [startTimestamp]
  );
  return row ? row.count : 0;
}

export async function saveProgressRecordsBatch(sqlite: SQLite.SQLiteDatabase, progressList: LocalProgress[]) {
  const stmt = await sqlite.prepareAsync(
    `INSERT INTO progress (
      questionId, status, answeredAt, due, stability, difficulty, 
      elapsedDays, scheduledDays, reps, lapses, state, lastReview, updatedAt, isDeleted, settings, previousStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(questionId) DO UPDATE SET
      status=excluded.status,
      answeredAt=excluded.answeredAt,
      due=excluded.due,
      stability=excluded.stability,
      difficulty=excluded.difficulty,
      elapsedDays=excluded.elapsedDays,
      scheduledDays=excluded.scheduledDays,
      reps=excluded.reps,
      lapses=excluded.lapses,
      state=excluded.state,
      lastReview=excluded.lastReview,
      updatedAt=excluded.updatedAt,
      isDeleted=excluded.isDeleted,
      settings=excluded.settings,
      previousStatus=excluded.previousStatus`
  );
  try {
    for (const p of progressList) {
      await stmt.executeAsync([
        p.questionId,
        p.status,
        p.answeredAt,
        p.due ?? null,
        p.stability ?? null,
        p.difficulty ?? null,
        p.elapsedDays ?? null,
        p.scheduledDays ?? null,
        p.reps ?? null,
        p.lapses ?? null,
        p.state ?? null,
        p.lastReview ?? null,
        p.updatedAt,
        p.isDeleted ? 1 : 0,
        p.settings ? JSON.stringify(p.settings) : null,
        p.previousStatus ?? null,
      ]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function saveReviewLogsBatch(sqlite: SQLite.SQLiteDatabase, logsList: ReviewLog[]) {
  const stmt = await sqlite.prepareAsync(
    `INSERT INTO reviewLogs (
      questionId, rating, state, reviewTime, timeTaken, stability, difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    for (const log of logsList) {
      await stmt.executeAsync([
        log.questionId,
        log.rating,
        log.state,
        log.reviewTime,
        log.timeTaken,
        log.stability,
        log.difficulty,
      ]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function saveLocalUserStatsBatch(sqlite: SQLite.SQLiteDatabase, statsList: LocalUserStats[]) {
  const stmt = await sqlite.prepareAsync(
    `INSERT INTO userStats (month, dopa, lifetimeDopa, streakDays, lastActiveDate, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       dopa=excluded.dopa,
       lifetimeDopa=excluded.lifetimeDopa,
       streakDays=excluded.streakDays,
       lastActiveDate=excluded.lastActiveDate,
       updatedAt=excluded.updatedAt`
  );
  try {
    for (const stats of statsList) {
      await stmt.executeAsync([
        stats.month,
        stats.dopa,
        stats.lifetimeDopa,
        stats.streakDays,
        stats.lastActiveDate,
        stats.updatedAt,
      ]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}


