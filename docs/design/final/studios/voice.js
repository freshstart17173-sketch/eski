/* ============================================================
   the voiceover studio. one character, one page at a time.

   unchanged in substance from the agreed version: every character is
   always available, nobody is named, other characters' lines stay in
   grey for cueing, takes are trimmed rather than cut, and audio
   arrives either from the browser or from the bay.

   colour does more of the work here than it used to: the character's
   own colour marks their lines, and sound effects the author wrote
   show in the effects colour so a performer knows what is about to
   happen over them.
   ============================================================ */
let ME = null;
let page = 1;
let focused = null;
let bayPick = null;
const TAKES = {};                       /* line id -> {takes:[], chosen} */
const BAY_V = [];
let trimOpen = null;

const st = id => (TAKES[id] = TAKES[id] || {takes:[], chosen:null});
const mineOn = p => dialogueOn(p).filter(l => l.c === ME);
const myLines = () => forChar(ME);
const meColor = () => (castById(ME) || {}).color || roleColor('voice');

const dots = p => linesOn(p).map(l =>
  l.kind === 'sfx' ? roleColor('sfx')
  : l.c === ME ? (st(l.id).takes.length ? meColor() : 'var(--line-2,#bbb)')
  : 'transparent').filter(c => c !== 'transparent');

function render(){
  const done = myLines().filter(l => st(l.id).takes.length).length;
  document.getElementById('app').innerHTML = `
    ${topBar({
      sub:ME ? '' : 'pick a character',
      mid:ME ? `<button class="btn q" id="who" style="--c:${meColor()}">
          <span class="sw" style="width:8px;height:8px;background:${meColor()}"></span>
          voicing ${esc(castById(ME).name)}</button>` : '',
      actions:`${btn('reference','eye','q keep','id="ref" aria-pressed="' + reference + '"')}
        ${btn('add files','upload','q keep','id="add"')}
        ${btn(done && done === myLines().length ? 'publish voiceover'
          : `publish · ${myLines().length - done} left`, 'check', 'p keep',
          'id="publish"' + (done < myLines().length ? ' disabled' : ''))}`
    })}
    <div class="subbar">
      <span><b>${done}</b> of <b>${myLines().length}</b> lines</span>
      <span class="track"><i style="width:${myLines().length ? done / myLines().length * 100 : 0}%"></i></span>
      ${legend(['voice','sfx'])}
    </div>

    <div class="frame">
      <div class="pane bay">
        <div class="panehead">${icon('music')}<b>audio bay</b><span class="sp"></span>
          <span>${BAY_V.length ? BAY_V.length + ' files' : 'drop or record'}</span></div>
        <div class="baylist" id="baylist"></div>
      </div>

      ${pageHtml(page, `<span>${mineOn(page).filter(l => !st(l.id).takes.length).length} to record here</span>`)}

      <div class="pane">
        <div class="panehead">${icon('mic')}<b>page ${page}</b><span class="sp"></span>
          <span>space · ↑↓ · enter</span></div>
        <div class="panel lines" id="lines">${linesHtml()}</div>
      </div>
    </div>

    ${timelineHtml(page, dots)}
    ${dropLayerHtml('audio')}
    <div class="ov${ME ? '' : ' on'}" id="pick"><div class="sheet">
      <div class="sheethead"><span>voicing</span><span class="ttl">${esc(COMIC.title)}</span>
        <span class="sp"></span><span>${esc(COMIC.by)}</span></div>
      ${CAST.map(c => `<button class="pickrow" data-pick="${c.id}" style="--c:${c.color}">
        <span class="plate"><img src="${esc(COMIC.art)}" alt=""></span>
        <span><span class="nm"><span class="sw"></span>${esc(c.name)}</span>
          <span class="bl">${esc(c.desc)}</span></span>
        <span class="meta">${forChar(c.id).length} lines<br>${esc(c.kind)}</span>
        <span>${btn('voice this','mic','q keep')}</span>
      </button>`).join('')}
      <div class="sheethead" style="border-top:1px solid var(--line,var(--hair));border-bottom:0">
        one character at a time, and any of them, however many people have read it before you
      </div>
    </div></div>`;
  renderBay();
  scrollTimeline();
}

function linesHtml(){
  return linesOn(page).map((l, k) => {
    if(l.kind === 'sfx') return `
      <div class="line sfx" style="--c:${roleColor('sfx')}">
        <span class="num n">${k + 1}</span>
        <span class="body">
          <span class="cue-row"><span class="who"><span class="sw"></span>
            ${icon('zap')} effect${l.letter ? ' · ' + esc(l.letter) : ''}</span></span>
          <span class="say note">${esc(l.t)}</span>
        </span>
        <span class="side"></span>
      </div>`;

    const c = castById(l.c), mine = l.c === ME, s = st(l.id);
    if(!mine) return `
      <div class="line other" style="--c:${c.color}">
        <span class="num n">${k + 1}</span>
        <span class="body">
          <span class="cue-row"><span class="who"><span class="sw"></span>${esc(c.name)}</span>
            ${l.dir ? `<span class="dir">${esc(l.dir)}</span>` : ''}</span>
          <span class="say">${esc(l.t)}</span>
        </span>
        <span class="side">${reference
          ? `<button class="prev" data-play data-dur="5" title="reference reading">${icon('play')}</button>`
          : ''}</span>
      </div>`;

    return `
      <div class="line${focused === l.id ? ' on' : ''}" data-line="${l.id}" style="--c:${c.color}">
        <span class="num n">${k + 1}</span>
        <span class="body">
          <span class="cue-row"><span class="who"><span class="sw"></span>${esc(c.name)}</span>
            ${l.dir ? `<span class="dir">${esc(l.dir)}</span>` : ''}</span>
          <span class="say">${esc(l.t)}</span>
        </span>
        <span class="side">
          <span class="state${s.takes.length ? ' done' : ''}">${
            s.takes.length ? s.takes.length + ' take' + (s.takes.length === 1 ? '' : 's') : 'to record'}</span>
          <button class="rec" data-rec="${l.id}"><span class="bead"></span>
            <span class="lbl">rec</span></button>
        </span>
      </div>
      ${s.takes.length ? takesHtml(l.id) : ''}`;
  }).join('');
}

function takesHtml(id){
  const s = st(id);
  return `<div class="takes">${s.takes.map((t, k) => {
    const open = trimOpen === id + ':' + k;
    return `<div class="take" aria-checked="${s.chosen === k}" data-take="${id}" data-k="${k}">
      <span class="dot"></span>
      <span class="lbl">take ${k + 1}${t.from ? ' · ' + esc(t.from) : ''}</span>
      <span class="meta">${clock1(t.out - t.in)}${t.in || t.out < t.raw ? ' · trimmed' : ''}</span>
      <span class="tools">
        <button class="prev" data-playtake="${id}" data-k="${k}"
          data-dur="${(t.out - t.in).toFixed(1)}">${icon('play')}</button>
        ${btn('autotrim','wand','q keep',`data-auto="${id}" data-k="${k}"`)}
        ${btn('trim','scissors','q keep',`data-trim="${id}" data-k="${k}" aria-pressed="${open}"`)}
      </span>
      ${open ? trimHtml(id, k, t) : ''}
    </div>`;
  }).join('')}</div>`;
}

function trimHtml(id, k, t){
  const L = t.in / t.raw * 100, R = (1 - t.out / t.raw) * 100;
  return `<div class="trim">
    <div class="wave" data-wave="${id}:${k}">
      ${t.wave.map((a, n) => {
        const at = (n + .5) / t.wave.length * t.raw;
        return `<span class="bar${at >= t.in && at <= t.out ? ' in' : ''}"
          style="height:${Math.round(5 + a * 26)}px"></span>`;
      }).join('')}
      <span class="mask l" style="width:${L}%"></span>
      <span class="mask r" style="width:${R}%"></span>
      <button class="handle" data-h="in" style="left:${L}%"></button>
      <button class="handle" data-h="out" style="left:${100 - R}%"></button>
    </div>
    <div class="trimfoot">
      <span>in <b>${clock1(t.in)}</b></span><span>out <b>${clock1(t.out)}</b></span>
      <span>keeps <b>${clock1(t.out - t.in)}</b> of ${clock1(t.raw)}</span>
      <span class="sp"></span>
      ${btn('reset','x','q keep',`data-reset="${id}" data-k="${k}"`)}
    </div>
  </div>`;
}

function renderBay(){
  const box = document.getElementById('baylist');
  if(!box) return;
  box.innerHTML = BAY_V.length
    ? BAY_V.map(b => bayRow(b, bayPick)).join('')
    : `<div class="bayempty"><b>drop audio here</b>or record onto a line. anything you
        drop waits here until you put it on one.</div>`;
}

/* ---------- takes ---------- */
function makeTake(raw, seed, from){
  return {raw, wave:makeWave(seed), in:0, out:raw, from};
}
let recording = null, recStart = 0, recTimer = null;
function startRec(id){
  if(recording) stopRec();
  focused = id; recording = id; recStart = Date.now();
  const b = document.querySelector(`[data-rec="${id}"]`);
  if(!b) return;
  b.classList.add('on');
  recTimer = setInterval(() => {
    const s = (Date.now() - recStart) / 1000;
    b.querySelector('.lbl').textContent =
      `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }, 100);
}
function stopRec(){
  if(!recording) return;
  const id = recording, raw = Math.max(1.2, (Date.now() - recStart) / 1000);
  clearInterval(recTimer); recording = null;
  const s = st(id);
  s.takes.push(makeTake(raw, s.takes.length + id.length));
  s.chosen = s.takes.length - 1;
  render();
  toast(`take ${s.takes.length} · ${clock1(raw)}`);
}

let reference = false;

/* ---------- interaction ---------- */
document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  if(pick){
    ME = pick.dataset.pick;
    const first = myLines()[0];
    if(first){ page = first.p; focused = first.id; }
    render(); return;
  }
  if(e.target.closest('#who')){ ME = null; render(); return; }
  const rec = e.target.closest('[data-rec]');
  if(rec){ recording === rec.dataset.rec ? stopRec() : startRec(rec.dataset.rec); return; }
  const pt = e.target.closest('[data-playtake],[data-play],[data-playbay]');
  if(pt){ play_(pt, +(pt.dataset.dur || 5)); return; }
  const tk = e.target.closest('[data-take]');
  if(tk && !e.target.closest('[data-trim],[data-auto],[data-reset],.prev')){
    st(tk.dataset.take).chosen = +tk.dataset.k; render(); toast(`keeping take ${+tk.dataset.k + 1}`); return;
  }
  const auto = e.target.closest('[data-auto]');
  if(auto){
    const t = st(auto.dataset.auto).takes[+auto.dataset.k];
    const n = t.wave.length;
    let a = t.wave.findIndex(v => v > .18);
    let b = n - 1 - [...t.wave].reverse().findIndex(v => v > .18);
    const before = t.out - t.in;
    t.in = Math.max(0, a - 1) / n * t.raw;
    t.out = Math.min(n, b + 2) / n * t.raw;
    render();
    const cut = before - (t.out - t.in);
    toast(cut > .05 ? `trimmed ${cut.toFixed(1)}s` : 'nothing to trim');
    return;
  }
  const tr = e.target.closest('[data-trim]');
  if(tr){
    const key = tr.dataset.trim + ':' + tr.dataset.k;
    trimOpen = trimOpen === key ? null : key;
    render(); return;
  }
  const rs = e.target.closest('[data-reset]');
  if(rs){
    const t = st(rs.dataset.reset).takes[+rs.dataset.k];
    t.in = 0; t.out = t.raw; render(); return;
  }
  const row = e.target.closest('[data-bay]');
  if(row){
    bayPick = bayPick === row.dataset.bay ? null : row.dataset.bay;
    renderBay();
    toast(bayPick ? 'now click the line it belongs to' : 'nothing armed');
    return;
  }
  const pg = e.target.closest('[data-page]');
  if(pg){ goPage(+pg.dataset.page); return; }
  if(e.target.closest('#prev')){ goPage(page - 1); return; }
  if(e.target.closest('#next')){ goPage(page + 1); return; }
  if(e.target.closest('#ref')){ reference = !reference; render(); return; }
  if(e.target.closest('#add')){ document.getElementById('filein').click(); return; }
  if(e.target.closest('#publish')){ toast(`${castById(ME).name} submitted for review`); return; }
  const line = e.target.closest('[data-line]');
  if(line){
    if(bayPick){ assign(bayPick, line.dataset.line); return; }
    focused = line.dataset.line;
    document.querySelectorAll('.line').forEach(el =>
      el.classList.toggle('on', el.dataset.line === focused));
  }
});

function goPage(p){
  page = Math.min(Math.max(1, p), COMIC.pages.length);
  const here = mineOn(page).map(l => l.id);
  if(!here.includes(focused)) focused = here[0] || null;
  render();
}

function assign(bayId, lineId){
  const b = BAY_V.find(x => x.id === bayId);
  if(!b) return;
  const s = st(lineId);
  s.takes.push(makeTake(b.raw || 3.5, s.takes.length + lineId.length, b.name));
  s.chosen = s.takes.length - 1;
  bayPick = null;
  render();
  toast(`${b.name} → line`);
}

/* trim drag */
let drag = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('.handle');
  if(!h) return;
  const wave = h.closest('.wave');
  const [id, k] = wave.dataset.wave.split(':');
  drag = {wave, id, k:+k, which:h.dataset.h};
  h.setPointerCapture(e.pointerId);
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if(!drag) return;
  const t = st(drag.id).takes[drag.k];
  const r = drag.wave.getBoundingClientRect();
  const secs = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * t.raw;
  if(drag.which === 'in') t.in = Math.min(secs, t.out - .2);
  else t.out = Math.max(secs, t.in + .2);
  const L = t.in / t.raw * 100, R = (1 - t.out / t.raw) * 100;
  drag.wave.querySelector('.mask.l').style.width = L + '%';
  drag.wave.querySelector('.mask.r').style.width = R + '%';
  drag.wave.querySelector('[data-h="in"]').style.left = L + '%';
  drag.wave.querySelector('[data-h="out"]').style.left = (100 - R) + '%';
});
addEventListener('pointerup', () => { if(drag){ drag = null; render(); } });

/* keys */
addEventListener('keydown', e => {
  if(!ME || e.target.matches('input,select,textarea')) return;
  if(e.key === ' '){
    e.preventDefault();
    recording ? stopRec() : (focused && startRec(focused));
    return;
  }
  const ids = mineOn(page).map(l => l.id);
  const at = ids.indexOf(focused);
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    if(at < ids.length - 1) focused = ids[at + 1];
    else if(page < COMIC.pages.length){ page++; focused = mineOn(page).map(l => l.id)[0] || null; }
    render(); return;
  }
  if(e.key === 'ArrowUp'){
    e.preventDefault();
    if(at > 0) focused = ids[at - 1];
    else if(page > 1){ page--; const p = mineOn(page).map(l => l.id); focused = p[p.length - 1] || null; }
    render(); return;
  }
  if(e.key === '['){ goPage(page - 1); }
  if(e.key === ']'){ goPage(page + 1); }
  if(e.key === 'Enter' && focused){
    const s = st(focused);
    if(s.chosen === null) return;
    const b = document.querySelector(`[data-playtake="${focused}"][data-k="${s.chosen}"]`);
    if(b) play_(b, +b.dataset.dur);
  }
});

function bayAdd(files){
  let n = 0;
  [...files].forEach(f => {
    if(f.type && !f.type.startsWith('audio')) return;
    const b = {id:'v' + Math.random().toString(36).slice(2,6), name:f.name, dur:'· · ·', raw:null};
    BAY_V.push(b); n++;
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      if(isFinite(a.duration)){ b.raw = a.duration; b.dur = clock1(a.duration); }
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
