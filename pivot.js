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
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>';
const KINDS = ['image','video','audio','text','other','combination'];

let eski, sb, user = null, myProfile = null;
let myFollowing = new Set();     // followee_id I follow
let myLikes = new Set();         // work ids I've liked
let mySavedIds = new Set();      // work ids saved in ANY of my folders
let mySeenIds = new Set();       // work ids I've opened before
let myFolders = [];              // [{id,name}]
let authListeners = [];

async function init(onAuthChange){
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
function cardHtml(w){
  const inner = (() => {
    if(w.kind === 'video') return mediaTag(w, w.thumb_key || w.cover_key) + `<div class="gplay">${PLAY}</div>`;
    if(w.kind === 'audio') return (w.cover_key ? mediaTag(w, w.cover_key) : '') + `<div class="gplay">${PLAY}</div>`;
    if(w.kind === 'combination') return mediaTag(w, w.cover_key) +
      `<div class="gcount"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/></svg>${w._itemCount||0}</div>`;
    if(w.kind === 'other') return '';
    return mediaTag(w);
  })();
  if(w.kind === 'other')
    return `<button class="gcard" type="button" data-open="${w.id}">
      <div class="gbox framed"><div class="gother">${esc(w.title)}</div></div>
      <div class="gcap">${esc(w.title)}</div></button>`;
  if(w.kind === 'text')
    return `<button class="gcard" type="button" data-open="${w.id}">
      <div class="gbox framed" style="align-items:stretch;justify-content:flex-start;">
        <div class="gtext"><div class="gtitle">${esc(w.title)}</div><div class="gbody">${esc((w.body||'').slice(0,320))}</div></div>
      </div><div class="gcap">${esc(w.title)}</div></button>`;
  const framed = !inner && !w.media_key && !w.cover_key;
  return `<button class="gcard" type="button" data-open="${w.id}">
    <div class="gbox${framed?' framed':''}">${inner}</div>
    <div class="gcap">${esc(w.title)}</div></button>`;
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
  drop.querySelector('[data-newfolder]').addEventListener('click', async () => {
    if(!user) return openSignIn();
    const name = prompt('name this folder');
    if(!name || !name.trim()) return;
    const { data, error } = await sb.from('save_folders').insert({ owner_id: user.id, name: name.trim() }).select().single();
    if(error) return toast(eski.dbError('ESK-5104','the folder could not be created', error));
    myFolders.push(data);
    await sb.from('save_folder_items').insert({ folder_id: data.id, target_type:'work', target_id: workId });
    mySavedIds.add(workId);
    renderSaveDrop(root, workId);
  });
}
function tagsPanelHtml(work, tags, poster){
  const chips = tags.map(t => poster
    ? `<span class="tagchip"><span class="tagtext">#${esc(t)}</span><span class="x" data-detag="${esc(t)}">&times;</span></span>`
    : `<span class="chip small" style="background:var(--paper);">#${esc(t)}</span>`).join('');
  return `<div data-panel="tags" style="display:flex;flex-direction:column;gap:18px;padding:16px 24px;">
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;">content tags${poster?' &middot; edit anytime':''}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;" id="detail-tags">${chips}<button class="tagadd" type="button" id="detail-tagadd">+</button></div>
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
      ${!c.deleted_at ? `<button class="dtab" type="button" style="padding:2px 0;font-size:11px;" data-reply="${c.id}" data-who="${esc(c.author_name)}">reply</button>` : ''}
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
function mediaPane(work, items){
  if(work.kind === 'image') return `<div class="medial">${work.media_key ? `<img src="${esc(eski.mediaUrl(work.media_key))}" alt="">` : ''}</div>`;
  if(work.kind === 'video') return `<div class="medial" style="background:#0d0d0d;">${work.media_key ? `<video src="${esc(eski.mediaUrl(work.media_key))}" controls></video>` : ''}</div>`;
  if(work.kind === 'audio') return `<div class="medial" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:48px;">
    <div style="width:76px;height:76px;border-radius:var(--r-round);background:var(--ink);display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="26" height="26" style="fill:var(--paper);"><path d="M8 5v14l11-7z"/></svg></div>
    ${work.media_key ? `<audio src="${esc(eski.mediaUrl(work.media_key))}" controls style="width:100%;"></audio>` : ''}
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
      ${metaRows([['Added', fmtWhen(work.created_at)], ['By', work.owner_name], ['Items', items.length], ['Types', typesLine]])}
      ${poster ? posterActionsHtml(work) : actionBarHtml(work, liked, likeCount)}
    </div>`;
}
function editFormHtml(work){
  const isText = work.kind === 'text';
  return `<div id="edit-form" style="display:flex;flex-direction:column;gap:12px;">
    ${isText ? `<div class="ufield"><div class="ulabel">Title</div><input class="uinput" id="edit-title" value="${esc(work.title)}"></div>` : ''}
    <div class="ufield"><div class="ulabel">Caption</div><textarea class="utext" id="edit-caption" placeholder="Write a caption…">${esc(work.caption||'')}</textarea></div>
    ${isText ? `<div class="ufield"><div class="ulabel">Body</div><textarea class="utext" id="edit-body" style="min-height:160px;">${esc(work.body||'')}</textarea></div>` : ''}
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btnline" type="button" id="edit-cancel">Cancel</button>
      <button class="btnline filled" type="button" id="edit-save">Save</button>
    </div>
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
    sb.from('works').select('id,version_label,created_at').or(`id.eq.${rootId},version_of.eq.${rootId}`).order('created_at', { ascending:false })
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
function infoColHtml(work, liked, likeCount, poster){
  return `${work.kind==='text' ? '' : `<div style="font-weight:700;font-size:19px;color:var(--ink);line-height:1.3;">${esc(work.title)}</div>`}
    <div style="font-size:14px;color:var(--soft-ink);line-height:1.5;">${esc(work.caption||'')}</div>
    ${metaRows([['Added', fmtWhen(work.created_at)], ['By', work.owner_name]], work.media_key ? 'download' : null, work.media_key ? eski.mediaUrl(work.media_key) : null)}
    ${poster ? posterActionsHtml(work) : actionBarHtml(work, liked, likeCount)}`;
}
function overlayControlsHtml(poster, hasVersions, versions, work){
  return `<div style="position:absolute;top:20px;right:24px;z-index:6;display:flex;align-items:center;gap:8px;">
    ${hasVersions ? `<div class="verwrap">
      <button class="chip small" type="button" data-ver style="white-space:nowrap;">${versions.length>1?`v${versions.findIndex(v=>v.id===work.id)+1} of ${versions.length}`:'v1'}&nbsp;&#9662;</button>
      <div class="verdrop" data-verdrop>
        ${versions.map(v => `<button class="vi${v.id===work.id?' on':''}" type="button" data-goversion="${v.id}">
          ${esc(v.version_label || (v.id===work.id?'this version':'version'))} <span style="color:var(--muted);">${fmtWhen(v.created_at)}</span></button>`).join('')}
        ${poster ? `<div class="sep"></div><button class="vi add" type="button" id="add-version">+ Add version</button>` : ''}
      </div>
    </div>` : ''}
    ${poster ? `<div style="position:relative;"><button class="navarrow" type="button" id="burger-btn">&#8942;</button>
      <div class="burger" id="burger-menu">
        <button class="mi" type="button" id="edit-post-btn">Edit post</button>
        <button class="mi" type="button" data-post-private>Make private</button>
        <div class="sep"></div>
        <button class="mi danger" type="button" data-post-delete>Delete</button>
      </div></div>` : ''}
    <button class="navarrow" type="button" data-close-detail>&times;</button>
  </div>`;
}
function posterActionsHtml(work){
  return `<div class="a2c">
    <button class="btnline" type="button" id="a2c-btn" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;">
      <svg viewBox="0 0 24 24" width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;"><path d="M12 5v14M5 12h14"/></svg>Add to collection</button>
    <div class="a2cdrop" id="a2c-drop"></div>
  </div>`;
}
async function wireDetail(root, work, items, poster){
  root.querySelector('[data-close-detail]').addEventListener('click', () => root.innerHTML = '');
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
  // edit post — swaps the info column for a form; Save writes straight to
  // works and re-renders the overlay so every other panel picks up the change.
  const editBtn = root.querySelector('#edit-post-btn');
  if(editBtn) editBtn.addEventListener('click', () => {
    root.querySelector('#burger-menu').classList.remove('open');
    document.getElementById('info-col').innerHTML = editFormHtml(work);
    document.getElementById('edit-cancel').addEventListener('click', () => openDetail(work.id));
    document.getElementById('edit-save').addEventListener('click', async () => {
      const patch = { caption: document.getElementById('edit-caption').value.trim() || null };
      const titleEl = document.getElementById('edit-title');
      const bodyEl = document.getElementById('edit-body');
      if(titleEl) patch.title = titleEl.value.trim() || work.title;
      if(bodyEl) patch.body = bodyEl.value;
      const { error } = await sb.from('works').update(patch).eq('id', work.id);
      if(error) return toast(eski.dbError('ESK-5109','the edit could not be saved', error));
      toast('saved'); openDetail(work.id);
    });
  });
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
  const tagAdd = root.querySelector('#detail-tagadd');
  if(tagAdd) tagAdd.addEventListener('click', async () => {
    if(!user) return openSignIn();
    const t = prompt('tag (no #)');
    if(!t || !t.trim()) return;
    const tag = t.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
    if(tag.length < 2) return;
    const { error } = await sb.from('content_tags').insert({ target_type:'work', target_id: work.id, tag, added_by: user.id });
    if(error && error.code !== '23505') return toast(eski.dbError('ESK-5101','tag could not be added', error));
    openDetail(work.id);
  });
  root.querySelectorAll('[data-detag]').forEach(x => x.addEventListener('click', async () => {
    const { error } = await sb.from('content_tags').delete().eq('target_type','work').eq('target_id', work.id).eq('tag', x.dataset.detag);
    if(error) return toast(eski.dbError('ESK-5101','tag could not be removed', error));
    openDetail(work.id);
  }));
  // comments
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
    drop.querySelector('#new-collection').addEventListener('click', async () => {
      const title = prompt('name this collection');
      if(!title || !title.trim()) return;
      const { data: col, error } = await sb.from('collections').insert({
        owner_id: user.id, owner_name: ownerName(), title: title.trim(),
        slug: slugify(title) + '-' + Date.now().toString(36).slice(-5), status: 'published'
      }).select().single();
      if(error) return toast(eski.dbError('ESK-5105','collection could not be created', error));
      await sb.from('collection_items').insert({ collection_id: col.id, work_id: work.id });
      toast('collection created'); drop.classList.remove('open');
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
function openConfirm(title, body, confirmLabel, onConfirm){
  const root = confirmRoot();
  root.innerHTML = `<div class="pv-scrim" style="z-index:300;"><div class="pv-card" style="width:420px;padding:32px;display:flex;flex-direction:column;gap:16px;">
    <div style="font-weight:700;font-size:19px;color:var(--ink);">${esc(title)}</div>
    <div style="font-size:13.5px;color:var(--soft-ink);line-height:1.55;">${body}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
      <button class="btnline" type="button" id="confirm-cancel">Cancel</button>
      <button class="btnline danger" type="button" id="confirm-go">${esc(confirmLabel)}</button>
    </div>
  </div></div>`;
  scrimClose(root);
  root.querySelector('#confirm-cancel').addEventListener('click', () => root.innerHTML = '');
  root.querySelector('#confirm-go').addEventListener('click', () => { root.innerHTML = ''; onConfirm(); });
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
  box.querySelector('#upload-publish').addEventListener('click', publish);
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
/* NO VIDEO/AUDIO THUMBNAIL YET — see ARCHITECTURE.md. */
async function uploadOne(item){
  const hash = await sha256(item.file);
  const { data: session } = await sb.auth.getSession();
  const token = session && session.session && session.session.access_token;
  const signRes = await fetch('/api/sign', {
    method: 'POST',
    headers: { 'content-type':'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ files: [{ hash, ext: item.ext || 'bin' }] })
  });
  const signJson = await signRes.json().catch(() => null);
  if(!signRes.ok || !signJson || !signJson.files || !signJson.files[0])
    throw new Error((signJson && signJson.error) || ('ESK-3000 upload signing failed (' + signRes.status + ')'));
  const { key, url } = signJson.files[0];
  const put = await fetch(url, { method:'PUT', body: item.file });
  if(!put.ok) throw new Error('ESK-4003 upload failed (' + put.status + ')');
  return key;
}
async function publish(){
  const btn = document.getElementById('upload-publish');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try{
    if(uploadCtx){
      const item = pending[0];
      const media_key = item.kind === 'text' ? null : await uploadOne(item);
      const title = item.kind === 'text' ? (item.title || item.file.name.replace(/\.[^.]+$/,'')) : item.file.name.replace(/\.[^.]+$/,'');
      const body = item.kind === 'text' ? await item.file.text() : null;
      const { error } = await sb.from('works').insert({
        owner_id: user.id, owner_name: ownerName(), kind: uploadCtx.kind, title,
        slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
        caption: item.caption || null, body, media_key,
        version_of: uploadCtx.versionOf, version_label: prompt('label this version (optional)', '') || null,
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
        const media_key = item.kind === 'text' ? null : await uploadOne(item);
        const title = item.title || item.file.name.replace(/\.[^.]+$/,'');
        const body = item.kind === 'text' ? await item.file.text() : null;
        const { data: w, error } = await sb.from('works').insert({
          owner_id: user.id, owner_name: ownerName(), kind: item.kind, title,
          slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
          caption: item.caption || null, body, media_key,
          version_of: rootId, status: 'published'
        }).select().single();
        if(error) throw new Error(eski.dbError('ESK-5106','a version failed to publish', error));
        if(!rootId) rootId = w.id;
      }
    } else {
      for(const item of pending){
        const media_key = item.kind === 'text' ? null : await uploadOne(item);
        const title = item.kind === 'text' ? (item.title || item.file.name.replace(/\.[^.]+$/,'')) : item.file.name.replace(/\.[^.]+$/,'');
        const body = item.kind === 'text' ? await item.file.text() : null;
        const { error } = await sb.from('works').insert({
          owner_id: user.id, owner_name: ownerName(), kind: item.kind, title,
          slug: slugify(title) + '-' + Date.now().toString(36).slice(-5),
          caption: item.caption || null, body, media_key, status: 'published'
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
  esc, fmtWhen, slugify, toast, PLAY, CHECK, KINDS,
  init,
  get eski(){ return eski; }, get sb(){ return sb; }, get user(){ return user; },
  get myProfile(){ return myProfile; }, get myFollowing(){ return myFollowing; },
  get myLikes(){ return myLikes; }, get mySavedIds(){ return mySavedIds; },
  get mySeenIds(){ return mySeenIds; }, get myFolders(){ return myFolders; },
  ownerName, loadMyState,
  cardHtml, mediaTag,
  openDetail, openSignIn, openUpload, openConfirm
};
})();
