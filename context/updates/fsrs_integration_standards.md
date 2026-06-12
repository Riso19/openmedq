# FSRS Integration Standards

We are implementing the **Free Spaced Repetition Scheduler (FSRS)** (specifically version 6 using the `ts-fsrs` package) as our spaced repetition engine, completely replacing SM-2.

## 1. Local Database Schema (Dexie IndexedDB)

To support FSRS state tracking, the `LocalProgress` table in `frontend/src/lib/db.ts` must be extended with optional FSRS fields:

```typescript
export interface LocalProgress {
  questionId: number;
  status: 'CORRECT' | 'INCORRECT' | 'BOOKMARKED';
  timeTaken?: number;
  answeredAt: number;

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
}
```

By keeping these fields optional, we preserve compatibility with existing guest progress entries.

## 2. Synchronization & Cloudflare D1 compatibility

Because progress synchronization simply stringifies all `LocalProgress` rows and stores them as a single gzipped blob/text in the D1 database:
* **No migrations are required** on the backend or inside the D1 SQLite tables.
* The fields will serialize and deserialize dynamically when the progress is synced.

## 3. UI/UX Scheduling Engine Flow

For study sessions utilizing spaced repetition:
1. **Wrong Options**: Answering a question incorrectly automatically triggers a review with `Rating.Again`, rescheduling the card to reappear in the short-term learning queue (e.g. 1m or 10m).
2. **Correct Options**: Answering correctly prompts the user to select their recall quality after revealing the high-yield explanation:
   * **Again** (Forgot)
   * **Hard** (High effort)
   * **Good** (Normal recall)
   * **Easy** (Trivial/Instant recall)
3. **Button Intervals & Fuzz Matching**: 
   - Button intervals are calculated using `scheduler.repeat(card, now)`.
   - **Fuzz Mismatch Prevention**: To avoid discrepancies between the previewed interval and the actual saved interval (since `enable_fuzz: true` randomizes intervals across scheduler instances), the clicked preview card (`fsrsPreviews[rating].card`) must be written directly to the database rather than running a new `scheduler.next` calculation.
   - **Interval Formatting**: Format intervals using `Math.round` instead of `Math.floor`. Intervals under 1 minute display as `<1m`. Intervals >= 30 days display as months (`mo`, e.g., `1.5mo`), and >= 365 days display as years (`y`, e.g., `1.2y`).

## 4. Querying & Shuffling Due Cards

To retrieve cards due for spaced repetition:
- Include cards with `due === undefined` (never studied) and `due <= Date.now()`.
- **Shuffling**: To eliminate sequential context bias (adjacent questions from the same topic), sort the due cards by due date ascending (overdue first), extract the top `limit` subset, and **shuffle** this active subset before combining with new questions.

## 5. Review History Logging (ReviewLog)

To support future memory calibration and custom weight optimization, every review event must write a log to the `reviewLogs` table (Dexie version 5 migration: `reviewLogs: '++id, questionId, reviewTime, rating'`):
```typescript
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
```

## 6. Practice Session Persistence & Resume

To prevent progress loss on browser refresh or crash:
- **Auto-save**: Every action in `PracticeSuite` serializes the active states to `localStorage` under `openmedq_active_practice_session`.
- **Restore**: If `resumeActiveSession` is passed, the suite loads state directly from LocalStorage instead of re-querying the database.
- **Bento Card**: If an unfinished session exists, the dashboard renders a premium Bento Card enabling users to "Resume Session" or "Discard Session".
- **Cleanup**: The session is automatically cleared when the module is fully completed or explicitly discarded by the user.

## 7. FSRS Correctness & Caching Optimizations (June 2026 Audit)

To ensure scheduler correctness, multi-platform alignment, and offline caching reliability, the following rules must be followed:

1. **Nullish Coalescing for SQLite Mapping**: When mapping FSRS numeric fields from raw SQLite query results on mobile, always use nullish coalescing (`??`) instead of logical OR (`||`). Numeric fields like `stability = 0` (initial state for new cards), `reps = 0`, `lapses = 0`, and `elapsedDays = 0` are falsy. Using `|| undefined` silent-truncates these valid values to `undefined`, corrupting scheduling calculations.
2. **Optimizer Warm-Starting**: When calibrating scheduler parameters using the FSRS optimizer on either web or mobile, coordinate descent must initialize from the user's current custom weights (`getSafeWeights(settings.w)`) rather than starting from default weights (`fsrs().parameters.w`) on every run.
3. **Rescheduling Exclusions**: The `rescheduleAllCards` routine (triggered by changes in user retention targets or maximum intervals) must only recalculate due dates for cards currently in the Review state (`state === 2`). Cards in Learning (`state === 1`) and Relearning (`state === 3`) are on short-term step-based intervals and rescheduling them will push them to incorrect long-term intervals.
4. **Offline Cache Tolerance**: To account for minor question count differences between the static frontend syllabus hierarchy (`topics.json`, `subjects.json`) and the cleaned R2 CDN pack files (which filter out invalid/duplicate questions), the `isCached` checks must use a **95% count tolerance**. A subtopic is considered cached if `cachedCount >= totalCount || cachedCount >= Math.floor(totalCount * 0.95)`.
5. **Mobile Downloading CDN Direct Fetch**: To avoid Worker CPU limits and pagination issues, mobile subtopic downloads must fetch directly from the R2 CDN endpoint (`/packs/subject_{subjectId}_topic_{topicId}.json`) rather than Hono backend API endpoints. Always map `correctOption` from 0-indexed in the JSON file to 1-indexed for database storage.
