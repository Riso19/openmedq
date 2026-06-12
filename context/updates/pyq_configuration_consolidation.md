# PYQ Configuration Consolidation Standards

## Problem: Duplicate Hardcoded PYQ Definitions
Both the web frontend app (`SyllabusDrawer.tsx`, `Dashboard.tsx`) and the mobile React Native app (`SyllabusModal.tsx`, `index.tsx`) previously defined duplicate hardcoded arrays of NEET PG Previous Year Question (PYQ) paper metadata (year, count, name) and virtual subject `99` properties.
This copy-paste duplication led to maintenance overhead, mismatching paper counts (e.g., NEET PG 2024 count mismatch of 39 vs 142), and inconsistent database lookup conditions.

## Correct Pattern: Centralized @openmedq/shared Library Constants
To maintain a single source of truth across all platforms:
1. **Centralize Constants**: Keep all global constants, virtual subjects, and common schemas inside `@openmedq/shared/src/subjects.ts` (re-exported by `index.ts`).
2. **Define virtual subjects**: Export `NEET_PG_PYQ_SUBJECT` (representing the virtual subject ID `99` and total count `1842`) and `PYQ_PAPERS` containing the array of yearly paper objects.
3. **Expose Unified Subjects List**: Export `allSubjectsList` which combines standard MBBS subjects with virtual exam subjects.
4. **Platform Proxies**: Make the local web app module `frontend/src/lib/subjects.ts` act as a seamless proxy that simply re-exports everything from `@openmedq/shared`.
5. **Dynamic Referencing**: Replace any references to hardcoded IDs (like `99`) with imported constants (e.g., `NEET_PG_PYQ_SUBJECT.id`) to allow painless configuration updates in the future.
