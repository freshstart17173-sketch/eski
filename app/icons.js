// icons.js — the icon() helper (P0.4). The SVG sprite of <symbol id="i-*"> lives
// mounted once in index.html (ported verbatim from the gallery). This helper just
// references a symbol by name and warns loudly in dev when a name isn't mounted —
// that turns an "icon that doesn't render / doesn't make sense" typo into a
// console warning instead of a silent empty box.
//
// The known set is derived from the DOM sprite at first use, so it can never drift
// from what's actually mounted: add a <symbol> and icon() accepts it automatically.

let _known = null;
function known() {
  if (_known) return _known;
  _known = new Set();
  document.querySelectorAll('svg symbol[id^="i-"]').forEach((s) =>
    _known.add(s.id.slice(2))
  );
  return _known;
}

const isDev = /localhost|127\.0\.0\.1|\.vercel\.app|preview\./.test(location.hostname);

/**
 * icon(name, size?) -> markup string.
 *   name : symbol name without the "i-" prefix, e.g. "server".
 *   size : "sm" for the small variant; omit for default.
 * currentColor drives the stroke, so an icon inherits its parent's colour.
 */
export function icon(name, size) {
  if (isDev && !known().has(name)) {
    console.warn(`[icon] unknown icon "${name}" — not in the mounted sprite`);
  }
  const cls = size ? `ic ${size}` : "ic";
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** Same as icon() but returns a live <svg> element. */
export function iconEl(name, size) {
  const tpl = document.createElement("template");
  tpl.innerHTML = icon(name, size);
  return tpl.content.firstElementChild;
}
