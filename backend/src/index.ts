import { Hono } from 'hono';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Base Health Check
app.get('/', (c) => {
  return c.json({
    status: 'healthy',
    app: 'OpenMedQ Backend',
    platform: 'Cloudflare Workers',
  });
});

// API endpoint to fetch static question packs (simulated or fetched from R2/D1)
app.get('/api/questions/pack', async (c) => {
  const subjectId = c.req.query('subjectId');
  const topicId = c.req.query('topicId');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  // Future Logic: Fetch questions from D1 or check R2 JSON index
  return c.json({
    success: true,
    message: 'Stub: Question pack generated successfully',
    filters: { subjectId, topicId, limit },
    questions: [
      {
        id: 1,
        questionText: 'Which of the following is the primary site of nutrient absorption?',
        opa: 'Stomach',
        opb: 'Duodenum',
        opc: 'Jejunum',
        opd: 'Ileum',
        correctOption: 3,
        subjectId: 1,
        topicId: 5,
        hasImage: false,
      }
    ],
  });
});

// API endpoint to sync user progress (stores compressed bitset states)
app.post('/api/progress/sync', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, incorrectIds, bookmarkedIds, progressData } = body;

    if (!userId) {
      return c.json({ success: false, error: 'User ID is required' }, 400);
    }

    // Future Logic: Upsert userState into D1 SQLite database
    return c.json({
      success: true,
      message: 'Stub: Progress state synced successfully',
      data: {
        userId,
        incorrectCount: incorrectIds?.length || 0,
        bookmarkedCount: bookmarkedIds?.length || 0,
        progressBlobSize: progressData?.length || 0,
        syncedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export type AppType = typeof app;

export default app;
