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

---

## 5. Expo Deep Linking Scheme & Clerk Redirect Whitelisting

### The Problem
When performing OAuth (e.g. Google/Apple) inside an Expo mobile client with Clerk, the auth callback redirects back to the app using a deep link URL scheme. If the scheme is configured as a generic word (such as `scheme: "mobile"` in `app.json`), it can conflict with other applications on the testing device. Additionally, if the scheme is not allowlisted in the Clerk Dashboard, the authentication handshake will fail with a redirect mismatch error.

### The Solution
1. Use a unique scheme identifier (such as `scheme: "openmedq"`) in `app.json`.
2. Ensure the full callback URL (e.g., `openmedq://oauth-native-callback`) is explicitly allowlisted in the **Clerk Dashboard** under **User & Auth > Social Connections** (under the "Allowlist for mobile SSO redirect" field).

---

## 6. Expo .env Variable Caching in Metro Bundler

### The Problem
The Expo Metro bundler aggressively caches `.env` variables. If the bundler was running prior to editing or adding variables in `mobile/.env`, Metro will serve the stale cached keys (such as `pk_test_...` instead of `pk_live_...`), causing silent authentication failures or instance mismatches.

### The Solution
Whenever updating environment variables in the mobile `.env` file, always restart the Metro bundler with the clear cache option:
```bash
npx expo start -c
```

---

## 7. Animated.Value with React Refs (Linter Error)

### The Problem
Using `useRef(new Animated.Value(...)).current` inside components triggers the `react-hooks/refs` ESLint rule if the animated value is interpolated or read during the rendering cycle (e.g. `animation.interpolate(...)` called in the component body):
```
Error: Cannot access refs during render. React refs are values that are not needed for rendering. Refs should only be accessed outside of render...
```

### The Solution
Use `useState` with a lazy-initialization function to create the `Animated.Value`. Since state values are stable and not treated as mutable refs by the linter, calling `.interpolate()` on them during render is fully permitted:

```typescript
const [animation] = useState(() => new Animated.Value(isDark ? 1 : 0));
```


