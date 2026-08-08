/* THE THEME, APPLIED BEFORE ANYTHING PAINTS.

   A classic script in <head>, deliberately not a module and deliberately not
   part of platform.js: a module is deferred, so the page would paint in the
   default theme and then repaint in yours. That flash is the whole reason
   this is its own file and loads where it does.

   The stored value is the only state. Everything else — colour, typeface,
   corner radius, whether hairline rules exist, how a control answers a
   hover — is CSS keyed off <html data-theme>, in themes.css. */
(function(){
  var KEY = 'eski-theme';
  var THEMES = ['broadsheet', 'press', 'eski', 'light', 'pink', 'slate'];
  var DEFAULT = 'broadsheet';

  function read(){
    try{
      var t = localStorage.getItem(KEY);
      return THEMES.indexOf(t) >= 0 ? t : DEFAULT;
    }catch(e){ return DEFAULT; }
  }

  function apply(t){
    var el = document.documentElement;
    el.setAttribute('data-theme', THEMES.indexOf(t) >= 0 ? t : DEFAULT);
    /* the browser's own widgets — scrollbars, form controls, the url bar on
       a phone — need telling, or a dark theme keeps a white scrollbar. */
    var dark = (t === 'eski' || t === 'slate');
    el.style.colorScheme = dark ? 'dark' : 'light';
    /* ONE attribute for "this theme is dark", so a rule that only needs to
       know that can say so without naming every dark theme — and without a
       comma-separated list that quietly splits into two wrong selectors the
       next time a theme is added. */
    if(dark) el.setAttribute('data-dark',''); else el.removeAttribute('data-dark');
  }

  apply(read());

  window.eskiTheme = {
    list: THEMES.slice(),
    get current(){ return read(); },
    set: function(t){
      if(THEMES.indexOf(t) < 0) return;
      try{ localStorage.setItem(KEY, t); }catch(e){}
      apply(t);
      document.dispatchEvent(new CustomEvent('eski-theme', { detail: { theme: t } }));
    }
  };

  /* another tab changed it: follow, so two open tabs do not disagree */
  addEventListener('storage', function(e){ if(e.key === KEY) apply(read()); });
})();
