/* viewer.js only: every page shape must sit inside the box on BOTH axes.
   the earlier check used one wide page, where max-width did the work and the
   broken max-height never showed. throwaway. */
const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); let bad=0;
  for(const vp of [{width:1440,height:900},{width:1920,height:1080},{width:1100,height:620}]){
    const p=await (await b.newContext({viewport:vp})).newPage();
    p.on('pageerror',e=>{console.log('PAGEERROR',e.message);bad++;});
    await p.goto('http://localhost:8940/tests/viewer-fit.html',{waitUntil:'load'});
    for(const shape of ['tall','wide','square','strip']){
      await p.evaluate(s=>window.v.show(window.SHAPES[s]), shape);
      await p.waitForFunction(()=>{const i=document.querySelector('.vw-img');
        return i && !i.hidden && i.naturalWidth>0 && i.getBoundingClientRect().width>1;},null,{timeout:8000});
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
    // and zoom still works
    const z=await p.evaluate(()=>{const x=document.querySelector('.vw'),r=x.getBoundingClientRect();
      x.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));
      return document.querySelector('.vw-inner').style.transform;});
    if(!/scale\(1\.18\)/.test(z)){ console.log('zoom did not apply:',z); bad++; }

    // a pan must survive a long drag: the native image drag used to hijack it
    // a few pixels in and leave a "no drop" cursor behind
    await p.evaluate(()=>{ window.v.show(window.SHAPES.tall); });
    await p.waitForFunction(()=>{const i=document.querySelector('.vw-img');
      return i && i.naturalWidth>0 && i.getBoundingClientRect().width>1;},null,{timeout:8000});
    const pan = await p.evaluate(async ()=>{
      const x=document.querySelector('.vw'), r=x.getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      x.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:cx,clientY:cy,bubbles:true,cancelable:true}));
      x.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:cx,clientY:cy,bubbles:true,cancelable:true}));
      const before=document.querySelector('.vw-inner').style.transform;
      const pd=new PointerEvent('pointerdown',{clientX:cx,clientY:cy,bubbles:true,cancelable:true,pointerId:1,isPrimary:true});
      x.dispatchEvent(pd);
      const prevented = pd.defaultPrevented;
      for(let i=1;i<=40;i++)
        x.dispatchEvent(new PointerEvent('pointermove',{clientX:cx-i*6,clientY:cy-i*3,bubbles:true,pointerId:1}));
      const after=document.querySelector('.vw-inner').style.transform;
      x.dispatchEvent(new PointerEvent('pointerup',{clientX:cx-240,clientY:cy-120,bubbles:true,pointerId:1}));
      const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(after)||[];
      return {prevented, moved:before!==after, dx:Math.round(+m[1]||0), dy:Math.round(+m[2]||0),
              dragImg: document.querySelector('.vw-img').draggable};
    });
    console.log(`${vp.width}x${vp.height} pan prevented=${pan.prevented} moved=${pan.moved} dx=${pan.dx} dy=${pan.dy} imgDraggable=${pan.dragImg}`);
    if(!pan.prevented || !pan.moved || pan.dx!==-240 || pan.dy!==-120 || pan.dragImg){ console.log('  PAN BROKEN'); bad++; }

  }
  await b.close();
  console.log(bad?('FAILURES: '+bad):'every shape fits both axes, zoom works');
  process.exit(bad?1:0);
})().catch(e=>{console.error('CRASHED',e);process.exit(1);});
