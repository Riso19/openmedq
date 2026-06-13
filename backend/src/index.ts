import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@clerk/hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, sql, asc, or, gt, lt } from 'drizzle-orm';
import * as schema from './db/schema';
import { cache } from 'hono/cache';
import { z } from 'zod';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  CDN_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Simple in-memory rate limiter per Worker instance (sliding window with lazy cleanup)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
let lastCleanupTime = 0;

const rateLimiter = (limit: number, windowMs: number) => {
  return async (c: any, next: any) => {
    const now = Date.now();

    // Lazy cleanup to prevent memory growth, throttled to at most once per 10s to conserve CPU
    if (rateLimitMap.size > 1000 && now - lastCleanupTime > 10000) {
      lastCleanupTime = now;
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) {
          rateLimitMap.delete(k);
        }
      }
      // If the map is still excessively large (e.g. under a distributed attack), clear all to protect worker memory
      if (rateLimitMap.size > 2000) {
        rateLimitMap.clear();
      }
    }

    const ip = c.req.header('CF-Connecting-IP') || 'global';
    const clientLimit = rateLimitMap.get(ip);

    if (!clientLimit || now > clientLimit.resetTime) {
      rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
    } else {
      clientLimit.count++;
      if (clientLimit.count > limit) {
        c.header('Retry-After', Math.ceil((clientLimit.resetTime - now) / 1000).toString());
        return c.json({ success: false, error: 'Too many requests. Please try again later.' }, 429);
      }
    }
    await next();
  };
};

// Global in-memory cache for parsed R2 subject question packs
const subjectPackCache = new Map<number | string, any[]>();

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

const ALLOWED_ORIGINS = [
  'https://openmedq.com',
  'https://www.openmedq.com',
  'https://openmedq.pages.dev',
];

// Startup / Environment Bindings validation middleware
app.use('*', async (c, next) => {
  if (!c.env.CLERK_SECRET_KEY || !c.env.CLERK_PUBLISHABLE_KEY || !c.env.DB || !c.env.BUCKET) {
    console.error('Critical environment bindings are missing');
    return c.json({ success: false, error: 'Internal Configuration Error: Missing bindings' }, 500);
  }
  await next();
});

// Apply CORS middleware globally (must run before auth to handle OPTIONS preflights correctly)
app.use('*', async (c, next) => {
  const isDev = c.env.CLERK_PUBLISHABLE_KEY?.includes('_test_') || !c.env.CLERK_SECRET_KEY?.startsWith('sk_live');
  const corsHandler = cors({
    origin: (origin) => {
      if (!origin) return ALLOWED_ORIGINS[0];
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        /^https:\/\/[a-z0-9-]+\.openmedq\.pages\.dev$/i.test(origin) ||
        (isDev && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')))
      ) {
        return origin;
      }
      return ALLOWED_ORIGINS[0];
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  });
  return corsHandler(c, next);
});

// Apply Rate Limiting globally to all API routes (120 requests per minute)
app.use('/api/*', rateLimiter(120, 60 * 1000));

// Apply Clerk middleware globally
app.use('*', secureHeaders());
app.use('*', clerkMiddleware());

// Input validation schemas
const progressSyncSchema = z.object({
  incorrectIds: z.array(z.number()).optional(),
  bookmarkedIds: z.array(z.number()).optional(),
  progressData: z.string().optional(),
  gamification: z.object({
    streakDays: z.number().int().nonnegative().optional(),
    lastActiveDate: z.string().nullable().optional(),
    lifetimeDopa: z.number().int().nonnegative().optional(),
    monthlyDopaList: z.array(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      dopa: z.number().int().nonnegative(),
      updatedAt: z.number().int().nonnegative().optional()
    })).optional()
  }).optional(),
  profile: z.object({
    displayName: z.string().max(100).optional(),
    email: z.string().email().optional()
  }).optional()
});

const customPracticeSchema = z.object({
  subjectIds: z.array(z.union([z.number(), z.string()])).optional(),
  topicIds: z.array(z.union([z.number(), z.string()])).optional(),
  status: z.enum(['UNATTEMPTED', 'INCORRECT', 'CORRECT', 'BOOKMARKED', 'SPACED_REPETITION', 'LEECHES', 'ALL']).optional(),
  limit: z.number().int().positive().optional(),
  newCardsLimit: z.number().int().nonnegative().optional(),
  examType: z.string().optional(),
  examYear: z.number().int().optional(),
  examYears: z.array(z.number().int()).optional()
});

const questionPackQuerySchema = z.object({
  subjectId: z.string().regex(/^\d+$/).transform(Number),
  topicId: z.string().regex(/^\d+$/).transform(Number).optional(),
  examType: z.string().optional(),
  year: z.string().regex(/^\d+$/).transform(Number).optional(),
  isPYQ: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  limit: z.string().regex(/^\d+$/).optional().transform(val => val !== undefined ? Number(val) : undefined).pipe(z.number().default(50)).transform(val => Math.min(val, 100))
});

const subjectPackQuerySchema = z.object({
  subjectId: z.string().regex(/^\d+$/).transform(Number)
});

const leaderboardQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

// Central authorization middleware (Secure by Default / Default-Deny)
const PUBLIC_ROUTES = [
  '/',
  '/api/questions/pack',
  '/api/questions/subject-pack',
  '/api/leaderboard'
];

app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  // Whitelist exact matches or public assets prefixes
  const isPublic = PUBLIC_ROUTES.includes(path) || path.startsWith('/api/assets/');
  if (isPublic) {
    return next();
  }

  const auth = getAuth(c);
  if (!auth || !auth.userId) {
    return c.json({ success: false, error: 'Unauthorized: Authentication required' }, 401);
  }
  await next();
});

// Base Health Check
const routes = app.get('/', (c) => {
  return c.json({
    status: 'healthy',
    app: 'OpenMedQ Backend',
    platform: 'Cloudflare Workers',
  });
})

// API endpoint to fetch static question packs (fetched from R2 with in-memory filtering)
  .get('/api/questions/pack', cache({
  cacheName: 'openmedq-packs',
  cacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable',
}), async (c) => {
  const parsed = questionPackQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid query parameters', details: parsed.error.issues }, 400);
  }
  const { subjectId, topicId, examType, year, isPYQ, limit } = parsed.data;

  try {
    let packText = '';
    
    if (topicId) {
      const key = `packs/subject_${subjectId}_topic_${topicId}.json`;
      const object = await c.env.BUCKET.get(key);
      if (!object) {
        return c.json({ success: false, error: `Question pack for subject ${subjectId} topic ${topicId} not found` }, 404);
      }
      packText = await object.text();
    } else {
      // List packs for this subject
      const prefix = `packs/subject_${subjectId}_`;
      const listed = await c.env.BUCKET.list({ prefix });
      
      if (listed.objects.length === 0) {
        return c.json({ success: false, error: `No question packs found for subject ${subjectId}` }, 404);
      }

      // Select a pack at random
      const randomPack = listed.objects[Math.floor(Math.random() * listed.objects.length)];
      const object = await c.env.BUCKET.get(randomPack.key);
      if (!object) {
        return c.json({ success: false, error: 'Failed to retrieve selected question pack' }, 404);
      }
      packText = await object.text();
    }

    let questions = JSON.parse(packText);

    // Apply in-memory filters
    if (examType) {
      const examLower = examType.toLowerCase();
      questions = questions.filter((q: any) => q.examType?.toLowerCase() === examLower);
    }

    if (year) {
      questions = questions.filter((q: any) => q.examYear === year);
    }

    if (isPYQ) {
      questions = questions.filter((q: any) => q.examYear !== null && q.examYear !== undefined && !isNaN(q.examYear));
    }

    // Limit output
    const limitedQuestions = questions.slice(0, limit);

    // Map correctOption to 1-indexed for frontend compatibility (0=A => 1, 1=B => 2, 2=C => 3, 3=D => 4)
    const formattedQuestions = limitedQuestions.map((q: any) => ({
      ...q,
      correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption + 1
        : q.correctOption,
    }));

    c.header('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    return c.json({
      success: true,
      questions: formattedQuestions,
    });
  } catch (error: any) {
    console.error('Fetch pack error:', error);
    return c.json({ success: false, error: 'Failed to retrieve selected question pack' }, 500);
  }
})

// API endpoint to fetch complete subject question packs (fetched from R2 for bulk downloading)
  .get('/api/questions/subject-pack', cache({
  cacheName: 'openmedq-subject-packs',
  cacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable',
}), async (c) => {
  const parsed = subjectPackQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid query parameters', details: parsed.error.issues }, 400);
  }
  const { subjectId } = parsed.data;

  try {
    const key = `packs/subject_${subjectId}.json`;
    const object = await c.env.BUCKET.get(key);
    if (!object) {
      return c.json({ success: false, error: `Subject pack for subject ${subjectId} not found` }, 404);
    }

    const packText = await object.text();
    let questions = JSON.parse(packText);

    // Map correctOption to 1-indexed for frontend compatibility
    const formattedQuestions = questions.map((q: any) => ({
      ...q,
      correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption + 1
        : q.correctOption,
    }));

    c.header('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    return c.json({
      success: true,
      questions: formattedQuestions,
    });
  } catch (error: any) {
    console.error('Fetch subject pack error:', error);
    return c.json({ success: false, error: 'Failed to retrieve subject question pack' }, 500);
  }
})

// API endpoint to retrieve user progress state
  .get('/api/progress/sync', async (c) => {
  try {
    const auth = getAuth(c);
    const userId = auth!.userId!;
    const since = parseInt(c.req.query('since') || '0', 10);
    const db = drizzle(c.env.DB, { schema });

    const [userStateResult, userRecordResult, monthlyRecords] = await db.batch([
      db.select().from(schema.userState).where(eq(schema.userState.userId, userId)).limit(1),
      db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1),
      db.select().from(schema.userMonthlyDopa).where(eq(schema.userMonthlyDopa.userId, userId))
    ]);

    const userState = userStateResult[0];
    const userRecord = userRecordResult[0];

    const gamificationStats = {
      streakDays: userRecord?.streakDays ?? 0,
      lastActiveDate: userRecord?.lastActiveDate ?? '',
      lifetimeDopa: userRecord?.lifetimeDopa ?? 0,
      monthlyDopaList: monthlyRecords.map(m => ({
        month: m.month,
        dopa: m.dopa,
        updatedAt: m.updatedAt,
      })),
    };

    if (!userState) {
      return c.json({
        success: true,
        message: 'No progress found for user',
        data: {
          userId,
          modified: true,
          incorrectIds: [],
          bookmarkedIds: [],
          progressData: '[]',
          updatedAt: 0,
          gamification: gamificationStats,
        },
      });
    }

    // Check if userState is unmodified since client's last sync
    if (userState.updatedAt <= since) {
      return c.json({
        success: true,
        message: 'No new remote changes',
        data: {
          userId,
          modified: false,
          updatedAt: userState.updatedAt,
          gamification: gamificationStats,
        },
      });
    }

    let progressText = '[]';
    if (userState.progressData) {
      const bytes = new Uint8Array(userState.progressData as ArrayBuffer);
      if (bytes.length > 0) {
        let binary = '';
        const len = bytes.length;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        progressText = btoa(binary);
      }
    }

    let incorrectList: number[] = [];
    if (userState.incorrectIds) {
      try {
        incorrectList = JSON.parse(userState.incorrectIds);
      } catch (err) {}
    }

    let bookmarkedList: number[] = [];
    if (userState.bookmarkedIds) {
      try {
        bookmarkedList = JSON.parse(userState.bookmarkedIds);
      } catch (err) {}
    }

    return c.json({
      success: true,
      message: 'Progress state retrieved successfully',
      data: {
        userId,
        modified: true,
        incorrectIds: incorrectList,
        bookmarkedIds: bookmarkedList,
        progressData: progressText,
        updatedAt: userState.updatedAt,
        gamification: gamificationStats,
      },
    });
  } catch (error: any) {
    console.error('Progress get sync error:', error);
    return c.json({ success: false, error: 'Failed to synchronize progress data. Please try again.' }, 500);
  }
})

  .post('/api/progress/sync', async (c) => {
  try {
    const auth = getAuth(c);
    const userId = auth!.userId!;

    const body = await c.req.json();
    const parsed = progressSyncSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid progress sync request payload', details: parsed.error.issues }, 400);
    }
    const { incorrectIds, bookmarkedIds, progressData, gamification, profile } = parsed.data;

    const db = drizzle(c.env.DB, { schema });

    // Check if user exists in D1 users table
    const existingUserResult = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const existingUser = existingUserResult[0];

    let userQuery = null;
    if (!existingUser) {
      // Fetch details from Clerk using c.get('clerk')
      const clerkClient = c.get('clerk');
      let email = profile?.email || '';
      let displayName = profile?.displayName || '';
      
      if (!email || !displayName) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          if (!email) email = clerkUser.emailAddresses[0]?.emailAddress || '';
          if (!displayName) displayName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
        } catch (err) {
          console.warn('Failed to fetch user profile from Clerk:', err);
        }
      }

      if (!email) {
        email = `${userId}@openmedq.placeholder`;
      }
      if (!displayName) {
        displayName = 'Aspirant';
      }

      userQuery = db.insert(schema.users).values({
        id: userId,
        email,
        displayName,
        createdAt: Date.now(),
        streakDays: gamification?.streakDays ?? 0,
        lastActiveDate: gamification?.lastActiveDate || null,
        lifetimeDopa: gamification?.lifetimeDopa ?? 0,
      }).onConflictDoNothing();
    } else {
      // Update existing user profile & gamification stats
      const updates: any = {};
      if (gamification) {
        updates.streakDays = gamification.streakDays ?? 0;
        updates.lastActiveDate = gamification.lastActiveDate || null;
        updates.lifetimeDopa = sql`MAX(users.lifetime_dopa, ${gamification.lifetimeDopa ?? 0})`;
      }
      if (profile) {
        if (profile.displayName) updates.displayName = profile.displayName;
      }
      
      if (Object.keys(updates).length > 0) {
        userQuery = db.update(schema.users)
          .set(updates)
          .where(eq(schema.users.id, userId));
      }
    }

    // Upsert monthly Dopa entries
    const monthlyDopaQueries = [];
    if (gamification && Array.isArray(gamification.monthlyDopaList)) {
      for (const m of gamification.monthlyDopaList) {
        monthlyDopaQueries.push(
          db.insert(schema.userMonthlyDopa).values({
            userId,
            month: m.month,
            dopa: m.dopa,
            updatedAt: m.updatedAt || Date.now(),
          }).onConflictDoUpdate({
            target: [schema.userMonthlyDopa.userId, schema.userMonthlyDopa.month],
            set: {
              dopa: sql`MAX(excluded.dopa, user_monthly_dopa.dopa)`,
              updatedAt: sql`MAX(excluded.updated_at, user_monthly_dopa.updated_at)`,
            }
          })
        );
      }
    }

    // Decode Base64 string to Uint8Array for raw compressed binary SQLite storage
    let progressBlob: Uint8Array;
    if (progressData && progressData !== '[]') {
      const binaryString = atob(progressData);
      progressBlob = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        progressBlob[i] = binaryString.charCodeAt(i);
      }
    } else {
      progressBlob = new Uint8Array(0);
    }

    // Upsert user state into D1
    const userStateQuery = db.insert(schema.userState).values({
      userId,
      incorrectIds: JSON.stringify(incorrectIds || []),
      bookmarkedIds: JSON.stringify(bookmarkedIds || []),
      progressData: progressBlob,
      updatedAt: Date.now(),
    }).onConflictDoUpdate({
      target: schema.userState.userId,
      set: {
        incorrectIds: JSON.stringify(incorrectIds || []),
        bookmarkedIds: JSON.stringify(bookmarkedIds || []),
        progressData: progressBlob,
        updatedAt: Date.now(),
      }
    });

    // Run all write operations in a single atomic batch transaction
    const batchQueries = [];
    if (userQuery) batchQueries.push(userQuery);
    batchQueries.push(...monthlyDopaQueries);
    batchQueries.push(userStateQuery);

    if (batchQueries.length > 0) {
      await db.batch(batchQueries as any);
    }

    return c.json({
      success: true,
      message: 'Progress state synced successfully',
      data: {
        userId,
        incorrectCount: incorrectIds?.length || 0,
        bookmarkedCount: bookmarkedIds?.length || 0,
        progressBlobSize: progressData?.length || 0,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Progress sync error:', error);
    return c.json({ success: false, error: 'Failed to synchronize progress data. Please try again.' }, 500);
  }
})



// API endpoint for custom practice test questions (highly optimized in-memory R2 cache + D1 progress filtering)
  .post('/api/questions/custom-practice', async (c) => {
  try {
    const auth = getAuth(c);
    const userId = auth!.userId!;

    const body = await c.req.json();
    const parsed = customPracticeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid custom practice request payload', details: parsed.error.issues }, 400);
    }
    const { subjectIds, topicIds, status, limit, newCardsLimit, examYear, examYears } = parsed.data;

    let targetSubjectIds = subjectIds;
    if (!targetSubjectIds || !Array.isArray(targetSubjectIds) || targetSubjectIds.length === 0) {
      if (status === 'SPACED_REPETITION' || status === 'LEECHES' || status === 'ALL') {
        // Default to all standard subjects 1 to 19 if none specified
        targetSubjectIds = Array.from({ length: 19 }, (_, i) => i + 1);
      } else {
        return c.json({ success: false, error: 'subjectIds is required and must be a non-empty array' }, 400);
      }
    }

    const targetLimit = Number(limit) || 10;
    const db = drizzle(c.env.DB, { schema });

    // Retrieve user state from D1
    const userState = await db.query.userState.findFirst({
      where: eq(schema.userState.userId, userId),
    });

    let incorrectSet = new Set<number>();
    let bookmarkedSet = new Set<number>();
    let progressList: any[] = [];

    if (userState) {
      try {
        if (userState.incorrectIds) {
          const parsed = JSON.parse(userState.incorrectIds);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => incorrectSet.add(Number(id)));
          }
        }
        if (userState.bookmarkedIds) {
          const parsed = JSON.parse(userState.bookmarkedIds);
          if (Array.isArray(parsed)) {
            parsed.forEach(id => bookmarkedSet.add(Number(id)));
          }
        }
        if (userState.progressData) {
          try {
            const progressBlob = new Uint8Array(userState.progressData as ArrayBuffer);
            if (progressBlob.length > 0) {
              const decompressedStream = new Response(progressBlob as any).body?.pipeThrough(new DecompressionStream('gzip'));
              if (decompressedStream) {
                const progressJson = await new Response(decompressedStream).text();
                if (progressJson) {
                  const parsed = JSON.parse(progressJson);
                  let rawList: any[] = [];
                  if (Array.isArray(parsed)) {
                    rawList = parsed;
                  } else if (parsed && Array.isArray(parsed.progressList)) {
                    rawList = parsed.progressList;
                  }
                  progressList = rawList.filter((p: any) => !p.isDeleted);
                }
              }
            }
          } catch (err) {
            console.warn('Failed to decompress progressData in custom-practice:', err);
          }
        }
      } catch (err) {
        console.warn('Failed to parse synced user state:', err);
      }
    }

    // Load and filter questions from R2 or in-memory cache
    let allQuestions: any[] = [];
    const hasStandardSubjects = targetSubjectIds && targetSubjectIds.some(id => Number(id) !== 99);
    const hasPYQ = targetSubjectIds && targetSubjectIds.map(Number).includes(99);

    if (hasPYQ) {
      const selectedYears = examYears && examYears.length > 0 ? examYears : (examYear ? [examYear] : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
      for (const year of selectedYears) {
        const cacheKey = `neet_pg_${year}`;
        let yearQuestions = subjectPackCache.get(cacheKey);

        if (!yearQuestions) {
          const key = `packs/neet_pg_${year}.json`;
          let parsedPack = null;

          const cdnUrl = c.env.CDN_URL || 'https://assets.openmedq.com';
          try {
            const res = await fetch(`${cdnUrl}/${key}`);
            if (res.ok) {
              parsedPack = await res.json();
            }
          } catch (err) {
            console.warn(`CDN fetch failed for NEET PG pack ${year}, falling back to direct R2 binding:`, err);
          }

          if (!parsedPack) {
            const object = await c.env.BUCKET.get(key);
            if (object) {
              try {
                const text = await object.text();
                parsedPack = JSON.parse(text);
              } catch (err) {
                console.warn(`Failed to parse pack for NEET PG ${year}:`, err);
              }
            }
          }

          if (Array.isArray(parsedPack)) {
            yearQuestions = parsedPack;
            subjectPackCache.set(cacheKey, parsedPack);
          }
        }

        if (yearQuestions) {
          allQuestions = allQuestions.concat(yearQuestions);
        }
      }

      // Intersection with standard subjects/topics if selected
      if (hasStandardSubjects) {
        const standardSubjectIds = targetSubjectIds!.map(Number).filter(id => id !== 99);
        const standardTopicIds = topicIds ? topicIds.filter(id => Number(id) > 0).map(Number) : [];

        if (standardTopicIds.length > 0) {
          const topicSet = new Set(standardTopicIds);
          allQuestions = allQuestions.filter(q => q.topicId !== undefined && topicSet.has(Number(q.topicId)));
        } else {
          const subjectSet = new Set(standardSubjectIds);
          allQuestions = allQuestions.filter(q => q.subjectId !== undefined && subjectSet.has(Number(q.subjectId)));
        }
      }

      // Filter by negative topic IDs (years) if provided (in case we want to support topic-level year toggle)
      const selectedYearTopics = topicIds ? topicIds.filter(id => Number(id) < 0).map(id => -Number(id)) : [];
      if (selectedYearTopics.length > 0) {
        const yearSet = new Set(selectedYearTopics);
        allQuestions = allQuestions.filter(q => q.examYear !== undefined && yearSet.has(Number(q.examYear)));
      }
    } else {
      // Standard subjects path
      const standardSubjectIds = targetSubjectIds!.map(Number);
      for (const subId of standardSubjectIds) {
        const subIdNum = Number(subId);
        let subjectQuestions = subjectPackCache.get(subIdNum);

        if (!subjectQuestions) {
          const key = `packs/subject_${subIdNum}.json`;
          let parsedPack = null;

          const cdnUrl = c.env.CDN_URL || 'https://assets.openmedq.com';
          try {
            const res = await fetch(`${cdnUrl}/${key}`);
            if (res.ok) {
              parsedPack = await res.json();
            }
          } catch (err) {
            console.warn(`CDN fetch failed for subject pack ${subIdNum}, falling back to direct R2 binding:`, err);
          }

          if (!parsedPack) {
            const object = await c.env.BUCKET.get(key);
            if (object) {
              try {
                const text = await object.text();
                parsedPack = JSON.parse(text);
              } catch (err) {
                console.warn(`Failed to parse pack for subject ${subIdNum}:`, err);
              }
            }
          }

          if (Array.isArray(parsedPack)) {
            subjectQuestions = parsedPack;
            subjectPackCache.set(subIdNum, parsedPack);
          }
        }

        if (subjectQuestions) {
          allQuestions = allQuestions.concat(subjectQuestions);
        }
      }

      // Filter by standard topics if provided
      const standardTopicIds = topicIds ? topicIds.filter(id => Number(id) > 0).map(Number) : [];
      if (standardTopicIds.length > 0) {
        const topicSet = new Set(standardTopicIds);
        allQuestions = allQuestions.filter(q => q.topicId !== undefined && topicSet.has(Number(q.topicId)));
      }
    }

    // Filter by student progress status
    let filtered: any[] = [];
    const now = Date.now();

    if (status === 'UNATTEMPTED') {
      const attemptedSet = new Set<number>();
      progressList.forEach(p => {
        if (p.status === 'CORRECT' || p.status === 'INCORRECT') {
          attemptedSet.add(Number(p.questionId));
        }
      });
      filtered = allQuestions.filter(q => !attemptedSet.has(Number(q.id)));
    } else if (status === 'INCORRECT') {
      filtered = allQuestions.filter(q => incorrectSet.has(Number(q.id)));
    } else if (status === 'CORRECT') {
      const correctSet = new Set<number>();
      progressList.forEach(p => {
        if (p.status === 'CORRECT') {
          correctSet.add(Number(p.questionId));
        }
      });
      filtered = allQuestions.filter(q => correctSet.has(Number(q.id)));
    } else if (status === 'BOOKMARKED') {
      filtered = allQuestions.filter(q => bookmarkedSet.has(Number(q.id)));
    } else if (status === 'SPACED_REPETITION') {
      const dueQuestions: { q: any; due: number }[] = [];
      const attemptedSet = new Set<number>();

      progressList.forEach(p => {
        attemptedSet.add(Number(p.questionId));
        if (p.due !== undefined && p.due <= now) {
          const qObj = allQuestions.find(q => Number(q.id) === Number(p.questionId));
          if (qObj) {
            dueQuestions.push({ q: qObj, due: p.due });
          }
        }
      });

      // Sort due questions by due date ascending
      dueQuestions.sort((a, b) => a.due - b.due);

      // Take the portion of due cards that will fit in the limit
      const activeDueQuestions = dueQuestions.slice(0, targetLimit);
      // Shuffle this active due subset to break sequence context bias
      const shuffledDue = shuffleArray(activeDueQuestions.map(item => item.q));

      // Identify unattempted questions
      const newQuestions = allQuestions.filter(q => !attemptedSet.has(Number(q.id)));
      const shuffledNew = shuffleArray(newQuestions);

      // Apply cap to new questions (default to 10 if unspecified)
      const maxNew = newCardsLimit !== undefined ? Number(newCardsLimit) : 10;
      const remainingSlots = Math.max(0, targetLimit - shuffledDue.length);
      const selectedNew = shuffledNew.slice(0, Math.min(maxNew, remainingSlots));

      // Combine (shuffled reviews first, then capped new cards)
      filtered = [...shuffledDue, ...selectedNew];
    } else if (status === 'LEECHES') {
      const leechSet = new Set<number>();
      progressList.forEach(p => {
        const difficulty = p.difficulty ?? 0;
        const lapses = p.lapses ?? 0;
        const isLeech = (lapses >= 3 && difficulty >= 7.0) || (p.status === 'INCORRECT' && difficulty >= 7.5);
        if (isLeech) {
          leechSet.add(Number(p.questionId));
        }
      });
      filtered = allQuestions.filter(q => leechSet.has(Number(q.id)));
    } else {
      filtered = allQuestions;
    }

    // Shuffle and slice (only shuffle for non-spaced-repetition modes)
    const finalQuestions = status === 'SPACED_REPETITION' ? filtered : shuffleArray(filtered);
    const sliced = finalQuestions.slice(0, targetLimit);

    // Format output (convert correctOption to 1-indexed for frontend compatibility)
    const formatted = sliced.map(q => ({
      ...q,
      correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption + 1
        : q.correctOption,
    }));

    return c.json({
      success: true,
      questions: formatted,
    });
  } catch (error: any) {
    console.error('Custom practice error:', error);
    return c.json({ success: false, error: 'Failed to fetch custom practice questions.' }, 500);
  }
})

// API endpoint to retrieve the leaderboard for a specific month
  .get('/api/leaderboard', async (c) => {
  try {
    const auth = getAuth(c);
    const userId = auth?.userId;
    const parsed = leaderboardQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ success: false, error: 'Invalid query parameters', details: parsed.error.issues }, 400);
    }
    const month = parsed.data.month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const db = drizzle(c.env.DB, { schema });

    const cache = (caches as any).default;
    const cacheKey = `http://internal/leaderboard/${month}`;
    let cachedResponse = await cache.match(cacheKey);
    let cachedData: any = null;

    if (cachedResponse) {
      try {
        cachedData = await cachedResponse.json();
      } catch (err) {
        console.warn('Failed to parse cached leaderboard JSON:', err);
      }
    }

    if (!cachedData) {
      // Cache miss: query D1 top 50 and total participants in 1 batch
      const [topUsers, totalResult] = await db.batch([
        db.select({
          id: schema.users.id,
          displayName: schema.users.displayName,
          dopa: schema.userMonthlyDopa.dopa,
          lifetimeDopa: schema.users.lifetimeDopa,
          streakDays: schema.users.streakDays,
        })
        .from(schema.userMonthlyDopa)
        .innerJoin(schema.users, eq(schema.userMonthlyDopa.userId, schema.users.id))
        .where(eq(schema.userMonthlyDopa.month, month))
        .orderBy(desc(schema.userMonthlyDopa.dopa), asc(schema.userMonthlyDopa.updatedAt))
        .limit(50),

        db.select({
          count: sql<number>`count(*)`
        })
        .from(schema.userMonthlyDopa)
        .where(eq(schema.userMonthlyDopa.month, month))
      ]);

      const leaderboardList = topUsers.map((item, index) => ({
        rank: index + 1,
        userId: item.id,
        displayName: item.displayName || 'Aspirant',
        dopa: item.dopa,
        lifetimeDopa: item.lifetimeDopa,
        streakDays: item.streakDays,
      }));

      cachedData = {
        leaderboard: leaderboardList,
        totalParticipants: totalResult[0]?.count || 0,
      };

      // Cache the response for 5 minutes (300 seconds)
      const cacheResponseObj = new Response(JSON.stringify(cachedData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
      c.executionCtx.waitUntil(cache.put(cacheKey, cacheResponseObj));
    }

    const leaderboard = cachedData.leaderboard;
    const totalParticipants = cachedData.totalParticipants;
    let userRankInfo = null;

    if (userId) {
      const isRecordInTop50 = leaderboard.find((l: any) => l.userId === userId);
      
      if (!isRecordInTop50) {
        // Query user's monthly stats and details
        const [userMonthlyStatsResult, userDetailsResult] = await db.batch([
          db.select({
            dopa: schema.userMonthlyDopa.dopa,
            updatedAt: schema.userMonthlyDopa.updatedAt,
          })
          .from(schema.userMonthlyDopa)
          .where(and(
            eq(schema.userMonthlyDopa.userId, userId),
            eq(schema.userMonthlyDopa.month, month)
          ))
          .limit(1),

          db.select({
            displayName: schema.users.displayName,
            lifetimeDopa: schema.users.lifetimeDopa,
            streakDays: schema.users.streakDays,
          })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1),
        ]);

        const userMonthlyStats = userMonthlyStatsResult[0];
        const userDetails = userDetailsResult[0];

        if (userMonthlyStats) {
          const userDopa = userMonthlyStats.dopa;
          const userUpdatedAt = userMonthlyStats.updatedAt;

          // Count users with higher monthly dopa in index-backed range query
          const rankResult = await db.select({
            count: sql<number>`count(*)`
          })
          .from(schema.userMonthlyDopa)
          .where(
            and(
              eq(schema.userMonthlyDopa.month, month),
              or(
                gt(schema.userMonthlyDopa.dopa, userDopa),
                and(
                  eq(schema.userMonthlyDopa.dopa, userDopa),
                  lt(schema.userMonthlyDopa.updatedAt, userUpdatedAt)
                )
              )
            )
          );

          const higherCount = rankResult[0]?.count || 0;

          userRankInfo = {
            rank: higherCount + 1,
            userId,
            displayName: userDetails?.displayName || 'Aspirant',
            dopa: userDopa,
            lifetimeDopa: userDetails?.lifetimeDopa || 0,
            streakDays: userDetails?.streakDays || 0,
          };
        } else {
          userRankInfo = {
            rank: totalParticipants + 1,
            userId,
            displayName: userDetails?.displayName || 'Aspirant',
            dopa: 0,
            lifetimeDopa: userDetails?.lifetimeDopa || 0,
            streakDays: userDetails?.streakDays || 0,
          };
        }
      } else {
        userRankInfo = isRecordInTop50;
      }
    }

    return c.json({
      success: true,
      month,
      leaderboard,
      userRank: userRankInfo,
    });
  } catch (error: any) {
    console.error('Leaderboard fetch error:', error);
    return c.json({ success: false, error: 'Failed to fetch leaderboard rankings.' }, 500);
  }
})

.get('/api/assets/*', cache({
  cacheName: 'openmedq-assets',
  cacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable',
}), async (c) => {
  const path = c.req.path.replace(/^\/api\/assets\//, '');
  if (!path || path.includes('..') || !/^[a-zA-Z0-9_\-\.\/]+$/.test(path)) {
    return c.text('Not Found', 404);
  }

  try {
    const object = await c.env.BUCKET.get(path);
    if (!object) {
      return c.text('Not Found', 404);
    }

    // Determine the content type
    let contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    if (path.endsWith('.json')) {
      contentType = 'application/json';
    } else if (path.endsWith('.png')) {
      contentType = 'image/png';
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (path.endsWith('.webp')) {
      contentType = 'image/webp';
    }

    c.header('Content-Type', contentType);
    c.header('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    if (object.etag) {
      c.header('ETag', object.etag);
    }

    return c.body(object.body);
  } catch (err: any) {
    console.error('Failed to retrieve R2 asset:', err);
    return c.text('Internal Server Error', 500);
  }
});

export type AppType = typeof routes;

export default app;
