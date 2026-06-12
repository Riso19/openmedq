# OpenMedQ AI Developer Guide

Read context/ index BEFORE code edits (inspect `context/mobile/index.md` specifically for mobile app changes). Do not read all files of context folder, read only relevant ones.

## Rules
1. **Read Context First**: Inspect `context/index.md` + doc before edit (or `context/mobile/index.md` for mobile React Native app changes).
2. **Clay Design System**: Canvas `#fffaf0` (warm cream). Display type Plain Black with Inter fallback, `tracking-[-0.04em]` (aligned with [DESIGN.md](file:///Users/sain/development/openmedq/DESIGN.md) as the Clay system is intentionally reused).
   * **Banned**: NO text gradients, NO card vertical side-stripes, NO SaaS row metric grids, NO em-dashes (`—` / `--`).
3. **Responsive**: Header drawer scroll (`overflow-y-auto pb-10 scrollbar-none`). Subjects horizontal scroll (`flex-row overflow-x-auto gap-2 pb-2 lg:pb-0 scrollbar-none`).
4. **Auth & Sync**: No mock login. Use Clerk `<SignIn />` / `<SignUp />` + `clerkAppearance` token. Keep IndexedDB-to-D1 background sync loop in `App.tsx`. Secure endpoints via Hono `@clerk/hono` (`userId`).
5. **Verify Builds**: Run `npm run build:frontend` (Vite) + `npx tsc --noEmit` (backend). Zero compiler/linter warnings/errors.
6. **Context Updates**: Log new findings in `context/updates/` and register them in [context/updates/index.md](file:///Users/sain/development/openmedq/context/updates/index.md). Read only relevant ones. Log: (a) new info learned via web research, (b) deprecated patterns from old training weights, (c) common mistakes to avoid repeating.
7. **Cloudflare R2 Object Storage**: Static question packs are served directly from R2 (`packs/{topicId}.json`). For bulk seeding or uploads, avoid spawning sequential Wrangler CLI processes. Instead, use the direct Cloudflare REST API object upload endpoint (`PUT /accounts/{account_id}/r2/buckets/{bucket_name}/objects/{key}`) with Bearer Token auth. Throttling is mandatory: restrict to 5 concurrent uploads, stagger starts by 150ms, and gracefully back off on `HTTP 429` rate-limit responses.


