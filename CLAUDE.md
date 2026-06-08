# OpenMedQ Agent Context

Free MCQ practice app (NEET PG, FMGE, INICET) running on Cloudflare Free Tier.

## 📁 Project Structure

*   `/frontend`: Vite + React + TS (SPA) on Cloudflare Pages.
*   `/backend`: Hono API on Cloudflare Workers.
*   Linked via npm workspaces at root level.

## 🛠️ Tech Stack
*   **Core:** React `19.2.7`, Vite `8.0.16`, TypeScript `6.0.2`.
*   **CSS:** Tailwind CSS `4.3.0` + shadcn/ui.
*   **Client DB:** Dexie (IndexedDB) for local-first test logic & offline state.
*   **Server DB:** Cloudflare D1 (SQLite) + Drizzle ORM `0.45.2`.
*   **Blob:** Cloudflare R2 (explanations & images).
*   **Auth:** Clerk (10k MAU free).

## ⚡ Free-Tier Exploits
1.  **R2 CDN Question Packs:** Group questions by subject/topic in static JSONs on R2. Client downloads directly via CDN. **0 Worker requests, 0 D1 reads** on hit.
2.  **Compressed Progress Bitsets:** User answers logged in local IndexedDB. Sync to D1 is serialized to a single base64/gzipped bitset per user. **Saves 99.9% of write row ops** (bypasses 100k daily write limit).
3.  **Local-First / Guest Mode:** Spaced repetition (SM-2) & test generator run entirely on client. Keeps Clerk MAUs < 10k.

## 💻 Commands

*   `npm run dev`: Start frontend + backend dev servers concurrently.
*   `npm run dev:frontend` / `npm run dev:backend`: Run individual dev servers.
*   `npm run build:frontend`: Compile client production bundle.
*   `npm run cf-typegen -w backend`: Regenerate Wrangler environment types.
*   `npx drizzle-kit generate` (inside `/backend`): Generate database migrations.

## 📜 Coding Conventions
*   **Hono RPC:** Backend exports `AppType` from [index.ts](file:///Users/sain/development/openmedq/backend/src/index.ts). Frontend imports via relative path in [api.ts](file:///Users/sain/development/openmedq/frontend/src/lib/api.ts) for end-to-end type safety:
    ```typescript
    import { hc } from 'hono/client';
    import type { AppType } from '../../../backend/src/index';
    export const api = hc<AppType>(import.meta.env.VITE_API_URL || '/');
    ```
*   **Tailwind v4:** `:root` HSL variables defined in [index.css](file:///Users/sain/development/openmedq/frontend/src/index.css). Mapped via `@theme inline`. Body styles read `var(--background)`.
*   **IndexedDB schema:** Defined in [db.ts](file:///Users/sain/development/openmedq/frontend/src/lib/db.ts) (Dexie client).
*   **Types:** `@cloudflare/workers-types` installed globally to ensure D1 and R2 types resolve in both workspaces.
