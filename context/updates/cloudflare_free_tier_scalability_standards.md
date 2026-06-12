# Cloudflare Free Tier Scalability Standards

Standards for maximizing scalability under the Cloudflare Free Tier ($0/month) limits, bypassing Workers daily request quotas (100k/day), D1 daily read limits (5M/day), and D1 daily write limits (100k/day) for both web and mobile clients.

---

## 🚀 1. Workers Request Quota Bypass & R2 CDN Caching
* **Finding**: Cloudflare bills Workers requests even if the response is served by Hono's `cache` middleware or the Cache API. 
  * Serving R2 assets through a Worker proxy (`/api/assets/*`) using Hono's `cache` middleware avoids Class B R2 operations on cache hits, but **still triggers Worker request invocations** (consuming the 100k/day quota).
  * Exposing the R2 bucket via a **custom domain** (e.g. `cdn.openmedq.com`) with a Cloudflare CDN Cache Rule ("Cache Everything") bypasses the Hono Worker completely. On cache hits, it serves the asset directly from the CDN edge, resulting in **exactly 0 Workers requests** and **exactly 0 R2 Class B operations**.
* **Standard**:
  * **Direct CDN fallback**: The frontend resolves `VITE_CDN_URL` dynamically to either a configured custom domain CDN or falls back to the Hono API Worker asset route:
    `import.meta.env.VITE_CDN_URL || `${import.meta.env.VITE_API_URL || ''}/api/assets``
  - Serve all R2 bucket assets with `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable` and forward ETag headers to maximize browser-level caching and prevent origin revalidation.
  - For production, expose the R2 bucket directly via a custom domain on Cloudflare CDN to ensure zero-cost scaling (avoiding Worker request counts for images/packs). Use the Worker proxy endpoint `/api/assets/*` only as a staging/testing fallback.

## 🔢 2. Option Indexing Mappings
* **Finding**: Question packs saved in R2 are raw MedMCQA/dataset format where `correctOption` is 0-indexed (0 = A, 1 = B, 2 = C, 3 = D). However, the application schema and UI expect `correctOption` to be 1-indexed (1 = A, 2 = B, etc.).
* **Standard**:
  * When downloading question packs directly from R2/CDN, the client must format/map the `correctOption` index locally before writing to the local database:
    ```typescript
    correctOption: typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3
      ? q.correctOption + 1
      : q.correctOption
    ```

## 📊 3. D1 Leaderboard Query Optimizations
* **Finding**: Nesting rank calculations inside the subquery of a `WHERE` clause causes D1 to perform full table scans, quickly consuming the 5M/day read limit.
* **Standard**:
  * Split rank lookups into two indexed queries:
    1. Query the specific user's DOPA score in a single index lookup.
    2. Count users with a higher score using a range query on a composite index (`month_dopa_idx` on `user_monthly_dopa`).
  * Implement global in-memory caching in the Cloudflare Worker global scope (e.g. a 5-minute cache) to eliminate D1 queries for high-frequency dashboard loads.
  * Implement client-side session/memory caching (e.g. 5-minute stale-time) to prevent fetching on every page/screen mount when navigating tabs.
