# Expo monorepo TypeScript and Clerk SDK Standards

This document records architectural findings and patterns for managing compilation and lint issues inside the Expo mobile workspace, specifically relating to monorepo type leakage, Clerk hook signal structures, and React effect execution.

---

## 1. Monorepo TypeScript Reference Leakage

### The Problem
When the Expo mobile workspace imports TypeScript definitions (like Hono RPC `AppType`) directly from the backend directory:
```typescript
import type { AppType } from '../../../backend/src/index';
```
The TypeScript compiler (`tsc`) follows the import path and attempts to parse and typecheck the referenced backend files. If the backend relies on Cloudflare-specific globals (`D1Database`, `R2Bucket`, etc.), the compilation fails because these typings are not in the mobile workspace scope. Including `@cloudflare/workers-types` in `mobile/tsconfig.json` is not allowed because it pollutes React Native's global scope.

### The Solution
Create a local declaration file in the mobile project (e.g. `mobile/src/types/cloudflare.d.ts`) containing dummy type declarations for these globals. This satisfies the parser when checking backend code paths without polluting React Native's typings:

```typescript
// mobile/src/types/cloudflare.d.ts
type D1Database = any;
interface R2Bucket {
  get(key: string): Promise<any>;
  list(options?: any): Promise<any>;
}
```

---

## 2. Clerk Signals SDK Typing Issues

### The Problem
In newer versions of `@clerk/expo` / `@clerk/react`, the hooks `useSignIn` and `useSignUp` might return signal-based structures (`SignInSignalValue`, `SignUpSignalValue`) in the TypeScript types, while standard properties (like `setActive` and `isLoaded`) are expected by custom onboarding flows. This results in compile-time properties missing errors even though standard properties are available at runtime.

### The Solution
Cast the Clerk hook returns to `any` at the invocation site. This bypasses the transient TypeScript type resolution errors while ensuring full runtime functionality:

```typescript
const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn() as any;
const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp() as any;
```

---

## 3. SetState in useEffect Hooks (Linter Error)

### The Problem
The `react-hooks/set-state-in-effect` lint rule prevents calling methods that perform synchronous state transitions inside the `useEffect` body because it can trigger cascading renders.

### The Solution
Deferred execution of state-setting methods (such as DB statistics fetches or sync triggers) should be wrapped inside a resolved Promise or timer callback to decouple them from the initial rendering layout phase:

```typescript
useEffect(() => {
  Promise.resolve().then(() => {
    loadDashboardData();
  });
}, [loadDashboardData]);
```

---

## 4. Hono RPC Client Typing and Route Chaining

### The Problem
When defining a Hono backend application and exporting `AppType = typeof app`, the exported type does not contain route definitions if the routes are registered as statements (e.g. `app.get()`, `app.post()`) rather than chained methods. This results in the client RPC client `hc<AppType>(...)` resolving to type `unknown`.

### The Solution
Ensure all Hono API routes are registered via method chaining (i.e. `.get()`, `.post()`) off the application instance. Terminating semicolons `;` must not be placed at the end of each handler definition in the chain, except at the end of the final handler registration. Export `AppType` as the type of this chained routes object:

```typescript
const routes = app
  .get('/api/one', ...)
  .post('/api/two', ...);

export type AppType = typeof routes;
```
This enables the client-side `hc<AppType>(...)` to correctly infer the paths, parameters, and return types of all endpoints.

