import fs from 'node:fs';
import path from 'node:path';

import 'dotenv/config';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;
const BUCKET_NAME = 'openmedq-assets';

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Error: Missing environment variables CF_ACCOUNT_ID or CF_API_TOKEN.');
  process.exit(1);
}

const packsDir = path.resolve('dist/r2-packs/packs');
if (!fs.existsSync(packsDir)) {
  console.error(`Packs directory not found at: ${packsDir}`);
  process.exit(1);
}

const localFiles = new Set(fs.readdirSync(packsDir).filter(f => f.endsWith('.json')));
console.log(`Found ${localFiles.size} local question packs in dist/r2-packs/packs/`);

const MAX_RETRIES = 5;

// Helper to list all objects in R2
async function listRemoteObjects() {
  const existingObjects = [];
  let cursor = null;
  let hasMore = true;
  let page = 1;

  console.log('Fetching existing objects from remote R2 bucket...');

  while (hasMore) {
    let url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects?prefix=packs/&per_page=1000`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    let attempt = 1;
    let pageData = null;

    while (attempt <= MAX_RETRIES) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.status === 200) {
          const data = await res.json();
          if (data.success) {
            pageData = data;
            break;
          }
          throw new Error(JSON.stringify(data.errors));
        } else if (res.status === 429) {
          const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          console.warn(`List objects rate limited (429). Retrying page ${page} (attempt ${attempt}/${MAX_RETRIES}) in ${(delay / 1000).toFixed(1)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
        } else {
          const text = await res.text();
          throw new Error(`HTTP ${res.status} - ${text}`);
        }
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          throw err;
        }
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.warn(`List objects error: ${err.message}. Retrying page ${page} (attempt ${attempt}/${MAX_RETRIES}) in ${(delay / 1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }

    const objects = pageData?.result || [];
    for (const obj of objects) {
      existingObjects.push(obj.key);
    }

    console.log(`Page ${page}: Retrieved ${objects.length} keys (Total remote keys: ${existingObjects.length})`);

    cursor = pageData?.result_info?.cursor;
    hasMore = pageData?.result_info?.is_truncated && cursor;
    page++;
  }

  return existingObjects;
}

const CONCURRENCY_LIMIT = 10; 
const DELAY_BETWEEN_REQUESTS_MS = 100;

async function deleteFileWithRetry(key, attempt = 1) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200 || res.status === 204) {
      return { key, success: true };
    } else if (res.status === 429) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Rate limited (429) on deleting ${key}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return deleteFileWithRetry(key, attempt + 1);
    } else {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Error on deleting ${key}: ${err.message}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return deleteFileWithRetry(key, attempt + 1);
    }
    return { key, success: false, error: err.message };
  }
}

async function main() {
  const remoteKeys = await listRemoteObjects();

  const staleKeys = remoteKeys.filter(key => {
    // Extract filename from packs/filename.json
    const parts = key.split('/');
    const filename = parts[parts.length - 1];
    return !localFiles.has(filename);
  });

  console.log(`\nAnalysis:`);
  console.log(`Total remote files: ${remoteKeys.length}`);
  console.log(`Total local files: ${localFiles.size}`);
  console.log(`Stale remote files to prune: ${staleKeys.length}`);

  if (staleKeys.length === 0) {
    console.log('No stale files found in the remote R2 bucket. All clean!');
    return;
  }

  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let activeDeletes = 0;
  let index = 0;

  console.log(`Starting pruning of ${staleKeys.length} stale files...`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT} | Request delay: ${DELAY_BETWEEN_REQUESTS_MS}ms`);

  return new Promise((resolve) => {
    function startNext() {
      if (index >= staleKeys.length) {
        if (activeDeletes === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`\nPruning complete!`);
          console.log(`Succeeded: ${succeeded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Time elapsed: ${elapsed}s`);
          resolve();
        }
        return;
      }

      const key = staleKeys[index++];
      activeDeletes++;

      deleteFileWithRetry(key).then((res) => {
        activeDeletes--;
        if (res.success) {
          succeeded++;
        } else {
          failed++;
          console.error(`Failed to delete ${res.key}: ${res.error}`);
        }

        const totalDone = succeeded + failed;
        if (totalDone % 50 === 0 || totalDone === staleKeys.length) {
          const pct = ((totalDone / staleKeys.length) * 100).toFixed(1);
          console.log(`Progress: ${totalDone}/${staleKeys.length} (${pct}%) | Active: ${activeDeletes} | Succeeded: ${succeeded} | Failed: ${failed}`);
        }

        startNext();
      });
    }

    // Initialize pool
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, staleKeys.length); i++) {
      setTimeout(() => startNext(), i * DELAY_BETWEEN_REQUESTS_MS);
    }
  });
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
