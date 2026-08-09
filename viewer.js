/* ============================================================
   the page viewer, on its own so every surface gets the reader's one
   rather than a worse copy of it.

   the gestures are Panzoom's (vendor/panzoom.js, MIT), not ours. we used
   to hand-roll wheel-toward-cursor, drag-to-pan and the clamping in three
   places — read.html, studio.html and here — and all three drifted. this
   file owns the one instance; the other two mount it or call the same
   library directly.

   what is still ours:
     - the page is sized by the BOX and contained inside it, so a spread
       wider than it is tall is never clipped. sizing the plate to the
       image instead is what cut the right edge and the foot off.
     - the zoom bar, which is NOT inside the panned element, so a drag can
       never swallow a click on "fit". that was the bug: capturing the
       pointer on the container retargeted the click away from the button,
       and every control in the bar went dead the moment you zoomed —
       which is the only time you want them.

   the style block is injected once, so this is the only file to include
   (after vendor/panzoom.js).
   ============================================================ */
(function(global){
  const CSS = `
.vw{position:relative;flex:1;min-height:0;min-width:0;overflow:hidden;
  background:var(--paper-1);touch-action:none;user-select:none}
[data-theme="dark"] .vw{background:var(--surf-2)}
/* ABSOLUTE, not a stretched grid item. max-height on the image only resolves
   against a parent whose own height is definite, and a grid/flex row that is
   sized by its content is not: the percentage silently does nothing, the page
   renders at natural size, and a tall one gets its foot cut off by the
   overflow rule. inset:0 against the positioned .vw is what makes it definite.
   it is also what lets panzoom contain the page: the element it moves is
   exactly the size of the box it moves inside. */
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
/* THE BAR IS ALWAYS THERE NOW, and that is the fix rather than a preference.
   It used to appear only above 1x, on the reasoning that its buttons were
   no-ops at rest. That was wrong twice over: FIT WIDTH is not a no-op at 1x —
   it is the thing you reach for on a tall page before you have zoomed at all —
   and hiding the only way back to fit is what let somebody zoom into a corner
   and find no control anywhere on screen. A control that appears only after
   you are lost is not a control. */
.vw-zoom{position:absolute;right:var(--s3);bottom:var(--s3);display:flex;align-items:center;
  gap:0;border:1px solid var(--rule,var(--line));background:var(--paper);z-index:3;
  opacity:.55;transition:opacity var(--t-fast,140ms) var(--ease,ease)}
.vw:hover .vw-zoom, .vw-zoom:focus-within, .vw-zoom.on{opacity:1}
.vw-zoom button{width:26px;height:24px;border:0;border-left:1px solid var(--rule-hair,var(--line));
  background:none;color:var(--ink);font:inherit;font-size:12px;cursor:pointer;padding:0}
.vw-zoom button[data-z="fit"]{width:auto;padding:0 var(--s2);font-size:10px;
  letter-spacing:.12em;text-transform:uppercase}
.vw-zoom button:first-child{border-left:0}
.vw-zoom button:hover{background:var(--rule,var(--ink));color:var(--paper)}
.vw-zoom span{padding:0 var(--s2);font-size:10px;letter-spacing:.06em;color:var(--label);
  font-variant-numeric:tabular-nums;min-width:38px;text-align:center}
`;
  let injected = false;
  function injectCss(){
    if(injected) return;
    injected = true;
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* the options every eski viewer shares. exported so read.html and the
     composer get the same feel without restating it. */
  const PZ = {
    maxScale: 8,
    minScale: 1,
    contain: 'outside',      /* the page can never be panned out of its box */
    panOnlyWhenZoomed: true, /* at 1x a drag is not a pan, so click zones live */
    cursor: 'grab',
    /* step is the exponent panzoom raises e to, so a button click is
       e^0.22 = 1.25x. the wheel divides it by three, which would make a
       notch 1.08x, so the wheel passes its own: e^(0.5/3) = 1.18x. both
       numbers are the ones the hand-rolled version used. */
    step: 0.22,
    animate: false
  };
  const WHEEL_STEP = 0.5;

  /* THE TWO THINGS THAT WERE WRONG, IN ONE PLACE.

     The reader cannot mount mountViewer(): its #pages holds TWO images, for
     two-page spreads, and this mount is built around one. Forcing spreads
     through a single-image mount to share the code would be the tail wagging
     the dog.

     But the code worth sharing is not the mount — it is the arithmetic, and
     that is exactly what had drifted across three copies. So the arithmetic
     lives here and both callers use it. A viewer that grows a fourth copy of
     `zoomIn()` is the bug coming back.

     pz     the Panzoom instance
     root   the element that defines the visible box
     inner  the element panzoom moves (its padding is read for fit-width)
     probe  the element to measure for fit-width — the page itself */
  function makeControls(pz, root, inner, probe){
    const clampScale = s => Math.min(PZ.maxScale, Math.max(PZ.minScale, s));

    /* Buttons anchor on the CENTRE OF THE BOX. panzoom's own zoomIn/zoomOut
       scale about the element's transform-origin, which stops being the middle
       of what you are looking at the moment you pan — so + and - walked the
       page sideways by an amount that depended on how far you had dragged. It
       felt anchored on nothing because it was anchored on something invisible.
       The wheel still follows the cursor; that part was always right. */
    function zoomBy(mult){
      const r = root.getBoundingClientRect();
      pz.zoomToPoint(clampScale(pz.getScale() * mult),
        { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 },
        { animate: false });
    }

    /* FIT WIDTH. At scale 1 an `object-fit: contain` page leaves bars down
       both sides, and on a tall page that is unreadably small.

       THE PADDING IS READ, NOT INFERRED. The first cut worked it out as
       inner's width minus the page's, which is not padding — it is the
       letterboxing contain leaves. On a 400x1200 page in a 900px box that came
       to 711px, so the target computed as exactly 1 and the button did
       nothing. It looked unimplemented; it was implemented and always
       answering "already there". */
    function fitWidth(){
      const box = root.getBoundingClientRect();
      const cur = pz.getScale() || 1;
      const drawn = probe.getBoundingClientRect().width / cur;
      if(!drawn || !box.width) return 1;
      const cs = getComputedStyle(inner);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const target = clampScale((box.width - pad) / drawn);
      /* RESET WITH THE CONSTRAINT OFF, then put it back — the same reason
         reset() does: contain works its minimum out from a measurement taken
         before the scale it is about to divide by was written. */
      pz.setOptions({ contain: undefined });
      pz.reset({ animate: false });
      pz.zoom(target, { animate: false });
      pz.setOptions({ contain: PZ.contain });
      return target;
    }

    return { zoomBy, fitWidth, clampScale };
  }

  /* mountViewer(el) -> { show(url), reset(), zoom(), pz }
     el is filled in; anything already inside it is replaced. */
  function mountViewer(root, opts){
    injectCss();
    opts = opts || {};
    root.classList.add('vw');
    root.innerHTML =
      `<div class="vw-inner"><img class="vw-img" alt="" draggable="false" hidden></div>
       <div class="vw-empty">${opts.empty || 'no page'}</div>
       <div class="vw-zoom">
         <button data-z="out" title="zoom out" type="button">&minus;</button>
         <span>100%</span>
         <button data-z="in" title="zoom in" type="button">+</button>
         <button data-z="fit" title="fit the whole page" type="button">fit</button>
         <button data-z="width" title="fit the width" type="button">width</button>
       </div>`;
    const inner = root.querySelector('.vw-inner');
    const img   = root.querySelector('.vw-img');
    const empty = root.querySelector('.vw-empty');
    const zbar  = root.querySelector('.vw-zoom');
    const label = zbar.querySelector('span');

    const pz = global.Panzoom(inner, PZ);

    function paint(scale){
      const z = scale == null ? pz.getScale() : scale;
      label.textContent = Math.round(z * 100) + '%';
      zbar.classList.toggle('on', !img.hidden && z > 1.001);
      root.classList.toggle('zoomed', z > 1.001);
    }
    inner.addEventListener('panzoomchange', e => paint(e.detail.scale));

    root.addEventListener('wheel', e => {
      if(img.hidden) return;
      pz.zoomWithWheel(e, { step: WHEEL_STEP });   // anchors on the cursor
      paint();
    }, { passive: false });
    root.addEventListener('dblclick', e => {
      if(img.hidden || e.target.closest('.vw-zoom')) return;
      if(pz.getScale() > 1.001) reset();
      else { pz.zoomToPoint(2.2, e); paint(); }
    });

    const ctl = makeControls(pz, root, inner, img);
    const zoomBy = ctl.zoomBy, fitWidth = () => { ctl.fitWidth(); paint(); };

    /* the bar is a sibling of the panned element, so nothing it does can be
       eaten by a pan in progress. */
    zbar.addEventListener('click', e => {
      const b = e.target.closest('[data-z]');
      if(!b) return;
      const z = b.dataset.z;
      if(z === 'in')         zoomBy(1.25);
      else if(z === 'out')   zoomBy(1 / 1.25);
      else if(z === 'width') fitWidth();
      else                   reset();
    });

    /* Two things this has to get right.

       One: panzoom's own change event lands on the next frame, so the bar
       would still be up for a frame after fit. Paint here as well as there.

       Two: contain:'outside' works out its minimum scale by measuring the
       element and dividing by the current scale — but the scale variable is
       updated synchronously while the transform is written on the NEXT
       frame. So a reset taken within a frame of a zoom divides a stale
       measurement by a fresh number, computes a minimum above 1, and clamps
       the reset back to roughly the scale it was asked to undo.
       Intermittently, depending purely on whether a frame landed in between.
       Fitting is the one case where the constraint has nothing to say — scale
       1 with no pan IS the container — so it is turned off for the call. */
    function reset(){
      pz.setOptions({ contain: undefined });
      pz.reset({ animate: false });
      pz.setOptions({ contain: PZ.contain });
      paint(1);
    }

    paint(1);
    return {
      /* a new page always starts fit, because staying zoomed into the corner
         of the page you just left is never what you meant. */
      show(url){
        const has = !!url;
        img.hidden = !has;
        empty.hidden = has;
        if(has && img.getAttribute('src') !== url) img.src = url;
        reset();
      },
      reset,
      fitWidth,
      zoom: () => pz.getScale(),
      pz
    };
  }

  global.mountViewer = mountViewer;
  global.mountViewer.options = PZ;
  global.mountViewer.wheelStep = WHEEL_STEP;
  /* read.html mounts its own Panzoom (two images, for spreads) and calls
     these, so the arithmetic exists once. */
  global.mountViewer.controls = makeControls;
})(window);
