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
  console.error("Missing environment variables CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in backend/.env.");
  process.exit(1);
}

const distDir = path.resolve('dist/r2-packs');
const packsDir = path.join(distDir, 'packs');

if (!fs.existsSync(distDir)) {
  console.error(`R2-packs directory not found at: ${distDir}`);
  process.exit(1);
}

const MAX_RETRIES = 5;
const CONCURRENCY_LIMIT = 5;
const DELAY_BETWEEN_REQUESTS_MS = 150;

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
  const uploadQueue = [];

  // Add updated subjects.json & topics.json
  if (fs.existsSync(path.join(distDir, 'subjects.json'))) {
    uploadQueue.push({
      localPath: path.join(distDir, 'subjects.json'),
      objectKey: 'subjects.json',
      contentType: 'application/json'
    });
  }
  if (fs.existsSync(path.join(distDir, 'topics.json'))) {
    uploadQueue.push({
      localPath: path.join(distDir, 'topics.json'),
      objectKey: 'topics.json',
      contentType: 'application/json'
    });
  }

  // Scan packs to find files containing NEET PG questions or starting with neet_pg_
  if (fs.existsSync(packsDir)) {
    const files = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
    console.log(`Scanning ${files.length} packs to find NEET PG files...`);
    for (const file of files) {
      if (file.startsWith('neet_pg_')) {
        uploadQueue.push({
          localPath: path.join(packsDir, file),
          objectKey: `packs/${file}`,
          contentType: 'application/json'
        });
        continue;
      }
      try {
        const data = JSON.parse(fs.readFileSync(path.join(packsDir, file), 'utf-8'));
        const hasNeet = Array.isArray(data) && data.some(q => q.examType === 'NEET PG');
        if (hasNeet) {
          uploadQueue.push({
            localPath: path.join(packsDir, file),
            objectKey: `packs/${file}`,
            contentType: 'application/json'
          });
        }
      } catch (err) {
        console.warn(`Failed to read pack ${file} during scan:`, err);
      }
    }
  }

  console.log(`Total files identified to upload: ${uploadQueue.length}`);

  const startTime = Date.now();
  let succeeded = 0;
  let failed = 0;
  let activeUploads = 0;
  let index = 0;

  console.log(`Starting upload of ${uploadQueue.length} files...`);
  console.log(`Concurrency limit: ${CONCURRENCY_LIMIT} | Request delay: ${DELAY_BETWEEN_REQUESTS_MS}ms`);

  return new Promise((resolve) => {
    function startNext() {
      if (index >= uploadQueue.length) {
        if (activeUploads === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const rate = (uploadQueue.length / parseFloat(elapsed)).toFixed(1);
          console.log(`\nUpload complete!`);
          console.log(`Attempted: ${uploadQueue.length}`);
          console.log(`Succeeded: ${succeeded}`);
          console.log(`Failed: ${failed}`);
          console.log(`Time elapsed: ${elapsed}s (${rate} files/sec)`);
          resolve();
        }
        return;
      }

      const item = uploadQueue[index++];
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
        if (totalDone % 25 === 0 || totalDone === uploadQueue.length) {
          const pct = ((totalDone / uploadQueue.length) * 100).toFixed(1);
          console.log(`Progress: ${totalDone}/${uploadQueue.length} (${pct}%) | Active: ${activeUploads} | Succeeded: ${succeeded} | Failed: ${failed}`);
        }

        startNext();
      });
    }

    // Initialize the pool with a staggered start to throttle request rate
    for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, uploadQueue.length); i++) {
      setTimeout(() => startNext(), i * DELAY_BETWEEN_REQUESTS_MS);
    }
  });
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
