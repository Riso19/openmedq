# context/updates/common_mistakes_to_avoid.md

## ⚠️ Common Mistakes & Gotchas

To prevent repeating code defects and build warnings/errors, adhere to the following checklist:

### 1. TypeScript Timer Refs in Browser Contexts
* **Mistake**: Declaring `const timerRef = useRef<NodeJS.Timeout | null>(null)` in React component files.
* **Problem**: In a web browser environment, the `NodeJS` namespace is not globally defined. This causes `tsc` compilation to fail with `Cannot find namespace 'NodeJS'`.
* **Fix**: Use `ReturnType<typeof setInterval>` or `any` or `number` to store references returned by `setInterval` or `setTimeout` in client-side React files:
  ```typescript
  const timerRef = useRef<any>(null); // or ReturnType<typeof setInterval>
  ```

### 2. Unused Variable Declarations
* **Mistake**: Retaining temporary debug variables or importing icons/types that are never referenced in the final JSX.
* **Problem**: Strict linter/compiler rules will abort production builds (`npm run build:frontend`) if unused variables exist.
* **Fix**: Always strip unused imports and declarations (e.g. `isQuestionAnswered`, unused Lucide icons like `BookOpen` if not rendered).

### 3. Duplicate Configurations
* **Mistake**: Defining local array constants (like the 19 standard MBBS subjects) inside multiple layout files.
* **Problem**: Causes code redundancy and desynchronization issues if counts or names change.
* **Fix**: Move shared configurations to a centralized location (such as [subjects.ts](file:///Users/sain/development/openmedq/frontend/src/lib/subjects.ts)) and import it everywhere.

### 4. Spawning Sequential CLI Calls for Bulk R2 Uploads
* **Mistake**: Iteratively spawning `npx wrangler r2 object put` via child processes to upload thousands of files.
* **Problem**: Spawning thousands of CLI commands causes massive Node engine startup overhead and will run extremely slowly (taking 45+ minutes) or hang in non-interactive terminal environments.
* **Fix**: Write a custom script that interacts directly with the Cloudflare REST API v4 object upload endpoint (`PUT /accounts/{account_id}/r2/buckets/{bucket_name}/objects/{key}`) using Bearer Tokens. Stagger requests (150ms delay), restrict concurrency (limit to 5), and implement exponential backoff on `HTTP 429` rate-limit responses.
### 5. Wrangler Empty String vars and Clerk Middleware Crash
* **Mistake**: Defining empty strings for `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the `vars` block of `wrangler.jsonc` without providing matching local secrets in `.dev.vars`.
* **Problem**: In Hono workers, `clerkMiddleware()` reads credentials from the environment context (`c.env`). If wrangler defines empty strings in `wrangler.jsonc`, it overrides local environment bindings with `""` and causes Clerk to throw `Error: Clerk: Missing Secret Key` on worker startup.
* **Fix**: Ensure that `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are defined in `.dev.vars` during local development to override the empty string placeholders.

### 6. Mismatched MCQ Option Indexing (0-indexed vs 1-indexed)
* **Mistake**: Direct mapping of the raw MedMCQA `cop` (correct option) field without converting it to 1-indexed values.
* **Problem**: In the HF MedMCQA dataset, `cop` values are `0, 1, 2, 3` (representing options A, B, C, D respectively). However, the frontend maps options using keys `1, 2, 3, 4`. Directly using `cop` values causes validation to fail (e.g. correct option A is checked as key `0` and never matches choice key `1`).
* **Fix**: Map `correctOption` in the backend API to convert `0, 1, 2, 3` values to `1, 2, 3, 4` dynamically before serving, and clear the client's local IndexedDB question cache via a one-time migration to discard any old 0-indexed values.

### 7. Online Custom QBank Questions Caching
* **Mistake**: Fetching custom test questions dynamically from a remote API/R2 bucket online but failing to cache them in the local `db.questions` IndexedDB table.
* **Problem**: The dashboard aggregations compute subject completion and correctness by looping over local questions from `db.questions`. If questions solved in online tests are not cached locally, the progress rows in `db.progress` cannot map back to their subjects, causing the dashboard to show 0% progress despite users practicing.
* **Fix**: Always save online-fetched custom practice questions in `db.questions` using `db.questions.put(q)` (or a bulk transaction) inside the initializer in `PracticeSuite.tsx`.

### 8. Missing useEffect Dependencies in Auth/Sync Hooks
* **Mistake**: Leaving dynamic callback parameters like `getToken` out of a `useEffect` dependency array when starting background sync or P2P signaling loops.
* **Problem**: The effect runs using a stale token reference or misses updates when the token rotates, leading to signaling/sync authentication failures.
* **Fix**: Always include all external callbacks, references, and state variables in the hook's dependency array (e.g., `getToken` in `App.tsx`'s P2P hook).

### 9. Infinite Recursion in Rate Limited Upload Retries
* **Mistake**: Scheduling another retry unconditionally inside a 429 response block of a script.
* **Problem**: If the rate limit persists, the script will recurse forever, leading to resource leaks or crash due to stack overflow.
* **Fix**: Ensure that the 429 handler checks the current attempt count against `MAX_RETRIES` and exits/rejects when exceeded.

### 10. Non-Transactional Clear + Bulk Add Database Operations
* **Mistake**: Calling `db.reviewLogs.clear()` followed by `db.reviewLogs.bulkAdd()` sequentially without wrapping them in a transaction.
* **Problem**: If `bulkAdd` fails halfway, the table is left empty, causing total data loss.
* **Fix**: Wrap atomic sync operations in a Dexie transaction block: `await db.transaction('rw', db.reviewLogs, async () => { await db.reviewLogs.clear(); await db.reviewLogs.bulkAdd(logsToPut); })`.

### 11. Unvalidated FSRS Array Parameters and Interval Modifier Math
* **Mistake**: Unconditionally accessing `w[20]` or assuming the weights array size is at least 21 without verification, and calculating `Math.pow` or `Math.log` without guarding.
* **Problem**: Can yield `undefined` or `NaN` inside the interval modifier equation, leading to corrupt spaced repetition scheduling.
* **Fix**: Validate the weights array size and check that target weights are finite numbers, and guard calculations with `Number.isFinite` constraints.

### 12. Strict LWW on Cumulative Dopa Metrics in Local-First Sync
* **Mistake**: Merging local-first monthly Dopa and lifetime XP using strict `updatedAt` Last-Write-Wins (LWW) rules.
* **Problem**: If the user opens an old device, the startup daily streak check will update the local `updatedAt` to the current time, making it look newer than the remote synced state even though its Dopa/XP value is lower. On sync merge, the newer timestamp will cause the old device's lower Dopa to win, downgrading the user's level and progress.
* **Fix**: Since Dopa and XP are cumulative metrics that only increase under normal operation, merge them by taking the maximum Dopa and the maximum `updatedAt` timestamp (`Math.max` on both). Double-guard the D1 database using SQLite's `MAX(excluded.dopa, user_monthly_dopa.dopa)` on conflict updates.
