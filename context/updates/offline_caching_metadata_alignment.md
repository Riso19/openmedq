# Offline Caching Metadata Alignment

## Problem: Question Count Mismatch in Offline Caching
When a user attempts to cache a subject or topic for offline study, the frontend checks if the number of cached questions in the local IndexedDB database matches the expected counts defined in `subjects.json` and `topics.json`.
However, because of duplicate filtering on the parsed PDF files (i.e. questions from NEET PG recalls that are already present in the base MedMCQA dataset), some parsed questions are skipped when writing the finalized `.json` subject and topic packs.
Previously, the parser script `parse_pyqs.py` incremented the counts inside the parser loop before checking for duplicates. This resulted in inflated expected counts in `subjects.json` and `topics.json` compared to the actual number of unique questions in the written pack files, preventing the frontend from ever showing the subject or topic as "100% Fully Cached".

## Correct Pattern: Calculating Counts from Written Files
To ensure metadata files (`subjects.json` and `topics.json`) always align perfectly with the actual pack contents:
1. **Defer Count Computation**: Calculate counts only **after** the final topic and subject JSON pack files have been written.
2. **Derive from Subject Packs**: Group the finalized questions in `subject_${sub_id}.json` by their `topicId` to get the actual topic counts, and use the length of the subject pack for the subject count.
3. **Synchronize All Destinations**: Ensure that the updated JSON metadata is written to all destinations in the workspace:
   - Backend dist directory: `backend/dist/r2-packs/`
   - Frontend source directory: `frontend/src/lib/`
   - Shared library source directory: `shared/src/` (which mobile package references)
   - Mobile source directory: `mobile/src/lib/`
