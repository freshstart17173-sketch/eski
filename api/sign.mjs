/* signs a batch of R2 PUT urls for a signed-in user.
   the browser then uploads straight to R2, so a 40 page comic (or later a 200
   clip VO) costs this function ONE request and zero bandwidth. nothing streams
   through vercel.

   keys are content-addressed and derived HERE, never accepted from the client:
   a caller can only ever write to <sha256>.<ext>, so it cannot choose a path,
   overwrite someone else's object under a different name, or escape the bucket
   layout.

   ponytail: we do not verify that the uploaded bytes actually hash to the key
   they were signed for. a signed-in user could store junk under a wrong hash.
   the fix is signing an x-amz-checksum-sha256 header so R2 rejects the
   mismatch itself; worth doing when uploads come from people you do not know.

   every failure answer carries an ESK-#### code. the code names the exact line
   that refused, so a pasted toast is enough to find it. the table of causes and
   fixes is ERRORS.txt; keep the two in step. */
import { AwsClient } from 'aws4fetch';

/* the extensions a key may end in. this is a security boundary, not a
   convenience: the key is built HERE from a hash and one of these, so a caller
   can never choose a path or an arbitrary suffix.
   'webm' is the container the studio's opus transcode writes — audio only,
   despite the name. */
const EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif',
                     'mp3', 'm4a', 'ogg', 'opus', 'wav', 'flac', 'aac', 'webm']);

export default async function handler(req, res){
  try{
    return await sign(req, res);
  }catch(e){
    // an uncaught throw would return vercel's html error page, which the studio
    // cannot parse and reports as a blank failure. always answer in json.
    return res.status(500).json({
      code: 'ESK-3007',
      error: 'ESK-3007 signer crashed: ' + (e && e.message || String(e)) });
  }
}

/* vercel's editor wants a VALUE, but the natural thing to copy is the whole
   KEY=value line out of .env.example, which then arrives with its own name
   glued to the front. surrounding quotes and a stray newline are the same class
   of mistake. clean them here, because the alternative is a url parse error
   three calls deeper that names the wrong thing. */
function env(name){
  return (process.env[name] || '')
    .trim()
    .replace(new RegExp('^' + name + '\\s*=\\s*'), '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

const fail = (res, status, code, error) => res.status(status).json({ code, error: code + ' ' + error });

async function sign(req, res){
  if(req.method !== 'POST') return fail(res, 405, 'ESK-3002', 'post only');

  // a missing env var is the most common deploy mistake here, and it otherwise
  // shows up as a confusing auth failure much further down
  const missing = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'].filter(k => !env(k));
  if(missing.length)
    return fail(res, 500, 'ESK-3001', 'server is missing env vars: ' + missing.join(', '));

  /* a url that is not a url fails deep inside fetch with "Failed to parse URL",
     which reads like a network problem and is not one. it is a pasted value
     with a typo, or the anon key pasted into the url slot. */
  let authUrl;
  try{
    authUrl = new URL('/auth/v1/user', env('SUPABASE_URL')).toString();
  }catch(e){
    return fail(res, 500, 'ESK-3012',
      'SUPABASE_URL is not a url: ' + JSON.stringify(env('SUPABASE_URL').slice(0, 60)));
  }

  const jwt = (req.headers.authorization || '').replace(/^Bearer /, '');
  if(!jwt) return fail(res, 401, 'ESK-3003', 'sign in first (no bearer token reached the signer)');

  // ask supabase who this is rather than trusting anything in the token
  let who;
  try{
    who = await fetch(authUrl, {
      headers: { Authorization: 'Bearer ' + jwt, apikey: env('SUPABASE_PUBLISHABLE_KEY') }
    });
  }catch(e){
    // the function could not reach supabase at all: wrong project ref, dns, or
    // the project is paused. distinct from supabase answering "no".
    return fail(res, 502, 'ESK-3010', 'the signer could not reach supabase at ' +
      env('SUPABASE_URL') + ': ' + ((e && e.message) || e));
  }
  if(!who.ok)
    return fail(res, 401, 'ESK-3004', 'supabase rejected the session (auth/v1/user said ' +
      who.status + '). the token is expired, or SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY ' +
      'on vercel belong to a different project than platform.js');

  const files = (req.body && req.body.files) || [];
  if(!Array.isArray(files) || !files.length || files.length > 500)
    return fail(res, 400, 'ESK-3005', 'files must be 1 to 500 entries, got ' +
      (Array.isArray(files) ? files.length : typeof files));

  /* VALIDATE FIRST, THEN CLAIM, THEN SIGN. The hash and extension checks are
     free and local, so they run before anything that costs a round trip —
     there is no sense spending a quota call, or a claim against somebody's
     daily allowance, on a request that was malformed anyway. */
  for(const f of files){
    const hash = String(f.hash || '').toLowerCase();
    const ext  = String(f.ext  || '').toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(hash) || !EXT.has(ext))
      return fail(res, 400, 'ESK-3006', 'bad hash or extension: ' +
        JSON.stringify({ hash: hash.slice(0, 12), ext }));
  }

  /* THE CEILING, CLAIMED BEFORE ANYTHING IS SIGNED.
     500 urls per call with no per-user total meant one person with a script
     could fill the bucket and the bill overnight, and R2 charges per
     operation, so the damage lands before anyone looks.

     The count is claimed rather than checked: claim_upload_quota() adds
     atomically and answers from the value it wrote, so two calls racing
     cannot both see room. It is SECURITY DEFINER and only ever ADDS, which is
     what stops a caller resetting their own tally — the table has no write
     policy at all.

     A FAILURE TO REACH THE COUNTER DOES NOT OPEN THE GATE. If the rpc is
     unreachable the request is refused, because the alternative is that the
     ceiling quietly stops existing exactly when the database is unhappy. */
  try{
    const q = await fetch(env('SUPABASE_URL').replace(/\/+$/, '') +
      '/rest/v1/rpc/claim_upload_quota', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + jwt,
        apikey: env('SUPABASE_PUBLISHABLE_KEY')
      },
      body: JSON.stringify({ n: files.length })
    });
    if(!q.ok){
      const body = await q.text();
      /* 404 means the migration has not been applied. Say which file, rather
         than leaving somebody reading a bare 404 from a url they did not
         write. */
      return fail(res, 503, 'ESK-3014', q.status === 404
        ? 'the upload ceiling is not installed: apply schema-quota.sql'
        : 'the upload ceiling could not be checked (' + q.status + '): ' + body.slice(0, 140));
    }
    const verdict = await q.json();
    if(!verdict || verdict.ok !== true)
      return fail(res, 429, 'ESK-3015',
        'daily upload limit reached (' + (verdict && verdict.used != null ? verdict.used : '?') +
        ' of ' + (verdict && verdict.cap != null ? verdict.cap : '?') +
        ' objects today). it resets at UTC midnight.');
  }catch(e){
    return fail(res, 503, 'ESK-3014',
      'the upload ceiling could not be checked: ' + ((e && e.message) || e));
  }

  const aws = new AwsClient({
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto'
  });
  const base = `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${env('R2_BUCKET')}`;

  const out = [];
  for(const f of files){
    // already validated above, so this only has to derive the key
    const hash = String(f.hash).toLowerCase();
    const ext  = String(f.ext).toLowerCase();
    const key = `${hash.slice(0, 2)}/${hash}.${ext}`;
    try{
      const signed = await aws.sign(`${base}/${key}?X-Amz-Expires=3600`,
        { method: 'PUT', aws: { signQuery: true } });
      out.push({ key, url: signed.url });
    }catch(e){
      // signing is local arithmetic over the secret, so a throw here is a
      // malformed credential, never a network fault
      return fail(res, 500, 'ESK-3011',
        'could not sign an R2 url. check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / ' +
        'R2_ACCOUNT_ID: ' + ((e && e.message) || e));
    }
  }
  res.status(200).json({ files: out });
}
