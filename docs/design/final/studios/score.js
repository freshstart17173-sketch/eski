/* ============================================================
   the composer studio.

   the model is unchanged — sound stacks in layers, and a clip owns a
   page range — but the surface is no longer a board of lanes. the
   page is the subject, and the panel on the right answers the only
   question a composer actually asks at any moment: what is playing
   on this page, and does it start or stop here.

   a range is still a range. you set it by standing on a page and
   saying "starts here" or "ends here", which is how you would
   describe it out loud, and the row shows the span it produced.
   ============================================================ */
const PAGES = COMIC.pageCount;
let page = 1;
let selected = null;
let bayPick = null;

const clipsOf = () => LAYERS.flatMap(l => l.clips.map(c => ({c, l})));
const findClip = id => clipsOf().find(x => x.c.id === id);
const onPage = p => LAYERS.filter(l => !l.muted || true).flatMap(l =>
  l.clips.filter(c => p >= c.from && p <= c.to).map(c => ({c, l})));
const covered = () => COMIC.pages.filter(p =>
  LAYERS.some(l => l.kind !== 'voice' && !l.muted &&
    l.clips.some(c => p.n >= c.from && p.n <= c.to))).length;
const cuesOn = p => openCues().filter(q => q.p === p);

/* the dots under a page in the timeline: one per thing audible there */
const dots = p => onPage(p).map(({l}) => roleColor(l.kind));

function render(){
  const here = onPage(page);
  document.getElementById('app').innerHTML = `
    ${topBar({
      sub:`${PAGES} pages · scoring`,
      mid:legend(['bed','score','sfx','voice']),
      actions:`${btn('add files','upload','q','id="add"')}
               ${btn('publish score','check','p','id="publish"')}`
    })}
    <div class="subbar">
      <span><b>${covered()}</b> of <b>${PAGES}</b> pages have sound</span>
      <span class="track"><i style="width:${covered() / PAGES * 100}%"></i></span>
      <span>${LAYERS.length} layers · ${clipsOf().length} clips</span>
    </div>

    <div class="frame">
      <div class="pane bay">
        <div class="panehead">${icon('music')}<b>sound bay</b><span class="sp"></span>
          <span>${BAY.length} files</span></div>
        <div class="baylist" id="baylist"></div>
      </div>

      ${pageHtml(page, `<span>${here.length} playing here</span>`)}

      <div class="pane">
        <div class="panehead">${icon('layers')}<b>on page ${page}</b><span class="sp"></span>
          <span>${here.length ? here.length + ' playing' : 'silent'}</span></div>
        <div class="panel" id="panel"></div>
      </div>
    </div>

    ${timelineHtml(page, dots)}
    ${dropLayerHtml('sound')}`;
  paintPanel();
  renderBay();
  scrollTimeline();
}

/* ---------- the panel ---------- */
function paintPanel(){
  const here = onPage(page), cues = cuesOn(page);
  document.getElementById('panel').innerHTML =
    (here.length ? here.map(itemHtml).join('')
      : `<div class="section">Nothing plays on this page. Arm a file in the bay and
          start it here, or drop one onto the page.</div>`)

    + `<div class="sectionhead">${icon('plus')}<b>start something here</b>
        <span class="sp"></span>
        <span>${bayPick ? esc(BAY.find(b => b.id === bayPick).name) : 'nothing armed'}</span></div>`
    + `<div class="section row">${LAYERS.filter(l => !l.locked).map(l =>
        `<button class="btn q" data-start="${l.id}" ${bayPick ? '' : 'disabled'}
          style="--c:${roleColor(l.kind)}">
          <span class="glyph" style="color:${roleColor(l.kind)}">${icon(ROLE[l.kind].icon)}</span>
          ${esc(l.name)}</button>`).join('')}
        ${btn('new layer','plus','q','id="newlayer"')}</div>`

    + (cues.length ? `<div class="sectionhead">${icon('zap')}<b>the author asked for</b>
        <span class="sp"></span><span>on this page</span></div>`
      + cues.map(q => `<div class="cue" style="--c:${roleColor('sfx')}">
          <span class="letter">${esc(q.letter || '—')}</span>
          <span>${esc(q.t)}</span>
          ${btn('fill','plus','q',`data-fill="${q.id}" ${bayPick ? '' : 'disabled'}`)}
        </div>`).join('') : '')

    + `<div class="sectionhead">${icon('sliders')}<b>everything, page by page</b></div>`
    + `<div class="section">${openCues().length} effect${openCues().length === 1 ? '' : 's'}
        still unfilled · ${PAGES - covered()} page${PAGES - covered() === 1 ? '' : 's'}
        with nothing under them</div>`;
}

function itemHtml({c, l}){
  const sel = selected === c.id, span = c.to - c.from + 1;
  return `<div class="item${sel ? ' sel' : ''}${l.locked ? ' locked' : ''}"
    data-clip="${c.id}" style="--c:${roleColor(l.kind)}">
    <span class="glyph">${icon(ROLE[l.kind].icon)}</span>
    <span class="nm"><b>${esc(c.name)}</b>
      <span class="sub">${ROLE[l.kind].label} · ${esc(l.name)}${
        span > 1 ? ` · pages ${c.from}–${c.to}` : ` · page ${c.from}`}${
        c.loop ? ' · loops' : ''}</span></span>
    <span class="tools">
      <button class="prev" data-playclip="${c.id}" data-dur="8">${icon('play')}</button>
      ${l.locked ? icon('lock') : btn('', sel ? 'x' : 'sliders', 'q sq',
        `data-open="${c.id}" title="${sel ? 'close' : 'adjust'}"`)}
    </span>
    ${sel && !l.locked ? `
      <div class="itembody">
        <div class="spanbar"><span>from <b>${c.from}</b></span>
          <span class="len"><i style="left:${(c.from - 1) / PAGES * 100}%;
            width:${span / PAGES * 100}%"></i></span>
          <span>to <b>${c.to}</b></span></div>
        <div class="row">
          ${btn('starts here','left','q',`data-from-here="${c.id}"`)}
          ${btn('ends here','right','q',`data-to-here="${c.id}"`)}
          ${btn('loop','dot','q',`data-loop="${c.id}" aria-pressed="${c.loop}"`)}
          ${btn('remove','trash','q',`data-del="${c.id}"`)}
        </div>
        <label class="field"><span class="k">gain ${c.gain > 0 ? '+' : ''}${c.gain} db</span>
          <input type="range" min="-24" max="12" value="${c.gain}" data-gain="${c.id}"></label>
      </div>` : ''}
  </div>`;
}

function renderBay(){
  document.getElementById('baylist').innerHTML = BAY.length
    ? BAY.map(b => bayRow(b, bayPick)).join('')
    : `<div class="bayempty"><b>drop sound here</b>music, ambience, effects</div>`;
}

/* ---------- placing ---------- */
function startHere(layerId, cue){
  const b = BAY.find(x => x.id === bayPick);
  const l = LAYERS.find(x => x.id === layerId);
  if(!b || !l) return;
  const span = l.kind === 'sfx' ? 0 : l.kind === 'bed' ? Math.min(PAGES - page, 9) : 5;
  const c = {id:'c' + Math.random().toString(36).slice(2,6),
    name:b.name.replace(/\.[a-z0-9]+$/i, ''), from:page,
    to:Math.min(PAGES, page + span), gain:l.kind === 'bed' ? -8 : 0,
    loop:l.kind !== 'sfx', dur:b.dur, cue};
  l.clips.push(c);
  bayPick = null;
  selected = c.id;
  render();
  toast(`${c.name} starts on page ${page}`);
}

document.addEventListener('click', e => {
  const t = e.target;
  const pl = t.closest('[data-playbay],[data-playclip]');
  if(pl){ play_(pl, +(pl.dataset.dur || 6)); return; }

  const bayRowEl = t.closest('[data-bay]');
  if(bayRowEl){
    bayPick = bayPick === bayRowEl.dataset.bay ? null : bayRowEl.dataset.bay;
    render();
    toast(bayPick ? 'now say where it starts' : 'nothing armed');
    return;
  }
  const start = t.closest('[data-start]');
  if(start){ startHere(start.dataset.start); return; }
  const fill = t.closest('[data-fill]');
  if(fill){
    const fx = LAYERS.find(l => l.kind === 'sfx');
    startHere(fx.id, fill.dataset.fill);
    return;
  }
  if(t.closest('#newlayer')){
    const kind = 'bed';
    LAYERS.splice(LAYERS.length - 1, 0, {id:'L' + Math.random().toString(36).slice(2,5),
      name:`${ROLE[kind].label} ${LAYERS.filter(l => l.kind === kind).length + 1}`,
      kind, volume:40, muted:false, clips:[]});
    render(); toast('layer added'); return;
  }

  const open = t.closest('[data-open]');
  if(open){
    selected = selected === open.dataset.open ? null : open.dataset.open;
    paintPanel(); return;
  }
  const fh = t.closest('[data-from-here]');
  if(fh){
    const {c, l} = findClip(fh.dataset.fromHere);
    c.from = Math.min(page, c.to);
    if(l.kind === 'sfx') c.to = c.from;
    render(); toast(`starts on page ${c.from}`); return;
  }
  const th = t.closest('[data-to-here]');
  if(th){
    const {c, l} = findClip(th.dataset.toHere);
    c.to = Math.max(page, c.from);
    if(l.kind === 'sfx') c.from = c.to;
    render(); toast(`ends on page ${c.to}`); return;
  }
  const lp = t.closest('[data-loop]');
  if(lp){ findClip(lp.dataset.loop).c.loop = !findClip(lp.dataset.loop).c.loop;
    paintPanel(); return; }
  const del = t.closest('[data-del]');
  if(del){
    const {c, l} = findClip(del.dataset.del);
    l.clips.splice(l.clips.indexOf(c), 1);
    selected = null; render(); toast(`${c.name} removed`); return;
  }
  const item = t.closest('[data-clip]');
  if(item && !t.closest('.tools')){
    selected = selected === item.dataset.clip ? null : item.dataset.clip;
    paintPanel(); return;
  }

  const pg = t.closest('[data-page]');
  if(pg){ page = +pg.dataset.page; render(); return; }
  if(t.closest('#prev')){ page = Math.max(1, page - 1); render(); return; }
  if(t.closest('#next')){ page = Math.min(PAGES, page + 1); render(); return; }
  if(t.closest('#add')){ document.getElementById('filein').click(); return; }
  if(t.closest('#publish')){
    const silent = PAGES - covered();
    toast(silent ? `published · ${silent} page${silent === 1 ? '' : 's'} with nothing under them`
                 : 'published · every page has sound');
  }
});

document.addEventListener('input', e => {
  const g = e.target.closest('[data-gain]');
  if(!g) return;
  findClip(g.dataset.gain).c.gain = +g.value;
  paintPanel();
});

/* dragging a bay row onto the page places it here too */
document.addEventListener('dragstart', e => {
  const row = e.target.closest('[data-bay]');
  if(!row) return;
  e.dataTransfer.setData('text/plain', row.dataset.bay);
  e.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragover', e => {
  if(e.target.closest('.stage,.panel')) e.preventDefault();
});
document.addEventListener('drop', e => {
  const zone = e.target.closest('.stage,.panel');
  if(!zone) return;
  const id = e.dataTransfer.getData('text/plain');
  if(!id || !BAY.some(b => b.id === id)) return;
  e.preventDefault();
  bayPick = id;
  const score = LAYERS.find(l => l.kind === 'score' && !l.locked) || LAYERS[0];
  startHere(score.id);
});

addEventListener('keydown', e => {
  if(e.target.matches('input,select,textarea')) return;
  if(e.key === 'ArrowLeft' || e.key === '['){ page = Math.max(1, page - 1); render(); }
  if(e.key === 'ArrowRight' || e.key === ']'){ page = Math.min(PAGES, page + 1); render(); }
});

function bayAdd(files){
  let n = 0;
  [...files].forEach(f => {
    if(f.type && !f.type.startsWith('audio')) return;
    const b = {id:'b' + Math.random().toString(36).slice(2,6), name:f.name, dur:'· · ·'};
    BAY.push(b); n++;
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if(isFinite(a.duration))
        b.dur = `${Math.floor(a.duration/60)}:${String(Math.floor(a.duration%60)).padStart(2,'0')}`;
      renderBay();
    };
    a.src = URL.createObjectURL(f);
  });
  renderBay();
  if(n) toast(`${n} file${n === 1 ? '' : 's'} in the bay · arm one and say where it starts`);
}

render();
document.body.insertAdjacentHTML('beforeend',
  '<input type="file" id="filein" accept="audio/*" multiple hidden>');
document.getElementById('filein').addEventListener('change', e => {
  bayAdd(e.target.files); e.target.value = '';
});
wireDrop(bayAdd);
