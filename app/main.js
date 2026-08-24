// main.js — app boot + top-level render. Mounts the persistent three-pane shell
// (rail + stage) for the in-app screens and swaps the active screen on every
// route change. The workspace (P4) is a real screen assembled from primitives;
// the not-yet-ported screens still render a labelled placeholder inside the same
// frame, so the shell reads consistently as later phases fill them in.

import { signal, effect } from "./signals.js";
import { start, match } from "./router.js";
import { ready, session, onChange } from "./supabase.js";
import { icon } from "./icons.js";
import { loadWorkspace, clearWorkspaceCache } from "./data.js";
import { teardownRealtime } from "./realtime.js";
import { renderRail, appFrame } from "./shell.js";
import { renderWorkspace } from "./screens/workspace.js";
import { renderSignin } from "./screens/signin.js";

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
  };
}

let token = 0;   // guards against a stale async render landing after a newer nav

async function renderRoute(r) {
  const mine = ++token;
  teardownRealtime();                                  // kill the previous view's subscriptions

  if (r.screen === "auth") { swap(renderSignin()); return; }   // /signin — full screen, no shell
  if (!IN_SHELL.has(r.screen)) { swap(placeholder(r)); return; }

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

function loading() {
  const s = document.createElement("section");
  s.className = "screen";
  s.innerHTML = `<div class="ph" style="color:var(--muted)">eski</div>`;
  return s;
}
