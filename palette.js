/* THE THEME, APPLIED BEFORE ANYTHING PAINTS.

   A classic script in <head>, deliberately not a module: a module is
   deferred, so the page would paint in the default theme and then repaint
   in yours. That flash is why this is its own file and loads where it does.

   ONE PLACE OWNS THE CHOICE. The system this replaced had seven other
   surfaces calling set() on load from their own local "dark mode" flag, so
   picking a theme and navigating anywhere reset it — which read as "the
   theme disappears when I leave profile". Nothing else writes here now. If
   you find yourself adding a second writer, that is the bug coming back.

   TWO THEMES, not the old eighteen-hue picker (2026-08-15). eski has a real
   accent now — sage, reviewed in artboard.html — so "which hue" stopped
   being the reader's decision to make; the only axis left is light ground
   or dark ground. See palettes.css's own header for the full reasoning. */
(function(){
  var KEY = 'eski-theme';
  var DEFAULT = 'light';

  var THEMES = [
    { id:'light', name:'Light' },
    { id:'dark',  name:'Dark'  }
  ];

  function valid(id){ return THEMES.some(function(t){ return t.id === id; }); }

  function read(){
    try{ var v = localStorage.getItem(KEY); return valid(v) ? v : DEFAULT; }
    catch(e){ return DEFAULT; }
  }

  function apply(id){
    document.documentElement.setAttribute('data-theme', valid(id) ? id : DEFAULT);
  }

  apply(read());

  function set(id){
    if(!valid(id)) return;
    try{ localStorage.setItem(KEY, id); }catch(e){}
    apply(id);
    document.dispatchEvent(new CustomEvent('eski-theme', { detail:{ theme:id } }));
    paintAll();
  }

  /* ---------------------------------------------------------------- picker */
  function chips(current){
    return '<span class="pal-set">' + THEMES.map(function(t){
      return '<button class="pal-sw" type="button" data-theme="' + t.id + '"' +
             ' data-pick="' + t.id + '"' +
             ' aria-pressed="' + (t.id === current) + '"' +
             ' title="' + t.name + '" aria-label="' + t.name + ' theme">' +
             '<i></i><b></b><s></s><u></u><em></em></button>';
    }).join('') + '</span>';
  }

  function paint(box){
    if(!box) return;
    box.classList.add('pal');
    box.innerHTML = chips(read());
    box.querySelectorAll('[data-pick]').forEach(function(b){
      b.addEventListener('click', function(){ set(b.getAttribute('data-pick')); });
    });
  }

  function paintAll(){
    document.querySelectorAll('[data-palette-picker]').forEach(paint);
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', paintAll);
  else paintAll();

  window.eskiTheme = {
    themes: THEMES.slice(),
    get current(){ return read(); },
    set: set,
    paint: paintAll
  };

  addEventListener('storage', function(e){
    if(e.key === KEY){ apply(read()); paintAll(); }
  });
})();
