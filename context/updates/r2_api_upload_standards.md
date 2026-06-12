# context/updates/r2_api_upload_standards.md

## 📦 Cloudflare R2 Object Upload REST API Standards

When uploading files (like question packs) from local filesystems to a remote Cloudflare R2 bucket where standard S3 credentials are not configured or available:

### 1. API Endpoint and Authentication
Instead of spawning `npx wrangler` child processes sequentially (which introduces massive Node runtime startup overhead), use the direct Cloudflare API v4 REST endpoint with Bearer Token authentication:
*   **Method**: `PUT`
*   **URL**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/{bucket_name}/objects/{object_key}`
*   **Headers**:
    ```json
    {
      "Authorization": "Bearer <CLOUDFLARE_API_TOKEN>",
      "Content-Type": "application/json"
    }
    ```

### 2. List Objects Pagination and Response Shape
To implement incremental/delta-only seeding, list remote objects first. Note the following response shape quirks of GET `/accounts/{account_id}/r2/buckets/{bucket_name}/objects`:
*   The raw list of objects is returned directly as an array in the `result` property (e.g. `data.result`), NOT under `data.result.objects`.
*   Pagination metadata is returned in the `result_info` field.
*   Use the `per_page=1000` query parameter (instead of `limit=1000`) to maximize page retrieval size and avoid rate limiting.
*   **Pagination Example**:
    ```javascript
    const objects = data.result || [];
    const cursor = data.result_info?.cursor;
    const hasMore = data.result_info?.is_truncated && cursor;
    ```

### 3. Rate-Limiting Mitigation (HTTP 429)
The Cloudflare Client API v4 has strict rate limits. High-speed bulk uploads will trigger `HTTP 429` errors ("Please wait and consider throttling your request speed").
*   **Throttle Concurrency**: Limit parallel requests to a maximum of 5.
*   **Stagger Requests**: Introduce a staggered queue start delay (e.g., 150ms).
*   **Exponential Backoff**: Intercept `429` status codes and pause/retry using exponential backoff with jitter:
    ```javascript
    if (res.status === 429) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileWithRetry(file, attempt + 1);
    }
    ```
