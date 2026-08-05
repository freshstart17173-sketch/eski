/* ============================================================
   the author studio. import the art, write the cast, transcribe.

   the transcript holds two kinds of entry now: dialogue, which a
   performer reads, and sound effects, which a composer fills. an sfx
   cue carries the lettering as drawn ("KRAK") and a description of
   what it is, and it lands in the composer's cue list the moment it
   is written.
   ============================================================ */
let page = 1;
let mode = 'script';
let focused = null;

const dots = p => linesOn(p).map(l =>
  l.kind === 'sfx' ? roleColor('sfx') : (castById(l.c) || {}).color || roleColor('voice'));

function render(){
  document.getElementById('app').innerHTML = `
    ${topBar({
      mid:`<div class="seg" id="mode">
             <button data-mode="script" aria-selected="${mode === 'script'}">
               ${icon('type')}<span>script</span></button>
             <button data-mode="cast" aria-selected="${mode === 'cast'}">
               ${icon('user')}<span>cast</span></button>
           </div>`,
      actions:`${btn('import pages','upload','q keep','id="import"')}
               ${btn('publish chapter','check','p keep','id="publish"')}`
    })}
    <div class="subbar">
      <span><b>${COMIC.pages.length}</b> pages · <b>${SCRIPT.length}</b> entries
        · <b>${SCRIPT.filter(l => l.kind === 'sfx').length}</b> sound effects</span>
      <span class="track"><i style="width:${
        new Set(SCRIPT.map(l => l.p)).size / COMIC.pages.length * 100}%"></i></span>
      ${legend(['voice','sfx'])}
    </div>

    <div class="frame nobay">
      ${pageHtml(page, `<span>${dialogueOn(page).length} lines · ${sfxOn(page).length} effects</span>`)}
      <div class="pane">
        <div class="panehead">${mode === 'script' ? icon('type') : icon('user')}
          <b>${mode === 'script' ? 'page ' + page : 'cast'}</b><span class="sp"></span>
          <span>${mode === 'script'
            ? dialogueOn(page).length + ' lines · ' + sfxOn(page).length + ' effects'
            : CAST.length + ' characters'}</span></div>
        <div class="panel" id="work">${mode === 'script' ? scriptHtml() : castHtml()}</div>
      </div>
    </div>

    ${timelineHtml(page, dots)}
    ${dropLayerHtml('pages')}`;
  scrollTimeline();
}

/* ---------- the script: two element types, one column ---------- */
function scriptHtml(){
  return linesOn(page).map((l, k) => l.kind === 'sfx' ? sfxRow(l, k) : dialogueRow(l, k)).join('')
    + `<div style="display:flex;gap:6px;padding:var(--s3)">
        ${btn('add line','plus','q keep','data-add="dialogue"')}
        ${btn('add sound effect','zap','q keep','data-add="sfx"')}
      </div>`;
}

function dialogueRow(l, k){
  const c = castById(l.c) || CAST[0];
  return `<div class="line${focused === l.id ? ' on' : ''}" data-line="${l.id}"
    style="--c:${c.color}">
    <span class="num n">${k + 1}</span>
    <span class="body">
      <span class="cue-row">
        <span class="who"><span class="sw"></span>
          <select data-char="${l.id}">${CAST.map(x =>
            `<option value="${x.id}" ${x.id === l.c ? 'selected' : ''}>${esc(x.name)}</option>`
          ).join('')}</select></span>
        <span class="dir" data-ph="direction" contenteditable="true" data-dir="${l.id}">${esc(l.dir || '')}</span>
      </span>
      <span class="say" contenteditable="true" data-say="${l.id}">${esc(l.t)}</span>
    </span>
    <span class="side">${btn('','trash','q sq','data-kill="' + l.id + '"')}</span>
  </div>`;
}

/* an effect is not a line with a note on it. it is its own thing, in the
   effects colour, carrying the lettering as it appears in the art. */
function sfxRow(l, k){
  return `<div class="line sfx${focused === l.id ? ' on' : ''}" data-line="${l.id}"
    style="--c:${roleColor('sfx')}">
    <span class="num n">${k + 1}</span>
    <span class="body">
      <span class="cue-row">
        <span class="who"><span class="sw"></span>${icon('zap')} sound effect</span>
        <span class="dir" data-ph="lettering" contenteditable="true" data-letter="${l.id}"
          >${esc(l.letter || '')}</span>
      </span>
      <span class="say note" contenteditable="true" data-say="${l.id}">${esc(l.t)}</span>
    </span>
    <span class="side">${btn('','trash','q sq','data-kill="' + l.id + '"')}</span>
  </div>`;
}

/* ---------- the cast ---------- */
function castHtml(){
  return CAST.map(c => {
    const n = forChar(c.id).length;
    const pages = [...new Set(forChar(c.id).map(l => l.p))].length;
    return `<div class="char" style="--c:${c.color}">
      <div class="charhead">
        <span class="sw"></span>
        <span class="nm" contenteditable="true" data-name="${c.id}">${esc(c.name)}</span>
        <span class="sp"></span>
        <select data-kind="${c.id}">${['lead','supporting','narration'].map(k =>
          `<option ${k === c.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <span class="meta n" style="font-size:9px">${n} lines · ${pages} pages</span>
      </div>
      <div class="frow"><span class="k">who they are</span>
        <span class="v" contenteditable="true" data-desc="${c.id}"
          data-ph="a sentence a stranger could cast from">${esc(c.desc)}</span></div>
      <div class="frow"><span class="k">voice</span>
        <span class="v" contenteditable="true" data-voice="${c.id}"
          data-ph="register, accent, pace, mannerisms">${esc(c.voice)}</span></div>
      <div class="mirrorlabel">as it appears in voiceover needed</div>
      <div class="mirror">
        <span class="plate"><img src="${esc(COMIC.art)}" alt="" style="object-position:40% 20%"></span>
        <span>
          <span class="nm" data-m-name="${c.id}">${esc(c.name)}</span>
          <span class="bl" data-m-blurb="${c.id}">${esc(c.desc)} ${esc(c.voice)}</span>
        </span>
        <span class="meta n" style="font-size:9px;text-align:right">${n} lines<br>needs a voice</span>
      </div>
    </div>`;
  }).join('') + `<div style="padding:var(--s3)">${btn('add character','plus','q keep','id="addchar"')}</div>`;
}

/* ---------- editing ---------- */
document.addEventListener('input', e => {
  const t = e.target, v = t.textContent.trim();
  const find = id => SCRIPT.find(l => l.id === id);
  if(t.dataset.say){ find(t.dataset.say).t = v; return; }
  if(t.dataset.dir){ find(t.dataset.dir).dir = v; return; }
  if(t.dataset.letter){ find(t.dataset.letter).letter = v; return; }
  if(t.dataset.name){
    castById(t.dataset.name).name = v;
    const m = document.querySelector(`[data-m-name="${t.dataset.name}"]`);
    if(m) m.textContent = v;
    return;
  }
  if(t.dataset.desc || t.dataset.voice){
    const id = t.dataset.desc || t.dataset.voice;
    const c = castById(id);
    if(t.dataset.desc) c.desc = v; else c.voice = v;
    const m = document.querySelector(`[data-m-blurb="${id}"]`);
    if(m) m.textContent = `${c.desc} ${c.voice}`;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.char){ SCRIPT.find(l => l.id === t.dataset.char).c = t.value; render(); }
  if(t.dataset.kind){ castById(t.dataset.kind).kind = t.value; }
});
document.addEventListener('click', e => {
  const m = e.target.closest('[data-mode]');
  if(m){ mode = m.dataset.mode; render(); return; }
  const pg = e.target.closest('[data-page]');
  if(pg){ page = +pg.dataset.page; render(); return; }
  if(e.target.closest('#prev')){ page = Math.max(1, page - 1); render(); return; }
  if(e.target.closest('#next')){ page = Math.min(COMIC.pages.length, page + 1); render(); return; }
  const kill = e.target.closest('[data-kill]');
  if(kill){
    SCRIPT.splice(SCRIPT.findIndex(l => l.id === kill.dataset.kill), 1);
    render(); toast('deleted'); return;
  }
  const add = e.target.closest('[data-add]');
  if(add){ addEntry(add.dataset.add); return; }
  if(e.target.closest('#addchar')){
    CAST.push({id:'c' + Math.random().toString(36).slice(2,6), name:'new character',
      kind:'supporting', desc:'', voice:'', color:CAST_COLORS[CAST.length % CAST_COLORS.length]});
    render(); return;
  }
  if(e.target.closest('#import')){ document.getElementById('filein').click(); return; }
  if(e.target.closest('#publish')){
    const thin = CAST.filter(c => !c.desc || !c.voice).length;
    toast(thin ? `published · ${thin} character${thin === 1 ? '' : 's'} still need a voice note`
               : 'published · every part is listed in voiceover needed, every effect in the cue list');
    return;
  }
  const line = e.target.closest('[data-line]');
  if(line) focused = line.dataset.line;
});

function addEntry(kind){
  const last = linesOn(page).filter(l => l.kind === 'dialogue').slice(-1)[0];
  const l = kind === 'sfx'
    ? {id:'x' + Math.random().toString(36).slice(2,6), p:page, kind:'sfx', letter:'', t:''}
    : {id:'x' + Math.random().toString(36).slice(2,6), p:page, kind:'dialogue',
       c:(last && last.c) || CAST[0].id, dir:'', t:''};
  const after = SCRIPT.filter(x => x.p <= page).slice(-1)[0];
  SCRIPT.splice(after ? SCRIPT.indexOf(after) + 1 : SCRIPT.length, 0, l);
  focused = l.id;
  render();
  const el = document.querySelector(`[data-say="${l.id}"]`);
  if(el) el.focus();
}

addEventListener('keydown', e => {
  const editing = e.target.isContentEditable || e.target.matches('input,select,textarea');
  if(e.key === 'Enter' && editing && e.target.dataset.say){
    e.preventDefault();
    addEntry(SCRIPT.find(l => l.id === e.target.dataset.say).kind);
    return;
  }
  if(editing) return;
  if(e.key === '['){ page = Math.max(1, page - 1); render(); }
  if(e.key === ']'){ page = Math.min(COMIC.pages.length, page + 1); render(); }
  if(e.key === 'i'){ document.getElementById('filein').click(); }
});

/* importing art */
function importPages(files){
  const imgs = [...files].filter(f => !f.type || f.type.startsWith('image'));
  if(!imgs.length) return;
  imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  imgs.forEach(f => COMIC.pages.push({n:COMIC.pages.length + 1, src:URL.createObjectURL(f)}));
  render();
  toast(`${imgs.length} page${imgs.length === 1 ? '' : 's'} imported`);
}
render();
document.body.insertAdjacentHTML('beforeend',
  '<input type="file" id="filein" accept="image/*" multiple hidden>');
document.getElementById('filein').addEventListener('change', e => {
  importPages(e.target.files); e.target.value = '';
});
wireDrop(importPages);
