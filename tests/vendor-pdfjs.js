/* vendors pdf.js locally so smoke tests run without egress */
const fs = require('fs');
const path = require('path');
const https = require('https');

const VENDOR = path.join(__dirname, 'vendor');
fs.mkdirSync(VENDOR, { recursive: true });

const FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

for (const url of FILES) {
  const dest = path.join(VENDOR, url.split('/').pop());
  if (fs.existsSync(dest)) { console.log('have', dest); continue; }
  https.get(url, res => {
    if (res.statusCode !== 200) { console.error(url, 'gave', res.statusCode); process.exitCode = 1; return; }
    res.pipe(fs.createWriteStream(dest)).on('finish', () => console.log('got', dest));
  }).on('error', e => { console.error(url, e.message); process.exitCode = 1; });
}
