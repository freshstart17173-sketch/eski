/* eski platform layer: sign in, and the current session.
   shared by every surface. the styles below are written in tokens.css's
   tokens with plain fallbacks, so the control sits in the nav's voice on a
   page that has them and still renders on a page that does not.

   FAILS SOFT, ALWAYS. blocked cdn, no network, unset key: no auth ui is
   painted and every page behaves exactly as it did before. that is also the
   path the smoke suite takes.

   the url and the publishable key are public and browser-safe by design;
   see .env.example. the SECRET keys never appear here. */

const SUPABASE_URL = 'https://zidqagrmxeawpasurpwi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cZuZnUhWmEGESYb7BR1Kzg_nPjR8CZR';   // public, safe to commit

/* WHERE PUBLISHED MEDIA IS SERVED FROM, and the single biggest thing still
   slowing the reader down.

   pub-*.r2.dev is Cloudflare's DEVELOPMENT hostname for a public bucket.
   Their docs are unambiguous: it "is rate-limited and should only be used
   for development purposes", and features "like WAF custom rules, caching,
   access controls, or Bot Management" require a custom domain — caching
   included. So today every page and every clip is fetched from the origin,
   past no edge cache, on a hostname that will start returning 429s under
   load. Measured from here: ~1s for a 1 MB page, no Cache-Control header of
   any kind on the response.

   DONE (2026-08-15): cdn.eski.lol is attached and serving — verified live
   against a real object key, 200 with the rest of the site. The database
   stores object KEYS and never urls, so this was the whole migration: no
   rows changed, everything already published is now served from the edge.

   https://developers.cloudflare.com/r2/buckets/public-buckets/ */
const R2_BASE = 'https://cdn.eski.lol';

// add 'discord' back once it is enabled in the supabase dashboard. a provider
// offered here but not enabled there fails at the redirect with a raw error
// page, so this is the list that actually works, not the list we want.
const PROVIDERS = ['google'];

/* THERE IS NO PROFILE BUTTON.
   signed in, this used to paint an avatar and your name, and the menu behind
   it offered exactly two things: your profile, which is already a word in the
   nav two inches to the left, and sign out. so the avatar was a second door
   to a room you could already see, and the only thing it uniquely did was
   sign you out. that is what it is now: one word, in the nav's voice.
   signed out it is still the sign-in control, because there the menu really
   does hold something — the providers. */
/* eski-pivot: no outlines, state is a background fill — see
   .claude/skills/eski-pivot/SKILL.md. Written in plain tokens rather than
   pivot.css's own classes, because this file is shared by pages that don't
   load pivot.css (admin.html, legal.html); the token names are the one
   thing every page already has. */
const CSS = `
.auth{position:relative;display:flex;align-items:center;margin-left:var(--s4,16px)}
.auth-btn{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:0;
  border-radius:var(--r,0);background:var(--surface,var(--bg-2,#f1f1f1));color:var(--ink,inherit);
  font:inherit;font-size:var(--fs-xs,12.5px);text-transform:uppercase;letter-spacing:.06em;
  cursor:pointer;line-height:1.2;white-space:nowrap;transition:background 160ms}
.auth-btn:hover{background:var(--plate-bg,var(--bg-3,#eaeaea))}
.auth-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:220px;z-index:500;
  display:none;flex-direction:column;gap:8px;padding:12px;border-radius:var(--r,0);
  border:0;box-shadow:0 8px 30px rgba(0,0,0,.22);color:var(--ink,inherit);
  background:var(--paper,var(--bg-1,#fff))}
.auth-menu.open{display:flex}
.auth-menu small{color:var(--muted,var(--label,#6b6b6b));font-size:12.5px;
  line-height:1.4;letter-spacing:0}
@media(max-width:640px){.auth{margin-left:var(--s3,12px)}
  .auth-btn{min-height:42px}}
`;

let sb = null, user = null, bootError = null;
const esc = s => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function nameOf(u){
  const m = u.user_metadata || {};
  return m.full_name || m.name || m.user_name || u.email || 'you';
}

function paint(){
  if(!sb) return;                                  // no client, no auth ui
  const header = document.querySelector('.site-header');
  if(!header) return;
  if(!document.getElementById('auth-css')){
    const st = document.createElement('style');
    st.id = 'auth-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  let box = header.querySelector('.auth');
  if(!box){ box = document.createElement('div'); box.className = 'auth'; header.appendChild(box); }
  box.innerHTML = '';

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'auth-btn';
  const menu = document.createElement('div');
  menu.className = 'auth-menu';

  if(user){
    /* SIGNED IN, THE BAR SAYS NOTHING. Sign out used to live here, which put
       the one destructive control on the site permanently one click from
       every page, next to the four words you navigate with. It is in the
       profile's settings tab now, where you go on purpose. */
    box.remove();
    return;
  }
  {
    btn.title = 'sign in';
    btn.textContent = 'sign in';   // no avatar to fall back on, so never collapses
    menu.innerHTML = '<small>sign in to publish, follow artists, and join the conversation.</small>';
    for(const p of PROVIDERS){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'auth-btn'; b.textContent = p;
      /* a provider listed here but not enabled in the supabase dashboard fails
         BEFORE the redirect, and silently: the menu just does nothing. say so. */
      b.onclick = async () => {
        const { error } = await sb.auth.signInWithOAuth(
          { provider: p, options: { redirectTo: location.href } });
        if(error){
          menu.innerHTML = `<small>ESK-2003 ${esc(p)} sign in did not start: ` +
            `${esc(error.message)}. it is probably not enabled for this project ` +
            `in the supabase dashboard.</small>`;
          menu.classList.add('open');
        }
      };
      menu.appendChild(b);
    }
  }
  btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };
  box.append(btn, menu);
}

/* ARCHITECTURE.md has said since the pivot that onboarding.html "runs once,
   on first sign-in, via platform.js's maybeOnboard()" — it never existed.
   The page itself works fine; it was just unreachable except by manually
   navigating there or hitting profile.html's own "no profile" message.
   Cheap enough to check on every sign-in (one indexed lookup) rather than
   trying to track "have we already checked this session" somewhere. */
async function maybeOnboard(u){
  if(!u || !sb || /(^|\/)onboarding\.html$/.test(location.pathname)) return;
  const { data } = await sb.from('profiles').select('id').eq('id', u.id).maybeSingle();
  if(!data) location.replace('onboarding.html?next=' + encodeURIComponent(location.pathname + location.search));
}

function setUser(u){
  user = u;
  // the pages are classic scripts and cannot import this module
  document.dispatchEvent(new CustomEvent('eski-auth', { detail: { user: u } }));
  paint();
  maybeOnboard(u);
}

document.addEventListener('click',
  () => document.querySelectorAll('.auth-menu.open').forEach(m => m.classList.remove('open')));

/* pages are classic scripts and cannot import this module, so the surface they
   get is window.eski plus the eski-auth event. `ready` resolves once boot has
   settled either way, so a page can await the client instead of polling for it
   or racing it. */
/* postgres and postgrest already say precisely what went wrong, in codes nobody
   memorises. translate the handful we can actually hit into the fix, so a
   pasted toast carries the answer with it rather than just the symptom. every
   page shares this: it lives here because platform.js is on all four. */
const DB_HINTS = {
  '42P01': 'that table does not exist. apply schema.sql (and schema-profiles.sql) in the supabase sql editor.',
  '42703': 'that column does not exist. the database is a migration behind the app; re-apply schema.sql.',
  'PGRST204': 'postgrest does not know that column yet. re-apply the schema, then reload the schema cache in supabase.',
  '42501': 'row level security refused this. the policy for that table is missing or does not cover this user.',
  'PGRST301': 'your session expired. sign out and back in.',
  'PGRST116': 'no row came back. it may be a draft you do not own, or it was deleted.',
  '23505': 'something unique is taken (a slug or a handle).',
  '23503': 'this points at a row that does not exist. a parent insert failed earlier.',
  '23502': 'a required column arrived empty.',
  '22P02': 'that id is not a valid uuid.'
};

/* eskiCode: which call site refused. e: whatever supabase handed back. */
function dbError(eskiCode, what, e){
  const code = (e && e.code) || '';
  const hint = DB_HINTS[code] ? ' ' + DB_HINTS[code] : '';
  return `${eskiCode} ${what}: ${(e && e.message) || e}${code ? ' [' + code + ']' : ''}.${hint}`;
}

let markReady;
window.eski = {
  get user(){ return user; },
  get sb(){ return sb; },
  get bootError(){ return bootError; },
  mediaBase: R2_BASE,
  mediaUrl: key => key ? R2_BASE + '/' + key : null,
  dbError,
  ready: new Promise(res => { markReady = res; })
};

/* boot has four distinct ways to fail and they need four different fixes, so
   each one carries its own code into bootError. every page that renders
   bootError therefore names the actual cause. see ERRORS.txt. */
(async function boot(){
  let stage = 'ESK-1001';
  try{
    if(!SUPABASE_URL || SUPABASE_KEY.includes('REPLACE_ME') || !SUPABASE_KEY)
      throw new Error('ESK-1003 SUPABASE_URL / SUPABASE_KEY are not set in platform.js');
    /* vendored, same origin, cached with the rest of the app. it used to come
       from esm.sh, whose entry point is a 458 byte re-export, so every page
       waited on two chained requests to someone else's host before it could
       run a single query. rebuild with `node tests/vendor-supabase.js`. */
    const { createClient } = await import('./vendor/supabase.js');
    stage = 'ESK-1002';
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    stage = 'ESK-1004';
    const { data } = await sb.auth.getSession();
    setUser((data && data.session && data.session.user) || null);
    sb.auth.onAuthStateChange((_e, s) => setUser((s && s.user) || null));
  }catch(e){
    const msg = (e && e.message) || String(e);
    bootError = /^ESK-/.test(msg) ? msg : stage + ' ' + msg;
    // no client. still announce the signed-out state, so a page listening for
    // eski-auth gets a definitive answer instead of silence and can render its
    // signed-out ui once rather than guessing.
    sb = null;
    setUser(null);
  }
  markReady(sb);
})();
