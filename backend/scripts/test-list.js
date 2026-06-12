import 'dotenv/config';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;
const BUCKET_NAME = 'openmedq-assets';

if (!ACCOUNT_ID || !API_TOKEN) {
  throw new Error('Missing environment variables CF_ACCOUNT_ID or CF_API_TOKEN.');
}

async function testList() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects?prefix=packs/&limit=10`;
  console.log(`Fetching from: ${url}`);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testList();
