// ping-indexnow.js - Instantly submits all 28 URLs to the IndexNow protocol
const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = 'snapsignfit.com';
const KEY = '11d61596f2644fae9eb11c606562095f';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// Read pages from pages.json
const pagesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.json'), 'utf8'));

const urlList = [
  `https://${HOST}/`,
  `https://${HOST}/bn/`
];

pagesData.forEach(p => {
  urlList.push(`https://${HOST}/${p.slug}/`);
  urlList.push(`https://${HOST}/bn/${p.slug}/`);
});

const payload = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urlList
});

const options = {
  hostname: 'api.indexnow.org',
  port: 443,
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log(`Submitting ${urlList.length} URLs to IndexNow (api.indexnow.org)...`);

const req = https.request(options, res => {
  console.log(`IndexNow Response Status: ${res.statusCode} ${res.statusMessage}`);
  res.on('data', d => process.stdout.write(d));
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log('\n[SUCCESS] IndexNow ping received and queued for immediate indexing.');
    } else {
      console.log('\n[INFO] Response code:', res.statusCode);
    }
  });
});

req.on('error', error => {
  console.error('[ERROR] IndexNow ping failed:', error.message);
});

req.write(payload);
req.end();
