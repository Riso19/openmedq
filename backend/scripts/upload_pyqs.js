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

const distDir = path.resolve('dist/r2-packs');
const packsDir = path.join(distDir, 'packs');
const imagesDir = path.join(distDir, 'images');

if (!fs.existsSync(distDir)) {
  console.error(`R2-packs directory not found at: ${distDir}`);
  process.exit(1);
}

const MAX_RETRIES = 5;

// Helper to list all objects in R2 with robust retries and correct response parsing
async function listRemoteObjects() {
  const existingKeys = new Set();
  let cursor = null;
  let hasMore = true;
  let page = 1;

  console.log('Fetching existing objects from remote R2 bucket...');

  while (hasMore) {
    let url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects?per_page=1000`;
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

const CONCURRENCY_LIMIT = 5; // Low concurrency to avoid Cloudflare REST API rate limiting
const DELAY_BETWEEN_REQUESTS_MS = 150; // Delay to throttle requests (150ms staggered)

async function uploadFileWithRetry(localPath, objectKey, contentType, attempt = 1) {
  const fileContent = fs.readFileSync(localPath);
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${objectKey}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': contentType
      },
      body: fileContent
    });

    if (res.status === 200) {
      const data = await res.json();
      if (data.success) {
        return { objectKey, success: true };
      }
      throw new Error(JSON.stringify(data.errors));
    } else if (res.status === 429) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Rate limited (429) on ${objectKey}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileWithRetry(localPath, objectKey, contentType, attempt + 1);
    } else {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Error on ${objectKey}: ${err.message}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFileWithRetry(localPath, objectKey, contentType, attempt + 1);
    }
    return { objectKey, success: false, error: err.message };
  }
}

async function main() {
  const existingKeys = await listRemoteObjects();

  const uploadQueue = [];

  // Add updated subjects.json & topics.json (always upload these)
  if (fs.existsSync(path.join(distDir, 'subjects.json'))) {
    uploadQueue.push({
      localPath: path.join(distDir, 'subjects.json'),
      objectKey: 'subjects.json',
      contentType: 'application/json',
      alwaysUpload: true
    });
  }
  if (fs.existsSync(path.join(distDir, 'topics.json'))) {
    uploadQueue.push({
      localPath: path.join(distDir, 'topics.json'),
      objectKey: 'topics.json',
      contentType: 'application/json',
      alwaysUpload: true
    });
  }

  // Add question packs
  if (fs.existsSync(packsDir)) {
    const packFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
    for (const file of packFiles) {
      uploadQueue.push({
        localPath: path.join(packsDir, file),
        objectKey: `packs/${file}`,
        contentType: 'application/json',
        alwaysUpload: false
      });
    }
  }

  // Add images
  if (fs.existsSync(imagesDir)) {
    const imgFiles = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png'));
    for (const file of imgFiles) {
      uploadQueue.push({
        localPath: path.join(imagesDir, file),
        objectKey: `images/${file}`,
        contentType: 'image/png',
        alwaysUpload: false
      });
    }
  }

  const overwrite = process.argv.includes('--overwrite');
  const filesToUpload = overwrite 
    ? uploadQueue 
    : uploadQueue.filter(item => item.alwaysUpload || !existingKeys.has(item.objectKey));

  console.log(`Total queue size: ${uploadQueue.length} files`);
  console.log(`Files to upload to R2 (excluding existing): ${filesToUpload.length}`);

  if (filesToUpload.length === 0) {
    console.log('All files are already uploaded! Nothing to do.');
    return;
  }

  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let activeUploads = 0;
  let index = 0;

  console.log(`Starting upload of ${filesToUpload.length} files...`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT} | Request delay: ${DELAY_BETWEEN_REQUESTS_MS}ms`);

  return new Promise((resolve) => {
    function startNext() {
      if (index >= filesToUpload.length) {
        if (activeUploads === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const rate = (filesToUpload.length / parseFloat(elapsed)).toFixed(1);
          console.log(`\nUpload complete!`);
          console.log(`Attempted: ${filesToUpload.length}`);
          console.log(`Succeeded: ${succeeded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Time elapsed: ${elapsed}s (${rate} files/sec)`);
          resolve();
        }
        return;
      }

      const item = filesToUpload[index++];
      activeUploads++;

      uploadFileWithRetry(item.localPath, item.objectKey, item.contentType).then((res) => {
        activeUploads--;
        if (res.success) {
          succeeded++;
        } else {
          failed++;
          console.error(`Failed to upload ${res.objectKey}: ${res.error}`);
        }

        const totalDone = succeeded + failed;
        if (totalDone % 25 === 0 || totalDone === filesToUpload.length) {
          const pct = ((totalDone / filesToUpload.length) * 100).toFixed(1);
          console.log(`Progress: ${totalDone}/${filesToUpload.length} (${pct}%) | Active: ${activeUploads} | Succeeded: ${succeeded} | Failed: ${failed}`);
        }

        startNext();
      });
    }

    // Initialize the pool with a staggered start to throttle request rate
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, filesToUpload.length); i++) {
      setTimeout(() => startNext(), i * DELAY_BETWEEN_REQUESTS_MS);
    }
  });
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
