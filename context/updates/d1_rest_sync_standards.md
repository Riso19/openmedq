# D1 REST Sync Merging & Conflict Resolution Standards

## 🔍 Context & Architecture
To synchronize user progress, bookmarks, settings, and gamification metrics across multiple devices, OpenMedQ uses a two-way synchronization engine over standard HTTP REST endpoints on Cloudflare Workers (Hono) backed by Cloudflare D1.

---

## 🛠️ Sync Rules & Merging Standards

### A. Two-Way REST Sync & Overwrite Protection
* **Empty Overwrite Protection**: On first startup or when the local database is empty, the client must never overwrite the cloud progress. The client must perform a `GET` request first to pull the remote progress blob, merge it locally, and only then write the merged output back to D1 via a `POST` request.
* **Tombstones**: Deleting bookmarks or resetting progress must be written as a tombstone (`isDeleted: true` or status change) rather than a physical deletion. If a row is physically deleted, other peer devices will not know of the deletion on their next sync and will resurrect the card.

### B. State-based Last-Write-Wins (LWW) Conflict Resolution
* All progress records must track an `updatedAt` epoch timestamp (ms).
* If a progress record exists in both local and remote sets, retain the one with the higher `updatedAt` timestamp.
* During sync, update both databases so that they are fully convergent.

### C. Unified Settings & Spaced Repetition Parameters Syncing
* User preferences (Target Exam, Daily solved target, and FSRS scheduling settings like Retention, Max Revision Gap, and Fuzz toggle) must be synchronized across devices.
* These settings are packaged into a settings object and written to the IndexedDB/SQLite `progress` table under a special reserve record with `questionId: -999`.
* **Reactive Application**: The app listens for a custom event (`openmedq_settings_updated`) to broadcast updates. Any incoming settings changes from a REST sync are written to local storage and dispatched, instantly updating the React states in the active views.

### D. Smart Streak Merging and Gamification Syncing
* Streak and Dopa scores must stay synchronized across multiple devices.
* **Dopa Protection**: A monthly record with active progress (`dopa > 0`) must never be overwritten by a newly initialized local stats record (`dopa === 0`) regardless of timestamps.
* **Lifetime Dopa Resolution**: Always takes the maximum (`Math.max`) between local and remote records since cumulative Dopa can only grow.
* **Smart Streak Merger**: Compares `lastActiveDate` values. If one device checked in today and the other yesterday, it detects consecutive day access and merges the streak as `Math.max(localStreak, remoteStreak + 1)`.

### E. Sync Latency Optimization
* **Trigger-on-Exit**: Trigger a D1 REST sync immediately when the user exits a practice suite session, completes a test, or manually changes their study settings to keep latency minimal.

---

## ⚠️ Common Mistakes to Avoid (D1 CPU Time Limit Timeout)
* **D1 CPU Limit**: Prune auto-generated Drizzle migrations. Avoid dropping or altering large tables (like `topics`) which causes SQLite to run recursive foreign key validation scans, exceeding Cloudflare D1's CPU time limit on the Free Tier.
* **Decompression Fallbacks**: When fetching the progress payload, implement multi-layered decompression fallbacks (handling direct/raw JSON string or plain Base64 strings) to prevent application startup crashes during database migrations or in-transition data phases.
* **Review Log ID Conflicts**: When synchronizing local tables with auto-increment primary keys (like `reviewLogs`), merging them directly causes ID collisions. Ensure they are uniquely identified and merged via a composite key (e.g., `${log.questionId}-${log.reviewTime}`). When inserting back, clear the local table and strip the `id` field from each record to let Dexie/SQLite safely regenerate fresh sequential IDs.
* **Agnostic Envelope Packaging**: For new sub-tables or settings, avoid spawning new REST endpoints or backend SQLite table migrations. Package them as a unified JSON envelope (`{ progressList, reviewLogs }`) within the existing gzipped binary blob column (`progressData`), providing a fallback to standard arrays for backward compatibility.
* **Gamification Sync Overwrite**: Do not rely strictly on a pure LWW timestamp merge for overall user stats. Always use value-based safeguards (e.g., `dopa > 0` checks and `Math.max` for cumulative fields) to avoid wiping out remote Dopa and streaks.
