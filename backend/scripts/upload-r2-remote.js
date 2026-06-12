import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

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

const files = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
console.log(`Found ${files.length} question packs to seed into remote R2 bucket...`);

const CONCURRENCY_LIMIT = 5;
const MAX_RETRIES = 5;

async function uploadFile(file, attempt = 1) {
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
      if (attempt >= MAX_RETRIES) {
        return { file, success: false, error: `Rate limited (429) and reached max retry limit of ${MAX_RETRIES} attempts in uploadFile.` };
      }
      const retryAfter = res.headers.get('Retry-After');
      let delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed)) {
          delay = parsed * 1000;
        }
      }
      console.warn(`Rate limited (429) on ${file}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFile(file, attempt + 1);
    } else {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
      console.warn(`Error on ${file}: ${err.message}. Retrying attempt ${attempt}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadFile(file, attempt + 1);
    }
    return { file, success: false, error: err.message };
  }
}

async function main() {
  const startTime = Date.now();
  let completed = 0;
  
  // Process in chunks to limit concurrency
  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const chunk = files.slice(i, i + CONCURRENCY_LIMIT);
    
    // Start each upload with a 150ms delay stagger between starts
    const promises = chunk.map((file, index) => {
      return new Promise(resolve => setTimeout(resolve, index * 150))
        .then(() => uploadFile(file));
    });
    
    const results = await Promise.all(promises);
    completed += results.length;
    
    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;
    
    console.log(`Progress: ${completed}/${files.length} uploads done... (${succeeded} ok, ${failed} failed)`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nFinished remote R2 seeding in ${elapsed}s!`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
