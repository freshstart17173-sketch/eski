/* /c/<slug> — the shareable address of one comic.

   The page itself is index.html, unchanged: it reads the slug out of the path
   and opens that comic. This function exists for ONE reason, which index.html
   cannot do for itself — a link pasted into Discord, iMessage, WhatsApp or
   Slack is fetched by a crawler that runs no javascript. A static file can
   only carry one set of og: tags for every comic on the site, so every share
   would preview as the same generic card, or as nothing.

   So: fetch index.html, inject this comic's title, description and cover into
   the head, stream it back. The browser gets exactly the app it would have
   got; the crawler gets a real card.

   Read-only, anon key, RLS applies — a draft is not published and therefore
   has no preview, which is the correct answer rather than an accident. No
   secret is used or needed here.

   Every failure still returns the app: a preview is a nicety and must never
   be the reason somebody cannot open a link. */

const SUPABASE_URL = 'https://zidqagrmxeawpasurpwi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cZuZnUhWmEGESYb7BR1Kzg_nPjR8CZR';   // public, safe to commit
/* THE THIRD COPY OF THE MEDIA HOST, and the one that nearly got left behind.
   platform.js and sw.js were both updated when the bucket moved to
   cdn.eski.lol; this was missed, because nothing on the site reads it — it
   only builds og:image, so the symptom would have been link previews quietly
   still pulling from the rate-limited development hostname, on exactly the
   requests that come from Slack, Discord and iMessage unfurlers.
   tests/structure.js now checks all three. */
const R2_BASE = 'https://cdn.eski.lol';

const esc = s => (s ?? '').toString()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// og:description wants a sentence, not a novel
function trim(s, n){
  s = (s || '').toString().replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export default async function handler(req, res){
  const url = new URL(req.url, 'https://' + (req.headers.host || 'eski.lol'));
  const slug = decodeURIComponent((url.pathname.match(/^\/c\/([^/]+)\/?$/) || [])[1] || '');
  const origin = 'https://' + (req.headers.host || 'eski.lol');

  let html = '';
  try{
    // same deployment, so this is a local hop rather than a trip to the edge
    const r = await fetch(origin + '/index.html');
    html = await r.text();
  }catch(e){
    return res.status(302).setHeader('location', '/').end();
  }

  let comic = null;
  if(slug){
    try{
      const q = new URL(SUPABASE_URL + '/rest/v1/comics');
      q.searchParams.set('select', 'title,description,owner_name,cover_key,thumb_key');
      q.searchParams.set('slug', 'eq.' + slug);
      q.searchParams.set('status', 'eq.published');
      q.searchParams.set('limit', '1');
      const r = await fetch(q, {
        headers: { apikey: SUPABASE_KEY, authorization: 'Bearer ' + SUPABASE_KEY },
        signal: AbortSignal.timeout(2500)
      });
      if(r.ok) comic = (await r.json())[0] || null;
    }catch(e){ /* a preview is a nicety; the app still has to load */ }
  }

  const title = comic ? `${comic.title || 'untitled'} · eski` : 'eski';
  const desc  = comic
    ? trim(comic.description || `a comic with a soundtrack${
        comic.owner_name ? ', by ' + comic.owner_name : ''}.`, 200)
    : 'comics with soundtracks and voiceover.';
  const img = comic && (comic.cover_key || comic.thumb_key)
    ? R2_BASE + '/' + (comic.cover_key || comic.thumb_key)
    : origin + '/eski_logo.png';

  const meta = `
<meta property="og:type" content="article">
<meta property="og:site_name" content="eski">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(origin + '/c/' + encodeURIComponent(slug))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${esc(origin + '/c/' + encodeURIComponent(slug))}">
`;

  /* replace the static <title> rather than adding a second one — two title
     tags and the crawler picks whichever it likes. */
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<\/head>/i, meta + '</head>');

  res.setHeader('content-type', 'text/html; charset=utf-8');
  /* short shared cache so a crawler hitting the same link repeatedly is cheap,
     but a retitled or unpublished comic corrects itself within the minute. */
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
  return res.status(comic ? 200 : 404).send(html);
}
