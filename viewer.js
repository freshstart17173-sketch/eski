/* ============================================================
   the page viewer, on its own so every studio gets the reader's one
   rather than a worse copy of it.

   wheel zooms toward the cursor (1x to 5x), drag pans once you are past
   1x, double click toggles, and turning the page resets. this is the
   read.html implementation, moved here.

   it also fixes the thing the studio mockups got wrong: the page is sized
   by the BOX and contained inside it, so a spread that is wider than it is
   tall is never clipped. sizing the plate to the image instead is what cut
   the right edge and the foot off.

   the style block is injected once, so this is the only file to include.
   ============================================================ */
(function(global){
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const CSS = `
.vw{position:relative;flex:1;min-height:0;min-width:0;overflow:hidden;
  background:var(--paper-1);touch-action:none;user-select:none}
[data-theme="dark"] .vw{background:var(--surf-2)}
/* ABSOLUTE, not a stretched grid item. max-height on the image only resolves
   against a parent whose own height is definite, and a grid/flex row that is
   sized by its content is not: the percentage silently does nothing, the page
   renders at natural size, and a tall one gets its foot cut off by the
   overflow rule. inset:0 against the positioned .vw is what makes it definite. */
.vw-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  padding:var(--s4);box-sizing:border-box;transform-origin:center center;will-change:transform}
/* -webkit-user-drag is what stops a pan turning into the browser's own image
   drag a few pixels in, which is what put the "no drop" slashed circle under
   the cursor and killed the pointer stream mid-gesture. */
.vw-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;
  display:block;background:var(--paper);-webkit-user-drag:none;user-drag:none;
  -webkit-touch-callout:none}
.vw-img[hidden]{display:none}
/* .vw is no longer a centring grid, so the empty state places itself */
.vw-empty{position:absolute;inset:0;display:grid;place-items:center;padding:var(--s4);
  color:var(--label);font-size:var(--fs-xs);letter-spacing:.06em;text-align:center}
.vw-empty[hidden]{display:none}
.vw-zoom{position:absolute;right:var(--s3);bottom:var(--s3);display:flex;align-items:center;
  gap:0;border:1px solid var(--rule,var(--line));background:var(--paper);z-index:3}
.vw-zoom button{width:26px;height:24px;border:0;border-left:1px solid var(--rule-hair,var(--line));
  background:none;color:var(--ink);font:inherit;font-size:12px;cursor:pointer;padding:0}
.vw-zoom button:first-child{border-left:0}
.vw-zoom button:hover{background:var(--rule,var(--ink));color:var(--paper)}
.vw-zoom span{padding:0 var(--s2);font-size:10px;letter-spacing:.06em;color:var(--label);
  font-variant-numeric:tabular-nums;min-width:38px;text-align:center}
.vw-hint{position:absolute;left:var(--s3);bottom:var(--s3);font-size:10px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--label);z-index:3;pointer-events:none}
`;
  let injected = false;
  function injectCss(){
    if(injected) return;
    injected = true;
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* mountViewer(el) -> { show(url), reset(), zoom() }
     el is filled in; anything already inside it is replaced. */
  function mountViewer(root, opts){
    injectCss();
    opts = opts || {};
    root.classList.add('vw');
    root.innerHTML =
      `<div class="vw-inner"><img class="vw-img" alt="" draggable="false" hidden></div>
       <div class="vw-empty">${opts.empty || 'no page'}</div>
       <div class="vw-hint">scroll to zoom · drag to pan · double click to reset</div>
       <div class="vw-zoom" hidden>
         <button data-z="out" title="zoom out" type="button">&minus;</button>
         <span>100%</span>
         <button data-z="in" title="zoom in" type="button">+</button>
         <button data-z="fit" title="fit the page" type="button">fit</button>
       </div>`;
    const inner = root.querySelector('.vw-inner');
    const img   = root.querySelector('.vw-img');
    const empty = root.querySelector('.vw-empty');
    const zbar  = root.querySelector('.vw-zoom');
    const label = zbar.querySelector('span');

    let zoom = 1, panX = 0, panY = 0;
    function apply(){
      inner.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
      inner.style.cursor = zoom > 1 ? 'grab' : '';
      root.classList.toggle('zoomed', zoom > 1);
      label.textContent = Math.round(zoom * 100) + '%';
    }
    function reset(){ zoom = 1; panX = panY = 0; apply(); }
    function zoomAt(factor, cx, cy){
      const r = root.getBoundingClientRect();
      const nz = clamp(zoom * factor, 1, 5);
      if(nz === zoom) return;
      // keep the point under the cursor still: offset from the box centre
      const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
      const k = nz / zoom;
      panX = (panX - ox) * k + ox;
      panY = (panY - oy) * k + oy;
      zoom = nz;
      if(zoom === 1){ panX = panY = 0; }
      apply();
    }

    root.addEventListener('wheel', e => {
      if(img.hidden) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY);
    }, { passive: false });
    root.addEventListener('dblclick', e => {
      if(img.hidden) return;
      if(zoom > 1) reset(); else zoomAt(2.2, e.clientX, e.clientY);
    });
    // belt and braces: even with user-drag off, a stray dragstart would end
    // the gesture, so refuse it outright
    root.addEventListener('dragstart', e => e.preventDefault());
    let drag = null;
    root.addEventListener('pointerdown', e => {
      if(zoom <= 1 || img.hidden) return;
      // stops the native image drag before it starts, which is what used to
      // interrupt a pan a few pixels in
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
      root.setPointerCapture(e.pointerId);
      inner.style.cursor = 'grabbing';
    });
    root.addEventListener('pointermove', e => {
      if(!drag) return;
      panX = drag.px + (e.clientX - drag.x);
      panY = drag.py + (e.clientY - drag.y);
      apply();
    });
    const end = () => { if(drag){ drag = null; inner.style.cursor = zoom > 1 ? 'grab' : ''; } };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    zbar.addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if(!b) return;
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if(b.dataset.z === 'in') zoomAt(1.25, cx, cy);
      else if(b.dataset.z === 'out') zoomAt(1 / 1.25, cx, cy);
      else reset();
    });

    apply();
    return {
      /* a new page always starts fit, because staying zoomed into the corner
         of the page you just left is never what you meant. */
      show(url){
        const has = !!url;
        img.hidden = !has;
        empty.hidden = has;
        zbar.hidden = !has;
        if(has && img.getAttribute('src') !== url) img.src = url;
        reset();
      },
      reset,
      zoom: () => zoom
    };
  }

  global.mountViewer = mountViewer;
})(window);
