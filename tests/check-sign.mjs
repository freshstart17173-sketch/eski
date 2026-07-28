/* api/sign.mjs, checked with dummy credentials. no network, no playwright:
     node tests/check-sign.mjs
   this covers a trust boundary, so it runs on its own rather than living
   inside the browser suite. */
import assert from 'node:assert';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dummy';
process.env.R2_ACCOUNT_ID = 'acct123';
process.env.R2_ACCESS_KEY_ID = 'AKIADUMMY';
process.env.R2_SECRET_ACCESS_KEY = 'secretdummy';
process.env.R2_BUCKET = 'eski';

// stand in for supabase's /auth/v1/user check
let userOk = true;
global.fetch = async () => ({ ok: userOk });

const { default: handler } = await import('../api/sign.mjs');

function fakeRes(){
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const call = req => { const res = fakeRes(); return handler(req, res).then(() => res); };

const HASH = 'a'.repeat(64);

let r = await call({ method: 'GET', headers: {}, body: {} });
assert.equal(r.code, 405, 'GET is rejected');

r = await call({ method: 'POST', headers: {}, body: { files: [{ hash: HASH, ext: 'png' }] } });
assert.equal(r.code, 401, 'no bearer token is rejected');

userOk = false;
r = await call({ method: 'POST', headers: { authorization: 'Bearer bad' },
  body: { files: [{ hash: HASH, ext: 'png' }] } });
assert.equal(r.code, 401, 'a token supabase rejects is rejected');
userOk = true;

r = await call({ method: 'POST', headers: { authorization: 'Bearer ok' },
  body: { files: [{ hash: 'nope', ext: 'png' }] } });
assert.equal(r.code, 400, 'a non-sha256 hash is rejected');

r = await call({ method: 'POST', headers: { authorization: 'Bearer ok' },
  body: { files: [{ hash: HASH, ext: 'exe' }] } });
assert.equal(r.code, 400, 'an extension outside the allowlist is rejected');

r = await call({ method: 'POST', headers: { authorization: 'Bearer ok' },
  body: { files: [{ hash: HASH, ext: 'png' }, { hash: 'b'.repeat(64), ext: 'mp3' }] } });
assert.equal(r.code, 200);
const [png, mp3] = r.body.files;
assert.equal(png.key, 'aa/' + HASH + '.png', 'key is sharded by the first two hex chars');
assert.equal(mp3.key, 'bb/' + 'b'.repeat(64) + '.mp3');
const u = new URL(png.url);
assert.equal(u.host, 'acct123.r2.cloudflarestorage.com', 'signed against the r2 s3 endpoint');
assert.equal(u.pathname, '/eski/aa/' + HASH + '.png', 'bucket and key in the path');
assert.match(u.searchParams.get('X-Amz-Algorithm') || '', /^AWS4-HMAC-SHA256$/);
assert.equal((u.searchParams.get('X-Amz-Signature') || '').length, 64, 'a real signature is attached');
assert.equal(u.searchParams.get('X-Amz-Expires'), '3600');
assert.match(u.searchParams.get('X-Amz-Credential') || '',
  /^AKIADUMMY\/\d{8}\/auto\/s3\/aws4_request$/);

/* the real deploy arrived with whole KEY=value lines pasted into vercel's value
   box, plus a trailing slash. that produced "Failed to parse URL from
   SUPABASE_URL=https://...". the signer cleans its own env, so the same
   mangled input must still work. */
let seen = null;
global.fetch = async (url) => { seen = String(url); return { ok: userOk }; };
process.env.SUPABASE_URL = 'SUPABASE_URL=https://example.supabase.co/';
process.env.SUPABASE_PUBLISHABLE_KEY = 'SUPABASE_PUBLISHABLE_KEY=sb_publishable_dummy';
process.env.R2_BUCKET = '"eski"';
process.env.R2_ACCOUNT_ID = ' acct123\n';

r = await call({ method: 'POST', headers: { authorization: 'Bearer ok' },
  body: { files: [{ hash: HASH, ext: 'png' }] } });
assert.equal(r.code, 200, 'a pasted KEY=value env still signs');
assert.equal(seen, 'https://example.supabase.co/auth/v1/user',
  'the name prefix and the trailing slash are stripped from the auth url');
const u2 = new URL(r.body.files[0].url);
assert.equal(u2.host, 'acct123.r2.cloudflarestorage.com', 'whitespace is trimmed from the account id');
assert.equal(u2.pathname, '/eski/aa/' + HASH + '.png', 'quotes are stripped from the bucket name');

console.log('sign.mjs: all checks passed');
