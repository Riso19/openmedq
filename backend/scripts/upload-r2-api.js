import fs from 'node:fs';
import path from 'node:path';

// Manual .env parser to avoid external dependencies
function loadEnv() {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    }
  }
}

loadEnv();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET_NAME = 'openmedq-assets';

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Missing environment variables CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.");
  process.exit(1);
}

const packsDir = path.resolve('dist/r2-packs/packs');
if (!fs.existsSync(packsDir)) {
  console.error(`Packs directory not found at: ${packsDir}`);
  process.exit(1);
}

const localFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
console.log(`Found ${localFiles.length} local question packs in dist/r2-packs/packs/`);

const MAX_RETRIES = 5;

// Helper to list all objects in R2 with robust retries and correct response parsing
async function listRemoteObjects() {
  const existingKeys = new Set();
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
      existingKeys.add(obj.key);
    }

    console.log(`Page ${page}: Retrieved ${objects.length} keys (Total remote keys: ${existingKeys.size})`);

    cursor = pageData?.result_info?.cursor;
    hasMore = pageData?.result_info?.is_truncated && cursor;
    page++;
  }

  return existingKeys;
}

const CONCURRENCY_LIMIT = 5; // Low concurrency to avoid Cloudflare v4 REST API rate limiting
const DELAY_BETWEEN_REQUESTS_MS = 150; // Delay to throttle requests (150ms staggered)

async function uploadFileWithRetry(file, attempt = 1) {
  const filePath = path.join(packsDir, file);
  const fileContent = fs.readFileSync(filePath);
  const objectKey = `packs/${file}`;
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${objectKey}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: fileContent
    });

    if (res.status === 200) {
      const data = await res.json();
      if (data.success) {
        return { file, success: true };
      }
      throw new Error(JSON.stringify(data.errors));
    } else if (res.status === 429) {
      // Rate limit backoff
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Rate limited (429) on ${file}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileWithRetry(file, attempt + 1);
    } else {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Error on ${file}: ${err.message}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileWithRetry(file, attempt + 1);
    }
    return { file, success: false, error: err.message };
  }
}

async function main() {
  const existingKeys = await listRemoteObjects();

  const overwrite = process.argv.includes('--overwrite');
  const missingFiles = overwrite ? localFiles : localFiles.filter(file => !existingKeys.has(`packs/${file}`));
  console.log(`Total local files: ${localFiles.length}`);
  console.log(`Force uploading all ${missingFiles.length} files to R2...`);

  if (missingFiles.length === 0) {
    console.log('All files are already uploaded! Nothing to do.');
    return;
  }

  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let activeUploads = 0;
  let index = 0;

  console.log(`Starting upload of remaining ${missingFiles.length} files...`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT} | Request delay: ${DELAY_BETWEEN_REQUESTS_MS}ms`);

  return new Promise((resolve) => {
    function startNext() {
      if (index >= missingFiles.length) {
        if (activeUploads === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const rate = (missingFiles.length / parseFloat(elapsed)).toFixed(1);
          console.log(`\nUpload complete!`);
          console.log(`Attempted: ${missingFiles.length}`);
          console.log(`Succeeded: ${succeeded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Time elapsed: ${elapsed}s (${rate} files/sec)`);
          resolve();
        }
        return;
      }

      const file = missingFiles[index++];
      activeUploads++;

      uploadFileWithRetry(file).then((res) => {
        activeUploads--;
        if (res.success) {
          succeeded++;
        } else {
          failed++;
          console.error(`Failed to upload ${res.file}: ${res.error}`);
        }

        const totalDone = succeeded + failed;
        if (totalDone % 25 === 0 || totalDone === missingFiles.length) {
          const pct = ((totalDone / missingFiles.length) * 100).toFixed(1);
          console.log(`Progress: ${totalDone}/${missingFiles.length} (${pct}%) | Active: ${activeUploads} | Succeeded: ${succeeded} | Failed: ${failed}`);
        }

        startNext();
      });
    }

    // Initialize the pool with a staggered start to throttle request rate
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, missingFiles.length); i++) {
      setTimeout(() => startNext(), i * DELAY_BETWEEN_REQUESTS_MS);
    }
  });
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
