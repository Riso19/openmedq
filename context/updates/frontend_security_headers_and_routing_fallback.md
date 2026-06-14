# SPA Routing Fallbacks and Frontend Security Headers

This document registers the learning and standards for deploying SPA frontends on Cloudflare Pages, ensuring secure trust headers are active and that route fallbacks do not break static files such as `robots.txt` or `security.txt`.

## 🚨 Identified Issues

### 1. Catch-all Redirect Hijacking Static Routes
Single Page Applications (SPAs) use a catch-all route rule (e.g., `/* /index.html 200`) in `_redirects` to delegate routing to the client side.
* **Problem**: When a client or crawler requests files that do not exist (such as `/robots.txt` or `/.well-known/security.txt`), the catch-all redirect serves the root `index.html` (the app HTML) with an HTTP 200 status code, rather than a 404 or the expected policy contents.
* **Remediation**: Create real physical files under `frontend/public/` (e.g., [robots.txt](file:///Users/sain/development/openmedq/frontend/public/robots.txt) and [.well-known/security.txt](file:///Users/sain/development/openmedq/frontend/public/.well-known/security.txt)). Cloudflare Pages automatically prioritizes serving static files over applying wildcard redirect rules.

### 2. Missing Security Headers on Frontend Assets
While the Hono backend is configured with global security headers, the frontend static assets served by Cloudflare Pages require separate configuration to guard against clickjacking, MIME-sniffing, and cross-site scripting (XSS).

### 3. Clerk SDK Web Worker Blocker (CSP)
* **Problem**: When Clerk SDK starts up in the browser, it attempts to spawn a Web Worker using a `blob:` URL. In the absence of a `worker-src` directive in the Content Security Policy, browsers fallback to the restricted `script-src` directive, blocking the creation of the worker and throwing a CSP violation error.
* **Remediation**: Explicitly add `worker-src 'self' blob:;` to the CSP header definition in `_headers`.

### 4. SEO URL Duplication for `/index.html`
* **Problem**: In SPA environments, the root path `/` and `/index.html` resolve to the exact same page content. Search engine crawlers index these as distinct duplicates, which dilutes SEO ranking authority (link equity).
* **Remediation**: Add a 301 redirection rule for `/index.html` at the top of the `_redirects` file before the catch-all SPA route.

---

## 🛠️ Standards and Remediation

### 1. Exclude Wildcard Redirects via Static Files
Always place standard static metadata and discovery files in the `frontend/public/` directory so they bypass catch-all redirect rules:
* **robots.txt**: Configures crawler behavior.
* **.well-known/security.txt**: A standardized contact file (RFC 9116) listing vulnerability disclosure processes.

### 2. Implement Cloudflare Pages Custom `_headers`
Deploy a custom [_headers](file:///Users/sain/development/openmedq/frontend/public/_headers) configuration file to apply critical headers to all routes (`/*`):

* **Strict-Transport-Security**: Enforce HTTPS for a year (`max-age=31536000; includeSubDomains; preload`).
* **X-Frame-Options & CSP frame-ancestors**: Set to `DENY` / `'none'` to completely protect the app against clickjacking attacks.
* **Referrer-Policy**: Minimize referrer leakages using `strict-origin-when-cross-origin`.
* **Content-Security-Policy (CSP)**: Establish strict resource sources. Ensure all external APIs, CDNs, and CDNs like Clerk, GitHub, and Unsplash are explicitly whitelisted:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://clerk.openmedq.com; connect-src 'self' https://api.openmedq.com https://clerk.openmedq.com https://cdn.openmedq.com https://assets.openmedq.com https://api.github.com; img-src 'self' data: https://images.clerk-cdn.com https://img.clerk.com https://cdn.openmedq.com https://assets.openmedq.com https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://clerk.openmedq.com; worker-src 'self' blob:; frame-ancestors 'none'; upgrade-insecure-requests;
  ```

### 3. Clerk Web Worker CSP Support
Always ensure `worker-src 'self' blob:;` is included in the CSP. This is necessary because Clerk utilizes dynamic inline blobs for sandboxed background execution.

### 4. URL Canonicalization Redirect for `/index.html`
Place the `/index.html / 301` redirect rule at the very top of `_redirects` so it takes precedence over the wildcard `/*` redirect rule:
```text
/index.html / 301
```
