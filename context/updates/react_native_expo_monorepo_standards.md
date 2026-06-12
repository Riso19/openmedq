# React Native & Expo Monorepo Integration Standards

This document registers the architectural standards, configurations, and best practices learned during setting up the Expo mobile client and the shared codebase in the workspaces monorepo.

---

## 🛠️ Monorepo Workspaces Layout

To support code sharing between the web app (`frontend`), the API service (`backend`), and the mobile client (`mobile`), the project uses an npm workspaces monorepo structure:

```
.
├── backend/                  # Hono API Backend (Cloudflare Worker)
├── frontend/                 # Vite + React Web client
├── mobile/                   # Expo React Native mobile client
└── shared/                   # Pure TS shared logic library
```

---

## 📦 Shared Logic Strategy (`@openmedq/shared`)

Core business logic is moved into the `@openmedq/shared` workspace package to prevent code duplication and runtime inconsistencies.

### ⚠️ Platform Runtime Constraints
Code inside `@openmedq/shared` runs on three distinct environments:
1.  **V8 Isolates** (Cloudflare Workers via Hono backend).
2.  **Browser DOM** (Vite frontend client).
3.  **Hermes Engine** (React Native/Expo mobile client).

To ensure complete compatibility:
*   **Banned APIs**: Banned use of Node.js-specific globals/libraries (such as `fs`, `path`, `crypto`, `buffer`) or DOM-specific globals (such as `window`, `document`, `localStorage`, `sessionStorage`) in `@openmedq/shared`.
*   **Decoupled DBs**: Storage adapters (Dexie for web, SQLite/MMKV for mobile, D1 for backend) must remain inside the client-specific apps, passing minimal parameters/data primitives to shared helpers.
*   **Pure Functions**: Port only mathematical scheduling (FSRS converters/formatter) and gamification calculations (level tiers) as pure functions:
    *   `progressToCard(progress)` and `cardToProgressFields(card)`
    *   `getLevelInfo(dopa)` and `getNextLevelInfo(dopa)`

---

## 📱 Expo & Mobile Development Standards

### 1. Typescript Asset Resolvers
React Native templates utilize relative or aliased CSS/asset imports (e.g. `@/global.css` or `.module.css`). To satisfy typecheck validation without bundling errors, declare module resolvers in [mobile/declarations.d.ts](file:///Users/sain/development/openmedq/mobile/declarations.d.ts):
```typescript
declare module '*.css' {
  const content: any;
  export default content;
}
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
```

### 2. AI-Assisted Agent Tooling
To optimize AI agent workflows during mobile development, configuration hooks are added locally:
*   **Expo MCP Server**: Connects LLMs to the Expo API and SDK documentation using stdio:
    ```json
    "expo": {
      "command": "npx",
      "args": ["-y", "expo-mcp"]
    }
    ```
*   **Reactotron MCP Server**: WebSocket telemetry proxy that enables agents to inspect running application state, network streams, and logs:
    ```json
    "reactotron": {
      "command": "npx",
      "args": ["-y", "reactotron-mcp"]
    }
    ```
*   **Callstack Agent Skills**: Registered symbolic links to provide agents with rules for mobile performance checklist rules (`react-native-best-practices`) and version upgrade guides (`upgrading-react-native`).

---

## 🔒 Monorepo Type-Safety & Hono RPC Integration

### 1. Cloudflare Workers Global Types in Client Apps
When importing the backend RPC type definition `AppType = typeof app` in client applications (like the `mobile` React Native workspace), TypeScript will traverse into the backend code. If the backend uses Cloudflare Workers globals like `D1Database` or `R2Bucket`, type checking the client application will fail with:
`Cannot find name 'D1Database'. Did you mean 'IDBDatabase'?`
*   **Standard Resolution**: Ensure the client project's `tsconfig.json` explicitly references `@cloudflare/workers-types` in its `compilerOptions.types` array, and keep the type definition in the monorepo root or workspace `node_modules`.

### 2. Hono RPC Client Casting on Hermes
The type returned by Hono's RPC client `hc<AppType>(...)` can occasionally cause deep type-checks that trigger bundler/compiler limits in React Native (Hermes).
*   **Standard Resolution**: Cast the RPC client explicitly to `any` (e.g. `export const api = hc<AppType>(API_URL) as any;`) to maintain clean developer ergonomics and zero compilation delay without sacrificing any runtime functionality.

---

## ⚡ React Compiler & ESLint Purity Standards

### 1. State Updates in Effects (Cascading Renders)
React 19/React Compiler and strict ESLint configurations enforce that `setState` calls must not occur synchronously in the top-level execution path of a `useEffect` hook. Directly executing `setState` will trigger a compile-time or lint error:
`Calling setState synchronously within an effect can trigger cascading renders`
*   **Standard Resolution**: Wrap the initial `setState` (or function call that executes `setState`) inside an asynchronous microtask using `Promise.resolve().then(...)` or `queueMicrotask(...)`. This safely defers state transitions to the next microtask loop, satisfying all strict purity analyses.
*   **State Value Guards**: Always wrap conditionally (e.g., `if (stateValue !== null) { setState(null); }`) to prevent unnecessary microtask executions.
