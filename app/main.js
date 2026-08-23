// main.js — app boot + top-level render. Mounts the persistent three-pane shell
// (rail + stage) for the in-app screens and swaps the active screen on every
// route change. The workspace (P4) is a real screen assembled from primitives;
// the not-yet-ported screens still render a labelled placeholder inside the same
// frame, so the shell reads consistently as later phases fill them in.

import { signal, effect } from "./signals.js";
import { start, match } from "./router.js";
import { ready, session, onChange } from "./supabase.js";
import { icon } from "./icons.js";
import { loadWorkspace } from "./data.js";
import { renderRail, appFrame } from "./shell.js";
import { renderWorkspace } from "./screens/workspace.js";

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
  if (!IN_SHELL.has(r.screen)) { swap(placeholder(r)); return; }

  const data = await loadWorkspace({ serverId: r.params.serverId, channelId: r.params.channelId });
  if (mine !== token) return;   // a newer navigation already rendered

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

// route changes flow into the signal; the effect re-renders (async).
start((m) => { route.value = m; });
effect(() => { renderRoute(route.value); });

ready.then(() => { authed.value = !!session(); });
onChange(() => { authed.value = !!session(); });
