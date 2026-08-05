/* ============================================================
   the parts every studio shares: the bar, the page pane, the
   filmstrip, the bay, the legend, the drop layer, the style picker.
   what differs between skins is declared once, here, by STYLE.
   ============================================================ */

/* skin 1 keeps the ruler numeric and the frame static. skins 2 and 3 add
   thumbnails, a playhead and a filmstrip; skin 3 adds the transport foot. */
const HAS = {
  thumbs: STYLE !== '1',
  playhead: STYLE !== '1',
  strip: STYLE !== '1',
  foot: STYLE === '3',
  labels: STYLE !== '3'      /* icon + word, except in the console */
};

const btn = (label, ico, cls = '', attrs = '') =>
  `<button class="btn ${cls}" ${attrs}>${ico ? icon(ico) : ''}${
    label && (HAS.labels || cls.includes('keep')) ? `<span>${label}</span>` : ''}</button>`;

function topBar(opts){
  return `<header class="bar">
    <a class="mark" href="../home.html" title="back to eski">eski<i>!</i></a>
    <div class="what">
      <span class="ttl">${esc(COMIC.title)}</span>
      <span class="sub">${esc(opts.sub || COMIC.chapter)}</span>
    </div>
    <span class="sp"></span>
    ${opts.mid || ''}
    ${opts.actions || ''}
  </header>`;
}

function legend(kinds){
  return `<div class="legend">${kinds.map(k =>
    `<span style="--c:${roleColor(k)}"><span class="sw"></span>${ROLE[k].label}</span>`).join('')}</div>`;
}

function stageHtml(page){
  return `<div class="stage">
    <div class="plate"><img src="${esc(COMIC.pages[page - 1].src)}" alt="page ${page}"></div>
  </div>`;
}

/* the filmstrip. dots under a page say what is on it without opening it:
   one per line of dialogue, one per sound effect, in their role colours. */
function stripHtml(current, dotsFor){
  if(!HAS.strip) return '';
  return `<div class="strip" id="strip">${COMIC.pages.map(p => `
    <button class="pg" data-page="${p.n}" aria-current="${p.n === current}">
      <span class="plate"><img src="${esc(p.src)}" alt=""></span>
      <span class="cap"><span class="n">${p.n}</span>
        <span class="dots">${(dotsFor ? dotsFor(p.n) : []).map(c =>
          `<span class="d" style="background:${c}"></span>`).join('')}</span></span>
    </button>`).join('')}</div>`;
}

function bayRow(b, armed){
  return `<div class="cliprow" draggable="true" data-bay="${b.id}"
    aria-grabbed="${armed === b.id}">
    <button class="prev" data-playbay="${b.id}" data-dur="6" title="play">${icon('play')}</button>
    <span class="nm">${esc(b.name)}</span>
    <span class="meta n">${esc(b.dur)}</span>
  </div>`;
}

function dropLayerHtml(what){
  return `<div class="droplayer" id="droplayer"><div>
    <b>drop ${what} here</b><span>${
      what === 'pages' ? 'they import in filename order' : 'it lands in the bay'}</span>
  </div></div>`;
}

/* mockup furniture: jump between the three skins of the studio you are in */
function compareStrip(studio){
  const name = {author:'author', score:'composer', voice:'voiceover'}[studio];
  return `<div class="compare">
    <a href="index.html">all nine</a>
    ${['1','2','3'].map(s => `<a href="${studio}-${s}.html"
      ${s === STYLE ? 'aria-current="page"' : ''}>${name} ${s}</a>`).join('')}
  </div>`;
}

/* files dropped anywhere on the window land in one place */
function wireDrop(onFiles){
  let depth = 0;
  const layer = () => document.getElementById('droplayer');
  addEventListener('dragenter', e => {
    if(![...(e.dataTransfer.types || [])].includes('Files')) return;
    depth++; layer().classList.add('on');
  });
  addEventListener('dragover', e => {
    if([...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault();
  });
  addEventListener('dragleave', () => { if(--depth <= 0){ depth = 0; layer().classList.remove('on'); } });
  addEventListener('drop', e => {
    if(![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault(); depth = 0; layer().classList.remove('on');
    onFiles(e.dataTransfer.files);
  });
}

/* one waveform generator, used by every take and every trim editor */
function makeWave(seed, n = 44){
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({length:n}, (_, k) => {
    const x = k / (n - 1);
    const gate = x < .12 || x > .88 ? .06 : 1;
    return Math.min(1, (.35 + rnd() * .65) * gate * (.6 + .4 * Math.sin(x * 9)));
  });
}
