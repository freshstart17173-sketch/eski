/* ============================================================
   the parts every studio shares: the bar, the page in the middle,
   the timeline along the foot, the bay, the legend, the drop layer.

   the frame is the same in all three tools —
     bay (when there are files) · page · panel
   with a row of pages under it. only the panel differs by studio.
   ============================================================ */

const btn = (label, ico, cls = '', attrs = '') =>
  `<button class="btn ${cls}" ${attrs}>${ico ? icon(ico) : ''}${
    label ? `<span>${label}</span>` : ''}</button>`;

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

/* the page, centred, at the size you would actually look at it.

   no bar under it. every word it carried was already on screen twice —
   the page number and its count are the strip at the foot, and the
   "n playing here" was the panel head one column over. the strip is
   also how you move between pages, so the arrows were a third way to
   do what clicking a thumbnail does. */
function pageHtml(page){
  return `<div class="pane centre">
    <div class="stage">
      <div class="plate"><img src="${esc(COMIC.pages[page - 1].src)}" alt="page ${page}"></div>
    </div>
  </div>`;
}

/* the timeline. a row of pages, nothing under it, and the page you are on
   takes a border. the dots under a thumbnail say what is on that page
   without opening it — one per thing, in its own colour. */
function timelineHtml(current, dotsFor){
  return `<div class="timeline" id="timeline">${COMIC.pages.map(p => `
    <button class="tl-pg" data-page="${p.n}" aria-current="${p.n === current}">
      <span class="plate"><img src="${esc(p.src)}" alt=""></span>
      <span class="cap"><span class="n">${p.n}</span>
        <span class="dots">${(dotsFor ? dotsFor(p.n) : []).slice(0, 6).map(c =>
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
    <b>drop ${what} here</b>${
      what === 'pages' ? '<span>they import in filename order</span>' : ''}
  </div></div>`;
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

/* keep the page you are on in view in the timeline */
function scrollTimeline(){
  const el = document.querySelector('.tl-pg[aria-current="true"]');
  if(el) el.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
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
