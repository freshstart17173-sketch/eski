// player.js — the ONE persistent media player (B14).
//
// THE BUG THIS FIXES: the details viewer built a fresh MediaPlayer every time it opened, and a
// nav / close removed the viewer (it lives on document.body, and renderRoute calls closeDetails).
// The detached <audio> kept playing, but reopening the file made a NEW element at 0:00 — so audio
// "kept playing" yet the player "reset when you came back", and you could end up with two streams.
//
// THE FIX: exactly one live player wrap at a time, owned here, OUTSIDE the per-route #stage. The
// details viewer plays THROUGH this module (playInto). When the viewer closes while media is still
// playing, the SAME wrap is moved to a hidden, off-screen keep-alive host on <body> — it stays in
// the document, so the browser keeps it playing (removing a media element from the document forces a
// pause per the HTML spec, so we must NOT detach it). Reopening the file re-adopts the live wrap
// inline at its current position. A paused/ended file just stops on close.
//
// Reparenting a media element never reloads it (only a new src / load() does), so this is seamless;
// resyncHead() (ui.js) restarts the head animation once it's back inline.
//
// OWNER 2026-08-30: NO visible mini-dock — just keep the media playing silently across navigation
// (audio keeps going off-screen). The dock UI (a bottom-left mini player) is written and kept below
// behind DOCK_ENABLED for a possible future opt-in; flip the flag to bring it back.

import { MediaPlayer, el } from "./ui.js";
import { iconEl } from "./icons.js";

// Parked feature flag: false = keep the element alive silently off-screen (owner's ask); true =
// float the visible mini dock instead. Kept so the dock code stays live for a future opt-in.
const DOCK_ENABLED = false;

let cur = null;      // { workId, wrap, media, title, kind, reopen } — the active player, or null
let dock = null;     // the fixed mini-dock element while docked (only if DOCK_ENABLED), else null
let keepHost = null; // hidden off-screen host that keeps a backgrounded player in the document

// The off-screen keep-alive host — connected to <body> so a parked media element keeps PLAYING
// (a disconnected one is force-paused by the browser). Visually hidden, never interactive.
function keepEl() {
  if (!keepHost) { keepHost = el(".playerkeep", { "aria-hidden": "true" }); document.body.appendChild(keepHost); }
  return keepHost;
}

// Play work `w` (audio/video) from `url` inside `mount`. If the same work is already the active
// player, ADOPT its live wrap (preserving currentTime + play state) instead of restarting; a
// different work tears the old one down and starts fresh. `title` labels the dock; `reopen` (if
// given) lets the dock's title reopen the full viewer. Returns the wrap.
export function playInto(mount, w, url, { title, reopen } = {}) {
  if (cur && cur.workId === w.id) {
    undock();                                 // take the wrap back from the dock if it was there
    mount.replaceChildren(cur.wrap);          // move the SAME element inline — no reload, state kept
    if (title) cur.title = title;
    if (reopen) cur.reopen = reopen;
    cur.wrap.resyncHead?.();
    return cur.wrap;
  }
  stop();                                     // switching files → stop + drop the previous player
  const wrap = MediaPlayer({ src: url, kind: w.kind });
  cur = { workId: w.id, wrap, media: wrap.media, title: title || w.title || "Now playing", kind: w.kind, reopen: reopen || null };
  mount.replaceChildren(wrap);
  return wrap;
}

// Called ONLY when the viewer is torn down for an app NAVIGATION (switching servers/channels/
// screens elsewhere) — never for an explicit user dismiss, see closeDetails' split in details.js
// (owner 2026-08-31: closing the viewer must stop the media; only leaving the app section it's in
// should let it keep playing). Keep a PLAYING stream alive (detached but still playing, so audio
// continues while you're away — reopening re-adopts it); stop a paused/ended one (closing a preview
// you only glanced at shouldn't keep sound going). Safe to call when nothing is active or already parked.
export function onViewerClosing() {
  if (!cur || dock) return;
  const m = cur.media;
  if (!m || m.paused || m.ended) { stop(); return; }
  if (DOCK_ENABLED) dockNow();
  else keepEl().appendChild(cur.wrap);   // park off-screen but IN the document → keeps playing
}

// Whether a given work is the one currently playing (lets the explorer show a "playing" cue later).
export function isPlaying(workId) { return !!(cur && cur.workId === workId && cur.media && !cur.media.paused); }

function dockNow() {
  if (!cur || dock) return;
  const playBtn = el("button.iconbtn.pdock-play", { "aria-label": "Play/pause" }, [iconEl(cur.media.paused ? "play" : "pause")]);
  playBtn.addEventListener("click", () => { cur.media.paused ? cur.media.play() : cur.media.pause(); });
  const syncPlay = () => playBtn.replaceChildren(iconEl(cur.media.paused ? "play" : "pause"));
  cur.media.addEventListener("play", syncPlay);
  cur.media.addEventListener("pause", syncPlay);
  const title = el("button.pdock-title", { title: cur.reopen ? "Open in viewer" : "" }, [cur.title]);
  if (cur.reopen) title.addEventListener("click", () => cur.reopen()); else title.disabled = true;
  const close = el("button.iconbtn", { "aria-label": "Stop", title: "Stop" }, [iconEl("x", "sm")]);
  close.addEventListener("click", stop);
  cur.wrap.classList.add("docked");
  dock = el(".pdock", { role: "region", "aria-label": "Media player" }, [
    el(".pdock-hd", {}, [playBtn, title, close]),
    cur.wrap,
  ]);
  // remove the play/pause sync listeners when the dock goes away, so cycles don't accrete them
  dock._cleanup = () => { cur?.media?.removeEventListener("play", syncPlay); cur?.media?.removeEventListener("pause", syncPlay); };
  document.body.appendChild(dock);
  cur.wrap.resyncHead?.();
}

// Detach the dock without touching the wrap — the wrap is moved out first so removing the dock
// element doesn't take the live player with it.
function undock() {
  if (!dock) return;
  if (cur?.wrap?.parentElement === dock) dock.removeChild(cur.wrap);
  cur?.wrap?.classList.remove("docked");
  dock._cleanup?.();
  dock.remove();
  dock = null;
}

// Fully stop + tear down the active player (pause, drop the dock, remove the wrap).
export function stop() {
  try { cur?.media?.pause(); } catch {}
  undock();
  cur?.wrap?.remove();
  cur = null;
}
