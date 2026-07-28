/* eski platform layer: sign in, and the current session.
   shared by index.html, read.html and studio.html. the three headers use
   different class vocabularies (.btn vs .pill, .sp vs .hdr-spacer), so this
   owns its own markup and styles instead of borrowing from any of them.

   FAILS SOFT, ALWAYS. blocked cdn, no network, unset key: no auth ui is
   painted and every page behaves exactly as it did before. that is also the
   path the smoke suite takes.

   the url and the publishable key are public and browser-safe by design;
   see .env.example. the SECRET keys never appear here. */

const SUPABASE_URL = 'https://zidqagrmxeawpasurpwi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cZuZnUhWmEGESYb7BR1Kzg_nPjR8CZR';   // public, safe to commit

/* where published media is served from. the database stores object KEYS, never
   urls, so moving off the rate-limited r2.dev domain to cdn.eski.lol is this
   one line and zero row migrations. */
const R2_BASE = 'https://pub-b9e7c6b680ca415e9ffd5875bad0df03.r2.dev';

// add 'discord' back once it is enabled in the supabase dashboard. a provider
// offered here but not enabled there fails at the redirect with a raw error
// page, so this is the list that actually works, not the list we want.
const PROVIDERS = ['google'];

const CSS = `
.auth{position:relative;display:flex;align-items:center}
.auth-btn{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:0;
  border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit;
  text-transform:lowercase;cursor:pointer;line-height:1.2;white-space:nowrap}
.auth-btn:hover{border-color:currentColor}
.auth-btn img{width:22px;height:22px;border-radius:50%;display:block}
.auth-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:190px;z-index:500;
  display:none;flex-direction:column;gap:6px;padding:10px;border-radius:0;
  border:1px solid rgba(128,128,128,.4);color:inherit;
  background:var(--bg-1,var(--surface,var(--paper,#fff)));
  box-shadow:0 8px 30px rgba(0,0,0,.28)}
.auth-menu.open{display:flex}
.auth-menu b{font-weight:500;font-size:13.5px;text-transform:lowercase;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.auth-menu small{color:#8a8a8a;font-size:12px;text-transform:lowercase;line-height:1.35}
@media(max-width:640px){.auth-btn .lbl{display:none}.auth-btn{min-height:42px}}
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
    const av = (user.user_metadata || {}).avatar_url;
    const name = nameOf(user);
    btn.title = name;
    btn.innerHTML = (av ? `<img src="${esc(av)}" alt="">` : '') + `<span class="lbl">${esc(name)}</span>`;
    menu.innerHTML = `<b>${esc(name)}</b>`;
    const prof = document.createElement('a');
    prof.className = 'auth-btn'; prof.href = 'profile.html'; prof.textContent = 'your profile';
    prof.style.textDecoration = 'none';
    menu.appendChild(prof);
    const out = document.createElement('button');
    out.type = 'button'; out.className = 'auth-btn'; out.textContent = 'sign out';
    out.onclick = () => sb.auth.signOut();
    menu.appendChild(out);
  }else{
    btn.title = 'sign in';
    btn.textContent = 'sign in';   // no avatar to fall back on, so never collapses
    menu.innerHTML = '<small>sign in to publish, to voice a comic, or to score one.</small>';
    for(const p of PROVIDERS){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'auth-btn'; b.textContent = p;
      b.onclick = () => sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.href } });
      menu.appendChild(b);
    }
  }
  btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };
  box.append(btn, menu);
}

function setUser(u){
  user = u;
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
let markReady;
window.eski = {
  get user(){ return user; },
  get sb(){ return sb; },
  get bootError(){ return bootError; },
  mediaBase: R2_BASE,
  mediaUrl: key => key ? R2_BASE + '/' + key : null,
  ready: new Promise(res => { markReady = res; })
};

(async function boot(){
  if(SUPABASE_KEY.includes('REPLACE_ME')) console.warn('platform: set SUPABASE_KEY before deploying');
  try{
    /* vendored, same origin, cached with the rest of the app. it used to come
       from esm.sh, whose entry point is a 458 byte re-export, so every page
       waited on two chained requests to someone else's host before it could
       run a single query. rebuild with `node tests/vendor-supabase.js`. */
    const { createClient } = await import('./vendor/supabase.js');
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await sb.auth.getSession();
    setUser((data && data.session && data.session.user) || null);
    sb.auth.onAuthStateChange((_e, s) => setUser((s && s.user) || null));
  }catch(e){
    bootError = (e && e.message) || String(e);
    // no client. still announce the signed-out state, so a page listening for
    // eski-auth gets a definitive answer instead of silence and can render its
    // signed-out ui once rather than guessing.
    sb = null;
    setUser(null);
  }
  markReady(sb);
})();
