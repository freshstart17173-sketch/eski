/* eski platform layer: sign in, and the current session.
   shared by every surface. the styles below are written in the broadsheet
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

   THE FIX IS NOT CODE. Add a custom domain to the bucket in the Cloudflare
   dashboard (R2 > the bucket > Settings > Custom Domains), point cdn.eski.lol
   at it, and change the line below. The database stores object KEYS and never
   urls, so that is the whole migration: no rows change, and everything
   already published starts being served from the edge.

   https://developers.cloudflare.com/r2/buckets/public-buckets/ */
const R2_BASE = 'https://pub-b9e7c6b680ca415e9ffd5875bad0df03.r2.dev';

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
const CSS = `
.auth{position:relative;display:flex;align-items:center;margin-left:var(--s4,16px)}
.auth-btn{display:inline-flex;align-items:center;gap:7px;padding:3px 0;border:0;border-radius:0;
  background:transparent;color:inherit;font:inherit;font-size:var(--fs-micro,11px);
  letter-spacing:.14em;text-transform:uppercase;cursor:pointer;line-height:1.2;
  white-space:nowrap;opacity:.55;transition:opacity 160ms}
.auth-btn:hover{opacity:1}
.auth-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:200px;z-index:500;
  display:none;flex-direction:column;gap:6px;padding:10px;border-radius:0;
  border:1px solid var(--rule,rgba(128,128,128,.4));color:inherit;
  background:var(--paper,var(--bg-1,#fff))}
.auth-menu.open{display:flex}
.auth-menu .auth-btn{opacity:1;padding:4px 0}
.auth-menu small{color:var(--label,#8a8a8a);font-size:12px;text-transform:none;
  line-height:1.35;letter-spacing:0}
@media(max-width:640px){.auth{margin-left:var(--s3,12px)}
  .auth-btn{min-height:42px;letter-spacing:.06em}}

/* the pick-a-handle sheet. broadsheet tokens with fallbacks, same as above:
   it has to render on legal.html and spec.html too. */
.oz-scrim{position:fixed;inset:0;z-index:900;background:var(--scrim,rgba(0,0,0,.6));
  display:flex;align-items:center;justify-content:center;padding:var(--s4,16px)}
.oz{width:min(420px,100%);background:var(--paper,#fff);color:var(--ink,#111);
  border:var(--bw,1px) solid var(--rule,rgba(128,128,128,.4));padding:var(--s5,24px)}
.oz h2{font-family:var(--font-display,inherit);font-size:var(--fs-lg,20px);
  margin:0 0 var(--s2,8px);font-weight:400}
.oz p{margin:0 0 var(--s4,16px);font-size:var(--fs-sm,13px);color:var(--label,#8a8a8a);
  line-height:1.45}
.oz label{display:block;font-size:var(--fs-micro,11px);letter-spacing:.14em;
  text-transform:uppercase;color:var(--label,#8a8a8a);margin:0 0 6px}
.oz-at{display:flex;align-items:center;border:var(--bw,1px) solid var(--rule,rgba(128,128,128,.4))}
.oz-at span{padding:0 var(--s2,8px);color:var(--label,#8a8a8a)}
.oz input{flex:1;min-width:0;height:38px;border:0;background:transparent;color:inherit;
  font:inherit;padding:0 var(--s2,8px) 0 0}
.oz input:focus{outline:none}
.oz-at:focus-within{border-color:var(--ink,#111)}
.oz-say{min-height:1.3em;margin:6px 0 var(--s4,16px);font-size:var(--fs-sm,13px)}
.oz-say.bad{color:var(--danger,#a33028)}
.oz-acts{display:flex;gap:var(--s2,8px);align-items:center}
.oz-acts button{font:inherit;font-size:var(--fs-micro,11px);letter-spacing:.14em;
  text-transform:uppercase;padding:0 var(--s4,16px);height:38px;cursor:pointer;
  border:var(--bw,1px) solid var(--rule,rgba(128,128,128,.4));background:transparent;color:inherit}
.oz-acts .oz-go{background:var(--ink,#111);color:var(--paper,#fff);border-color:var(--ink,#111)}
.oz-acts .oz-go[disabled]{opacity:.4;cursor:default}
.oz-acts .oz-out{margin-left:auto;border:0;opacity:.55}
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
    menu.innerHTML = '<small>sign in to publish, to voice a comic, or to score one.</small>';
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

/* ============================================================ PICK A HANDLE

   WHAT WAS WRONG. Google hands back full_name, and the profile row was created
   from it without asking: sign in as Alex Morgan and you are @alex-morgan, on
   a public page, on every byline, forever. Nobody chose that, and plenty of
   people do not want their legal name to be their address here.

   IT ALSO ONLY EVER RAN ON profile.html. ensureProfile() lived there, so
   somebody could sign in on the reader, comment, publish, and have no profile
   row at all — and schema-comments.sql reads display_name off profiles to
   stamp a comment. So the row has to exist from the first moment of the
   account, which means this belongs where the account is learned about: here.

   IT BLOCKS, AND THAT IS DELIBERATE. Every other design lets somebody dismiss
   it and carry on without a row, which is the bug above wearing a hat. The way
   out is sign out, which is honest: you cannot have an account here without an
   address. It happens exactly once. */

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;   // == the CHECK in schema-profiles.sql

/* A SUGGESTION, NOT A DECISION. Same derivation the old auto-create used, but
   it lands in an editable field instead of in the database. */
function suggestHandle(u){
  const m = u.user_metadata || {};
  const raw = m.user_name || m.name || m.full_name || (u.email || '').split('@')[0] || '';
  const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return HANDLE_RE.test(base) ? base : '';
}

let onboarding = false;
/* CLAIMED BEFORE THE AWAIT, not after. setUser runs at least twice for one
   sign-in — once from getSession() and again from onAuthStateChange's
   INITIAL_SESSION — and a flag set after the profile read means both calls get
   past the guard and two sheets are stacked on top of each other. Whoever gets
   here first owns the question. */
let asked = null;
let pendingProfile = Promise.resolve();

async function ensureProfile(u){
  if(!sb || !u || onboarding || asked === u.id) return;
  asked = u.id;
  const got = await sb.from('profiles').select('id').eq('id', u.id).maybeSingle();
  /* A READ THAT FAILED IS NOT A MISSING PROFILE. Offline, or the schema is not
     applied: either way, showing the sheet would invite somebody to pick a
     handle we cannot save. Say nothing and let the page work signed in. */
  if(got.error || got.data) return;
  onboarding = true;
  await askHandle(u);
  onboarding = false;
}

/* resolves when the sheet is gone — saved, or signed back out. */
function askHandle(u){
  let done;
  const finished = new Promise(r => { done = r; });
  const m = u.user_metadata || {};
  const scrim = document.createElement('div');
  scrim.className = 'oz-scrim';
  scrim.innerHTML =
    '<div class="oz" role="dialog" aria-modal="true" aria-labelledby="oz-h">' +
      '<h2 id="oz-h">Pick a username</h2>' +
      '<p>This is your address on eski — people find you at ' +
        '<b>eski.lol/u/you</b>, and it is what appears on anything you make. ' +
        'Your real name is not it unless you want it to be.</p>' +
      '<label for="oz-h-in">Username</label>' +
      '<div class="oz-at"><span>@</span>' +
        '<input id="oz-h-in" maxlength="30" autocomplete="off" autocapitalize="off" ' +
               'spellcheck="false" value="' + esc(suggestHandle(u)) + '"></div>' +
      '<div class="oz-say" id="oz-say"></div>' +
      '<div class="oz-acts">' +
        '<button type="button" class="oz-go" id="oz-go">Continue</button>' +
        '<button type="button" class="oz-out" id="oz-out">Sign out</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(scrim);

  const input = scrim.querySelector('#oz-h-in');
  const say = scrim.querySelector('#oz-say');
  const go = scrim.querySelector('#oz-go');
  let token = 0;

  const tell = (msg, bad) => { say.textContent = msg; say.classList.toggle('bad', !!bad); };

  /* CHECKED AS THEY TYPE, and taken again on submit. The check is a courtesy —
     two people can pass it in the same second — so the real answer is the
     unique index, and 23505 on insert is handled as a normal outcome rather
     than an error. */
  async function check(){
    const v = input.value.trim().toLowerCase();
    const mine = ++token;
    go.disabled = true;
    if(!v) return tell('');
    if(!HANDLE_RE.test(v))
      return tell('3 to 30 characters: lowercase letters, numbers, - and _, ' +
                  'starting and ending with a letter or number.', true);
    tell('Checking…');
    const r = await sb.from('profiles').select('id').eq('handle', v).maybeSingle();
    if(mine !== token) return;                        // a later keystroke won
    if(r.error) return tell('');                      // cannot tell; let submit decide
    if(r.data) return tell('@' + v + ' is taken.', true);
    tell('@' + v + ' is free.');
    go.disabled = false;
  }

  let t = 0;
  input.oninput = () => { clearTimeout(t); t = setTimeout(check, 220); };
  input.onkeydown = e => { if(e.key === 'Enter' && !go.disabled) go.click(); };

  go.onclick = async () => {
    const v = input.value.trim().toLowerCase();
    if(!HANDLE_RE.test(v)) return check();
    go.disabled = true;
    tell('Saving…');
    const ins = await sb.from('profiles').insert({
      id: u.id, handle: v,
      /* the display name IS the one place their real name belongs, and it is
         editable in profile settings like everything else. */
      display_name: m.full_name || m.name || m.user_name || null,
      avatar_url: m.avatar_url || null
    });
    if(!ins.error){
      scrim.remove();
      document.dispatchEvent(new CustomEvent('eski-profile', { detail:{ handle: v } }));
      done();
      return;
    }
    if(ins.error.code === '23505'){ go.disabled = true; return tell('@' + v + ' is taken.', true); }
    tell(dbError('ESK-2005', 'your profile could not be created', ins.error), true);
    go.disabled = false;
  };

  scrim.querySelector('#oz-out').onclick = async () => {
    await sb.auth.signOut();
    scrim.remove();
    done();
  };

  input.focus();
  input.select();
  check();
  return finished;
}

function setUser(u){
  user = u;
  /* THE THEME FOLLOWS THE ACCOUNT, and this is the only place that says so.
     palette.js keeps localStorage as its first-paint source — it is a
     synchronous script in <head> so the page never repaints — and adopts the
     account's theme here, just after we learn who is signed in. This call
     belongs here and nowhere else: platform.js is the one module on every
     page that knows the user, and palette.js's whole design note is that a
     second writer is what broke the theme last time. */
  if(window.eskiTheme && window.eskiTheme.adopt)
    window.eskiTheme.adopt(sb, u && u.id);
  // a brand new account has no profile row and no address. ask, once, here.
  if(u) pendingProfile = ensureProfile(u).catch(() => {});
  // the pages are classic scripts and cannot import this module
  document.dispatchEvent(new CustomEvent('eski-auth', { detail: { user: u } }));
  paint();
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

/* ------------------------------------------------------------------ jszip */
/* LOADED WHEN A ZIP IS ACTUALLY OPENED, and from our own origin.

   It used to be a render-blocking <script> from cdnjs in the head of
   read.html, index.html and studio.html: a DNS lookup, a TLS handshake and a
   round trip to a host we do not control, before any of those pages could
   paint. 95 KB of it. And the reader usually never opens a zip at all — a
   published comic is ?read=db:… and goes nowhere near it.

   ONE LOADER, HERE, because three copies of this is exactly the duplication
   this codebase keeps producing. Every call site is already inside an async
   function, so `const JSZip = await window.eski.jszip()` is the whole change
   at each one. Rebuild the file with `node tests/vendor-jszip.js`. */
let jszipReady = null;
function jszip(){
  if(window.JSZip) return Promise.resolve(window.JSZip);
  return jszipReady || (jszipReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('vendor/jszip.js', document.baseURI).href;
    s.onload = () => window.JSZip ? res(window.JSZip)
      : rej(new Error('ESK-1006 vendor/jszip.js loaded but defined no JSZip'));
    /* the one failure worth a code: every "open this file" path on the site
       dead-ends here, and without it the symptom is a button that does
       nothing. */
    s.onerror = () => { jszipReady = null; rej(new Error('ESK-1006 vendor/jszip.js did not load')); };
    document.head.appendChild(s);
  }));
}

/* eskiCode: which call site refused. e: whatever supabase handed back. */
function dbError(eskiCode, what, e){
  const code = (e && e.code) || '';
  const hint = DB_HINTS[code] ? ' ' + DB_HINTS[code] : '';
  return `${eskiCode} ${what}: ${(e && e.message) || e}${code ? ' [' + code + ']' : ''}.${hint}`;
}

let markReady, markSettled;
window.eski = {
  get user(){ return user; },
  get sb(){ return sb; },
  get bootError(){ return bootError; },
  mediaBase: R2_BASE,
  mediaUrl: key => key ? R2_BASE + '/' + key : null,
  dbError,
  jszip,
  ready: new Promise(res => { markReady = res; }),
  /* `ready` means "there is a client". `settled` means "and nothing of ours is
     in your way" — it waits out the pick-a-username sheet. A page with its own
     first-run UI must wait on THIS, or it opens behind a modal the person
     cannot dismiss and burns its shown-once flag doing it. That is exactly
     what home's "How eski works" tour did the first time both existed. */
  settled: new Promise(res => { markSettled = res; })
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
  /* `settled` is about the FIRST LOAD, which is when a page's own once-ever UI
     decides whether to open. Signing in later, in an already-loaded tab, does
     not re-arm it — by then the tour has had its chance and the sheet is the
     only modal on screen anyway. */
  await pendingProfile;
  markSettled(sb);
})();
