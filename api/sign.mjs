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
  if(req.method !== 'POST') return res.status(405).json({ error: 'post only' });

  const jwt = (req.headers.authorization || '').replace(/^Bearer /, '');
  if(!jwt) return res.status(401).json({ error: 'sign in first' });

  // ask supabase who this is rather than trusting anything in the token
  const who = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + jwt, apikey: process.env.SUPABASE_PUBLISHABLE_KEY }
  });
  if(!who.ok) return res.status(401).json({ error: 'not signed in' });

  const files = (req.body && req.body.files) || [];
  if(!Array.isArray(files) || !files.length || files.length > 500)
    return res.status(400).json({ error: 'files must be 1 to 500 entries' });

  const aws = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });
  const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;

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
