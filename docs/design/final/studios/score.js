/* ============================================================
   the composer studio. sound stacks; a clip owns a page range.

   two things this version adds beyond the model: the page ruler
   carries thumbnails (skins 2 and 3), because nobody navigates a
   comic by number, and the author's sound effect cues arrive as a
   worklist — "KRAK, page 2" sits in the cue rail until somebody drops
   a file on it. the blank canvas problem solves itself.
   ============================================================ */
const PAGES = COMIC.pageCount;
let page = 1;
let selected = null;
let bayPick = null;
let col = STYLE === '3' ? 40 : 46;

const clipsOf = () => LAYERS.flatMap(l => l.clips.map(c => ({c, l})));
const findClip = id => clipsOf().find(x => x.c.id === id);
const laneColor = l => roleColor(l.kind);

/* clips that overlap inside one layer stack into sub-rows: two beds at once
   is a legitimate thing to want to see. */
function packRows(clips){
  const rows = [];
  [...clips].sort((a, b) => a.from - b.from).forEach(c => {
    let r = rows.find(row => row.every(x => c.from > x.to || c.to < x.from));
    if(!r){ r = []; rows.push(r); }
    r.push(c);
  });
  return rows.length ? rows : [[]];
}
const cols = () => `repeat(${PAGES}, ${col}px)`;

function render(){
  document.getElementById('app').innerHTML = `
    ${topBar({
      sub:`${PAGES} pages · scoring`,
      mid:legend(['bed','score','sfx','voice']),
      actions:`${btn('fit','grid','q keep','id="fit"')}
               ${btn('publish score','check','p keep','id="publish"')}`
    })}
    <div class="subbar">
      <span><b>${LAYERS.length}</b> layers · <b>${clipsOf().length}</b> clips</span>
      <span class="track"><i style="width:${covered() / PAGES * 100}%"></i></span>
      <span>${covered()} of ${PAGES} pages have sound</span>
    </div>

    <div class="body-board">
      <div class="pane bay">
        <div class="panehead">${icon('music')}<b>sound bay</b><span class="sp"></span>
          ${btn('add','upload','q','id="add"')}</div>
        <div class="baylist" id="baylist"></div>
        <div class="panehead" style="border-top:1px solid var(--line,var(--hair))">
          ${icon('zap')}<b>cues from the author</b><span class="sp"></span>
          <span>${openCues().length} open</span></div>
        <div class="baylist" id="cuelist" style="flex:0 0 auto;max-height:34%"></div>
      </div>

      <div class="pane">
        <div class="board">
          <div class="heads"><div class="rulerspacer" id="spacer"></div>
            <div id="heads"></div></div>
          <div class="hscroll" id="hscroll"><div id="sheet"></div></div>
        </div>
        <div class="pagebar">
          ${btn('bed','plus','q keep','data-add="bed"')}
          ${btn('score','plus','q keep','data-add="score"')}
          ${btn('effects','plus','q keep','data-add="sfx"')}
          <span class="sp"></span>
          <span>drag a clip to move it · drag its edge to change the range</span>
        </div>
      </div>

      <div class="pane insp">
        <div class="panehead">${icon('image')}<b>page ${page}</b><span class="sp"></span>
          <span>${onPage(page).length} playing</span></div>
        <div class="stage" style="flex:0 0 auto;height:190px">
          <div class="plate"><img src="${esc(COMIC.pages[page - 1].src)}" alt=""></div>
        </div>
        <div id="stack"></div>
        <div class="inspbody" id="insp"></div>
      </div>
    </div>
    ${HAS.foot ? `<div class="footbar">
      <span>page <b>${page}</b></span><span class="sp"></span>
      <span>← → move · , . trim · l loop · ⌫ remove</span></div>` : ''}
    ${dropLayerHtml('sound')}
    ${compareStrip('score')}`;

  paintBoard(); renderBay(); renderCues(); paintStack(); paintInsp();
}

const onPage = p => LAYERS.flatMap(l => l.clips
  .filter(c => p >= c.from && p <= c.to).map(c => ({c, l})));
const covered = () => COMIC.pages.filter(p =>
  LAYERS.some(l => l.kind !== 'voice' && !l.muted &&
    l.clips.some(c => p.n >= c.from && p.n <= c.to))).length;

function paintBoard(){
  const packed = LAYERS.map(l => ({l, rows:packRows(l.clips)}));
  document.getElementById('heads').innerHTML = packed.map(({l, rows}) =>
    rows.map((r, i) => i ? `<div class="lanehead"></div>` : `
      <div class="lanehead first" style="--c:${laneColor(l)}">
        <span class="sw"></span>
        <span class="nm">${esc(l.name)}</span>
        <span class="kind">${ROLE[l.kind].label}</span>
        <span class="sp"></span>
        ${rows.length > 1 ? `<span class="kind">${rows.length}×</span>` : ''}
        ${l.locked ? icon('lock')
          : `<button class="mini" data-mute="${l.id}" aria-pressed="${l.muted}"
               title="mute">${icon(l.muted ? 'mute' : 'volume')}</button>`}
      </div>`).join('')).join('');

  document.getElementById('sheet').innerHTML =
    `<div class="ruler" style="grid-template-columns:${cols()}">
      ${COMIC.pages.map(p => `
        <button class="rulercell${p.n % 10 === 1 && p.n > 1 ? ' tenth' : ''}"
          data-page="${p.n}" aria-current="${page === p.n}">
          ${HAS.thumbs ? `<span class="plate"><img src="${esc(p.src)}" alt=""></span>` : ''}
          <span class="n">${p.n}</span>
        </button>`).join('')}
     </div>`
    + packed.map(({l, rows}) => rows.map((row, i) => `
      <div class="lane${i ? '' : ' first'}" data-layer="${l.id}"
        style="grid-template-columns:${cols()}">
        ${COMIC.pages.map(p => `<div class="cell${
          p.n % 10 === 1 && p.n > 1 ? ' tenth' : ''}"></div>`).join('')}
        ${row.map(c => clipHtml(c, l)).join('')}
      </div>`).join('')).join('')
    + (HAS.playhead ? `<div class="playhead" style="left:${(page - 1) * col + col / 2}px;
        height:${document.getElementById('sheet') ? '100%' : '100%'}"></div>` : '');

  const ruler = document.querySelector('.ruler');
  if(ruler) document.getElementById('spacer').style.height = ruler.offsetHeight + 'px';
}

function clipHtml(c, l){
  const span = c.to - c.from + 1;
  return `<div class="clip${l.locked ? ' locked' : ''}" data-clip="${c.id}"
    aria-selected="${selected === c.id}" style="--c:${laneColor(l)};
    grid-column:${c.from} / span ${span}"
    title="${esc(c.name)} · pages ${c.from}–${c.to}">
    ${l.locked ? '' : '<span class="grip l" data-grip="l"></span>'}
    ${col > 30 ? icon(ROLE[l.kind].icon) : ''}
    <span class="nm">${esc(c.name)}</span>
    ${span > 2 ? `<span class="rng">${c.from}–${c.to}${c.loop ? ' ∞' : ''}</span>` : ''}
    ${l.locked ? '' : '<span class="grip r" data-grip="r"></span>'}
  </div>`;
}

function renderBay(){
  document.getElementById('baylist').innerHTML = BAY.length
    ? BAY.map(b => bayRow(b, bayPick)).join('')
    : `<div class="bayempty"><b>drop sound here</b>music, ambience, effects</div>`;
}

/* the author asked for these. each one is a page and a description waiting
   for a file — drop onto it and the clip lands on the right page already
   named. */
function renderCues(){
  const cues = openCues();
  document.getElementById('cuelist').innerHTML = cues.length
    ? cues.map(q => `<div class="cue" data-cue="${q.id}" style="--c:${roleColor('sfx')}">
        <span class="letter">${esc(q.letter || '—')}</span>
        <span><b>p${q.p}</b> · ${esc(q.t)}</span>
        ${btn('', 'plus', 'q sq', `data-fill="${q.id}"`)}
      </div>`).join('')
    : `<div class="bayempty" style="padding:var(--s3)">every cue is filled</div>`;
}

function paintStack(){
  const here = onPage(page);
  document.getElementById('stack').innerHTML = here.length
    ? here.map(({c, l}) => `<div class="cue" style="--c:${laneColor(l)}">
        <span class="letter">${icon(ROLE[l.kind].icon)}</span>
        <span>${esc(c.name)}</span>
        <span class="meta n" style="font-size:9px">${ROLE[l.kind].label}</span>
      </div>`).join('')
    : `<div class="cue" style="--c:var(--label)"><span class="letter">—</span>
        <span>silent page</span><span></span></div>`;
}

function paintInsp(){
  const box = document.getElementById('insp');
  const found = selected && findClip(selected);
  if(!found){
    box.innerHTML = `<div class="none">select a clip to set its pages, gain and looping.
      drag sound out of the bay onto a layer to make one.</div>`;
    return;
  }
  const {c, l} = found;
  box.innerHTML = `<section>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:var(--s2)">
        <span class="sw" style="width:10px;height:10px;background:${laneColor(l)}"></span>
        <b style="font-family:var(--font-display);font-size:15px">${esc(c.name)}</b>
        <span class="sp"></span>
        <button class="prev" data-playclip data-dur="8">${icon('play')}</button>
      </div>
      <div class="grid2">
        <label class="field"><span class="k">from page</span>
          <input type="number" min="1" max="${PAGES}" value="${c.from}" data-from
            ${l.locked ? 'disabled' : ''}></label>
        <label class="field"><span class="k">to page</span>
          <input type="number" min="1" max="${PAGES}" value="${c.to}" data-to
            ${l.locked ? 'disabled' : ''}></label>
      </div>
      <label class="field" style="margin-top:var(--s2)">
        <span class="k">gain ${c.gain > 0 ? '+' : ''}${c.gain} db</span>
        <input type="range" min="-24" max="12" value="${c.gain}" data-gain
          ${l.locked ? 'disabled' : ''}></label>
      <div style="display:flex;gap:6px;margin-top:var(--s3)">
        ${l.locked ? '<span class="none">turned in by a performer</span>' :
          btn('loop','dot','q keep',`data-loop aria-pressed="${c.loop}"`) +
          btn('remove','trash','q keep','data-del')}
      </div>
    </section>`;
}

/* ---------- placing, moving, resizing ---------- */
const pageAt = (lane, x) => Math.min(PAGES, Math.max(1,
  Math.floor((x - lane.getBoundingClientRect().left) / col) + 1));

let drag = null;
document.addEventListener('pointerdown', e => {
  const lane = e.target.closest('.lane');
  if(bayPick && lane){ addClip(bayPick, lane.dataset.layer, pageAt(lane, e.clientX)); return; }
  const clip = e.target.closest('.clip');
  if(!clip) return;
  const {c, l} = findClip(clip.dataset.clip);
  selected = c.id;
  document.querySelectorAll('.clip').forEach(el =>
    el.setAttribute('aria-selected', el.dataset.clip === selected));
  paintInsp();
  if(l.locked) return;
  const grip = e.target.closest('[data-grip]');
  drag = {id:c.id, mode:grip ? grip.dataset.grip : 'move', x0:e.clientX, from0:c.from, to0:c.to};
  document.getElementById('sheet').setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if(!drag) return;
  const {c, l} = findClip(drag.id);
  const d = Math.round((e.clientX - drag.x0) / col);
  if(drag.mode === 'move'){
    const len = drag.to0 - drag.from0;
    const from = Math.min(Math.max(1, drag.from0 + d), PAGES - len);
    if(from === c.from) return;
    c.from = from; c.to = from + len;
  }else if(drag.mode === 'l'){
    const f = Math.min(Math.max(1, drag.from0 + d), c.to);
    if(f === c.from) return;
    c.from = f;
  }else{
    const t = Math.max(Math.min(PAGES, drag.to0 + d), c.from);
    if(t === c.to) return;
    c.to = t;
  }
  if(l.kind === 'sfx') c.to = c.from;
  paintBoard(); paintStack();
});
addEventListener('pointerup', () => {
  if(!drag) return;
  const {c} = findClip(drag.id);
  if(c.from !== drag.from0 || c.to !== drag.to0) toast(`${c.name} · pages ${c.from}–${c.to}`);
  drag = null;
});

function addClip(bayId, layerId, from, cue){
  const b = BAY.find(x => x.id === bayId);
  const l = LAYERS.find(x => x.id === layerId);
  if(!b || !l || l.locked) return;
  const span = l.kind === 'sfx' ? 0 : l.kind === 'bed' ? Math.min(PAGES - from, 9) : 5;
  const c = {id:'c' + Math.random().toString(36).slice(2,6),
    name:b.name.replace(/\.[a-z0-9]+$/i, ''), from, to:Math.min(PAGES, from + span),
    gain:l.kind === 'bed' ? -8 : 0, loop:l.kind !== 'sfx', dur:b.dur, cue};
  l.clips.push(c);
  bayPick = null;
  selected = c.id;
  render();
  toast(`${c.name} · ${l.name} · pages ${c.from}–${c.to}`);
}

/* ---------- clicks ---------- */
document.addEventListener('click', e => {
  const bp = e.target.closest('[data-playbay],[data-playclip]');
  if(bp){ play_(bp, +(bp.dataset.dur || 8)); return; }
  const row = e.target.closest('[data-bay]');
  if(row){
    bayPick = bayPick === row.dataset.bay ? null : row.dataset.bay;
    renderBay();
    toast(bayPick ? 'now click the layer and page it starts on' : 'nothing armed');
    return;
  }
  const fill = e.target.closest('[data-fill]');
  if(fill){
    const q = SCRIPT.find(l => l.id === fill.dataset.fill);
    const fx = LAYERS.find(l => l.kind === 'sfx');
    if(!BAY.length){ toast('drop a file in the bay first'); return; }
    addClip(bayPick || BAY[0].id, fx.id, q.p, q.id);
    return;
  }
  const rc = e.target.closest('[data-page]');
  if(rc){ page = +rc.dataset.page; render(); return; }
  const mute = e.target.closest('[data-mute]');
  if(mute){
    const l = LAYERS.find(x => x.id === mute.dataset.mute);
    l.muted = !l.muted; render(); toast(`${l.name} ${l.muted ? 'muted' : 'unmuted'}`); return;
  }
  const add = e.target.closest('[data-add]');
  if(add){
    const kind = add.dataset.add;
    LAYERS.splice(LAYERS.length - 1, 0, {
      id:'L' + Math.random().toString(36).slice(2,5),
      name:`${ROLE[kind].label} ${LAYERS.filter(l => l.kind === kind).length + 1}`,
      kind, volume:kind === 'bed' ? 40 : 100, muted:false, clips:[]});
    render(); toast('layer added · drag sound onto it'); return;
  }
  if(e.target.closest('#fit')){
    const w = document.getElementById('hscroll').clientWidth - 8;
    col = col > 20 ? Math.max(11, Math.floor(w / PAGES)) : (STYLE === '3' ? 40 : 46);
    render(); return;
  }
  if(e.target.closest('#add')){ document.getElementById('filein').click(); return; }
  if(e.target.closest('#publish')){
    const silent = PAGES - covered();
    toast(silent ? `published · ${silent} page${silent === 1 ? '' : 's'} with nothing under them`
                 : 'published · every page has sound');
    return;
  }
  const found = selected && findClip(selected);
  if(!found) return;
  if(e.target.closest('[data-loop]')){ found.c.loop = !found.c.loop; render(); return; }
  if(e.target.closest('[data-del]')){
    found.l.clips.splice(found.l.clips.indexOf(found.c), 1);
    selected = null; render(); toast('removed');
  }
});
document.addEventListener('input', e => {
  const found = selected && findClip(selected);
  if(!found) return;
  const {c, l} = found;
  if(e.target.matches('[data-from]')){ c.from = Math.min(Math.max(1, +e.target.value || 1), c.to);
    if(l.kind === 'sfx') c.to = c.from; paintBoard(); paintStack(); }
  if(e.target.matches('[data-to]')){ c.to = Math.max(Math.min(PAGES, +e.target.value || 1), c.from);
    paintBoard(); paintStack(); }
  if(e.target.matches('[data-gain]')){ c.gain = +e.target.value; paintInsp(); }
});

/* dragging a bay row onto a lane */
document.addEventListener('dragstart', e => {
  const row = e.target.closest('[data-bay]');
  if(!row) return;
  e.dataTransfer.setData('text/plain', row.dataset.bay);
  e.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('dragover', e => {
  const lane = e.target.closest('.lane');
  if(!lane) return;
  e.preventDefault();
  document.querySelectorAll('.lane.dropping').forEach(l => l.classList.remove('dropping'));
  lane.classList.add('dropping');
});
document.addEventListener('drop', e => {
  const lane = e.target.closest('.lane');
  if(!lane) return;
  e.preventDefault();
  lane.classList.remove('dropping');
  addClip(e.dataTransfer.getData('text/plain'), lane.dataset.layer, pageAt(lane, e.clientX));
});

addEventListener('keydown', e => {
  if(e.target.matches('input,select,textarea')) return;
  const found = selected && findClip(selected);
  if(!found || found.l.locked) return;
  const {c, l} = found, len = c.to - c.from;
  const k = e.key;
  if(k === 'ArrowLeft' && c.from > 1){ e.preventDefault(); c.from--; c.to = c.from + len; }
  else if(k === 'ArrowRight' && c.to < PAGES){ e.preventDefault(); c.from++; c.to = c.from + len; }
  else if(k === ',' && c.to > c.from && l.kind !== 'sfx'){ e.preventDefault(); c.to--; }
  else if(k === '.' && c.to < PAGES && l.kind !== 'sfx'){ e.preventDefault(); c.to++; }
  else if(k === 'l'){ c.loop = !c.loop; }
  else if(k === 'Backspace' || k === 'Delete'){
    e.preventDefault(); l.clips.splice(l.clips.indexOf(c), 1); selected = null;
  }else return;
  render();
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
  if(n) toast(`${n} file${n === 1 ? '' : 's'} in the bay`);
}

render();
document.body.insertAdjacentHTML('beforeend',
  '<input type="file" id="filein" accept="audio/*" multiple hidden>');
document.getElementById('filein').addEventListener('change', e => {
  bayAdd(e.target.files); e.target.value = '';
});
wireDrop(bayAdd);
