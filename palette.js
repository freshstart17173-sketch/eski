/* THE THEME, APPLIED BEFORE ANYTHING PAINTS.

   A classic script in <head>, deliberately not a module: a module is
   deferred, so the page would paint in the default theme and then repaint
   in yours. That flash is why this is its own file and loads where it does.

   ONE PLACE OWNS THE CHOICE. The system this replaced had seven other
   surfaces calling set() on load from their own local "dark mode" flag, so
   picking a theme and navigating anywhere reset it — which read as "the
   theme disappears when I leave profile". Nothing else writes here now. If
   you find yourself adding a second writer, that is the bug coming back.

   A theme is a HUE and a TREATMENT: light, mono or dark. The picker is
   built from those two lists, so adding a hue is one entry here and three
   blocks in palettes.css. */
(function(){
  var KEY = 'eski-theme';
  var DEFAULT = 'mono-green';        // what the site looked like before this

  var TREATMENTS = [
    { id:'light', name:'Light', mode:'light' },
    { id:'mono',  name:'Mono',  mode:'dark'  },   // each mono block sets its own ground
    { id:'dark',  name:'Dark',  mode:'dark'  }
  ];
  var HUES = [
    { id:'neutral', name:'Neutral' },
    { id:'green',   name:'Green' },
    { id:'blue',    name:'Blue' },
    { id:'red',     name:'Red' },
    { id:'amber',   name:'Amber' },
    { id:'pink',    name:'Pink' }
  ];

  function parse(id){
    var bits = String(id || '').split('-');
    var t = null, h = null, i;
    for(i = 0; i < TREATMENTS.length; i++) if(TREATMENTS[i].id === bits[0]) t = TREATMENTS[i];
    for(i = 0; i < HUES.length; i++) if(HUES[i].id === bits[1]) h = HUES[i];
    return (t && h) ? { id:t.id + '-' + h.id, treatment:t, hue:h } : null;
  }

  function read(){
    try{ return parse(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : DEFAULT; }
    catch(e){ return DEFAULT; }
  }

  function apply(id){
    var t = parse(id) || parse(DEFAULT);
    var el = document.documentElement;
    el.setAttribute('data-theme', t.id);
    el.setAttribute('data-mode', t.treatment.mode);
    /* one attribute for "this ground is dark", so a rule that only needs to
       know that can say so without naming twelve themes */
    if(t.treatment.mode === 'dark') el.setAttribute('data-dark', '');
    else el.removeAttribute('data-dark');
  }

  apply(read());

  function set(id){
    if(!parse(id)) return;
    try{ localStorage.setItem(KEY, id); }catch(e){}
    apply(id);
    document.dispatchEvent(new CustomEvent('eski-theme', { detail:{ theme:id } }));
    paintAll();
  }

  /* ---------------------------------------------------------------- picker */
  /* ONE LINE, no treatment labels: a chip is a miniature of the page it
     makes, so what treatment it is is the thing you can already see. */
  function chips(current){
    var out = '';
    TREATMENTS.forEach(function(t){
      out += '<span class="pal-set">';
      HUES.forEach(function(h){
        var id = t.id + '-' + h.id;
        /* data-theme AND data-mode on the chip itself, so every token inside
           resolves to that theme's values and the miniature is the real
           thing rather than a hard-coded hex */
        out += '<button class="pal-sw" type="button"' +
               ' data-theme="' + id + '" data-mode="' + t.mode + '"' +
               ' data-pick="' + id + '"' +
               ' aria-pressed="' + (id === current) + '"' +
               ' title="' + h.name + ' · ' + t.name + '"' +
               ' aria-label="' + h.name + ' ' + t.name + ' theme">' +
               '<i></i><b></b><s></s><u></u><em></em></button>';
      });
      out += '</span>';
    });
    return out;
  }

  function paint(box){
    if(!box) return;
    var open = box.classList.contains('open');
    box.classList.add('pal');
    box.innerHTML =
      '<button class="pal-toggle" type="button" aria-expanded="' + open + '">Theme</button>' +
      '<div class="pal-pop">' + chips(read()) + '</div>';
    if(open) box.classList.add('open');

    box.querySelector('.pal-toggle').addEventListener('click', function(e){
      e.stopPropagation();
      var on = !box.classList.contains('open');
      closeAll();
      box.classList.toggle('open', on);
      this.setAttribute('aria-expanded', on);
    });
    box.querySelectorAll('[data-pick]').forEach(function(b){
      b.addEventListener('click', function(e){
        e.stopPropagation();
        set(b.getAttribute('data-pick'));
      });
    });
  }

  function closeAll(){
    document.querySelectorAll('.pal.open').forEach(function(p){
      p.classList.remove('open');
      var t = p.querySelector('.pal-toggle');
      if(t) t.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeAll(); });

  function paintAll(){
    document.querySelectorAll('[data-palette-picker]').forEach(paint);
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', paintAll);
  else paintAll();

  window.eskiTheme = {
    treatments: TREATMENTS.slice(),
    hues: HUES.slice(),
    get current(){ return read(); },
    get mode(){ return (parse(read()) || parse(DEFAULT)).treatment.mode; },
    set: set,
    paint: paintAll
  };

  addEventListener('storage', function(e){
    if(e.key === KEY){ apply(read()); paintAll(); }
  });
})();
