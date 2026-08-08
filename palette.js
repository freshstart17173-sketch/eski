/* THE PALETTE, APPLIED BEFORE ANYTHING PAINTS.

   A classic script in <head>, deliberately not a module: a module is
   deferred, so the page would paint in the default palette and then repaint
   in yours. That flash is why this is its own file and loads where it does.

   ONE PLACE OWNS THE CHOICE. The theme system this replaces had seven other
   surfaces calling `set()` on load from their own local "dark mode" flag, so
   picking a palette in the profile and then navigating anywhere reset it —
   which read as "the theme disappears when I leave profile". Nothing else
   writes here now. If you find yourself adding a second writer, that is the
   bug coming back.

   The picker renders from PALETTES below, so a new palette is one entry in
   this array plus one block in palettes.css, and it appears in the profile
   and the footer without either of them being touched. */
(function(){
  var KEY = 'eski-palette';
  var DEFAULT = 'moss';          // what the site looked like before this existed

  var PALETTES = [
    { id:'ink',     mode:'light', name:'Black' },
    { id:'forest',  mode:'light', name:'Forest' },
    { id:'cobalt',  mode:'light', name:'Cobalt' },
    { id:'crimson', mode:'light', name:'Crimson' },
    { id:'amber',   mode:'light', name:'Amber' },
    { id:'paper',   mode:'dark',  name:'White' },
    { id:'moss',    mode:'dark',  name:'Moss' },
    { id:'ice',     mode:'dark',  name:'Ice' },
    { id:'rose',    mode:'dark',  name:'Rose' },
    { id:'gold',    mode:'dark',  name:'Gold' }
  ];

  var byId = {};
  for(var i = 0; i < PALETTES.length; i++) byId[PALETTES[i].id] = PALETTES[i];

  function read(){
    try{
      var p = localStorage.getItem(KEY);
      return byId[p] ? p : DEFAULT;
    }catch(e){ return DEFAULT; }
  }

  function apply(id){
    var p = byId[id] || byId[DEFAULT];
    var el = document.documentElement;
    el.setAttribute('data-palette', p.id);
    el.setAttribute('data-mode', p.mode);
    /* one attribute for "this is a dark ground", so a rule that only needs
       to know that can say so without naming five palettes */
    if(p.mode === 'dark') el.setAttribute('data-dark', '');
    else el.removeAttribute('data-dark');
  }

  apply(read());

  function set(id){
    if(!byId[id]) return;
    try{ localStorage.setItem(KEY, id); }catch(e){}
    apply(id);
    document.dispatchEvent(new CustomEvent('eski-palette', { detail:{ palette:id } }));
    paintAll();
  }

  /* ---------------------------------------------------------------- picker */
  function html(current, compact){
    var out = '';
    ['light', 'dark'].forEach(function(mode){
      out += '<span class="pal-group">' +
             (compact ? '' : '<span>' + mode + '</span>');
      PALETTES.filter(function(p){ return p.mode === mode; }).forEach(function(p){
        /* data-palette AND data-mode on the swatch itself, so --accent and
           --paper inside it resolve to that palette's values and the button
           is a real sample rather than a hard-coded hex */
        out += '<button class="pal-sw" type="button"' +
               ' data-palette="' + p.id + '" data-mode="' + p.mode + '"' +
               ' data-pick="' + p.id + '"' +
               ' aria-pressed="' + (p.id === current) + '"' +
               ' title="' + p.name + ' · ' + mode + '"' +
               ' aria-label="' + p.name + ' ' + mode + ' palette"></button>';
      });
      out += '</span>';
    });
    return out;
  }

  function paint(box){
    if(!box) return;
    box.classList.add('pal');
    box.innerHTML = html(read(), box.hasAttribute('data-compact'));
    var bs = box.querySelectorAll('[data-pick]');
    for(var i = 0; i < bs.length; i++){
      bs[i].addEventListener('click', function(){ set(this.getAttribute('data-pick')); });
    }
  }

  function paintAll(){
    var boxes = document.querySelectorAll('[data-palette-picker]');
    for(var i = 0; i < boxes.length; i++) paint(boxes[i]);
  }

  /* every surface just puts <div data-palette-picker></div> where it wants one */
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', paintAll);
  else paintAll();

  window.eskiPalette = {
    list: PALETTES.slice(),
    get current(){ return read(); },
    get mode(){ return (byId[read()] || byId[DEFAULT]).mode; },
    set: set,
    paint: paintAll
  };

  /* another tab changed it: follow, so two open tabs never disagree */
  addEventListener('storage', function(e){
    if(e.key === KEY){ apply(read()); paintAll(); }
  });
})();
