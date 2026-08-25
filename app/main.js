// main.js — app boot + top-level render. Mounts the persistent three-pane shell
// (rail + stage) for the in-app screens and swaps the active screen on every
// route change. The workspace (P4) is a real screen assembled from primitives;
// the not-yet-ported screens still render a labelled placeholder inside the same
// frame, so the shell reads consistently as later phases fill them in.

import { signal, effect } from "./signals.js";
import { start, match } from "./router.js";
import { ready, session, onChange } from "./supabase.js";
import { icon } from "./icons.js";
import { loadWorkspace, loadExplorer, loadFeed, loadProfile, loadSharedWork, loadDMsScreen, loadNotifications, clearWorkspaceCache, isDemo } from "./data.js";
import { teardownRealtime } from "./realtime.js";
import { renderRail, appFrame } from "./shell.js";
import { renderWorkspace } from "./screens/workspace.js";
import { renderExplorer } from "./screens/explorer.js";
import { renderFeed } from "./screens/feed.js";
import { renderProfile } from "./screens/profile.js";
import { closeDetails } from "./screens/details.js";
import { renderSignin } from "./screens/signin.js";
import { renderLanding } from "./screens/landing.js";
import { renderShared } from "./screens/shared.js";
import { renderDMs } from "./screens/dms.js";
import { renderNotifications } from "./screens/notifications.js";
import { renderNotFound } from "./screens/notfound.js";
import { openSwitcher, closeSwitcher } from "./screens/switcher.js";

const stage = document.getElementById("stage");

const route = signal(match(location.pathname));   // current route match
const authed = signal(false);                     // signed in? (post-ready)

// Screens that live inside the three-pane shell (the rail is persistent).
const IN_SHELL = new Set(["feed", "dms", "notifications", "search", "workspace", "explorer", "settings", "profile"]);
const LABELS = {
  feed: "Feed", dms: "Messages", notifications: "Notifications", upload: "Upload",
  create: "Create server", search: "Search", auth: "Sign in", join: "Join",
  profile: "Profile", workspace: "Workspace", settings: "Server settings",
  explorer: "File explorer", notfound: "404",
};

// a labelled placeholder for a route whose real screen isn't ported yet
function placeholder(r) {
  const params = Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(" · ");
  const wrap = document.createElement("section");
  wrap.className = "screen";
  wrap.dataset.screen = r.screen;
  wrap.innerHTML = `<div class="ph">${icon("server")} ${LABELS[r.screen] || r.screen}
    <small>${r.path}${params ? " — " + params : ""}</small>
    <small>${authed.value ? "signed in" : "signed out"} · not yet ported</small></div>`;
  return wrap;
}

// workspace state flags parsed from the URL (for verification + deep links)
function workspaceView(r) {
  const p = new URLSearchParams(location.search);
  const ws = p.get("ws");
  return {
    channelId: r.params.channelId,
    loading: ws === "loading",
    reconnecting: ws === "reconnecting",
    thread: ws === "thread",
    composer: ws === "timedout" || ws === "slowmode" ? ws : "normal",
    tab: ws === "pins" || ws === "files" ? ws : p.get("tab") || "messages",
    forceEmpty: ws === "empty",
    focusMsg: p.get("m"),                              // a message permalink → scroll + flash it
  };
}

let token = 0;   // guards against a stale async render landing after a newer nav

async function renderRoute(r) {
  const mine = ++token;
  teardownRealtime();                                  // kill the previous view's subscriptions
  closeDetails();                                       // a nav closes any open details overlay
  closeSwitcher();                                      // …and any open quick-switcher

  if (r.screen === "auth") { swap(renderSignin()); return; }   // /signin — full screen, no shell
  if (r.screen === "notfound") { swap(renderNotFound()); return; }   // 404 — full screen, no shell

  // /shared/:token — the read-only shared-link viewer. A standalone page (no shell, works
  // signed-out), so it covers the rail: no way to browse the rest of the server.
  if (r.screen === "shared") {
    const shData = await loadSharedWork(r.params.token);
    if (mine !== token) return;
    swap(renderShared(shData));
    return;
  }
  // "/" with no session is the marketing home, not the in-shell Feed placeholder
  // or the bare sign-in prompt — every other signed-out deep link still falls
  // through to renderSignin() below via needsAuth.
  if (r.screen === "feed" && r.path === "/" && !session() && !isDemo()) { swap(renderLanding()); return; }
  if (!IN_SHELL.has(r.screen)) { swap(placeholder(r)); return; }

  // File explorer (P5.4) — its own read (folder tree + placed works + storage);
  // mounts in the same shell as the workspace, Files highlighted in the column.
  if (r.screen === "explorer") {
    const q = new URLSearchParams(location.search);
    const folder = q.get("folder");
    const source = r.params.serverId ? "server" : "personal";   // /files = personal mount
    const exData = await loadExplorer({ serverId: r.params.serverId, folderId: folder, source });
    if (mine !== token) return;
    if (exData.needsAuth) { swap(renderSignin()); return; }
    swap(appFrame(renderRail(exData, r), renderExplorer(exData, { folderId: folder, mode: q.get("view") })));
    return;
  }

  // Home Feed (P5.1) — friends' public posts, same card grid as the explorer.
  if (r.screen === "feed") {
    const feedData = await loadFeed();
    if (mine !== token) return;
    if (feedData.needsAuth) { swap(renderSignin()); return; }
    swap(appFrame(renderRail(feedData, r), renderFeed(feedData)));
    return;
  }

  // Notifications (P7.3) — the in-app notification list.
  if (r.screen === "notifications") {
    const nData = await loadNotifications();
    if (mine !== token) return;
    if (nData.needsAuth) { swap(renderSignin()); return; }
    swap(appFrame(renderRail(nData, r), renderNotifications(nData)));
    return;
  }

  // Messages (P7.1) — DM thread list + the Friends panel.
  if (r.screen === "dms") {
    const dmData = await loadDMsScreen();
    if (mine !== token) return;
    if (dmData.needsAuth) { swap(renderSignin()); return; }
    swap(appFrame(renderRail(dmData, r), renderDMs(dmData)));
    return;
  }

  // Profile (P5.10) — a person's shelves, POV-gated.
  if (r.screen === "profile") {
    const profData = await loadProfile(r.params.handle);
    if (mine !== token) return;
    if (profData.needsAuth) { swap(renderSignin()); return; }
    swap(appFrame(renderRail(profData, r), renderProfile(profData)));
    return;
  }

  const data = await loadWorkspace({ serverId: r.params.serverId, channelId: r.params.channelId });
  if (mine !== token) return;   // a newer navigation already rendered

  // signed out (and not the demo) → the magic-link sign-in
  if (data.needsAuth) { swap(renderSignin()); return; }

  let screen;
  if (r.screen === "workspace") {
    const view = workspaceView(r);
    if (view.forceEmpty) { data.channelGroups = []; data.channel = null; }
    screen = renderWorkspace(data, view);
  } else {
    screen = placeholder(r);
  }
  swap(appFrame(renderRail(data, r), screen));
}

function swap(node) { stage.replaceChildren(node); }

// route changes flow into the signal.
start((m) => { route.value = m; });

// Hold the first render until `ready` — getSession()/detectSessionInUrl must settle
// before we decide "signed in vs sign-in", or a magic-link return flashes the sign-in
// screen (and looked like it "needed several reloads"). A brief loading state covers
// the gap. After ready, an effect re-renders on every route change.
stage.replaceChildren(loading());
let started = false;
ready.then(() => {
  authed.value = !!session();
  started = true;
  effect(() => { renderRoute(route.value); });
});

// Sign-in / sign-out / refresh re-render the current route (what a route shows depends
// on the session). Ignore a transient null that isn't a real sign-out — token refresh
// can briefly report no session — so a signed-in view doesn't flicker to the sign-in
// screen (P4-BUG#5). Clear the per-server cache on sign-out so accounts don't bleed.
onChange((sess, event) => {
  authed.value = !!session();
  if (event === "SIGNED_OUT") clearWorkspaceCache();
  if (!session() && event && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
  if (started) renderRoute(route.peek());
});

// ⌘K / Ctrl-K opens the quick-switcher anywhere inside the app (not the marketing
// home or bare sign-in — there's nowhere to jump to yet). A second press toggles it
// shut, which openSwitcher() handles. Capture phase so a focused field can't swallow it.
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    if (!authed.value && !isDemo()) return;
    e.preventDefault();
    openSwitcher();
  }
}, true);

function loading() {
  const s = document.createElement("section");
  s.className = "screen";
  s.innerHTML = `<div class="ph wordmark" style="color:var(--muted)">eski!</div>`;
  return s;
}
