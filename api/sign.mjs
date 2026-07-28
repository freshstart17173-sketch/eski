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
   mismatch itself; worth doing when uploads come from people you do not know. */
import { AwsClient } from 'aws4fetch';

const EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif',
                     'mp3', 'm4a', 'ogg', 'opus', 'wav', 'flac', 'aac']);

export default async function handler(req, res){
  try{
    return await sign(req, res);
  }catch(e){
    // an uncaught throw would return vercel's html error page, which the studio
    // cannot parse and reports as a blank failure. always answer in json.
    return res.status(500).json({ error: 'signer crashed: ' + (e && e.message || String(e)) });
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

async function sign(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'post only' });

  // a missing env var is the most common deploy mistake here, and it otherwise
  // shows up as a confusing auth failure much further down
  const missing = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'].filter(k => !env(k));
  if(missing.length)
    return res.status(500).json({ error: 'server is missing env vars: ' + missing.join(', ') });

  const jwt = (req.headers.authorization || '').replace(/^Bearer /, '');
  if(!jwt) return res.status(401).json({ error: 'sign in first' });

  // ask supabase who this is rather than trusting anything in the token
  const who = await fetch(env('SUPABASE_URL').replace(/\/+$/, '') + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + jwt, apikey: env('SUPABASE_PUBLISHABLE_KEY') }
  });
  if(!who.ok) return res.status(401).json({ error: 'not signed in' });

  const files = (req.body && req.body.files) || [];
  if(!Array.isArray(files) || !files.length || files.length > 500)
    return res.status(400).json({ error: 'files must be 1 to 500 entries' });

  const aws = new AwsClient({
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto'
  });
  const base = `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${env('R2_BUCKET')}`;

  const out = [];
  for(const f of files){
    const hash = String(f.hash || '').toLowerCase();
    const ext  = String(f.ext  || '').toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(hash) || !EXT.has(ext))
      return res.status(400).json({ error: 'bad hash or extension' });
    const key = `${hash.slice(0, 2)}/${hash}.${ext}`;
    const signed = await aws.sign(`${base}/${key}?X-Amz-Expires=3600`,
      { method: 'PUT', aws: { signQuery: true } });
    out.push({ key, url: signed.url });
  }
  res.status(200).json({ files: out });
}
