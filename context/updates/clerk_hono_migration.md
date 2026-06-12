# context/updates/clerk_hono_migration.md

## ⚠️ Deprecated Pattern from Training Weights
In older models/training context, Clerk Hono authentication was handled by importing `clerkMiddleware` and `getAuth` from `@hono/clerk-auth`. 

Clerk has officially deprecated `@hono/clerk-auth`, and it is replaced by the official package `@clerk/hono`.

## 🛠️ Correct Implementation
Use `@clerk/hono` instead of `@hono/clerk-auth` in backend endpoints.

### Import Change:
```diff
- import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
+ import { clerkMiddleware, getAuth } from '@clerk/hono';
```

### Dependency setup:
* Remove `@hono/clerk-auth` from `package.json`.
* Add `@clerk/hono` to `package.json`.
* Run `npm install` inside the backend package.
