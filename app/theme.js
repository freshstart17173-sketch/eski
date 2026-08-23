// theme.js — CLASSIC script (not a module), loaded synchronously in <head>
// BEFORE the stylesheets so data-theme is stamped before first paint. That
// avoids the flash of the default theme repainting to the chosen one.
//
// Three states (eski-style / P0.3):
//   "light"  -> [data-theme="light"]
//   "dark"   -> [data-theme="dark"]
//   "system" -> no attribute; prefers-color-scheme decides
(function () {
  var KEY = "eski-theme";
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");   // system
  }

  // Stamp immediately, before CSS loads.
  apply(stored() || "system");

  // Cycle light -> dark -> system. Exposed for the eventual theme toggle control.
  window.__eskiTheme = {
    get: function () { return stored() || "system"; },
    set: function (mode) {
      try {
        if (mode === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, mode);
      } catch (e) {}
      apply(mode);
    },
    cycle: function () {
      var next = { light: "dark", dark: "system", system: "light" };
      var m = next[this.get()] || "light";
      this.set(m);
      return m;
    },
  };
})();
