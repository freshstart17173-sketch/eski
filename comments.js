/* THE THREAD, ONCE.

   It lives on two surfaces that have nothing else in common — the comic page
   on the shelf, and a sheet inside the reader — and a second copy of "post,
   reply, edit, tombstone" would have drifted from the first inside a week.
   So it is one classic script, on window, the same way platform.js is: these
   pages cannot import modules.

   Shut until asked for, everywhere. A comic thread is nothing but the ending,
   discussed; the bodies are not fetched until somebody opens it. That is the
   whole reason it is a fold and not a section.

   Mount it with a container and a comic, and it draws and drives itself:

     eskiComments.mount({
       root:     <element to fill>,
       comicId:  uuid,
       ownerId:  the comic's owner, who may moderate,
       page:     the page you are on, recorded on what you write here,
       onCount:  n => …,          // the fold's badge
       toast:    msg => …         // whatever this surface calls a toast
     });
     eskiComments.open() / .close() / .toggle()

   One level of reply, a delete that is a tombstone, and an author name filled
   by the server are all enforced in schema-comments.sql, not here. */
(function(){
  const esc = s => (s ?? '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const nfmt = n => (n || 0).toLocaleString('en-US');

  const when = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if(s < 60) return 'just now';
    if(s < 3600) return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    if(s < 86400*30) return Math.floor(s/86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-US',
      { month:'short', day:'numeric', year:'numeric' });
  };

  let S = null;                       // the mounted thread, or nothing

  const me = () => (window.eski && window.eski.user) || null;
  const sb = () => (window.eski && window.eski.sb) || null;
  const say = m => (S && S.toast ? S.toast(m) : console.warn(m));

  function mount(opts){
    if(S && S.root && S.root !== opts.root) S.root.innerHTML = '';
    S = Object.assign({
      rows: [], loaded: null, replyTo: null, editing: null, open: false,
      page: null, onCount: null, toast: null
    }, opts);
    S.root.innerHTML = '';
    S.root.classList.add('cm-root');
    bind(S.root);
    return api;
  }

  function toggle(force){
    if(!S) return;
    S.open = force != null ? force : !S.open;
    S.root.hidden = !S.open;
    if(S.open) load();
  }

  async function load(force){
    if(!S || !S.comicId) return;
    if(S.loaded === S.comicId && !force){ render(); return; }
    if(!sb()){ S.root.innerHTML =
      '<p class="note-line">Comments need the server, and it is not reachable.</p>'; return; }
    S.root.innerHTML = '<p class="note-line">Loading…</p>';
    const { data, error } = await sb().from('comments')
      .select('*').eq('comic_id', S.comicId)
      .order('created_at', { ascending: true }).limit(500);
    if(error){
      S.root.innerHTML = `<p class="note-line">${esc(
        window.eski.dbError('ESK-5040','the comments did not load',error))}</p>`;
      return;
    }
    S.rows = data || [];
    S.loaded = S.comicId;
    count();
    render();
  }

  function count(){
    const n = S.rows.filter(r => !r.deleted_at).length;
    if(S.onCount) S.onCount(n);
    return n;
  }

  function composer(parentId){
    if(!me()) return '<p class="note-line">Sign in to join the thread.</p>';
    return `<div class="cm-write">
      <textarea class="cm-box" id="cm-new-${parentId || 'top'}" maxlength="4000"
        placeholder="${parentId ? 'Write a reply' : 'Say something about this eski'}"></textarea>
      <div class="cm-acts">
        <button class="btn sm p" data-cm-post="${esc(parentId || '')}">Post</button>
        ${parentId ? '<button class="lnk" data-cm-cancel="1">Cancel</button>' : ''}
      </div></div>`;
  }

  function row(r, isReply){
    const mine = me() && r.user_id === me().id;
    const owns = me() && S.ownerId && me().id === S.ownerId;
    if(r.deleted_at)
      return `<div class="cm gone${isReply ? ' reply' : ''}"><span class="cm-who">Removed</span></div>`;
    if(S.editing === r.id) return `<div class="cm${isReply ? ' reply' : ''}">
      <div class="cm-head"><span class="cm-who">${esc(r.author_name)}</span></div>
      <textarea class="cm-box" id="cm-edit" maxlength="4000">${esc(r.body)}</textarea>
      <div class="cm-acts">
        <button class="btn sm" data-cm-save="${esc(r.id)}">Save</button>
        <button class="btn sm" data-cm-cancel="1">Cancel</button></div></div>`;
    return `<div class="cm${isReply ? ' reply' : ''}">
      <div class="cm-head">
        <span class="cm-who">${esc(r.author_name)}</span>
        ${r.page ? `<span class="cm-page">p.${r.page}</span>` : ''}
        <span class="sp"></span>
        <span class="cm-when">${esc(when(r.created_at))}${r.edited_at ? ' · edited' : ''}</span>
      </div>
      <p class="cm-body">${esc(r.body).replace(/\n/g,'<br>')}</p>
      <div class="cm-acts">
        ${(me() && !isReply) ? `<button class="lnk" data-cm-reply="${esc(r.id)}">Reply</button>` : ''}
        ${mine ? `<button class="lnk" data-cm-edit="${esc(r.id)}">Edit</button>` : ''}
        ${(mine || owns) ? `<button class="lnk" data-cm-del="${esc(r.id)}">Delete</button>` : ''}
      </div>
      ${S.replyTo === r.id ? composer(r.id) : ''}</div>`;
  }

  function render(){
    if(!S) return;
    const tops = S.rows.filter(r => !r.parent_id);
    const kids = new Map();
    for(const r of S.rows.filter(r => r.parent_id)){
      if(!kids.has(r.parent_id)) kids.set(r.parent_id, []);
      kids.get(r.parent_id).push(r);
    }
    // a tombstone with no replies left under it is just noise
    const live = tops.filter(r => !r.deleted_at || (kids.get(r.id) || []).length);
    S.root.innerHTML = composer(null) + (live.length
      ? live.map(r => row(r, false) +
          (kids.get(r.id) || []).map(k => row(k, true)).join('')).join('')
      : '<p class="note-line">Nothing here yet. Be the first.</p>');
  }

  async function post(parentId){
    const box = document.getElementById('cm-new-' + (parentId || 'top'));
    if(!box) return;
    const text = box.value.trim();
    if(!text) return;
    if(!me()){ say('sign in to comment'); return; }
    box.disabled = true;
    const r = { comic_id: S.comicId, user_id: me().id, body: text };
    if(parentId) r.parent_id = parentId;
    // a comment written while reading remembers where you were
    else if(S.page > 0) r.page = S.page;
    const { data, error } = await sb().from('comments').insert(r).select().single();
    box.disabled = false;
    if(error){ say(window.eski.dbError('ESK-5041','that comment did not post',error)); return; }
    S.rows.push(data);
    S.replyTo = null;
    count(); render();
  }

  async function save(id){
    const box = document.getElementById('cm-edit');
    if(!box) return;
    const text = box.value.trim();
    if(!text) return;
    const { data, error } = await sb().from('comments')
      .update({ body: text }).eq('id', id).select().single();
    if(error){ say(window.eski.dbError('ESK-5042','that edit did not save',error)); return; }
    S.rows = S.rows.map(r => r.id === id ? data : r);
    S.editing = null;
    render();
  }

  /* a tombstone, not a delete: the replies underneath have to survive */
  async function remove(id){
    if(!confirm('Remove this comment?')) return;
    const { data, error } = await sb().from('comments')
      .update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
    if(error){ say(window.eski.dbError('ESK-5043','that comment did not come off',error)); return; }
    S.rows = S.rows.map(r => r.id === id ? data : r);
    count(); render();
  }

  /* delegated and bound once per mount: the thread is rewritten on every
     action, and binding per render would stack a handler each time */
  function bind(root){
    if(root.dataset.cmBound) return;
    root.dataset.cmBound = '1';
    root.addEventListener('click', e => {
      if(!S) return;
      const hit = sel => e.target.closest(sel);
      const p = hit('[data-cm-post]');
      if(p){ post(p.dataset.cmPost || null); return; }
      const rep = hit('[data-cm-reply]');
      if(rep){ S.replyTo = S.replyTo === rep.dataset.cmReply ? null : rep.dataset.cmReply;
        S.editing = null; render(); return; }
      const ed = hit('[data-cm-edit]');
      if(ed){ S.editing = ed.dataset.cmEdit; S.replyTo = null; render();
        const t = document.getElementById('cm-edit'); if(t) t.focus(); return; }
      const sv = hit('[data-cm-save]');
      if(sv){ save(sv.dataset.cmSave); return; }
      const del = hit('[data-cm-del]');
      if(del){ remove(del.dataset.cmDel); return; }
      if(hit('[data-cm-cancel]')){ S.replyTo = null; S.editing = null; render(); return; }
    });
  }

  const api = {
    mount,
    open:  () => toggle(true),
    close: () => toggle(false),
    toggle,
    reload: () => load(true),
    get isOpen(){ return !!(S && S.open); },
    get count(){ return S ? S.rows.filter(r => !r.deleted_at).length : 0; },
    setPage(n){ if(S) S.page = n; }
  };
  window.eskiComments = api;
})();
