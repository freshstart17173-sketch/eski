/* viewer.js on its own.

   1. every page shape must sit inside the box on BOTH axes. an earlier check
      used one wide page, where max-width did the work and the broken
      max-height never showed.
   2. the wheel still zooms, and by the same amount it always did.
   3. a pan moves and stays contained.
   4. the zoom bar works WHILE ZOOMED. this is the bug the bar had for its
      whole life: the container captured the pointer on pointerdown, which
      retargeted the click away from the button, so "fit" — the one control
      you only ever press when zoomed — did nothing at all.
   5. there is no hint strip. */
const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); let bad=0;
  const fail=(...m)=>{ console.log('  FAIL', ...m); bad++; };
  for(const vp of [{width:1440,height:900},{width:1920,height:1080},{width:1100,height:620}]){
    const p=await (await b.newContext({viewport:vp})).newPage();
    p.on('pageerror',e=>{console.log('PAGEERROR',e.message);bad++;});
    await p.goto('http://localhost:8940/tests/viewer-fit.html',{waitUntil:'load'});
    const show = async shape => {
      await p.evaluate(s=>window.v.show(window.SHAPES[s]), shape);
      await p.waitForFunction(()=>{const i=document.querySelector('.vw-img');
        return i && !i.hidden && i.naturalWidth>0 && i.getBoundingClientRect().width>1;},null,{timeout:8000});
    };
    for(const shape of ['tall','wide','square','strip']){
      await show(shape);
      const r=await p.evaluate(()=>{
        const i=document.querySelector('.vw-img'),x=document.querySelector('.vw');
        const a=i.getBoundingClientRect(),c=x.getBoundingClientRect();
        return {ok:a.left>=c.left-1&&a.right<=c.right+1&&a.top>=c.top-1&&a.bottom<=c.bottom+1,
                img:Math.round(a.width)+'x'+Math.round(a.height),
                box:Math.round(c.width)+'x'+Math.round(c.height)};
      });
      if(!r.ok) bad++;
      console.log(`${vp.width}x${vp.height} ${shape.padEnd(6)} fits=${r.ok} img=${r.img} box=${r.box}`);
    }

    // no hint strip, and no zoom bar until there is something to zoom out of
    const chrome = await p.evaluate(()=>({
      hint: !!document.querySelector('.vw-hint'),
      barShown: document.querySelector('.vw-zoom').classList.contains('on')
    }));
    if(chrome.hint) fail('the hint strip is back');
    if(chrome.barShown) fail('the zoom bar shows at 1x');

    // the wheel zooms toward the cursor, e^(0.5/3) = 1.1814 per notch
    const z=await p.evaluate(()=>{const x=document.querySelector('.vw'),r=x.getBoundingClientRect();
      x.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));
      return window.v.zoom();});
    if(Math.abs(z-1.1814)>0.002) fail('wheel zoom is', z, 'not 1.1814');

    // now the bar is up, and every control on it responds. the pointer is a
    // real one, so a broken exclusion would swallow these clicks.
    await p.waitForSelector('.vw-zoom.on');
    await p.click('.vw-zoom [data-z="in"]');
    const zin = await p.evaluate(()=>window.v.zoom());
    if(!(zin > z + 0.1)) fail('zoom in did nothing while zoomed:', z, '->', zin);

    await p.click('.vw-zoom [data-z="fit"]');
    const zfit = await p.evaluate(()=>window.v.zoom());
    // contain:'outside' derives its floor from measured dimensions, so "fit"
    // is 1 to within a rounding error rather than the integer 1
    if(Math.abs(zfit-1) > 1e-4) fail('fit did not fit while zoomed, scale is', zfit);
    if(await p.evaluate(()=>document.querySelector('.vw-zoom').classList.contains('on')))
      fail('the zoom bar stayed up after fit');

    // a pan must survive a long drag: the native image drag used to hijack it
    // a few pixels in and leave a "no drop" cursor behind
    await show('tall');
    const pan = await p.evaluate(async ()=>{
      const x=document.querySelector('.vw'), inner=document.querySelector('.vw-inner');
      const r=x.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
      window.v.pz.zoom(2.5, {animate:false});
      const before=window.v.pz.getPan();
      inner.dispatchEvent(new PointerEvent('pointerdown',
        {clientX:cx,clientY:cy,bubbles:true,cancelable:true,pointerId:1,isPrimary:true,button:0}));
      for(let i=1;i<=40;i++)
        document.dispatchEvent(new PointerEvent('pointermove',
          {clientX:cx-i*6,clientY:cy-i*3,bubbles:true,pointerId:1}));
      const after=window.v.pz.getPan();
      document.dispatchEvent(new PointerEvent('pointerup',{clientX:cx-240,clientY:cy-120,bubbles:true,pointerId:1}));
      const a=inner.getBoundingClientRect();
      return {moved: before.x!==after.x || before.y!==after.y,
              covers: a.left<=r.left+1 && a.right>=r.right-1 && a.top<=r.top+1 && a.bottom>=r.bottom-1,
              pan: after, dragImg: document.querySelector('.vw-img').draggable};
    });
    console.log(`${vp.width}x${vp.height} pan moved=${pan.moved} contained=${pan.covers} ` +
      `x=${Math.round(pan.pan.x)} y=${Math.round(pan.pan.y)} imgDraggable=${pan.dragImg}`);
    if(!pan.moved) fail('the drag did not pan');
    if(!pan.covers) fail('the pan left a gap at the edge of the box');
    if(pan.dragImg) fail('the page image is still natively draggable');
  }
  await b.close();
  console.log(bad?('FAILURES: '+bad):'every shape fits, wheel zooms, pan contains, the zoom bar works');
  process.exit(bad?1:0);
})().catch(e=>{console.error('CRASHED',e);process.exit(1);});
