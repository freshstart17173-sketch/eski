/* ============================================================
   the composer studio.

   the model underneath still has kinds — a bed, a score, an effect, a
   voice — because the reader and the manifest need them. the composer
   does not, and is never shown them. to a composer it is all audio:
   drop a file, say where it starts, say where it stops, make it as
   short or as long as you like. the colour on a row is theirs to
   assign, not a category they have to learn.

   the page is the subject. the panel answers the only question there
   is at any moment: what is playing here, and does it start or stop
   on this page.
   ============================================================ */
const PAGES = COMIC.pageCount;
let page = 1;
let selected = null;
let bayPick = null;

/* one flat list of audio, built from the layered model at load. the layer a
   clip belongs to is still tracked so an export can write the manifest, but
   it never surfaces. */
const AUDIO = LAYERS.flatMap(l => l.clips.map(c => ({
  id:c.id, name:c.name, from:c.from, to:c.to, gain:c.gain, loop:c.loop, dur:c.dur,
  cue:c.cue, layer:l.id, kind:l.kind, locked:!!l.locked,
  color:c.color || roleColor(l.kind)
})));
const find = id => AUDIO.find(a => a.id === id);
const onPage = p => AUDIO.filter(a => p >= a.from && p <= a.to);
const covered = () => COMIC.pages.filter(p =>
  AUDIO.some(a => !a.locked && p.n >= a.from && p.n <= a.to)).length;
const cuesOn = p => openCues().filter(q => q.p === p)
  .filter(q => !AUDIO.some(a => a.cue === q.id));
const dots = p => onPage(p).map(a => a.color);

function render(){
  const here = onPage(page);
  document.getElementById('app').innerHTML = `
    ${topBar({
      sub:`${PAGES} pages · scoring`,
      actions:`${btn('add files','','q','id="add"')}
               ${btn('publish score','','p','id="publish"')}`
    })}
    <div class="subbar">
      <span><b>${covered()}</b> of <b>${PAGES}</b> pages have sound</span>
      <span class="track"><i style="width:${covered() / PAGES * 100}%"></i></span>
      <span><b>${AUDIO.filter(a => !a.locked).length}</b> pieces of audio</span>
    </div>

    <div class="frame">
      <div class="pane bay">
        <div class="panehead"><b>sound bay</b><span class="sp"></span>
          <span>${BAY.length} files</span></div>
        <div class="baylist" id="baylist"></div>
      </div>

      ${pageHtml(page)}

      <div class="pane">
        <div class="panehead"><b>on page ${page}</b><span class="sp"></span>
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
      : `<div class="section">Nothing plays on this page. Pick a file in the bay
          and start it here.</div>`)

    + `<div class="sectionhead"><b>start something here</b><span class="sp"></span>
        <span>${bayPick ? esc(BAY.find(b => b.id === bayPick).name) : 'pick a file first'}</span></div>`
    + `<div class="section row">
        ${btn('start on page ' + page, '', 'p', 'id="start"' + (bayPick ? '' : ' disabled'))}
        ${btn('just this page', '', 'q', 'id="start1"' + (bayPick ? '' : ' disabled'))}
      </div>`

    + (cues.length ? `<div class="sectionhead"><b>the author asked for</b>
        <span class="sp"></span><span>on this page</span></div>`
      + cues.map(q => `<div class="cue" style="--c:${roleColor('sfx')}">
          <span class="letter">${esc(q.letter || '—')}</span>
          <span>${esc(q.t)}</span>
          ${btn('fill', '', 'q', `data-fill="${q.id}"${bayPick ? '' : ' disabled'}`)}
        </div>`).join('') : '')

    + `<div class="sectionhead"><b>the chapter</b></div>`
    + `<div class="section">${openCues().length} thing${openCues().length === 1 ? '' : 's'}
        the author asked for still unfilled · <b class="hot">${PAGES - covered()}</b>
        page${PAGES - covered() === 1 ? '' : 's'} with nothing under them</div>`;
}

function itemHtml(a){
  const sel = selected === a.id, span = a.to - a.from + 1;
  return `<div class="item${sel ? ' sel' : ''}${a.locked ? ' locked' : ''}"
    data-clip="${a.id}" style="--c:${a.color}">
    <span class="nm"><b>${esc(a.name)}</b>
      <span class="sub">${span > 1 ? `pages ${a.from}–${a.to}` : `page ${a.from}`}${
        a.loop ? ' · loops' : ''}${a.locked ? ' · from a performer' : ''}</span></span>
    <span class="tools">
      <button class="prev" data-playclip="${a.id}" data-dur="8">${icon('play')}</button>
      ${a.locked ? '' : btn(sel ? 'close' : 'edit', '', 'q', `data-open="${a.id}"`)}
    </span>
    ${sel && !a.locked ? `
      <div class="itembody">
        <div class="spanbar"><span>from <b>${a.from}</b></span>
          <span class="len"><i style="left:${(a.from - 1) / PAGES * 100}%;
            width:${span / PAGES * 100}%"></i></span>
          <span>to <b>${a.to}</b></span></div>
        <div class="row">
          ${btn('starts here', '', 'q', `data-from-here="${a.id}"`)}
          ${btn('ends here', '', 'q', `data-to-here="${a.id}"`)}
          ${btn('loop', '', 'q', `data-loop="${a.id}" aria-pressed="${a.loop}"`)}
          ${btn('remove', '', 'q', `data-del="${a.id}"`)}
        </div>
        <label class="field"><span class="k">gain ${a.gain > 0 ? '+' : ''}${a.gain} db</span>
          <input type="range" min="-24" max="12" value="${a.gain}" data-gain="${a.id}"></label>
        <div class="swatches">${SWATCHES.map(c =>
          `<button class="sw" data-color="${a.id}" data-c="${c}" style="background:${c}"
            aria-pressed="${c.toLowerCase() === a.color.toLowerCase()}"
            title="colour this row"></button>`).join('')}</div>
      </div>` : ''}
  </div>`;
}

function renderBay(){
  document.getElementById('baylist').innerHTML = BAY.length
    ? BAY.map(b => bayRow(b, bayPick)).join('')
    : `<div class="bayempty"><b>drop sound here</b>anything: music, ambience, a door</div>`;
}

/* ---------- placing ---------- */
function startHere(len, cue){
  const b = BAY.find(x => x.id === bayPick);
  if(!b) return;
  const a = {id:'c' + Math.random().toString(36).slice(2,6),
    name:b.name.replace(/\.[a-z0-9]+$/i, ''), from:page,
    to:Math.min(PAGES, page + len), gain:0, loop:len > 0, dur:b.dur, cue,
    layer:'L2', kind:cue ? 'sfx' : 'score', locked:false,
    color:cue ? roleColor('sfx') : SWATCHES[AUDIO.length % SWATCHES.length]};
  AUDIO.push(a);
  bayPick = null;
  selected = a.id;
  render();
  toast(len ? `${a.name} · pages ${a.from}–${a.to}` : `${a.name} · page ${a.from}`);
}

document.addEventListener('click', e => {
  const t = e.target;
  const pl = t.closest('[data-playbay],[data-playclip]');
  if(pl){ play_(pl, +(pl.dataset.dur || 6)); return; }

  const row = t.closest('[data-bay]');
  if(row){
    bayPick = bayPick === row.dataset.bay ? null : row.dataset.bay;
    render();
    toast(bayPick ? 'now say where it starts' : 'nothing picked');
    return;
  }
  if(t.closest('#start')){ startHere(5); return; }
  if(t.closest('#start1')){ startHere(0); return; }
  const fill = t.closest('[data-fill]');
  if(fill){ startHere(0, fill.dataset.fill); return; }

  const open = t.closest('[data-open]');
  if(open){
    selected = selected === open.dataset.open ? null : open.dataset.open;
    paintPanel(); return;
  }
  const fh = t.closest('[data-from-here]');
  if(fh){
    const a = find(fh.dataset.fromHere);
    a.from = Math.min(page, a.to);
    render(); toast(`starts on page ${a.from}`); return;
  }
  const th = t.closest('[data-to-here]');
  if(th){
    const a = find(th.dataset.toHere);
    a.to = Math.max(page, a.from);
    render(); toast(`ends on page ${a.to}`); return;
  }
  const lp = t.closest('[data-loop]');
  if(lp){ const a = find(lp.dataset.loop); a.loop = !a.loop; paintPanel(); return; }
  const col = t.closest('[data-color]');
  if(col){ find(col.dataset.color).color = col.dataset.c; render(); return; }
  const del = t.closest('[data-del]');
  if(del){
    const a = find(del.dataset.del);
    AUDIO.splice(AUDIO.indexOf(a), 1);
    selected = null; render(); toast(`${a.name} removed`); return;
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
  find(g.dataset.gain).gain = +g.value;
  paintPanel();
});

/* dragging a bay row onto the page starts it here */
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
  startHere(5);
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
  if(n) toast(`${n} file${n === 1 ? '' : 's'} in the bay · pick one and say where it starts`);
}

render();
document.body.insertAdjacentHTML('beforeend',
  '<input type="file" id="filein" accept="audio/*" multiple hidden>');
document.getElementById('filein').addEventListener('change', e => {
  bayAdd(e.target.files); e.target.value = '';
});
wireDrop(bayAdd);
