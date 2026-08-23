// main.js — P0 boot. Wires the router to the signals layer and renders a
// placeholder per route (just the screen's name, centred — no product screen
// yet, no visual styling judged at P0). Proves three things the P0 gate asks
// for: routes swap with no reload, a signal update re-renders the DOM, and the
// session hydrates before anything reads it.

import { signal, effect } from "./signals.js";
import { start, match } from "./router.js";
import { ready, session, onChange } from "./supabase.js";
import { icon } from "./icons.js";

const stage = document.getElementById("stage");

// --- reactive state -------------------------------------------------------
const route = signal(match(location.pathname));   // current route match
const authed = signal(false);                     // signed in? (post-ready)
const tick = signal(0);                           // a live counter — proof a
                                                  // signal update repaints the DOM

// Human labels for the placeholder (route.screen -> heading).
const LABELS = {
  feed: "Feed", dms: "Messages", notifications: "Notifications",
  upload: "Upload", create: "Create server", search: "Search",
  auth: "Sign in", join: "Join", profile: "Profile",
  workspace: "Workspace", settings: "Server settings", explorer: "File explorer",
  notfound: "404",
};

// --- render: one effect re-runs whenever any signal it reads changes -------
effect(() => {
  const r = route.value;
  const name = LABELS[r.screen] || r.screen;
  const params = Object.entries(r.params)
    .map(([k, v]) => `${k}=${v}`).join(" · ");

  stage.innerHTML = `
    <section class="screen" data-screen="${r.screen}">
      <div class="ph">
        ${icon("server")} ${name}
        <small>${r.path}${params ? " — " + params : ""}</small>
        <small>${authed.value ? "signed in" : "signed out"}
          · scaffold alive · tick ${tick.value}</small>
      </div>
    </section>`;
});

// --- boot -----------------------------------------------------------------
start((m) => { route.value = m; });          // route changes flow into the signal

ready.then(() => { authed.value = !!session(); });
onChange(() => { authed.value = !!session(); });

// Live proof the reactive layer drives the DOM without a reload.
setInterval(() => { tick.value = tick.peek() + 1; }, 1000);
