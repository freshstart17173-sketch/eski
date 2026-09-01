// router.js — a hash/History router over the CANON §C.3 route manifest. No
// framework: it matches the path to a route, extracts :params, and hands the
// match to a render callback that swaps the .screen in #stage. Internal <a>
// clicks are intercepted (pushState, no full reload); Back/Forward via popstate.
//
// Vercel rewrites (vercel.json) send deep links like /u/rae and /s/:id to the
// shell, so History paths resolve on a hard refresh too.

// Manifest: order matters — the first match wins, so more specific patterns
// (…/c/:channelId, …/settings) precede the bare /s/:serverId. `screen` is the
// data-screen name from CANON §C.3.
const ROUTES = [
  // owner 2026-09-01: Feed (friends' public posts) is cut — "/" now maps straight to the
  // personal File explorer, same screen as /files (main.js redirects "/" to the canonical
  // /files so explorer.js's own URL-sync can track folder/file/view in the address bar).
  { pattern: "/",                          screen: "explorer" },
  { pattern: "/files",                     screen: "explorer" },   // personal My-files mount
  { pattern: "/messages",                  screen: "dms" },
  { pattern: "/notifications",             screen: "notifications" },
  { pattern: "/upload",                    screen: "upload" },      // modal route
  { pattern: "/create",                    screen: "create" },
  { pattern: "/search",                    screen: "search" },
  { pattern: "/settings",                  screen: "usersettings" },   // USER settings (≠ /s/:id/settings)
  { pattern: "/signin",                    screen: "auth" },
  { pattern: "/join/:code",                screen: "join" },
  { pattern: "/shared/folder/:token",      screen: "sharedfolder" },   // K9 folder viewer (before /shared/:token)
  { pattern: "/shared/:token",             screen: "shared" },
  { pattern: "/u/:handle",                 screen: "profile" },
  { pattern: "/s/:serverId/c/:channelId",  screen: "workspace" },
  { pattern: "/s/:serverId/settings",      screen: "settings" },
  { pattern: "/s/:serverId/files",         screen: "explorer" },
  { pattern: "/s/:serverId",               screen: "workspace" },
];

const NOT_FOUND = { screen: "notfound" };

function compile(pattern) {
  const keys = [];
  const rx = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) { keys.push(seg.slice(1)); return "([^/]+)"; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { re: new RegExp("^" + (rx || "/") + "/?$"), keys };
}

const compiled = ROUTES.map((r) => ({ ...r, ...compile(r.pattern) }));

/** Match a pathname to a route. Always returns a match (falls back to 404). */
export function match(pathname) {
  for (const r of compiled) {
    const m = r.re.exec(pathname);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { screen: r.screen, params, path: pathname };
    }
  }
  return { ...NOT_FOUND, params: {}, path: pathname };
}

let _onRoute = () => {};

/** Programmatic navigation (no reload). */
export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  _onRoute(match(location.pathname));
}

/** Re-render the CURRENT route from scratch (same path). Use after a mutation whose result
 *  the whole shell must reflect (e.g. a profile edit changing the rail avatar / name) — clear
 *  the relevant cache first, then reload() so every pane rebuilds from fresh data. `navigate`
 *  no-ops on an unchanged path, so it can't do this. */
export function reload() { _onRoute(match(location.pathname)); }

// Intercept plain-left-click on same-origin, non-modified, non-download links so
// internal navigation never triggers a full page load.
function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
      e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a) return;
  if (a.target === "_blank" || a.hasAttribute("download") ||
      a.getAttribute("rel") === "external") return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  // let non-app assets (docs, api, files with an extension) load normally
  if (/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.startsWith("/api/")) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
}

/** Start routing; `onRoute(match)` renders the matched screen. */
export function start(onRoute) {
  _onRoute = onRoute;
  window.addEventListener("popstate", () => _onRoute(match(location.pathname)));
  document.addEventListener("click", onClick);
  _onRoute(match(location.pathname));
}
