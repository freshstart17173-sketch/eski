/* eski — the pivot's shared runtime.

   Everything index.html and profile.html hold in common: auth/profile
   state, the feed-grid card renderer, the whole detail overlay (tags,
   comments, likes, save-to-folder, versions, editing, the poster's
   burger menu), the sign-in prompt, and the upload flow. Loaded by both
   pages as a classic script, same convention as pivot.css — one
   definition, not two copies drifting apart.

   A PAGE OWNS ITS OWN SCREEN, NOTHING MORE. index.html's own inline
   script is the feed query and its filters; profile.html's is the
   profile header and its tabs. Both call into window.Pivot for anything
   that opens over the page — a card, a detail overlay, sign-in, upload —
   rather than each carrying its own copy.

   Depends on platform.js (window.eski) having booted; call Pivot.init()
   after DOMContentLoaded and it awaits eski.ready itself. */
window.Pivot = (function(){
'use strict';

function esc(s){ return (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function fmtWhen(iso){
  const d = new Date(iso), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if(days <= 0) return 'today';
  if(days === 1) return '1d';
  if(days < 30) return days + 'd';
  if(days < 365) return Math.floor(days/30) + 'mo';
  return Math.floor(days/365) + 'y';
}
/* the "Added" row wants the real timestamp, not a rounded-off "today" —
   fmtWhen stays relative for compact contexts (comments, the version list). */
function fmtDateTime(iso){
  return new Date(iso).toLocaleString(undefined,
    { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}
function fmtDate(iso){ return new Date(iso).toLocaleDateString(); }
function slugify(s){
  return (s || 'untitled').toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'untitled';
}
function toast(msg){
  let root = document.getElementById('toast-root');
  if(!root){ root = document.createElement('div'); root.id = 'toast-root'; document.body.appendChild(root); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
const PLAY_PATH = '<path d="M8 5v14l11-7z"/>';
const PAUSE_PATH = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
const PLAY = '<svg viewBox="0 0 24 24">' + PLAY_PATH + '</svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>';
const KINDS = ['image','video','audio','text','other','combination'];

let eski, sb, user = null, myProfile = null;
let myFollowing = new Set();     // followee_id I follow
let myLikes = new Set();         // work ids I've liked
let mySavedIds = new Set();      // work ids saved in ANY of my folders
let mySeenIds = new Set();       // work ids I've opened before
let myFolders = [];              // [{id,name}]
let authListeners = [];
/* [data-authed] is the convention for any control that should only exist
   signed in (Home/Profile/Upload in the nav) — one place hides them so a
   page never has to remember to. Runs on init and every future sign-in/out. */
function syncNav(){
  document.querySelectorAll('[data-authed]').forEach(el => el.hidden = !user);
}

async function init(onAuthChange){
  authListeners.push(syncNav);
  if(onAuthChange) authListeners.push(onAuthChange);
  eski = await (window.eski ? Promise.resolve(window.eski) : new Promise(r => {
    document.addEventListener('eski-auth', () => r(window.eski), { once:true });
  }));
  await eski.ready;
  sb = eski.sb;
  user = eski.user;
  document.addEventListener('eski-auth', async e => {
    user = e.detail.user;
    if(user) await loadMyState(); else clearMyState();
    authListeners.forEach(cb => cb());
  });
  if(user) await loadMyState();
  syncNav();
  wireGlobalNav();
  return { eski, sb, user, myProfile };
}
function clearMyState(){
  myFollowing.clear(); myLikes.clear(); mySavedIds.clear(); myFolders = []; myProfile = null;
}
async function loadMyState(){
  if(!sb || !user) return;
  const [prof, follows, likes, folders] = await Promise.all([
    sb.from('profiles').select('id,handle,display_name,bio,avatar_url').eq('id', user.id).maybeSingle(),
    sb.from('follows').select('followee_id').eq('follower_id', user.id),
    sb.from('likes').select('target_id').eq('user_id', user.id).eq('target_type','work'),
    sb.from('save_folders').select('id,name').eq('owner_id', user.id).order('created_at')
  ]);
  myProfile = prof.data || null;
  myFollowing = new Set((follows.data || []).map(r => r.followee_id));
  myLikes = new Set((likes.data || []).map(r => r.target_id));
  myFolders = folders.data || [];
  if(myFolders.length){
    const { data: items } = await sb.from('save_folder_items').select('target_id')
      .eq('target_type','work').in('folder_id', myFolders.map(f => f.id));
    mySavedIds = new Set((items || []).map(r => r.target_id));
  } else mySavedIds = new Set();
}
function ownerName(){
  if(myProfile) return (myProfile.display_name || myProfile.handle || '').trim() || fallbackName();
  return fallbackName();
}
function fallbackName(){
  const m = (user && user.user_metadata) || {};
  return m.full_name || m.name || m.user_name || (user && user.email) || 'someone';
}
function wireGlobalNav(){
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if(go){ location.href = go.dataset.go; return; }
    const up = e.target.closest('[data-open-upload]');
    if(up){ openUpload(); return; }
  });
}

/* ---------------------------------------------------------- grid card */
function mediaTag(w, cover){
  const key = cover || w.thumb_key || w.media_key;
  if(!key) return '';
  return `<img class="fillmedia" src="${esc(eski.mediaUrl(key))}" alt="" loading="lazy">`;
}
/* a <video> with poster="" shows the cover exactly like an <img> until
   something calls .play() — wireCardPreviews() below is that something,
   muted and capped to the first 5s once the card scrolls into view. no
   custom img-then-swap needed; the browser already does that part. */
function videoPreviewTag(w){
  if(!w.media_key) return mediaTag(w, w.thumb_key || w.cover_key);
  const poster = w.thumb_key || w.cover_key;
  return `<video class="fillmedia" data-preview muted loop playsinline preload="none"` +
    `${poster ? ` poster="${esc(eski.mediaUrl(poster))}"` : ''} src="${esc(eski.mediaUrl(w.media_key))}"></video>`;
}
let previewObserver;
/* call after inserting cardHtml() output into the DOM — a page's own
   grid.innerHTML = rows.map(cardHtml).join('') doesn't wire anything by
   itself, same convention as the [data-open] click delegation below. */
function wireCardPreviews(root){
  previewObserver ??= new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? e.target.play().catch(()=>{}) : e.target.pause());
  }, { threshold: 0.5 });
  root.querySelectorAll('video[data-preview]').forEach(v => {
    previewObserver.observe(v);
    v.addEventListener('timeupdate', () => { if(v.currentTime > 5) v.currentTime = 0; });
  });
}
function cardHtml(w){
  const inner = (() => {
    if(w.kind === 'video') return videoPreviewTag(w) + `<div class="gplay">${PLAY}</div>`;
    if(w.kind === 'audio') return (w.cover_key ? mediaTag(w, w.cover_key) : '') + `<div class="gplay">${PLAY}</div>`;
    if(w.kind === 'combination') return mediaTag(w, w.cover_key) +
      `<div class="gcount"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/></svg>${w._itemCount||0}</div>`;
    if(w.kind === 'other') return '';
    return mediaTag(w);
  })();
  if(w.kind === 'other')
    return `<button class="gcard" type="button" data-open="${w.id}">
      <div class="gbox framed"><div class="gother">${esc(w.title)}</div></div>
      <div class="gcap">${esc(w.caption || w.title)}</div></button>`;
  if(w.kind === 'text')
    return `<button class="gcard" type="button" data-open="${w.id}">
      <div class="gbox framed" style="align-items:stretch;justify-content:flex-start;">
        <div class="gtext"><div class="gtitle">${esc(w.title)}</div><div class="gbody">${esc((w.body||'').slice(0,320))}</div></div>
      </div><div class="gcap">${esc(w.title)}</div></button>`;
  // audio is always framed, like text/other — a background square with the
  // waveform inset, not edge-to-edge media
  const framed = w.kind === 'audio' || (!inner && !w.media_key && !w.cover_key);
  // the caption is what the poster wrote; title is a bare filename for
  // every kind except text (real title) and other (no media, so the
  // filename is the only label it has) — the card shows what was written.
  return `<button class="gcard" type="button" data-open="${w.id}">
    <div class="gbox${framed?' framed':''}">${inner}</div>
    <div class="gcap">${esc(w.caption || w.title)}</div></button>`;
}
/* delegate [data-open] clicks anywhere on the page to the detail overlay —
   a page just has to render cards from cardHtml(); it never wires the click
   itself. */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-open]');
    if(btn) openDetail(btn.dataset.open);
  });
});

/* =========================================================== detail */
function overlayRoot(){
  let root = document.getElementById('overlay-root');
  if(!root){ root = document.createElement('div'); root.id = 'overlay-root'; document.body.appendChild(root); }
  return root;
}
function scrimClose(root){
  root.querySelector('.pv-scrim').addEventListener('click', e => {
    if(e.target.classList.contains('pv-scrim')) root.innerHTML = '';
  });
}
function metaRows(rows, download, downloadUrl){
  let html = rows.map(r => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12.5px;color:var(--muted);">
      <span>${esc(r[0])}</span><span style="color:var(--soft-ink);">${esc(r[1])}</span></div>`).join('');
  if(download) html += `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12.5px;color:var(--muted);">
    <span>Download</span><a href="${esc(downloadUrl)}" style="color:var(--ink);font-weight:600;" download>${esc(download)}</a></div>`;
  return `<div style="display:flex;flex-direction:column;gap:0;">${html}</div>`;
}
function folderRowHtml(name, count, on, id){
  return `<button class="folderrow${on?' on':''}" type="button" data-folder="${esc(id||'')}">
    <div class="fcheck">${CHECK}</div><div class="fname">${esc(name)}</div><div class="fmeta">${esc(count)}</div></button>`;
}
function actionBarHtml(w, liked, likeCount){
  return `<div style="display:flex;gap:8px;">
    <button class="actbtn like${liked?' on':''}" type="button" data-like="${w.id}">
      <svg viewBox="0 0 24 24"><path d="M12 21s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.6 4.5 4.5 0 0 1 8 2.6c0 6.1-8 11-8 11z"/></svg>
      Like <span class="n">${likeCount}</span></button>
    <div class="savewrap">
      <button class="actbtn" type="button" data-savebtn="${w.id}">
        <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Save</button>
      <div class="savedrop" data-savedrop="${w.id}"></div>
    </div>
  </div>`;
}
async function renderSaveDrop(root, workId){
  const drop = root.querySelector(`[data-savedrop="${workId}"]`);
  if(!drop) return;
  drop.innerHTML = `<div class="sdhead">Save to</div>` +
    myFolders.map(f => folderRowHtml(f.name, '', false, f.id)).join('') +
    `<button class="folderrow" type="button" data-newfolder="${workId}">
      <div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--accent);line-height:1;">+</div>
      <div class="fname" style="color:var(--accent);font-weight:600;">New folder</div></button>`;
  const { data: mine } = user ? await sb.from('save_folder_items').select('folder_id')
    .eq('target_type','work').eq('target_id', workId).in('folder_id', myFolders.map(f=>f.id)) : { data: [] };
  const on = new Set((mine||[]).map(r => r.folder_id));
  drop.querySelectorAll('[data-folder]').forEach(b => {
    if(on.has(b.dataset.folder)) b.classList.add('on');
    b.addEventListener('click', async () => {
      if(!user) return openSignIn();
      const fid = b.dataset.folder;
      const already = b.classList.contains('on');
      const { error } = already
        ? await sb.from('save_folder_items').delete().eq('folder_id', fid).eq('target_type','work').eq('target_id', workId)
        : await sb.from('save_folder_items').insert({ folder_id: fid, target_type:'work', target_id: workId });
      if(error) return toast(eski.dbError('ESK-5104','the save could not be updated', error));
      b.classList.toggle('on');
      already ? mySavedIds.delete(workId) : mySavedIds.add(workId);
    });
  });
  drop.querySelector('[data-newfolder]').addEventListener('click', () => {
    if(!user) return openSignIn();
    openPrompt('Name this folder', 'e.g. "inspo"', 'Create folder', async name => {
      const { data, error } = await sb.from('save_folders').insert({ owner_id: user.id, name }).select().single();
      if(error) return toast(eski.dbError('ESK-5104','the folder could not be created', error));
      myFolders.push(data);
      await sb.from('save_folder_items').insert({ folder_id: data.id, target_type:'work', target_id: workId });
      mySavedIds.add(workId);
      renderSaveDrop(root, workId);
    });
  });
}
function tagsPanelHtml(work, tags, poster){
  const chips = tags.map(t => poster
    ? `<span class="tagchip"><span class="tagtext">#${esc(t)}</span><span class="x" data-detag="${esc(t)}">&times;</span></span>`
    : `<span class="chip small" style="background:var(--paper);">#${esc(t)}</span>`).join('');
  return `<div data-panel="tags" style="display:flex;flex-direction:column;gap:18px;padding:16px 24px;">
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;">content tags${poster?' &middot; type + enter, backspace to remove':''}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;" id="detail-tags">${chips}
        ${poster ? `<input class="taginput" id="detail-taginput" placeholder="+ tag" size="6">` : ''}</div>
    </div>
  </div>`;
}
function commentRowHtml(c, replyTo){
  const replyLine = replyTo ? `<div class="replyto">&#8618; replying to <b>${esc(replyTo)}</b></div>` : '';
  return `<div class="cmt${c.parent_id?' nested':''}">
    <div class="avatar"></div>
    <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
      ${replyLine}
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-weight:600;font-size:12.5px;color:var(--ink);">${esc(c.author_name)}</span>
        <span style="font-size:11px;color:var(--muted);">${fmtWhen(c.created_at)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--soft-ink);line-height:1.5;">${c.deleted_at ? '<i>deleted</i>' : esc(c.body)}</div>
      ${!c.deleted_at ? `<button class="dtab" type="button" style="padding:2px 0;font-size:11px;" data-reply="${c.id}" data-who="${esc(c.author_name)}">reply</button>
      <button class="dtab" type="button" style="padding:2px 0;font-size:11px;" data-report-comment="${c.id}">report</button>` : ''}
    </div>
  </div>`;
}
function commentsPanelHtml(work, comments){
  const top = comments.filter(c => !c.parent_id);
  const byParent = {};
  comments.filter(c => c.parent_id).forEach(c => (byParent[c.parent_id] ??= []).push(c));
  const first = top.slice(0, 3), rest = top.slice(3);
  const block = list => list.map(c => commentRowHtml(c) + (byParent[c.id]||[])
    .map(r => commentRowHtml(r, c.author_name)).join('')).join('');
  return `<div data-panel="comments" style="display:none;flex-direction:column;gap:16px;padding:16px 24px;flex:1;">
    <div style="display:flex;flex-direction:column;gap:16px;flex:1;" id="comment-list">
      ${block(first)}
      ${rest.length ? `<button class="morecomments" type="button" id="morecomments">Show ${rest.length} more comment${rest.length===1?'':'s'}</button>
      <div class="cmt-extra" id="comment-extra">${block(rest)}</div>` : ''}
      ${!comments.length ? '<div style="font-size:12.5px;color:var(--muted);">no comments yet</div>' : ''}
    </div>
    <div id="reply-context" style="display:none;align-items:center;gap:6px;font-size:11px;color:var(--muted);"></div>
    <div style="display:flex;gap:8px;align-items:center;padding-top:8px;">
      <input placeholder="add a comment" id="comment-input" style="flex:1;font:inherit;font-size:12.5px;padding:8px 10px;border:none;background:var(--surface);color:var(--ink);border-radius:var(--r);">
      <button class="btnline" type="button" id="comment-post" style="padding:8px 14px;">Post</button>
    </div>
  </div>`;
}
function playerHtml(prefix){
  return `<div class="player">
    <div class="player-track" id="${prefix}-track"><div class="player-fill" id="${prefix}-fill"></div></div>
    <div class="player-row"><span class="player-time" id="${prefix}-cur">0:00</span><span class="player-time" id="${prefix}-dur">0:00</span></div>
  </div>`;
}
function mediaPane(work, items){
  if(work.kind === 'image') return `<div class="medial">${work.media_key ? `<img src="${esc(eski.mediaUrl(work.media_key))}" alt="">` : ''}</div>`;
  if(work.kind === 'video') return `<div class="medial" style="background:#0d0d0d;">
    ${work.media_key ? `<video id="video-el" src="${esc(eski.mediaUrl(work.media_key))}" playsinline></video>
    <button type="button" class="vplay-overlay" id="video-playtoggle">
      <svg id="video-playicon" viewBox="0 0 24 24" width="22" height="22" style="fill:#111;">${PLAY_PATH}</svg></button>
    <div class="player-bar vplayer-bar">${playerHtml('video')}</div>` : ''}
  </div>`;
  /* the waveform IS the cover — same generated image as the grid card,
     shown full size here instead of a decorative icon with a blank
     player underneath it. */
  if(work.kind === 'audio') return `<div class="medial">
    ${work.cover_key ? `<img src="${esc(eski.mediaUrl(work.cover_key))}" alt="" style="padding:40px;box-sizing:border-box;">` : ''}
    ${work.media_key ? `<audio id="audio-el" src="${esc(eski.mediaUrl(work.media_key))}"></audio>
    <button type="button" class="vplay-overlay" id="audio-playtoggle">
      <svg id="audio-playicon" viewBox="0 0 24 24" width="22" height="22" style="fill:#111;">${PLAY_PATH}</svg></button>
    <div class="player-bar">${playerHtml('audio')}</div>` : ''}
  </div>`;
  if(work.kind === 'text') return `<div class="medial" style="background:var(--paper);overflow:auto;padding:56px 60px;">
    <div style="font-weight:700;font-size:26px;color:var(--ink);line-height:1.25;margin-bottom:20px;">${esc(work.title)}</div>
    <div style="font-size:15px;color:var(--soft-ink);line-height:1.7;white-space:pre-wrap;">${esc(work.body||'')}</div>
  </div>`;
  if(work.kind === 'other') return `<div class="medial" style="display:flex;align-items:center;justify-content:center;padding:40px;">
    <span style="font-weight:700;font-size:16px;color:var(--soft-ink);text-align:center;word-break:break-word;">${esc(work.title)}</span>
  </div>`;
  if(work.kind === 'combination') return collectionPane(work, items, 0);
  return `<div class="medial"></div>`;
}
function collectionPane(work, items, idx){
  const it = items[idx];
  const media = it ? (it.kind === 'text'
    ? `<div style="padding:40px;font-size:14px;color:var(--soft-ink);white-space:pre-wrap;">${esc(it.caption||'')}</div>`
    : `<img src="${esc(eski.mediaUrl(it.media_key))}" alt="" style="width:100%;height:100%;object-fit:contain;">`) : '';
  return `<div class="medial" data-collection="${work.id}" data-idx="${idx}">
    ${items.length > 1 ? `<button class="carrow" type="button" style="left:16px;" data-cprev>&lsaquo;</button>
    <button class="carrow" type="button" style="right:16px;" data-cnext>&rsaquo;</button>` : ''}
    <div class="ccount">${idx+1} / ${items.length}</div>
    ${media}
  </div>`;
}
/* a collection shows details for BOTH the item currently on screen and the
   collection as a whole — two labelled blocks, not one caption trying to
   speak for both (artboard.html's collectionDetailCard). The item block has
   to stay in sync with the carousel, so it's re-rendered together with the
   media pane rather than once at open time. */
/* the item block alone, so the carousel can refresh just this half — the
   collection block below it carries the live like/save UI state and must
   not be re-rendered out from under an in-progress interaction. */
function collectionItemBlockHtml(items, idx){
  const it = items[idx];
  const kindMeta = it ? [['Content type', it.kind]] : [];
  return `<div id="collection-item-block" style="display:flex;flex-direction:column;gap:12px;padding:64px 24px 18px 24px;box-sizing:border-box;">
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;">this item &middot; ${idx+1} of ${items.length}</div>
    <div style="font-size:13.5px;font-weight:400;color:var(--soft-ink);line-height:1.5;">${esc((it && it.caption) || '')}</div>
    ${metaRows(kindMeta, it && it.media_key ? 'this item' : null, it && it.media_key ? eski.mediaUrl(it.media_key) : null)}
  </div>`;
}
function collectionInfoColHtml(work, items, idx, liked, likeCount, poster){
  const typesLine = [...new Set(items.map(i => i.kind))].join(' · ');
  return collectionItemBlockHtml(items, idx) + `
    <div style="display:flex;flex-direction:column;gap:12px;padding:18px 24px;box-sizing:border-box;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;">the collection</div>
      <div style="font-weight:700;font-size:17px;color:var(--ink);line-height:1.3;">${esc(work.title)}</div>
      <div style="font-size:13.5px;font-weight:400;color:var(--soft-ink);line-height:1.5;">${esc(work.caption||'')}</div>
      ${metaRows([['Added', fmtDateTime(work.created_at)], ['By', work.owner_name], ['Items', items.length], ['Types', typesLine]])}
      ${poster ? posterActionsHtml(work) : actionBarHtml(work, liked, likeCount)}
    </div>`;
}
async function openDetail(workId){
  const root = overlayRoot();
  const { data: work, error } = await sb.from('works').select('*').eq('id', workId).single();
  if(error || !work){ toast(eski.dbError('ESK-5100','that post could not be opened', error||{message:'not found'})); return; }

  const poster = user && user.id === work.owner_id;
  const rootId = work.version_of || work.id;
  const [{ data: tags }, { data: comments }, { data: likeRows }, { data: items }, { data: versions }] = await Promise.all([
    sb.from('content_tags').select('tag').eq('target_type','work').eq('target_id', work.id),
    sb.from('comments').select('*').eq('target_type','work').eq('target_id', work.id).is('deleted_at', null).order('created_at'),
    sb.from('likes').select('user_id').eq('target_type','work').eq('target_id', work.id),
    work.kind === 'combination' ? sb.from('work_items').select('*').eq('work_id', work.id).order('idx') : Promise.resolve({data:[]}),
    sb.from('works').select('id,title,version_label,created_at').or(`id.eq.${rootId},version_of.eq.${rootId}`).order('created_at', { ascending:false })
  ]);
  if(user){ sb.from('seen_marks').upsert({ user_id:user.id, target_type:'work', target_id:work.id }).then(()=>{}); mySeenIds.add(work.id); }

  const tagList = (tags||[]).map(t => t.tag);
  const liked = user ? (likeRows||[]).some(r => r.user_id === user.id) : false;
  const hasVersions = work.kind !== 'combination' && work.kind !== 'other';

  const likeCount = (likeRows||[]).length;
  const isCollection = work.kind === 'combination';
  root.innerHTML = `<div class="pv-scrim"><div class="pv-card" style="display:flex;flex-direction:row;width:1100px;max-width:100%;height:760px;max-height:100%;">
    ${overlayControlsHtml(poster, hasVersions, versions||[], work)}
    ${mediaPane(work, items||[])}
    <div style="width:42%;height:100%;display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;flex-direction:column;${isCollection?'':'gap:16px;padding:64px 24px 20px 24px;'}" id="info-col">
        ${isCollection ? collectionInfoColHtml(work, items||[], 0, liked, likeCount, poster) : infoColHtml(work, liked, likeCount, poster)}
      </div>
      <div style="display:flex;flex-direction:row;gap:24px;padding:0 24px;flex-shrink:0;">
        <button class="dtab active" type="button" data-tab="tags">Tags</button>
        <button class="dtab" type="button" data-tab="comments">Comments</button>
      </div>
      <div style="flex:1;background:var(--surface);overflow:auto;display:flex;flex-direction:column;">
        ${tagsPanelHtml(work, tagList, poster)}
        ${commentsPanelHtml(work, comments||[])}
      </div>
    </div>
  </div></div>`;
  scrimClose(root);
  wireDetail(root, work, items||[], poster);
}
/* format/length/bitrate — media_key's own extension for format (no column
   for it, the key already carries it: <hash>.<ext>), duration_ms from
   upload-time decode, bitrate estimated from bytes over duration since
   nothing decodes the container to read an encoded bitrate directly. */
function mediaMetaRows(work){
  if(work.kind !== 'audio' && work.kind !== 'video') return [];
  const rows = [];
  const ext = (work.media_key || '').split('.').pop();
  if(ext) rows.push(['Format', ext.toUpperCase()]);
  if(work.duration_ms) rows.push(['Length', fmtClock(work.duration_ms / 1000)]);
  if(work.duration_ms && work.bytes) rows.push(['Bitrate', Math.round(work.bytes * 8 / (work.duration_ms / 1000) / 1000) + ' kbps']);
  return rows;
}
function infoColHtml(work, liked, likeCount, poster){
  /* title is a filename with the extension trimmed off (uploadOne() never
     asks for a real one on image/video/audio) — showing it next to the
     caption the poster actually wrote just repeats the file name. 'other'
     is the exception: with no media of its own, the title is the only
     label the post has. 'text' shows its title inside the media pane
     itself, so it's already skipped here. */
  return `${work.kind==='other' ? `<div style="font-weight:700;font-size:19px;color:var(--ink);line-height:1.3;">${esc(work.title)}</div>` : ''}
    <div style="font-size:14px;color:var(--soft-ink);line-height:1.5;">${esc(work.caption||'')}</div>
    ${metaRows([['Added', fmtDateTime(work.created_at)], ['By', work.owner_name], ...mediaMetaRows(work)], work.media_key ? 'download' : null, work.media_key ? eski.mediaUrl(work.media_key) : null)}
    ${poster ? posterActionsHtml(work) : actionBarHtml(work, liked, likeCount)}`;
}
function overlayControlsHtml(poster, hasVersions, versions, work){
  /* versions arrives newest-first (the fetch order); the number shown has
     to be chronological (the original is v1) regardless of that, so it's
     computed from a separate oldest-first sort rather than the display
     index — otherwise adding a version relabels the original from v1 to
     v2 while the new one confusingly becomes v1. */
  const byAge = [...versions].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const vnum = id => byAge.findIndex(v => v.id === id) + 1;
  return `<div style="position:absolute;top:20px;right:24px;z-index:6;display:flex;align-items:center;gap:8px;">
    ${hasVersions ? `<div class="verwrap">
      <button class="chip small" type="button" data-ver style="white-space:nowrap;">v${vnum(work.id)} of ${versions.length}&nbsp;&#9662;</button>
      <div class="verdrop" data-verdrop>
        ${versions.map(v => `<button class="vi${v.id===work.id?' on':''}" type="button" data-goversion="${v.id}">
          <span class="vi-name">v${vnum(v.id)} &middot; ${esc(v.version_label || v.title)}</span>
          <span style="color:var(--muted);flex-shrink:0;">${fmtDate(v.created_at)}</span></button>`).join('')}
        ${poster ? `<div class="sep"></div><button class="vi add" type="button" id="add-version">+ Add version</button>` : ''}
      </div>
    </div>` : ''}
    ${poster ? `<div style="position:relative;"><button class="navarrow" type="button" id="burger-btn">&#8942;</button>
      <div class="burger" id="burger-menu">
        <button class="mi" type="button" data-post-private>Make private</button>
        <div class="sep"></div>
        <button class="mi danger" type="button" data-post-delete>Delete</button>
      </div></div>` : `<button class="navarrow" type="button" data-report-work="${work.id}" title="Report">&#9873;</button>`}
    <button class="navarrow" type="button" data-close-detail>&times;</button>
  </div>`;
}
/* file_report() covers work/collection/comment/profile — same call, same
   styled prompt, wherever a report control ends up. Signed-out reporting
   isn't a thing (reports_file's RLS check is reporter_id = auth.uid()). */
function reportFlow(targetType, targetId){
  if(!user) return openSignIn();
  openPrompt('Report this ' + targetType, 'what\'s wrong with it?', 'Send report', async reason => {
    const { data, error } = await sb.rpc('file_report', { p_type: targetType, p_id: targetId, p_reason: reason });
    if(error || !data || data.ok !== true) return toast(eski.dbError('ESK-5114', 'the report could not be sent', error || { message: (data && data.why) || 'unknown' }));
    toast('reported — thanks, a moderator will look at it');
  });
}
function posterActionsHtml(work){
  return `<div class="a2c">
    <button class="btnline" type="button" id="a2c-btn" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;">
      <svg viewBox="0 0 24 24" width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;"><path d="M12 5v14M5 12h14"/></svg>Add to collection</button>
    <div class="a2cdrop" id="a2c-drop"></div>
  </div>`;
}
function fmtBytes(n){
  if(!n) return '0 KB';
  const units = ['bytes','KB','MB','GB'];
  let i = 0;
  while(n >= 1024 && i < units.length - 1){ n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}
function fmtClock(s){
  if(!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
/* one wiring for both the audio and video players — eski's own square
   track/fill instead of the browser's native controls (which vary by OS
   and don't take a theme), and a play button that actually does something
   (it didn't, before: a decorative circle sat on top of a real native
   player underneath it). prefix is 'audio' or 'video', matching the ids
   playerHtml()/mediaPane() rendered. */
function wirePlayer(root, prefix, mediaEl){
  if(!mediaEl) return;
  const toggle = root.querySelector('#' + prefix + '-playtoggle');
  const icon = root.querySelector('#' + prefix + '-playicon');
  const track = root.querySelector('#' + prefix + '-track');
  const fill = root.querySelector('#' + prefix + '-fill');
  const cur = root.querySelector('#' + prefix + '-cur');
  const dur = root.querySelector('#' + prefix + '-dur');
  if(toggle) toggle.addEventListener('click', () => mediaEl.paused ? mediaEl.play() : mediaEl.pause());
  if(prefix === 'video') mediaEl.addEventListener('click', () => mediaEl.paused ? mediaEl.play() : mediaEl.pause());
  mediaEl.addEventListener('play', () => { if(icon) icon.innerHTML = PAUSE_PATH; if(toggle) toggle.classList.add('hide'); });
  mediaEl.addEventListener('pause', () => { if(icon) icon.innerHTML = PLAY_PATH; if(toggle) toggle.classList.remove('hide'); });
  mediaEl.addEventListener('ended', () => { if(icon) icon.innerHTML = PLAY_PATH; if(toggle) toggle.classList.remove('hide'); });
  if(dur) mediaEl.addEventListener('loadedmetadata', () => { dur.textContent = fmtClock(mediaEl.duration); });
  if(fill || cur) mediaEl.addEventListener('timeupdate', () => {
    if(fill) fill.style.width = (mediaEl.duration ? (mediaEl.currentTime / mediaEl.duration * 100) : 0) + '%';
    if(cur) cur.textContent = fmtClock(mediaEl.currentTime);
  });
  if(track) track.addEventListener('click', e => {
    if(!mediaEl.duration) return;
    const r = track.getBoundingClientRect();
    mediaEl.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * mediaEl.duration;
  });
  /* video only starts with its overlay circle visible; audio's own circle
     always shows (it's the only play control, not an overlay on content). */
  if(prefix === 'video' && toggle) toggle.classList.remove('hide');
}
async function wireDetail(root, work, items, poster){
  root.querySelector('[data-close-detail]').addEventListener('click', () => root.innerHTML = '');
  const reportBtn = root.querySelector('[data-report-work]');
  // 'combination' is still a works row (a bundled multi-item post) — the
  // separate 'collection' report target is the curated collections table,
  // which this overlay never opens.
  if(reportBtn) reportBtn.addEventListener('click', () => reportFlow('work', work.id));
  wirePlayer(root, 'audio', root.querySelector('#audio-el'));
  wirePlayer(root, 'video', root.querySelector('#video-el'));
  root.querySelectorAll('.dtab').forEach(t => t.addEventListener('click', () => {
    root.querySelectorAll('.dtab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    root.querySelectorAll('[data-panel]').forEach(p => p.style.display = 'none');
    root.querySelector(`[data-panel="${t.dataset.tab}"]`).style.display = 'flex';
  }));
  // version dropdown
  const verBtn = root.querySelector('[data-ver]');
  if(verBtn) verBtn.addEventListener('click', e => { e.stopPropagation(); root.querySelector('[data-verdrop]').classList.toggle('open'); });
  root.querySelectorAll('[data-goversion]').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.goversion)));
  const addVer = root.querySelector('#add-version');
  if(addVer) addVer.addEventListener('click', () => { root.innerHTML=''; openUpload({ versionOf: work.version_of || work.id, kind: work.kind }); });
  // burger
  const burgerBtn = root.querySelector('#burger-btn');
  if(burgerBtn) burgerBtn.addEventListener('click', e => { e.stopPropagation(); root.querySelector('#burger-menu').classList.toggle('open'); });
  const priv = root.querySelector('[data-post-private]');
  if(priv) priv.addEventListener('click', async () => {
    root.querySelector('#burger-menu').classList.remove('open');
    const { error } = await sb.from('works').update({ status:'private' }).eq('id', work.id);
    if(error) return toast(eski.dbError('ESK-5107','could not change visibility', error));
    toast('made private'); root.innerHTML=''; authListeners.forEach(cb => cb());
  });
  const del = root.querySelector('[data-post-delete]');
  if(del) del.addEventListener('click', () => {
    root.querySelector('#burger-menu').classList.remove('open');
    openConfirm('Delete this post?',
      `&ldquo;${esc(work.title)}&rdquo; will be permanently removed. This can't be undone.`,
      'Delete post', async () => {
        const { error } = await sb.from('works').delete().eq('id', work.id);
        if(error) return toast(eski.dbError('ESK-5107','could not delete', error));
        overlayRoot().innerHTML=''; authListeners.forEach(cb => cb());
      });
  });
  // like
  const likeBtn = root.querySelector('[data-like]');
  if(likeBtn) likeBtn.addEventListener('click', async () => {
    if(!user) return openSignIn();
    const on = likeBtn.classList.contains('on');
    const { error } = on
      ? await sb.from('likes').delete().eq('target_type','work').eq('target_id', work.id).eq('user_id', user.id)
      : await sb.from('likes').insert({ target_type:'work', target_id: work.id, user_id: user.id });
    if(error) return toast(eski.dbError('ESK-5102','like could not be updated', error));
    on ? myLikes.delete(work.id) : myLikes.add(work.id);
    likeBtn.classList.toggle('on');
    const n = likeBtn.querySelector('.n'); n.textContent = (parseInt(n.textContent||'0',10) + (on?-1:1));
  });
  // save dropdown
  const saveBtn = root.querySelector('[data-savebtn]');
  if(saveBtn) saveBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if(!user) return openSignIn();
    const drop = root.querySelector(`[data-savedrop="${work.id}"]`);
    drop.classList.toggle('open');
    if(drop.classList.contains('open')) await renderSaveDrop(root, work.id);
  });
  // tags
  // tag input: type, enter/space commits, backspace on an empty box drops
  // the last tag — no modal, the chip row updates in place
  const tagInput = root.querySelector('#detail-taginput');
  if(tagInput) tagInput.addEventListener('keydown', async e => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      const tag = tagInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
      if(tag.length < 2) return;
      tagInput.value = '';
      const { error } = await sb.from('content_tags').insert({ target_type:'work', target_id: work.id, tag, added_by: user.id });
      if(error && error.code !== '23505') return toast(eski.dbError('ESK-5101','tag could not be added', error));
      openDetail(work.id);
    } else if(e.key === 'Backspace' && !tagInput.value){
      const last = [...root.querySelectorAll('[data-detag]')].pop();
      if(!last) return;
      const { error } = await sb.from('content_tags').delete().eq('target_type','work').eq('target_id', work.id).eq('tag', last.dataset.detag);
      if(error) return toast(eski.dbError('ESK-5101','tag could not be removed', error));
      openDetail(work.id);
    }
  });
  root.querySelectorAll('[data-detag]').forEach(x => x.addEventListener('click', async () => {
    const { error } = await sb.from('content_tags').delete().eq('target_type','work').eq('target_id', work.id).eq('tag', x.dataset.detag);
    if(error) return toast(eski.dbError('ESK-5101','tag could not be removed', error));
    openDetail(work.id);
  }));
  // comments
  root.querySelectorAll('[data-report-comment]').forEach(b => b.addEventListener('click', () => reportFlow('comment', b.dataset.reportComment)));
  let replyTarget = null;
  root.querySelectorAll('[data-reply]').forEach(b => b.addEventListener('click', () => {
    replyTarget = { id: b.dataset.reply, who: b.dataset.who };
    const ctx = root.querySelector('#reply-context');
    ctx.style.display = 'flex';
    ctx.innerHTML = `replying to <b style="color:var(--soft-ink);">${esc(replyTarget.who)}</b> <button class="dtab" type="button" style="padding:0;" id="cancel-reply">cancel</button>`;
    root.querySelector('#cancel-reply').addEventListener('click', () => { replyTarget = null; ctx.style.display = 'none'; });
    root.querySelector('#comment-input').focus();
  }));
  const moreBtn = root.querySelector('#morecomments');
  if(moreBtn) moreBtn.addEventListener('click', () => {
    root.querySelector('#comment-extra').classList.add('open'); moreBtn.remove();
  });
  root.querySelector('#comment-post').addEventListener('click', async () => {
    if(!user) return openSignIn();
    const input = root.querySelector('#comment-input');
    const body = input.value.trim();
    if(!body) return;
    const { error } = await sb.from('comments').insert({
      target_type:'work', target_id: work.id, user_id: user.id,
      parent_id: replyTarget ? replyTarget.id : null, body
    });
    if(error) return toast(eski.dbError('ESK-5103','comment could not post', error));
    input.value = ''; replyTarget = null; root.querySelector('#reply-context').style.display = 'none';
    openDetail(work.id);
  });
  // collection carousel — swaps the media pane and the item-info block
  // together (they share the same idx); the collection block below is left
  // alone so its live like/save state survives navigating between items.
  if(root.querySelector('[data-collection]')){
    let idx = 0;
    const wireCarousel = () => {
      const cprev = root.querySelector('[data-cprev]'), cnext = root.querySelector('[data-cnext]');
      const swap = d => {
        idx = (idx + d + items.length) % items.length;
        root.querySelector('[data-collection]').outerHTML = collectionPane(work, items, idx);
        document.getElementById('collection-item-block').outerHTML = collectionItemBlockHtml(items, idx);
        wireCarousel();
      };
      if(cprev) cprev.addEventListener('click', () => swap(-1));
      if(cnext) cnext.addEventListener('click', () => swap(1));
    };
    wireCarousel();
  }
  // add to collection (poster)
  const a2cBtn = root.querySelector('#a2c-btn');
  if(a2cBtn) a2cBtn.addEventListener('click', async e => {
    e.stopPropagation();
    const drop = root.querySelector('#a2c-drop');
    drop.classList.toggle('open');
    if(!drop.classList.contains('open')) return;
    const { data: cols } = await sb.from('collections').select('id,title').eq('owner_id', user.id).order('created_at', { ascending:false });
    drop.innerHTML = (cols||[]).map(c => `<button class="ci" type="button" data-addcol="${c.id}">${esc(c.title)}</button>`).join('') +
      `<div class="sep"></div><button class="ci add" type="button" id="new-collection">+ New collection</button>`;
    drop.querySelectorAll('[data-addcol]').forEach(b => b.addEventListener('click', async () => {
      const { error } = await sb.from('collection_items').insert({ collection_id: b.dataset.addcol, work_id: work.id });
      if(error && error.code !== '23505') return toast(eski.dbError('ESK-5105','could not add to collection', error));
      toast('added'); drop.classList.remove('open');
    }));
    drop.querySelector('#new-collection').addEventListener('click', () => {
      openPrompt('Name this collection', 'untitled', 'Create collection', async title => {
        const { data: col, error } = await sb.from('collections').insert({
          owner_id: user.id, owner_name: ownerName(), title,
          slug: slugify(title) + '-' + Date.now().toString(36).slice(-5), status: 'published'
        }).select().single();
        if(error) return toast(eski.dbError('ESK-5105','collection could not be created', error));
        await sb.from('collection_items').insert({ collection_id: col.id, work_id: work.id });
        toast('collection created'); drop.classList.remove('open');
      });
    });
  });
}
const GOOGLE = '<svg viewBox="0 0 24 24" width="16" height="16" style="flex-shrink:0;"><path fill="currentColor" d="M12 11v2.7h4.4c-.2 1.2-1.5 3.4-4.4 3.4-2.7 0-4.8-2.2-4.8-4.9S9.3 7.3 12 7.3c1.5 0 2.5.6 3.1 1.2l2-2C15.8 5.3 14.1 4.6 12 4.6 7.8 4.6 4.4 8 4.4 12S7.8 19.4 12 19.4c4.3 0 7.2-3 7.2-7.3 0-.5 0-.8-.1-1.1z"/></svg>';
/* deleteCard from artboard.html — a styled confirm, not the native
   browser one, so a destructive action looks like the rest of the
   product instead of an OS dialog that stops the theme dead. Its own
   stacking layer, separate from #overlay-root: a confirm is very often
   raised FROM an already-open detail overlay (delete this post), and
   overlayRoot() there is mid-render — reusing it would wipe the detail
   overlay out from under the confirm instead of layering over it. */
function confirmRoot(){
  let root = document.getElementById('confirm-root');
  if(!root){ root = document.createElement('div'); root.id = 'confirm-root'; document.body.appendChild(root); }
  return root;
}
/* the shared scrim/card shell both openConfirm and openPrompt sit in —
   same stacking layer as confirmRoot()'s own note explains (raised over an
   already-open detail overlay without wiping it). */
function promptShell(title, innerHtml){
  const root = confirmRoot();
  root.innerHTML = `<div class="pv-scrim" style="z-index:300;"><div class="pv-card" style="width:420px;padding:32px;display:flex;flex-direction:column;gap:16px;">
    <div style="font-weight:700;font-size:19px;color:var(--ink);">${esc(title)}</div>
    ${innerHtml}
  </div></div>`;
  scrimClose(root);
  return root;
}
function openConfirm(title, body, confirmLabel, onConfirm){
  const root = promptShell(title, `
    <div style="font-size:13.5px;color:var(--soft-ink);line-height:1.55;">${body}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
      <button class="btnline" type="button" id="confirm-cancel">Cancel</button>
      <button class="btnline danger" type="button" id="confirm-go">${esc(confirmLabel)}</button>
    </div>`);
  root.querySelector('#confirm-cancel').addEventListener('click', () => root.innerHTML = '');
  root.querySelector('#confirm-go').addEventListener('click', () => { root.innerHTML = ''; onConfirm(); });
}
/* the styled equivalent of window.prompt(). optional:true lets an empty
   submit through (as null) rather than blocking it, for prompts like the
   version label that don't require an answer. */
function openPrompt(title, placeholder, confirmLabel, onSubmit, optional){
  const root = promptShell(title, `
    <input class="uinput" id="prompt-input" placeholder="${esc(placeholder || '')}">
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
      <button class="btnline" type="button" id="prompt-cancel">Cancel</button>
      <button class="btnline filled" type="button" id="prompt-go">${esc(confirmLabel)}</button>
    </div>`);
  const input = root.querySelector('#prompt-input');
  input.focus();
  const go = () => {
    const v = input.value.trim();
    if(!v && !optional) return;
    root.innerHTML = '';
    onSubmit(v || null);
  };
  root.querySelector('#prompt-cancel').addEventListener('click', () => root.innerHTML = '');
  root.querySelector('#prompt-go').addEventListener('click', go);
  input.addEventListener('keydown', e => { if(e.key === 'Enter') go(); });
}
function openSignIn(){
  const root = overlayRoot();
  root.innerHTML = `<div class="pv-scrim"><div class="pv-card" style="width:420px;padding:40px 36px;display:flex;flex-direction:column;gap:18px;">
    <div class="wordmark" style="font-size:30px;">eski<i>!</i></div>
    <div style="font-weight:700;font-size:22px;color:var(--ink);">Sign in to eski</div>
    <div style="font-size:13.5px;color:var(--soft-ink);line-height:1.55;">to save posts, follow artists, tag your own work and join the conversation.</div>
    <button class="btnline filled" type="button" id="signin-google" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;">${GOOGLE}Continue with Google</button>
    <div style="font-size:11.5px;color:var(--muted);text-align:center;line-height:1.5;">by continuing you agree to the terms and privacy policy.</div>
  </div></div>`;
  scrimClose(root);
  root.querySelector('#signin-google').addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.href } });
  });
}

/* ============================================================ upload */
let pending = [];
let uploadMode = 'separate';
let uploadCtx = null;
let selectedPending = null;

function kindOfFile(f){
  if(f.type.startsWith('image/')) return 'image';
  if(f.type.startsWith('video/')) return 'video';
  if(f.type.startsWith('audio/')) return 'audio';
  if(f.type === 'text/markdown' || /\.(md|markdown)$/i.test(f.name)) return 'text';
  if(f.type === 'text/plain' || /\.txt$/i.test(f.name)) return 'text';
  return 'other';
}
function extOfFile(f){
  const m = /\.([a-z0-9]+)$/i.exec(f.name);
  return (m ? m[1] : '').toLowerCase();
}
function openUpload(ctx){
  if(!user) return openSignIn();
  uploadCtx = ctx || null;
  pending = []; uploadMode = 'separate'; selectedPending = null;
  const root = overlayRoot();
  root.innerHTML = `<div class="pv-scrim"><div class="pv-card" style="width:720px;max-height:90vh;display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 28px 14px 28px;">
      <div style="font-weight:700;font-size:22px;color:var(--ink);">${uploadCtx ? 'New version' : 'New post'}</div>
      <button class="navarrow" type="button" data-close-detail>&times;</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;padding:0 28px 28px 28px;overflow:auto;" id="upload-body">
      <div class="dropzone" id="dropzone">
        <svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>
        <div class="dzbig">Drag files here, or click to browse</div>
        <div class="dzsub">image · video · audio · text · markdown &middot; other &mdash; up to 20 at once</div>
      </div>
      <input type="file" id="file-input" multiple hidden>
      <div id="upload-detail"></div>
    </div>
  </div></div>`;
  scrimClose(root);
  root.querySelector('[data-close-detail]').addEventListener('click', () => root.innerHTML = '');
  const dz = root.querySelector('#dropzone'), fi = root.querySelector('#file-input');
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => addFiles([...fi.files]));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    addFiles([...e.dataTransfer.files]);
  });
}
function addFiles(files){
  if(!files.length) return;
  for(const file of files) pending.push({ file, kind: kindOfFile(file), ext: extOfFile(file), caption: '', title: '', body: '' });
  if(uploadCtx) pending = pending.slice(-1);
  renderUploadDetail();
}
function renderUploadDetail(){
  const root = overlayRoot();
  const box = root.querySelector('#upload-detail');
  if(!box || !pending.length){ if(box) box.innerHTML = ''; return; }
  const kinds = new Set(pending.map(p => p.kind));
  const sameType = kinds.size === 1 && pending.length > 1;
  const allowGroup = sameType && !uploadCtx && pending[0].kind !== 'text' && pending[0].kind !== 'other';
  let sel = pending.indexOf(selectedPending);
  if(sel < 0){ sel = 0; selectedPending = pending[0]; }
  const cur = pending[sel];

  const filmstrip = `<div class="filmstrip">
    ${pending.map((p,i) => `<div class="fthumb${i===sel?' sel':''}" data-fthumb="${i}">
      ${p.kind==='image' ? `<img src="${URL.createObjectURL(p.file)}">` : `<span class="ext">${esc(p.ext||p.kind)}</span>`}
    </div>`).join('')}
    ${!uploadCtx ? '<div class="faddtile" id="fadd">+</div>' : ''}
  </div>`;

  const modeBlock = allowGroup ? `<div style="background:var(--surface);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;gap:12px;">
    <div style="font-weight:600;font-size:14px;color:var(--ink);">All ${pending.length} files are ${cur.kind}. How should they go up?</div>
    <div class="umode">
      <span class="chip${uploadMode==='separate'?' active':''}" data-umode="separate">Separate posts</span>
      <span class="chip${uploadMode==='collection'?' active':''}" data-umode="collection">One collection</span>
      <span class="chip${uploadMode==='versions'?' active':''}" data-umode="versions">One post &middot; ${pending.length} versions</span>
    </div>
    ${uploadMode==='collection' ? `<div style="display:flex;flex-direction:column;gap:14px;padding-top:4px;">
      <div class="ufield"><div class="ulabel">Collection title</div><input class="uinput" id="collection-title" placeholder="untitled"></div>
      <div class="ufield"><div class="ulabel">Collection caption</div><textarea class="utext" id="collection-caption" placeholder="Write a caption for the collection as a whole…"></textarea></div>
    </div>` : ''}
  </div>` : '';

  const isText = cur.kind === 'text';
  const itemForm = `<div style="display:flex;gap:20px;">
    ${cur.kind==='image' ? `<img src="${URL.createObjectURL(cur.file)}" style="width:180px;height:180px;object-fit:cover;background:var(--surface);flex-shrink:0;">`
      : `<div style="width:180px;height:180px;background:var(--surface);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <span style="font-weight:700;font-size:14px;color:var(--muted);">${esc(cur.file.name)}</span></div>`}
    <div style="flex:1;display:flex;flex-direction:column;gap:16px;">
      ${isText ? `<div class="ufield"><div class="ulabel">Title</div><input class="uinput" id="item-title" value="${esc(cur.title || cur.file.name.replace(/\.[^.]+$/,''))}"></div>` : ''}
      <div class="ufield">
        <div class="ulabel">${uploadMode==='collection' ? 'Caption for this item (optional)' : uploadMode==='versions' ? `Caption &middot; version ${sel+1} of ${pending.length}` : pending.length>1 ? `Caption &middot; post ${sel+1} of ${pending.length}` : 'Caption'}</div>
        <textarea class="utext" id="item-caption" placeholder="Write a caption…">${esc(cur.caption)}</textarea>
      </div>
    </div>
  </div>`;

  const publishLabel = uploadMode==='collection' ? 'Publish collection'
    : uploadMode==='versions' ? `Publish 1 post &middot; ${pending.length} versions`
    : uploadCtx ? 'Publish version'
    : pending.length>1 ? `Publish ${pending.length} posts` : 'Publish post';

  box.innerHTML = filmstrip + modeBlock + itemForm +
    `<div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btnline" type="button" id="upload-cancel">Cancel</button>
      <button class="btnline filled" type="button" id="upload-publish">${publishLabel}</button>
    </div>`;

  box.querySelectorAll('[data-fthumb]').forEach(t => t.addEventListener('click', () => {
    selectedPending = pending[+t.dataset.fthumb]; renderUploadDetail();
  }));
  const fadd = box.querySelector('#fadd');
  if(fadd) fadd.addEventListener('click', () => root.querySelector('#file-input').click());
  box.querySelectorAll('[data-umode]').forEach(m => m.addEventListener('click', () => { uploadMode = m.dataset.umode; renderUploadDetail(); }));
  const capEl = box.querySelector('#item-caption');
  if(capEl) capEl.addEventListener('input', () => cur.caption = capEl.value);
  const titEl = box.querySelector('#item-title');
  if(titEl) titEl.addEventListener('input', () => cur.title = titEl.value);
  box.querySelector('#upload-cancel').addEventListener('click', () => root.innerHTML = '');
  box.querySelector('#upload-publish').addEventListener('click', () => {
    if(uploadCtx) openPrompt('Label this version', 'e.g. "remaster" (optional)', 'Publish version', label => publish(label), true);
    else publish(null);
  });
}
let hashWorker;
function sha256(blob){
  hashWorker ??= new Worker('hash-worker.js');
  return new Promise((resolve, reject) => {
    const id = Math.random();
    const onMsg = e => { if(e.data.id !== id) return; hashWorker.removeEventListener('message', onMsg);
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.hex); };
    hashWorker.addEventListener('message', onMsg);
    hashWorker.postMessage({ id, blob });
  });
}
async function uploadBlob(blob, ext){
  const hash = await sha256(blob);
  const { data: session } = await sb.auth.getSession();
  const token = session && session.session && session.session.access_token;
  const signRes = await fetch('/api/sign', {
    method: 'POST',
    headers: { 'content-type':'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ files: [{ hash, ext: ext || 'bin' }] })
  });
  const signJson = await signRes.json().catch(() => null);
  if(!signRes.ok || !signJson || !signJson.files || !signJson.files[0])
    throw new Error((signJson && signJson.error) || ('ESK-3000 upload signing failed (' + signRes.status + ')'));
  const { key, url } = signJson.files[0];
  const put = await fetch(url, { method:'PUT', body: blob });
  if(!put.ok) throw new Error('ESK-4003 upload failed (' + put.status + ')');
  return key;
}
function uploadOne(item){ return uploadBlob(item.file, item.ext); }

/* a video's cover is a real frame, grabbed client-side rather than asking
   for a second file — decode to a hidden <video>, seek partway in (a first
   frame is disproportionately often a black flash or a title card), draw
   the current frame to a canvas, encode. */
function grabVideoFrame(file){
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    let durationMs = null;
    const cleanup = () => URL.revokeObjectURL(url);
    video.addEventListener('loadedmetadata', () => {
      durationMs = Math.round((video.duration || 0) * 1000);
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(blob => { cleanup(); resolve({ blob, durationMs }); }, 'image/jpeg', 0.85);
    });
    video.addEventListener('error', () => { cleanup(); resolve(null); });
  });
}
/* a waveform reads the actual performance rather than showing a generic
   play glyph on a blank square — decode the whole file with the Web Audio
   API (the same approach loudness.js uses for loudness, just reading peaks
   instead of RMS blocks), take the loudest sample in each of a few hundred
   bins across the file, and draw bars. BINS this high is "the card is a
   picture of the audio", not a coarse sketch of it. */
async function generateWaveform(file){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  const ctx = new AC();
  try{
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const durationMs = Math.round(buf.duration * 1000);
    const data = buf.getChannelData(0);
    /* one column per pixel, no gap between columns — a soundcloud-style
       waveform is bars with visible gaps and rounded tops; this is the
       dense, continuous kind (Audacity/Pro Tools), which is what "high
       quality" actually looks like at this resolution. */
    const W = 1800, H = 600;
    const step = Math.max(1, Math.floor(data.length / W));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#5B7A6B';   // baked-in sage: a generated asset, not chrome, so it doesn't need a live theme token
    for(let x = 0; x < W; x++){
      const start = x * step, end = Math.min(start + step, data.length);
      let max = 0;
      for(let j = start; j < end; j++){ const v = Math.abs(data[j]); if(v > max) max = v; }
      const h = Math.max(2, max * H);
      g.fillRect(x, (H - h) / 2, 1, h);
    }
    return await new Promise(r => canvas.toBlob(r, 'image/png'));
  }catch(e){
    return null;   // an undecodeable file still publishes — just with no waveform
  }finally{
    if(ctx.close) ctx.close();
  }
}
/* best-effort: a cover that fails to generate isn't worth blocking a
   publish over, so this never throws — the post just keeps the plain
   play-glyph card it had before either feature existed. */
async function coverKeyFor(item){
  try{
    if(item.kind === 'video'){ const g = await grabVideoFrame(item.file); return g ? { cover_key: await uploadBlob(g.blob, 'jpg'), duration_ms: g.durationMs } : {}; }
    if(item.kind === 'audio'){ const g = await generateWaveform(item.file); return g ? { cover_key: await uploadBlob(g.blob, 'png'), duration_ms: g.durationMs } : {}; }
  }catch(e){ return {}; }
  return {};
}
/* media_key/cover_key/duration_ms/body/bytes together, the same calls
   every full works insert below makes for its item — not the collection
   branch, which deliberately skips cover_key (see its own comment). */
async function mediaFieldsFor(item){
  const media_key = item.kind === 'text' ? null : await uploadOne(item);
  const { cover_key = null, duration_ms = null } = await coverKeyFor(item);
  return {
    media_key, cover_key, duration_ms,
    body: item.kind === 'text' ? await item.file.text() : null,
    bytes: item.file.size
  };
}
async function publish(versionLabel){
  const btn = document.getElementById('upload-publish');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try{
    if(uploadCtx){
      const item = pending[0];
      const { media_key, cover_key, duration_ms, body, bytes } = await mediaFieldsFor(item);
      const title = item.kind === 'text' ? (item.title || item.file.name.replace(/\.[^.]+$/,'')) : item.file.name.replace(/\.[^.]+$/,'');
      const { error } = await sb.from('works').insert({
        owner_id: user.id, owner_name: ownerName(), kind: uploadCtx.kind, title,
        slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
        caption: item.caption || null, body, media_key, cover_key, duration_ms, bytes,
        version_of: uploadCtx.versionOf, version_label: versionLabel,
        status: 'published'
      });
      if(error) throw new Error(eski.dbError('ESK-5108','the version could not be published', error));
    } else if(uploadMode === 'collection'){
      const titleEl = document.getElementById('collection-title');
      const capEl = document.getElementById('collection-caption');
      const title = (titleEl && titleEl.value.trim()) || 'untitled';
      const { data: work, error } = await sb.from('works').insert({
        owner_id: user.id, owner_name: ownerName(), kind: 'combination', title,
        slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
        caption: (capEl && capEl.value.trim()) || null, status: 'published'
      }).select().single();
      if(error) throw new Error(eski.dbError('ESK-5106','the collection could not be published', error));
      let idx = 0;
      for(const item of pending){
        // ponytail: work_items has no cover_key column and nothing reads one yet
        // (collectionPane() renders media_key directly) — skip generating one
        // until the carousel actually wants it. See ARCHITECTURE.md.
        const media_key = item.kind === 'text' ? null : await uploadOne(item);
        const body = item.kind === 'text' ? await item.file.text() : null;
        const { error: ie } = await sb.from('work_items').insert({
          work_id: work.id, idx: idx++, kind: item.kind, media_key,
          caption: item.caption || (body ? body.slice(0,200) : null)
        });
        if(ie) throw new Error(eski.dbError('ESK-5106','a collection item failed to save', ie));
      }
    } else if(uploadMode === 'versions'){
      let rootId = null;
      for(const item of pending){
        const { media_key, cover_key, duration_ms, body, bytes } = await mediaFieldsFor(item);
        const title = item.title || item.file.name.replace(/\.[^.]+$/,'');
        const { data: w, error } = await sb.from('works').insert({
          owner_id: user.id, owner_name: ownerName(), kind: item.kind, title,
          slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
          caption: item.caption || null, body, media_key, cover_key, duration_ms, bytes,
          version_of: rootId, status: 'published'
        }).select().single();
        if(error) throw new Error(eski.dbError('ESK-5106','a version failed to publish', error));
        if(!rootId) rootId = w.id;
      }
    } else {
      for(const item of pending){
        const { media_key, cover_key, duration_ms, body, bytes } = await mediaFieldsFor(item);
        const title = item.kind === 'text' ? (item.title || item.file.name.replace(/\.[^.]+$/,'')) : item.file.name.replace(/\.[^.]+$/,'');
        const { error } = await sb.from('works').insert({
          owner_id: user.id, owner_name: ownerName(), kind: item.kind, title,
          slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
          caption: item.caption || null, body, media_key, cover_key, duration_ms, bytes, status: 'published'
        });
        if(error) throw new Error(eski.dbError('ESK-5106','the post could not be published', error));
      }
    }
    overlayRoot().innerHTML = '';
    toast('published');
    authListeners.forEach(cb => cb());
  }catch(e){
    toast((e && e.message) || String(e));
    btn.disabled = false; btn.textContent = btn.textContent.replace('Publishing…', 'Publish');
    renderUploadDetail();
  }
}

return {
  esc, fmtWhen, fmtDateTime, fmtBytes, slugify, toast, PLAY, CHECK, KINDS,
  init,
  get eski(){ return eski; }, get sb(){ return sb; }, get user(){ return user; },
  get myProfile(){ return myProfile; }, get myFollowing(){ return myFollowing; },
  get myLikes(){ return myLikes; }, get mySavedIds(){ return mySavedIds; },
  get mySeenIds(){ return mySeenIds; }, get myFolders(){ return myFolders; },
  ownerName, loadMyState,
  cardHtml, mediaTag, wireCardPreviews,
  openDetail, openSignIn, openUpload, openConfirm, openPrompt, reportFlow
};
})();
