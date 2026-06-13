# GitHub Release Assets CORS Limitations and Local Origin Workarounds

This document outlines the findings regarding cross-origin resource sharing (CORS) limitations on GitHub release downloads and the architectural standards to resolve them.

---

## 1. The CORS Limitation on Release Assets

### The Problem
When trying to dynamically verify the SHA-256 integrity checksum of a download APK in the frontend web client, calling `fetch` on a GitHub Release asset download link (e.g., `https://github.com/owner/repo/releases/download/...`) fails:

```
Access to fetch at '...' from origin '...' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

While the GitHub API (e.g., `api.github.com`) supports CORS requests (`Access-Control-Allow-Origin: *`), release asset download links redirect (HTTP 302) to Microsoft Azure Blob or Amazon S3 storage buckets. These redirected storage endpoints **do not** include CORS allowance headers, blocking browser-initiated fetches.

---

## 2. The Solution: Same-Origin Checksum Hosting

To ensure the integrity check works flawlessly without triggering browser CORS blocks, the following patterns must be implemented:

1.  **Direct Download Links**: Navigations via `<a href="...">` to download the APK binary remain pointing to the GitHub Release URLs (as clicks and direct browser downloads do not require CORS).
2.  **Relative Path Checksums**: The SHA-256 text file is hosted locally in the web client's static files directory (e.g., `frontend/public/openmedq-latest.apk.sha256`).
3.  **Relative Origin Fetches**: The frontend fetches the checksum using a relative path (e.g., `"/openmedq-latest.apk.sha256"`). Because the request is made to the same origin, it is completely secure and avoids CORS check requirements.

```typescript
const CONFIG = {
  // Relative URL is secure against CORS and resolves to the current domain
  HASH_URL: "/openmedq-latest.apk.sha256",
  FETCH_TIMEOUT_MS: 5000,
  RETRY_COUNT: 3,
};
```

This pattern guarantees high performance and robust integrity verification on any browser environment.
