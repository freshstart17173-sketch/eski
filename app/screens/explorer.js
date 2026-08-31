// screens/explorer.js — the server File explorer (P5.4/P5.5). The Drive half of
// the app: a nested folder tree beside the channel column, the current folder's
// contents in the main pane, a three-way view toggle (grid · list · feed), and a
// storage footer. It reads what Upload writes (works placed by `placement.folder_id`).
//
// One fetch, client-side navigation: `loadExplorer` already returns EVERY folder
// and every server work with its folder location, so descending a folder or
// searching is pure filtering — no refetch, no route reload. The route is
// `/s/:serverId/files`; folder position lives in local screen state (the tree and
// breadcrumb drive it), which keeps travel instant. Feed view + trash + multi-
// select filters are later passes; grid/list + search + folders land here.
//
// Files is a channel (CANON §C.6): the server's channel column stays to the left
// so any other channel is one click away — the browser is never a dead-end.

import { el, toast, openMenu, closeMenus, openModal, VisibilitySeg, Button, copyToClipboard, loadingLabel, indetBar } from "../ui.js";
import { iconEl } from "../icons.js";
import { parseTag, TAG_TYPES, tagChip, tagEditor, tagColor } from "../tags.js";
import { addFolderTag, removeFolderTag } from "../data.js";
import { navigate, reload } from "../router.js";
import { createFolder, moveToFolder, moveFolderTo, renameFolder, deleteFolder, trashWorks, restoreWork, purgeWork, emptyTrash, loadTrash, starWork, unstarWork, saveToFiles, renameWork, setHidden, createShareLink, shareUrl, loadShareLinks, revokeShareLink, setVisibility, visFromDb, createFolderShare, folderShareUrl, requestToJoin, refreshStorage, searchFiles } from "../data.js";
import { workCard, folderCard, mediaUrl, KIND_ICON, downloadWork, baseName } from "../cards.js";
import { channelColumn } from "./workspace.js";
import { openUpload, enableDropUpload } from "./upload.js";
import { openDetails, closeDetails, metaRows } from "./details.js";
import { parseModifierToken, modifierRaw, modifierLabel, sameModifier, splitModifiers, modChip, RESERVED_KEYS, RESERVED_HINT } from "../search-modifiers.js";

// P14: three file-browser DENSITIES, modelled on Windows Explorer (owner spec 2026-08-30):
//   large — big content thumbnails (a photo/video frame fills the cell; other kinds show the
//           kind icon), filename + uploader below; spacing tuned for 2-line titles.
//   small — a dense grid of compact [kind icon · filename] rows (Explorer "small icons").
//   list  — the "Details" table: a column per field (Name · Type · Size · Uploader · Added).
// Old modes migrate: grid/feed → large. Default is large.
// Two view modes only (owner 2026-08-31): Grid (big content thumbnails) + List (the "Details"
// table). The old "Small icons" density was cut — small/grid/feed all migrate to large ("Grid").
const VIEWS = { large: "Grid", list: "List" };
const VIEW_ALIAS = { grid: "large", feed: "large", small: "large" };   // migrate old ?view= values / saved modes

// P32 · density slider. One continuous-feeling control spanning List → dense grid → large thumbnails,
// replacing the discrete Grid/List dropdown (owner 2026-08-31). Position 0 is the List table; 1..5 are
// grid stages, each a thumbnail min-width (px) the grid's `minmax(var(--tile),1fr)` reads. Stage 4 is
// the historical default (232) so nothing shifts for existing links; stage 2 (~160) is the denser
// "mockup" anchor the owner liked. The steps ease (font/gap tighten via [data-density] in CSS) so the
// slider reads as smooth density change, not a hard mode flip. list/small/large stay reachable AS the
// slider's own anchors (0 / 2 / 5), which is what the owner asked for.
const DENSITY_TILE = { 1: 132, 2: 160, 3: 192, 4: 232, 5: 288 };   // grid thumbnail min-width per stage
const DENSITY_DEFAULT = 4;
// Parse a ?view= value into {mode, density}. "list" → the table; "d1".."d5" → a grid stage; anything
// else (absent, or a legacy grid/feed/small alias) → the default grid stage.
function parseView(v) {
  if (v === "list") return { mode: "list", density: 0 };
  const m = /^d([1-5])$/.exec(v || "");
  if (m) return { mode: "large", density: +m[1] };
  return { mode: "large", density: DENSITY_DEFAULT };
}
// The ?view= value for a state — omitted (null) for the default grid so a plain link stays clean.
function viewParam(mode, density) {
  if (mode === "list") return "list";
  if (density && density !== DENSITY_DEFAULT) return "d" + density;
  return null;
}
// Filters (CANON §C.6): Type/Channel/Uploader/Tag are multi-select (an empty set = no
// filter, the union within a facet, the intersection across facets); Date and Sort are
// single-select. Type/Channel/Uploader/Tag options are all derived from the files in view
// (Type = the actual file extensions present, P8). Sort keys drive the comparator in sortFiles().
const SORTS = [["latest", "Latest"], ["oldest", "Oldest"], ["name", "Name"], ["size", "Size"]];
const SORT_LABEL = Object.fromEntries(SORTS);

function fmtBytes(n) {
  n = Number(n || 0);
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// the path from a folder up to the server root (root first)
function crumbPath(folders, folderId) {
  const byId = {};
  for (const f of folders) byId[f.id] = f;
  const path = [];
  let cur = folderId ? byId[folderId] : null;
  while (cur) { path.unshift(cur); cur = cur.parentId ? byId[cur.parentId] : null; }
  return path;
}

// Selection survives re-renders AND route re-entry (owner: "shouldn't unselect when I leave the
// tab") — it lives here, keyed by source+server, not in the per-render state. My-files and each
// server keep their own selection. A plain card click or an empty-area click still resets it.
const _selectionStore = new Map();
function persistentSelection(data) {
  const k = `${data.source}:${data.server?.id || "me"}`;
  if (!_selectionStore.has(k)) _selectionStore.set(k, new Set());
  return _selectionStore.get(k);
}
// B25 is now served by the URL itself (?folder=): opening a folder writes it to the address bar
// (syncUrl below), and a fresh mount / reload / back-forward reads it back (main.js → view.folderId).
// The old in-memory _folderStore was removed — it overrode the URL (e.g. it defeated Back-to-root by
// re-restoring the last folder), and the URL is the single source of truth now (and makes links work).

export function renderExplorer(data, view = {}) {
  const screen = el("section.screen", { "data-screen": "explorer" });

  // no server yet (member of nothing) — a plain empty state, no chrome to browse
  if (data.noServer) {
    screen.append(el(".pane", {}, [emptyState("folder", "No server yet", "Create or join a server, then its files live here.")]));
    return screen;
  }

  // local navigation state — one fetch already holds the whole tree + all works
  // B25: restore the last open folder (view param wins, then the per-server store, then root).
  const _restored = view.folderId ?? data.currentFolderId ?? null;
  const state = {
    folderId: (_restored && (data.folders || []).some((f) => f.id === _restored)) ? _restored : null,
    mode: parseView(VIEW_ALIAS[view.mode] || view.mode).mode,
    density: parseView(VIEW_ALIAS[view.mode] || view.mode).density,   // P32: 0 = list, 1..5 = grid stages
    query: "",
    collapsed: new Set(),   // folder ids whose children are hidden in the tree
    selection: persistentSelection(data),   // selected work ids — persists across nav (§C.6, B6)
    selFolders: new Set(),  // selected FOLDER ids (single-click / ⌘-click / Shift-range / marquee); double-click opens
    lastIdx: -1,            // anchor for Shift-click range (files)
    lastFolderIdx: -1,      // anchor for Shift-click range (folders — its own list, own order)
    // P27/P34/P38 (2026-08-31): the retired Type/Channel/Uploader/Tag/Date facet dropdowns are
    // replaced by ONE modifier rail — search-modifiers.js shapes ({kind:'reserved',key,value} or
    // {kind:'tag',type,value}), committed by typing ext:/by:/channel:/hastag:/tag:/before:/after:/
    // in: + Enter, by accepting an autocomplete suggestion, or by clicking a tag (P38's two click
    // surfaces). A modifier alone filters the CURRENT folder only (client-side, non-recursive); free
    // TEXT in the field searches deep (server-side, whole drive) — the rail vs. the field IS the
    // filter/search split now, not a hidden behavioural rule. Sort/Group stay as dropdowns (below) —
    // explicitly left out of the modifier grammar for now, still solid as-is.
    modifiers: [],
    sort: "latest",        // latest/oldest/name/size/type/uploader/date
    dir: "desc",           // sort direction
    group: "none",          // grid grouping: none/kind/type/uploader/date
    trash: false,           // the Trash smart-folder is open
    starred: false,         // the Starred quick-filter is on (flat grid of starred works)
    showHidden: false,      // reveal hidden/utility works in the library view (#55)
    // the file whose details viewer is open — mirrored into the URL (?file=) so a reload / link
    // restores the open file; set only if the id actually exists in this bundle.
    openFileId: (view.fileId && (data.files || []).some((w) => w.id === view.fileId)) ? view.fileId : null,
    // P24: cache of the last server-side search (search_files) — { sig, items, total, offset,
    // loading, error }. Only used live for a text/modifier search; browse + demo stay client-side.
    srv: null,
  };
  // trashed rows shown in the Trash view: seeded from the demo fixture, refreshed from
  // the DB on entering Trash in live mode, and kept in sync by the row actions.
  if (!data._trash) data._trash = (data.trash || []).slice();

  const personal = data.source === "personal";
  // P9: a shared folder (K9 link) renders through this SAME explorer, read-only + standalone —
  // same toolbar/filters/search/view-modes/selection as the real file browser, just no rail, no
  // folder tree, no storage footer, no upload/new-folder, and no per-card owner menu. The
  // shared:true flag (set by loadSharedFolder) gates all of that below.
  const shared = !!data.shared;
  const pane = el(".pane");
  const tree = shared ? null : el("nav.filetree", { "data-tree": personal ? "personal" : "server" });
  // B28: the folder-tree column is resizable — a drag handle between it and the pane; the width
  // is remembered in localStorage across mounts/reloads.
  if (tree) { let w = 0; try { w = parseInt(localStorage.getItem("eski-treew") || "", 10); } catch { /* private mode */ } if (w >= 150 && w <= 460) tree.style.width = w + "px"; }
  const resizer = tree ? el(".exresizer", { "aria-hidden": "true", title: "Drag to resize" }) : null;
  // C29: the docked info panel — a right column, always mounted (not on a shared view) but hidden
  // until the toolbar ⓘ / the `i` key toggles `.hasinfo` on the layout. Toggling doesn't rebuild the
  // layout (rerender only repaints the pane), so the toggle flips a class + repaints the panel in place.
  const infopanel = shared ? null : el(".exinfo");
  const layout = el(".explayout" + (shared ? ".shared" : "") + (infopanel && state.infoOpen ? " hasinfo" : ""), { "data-source": shared ? "shared" : (personal ? "personal" : "server") }, (shared ? [pane] : [tree, resizer, pane, infopanel]).filter(Boolean));
  state._infopanel = infopanel;
  state._toggleInfo = () => {
    if (!infopanel) return;
    state.infoOpen = !state.infoOpen;
    layout.classList.toggle("hasinfo", state.infoOpen);
    if (state.infoOpen) state._updateInfo?.();
    document.querySelectorAll(".hdctl .infobtn").forEach((b) => { b.classList.toggle("on", state.infoOpen); b.title = state.infoOpen ? "Hide details" : "Show details"; });
  };
  if (tree && resizer) {
    resizer.addEventListener("pointerdown", (e) => {
      e.preventDefault(); resizer.setPointerCapture?.(e.pointerId); resizer.classList.add("drag");
      const left = tree.getBoundingClientRect().left;
      const move = (ev) => { tree.style.width = Math.max(150, Math.min(460, ev.clientX - left)) + "px"; };
      const up = (ev) => {
        resizer.releasePointerCapture?.(ev.pointerId); resizer.classList.remove("drag");
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        try { localStorage.setItem("eski-treew", String(parseInt(tree.style.width, 10) || 212)); } catch { /* private mode */ }
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }
  // Drag files anywhere onto the explorer → the upload sheet, targeting the current folder
  // (getOpts reads state.folderId live). A `.dropping` overlay hints the target. Not on a
  // read-only shared view.
  if (!shared) enableDropUpload(layout, () => (personal
    ? { visibility: "private", onDone: () => reload() }
    : { visibility: "server", serverId: data.server.id, folderId: state.folderId, onDone: () => reload() }));

  // Server mount keeps the channel column beside the browser (Files is a channel,
  // never a dead-end). The personal My-files mount hides it — its own tree is the
  // navigation and it carries no server chrome (CANON §C.6). A shared view is standalone
  // (no rail) but gets a read-only header (brand · Request-to-join for a server folder).
  if (shared) {
    // The screen is row-flex (rail + browser); a shared view has no rail, so stack the read-only
    // header full-width on top and let the browser fill below.
    screen.setAttribute("data-screen", "sharedfolder");
    screen.style.cssText = "display:flex;flex-direction:column;height:100vh";
    layout.style.flex = "1"; layout.style.minHeight = "0";
    screen.append(sharedHeader(data), layout);
  }
  else if (personal) screen.append(layout);
  else screen.append(channelColumn(data, { filesActive: true }), layout);

  // Keep the URL in step with the view (folder · open file · view-mode). A FOLDER change pushes a
  // history entry (Back walks up the folder path, the expected file-browser gesture); everything
  // else (open/close a file, switch view mode) replaces in place. Bails when we've navigated off the
  // explorer, so a close-on-nav can't clobber the new route's URL. `shared` views keep their token
  // URL untouched.
  let lastFolder = state.folderId;
  function syncUrl() {
    if (shared) return;
    if (location.pathname !== explorerBase(data)) return;
    const desired = explorerUrl(data, { folderId: state.folderId, fileId: state.openFileId, mode: state.mode, density: state.density });
    if (desired === location.pathname + location.search) return;
    const push = state.folderId !== lastFolder;
    history[push ? "pushState" : "replaceState"]({}, "", desired);
    lastFolder = state.folderId;
  }
  state._syncUrl = syncUrl;

  // P24: run a server-side search (search_files) for `sig`/`args`, caching onto state.srv; a stale
  // result (superseded by a newer query) is discarded via the token. `append` pages more in. On
  // error, items=null → contents() falls back to the client-side filter over the loaded works.
  let srvToken = 0;
  async function runServerSearch(sig, args, append) {
    const my = ++srvToken;
    const prevItems = (append && state.srv?.sig === sig) ? (state.srv.items || []) : [];
    const offset = append ? prevItems.length : 0;
    state.srv = { sig, args, items: prevItems, total: state.srv?.total || 0, offset, loading: true, error: false };
    if (!append) repaintBody();   // show the loading state immediately for a fresh query
    try {
      const starredIds = new Set((data.files || []).filter((f) => f.starred).map((f) => f.id));
      const { total, items } = await searchFiles({ ...args, membersById: data.membersById || {}, starredIds, limit: 60, offset });
      if (my !== srvToken) return;   // a newer search superseded this one
      state.srv = { sig, args, items: [...prevItems, ...items], total, offset: prevItems.length + items.length, loading: false, error: false };
    } catch (e) {
      if (my !== srvToken) return;
      console.error("[eski search] server search failed, falling back to client:", e);
      state.srv = { sig, args, items: null, total: 0, offset: 0, loading: false, error: true };
    }
    repaintBody();
  }
  state._runServerSearch = runServerSearch;

  const rerender = () => { paint(tree, pane, data, state, rerender); syncUrl(); };
  rerender();
  // Restore an open file from the URL (?file=) on a deep link / reload / back-forward. openFile is
  // built inside contents() during paint and exposed as state._openFile, so it's ready after the
  // first rerender(); it re-opens the details viewer (and, via B14, adopts still-playing media).
  if (state.openFileId) { const w = (data.files || []).find((x) => x.id === state.openFileId); if (w) state._openFile?.(w); }

  // Table-stakes file-explorer keys (Finder/Drive/Windows): Esc clears the selection, ⌘/Ctrl-A
  // selects all in view, Enter opens the selection (folder → into it, file → the viewer), Delete
  // trashes the selected files. "Up a folder" is already Backspace/Back via the folder pushState
  // (B25), so it isn't rebound here. A single self-cleaning document listener.
  // C1 · arrow-key roving navigation of the grid/list. Operates on the live DOM order of the
  // selectable cards (folders-then-files, groups included), using geometry (getBoundingClientRect)
  // so Up/Down find the visually-above/below tile in a responsive multi-column grid and degrade to
  // prev/next in the single-column list. Left/Right are flat prev/next. A plain arrow moves the
  // selection to one item (Drive/Finder); Shift+arrow extends a range from the anchor (mixed
  // folder+file, which the selection model already supports). state.cursor/state.anchor hold the
  // roving focus + range anchor as {kind,id}.
  const navNodes = () => {
    const b = document.querySelector(".panebody"); if (!b) return [];
    return [...b.querySelectorAll("[data-id],[data-folder-id]")].map((node) => ({
      node, id: node.dataset.id || node.dataset.folderId, kind: node.dataset.folderId ? "folder" : "file",
    }));
  };
  const cursorIndex = (nodes) => {
    if (state.cursor) { const i = nodes.findIndex((n) => n.kind === state.cursor.kind && n.id === state.cursor.id); if (i >= 0) return i; }
    // fall back to the first currently-selected item, else the first item
    const i = nodes.findIndex((n) => (n.kind === "file" ? state.selection : state.selFolders).has(n.id));
    return i >= 0 ? i : (nodes.length ? 0 : -1);
  };
  const rowTarget = (nodes, cur, dir) => {
    // dir: -1 up, +1 down. Find the nearest row in that direction, then the tile whose horizontal
    // centre is closest to the current tile's centre. Threshold guards against same-row jitter.
    const cr = nodes[cur].node.getBoundingClientRect();
    const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = -1, bestTop = null, bestDx = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (i === cur) continue;
      const r = nodes[i].node.getBoundingClientRect();
      const ry = r.top + r.height / 2;
      if (dir < 0 ? ry >= cy - 4 : ry <= cy + 4) continue;      // must be in the target direction
      const rowKey = Math.round(r.top);
      if (bestTop === null) bestTop = rowKey;                    // first candidate row seen defines the nearest row
      else if (dir < 0 ? rowKey > bestTop : rowKey < bestTop) bestTop = rowKey;
    }
    if (bestTop === null) return -1;
    for (let i = 0; i < nodes.length; i++) {
      if (i === cur) continue;
      const r = nodes[i].node.getBoundingClientRect();
      if (Math.round(r.top) !== bestTop) continue;
      const dx = Math.abs((r.left + r.width / 2) - cx);
      if (dx < bestDx) { bestDx = dx; best = i; }
    }
    return best;
  };
  const arrowNav = (e, dir, axis) => {
    const nodes = navNodes(); if (!nodes.length) return;
    e.preventDefault();
    let cur = cursorIndex(nodes);
    if (cur < 0) return;
    // if nothing is focused yet, the first arrow just adopts the current cursor item (don't jump past it)
    const hadCursor = state.cursor && nodes.some((n) => n.kind === state.cursor.kind && n.id === state.cursor.id);
    let target = cur;
    if (hadCursor || state.selection.size || state.selFolders.size) {
      target = axis === "x" ? Math.min(nodes.length - 1, Math.max(0, cur + dir)) : rowTarget(nodes, cur, dir);
      if (target < 0) target = cur;   // no row above/below → stay
    }
    const t = nodes[target];
    state.cursor = { kind: t.kind, id: t.id };
    if (e.shiftKey) {
      // extend from the anchor; if the selection was started by a click (no arrow anchor yet), the
      // pre-move focus is the anchor.
      if (!state.anchor) state.anchor = { kind: nodes[cur].kind, id: nodes[cur].id };
      const ai = nodes.findIndex((n) => n.kind === state.anchor.kind && n.id === state.anchor.id);
      const [lo, hi] = ai <= target ? [ai, target] : [target, ai];
      state.selection.clear(); state.selFolders.clear();
      for (let i = Math.max(0, lo); i <= hi; i++) (nodes[i].kind === "file" ? state.selection : state.selFolders).add(nodes[i].id);
    } else {
      state.selection.clear(); state.selFolders.clear();
      (t.kind === "file" ? state.selection : state.selFolders).add(t.id);
      state.anchor = { kind: t.kind, id: t.id };
    }
    state._refresh?.();
    t.node.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  // C2 · type-ahead — start typing a name and the matching item is selected + scrolled to (Drive/
  // Finder). A short buffer collects consecutive keystrokes (reset ~800ms after the last); typing the
  // SAME letter repeatedly cycles through items with that initial. Reads the visible name off each
  // card (.fname in grid, .flnm in list) so it works in every density. Because letters drive this,
  // the file browser has no other bare-letter shortcut (the info panel toggles from its ⓘ button).
  let taBuf = "", taTimer = null;
  const typeahead = (ch) => {
    const nodes = navNodes(); if (!nodes.length) return;
    clearTimeout(taTimer); taTimer = setTimeout(() => { taBuf = ""; }, 800);
    taBuf += ch.toLowerCase();
    const nameOf = (n) => (n.node.querySelector(".fname,.flnm")?.textContent || "").trim().toLowerCase();
    let idx = nodes.findIndex((n) => nameOf(n).startsWith(taBuf));
    if (idx < 0 && taBuf.length > 1 && [...taBuf].every((c) => c === taBuf[0])) {   // repeated letter → cycle
      taBuf = taBuf[0];
      const cur = Math.max(0, cursorIndex(nodes));
      for (let k = 1; k <= nodes.length; k++) { const j = (cur + k) % nodes.length; if (nameOf(nodes[j]).startsWith(taBuf)) { idx = j; break; } }
    }
    if (idx < 0) return;
    const t = nodes[idx];
    state.cursor = { kind: t.kind, id: t.id }; state.anchor = { kind: t.kind, id: t.id };
    state.selection.clear(); state.selFolders.clear();
    (t.kind === "file" ? state.selection : state.selFolders).add(t.id);
    state._refresh?.();
    t.node.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const onKey = (e) => {
    if (!screen.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (document.querySelector(".sheet")) return;   // the details overlay owns keys while open
    if (document.querySelector(".menu.open, .modal")) return;   // a menu/dialog owns keys while open
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    if (e.key === "ArrowLeft") { arrowNav(e, -1, "x"); }
    else if (e.key === "ArrowRight") { arrowNav(e, 1, "x"); }
    else if (e.key === "ArrowUp") { arrowNav(e, -1, "y"); }
    else if (e.key === "ArrowDown") { arrowNav(e, 1, "y"); }
    else if (e.key === "Escape" && (state.selection.size || state.selFolders.size)) { state.selection.clear(); state.selFolders.clear(); state.lastIdx = -1; state.lastFolderIdx = -1; state.cursor = null; state.anchor = null; state._refresh?.(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {   // ⌘A — select every item (files + folders), C18
      e.preventDefault();
      for (const w of state._files || []) state.selection.add(w.id);
      document.querySelectorAll(".panebody [data-folder-id]").forEach((n) => state.selFolders.add(n.dataset.folderId));
      state._refresh?.();
    }
    else if (e.key === "Enter") {   // open the selection: a folder walks in, a file opens the viewer
      if (state.selFolders.size === 1) { e.preventDefault(); state.folderId = [...state.selFolders][0]; state.selFolders.clear(); state.query = ""; rerender(); }
      else { const sel = (state._files || []).filter((w) => state.selection.has(w.id)); if (sel.length) { e.preventDefault(); state._openFile?.(sel[0]); } }
    }
    else if ((e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) && state.selection.size && !data.shared) {   // Delete / ⌘⌫ → trash the selected files
      e.preventDefault(); trashSelected(data, state, rerender);
    }
    else if (e.key === " " && document.activeElement === document.body) {   // C33: Quick Look — Space previews the selected file
      const sel = (state._files || []).filter((w) => state.selection.has(w.id));
      if (sel.length === 1 && !state.selFolders.size) { e.preventDefault(); state._openFile?.(sel[0]); }
    }
    else if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement === document.body) {   // C2: type-ahead
      typeahead(e.key);
    }
  };
  document.addEventListener("keydown", onKey);
  return screen;
}

// The standalone header above a shared-folder view (P9): the eski wordmark, a read-only note,
// and — for a shared SERVER folder — a Request-to-join button (no invite needed). No rail.
function sharedHeader(data) {
  const acts = el(".svacts");
  if (data.serverId) {
    const reqBtn = Button({ label: `Request to join ${data.serverName || "server"}`, variant: "primary", icon: "plus" });
    reqBtn.addEventListener("click", async () => {
      reqBtn.disabled = true;
      try {
        const st = await requestToJoin(data.serverId);
        if (st === "member") { toast({ message: "You're already a member", icon: "check" }); navigate(isDemoQS() ? `/s/${data.serverId}?demo=1` : `/s/${data.serverId}`); return; }
        reqBtn.replaceChildren(iconEl("check", "sm"), document.createTextNode("Request sent"));
        toast({ message: "Request sent — an admin will review it", icon: "check" });
      } catch (e) { reqBtn.disabled = false; toast({ message: e?.message || "Couldn't send the request" }); }
    });
    acts.append(reqBtn);
  }
  return el("header.svhd", {}, [el(".brand", {}, ["eski"]), el(".svctx", {}, ["Shared folder · read-only"]), acts]);
}

// what the tree root / breadcrumb root reads as, and where a folder link points
function rootLabel(data) { return data.rootLabel || (data.source === "personal" ? "My files" : data.server?.name || "Files"); }
// The explorer route's own base path (server files vs personal My-files).
function explorerBase(data) { return data.source === "server" ? `/s/${data.server?.id}/files` : "/files"; }
// The URL for a given explorer VIEW STATE. Folder + open file + view-mode live in the query so the
// address bar reflects where you are — reload / back-forward restore it (main.js reads these back)
// and a copied link opens the same folder/file. `demo=1` is carried through when present.
function explorerUrl(data, { folderId, fileId, mode, density } = {}) {
  const q = new URLSearchParams();
  if (folderId) q.set("folder", folderId);
  if (fileId) q.set("file", fileId);
  const vp = viewParam(mode, density);   // P32: list | d1..d5 (default grid omitted)
  if (vp) q.set("view", vp);
  if (isDemoQS()) q.set("demo", "1");
  const s = q.toString();
  return explorerBase(data) + (s ? `?${s}` : "");
}
function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }

// A small date parser for the before:/after: modifiers — a relative "7d"/"30d" (days back from
// now) or an absolute date the Date constructor understands (2026-08-01). Returns null when it
// can't parse, so a bad value quietly filters nothing rather than throwing.
function parseModDate(v) {
  const rel = String(v).trim().match(/^(\d+)\s*d(ays?)?$/i);
  if (rel) return new Date(Date.now() - Number(rel[1]) * 86400000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
// by:/channel:/before:/after:/in: are always a CLIENT-SIDE post-filter, whether `files` came from
// search_files or the loaded fallback — search_files carries no params for them yet (K12 is the
// place to move them server-side at scale; not this pass, see the TODO note left for it).
function applyClientOnlyModifiers(files, mods, data) {
  let out = files;
  if (mods.by) out = out.filter((w) => (w.who?.name || "").toLowerCase() === mods.by.toLowerCase());
  if (mods.channel) out = out.filter((w) => (w.channelName || "").toLowerCase() === mods.channel.toLowerCase());
  if (mods.before) { const cut = parseModDate(mods.before); if (cut) out = out.filter((w) => new Date(w.created_at || 0) < cut); }
  if (mods.after) { const cut = parseModDate(mods.after); if (cut) out = out.filter((w) => new Date(w.created_at || 0) >= cut); }
  if (mods.inFolder) {
    const target = (data.folders || []).find((f) => f.name.toLowerCase() === mods.inFolder.toLowerCase());
    if (target) {
      const scope = new Set([target.id, ...descendantFolderIds(data.folders, target.id)]);
      out = out.filter((w) => scope.has(w.folderId));
    }
  }
  return out;
}

// ── the folder tree (left) ───────────────────────────────────────────────────
function paintTree(tree, data, state, rerender) {
  const { folders, storage } = data;
  const childrenOf = (pid) => folders.filter((f) => (f.parentId || null) === pid);

  const hd = el(".fthd", {}, [data.source === "personal" ? "My files" : "Files",
    el("button.iconbtn.sm.newFolderBtn", { title: "New folder", onClick: () => newFolder(data, state, rerender, state.folderId) }, [iconEl("plus", "sm")]),
  ]);

  const rows = [];
  // the root row (lvl0), then the nested folders under it
  const rootOn = state.folderId == null && !state.trash;
  rows.push(treeRow({
    label: rootLabel(data), level: 0, on: rootOn, hasKids: childrenOf(null).length > 0,
    open: !state.collapsed.has("__root__"),
    onToggle: () => { toggle(state.collapsed, "__root__"); rerender(); },
    onOpen: () => { state.folderId = null; state.trash = false; rerender(); },
  }));
  if (!state.collapsed.has("__root__")) walk(null, 1);

  function walk(pid, level) {
    for (const f of childrenOf(pid)) {
      const kids = childrenOf(f.id);
      const open = !state.collapsed.has(f.id);
      rows.push(treeRow({
        label: f.name, level, on: state.folderId === f.id && !state.trash, hasKids: kids.length > 0, open,
        locked: f.locked, archived: f.archived,
        onToggle: () => { toggle(state.collapsed, f.id); rerender(); },
        onOpen: () => { state.folderId = f.id; state.query = ""; state.trash = false; rerender(); },
      }));
      if (open && kids.length) walk(f.id, level + 1);
    }
  }

  // Trash + storage footer pinned to the foot
  const bottom = el(".ftbottom", {}, [
    el(".ftsep"),
    treeRow({ label: "Trash", level: 0, icon: "trash", meta: "30d", on: state.trash, onOpen: () => enterTrash(data, state, rerender) }),
    storageFoot(data, storage),
  ]);

  tree.replaceChildren(hd, ...rows, bottom);
}

function treeRow({ label, level = 0, on, hasKids, open, locked, archived, icon = "folder", meta, onToggle, onOpen }) {
  const cls = `ftrow lvl${Math.min(level, 3)}` + (on ? " on" : "") + (hasKids ? (open ? " open" : "") : "") + (archived ? " archived" : "");
  const row = el(`button.${cls.split(" ").join(".")}`, { onClick: onOpen });
  if (hasKids) {
    const tw = iconEl("chev", "sm"); tw.classList.add("tw");
    tw.addEventListener("click", (e) => { e.stopPropagation(); onToggle?.(); });
    row.append(tw);
  } else {
    row.append(el("span.tw"));
  }
  const fic = iconEl(icon, "sm"); fic.classList.add("fic");
  row.append(fic, el("span.fn", {}, [label]));
  if (locked) { const l = iconEl("lock", "sm"); l.classList.add("ftlock"); l.setAttribute("title", "Locked, read-only"); row.append(l); }
  if (meta) row.append(el("span.ftmeta", { title: "Items auto-delete 30 days after they're trashed" }, [meta]));
  return row;
}

function storageFoot(data, storage) {
  const personal = data.source === "personal";
  const pct = storage.capBytes ? Math.min(100, Math.round((storage.usedBytes / storage.capBytes) * 100)) : 0;
  const usedGb = (storage.usedBytes / 1024 ** 3);
  const usedLbl = usedGb < 10 ? usedGb.toFixed(usedGb < 1 ? 2 : 1) : Math.round(usedGb);
  const sic = iconEl(personal ? "user" : "server", "sm"); sic.style.verticalAlign = "-2px"; sic.style.color = "var(--muted)";
  return el(".ftfoot", {}, [
    sic, personal ? " Your storage" : " This server's storage",
    el(".bar", {}, [el("i", { style: `width:${pct}%` })]),
    `${usedLbl} of ${storage.capGb} GB used · `,
    el("button.manageStorageLink", { style: "color:var(--soft);text-decoration:underline", onClick: () => toast({ message: "Storage & billing (P8)" }) }, ["manage"]),
  ]);
}

// ── the pane (breadcrumb · toolbar · contents) ───────────────────────────────
function paint(tree, pane, data, state, rerender) {
  if (tree) paintTree(tree, data, state, rerender);   // no tree/storage-footer on a shared view (P9)

  if (state.trash) { paintTrash(pane, data, state, rerender); return; }

  const searching = state.query.trim().length > 0;

  // breadcrumb (browsing) OR a search-results indicator (searching)
  const crumbs = el(".crumbs", { id: "exCrumbs" });
  const path = crumbPath(data.folders, state.folderId);
  // P13: the crumb root. On a SERVER file browser the server name is redundant (the channel column
  // already names the server) → drop it to a folder glyph (still clicks to root). Personal/shared
  // keep the text root ("My files" / the shared folder name) — it's the meaningful identity there.
  crumbs.append(data.source === "server"
    ? el("button.crumbroot.home", { title: rootLabel(data), "aria-label": rootLabel(data), onClick: () => { state.folderId = null; rerender(); } }, [iconEl("folder", "sm")])
    : el("button.crumbroot", { onClick: () => { state.folderId = null; rerender(); } }, [rootLabel(data)]));
  // C30: a deep path collapses its MIDDLE crumbs into a "…" menu so it never wraps/clips — root › … ›
  // parent › current (Windows/Drive). The last two folders always stay visible; everything between
  // root and them goes behind the overflow button. Shallow paths render in full.
  const sep = () => crumbs.append(el("span.sl", {}, ["/"]));
  const crumbBtn = (f) => crumbs.append(el("button", { onClick: () => { state.folderId = f.id; rerender(); } }, [f.name]));
  const crumbCur = (f) => crumbs.append(el("b", {}, [f.name]));
  const MAXCRUMB = 3;   // trailing folders shown before the path collapses
  if (path.length <= MAXCRUMB) {
    path.forEach((f, i) => { sep(); (i === path.length - 1 ? crumbCur : crumbBtn)(f); });
  } else {
    const hidden = path.slice(0, -2), tail = path.slice(-2);
    sep();
    crumbs.append(el("button.crumbmore", { title: "Show path", "aria-label": "Show hidden folders", onClick: (e) =>
      openMenu(e.currentTarget, hidden.map((f) => ({ label: f.name, icon: "folder", onClick: () => { state.folderId = f.id; rerender(); } }))) }, ["…"]));
    tail.forEach((f, i) => { sep(); (i === tail.length - 1 ? crumbCur : crumbBtn)(f); });
  }
  // The query term is a live ref: repaintBody() (search-as-you-type) updates it, since the
  // searchState node is built once here but shown on every keystroke (else it read stale/empty).
  const searchQ = el("b", {}, [state.query]);
  const searchState = el(".crumbs.exsearchstate", {}, [
    (() => { const s = iconEl("search", "sm"); s.style.color = "var(--muted)"; return s; })(),
    el("span", {}, ["Search results for ", searchQ]),
    el("button.btn.ghost.sm", { onClick: () => { state.query = ""; rerender(); } }, ["Clear search"]),
  ]);

  // P32: the density slider replaces the Grid/List dropdown. Position 0 = List; 1..5 = grid stages
  // (small→large). It flanks a rows-icon (dense) and a grid-icon (large) so the direction reads. A
  // change to/from 0 flips the layout (list↔grid) so it needs a full rerender; a grid-stage change
  // only needs to re-lay the grid, but rerender is cheap here (client-side, one held dataset) and
  // keeps the URL/sort/group state in sync, so we rerender throughout.
  const densityPos = () => (state.mode === "list" ? 0 : state.density);
  const densityInput = el("input.densityrange", {
    type: "range", min: "0", max: "5", step: "1", value: String(densityPos()),
    "aria-label": "View density", title: "View density",
    onInput: (e) => {
      const v = +e.target.value;
      if (v === 0) state.mode = "list";
      else { state.mode = "large"; state.density = v; }
      rerender();
    },
  });
  const viewBtn = el(".densityctl", { title: "View density" }, [
    el("span.dic.dsm", { "aria-hidden": "true", title: "Compact / list" }, [iconEl("grid", "sm")]),
    densityInput,
    el("span.dic.dlg", { "aria-hidden": "true", title: "Large thumbnails" }, [iconEl("grid", "sm")]),
  ]);
  // Show-hidden (#55): a tucked toggle — hidden/utility works are omitted from the library
  // view unless this is on. It reveals them (dimmed); it does not rebuild the toolbar.
  const hiddenBtn = el("button.iconbtn" + (state.showHidden ? ".on" : ""), { title: state.showHidden ? "Hiding hidden files" : "Show hidden files", "aria-pressed": state.showHidden ? "true" : "false", onClick: () => { state.showHidden = !state.showHidden; hiddenBtn.classList.toggle("on", state.showHidden); hiddenBtn.setAttribute("aria-pressed", state.showHidden ? "true" : "false"); hiddenBtn.setAttribute("title", state.showHidden ? "Hiding hidden files" : "Show hidden files"); repaintBody(); } }, [iconEl("hide", "sm")]);
  // P13 (V2 + owner tweaks): a slim dedicated path line up top (the clear "path viewer"). The
  // view/hidden controls move DOWN into the toolbar (below), so nothing but the breadcrumb lives
  // on this row.
  const pathline = el(".expath", {}, [searching ? searchState : crumbs]);

  // toolbar — search (+ its autocomplete helper + the filter rail below) · Sort/Group · New folder · Upload
  const personal = data.source === "personal";
  const { wrap: search } = searchWidget(data, state, () => repaintBody());
  // onDone reloads the route so a just-uploaded file (or a whole uploaded folder) shows
  // immediately — the explorer data is cached per render, so without a refetch the new work
  // wouldn't appear until a manual reload (owner bug: "reload needed for things to update").
  const uploadOpts = data.shared ? null : (personal
    ? { visibility: "private", onDone: () => reload() }
    : { visibility: "server", serverId: data.server.id, folderId: state.folderId, onDone: () => reload() });

  const serverSource = data.source === "server";

  // Sort + Group (owner 2026-08-31). The Type/Channel/Uploader/Tag/Date filter dropdowns are RETIRED
  // — filtering moves to the search bar's modifiers (bpm:120 / hastag:key / …). Sorting is a single
  // Sort-by dropdown in GRID view (in LIST view you click a column header instead, so it drops away),
  // and a Group-by dropdown buckets the grid under headers.
  const SORT_OPTS = [
    ["latest", "desc", "Newest"], ["oldest", "asc", "Oldest"],
    ["name", "asc", "Name (A–Z)"], ["name", "desc", "Name (Z–A)"],
    ["size", "desc", "Largest"], ["size", "asc", "Smallest"],
    ["type", "asc", "File type"],
    ...(serverSource ? [["uploader", "asc", "Uploader"]] : []),
  ];
  const sortLbl = () => (SORT_OPTS.find(([s, d]) => s === state.sort && d === state.dir) || [, , "Sort"])[2];
  const sortByBtn = el("button.btn", { "aria-haspopup": "menu" }, [iconEl("sort", "sm"), el("span.slbl", {}, [sortLbl()]), iconEl("chev", "sm")]);
  sortByBtn.addEventListener("click", () => openMenu(sortByBtn, SORT_OPTS.map(([s, d, lbl]) => ({ label: lbl, selected: state.sort === s && state.dir === d, onClick: () => { state.sort = s; state.dir = d; sortByBtn.querySelector(".slbl").textContent = lbl; repaintBody(); } }))));

  const GROUP_OPTS = [["none", "No grouping"], ["kind", "Kind"], ["type", "File type"], ...(serverSource ? [["uploader", "Uploader"]] : []), ["date", "Date added"]];
  const GROUP_LBL = Object.fromEntries(GROUP_OPTS);
  const groupByBtn = el("button.btn" + (state.group !== "none" ? ".on" : ""), { "aria-haspopup": "menu" }, [iconEl("grid", "sm"), el("span.glbl", {}, [state.group === "none" ? "Group" : GROUP_LBL[state.group]]), iconEl("chev", "sm")]);
  groupByBtn.addEventListener("click", () => openMenu(groupByBtn, GROUP_OPTS.map(([g, lbl]) => ({ label: lbl, selected: state.group === g, onClick: () => { state.group = g; groupByBtn.querySelector(".glbl").textContent = g === "none" ? "Group" : lbl; groupByBtn.classList.toggle("on", g !== "none"); repaintBody(); } }))));

  // Starred quick-filter: a plain star toggle in line with the controls; gold when active. When on,
  // the pane shows a flat grid of every starred work (like a smart-folder).
  const starFilterBtn = el("button.iconbtn.exstar" + (state.starred ? ".on" : ""), { title: "Starred", "aria-pressed": state.starred ? "true" : "false", onClick: () => { state.starred = !state.starred; starFilterBtn.classList.toggle("on", state.starred); starFilterBtn.setAttribute("aria-pressed", state.starred ? "true" : "false"); repaintBody(); } }, [iconEl("star", "sm")]);

  // C29: the info-panel toggle (an ⓘ). Reads state.infoOpen; a rerender rebuilds the layout with/
  // without the docked panel. Not on a read-only shared view.
  const infoBtn = data.shared ? null : el("button.iconbtn.infobtn" + (state.infoOpen ? ".on" : ""),
    { title: state.infoOpen ? "Hide details" : "Show details", "aria-pressed": state.infoOpen ? "true" : "false", onClick: () => state._toggleInfo?.() }, [iconEl("info", "sm")]);
  // Grid shows Sort/Group dropdowns; list has neither (its column headers sort). Search stays LEFT;
  // controls group to the RIGHT (`.tbfilters` margin-left:auto).
  const gridControls = state.mode === "list" ? [] : [sortByBtn, groupByBtn];
  const toolbar = el(".toolbar", {}, [
    search,
    el(".tbfilters", {}, [
      ...gridControls, starFilterBtn,
      el(".hdctl", {}, [infoBtn, hiddenBtn, viewBtn].filter(Boolean)),
    ].filter(Boolean)),
  ]);

  // B32: the bulk-action bar OVERLAYS the toolbar instead of taking its own row — a bar that pushed
  // the body (and every icon) down the moment a second item was picked read as the whole grid
  // "jumping." Nested as an absolutely-positioned child of the (position:relative) toolbar, it covers
  // the filters edge-to-edge while selecting and costs zero layout. Drive does the same.
  const selbar = el(".selbar");
  toolbar.append(selbar);
  const body = el(".panebody");
  // P13 (owner tweak): New folder + Upload live at the pane's bottom-right (Drive-style), floating
  // over the grid — not on a read-only shared view (P9). Square eski buttons: plain New folder +
  // primary Upload. The pane is position:relative so this anchors to its bottom-right corner and
  // stays put while the body scrolls; the body gets bottom padding so the last row clears it.
  const fab = data.shared ? null : el(".exfab", {}, [
    el("button.btn.newFolderBtn", { onClick: () => newFolder(data, state, rerender, state.folderId) }, [iconEl("plus", "sm"), "New folder"]),
    el("button.btn.primary", { onClick: () => openUpload(uploadOpts) }, [iconEl("plus", "sm"), "Upload"]),
  ]);
  pane.classList.toggle("hasfab", !!fab);
  // C17: a quiet status strip at the pane foot — item count at rest, "N selected · size" on select,
  // and the current sort on the right. Updated by updateStatus() from refreshSel (fires on selection
  // change and after every repaintBody). Lives between the body and the floating fab.
  const statusbar = el(".exstatus");
  // P27/P34/P38: the filter rail — one chip per committed modifier, in --mod colour, only present
  // once you have 1+ (no chip = no extra row, same "costs zero layout at rest" principle as the
  // status strip). This is what makes the filter/search split VISIBLE: chip = filter, whatever's
  // still typed in the field = search text.
  const modrail = el(".exmods");
  function updateMods() {
    if (!state.modifiers.length) { modrail.replaceChildren(); modrail.hidden = true; return; }
    modrail.hidden = false;
    modrail.replaceChildren(...state.modifiers.map((mod) => modChip(mod, {
      onRemove: (m) => { state.modifiers = state.modifiers.filter((x) => !sameModifier(x, m)); repaintBody(); },
    })));
  }
  state._updateMods = updateMods;
  updateMods();
  pane.replaceChildren(...[pathline, toolbar, modrail, body, statusbar, fab].filter(Boolean));
  function updateStatus() {
    const items = body.querySelectorAll("[data-id], [data-folder-id]").length;
    const n = state.selection.size;
    let left;
    if (n) {
      const bytes = (state._files || []).filter((w) => state.selection.has(w.id)).reduce((s, w) => s + (w.bytes || 0), 0);
      left = el("span.stsel", {}, [`${n} selected${bytes ? " · " + fmtBytes(bytes) : ""}`]);
    } else {
      left = el("span", {}, [`${items} item${items === 1 ? "" : "s"}`]);
    }
    const sortName = { latest: "Newest", oldest: "Oldest", name: "Name", size: "Size", type: "Type", uploader: "Uploader", date: "Date" }[state.sort] || "Newest";
    statusbar.replaceChildren(left, el("span.sp"), el("span.stsort", {}, [iconEl("sort", "sm"), sortName]));
  }
  state._updateStatus = updateStatus;
  // C29: repaint the docked info panel from the live selection.
  function updateInfo() { const p = state._infopanel; if (p && state.infoOpen) p.replaceChildren(...buildInfoPanel(data, state, rerender)); }
  state._updateInfo = updateInfo;

  // B6: clicking an empty area of the pane (not a card, not the bulk bar) clears the selection —
  // the Google-Drive gesture. A card's own click handler stops here (closest('.card')). B10: a
  // marquee drag ends in a click on empty space too — `suppressClear` skips that one clear.
  let suppressClear = false;
  body.addEventListener("click", (e) => {
    if (suppressClear) { suppressClear = false; return; }
    if (e.target.closest("[data-id]") || e.target.closest("[data-folder-id]") || e.target.closest(".selbar")) return;
    if (state.selection.size || state.selFolders.size) { state.selection.clear(); state.selFolders.clear(); state.lastIdx = -1; state.lastFolderIdx = -1; refreshSel(); }
  });

  // P28: right-clicking EMPTY pane space opens a "New folder / Upload" menu at the cursor (the
  // card/folder contextmenus handle their own targets; this is the fallback for the background).
  // Read-only shared views (P9) get no menu.
  if (!data.shared) body.addEventListener("contextmenu", (e) => {
    if (e.target.closest("[data-id]") || e.target.closest("[data-folder-id]") || e.target.closest(".selbar") || e.target.closest(".exfab")) return;
    e.preventDefault();
    const at = { x: e.clientX, y: e.clientY };
    // C18: select-all / deselect-all / invert affordances, over BOTH files and folders (the DOM holds
    // the current folder's folder cards; state._files holds its files). Invert flips membership of every
    // visible item. Deselect only appears when something is selected.
    const allFolderIds = () => [...body.querySelectorAll("[data-folder-id]")].map((n) => n.dataset.folderId);
    const selectAll = () => { for (const w of state._files || []) state.selection.add(w.id); for (const id of allFolderIds()) state.selFolders.add(id); state._refresh?.(); };
    const deselectAll = () => { state.selection.clear(); state.selFolders.clear(); state._refresh?.(); };
    const invertSel = () => {
      const f = new Set(state.selection), fo = new Set(state.selFolders);
      state.selection.clear(); state.selFolders.clear();
      for (const w of state._files || []) if (!f.has(w.id)) state.selection.add(w.id);
      for (const id of allFolderIds()) if (!fo.has(id)) state.selFolders.add(id);
      state._refresh?.();
    };
    const hasSel = state.selection.size || state.selFolders.size;
    // C24: the desktop-style background menu (was just New folder + Upload). Sort/View open the same
    // option lists as the toolbar dropdowns, at the cursor. (Paste → with C4 cut/copy/paste; Group by
    // → with P33 — omitted until those land so no row is a dead control.)
    openMenu(null, [
      { label: "New folder", icon: "plus", onClick: () => newFolder(data, state, rerender, state.folderId) },
      { label: "Upload…", icon: "download", onClick: () => openUpload(uploadOpts) },
      { sep: true },
      { label: "Select all", icon: "check", onClick: selectAll },
      ...(hasSel ? [{ label: "Deselect all", icon: "x", onClick: deselectAll }] : []),
      { label: "Invert selection", icon: "square", onClick: invertSel },
      { sep: true },
      { label: "Sort by", icon: "sort", chev: true, onClick: () => openMenu(null, SORTS.map(([k, lbl]) => ({ label: lbl, selected: state.sort === k, onClick: () => { state.sort = k; repaintBody(); } })), { at }) },
      { label: "View", icon: "grid", chev: true, onClick: () => openMenu(null, Object.entries(VIEWS).map(([k, v]) => ({ label: v, selected: state.mode === k, onClick: () => { state.mode = k; rerender(); } })), { at }) },
      { sep: true },
      { label: "Refresh", icon: "refresh", onClick: () => reload() },
    ], { at });
  });

  // ── B10 · drag-to-select (marquee) + drag-a-file-onto-another → make a folder ──────────────
  // Marquee: a pointer drag starting on EMPTY pane space rubber-band-selects the cards it covers
  // (Shift/⌘ adds to the current selection). Native card drag is separate (starts on a card), so
  // the two don't fight. Both handlers live on the persistent `body` (survives a repaint).
  let dragIds = [];
  let dragFolderIds = [];   // folder(s) being dragged — separate from dragIds (files)
  if (!data.shared) {
    body.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("[data-id]") || e.target.closest("[data-folder-id]") || e.target.closest(".selbar") || e.target.closest(".exfab")) return;
      suppressClear = false;   // B15: never let a stale marquee flag eat this gesture's clear-click
      const start = { x: e.clientX, y: e.clientY };
      const startScrollTop = body.scrollTop;   // C20: rects are captured once, in THIS scroll position
      const additive = (e.shiftKey || e.metaKey || e.ctrlKey);
      const base = additive ? new Set(state.selection) : new Set();
      const baseFolders = additive ? new Set(state.selFolders) : new Set();
      // Owner 2026-08-31: the box must catch FOLDERS too, not just files — capture both, route each
      // rect by whether it's a folder ([data-folder-id]) or a file ([data-id]).
      const rects = [...body.querySelectorAll("[data-id],[data-folder-id]")].map((c) => ({ id: c.dataset.id, fid: c.dataset.folderId, r: c.getBoundingClientRect() }));
      const box = el(".marquee"); let moved = false;
      const move = (ev) => {
        const x = Math.min(ev.clientX, start.x), y = Math.min(ev.clientY, start.y);
        const w = Math.abs(ev.clientX - start.x), h = Math.abs(ev.clientY - start.y);
        if (!moved && w + h > 5) { moved = true; body.appendChild(box); }
        if (!moved) return;
        autoScroll(ev.clientY);   // C20: the pane auto-scrolls near its top/bottom edge, same as a native drag
        // rects were measured in viewport space at drag start; a since-then scroll moves every card by
        // the same delta, so shift the stale rects rather than re-measuring the whole grid every tick.
        const dy = body.scrollTop - startScrollTop;
        const br = body.getBoundingClientRect();
        box.style.cssText = `left:${x - br.left + body.scrollLeft}px;top:${y - br.top + body.scrollTop}px;width:${w}px;height:${h}px`;
        const sel2 = { left: x, top: y, right: x + w, bottom: y + h };
        state.selection.clear(); state.selFolders.clear();
        base.forEach((id) => state.selection.add(id)); baseFolders.forEach((id) => state.selFolders.add(id));
        for (const { id, fid, r } of rects) {
          const top = r.top - dy, bottom = r.bottom - dy;
          if (r.right < sel2.left || r.left > sel2.right || bottom < sel2.top || top > sel2.bottom) continue;
          if (fid != null) state.selFolders.add(fid); else state.selection.add(id);
        }
        refreshSel();
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        box.remove(); if (moved) suppressClear = true;   // don't let the trailing click wipe the marquee selection
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });

    // Native drag: a FILE card dropped onto another FILE makes a folder from them; onto a FOLDER
    // moves them in. A FOLDER card dropped onto another FOLDER reparents it (owner 2026-08-31); a
    // folder drag ignores a file target (no action there). Multi-drag when the grabbed card is part
    // of a 2+ selection (files → state.selection, folders → state.selFolders).
    body.addEventListener("dragstart", (e) => {
      const fcard = e.target.closest("[data-folder-id]");
      if (fcard) {
        const id = fcard.dataset.folderId;
        dragFolderIds = (state.selFolders.has(id) && state.selFolders.size > 1) ? [...state.selFolders] : [id];
        dragIds = [];
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", dragFolderIds.join(",")); } catch { /* Safari */ }
        try {
          const ghost = el(".dragghost", {}, [iconEl("folder", "sm")]);
          if (dragFolderIds.length > 1) ghost.append(el(".dgcount", {}, [String(dragFolderIds.length)]));
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 17, 17);
          setTimeout(() => ghost.remove(), 0);
        } catch { /* setDragImage unsupported → default ghost */ }
        return;
      }
      const card = e.target.closest("[data-id]");   // P14: a file element in any density
      if (!card) { dragIds = []; return; }
      const id = card.dataset.id;
      dragIds = (state.selection.has(id) && state.selection.size > 1) ? [...state.selection] : [id];
      dragFolderIds = [];
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragIds.join(",")); } catch { /* Safari */ }
      // B31: drag a small kind-icon token, NOT the full card thumbnail (owner: "miniaturized icons
      // every time"). Multi-drag shows the count. The ghost must be in the DOM when setDragImage
      // snapshots it, then it's removed on the next tick.
      try {
        const w = (data.files || []).find((f) => f.id === id);
        const ghost = el(".dragghost", {}, [iconEl(KIND_ICON[w?.kind] || "file", "sm")]);
        if (dragIds.length > 1) ghost.append(el(".dgcount", {}, [String(dragIds.length)]));
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 17, 17);
        setTimeout(() => ghost.remove(), 0);
      } catch { /* setDragImage unsupported → default ghost */ }
    });
    // C22: signal the drop clearly — the target fills + rings and shows a pill saying exactly what
    // the drop will do (folder → "Move N here", file → "New folder"), with a move cursor. C20: the
    // pane auto-scrolls when a drag nears its top/bottom edge so off-screen targets are reachable.
    let curDrop = null;
    const clearDrop = () => { if (curDrop) { curDrop.classList.remove("droptarget", "dropfolder", "dropfile"); curDrop.querySelector(".droppill")?.remove(); curDrop = null; } };
    const autoScroll = (y) => { const r = body.getBoundingClientRect(), m = 52; if (y < r.top + m) body.scrollTop -= 16; else if (y > r.bottom - m) body.scrollTop += 16; };
    body.addEventListener("dragover", (e) => {
      const draggingFolder = dragFolderIds.length > 0;
      if (!dragIds.length && !draggingFolder) return;   // only our own drags (OS-file uploads are handled elsewhere)
      autoScroll(e.clientY);
      const t = e.target.closest("[data-id], [data-folder-id]");
      if (!t) { clearDrop(); return; }
      if (draggingFolder) {
        // a folder drag only accepts a FOLDER target — never a file, never itself, never its own
        // descendant (a client-side check; the server RPC re-checks the cycle for a server folder,
        // but a personal-folder move has no RPC gate, so this guard is load-bearing there).
        const tid = t.dataset.folderId;
        const invalid = tid == null || dragFolderIds.includes(tid) || dragFolderIds.some((id) => folderInSubtree(data.folders, id, tid));
        if (invalid) { if (t !== curDrop) clearDrop(); return; }
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch { /* Safari */ }
        if (t === curDrop) return;
        clearDrop(); curDrop = t;
        t.classList.add("droptarget", "dropfolder");
        (t.querySelector(".media") || t).appendChild(el(".droppill", {}, [iconEl("move", "sm"), `Move ${dragFolderIds.length} here`]));
        return;
      }
      if (dragIds.includes(t.dataset.id)) { if (t !== curDrop) clearDrop(); return; }
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "move"; } catch { /* Safari */ }
      if (t === curDrop) return;
      clearDrop();
      curDrop = t;
      const isFolder = t.dataset.folderId != null;
      t.classList.add("droptarget", isFolder ? "dropfolder" : "dropfile");
      (t.querySelector(".media") || t).appendChild(
        el(".droppill", {}, [iconEl(isFolder ? "move" : "plus", "sm"), isFolder ? `Move ${dragIds.length} here` : "New folder"]));
    });
    body.addEventListener("dragleave", (e) => { const t = e.target.closest("[data-id], [data-folder-id]"); if (t && t === curDrop && !t.contains(e.relatedTarget)) clearDrop(); });
    body.addEventListener("dragend", clearDrop);
    body.addEventListener("drop", (e) => {
      const t = e.target.closest("[data-id], [data-folder-id]");
      clearDrop();
      if (dragFolderIds.length) {
        const ids = dragFolderIds; dragFolderIds = [];
        if (!t || t.dataset.folderId == null) return;
        const tid = t.dataset.folderId;
        if (ids.includes(tid) || ids.some((id) => folderInSubtree(data.folders, id, tid))) return;
        e.preventDefault();
        moveFoldersInto(data, state, rerender, ids, tid);
        return;
      }
      if (!t || !dragIds.length) return;
      e.preventDefault();
      const ids = dragIds.filter((x) => x !== t.dataset.id); dragIds = [];
      if (!ids.length) return;
      if (t.dataset.folderId != null) moveInto(data, state, rerender, ids, t.dataset.folderId || null);   // dropped on a folder
      else makeFolderFrom(data, state, rerender, [...ids, t.dataset.id]);                                   // dropped on a file
    });
  }

  // selection controller (Google-Drive model): refreshSel repaints the .sel outlines
  // and the bulk bar off state.selection, without rebuilding the grid.
  const sel = { state, refresh: refreshSel };
  state._refresh = refreshSel;   // for the screen-level key handler (Esc / ⌘A)
  state._repaint = repaintBody;  // list column-sort / grid sort+group dropdowns re-run the body only
  function refreshSel() {
    // select by [data-id]/[data-folder-id] so both files and folders show the selection outline
    body.querySelectorAll("[data-id]").forEach((c) => c.classList.toggle("sel", state.selection.has(c.dataset.id)));
    body.querySelectorAll("[data-folder-id]").forEach((c) => c.classList.toggle("sel", state.selFolders.has(c.dataset.folderId)));
    const nFiles = state.selection.size;
    const nFolders = state.selFolders.size;
    // B6: a single FILE selection stays quiet — its actions are on the card ⋯ and the details pane.
    // A FOLDER selection pops the bar starting at ONE (owner 2026-08-31: "folders have no selection
    // menu") — a folder card has no details-pane equivalent to fall back on, so 1 is its only
    // reachable multi-action surface besides the card's own ⋯. Clear is always reachable via an
    // empty-area click / Esc / plain click.
    const showBar = nFiles > 1 || nFolders >= 1;
    selbar.classList.toggle("open", showBar);
    if (showBar) {
      const total = nFiles + nFolders;
      const kind = nFiles && nFolders ? `${nFiles} file${nFiles === 1 ? "" : "s"}, ${nFolders} folder${nFolders === 1 ? "" : "s"}` : null;
      selbar.replaceChildren(
        el("span.n", {}, [el("span.nn", {}, [String(total)]), " selected", kind ? el("span.selkind", {}, [" · " + kind]) : ""]),
        ...(nFiles && !nFolders ? [selAct("download", "Download", () => downloadSelected(state))] : []),
        selAct("move", "Move to folder", () => moveMixedSelected(data, state, rerender)),
        selAct("trash", "Delete", () => deleteMixedSelected(data, state, rerender)),
        el("span.sp"),
        selAct("x", "Clear", () => { state.selection.clear(); state.selFolders.clear(); state.lastIdx = -1; state.lastFolderIdx = -1; refreshSel(); }),
      );
    }
    state._updateStatus?.();   // C17: keep the status strip's count/size/sort live
    state._updateInfo?.();      // C29: keep the docked info panel live to the selection
  }

  repaintBody();

  // re-render only the contents (search-as-you-type) without rebuilding the tree/toolbar
  function repaintBody() {
    // keep the path line in sync with the browsing/searching swap
    const isSearch = state.query.trim().length > 0;
    if (isSearch) searchQ.textContent = state.query;   // keep the "results for X" term live
    const want = isSearch ? searchState : crumbs;
    if (pathline.firstChild !== want) pathline.replaceChild(want, pathline.firstChild);
    // B6: DON'T wipe selection on every repaint (filter / search / folder nav) — it persists.
    // Only drop ids whose work no longer exists (trashed/removed) so a stale id can't ride along
    // in a bulk action. A plain card click or empty-area click is what resets a live selection.
    const live = new Set((data.files || []).map((f) => f.id));
    for (const id of [...state.selection]) if (!live.has(id)) state.selection.delete(id);
    state.lastIdx = -1;
    body.replaceChildren(contents(data, state, rerender, sel));
    refreshSel();
    state._updateMods?.();   // the filter rail — a modifier can change here (Enter-promote, ✕-remove)
  }
}

function selAct(icon, label, onClick) {
  return el("button", { title: label, onClick }, [iconEl(icon, "sm"), label]);
}

// C29: the docked info-panel contents for the current selection. Reuses details.js metaRows() so the
// metadata is IDENTICAL to the full viewer (Location · Uploaded by · Posted in · Added · Format · Size).
function buildInfoPanel(data, state, rerender) {
  const head = el(".exihead", {}, [el("span.exititle", {}, ["Details"]),
    el("button.iconbtn", { title: "Hide details", onClick: () => { state.infoOpen = false; rerender(); } }, [iconEl("x", "sm")])]);
  const ids = [...state.selection];
  if (ids.length > 1) {
    const bytes = (state._files || []).filter((w) => state.selection.has(w.id)).reduce((s, w) => s + (w.bytes || 0), 0);
    return [head, el(".exiempty", {}, [el("div", { style: "font-weight:600;color:var(--ink)" }, [`${ids.length} files selected`]), el("div", {}, [fmtBytes(bytes)])])];
  }
  const w = ids.length === 1 ? (data.files || []).find((x) => x.id === ids[0]) : null;
  if (!w) return [head, el(".exiempty", {}, ["Select a file to see its details."])];
  const ctx = { serverId: data.server?.id || null, serverName: rootLabel(data), personal: data.source === "personal", folderPath: crumbPath(data.folders, w.folderId), isPost: false };
  const url = mediaUrl(w);
  const prev = (w.kind === "image" && url)
    ? el(".exiprev", {}, [el("img.shot", { src: url, alt: "" })])
    : el(".exiprev.exipico", {}, [iconEl(KIND_ICON[w.kind] || "file")]);
  const tagsSec = (w.tags && w.tags.length) ? el(".exisec", {}, [
    el(".exilabel", {}, ["Tags"]),
    el(".ftags", { style: "flex-wrap:wrap;overflow:visible;margin:0" }, (w.tags || []).map((raw) => tagChip(raw, {
      onSearch: (mod) => commitModifier(data, state, rerender, mod) }))),
  ]) : null;
  const foot = el(".exifoot", {}, [
    el("button.btn.primary", { onClick: () => downloadWork(w) }, [iconEl("download", "sm"), "Download"]),
    ...(data.shared ? [] : [el("button.btn", { onClick: () => openShareDialog(w) }, [iconEl("users", "sm"), "Share"])]),
  ]);
  const scroll = el(".exiscroll", {}, [prev, el(".exiname", { title: w.title || "" }, [baseName(w)]), metaRows(w, ctx), tagsSec].filter(Boolean));
  return [head, scroll, foot];
}

// the current folder's subfolders + files, as grid or list; or search results
// P27/P34/P38 (owner 2026-08-31): the search field's helper — MINIMAL, type-to-trigger autocomplete
// (picked over a full command palette or an always-visible chip rail). At rest it's identical to a
// plain search field. Typing the start of a recognised key — a RESERVED_KEYS word, or a tag type
// (curated, or one actually used in this library — P38 custom types) — opens a slim completion list
// below it. Accepting a suggestion (click, Tab, or Enter on the highlighted row) completes just the
// key (leaves a trailing ":" so the value is typed next). Pressing Enter promotes every COMPLETE
// key:value token in the field straight to the filter rail (see updateMods in paint()) and strips it
// out of the field — the field only ever holds free search text once you're done filtering. This is
// what makes P27's split visible: a rail chip is a filter (screen-local), text left in the field is
// a search (goes deep).
function searchWidget(data, state, repaintBody) {
  // every tag TYPE worth suggesting: the curated set + whatever's actually used in this library
  const usedTypes = new Set();
  for (const w of data.files || []) for (const raw of (w.tags || [])) { const t = parseTag(raw); if (t.typed) usedTypes.add(t.type); }
  const allTypes = [...new Set([...TAG_TYPES, ...usedTypes])];

  const input = el("input", {
    value: state.query,
    placeholder: data.shared ? "Search this folder" : (data.source === "personal" ? "Search files…" : "Search this server…"),
    role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "exacpop",
  });
  const search = el(".field.searchbar", {}, [iconEl("search", "sm"), input]);
  const pop = el(".pop.exacpop", { id: "exacpop", role: "listbox", "aria-label": "Search modifier suggestions" });
  pop.hidden = true;
  const wrap = el(".searchcombo", {}, [search, pop]);

  let suggestions = [], hi = -1;

  function computeSuggestions() {
    const tokens = input.value.split(/\s+/);
    const frag = (tokens[tokens.length - 1] || "").toLowerCase();
    if (!frag || frag.includes(":")) return [];   // nothing typed yet, or this token's already key:value
    const keys = RESERVED_KEYS.filter((k) => k.startsWith(frag)).map((k) => ({ key: k }));
    const types = allTypes.filter((t) => t.startsWith(frag) && !RESERVED_KEYS.includes(t)).map((t) => ({ type: t }));
    return [...keys, ...types].slice(0, 8);
  }
  function renderPop() {
    if (!suggestions.length) { pop.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); return; }
    pop.hidden = false; input.setAttribute("aria-expanded", "true");
    pop.replaceChildren(...suggestions.map((s, i) => {
      const key = s.key || s.type;
      const row = el(".poprow" + (i === hi ? ".hi" : ""), { id: `exacopt-${i}`, role: "option", "aria-selected": i === hi ? "true" : "false" });
      if (s.type) row.append(el("span.exacsw", { style: `background:${tagColor(key)}` }));
      row.append(el("b", {}, [key + ":"]), el("span.hl", {}, [s.type ? "tag" : (RESERVED_HINT[key] || "")]));
      row.addEventListener("mousedown", (e) => { e.preventDefault(); accept(s); });   // mousedown, so it fires before the input's blur
      return row;
    }));
    if (hi >= 0) input.setAttribute("aria-activedescendant", `exacopt-${hi}`); else input.removeAttribute("aria-activedescendant");
  }
  function updateSuggestions() { suggestions = computeSuggestions(); hi = suggestions.length ? 0 : -1; renderPop(); }
  function closePop() { suggestions = []; hi = -1; renderPop(); }
  function accept(s) {
    const key = s.key || s.type;
    const tokens = input.value.split(/\s+/);
    tokens[tokens.length - 1] = key + ":";
    input.value = tokens.join(" ");
    state.query = input.value;
    closePop();
    input.focus();
  }
  // scan every token for a complete key:value modifier, push each to the rail (deduped), and leave
  // whatever's left (free words, or an incomplete key: with no value yet) in the field.
  function promoteComplete() {
    const tokens = input.value.split(/\s+/).filter(Boolean);
    const remaining = []; let changed = false;
    for (const tok of tokens) {
      const parsed = parseModifierToken(tok);
      if (parsed) { if (!state.modifiers.some((m) => sameModifier(m, parsed))) state.modifiers.push(parsed); changed = true; }
      else remaining.push(tok);
    }
    input.value = remaining.join(" ");
    state.query = input.value;
    closePop();
    return changed;
  }

  input.addEventListener("input", () => { state.query = input.value; updateSuggestions(); repaintBody(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); hi = (hi + 1) % suggestions.length; renderPop(); return; }
    if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); hi = (hi - 1 + suggestions.length) % suggestions.length; renderPop(); return; }
    if (e.key === "Escape" && suggestions.length) { e.preventDefault(); closePop(); return; }
    if (e.key === "Tab" && hi >= 0 && suggestions[hi]) { e.preventDefault(); accept(suggestions[hi]); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const tokens = input.value.split(/\s+/);
      const lastComplete = parseModifierToken(tokens[tokens.length - 1] || "");
      if (hi >= 0 && suggestions[hi] && !lastComplete) { accept(suggestions[hi]); return; }   // still typing the key — complete it, don't promote
      const changed = promoteComplete();
      repaintBody();
      if (!changed) input.focus();
    }
  });
  input.addEventListener("blur", () => setTimeout(closePop, 120));   // let a suggestion's mousedown land first

  return { wrap };
}

function contents(data, state, rerender, sel) {
  const searching = state.query.trim().length > 0;   // FREE TEXT only now — modifiers live in the rail
  const qtext = state.query.trim().toLowerCase();
  const mods = splitModifiers(state.modifiers);       // {exts,hastypes,tags,by,channel,before,after,inFolder}

  const openFolder = (f) => { state.folderId = f.id; state.query = ""; rerender(); };

  // P27: a MODIFIER alone filters the CURRENT folder only (screen-local, non-recursive — folders
  // are not dug into); free TEXT searches deep (server-side when possible, the whole drive)
  // regardless of which modifiers ride along.
  let subfolders, files, serverPaged = null;

  // ── P24 server-side search ──────────────────────────────────────────────────
  // Live, on free text, ask Postgres (search_files) instead of filtering the loaded set — so it
  // scales past what the client holds. by:/channel:/before:/in: aren't in the RPC yet (K12 follow-
  // up), so they're applied client-side on the result either way (applyClientOnlyModifiers below).
  // Demo, browse, starred, and RPC errors all fall back to client.
  const useSrv = !isDemoQS() && !data.shared && !state.starred && qtext
    && (data.source === "server" || data.source === "personal");
  if (useSrv) {
    const args = {
      source: data.source, serverId: data.server?.id || null,
      text: qtext,
      tags: mods.tags,
      hastypes: mods.hastypes,
      exts: mods.exts,
      since: null,
      sort: state.sort,
      sortTag: null,
      dir: state.dir,
    };
    const sig = JSON.stringify(args);
    if (!state.srv || state.srv.sig !== sig) { state._runServerSearch(sig, args, false); }   // fires async → repaintBody
    if (!state.srv || state.srv.sig !== sig || (state.srv.loading && !(state.srv.items && state.srv.items.length))) {
      return el(".exview", { "data-exview": "grid" }, [el(".searchloading", {}, [indetBar(), loadingLabel("Searching")])]);
    }
    if (state.srv.items) {   // success (possibly empty) — the server already applied text/tags/exts/sort
      subfolders = [];
      files = state.srv.items.slice();
      if (!state.showHidden) files = files.filter((w) => !w.hidden);
      files = applyClientOnlyModifiers(files, mods, data);
      serverPaged = { total: state.srv.total, shown: files.length, loading: state.srv.loading };
      state._files = files;
    }
    // else state.srv.error (items===null) → fall through to the client-side filter below
  }

  if (!serverPaged) {
    if (state.starred) {
      subfolders = [];   // Starred is a flat grid of every starred work (no folders)
      files = data.files.filter((w) => w.starred);
    } else if (searching) {
      // P27: free TEXT digs deep — flattens the whole tree to matching files, wherever they live.
      subfolders = [];
      files = data.files.slice();
      // B19: a bare term matches the filename OR any of the file's tags (was filename only).
      files = files.filter((w) => (w.title || "").toLowerCase().includes(qtext) || (w.tags || []).some((t) => t.toLowerCase().includes(qtext)));
      if (mods.tags.length) files = files.filter((w) => mods.tags.every((t) => (w.tags || []).includes(t)));         // exact type:value / tag:value
      if (mods.hastypes.length) files = files.filter((w) => mods.hastypes.every((ty) => (w.tags || []).some((t) => parseTag(t).type === ty)));   // hastag:type
      if (mods.exts.length) files = files.filter((w) => mods.exts.includes((w.file_ext || "").toLowerCase()));       // ext:
    } else {
      // P27: NO free text — browsing this folder. A modifier alone is FILTERING (screen-local, non-
      // recursive): it narrows the files ALREADY in this folder; it does not dig into subfolders,
      // and subfolders themselves stay visible untouched (they're for arranging/removing, not a
      // filter target).
      subfolders = data.folders.filter((f) => (f.parentId || null) === state.folderId);
      files = data.files.filter((w) => (w.folderId || null) === state.folderId);
      if (mods.tags.length) files = files.filter((w) => mods.tags.every((t) => (w.tags || []).includes(t)));
      if (mods.hastypes.length) files = files.filter((w) => mods.hastypes.every((ty) => (w.tags || []).some((t) => parseTag(t).type === ty)));
      if (mods.exts.length) files = files.filter((w) => mods.exts.includes((w.file_ext || "").toLowerCase()));
    }
    // Hidden/utility works (#55) are omitted from the library view unless Show-hidden is on.
    if (!state.showHidden) files = files.filter((w) => !w.hidden);
    files = applyClientOnlyModifiers(files, mods, data);   // by:/channel:/before:/after:/in:
    files = sortFiles(files, state.sort, state.dir, null);
    state._files = files;   // the current in-view set, for ⌘A select-all
  }

  // a card opens the Details pane (§C.7): server files carry tags but no comments;
  // siblings = the files in view (prev/next); Location = the file's own folder path.
  const personal = data.source === "personal";
  const openFile = (w) => {
    openDetails(w, {
      serverId: data.server?.id || null,
      serverName: rootLabel(data), personal,
      folderPath: crumbPath(data.folders, w.folderId),
      siblings: files, isPost: false,
      // the viewer's ⋯ menu = the card menu (P5.9d): star/rename/move/hide/delete from the pane
      menuItemsFor: (ww, hooks) => detailMenuItems(data, state, rerender, ww, hooks),
      // P26: click a tag in the viewer → filter the whole library to that exact tag (the P11 tag
      // filter). Jumps to root so it searches every folder, closes the viewer, shows the results.
      onTagSearch: (mod) => { closeDetails(); commitModifier(data, state, rerender, mod); },
      // closing the viewer (✕ / Esc / backdrop / nav) drops ?file= from the URL
      onClose: () => { state.openFileId = null; state._syncUrl?.(); },
    });
    // reflect the open file in the URL (set AFTER openDetails so its closeDetails-of-any-prior
    // pane's onClose — which clears openFileId — runs first, then we set the new one).
    state.openFileId = w.id; state._syncUrl?.();
  };
  state._openFile = openFile;   // for URL restore (renderExplorer reopens ?file= after paint)

  if (!subfolders.length && !files.length) {
    if (state.starred) return emptyState("star", "No starred files", "Star a file (the ★ on its card) to keep it here.");
    return searching
      ? emptyState("search", "No results", `Nothing here matches “${state.query.trim()}”.`)
      : data.shared
        ? emptyState("folder", "This folder is empty", "Nothing has been shared here yet.")
        : emptyState("folder", "This folder is empty", "Drag files here to upload, or use New folder below.", { dropzone: true });
  }

  // Google-Drive selection (§C.6): single click selects (clears others), ⌘/Ctrl-click
  // toggles, Shift-click ranges; a double-click opens. List view keeps click-to-open.
  const onCardClick = (w, i, e) => {
    const s = state.selection;
    state.selFolders.clear();   // selecting a file drops any folder selection
    if (e.metaKey || e.ctrlKey) { s.has(w.id) ? s.delete(w.id) : s.add(w.id); state.lastIdx = i; }
    else if (e.shiftKey && state.lastIdx >= 0) {
      // Shift-click always selects EXACTLY [anchor, i] (Explorer/Finder) — replace, not union, so a
      // second Shift-click on a nearer item shrinks the range instead of only ever growing it.
      s.clear();
      const [a, b] = [state.lastIdx, i].sort((x, y) => x - y);
      for (let k = a; k <= b; k++) s.add(files[k].id);
    } else { s.clear(); s.add(w.id); state.lastIdx = i; }
    sel.refresh();
  };
  // B26: single-click a folder selects it (clears the file selection), ⌘/Ctrl-click toggles it into a
  // multi-folder selection, Shift-click ranges over the folders in view (its own anchor —
  // lastFolderIdx — since folders and files are separate lists); double-click opens it. Folders join
  // the marquee box too (refreshSel above).
  const onFolderClick = (f, i, e) => {
    const s = state.selFolders;
    state.selection.clear();   // selecting a folder drops any file selection
    if (e && (e.metaKey || e.ctrlKey)) { s.has(f.id) ? s.delete(f.id) : s.add(f.id); state.lastFolderIdx = i; }
    else if (e && e.shiftKey && state.lastFolderIdx >= 0) {
      s.clear();   // replace, not union — a second Shift-click shrinks the range too, not just grows it
      const [a, b] = [state.lastFolderIdx, i].sort((x, y) => x - y);
      for (let k = a; k <= b; k++) s.add(subfolders[k].id);
    } else { s.clear(); s.add(f.id); state.lastFolderIdx = i; }
    state.lastIdx = -1; sel.refresh();
  };

  const onStar = (w) => toggleStar(data, state, rerender, w);
  const onMenu = data.shared ? null : (w, anchor, at) => openCardMenu(data, state, rerender, w, anchor, at);   // read-only shared view has no per-card owner menu (P9)
  const onShareFolder = (folder, anchor, at) => shareFolderMenu(data, state, rerender, folder, anchor, at);
  // List column-header sort: which key is currently active (latest/oldest collapse to the "date"
  // column) + the effective direction, and the handler a header click calls (toggle dir if it's the
  // active column, else switch to it with a sensible default). Repaints the body only.
  const activeSort = (state.sort === "latest" || state.sort === "oldest") ? "date" : state.sort;
  const effDir = state.sort === "latest" ? "desc" : state.sort === "oldest" ? "asc" : state.dir;
  const onSortCol = (key) => {
    if (activeSort === key) { state.dir = effDir === "asc" ? "desc" : "asc"; if (state.sort === "latest" || state.sort === "oldest") state.sort = "date"; }
    else { state.sort = key; state.dir = (key === "name" || key === "type" || key === "uploader") ? "asc" : "desc"; }
    (state._repaint || rerender)();
  };
  // Both densities share the same select/open wiring + hooks; only the layout differs.
  // P23: ftctx carries data/state/rerender so a folder card can render + edit its own tags.
  const hooks = { openFile, openFolder, onFolderClick, onCardClick, onStar, onMenu, onShareFolder,
    showWho: data.source !== "personal", personal, ftctx: { data, state, rerender },
    group: state.group, onSortCol, sortActive: activeSort, dir: effDir, density: state.density };
  const view = state.mode === "list" ? listView(subfolders, files, hooks)
    : largeView(subfolders, files, hooks);
  // P24: a paged server search that has more rows gets a "Load more" footer (client-side folder
  // browsing loads the whole tree at once, so it never needs one).
  if (serverPaged && serverPaged.shown < serverPaged.total) {
    const more = el("button.btn.loadmorefiles", { disabled: !!serverPaged.loading },
      [serverPaged.loading ? loadingLabel("Loading") : `Load more (${serverPaged.shown} of ${serverPaged.total})`]);
    more.addEventListener("click", () => { if (state.srv?.args) state._runServerSearch(state.srv.sig, state.srv.args, true); });
    return el("div", { style: "display:flex;flex-direction:column;min-height:0;flex:1" }, [view, el(".loadmorewrap", {}, [more])]);
  }
  return view;
}

// K9 — Drive-style "share a folder": right-clicking a folder card opens this menu. Copy folder
// link mints a public read-only link (create_folder_share RPC, fenced server-side) and copies
// `/shared/folder/:token`. Works for a server folder or a personal My-files folder.
// owner 2026-08-31: "folders have no selection menu — I can't put them in another folder, or copy,
// or anything." This menu (right-click AND the card's own hover ⋯ button, cards.js) was Open/
// Properties/Copy-link only — no move, rename, or delete. `canW` gates the write rows the same way
// the Properties popover already does (server = admin/manage_channels, personal = owner), and a
// `locked` server folder additionally hides them (the UI signpost — the RLS fence for `locked` is a
// separate, pre-existing gap, see the K13 note in BUILDLOG).
function shareFolderMenu(data, state, rerender, folder, anchor, at) {
  const canW = canWriteFolder(data) && !folder.locked;
  openMenu(anchor, [
    // P28: right-click a folder → Open (leads, like a native context menu) + share
    { label: "Open", icon: "folder", onClick: () => { state.folderId = folder.id; state.query = ""; rerender(); } },
    ...(canW ? [{ label: "Rename", icon: "pen", onClick: () => renameFolderFlow(data, state, rerender, folder) }] : []),
    ...(canW ? [{ label: "Move to…", icon: "move", onClick: () => openFolderMovePicker(data, state, rerender, [folder.id]) }] : []),
    // P23: Properties opens the show-all / edit-all folder-tags popover (anchored on the folder card)
    { label: "Properties", icon: "info", onClick: () => openFolderProperties(anchor, folder, { data, state, rerender }) },
    { label: "Copy folder link", icon: "users", onClick: async () => {
      try {
        const token = await createFolderShare(data.source, folder.id);
        await copyToClipboard(folderShareUrl(token), { ok: "Folder link copied — anyone with it can view this folder", icon: "users" });
      } catch (e) { toast({ message: e?.message || "Couldn’t create the folder link" }); }
    } },
    ...(canW ? [{ sep: true }, { label: "Delete", icon: "trash", danger: true, onClick: () => deleteFoldersFlow(data, state, rerender, [folder.id]) }] : []),
  ], { at });
}

// Rename a folder (owner 2026-08-31 — folders had no rename UI). Mirrors renameWork's prompt.
function renameFolderFlow(data, state, rerender, folder) {
  promptText({ title: "Rename folder", value: folder.name, submit: "Save", busyLabel: "Saving…", fail: "Couldn’t rename the folder" }, async (name) => {
    if (!isDemoQS()) await renameFolder(data.source, folder.id, name);
    folder.name = name.trim();
    rerender();   // a full repaint rebuilds the card (and the tree row) with the new name
    toast({ message: "Folder renamed" });
  });
}

// every descendant folder id under `id` (not including `id` itself) — used by the cycle guard's
// "exclude the moved folder's own subtree from the destination tree" and by the delete confirm's
// "N nested" count / cascade-aware local cleanup.
function descendantFolderIds(folders, id) {
  const out = [];
  for (const k of folders.filter((f) => (f.parentId || null) === id)) { out.push(k.id); out.push(...descendantFolderIds(folders, k.id)); }
  return out;
}

// Destination picker for moving one or more FOLDERS (owner 2026-08-31). Mirrors the file
// openMovePicker's shape, but excludes each moved folder AND its own subtree from the tree
// (folderInSubtree — the same guard the drag path uses) since a folder can't become its own
// descendant; a locked folder still can't receive anything.
function openFolderMovePicker(data, state, rerender, folderIds) {
  const well = el(".movetree");
  const body = el("div", {}, [el(".ulab", {}, ["Destination in ", el("b", {}, [rootLabel(data)])]), well]);
  const cancel = el("button.btn", {}, ["Cancel"]);
  const go = el("button.btn.primary", { disabled: true }, ["Move here"]);
  const modal = openModal({ title: `Move ${folderIds.length} folder${folderIds.length > 1 ? "s" : ""}`, body, footer: [cancel, go], size: "wide" });

  let dest, hasSel = false, busy = false;
  const rowById = new Map();
  const select = (id) => {
    well.querySelectorAll(".ftrow.on").forEach((r) => r.classList.remove("on"));
    rowById.get(id ?? "__root__")?.classList.add("on");
    dest = id; hasSel = true; go.disabled = busy;
  };
  const pickRow = (id, label, depth, locked) => {
    const row = el(`button.ftrow.lvl${Math.min(depth, 3)}` + (locked ? ".archived" : ""), { disabled: !!locked });
    row.append(el("span.tw"));
    const ic = iconEl(locked ? "lock" : "folder", "sm"); ic.classList.add("fic");
    row.append(ic, el("span.fn", {}, [label]));
    if (locked) { const l = iconEl("lock", "sm"); l.classList.add("ftlock"); row.append(l); }
    if (!locked) row.addEventListener("click", () => select(id));
    rowById.set(id ?? "__root__", row);
    return row;
  };
  const renderWell = () => {
    rowById.clear();
    const rows = [pickRow(null, rootLabel(data), 0, false)];
    (function walk(pid, depth) {
      for (const f of data.folders.filter((x) => (x.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name))) {
        if (folderIds.includes(f.id) || folderIds.some((id) => folderInSubtree(data.folders, id, f.id))) continue;
        rows.push(pickRow(f.id, f.name, depth, f.locked));
        walk(f.id, depth + 1);
      }
    })(null, 1);
    well.replaceChildren(...rows);
  };
  renderWell();

  cancel.addEventListener("click", () => modal.close());
  go.addEventListener("click", async () => {
    if (!hasSel || busy) return;
    busy = true; go.disabled = true; go.textContent = "Moving…";
    await moveFoldersInto(data, state, rerender, folderIds, dest);
    modal.close();
  });
}

// Delete one or more folders (owner 2026-08-31 — folders had no delete UI at all). Subfolders
// cascade with their parent; any file placed in a doomed folder is un-filed to root, NEVER deleted
// (deleteFolder in data.js — the FK is ON DELETE SET NULL) — the confirm names that so it doesn't
// read as "delete everything inside". `alsoTrashFileIds` lets the bulk bar fold a mixed file+folder
// selection into ONE confirm; the files still go through the normal (undoable) Trash path.
function deleteFoldersFlow(data, state, rerender, folderIds, alsoTrashFileIds = []) {
  const doomed = new Set(folderIds.flatMap((id) => [id, ...descendantFolderIds(data.folders, id)]));
  const nested = doomed.size - folderIds.length;
  const body = el("div", {}, [
    el("p", {}, [
      `Delete ${folderIds.length} folder${folderIds.length === 1 ? "" : "s"}`,
      nested > 0 ? ` (${nested} nested)` : "",
      alsoTrashFileIds.length ? ` and move ${alsoTrashFileIds.length} file${alsoTrashFileIds.length === 1 ? "" : "s"} to Trash` : "",
      "?",
    ]),
    el("p", { style: "color:var(--muted);font-size:var(--fs-xs);margin-top:6px" }, ["Files inside move to the root — they aren’t deleted."]),
  ]);
  const cancel = el("button.btn", {}, ["Cancel"]);
  const go = el("button.btn.danger", {}, ["Delete"]);
  const modal = openModal({ title: `Delete folder${folderIds.length > 1 ? "s" : ""}`, body, footer: [cancel, go] });
  cancel.addEventListener("click", () => modal.close());
  go.addEventListener("click", async () => {
    go.disabled = true; go.textContent = "Deleting…";
    try {
      if (!isDemoQS()) { for (const id of folderIds) await deleteFolder(data.source, id); }
      data.folders = data.folders.filter((f) => !doomed.has(f.id));
      for (const w of data.files) if (doomed.has(w.folderId)) w.folderId = null;
      for (const id of doomed) state.selFolders.delete(id);
      if (state.folderId && doomed.has(state.folderId)) state.folderId = null;   // was inside the deleted tree
      modal.close();
      rerender();
      toast({ message: `Deleted ${folderIds.length} folder${folderIds.length === 1 ? "" : "s"}` });
      if (alsoTrashFileIds.length) trashIds(data, state, rerender, alsoTrashFileIds);   // its own (undoable) toast
    } catch (e) { go.disabled = false; go.textContent = "Delete"; toast({ message: e?.message || "Couldn’t delete the folder" }); }
  });
}

// ── P23 folder tags ───────────────────────────────────────────────────────────
// A folder carries its own tags (no inheritance to files, backend p28). Reuses the P11 tagChip:
// an untyped tag reads as a GREY chip, a typed "type:value" tag (bpm/key/genre/mood/instrument) in
// its own COLOUR. The card shows the FIRST FEW inline (read-only, click to search); a "+N" chip and
// the folder's right-click "Properties" open the popover that shows/edits ALL tags. Small (icon)
// view stays tag-free; list shows a few inline. Writer-gated: server folder → manage_channels
// (≈ isAdmin here; server-side is the real fence), personal → owner, a read-only shared view never edits.
const FOLDER_TAGS_ON_CARD = 3;   // how many tags the card face + a list row show before "+N"

function canWriteFolder(data) { return !data.shared && (data.source === "personal" || !!data.isAdmin); }
function folderTagTarget(data, folder) { return data.source === "personal" ? { saveFolderId: folder.id } : { folderId: folder.id }; }
// click a folder tag → filter the library by it (same as a file tag, P26/P38)
function searchFolderTag(data, state, rerender, mod) { commitModifier(data, state, rerender, mod); }

// Click-to-filter (P26/P38): committing a modifier from a tag click (docked info panel, the details
// viewer, a folder's tags) jumps to root — so the filter surfaces results from anywhere the item
// lives, not just the current folder — and ADDS the modifier to the rail, composing with whatever's
// already filtering rather than replacing it. A duplicate click on an already-active modifier is a
// no-op (sameModifier dedup), not a second copy.
function commitModifier(data, state, rerender, mod) {
  state.selection.clear(); state.selFolders.clear(); state.folderId = null; state.query = "";
  if (!state.modifiers.some((m) => sameModifier(m, mod))) state.modifiers.push(mod);
  rerender();
}
async function addFolderTagUI(data, state, rerender, folder, raw, after) {
  const clean = (raw || "").trim(); if (!clean) return;
  try {
    const stored = await addFolderTag(folderTagTarget(data, folder), clean);
    if (!(folder.tags || []).includes(stored)) (folder.tags ||= []).push(stored);
    (after || rerender)();
  } catch (e) { toast({ message: e?.message || "Couldn’t add the tag" }); }
}
async function removeFolderTagUI(data, state, rerender, folder, raw, after) {
  try {
    await removeFolderTag(folderTagTarget(data, folder), raw);
    folder.tags = (folder.tags || []).filter((t) => t !== raw);
    (after || rerender)();
  } catch (e) { toast({ message: e?.message || "Couldn’t remove the tag" }); }
}

// a colon-aware add input (mirrors the tagEditor's live type colouring), commits on Enter
function folderTagInput(data, state, rerender, folder, { onDone } = {}) {
  const input = el("input", { placeholder: "add a tag… (bpm:142)" });
  const field = el(".field.searchbar.tagin.ftaddfield", {}, [input]);
  const recolor = () => {
    const a = (input.value.split(":")[0] || "").trim().toLowerCase();
    // P38: ANY colon-prefixed type colours live now (curated or custom), not just TAG_TYPES.
    if (input.value.includes(":") && a && input.value.slice(input.value.indexOf(":") + 1).trim()) { input.style.color = tagColor(a); input.style.fontWeight = "600"; }
    else { input.style.color = ""; input.style.fontWeight = ""; }
  };
  input.addEventListener("input", recolor);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) { e.preventDefault(); const v = input.value; input.value = ""; recolor(); addFolderTagUI(data, state, rerender, folder, v, onDone); }
    else if (e.key === "Escape") { e.preventDefault(); onDone && onDone(); }
  });
  setTimeout(() => input.focus(), 0);
  return field;
}

// the first-few read-only chips shown on a card / list row (click a chip → search). Kept to ONE
// line so every folder card is the same height (B24-style even tiling); "+N" opens Properties.
function folderTagPreview(folder, ctx, { max = FOLDER_TAGS_ON_CARD } = {}) {
  const { data, state, rerender } = ctx;
  const tags = folder.tags || [];
  if (!tags.length) return null;
  const row = el(".ftags");
  for (const raw of tags.slice(0, max)) row.append(tagChip(raw, { onSearch: (mod) => searchFolderTag(data, state, rerender, mod) }));
  if (tags.length > max) {
    const more = el("button.ftmore", { title: "Show all tags" }, [`+${tags.length - max}`]);
    more.addEventListener("click", (e) => { e.stopPropagation(); openFolderProperties(more, folder, ctx); });
    row.append(more);
  }
  // a click inside the tag row must not select/open the folder
  row.addEventListener("click", (e) => e.stopPropagation());
  row.addEventListener("dblclick", (e) => e.stopPropagation());
  return row;
}

// live re-decorate one folder card's tag row after an edit (Properties mutates folder.tags in place)
function repaintFolderCardTags(folder, ctx) {
  const card = document.querySelector(`.foldercard[data-folder-id="${folder.id}"]`);
  if (!card) return;
  card.querySelector(".cardfoot .ftags")?.remove();
  const row = folderTagPreview(folder, ctx);
  const frow = card.querySelector(".cardfoot .frow");
  if (row && frow) frow.prepend(row);   // tags left, file-count (who) right — same band as file cards
}

// the card decorator: the first-few preview (large view). Empty folders show nothing here — tags
// are added via the right-click Properties popover, which is always available to a writer.
function decorateFolderTags(card, folder, ctx) {
  if (!ctx) return;
  const row = folderTagPreview(folder, ctx);
  const frow = card.querySelector(".cardfoot .frow");
  if (row && frow) frow.prepend(row);   // into the band's row (tags left, file-count right)
}

// Properties — the show-all / edit-all popover (opened from the folder right-click menu + a "+N"
// chip). File count + every tag (removable for a writer) + a colon-aware add input.
function openFolderProperties(anchor, folder, ctx) {
  const { data, state, rerender } = ctx;
  const canW = canWriteFolder(data);
  closeMenus();
  const pop = el(".menu.open.ftpop", { role: "dialog" });
  const paint = () => {
    pop.replaceChildren();
    pop.append(el(".ftpophd", {}, [
      el("span.ftpopname", {}, [`Properties · ${folder.name}`]),
      el("span.ftpopcount", {}, [`${folder.count ?? 0} file${folder.count === 1 ? "" : "s"}`]),
    ]));
    pop.append(el(".ftseclabel", {}, ["Tags"]));
    const chips = el(".ftags");
    for (const raw of (folder.tags || [])) chips.append(tagChip(raw, { removable: canW, onRemove: (r) => removeFolderTagUI(data, state, rerender, folder, r, () => { paint(); repaintFolderCardTags(folder, ctx); }), onSearch: (mod) => { closeMenus(); searchFolderTag(data, state, rerender, mod); } }));
    if (!(folder.tags || []).length) chips.append(el(".ftempty", {}, ["No tags yet."]));
    pop.append(chips);
    if (canW) pop.append(folderTagInput(data, state, rerender, folder, { onDone: () => { paint(); repaintFolderCardTags(folder, ctx); } }));
  };
  paint();
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + "px";
  pop.style.top = (r.bottom + ph > window.innerHeight - 8 ? Math.max(8, r.top - ph - 4) : r.bottom + 4) + "px";
  const onDoc = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenus(); };
  pop._cleanup = () => document.removeEventListener("mousedown", onDoc, true);
  setTimeout(() => document.addEventListener("mousedown", onDoc, true));
}

// ── P14 view densities (list / small / large) ────────────────────────────────

// Shared select/open wiring so every density behaves identically (B26 Drive/Explorer model):
// single click selects, double click opens; a file drags (make-folder / move), a folder is a drop
// target; ⋯ / right-click opens the owner menu. Any element that carries data-id / data-folder-id
// participates in the selection outline, the marquee, and the bulk bar (refreshSel/marquee below
// select by [data-id], not only .card). `i` is the file's index for Shift-range selection.
function wireFileEl(node, w, i, { onCardClick, openFile, onMenu }) {
  node.dataset.id = w.id;
  if (onMenu) node.draggable = true;   // B10: drag a file onto another → make a folder
  node.addEventListener("click", (e) => onCardClick(w, i, e));
  node.addEventListener("dblclick", (e) => { e.preventDefault(); openFile(w); });
  node.addEventListener("contextmenu", (e) => { e.preventDefault(); onMenu?.(w, node, { x: e.clientX, y: e.clientY }); });   // P28: spawn at the cursor
  return node;
}
function wireFolderEl(node, f, i, { onFolderClick, openFolder, onShareFolder }) {
  node.dataset.folderId = f.id;   // B10: a drop target
  if (onShareFolder) node.draggable = true;   // onShareFolder is only wired on a real (non-shared) mount — drag a folder to reparent it
  node.addEventListener("click", (e) => onFolderClick(f, i, e));
  node.addEventListener("dblclick", (e) => { e.preventDefault(); openFolder(f); });
  node.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); openFolder(f); } });
  if (onShareFolder) node.addEventListener("contextmenu", (e) => { e.preventDefault(); onShareFolder(f, node, { x: e.clientX, y: e.clientY }); });   // P28: spawn at the cursor
  return node;
}

// one file card (the grid tile). Kept as a factory so grouped + ungrouped grids share it verbatim.
function largeFileCard(w, i, hooks) {
  let card;
  const actions = hooks.onMenu ? [{ act: "more", icon: "more", title: "More", onClick: (ww) => hooks.onMenu(ww, card.querySelector('.cardacts [data-act="more"]') || card) }] : [];
  card = workCard(w, { selectable: true, showWho: hooks.showWho, starred: !!w.starred, onStar: hooks.onStar, actions });
  if (w.hidden) card.classList.add("ishidden");
  wireFileEl(card, w, i, hooks);
  return card;   // B33: the star (top-left, click-toggle) lives inside workCard now — no corner check
}
function largeFolderCard(f, i, hooks) {
  const fcard = wireFolderEl(folderCard(f, { onShare: hooks.onShareFolder }), f, i, hooks);
  decorateFolderTags(fcard, f, hooks.ftctx);   // P23: the folder's first-few tags (Properties shows all)
  return fcard;
}

// GRID — big content thumbnails. Optionally GROUPED (owner 2026-08-31): a Group-by dropdown buckets
// the files under headers (Kind/Type/Uploader/Date).
function largeView(subfolders, files, hooks) {
  const wrap = el(".exview", { "data-exview": "large" });
  // P32: drive the grid's thumbnail min-width + per-stage spacing/type from the density stage. --tile
  // feeds `minmax(var(--tile),1fr)`; [data-density] lets CSS ease card padding/gap/meta at dense stages.
  const dstage = DENSITY_TILE[hooks.density] ? hooks.density : DENSITY_DEFAULT;
  wrap.style.setProperty("--tile", DENSITY_TILE[dstage] + "px");
  wrap.dataset.density = String(dstage);
  const groups = groupFiles(files, hooks.group);
  const idxOf = new Map(files.map((w, i) => [w.id, i]));   // keep each card's real index for Shift-range
  const folderIdx = new Map(subfolders.map((f, i) => [f.id, i]));
  if (!groups) {
    const grid = el(".masonry.even.exlarge");
    subfolders.forEach((f, i) => grid.append(largeFolderCard(f, i, hooks)));
    files.forEach((w, i) => grid.append(largeFileCard(w, i, hooks)));
    wrap.append(grid);
    return wrap;
  }
  const groupSection = (label, count, nodes) => {
    const g = el(".masonry.even.exlarge");
    nodes.forEach((n) => g.append(n));
    return el(".exgroup", {}, [el(".exgrouphd", {}, [el("span.egn", {}, [label]), el("span.egc", {}, [String(count)])]), g]);
  };
  // Date added genuinely applies to a folder too (owner 2026-08-31: "grouping works for files but
  // not folders") — bucket folders into the SAME date sections as files, each section folders-then-
  // files. Kind/Type/Uploader don't apply to a folder (no file-kind, no extension, no uploader), so
  // for those it stays a single leading "Folders" section, same as before.
  if (hooks.group === "date") {
    const folderBuckets = new Map();
    for (const f of subfolders) { const { rank, label } = dateBucket(f.createdAt); if (!folderBuckets.has(label)) folderBuckets.set(label, { rank, items: [] }); folderBuckets.get(label).items.push(f); }
    const labels = new Set([...groups.map((g) => g.label), ...folderBuckets.keys()]);
    const merged = [...labels].map((label) => {
      const g = groups.find((x) => x.label === label);
      const fb = folderBuckets.get(label);
      return { label, rank: (g || fb).rank, folders: fb ? fb.items : [], files: g ? g.items : [] };
    });
    merged.sort((a, b) => (a.rank - b.rank) || a.label.localeCompare(b.label));
    for (const { label, folders: gf, files: gw } of merged) {
      const nodes = [...gf.map((f) => largeFolderCard(f, folderIdx.get(f.id), hooks)), ...gw.map((w) => largeFileCard(w, idxOf.get(w.id), hooks))];
      wrap.append(groupSection(label, gf.length + gw.length, nodes));
    }
    return wrap;
  }
  if (subfolders.length) wrap.append(groupSection("Folders", subfolders.length, subfolders.map((f, i) => largeFolderCard(f, i, hooks))));
  for (const { label, items } of groups) wrap.append(groupSection(label, items.length, items.map((w) => largeFileCard(w, idxOf.get(w.id), hooks))));
  return wrap;
}

// LIST — the "Details" table: a column per field. Rows select/open like the grid and carry data-id
// so selection / marquee / the bulk bar all work here too. Column headers are click-to-sort (C6),
// and each file row leads with the same star toggle as the grid (B33).
function listView(subfolders, files, hooks) {
  const { showWho } = hooks;
  const table = el(".exlist" + (showWho ? "" : ".nowho"), { "data-exview": "list" });
  const colDefs = showWho
    ? [["Name", "name"], ["Type", "type"], ["Size", "size"], ["Uploader", "uploader"], ["Added", "date"]]
    : [["Name", "name"], ["Type", "type"], ["Size", "size"], ["Added", "date"]];
  const hd = el(".flrow.flhd", {}, colDefs.map(([label, key]) => {
    const on = hooks.sortActive === key;
    const cell = el("span" + (on ? ".on" : ""), { role: "button", onClick: () => hooks.onSortCol(key) }, [label]);
    if (on) { const car = iconEl("chev", "sm"); car.classList.add("sortcar"); if (hooks.dir === "asc") car.style.transform = "rotate(180deg)"; cell.append(car); }
    return cell;
  }));
  table.append(hd);
  subfolders.forEach((f, i) => {
    // P23: a list row can carry a few of the folder's tags inline after the name. The empty .flstar
    // spacer keeps the folder icon aligned with file rows (which lead with a star toggle).
    const nameCell = el("span.flnm", {}, [el("span.flstar.spacer"), iconEl("folder", "sm"), el("span.flnmtxt", {}, [f.name])]);
    const tagPrev = hooks.ftctx ? folderTagPreview(f, hooks.ftctx) : null;
    if (tagPrev) { tagPrev.classList.add("flntags"); nameCell.append(tagPrev); }
    const cells = [
      nameCell,
      el("span", {}, ["folder"]), el("span", {}, ["—"]),
      ...(showWho ? [el("span", {}, ["—"])] : []),
      el("span", {}, [`${f.count} file${f.count === 1 ? "" : "s"}`]),
    ];
    table.append(wireFolderEl(el(".flrow", {}, cells), f, i, hooks));
  });
  files.forEach((w, i) => {
    const star = el("button.flstar" + (w.starred ? ".on" : ""), { title: w.starred ? "Unstar" : "Star", onClick: (e) => { e.stopPropagation(); hooks.onStar(w); } }, [iconEl("star", "sm")]);
    const cells = [
      el("span.flnm", {}, [star, iconEl(KIND_ICON[w.kind] || "file", "sm"), baseName(w)]),
      el("span", {}, [(w.file_ext || "").toLowerCase() || "—"]),
      el("span", {}, [fmtBytes(w.bytes)]),
      ...(showWho ? [el("span", {}, [w.who?.name || "—"])] : []),
      el("span", {}, [w.created_at ? fmtDate(w.created_at) : "—"]),
    ];
    const row = el(".flrow" + (w.hidden ? ".ishidden" : ""), {}, cells);
    table.append(wireFileEl(row, w, i, hooks));
  });
  return table;
}

// ── grouping (grid) ───────────────────────────────────────────────────────────
const KIND_LABEL = { audio: "Audio", image: "Images", video: "Video", text: "Text", other: "Other" };
function dateBucket(ts) {
  if (!ts) return { rank: 5, label: "No date" };
  const d = new Date(ts), now = new Date();
  const day = 86400000, midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  if (d >= midnight) return { rank: 0, label: "Today" };
  if (d >= new Date(midnight - day)) return { rank: 1, label: "Yesterday" };
  if (d >= new Date(now - 7 * day)) return { rank: 2, label: "This week" };
  if (d >= new Date(now - 30 * day)) return { rank: 3, label: "This month" };
  return { rank: 4, label: "Earlier" };
}
// Partition the already-sorted file list into [{label, items}] for the chosen grouping (or null when
// grouping is off). Files keep their sorted order within a group; the groups themselves order
// sensibly (date by recency, the rest alphabetically).
function groupFiles(files, group) {
  if (!group || group === "none") return null;
  const keyOf = {
    kind: (w) => ({ rank: 0, label: KIND_LABEL[w.kind] || "Other" }),
    type: (w) => { const e = (w.file_ext || "").toUpperCase(); return { rank: 0, label: e || "No type" }; },
    uploader: (w) => ({ rank: 0, label: w.who?.name || "Unknown" }),
    date: (w) => dateBucket(w.created_at),
  }[group];
  if (!keyOf) return null;
  const map = new Map();
  for (const w of files) { const { rank, label } = keyOf(w); if (!map.has(label)) map.set(label, { rank, items: [] }); map.get(label).items.push(w); }
  const entries = [...map.entries()].map(([label, v]) => ({ label, rank: v.rank, items: v.items }));
  entries.sort((a, b) => (a.rank - b.rank) || a.label.localeCompare(b.label));
  return entries;
}

// sort a file list by key + direction. Comparators are defined ASCENDING (name A→Z, size small→large,
// date old→new, …); `desc` reverses. latest/oldest are the date column pre-directed.
function sortFiles(files, sort, dir, sortTag) {
  const out = files.slice();
  // P21 sortby:bpm_desc — order by the numeric part of the file's tag of that type (nulls last,
  // both directions); handled up front so the outer reverse can't float the nulls to the top.
  if (sort === "tag") {
    const num = (w) => {
      for (const t of (w.tags || [])) { const p = parseTag(t); if (p.type === sortTag) { const n = parseFloat(String(p.value).replace(/[^0-9.]/g, "")); if (!isNaN(n)) return n; } }
      return null;
    };
    out.sort((a, b) => { const x = num(a), y = num(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return dir === "asc" ? x - y : y - x; });
    return out;
  }
  const asc = {
    name: (a, b) => (a.title || "").localeCompare(b.title || ""),
    size: (a, b) => Number(a.bytes || 0) - Number(b.bytes || 0),
    date: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    type: (a, b) => (a.file_ext || "").toLowerCase().localeCompare((b.file_ext || "").toLowerCase()),
    uploader: (a, b) => (a.who?.name || "").localeCompare(b.who?.name || ""),
  };
  let key = sort, d = dir;
  if (sort === "latest") { key = "date"; d = "desc"; }
  else if (sort === "oldest") { key = "date"; d = "asc"; }
  out.sort(asc[key] || asc.date);
  if (d === "desc") out.reverse();
  return out;
}

// A multi-select filter menu (CANON §C.6): checkable rows that toggle IN PLACE without
// closing (unlike openMenu, which closes on pick), a Clear row when anything is selected,
// and outside-click / Esc to dismiss. `selected` is the live Set the button reads;
// `onChange` refreshes the button + repaints the contents after each toggle.
function openFilterMenu(anchor, options, selected, onChange) {
  // Toggle: a second click on an open filter's trigger closes it (same fix as openMenu, B8).
  if (anchor?.getAttribute?.("aria-expanded") === "true") { closeMenus(); return; }
  closeMenus();
  const menu = el(".menu.open", { role: "menu" });
  if (selected.size) {
    const clear = el("button.fclear", { role: "menuitem" }, ["Clear"]);
    clear.addEventListener("click", (e) => { e.stopPropagation(); selected.clear(); closeMenus(); onChange(); });
    menu.append(clear, el(".sep"));
  }
  // P8: searchable — a long facet (Uploader / Tag / many file-types) gets a search box so you can
  // find a value fast instead of scrolling. Rows below filter live by label substring.
  const rowsWrap = el("div", { style: "max-height:280px;overflow:auto" });
  if (options.length > 8) {
    const search = el("input.fsearch", { placeholder: "Search…", style: "width:100%;box-sizing:border-box;margin:2px 0 6px;padding:5px 8px;background:var(--surface);border:1px solid var(--line2);border-radius:var(--r);color:var(--ink);font:inherit;font-size:var(--fs-xs)" });
    search.addEventListener("click", (e) => e.stopPropagation());
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      rowsWrap.querySelectorAll("button").forEach((r) => { r.hidden = q && !r.textContent.toLowerCase().includes(q); });
    });
    menu.append(search);
    setTimeout(() => search.focus(), 0);
  }
  for (const [key, label] of options) {
    const on = selected.has(key);
    // Selected rows are shown by inversion (.sel filled highlight), not a ✓ glyph — the
    // same language as the single-selects and hover. The row toggles in place.
    const row = el("button" + (on ? ".sel" : ""), { role: "menuitemcheckbox", "aria-checked": on ? "true" : "false" }, [el("span", {}, [label])]);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const now = !selected.has(key);
      now ? selected.add(key) : selected.delete(key);
      row.setAttribute("aria-checked", now ? "true" : "false");
      row.classList.toggle("sel", now);
      onChange();
    });
    rowsWrap.append(row);
  }
  menu.append(rowsWrap);
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8)) + "px";
  menu.style.top = top + "px";
  anchor.setAttribute("aria-expanded", "true");
  menu._cleanup = () => { anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", onDoc, true); };
  function onDoc(e) { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenus(); }
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenus(); anchor.focus?.(); } });
  setTimeout(() => document.addEventListener("mousedown", onDoc, true));
  return menu;
}

// ── shared empty state (CANON §C.6 reusable pattern) ─────────────────────────
// C31: an empty FOLDER passes {dropzone:true} to read as a real drop target (a dashed panel) rather
// than a bare line of text — the pane's enableDropUpload already accepts an OS-file drop anywhere, so
// this is the visual affordance for it. Other empty states (search/starred/trash) stay plain.
function emptyState(icon, title, sub, { dropzone = false } = {}) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate" + (dropzone ? ".dropzone" : ""), {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}

function toggle(set, id) { set.has(id) ? set.delete(id) : set.add(id); }

// ── New folder (CANON §C.6) ──────────────────────────────────────────────────
// Create a folder under the folder currently in view. The write path is real
// (`create_folder` RPC on a server, a `save_folders` insert in My-files); in the
// `?demo=1` fixture there is no network, so we insert optimistically only. On success
// we push the row into `data.folders` and rerender from it — no refetch, matching the
// explorer's one-fetch/client-nav model.
function newFolder(data, state, rerender, parentId) {
  promptFolderName(async (name) => {
    let folder;
    if (isDemoQS()) {
      folder = { id: "f-new-" + Date.now(), name, parentId: parentId ?? null, archived: false, locked: false, count: 0, createdAt: new Date().toISOString() };
    } else {
      folder = await createFolder({ source: data.source, serverId: data.server?.id, parentId: parentId ?? null, name });
    }
    data.folders.push(folder);
    // reveal the new child: expand the parent (and the root) so it isn't hidden
    if (parentId != null) state.collapsed.delete(parentId);
    state.collapsed.delete("__root__");
    rerender();
    toast({ message: `Folder “${name}” created` });
  });
}

// B10 — make a folder from a set of works (drag-a-file-onto-another): prompt a name, create the
// folder at the current level, then move the works into it. The works leave the current view
// (they're now inside the new subfolder), matching Finder/Drive.
function makeFolderFrom(data, state, rerender, ids) {
  if (!ids?.length) return;
  promptFolderName(async (name) => {
    let folder;
    if (isDemoQS()) folder = { id: "f-new-" + Date.now(), name, parentId: state.folderId ?? null, archived: false, locked: false, count: ids.length, createdAt: new Date().toISOString() };
    else {
      folder = await createFolder({ source: data.source, serverId: data.server?.id, parentId: state.folderId ?? null, name });
      await moveToFolder({ source: data.source, works: ids, destFolderId: folder.id });
    }
    data.folders.push(folder);
    for (const w of data.files) if (ids.includes(w.id)) w.folderId = folder.id;
    state.selection.clear(); state.lastIdx = -1;
    if (state.folderId != null) state.collapsed?.delete?.(state.folderId);
    state.collapsed?.delete?.("__root__");
    rerender();
    toast({ message: `Made “${name}” from ${ids.length} file${ids.length > 1 ? "s" : ""}` });
  });
}

// true if `folderId` IS `maybeAncestor` or lies in its subtree — dropping `maybeAncestor` there
// would create a cycle. null folderId (root) never cycles.
function folderInSubtree(folders, maybeAncestor, folderId) {
  if (folderId == null) return false;
  let cur = folders.find((f) => f.id === folderId);
  while (cur) {
    if (cur.id === maybeAncestor) return true;
    cur = cur.parentId ? folders.find((f) => f.id === cur.parentId) : null;
  }
  return false;
}

// owner 2026-08-31 — drag a folder card onto another folder to reparent it. Server folders reuse
// move_to_folder (cycle-checked server-side too); personal folders are a direct save_folders update
// (folderInSubtree above is the only cycle guard there — see moveFolderTo in data.js).
async function moveFoldersInto(data, state, rerender, folderIds, destFolderId) {
  try {
    if (!isDemoQS()) { for (const id of folderIds) await moveFolderTo(data.source, id, destFolderId || null); }
    for (const f of data.folders) if (folderIds.includes(f.id)) f.parentId = destFolderId || null;
    state.selFolders.clear();
    rerender();
    const dest = data.folders.find((f) => f.id === destFolderId)?.name || rootLabel(data);
    toast({ message: `Moved ${folderIds.length} folder${folderIds.length > 1 ? "s" : ""} to “${dest}”` });
  } catch (e) { toast({ message: e?.message || "Couldn’t move the folder" }); }
}

// B10 — move works into an existing folder (drag onto a folder card).
async function moveInto(data, state, rerender, ids, folderId) {
  try {
    if (!isDemoQS()) await moveToFolder({ source: data.source, works: ids, destFolderId: folderId || null });
    for (const w of data.files) if (ids.includes(w.id)) w.folderId = folderId || null;
    state.selection.clear(); state.lastIdx = -1;
    rerender();
    const dest = data.folders.find((f) => f.id === folderId)?.name;
    toast({ message: `Moved ${ids.length} file${ids.length > 1 ? "s" : ""}${dest ? ` to “${dest}”` : ""}` });
  } catch (e) { toast({ message: e?.message || "Couldn’t move the files" }); }
}

function promptFolderName(onSubmit, nested = false) {
  promptText({ title: "New folder", placeholder: "Folder name", submit: "Create", busyLabel: "Creating…", fail: "Couldn’t create the folder", nested }, onSubmit);
}

// The reusable single-field prompt (gallery "Prompt" dialog): a text input over the scrim,
// the submit button disabled until it's non-empty and different from the prefill, Enter
// submits. onSubmit(value) may be async and may throw — a throw keeps the modal open and
// surfaces the reason as a toast so the user can retry. Used by New folder + Rename.
function promptText({ title, placeholder = "", value = "", submit = "Save", busyLabel = "Saving…", fail = "Couldn’t save", nested = false }, onSubmit) {
  const input = el("input", { placeholder, value });
  const go = el("button.btn.primary", { disabled: true }, [submit]);
  const cancel = el("button.btn.ghost", {}, ["Cancel"]);
  const modal = openModal({ title, body: el(".field", {}, [input]), footer: [cancel, go], nested });
  let busy = false;
  const sync = () => { const v = input.value.trim(); go.disabled = busy || !v || v === value.trim(); };
  const run = async () => {
    const v = input.value.trim();
    if (!v || busy || v === value.trim()) return;
    busy = true; go.textContent = busyLabel; sync();
    try { await onSubmit(v); modal.close(); }
    catch (e) { busy = false; go.textContent = submit; sync(); toast({ message: e?.message || fail }); }
  };
  input.addEventListener("input", sync);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
  go.addEventListener("click", run);
  cancel.addEventListener("click", () => modal.close());
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

// ── Move to folder (CANON §C.6 bulk bar) ─────────────────────────────────────
// Move the current selection into a folder the user picks. The write path is real
// (`move_to_folder` RPC per work on a server, a `saved_items` upsert in My-files); demo
// moves optimistically. On success the moved works get their new `folderId` and the
// screen rerenders — they leave the current folder view — and the selection clears.
function moveSelected(data, state, rerender) { moveIds(data, state, rerender, [...state.selection]); }

// Move a specific set of works (the bulk selection, or one card from its menu).
function moveIds(data, state, rerender, ids) {
  if (!ids.length) return;
  openMovePicker(data, state, async (destId) => {
    if (!isDemoQS()) await moveToFolder({ source: data.source, works: ids, destFolderId: destId });
    const set = new Set(ids);
    for (const w of data.files) if (set.has(w.id)) w.folderId = destId;
    state.selection.clear(); state.lastIdx = -1;
    rerender();
    toast({ message: `Moved ${ids.length} file${ids.length === 1 ? "" : "s"}` });
  });
}

// The bulk bar's Move-to-folder / Delete: route to the file-only or folder-only path unchanged when
// the selection is pure, and to a combined flow when a marquee has picked up BOTH (owner 2026-08-31
// — folders previously had no bulk actions at all).
function moveMixedSelected(data, state, rerender) {
  const fileIds = [...state.selection], folderIds = [...state.selFolders];
  if (folderIds.length && fileIds.length) openMixedMovePicker(data, state, rerender, fileIds, folderIds);
  else if (folderIds.length) openFolderMovePicker(data, state, rerender, folderIds);
  else moveIds(data, state, rerender, fileIds);
}
function deleteMixedSelected(data, state, rerender) {
  const fileIds = [...state.selection], folderIds = [...state.selFolders];
  if (folderIds.length) deleteFoldersFlow(data, state, rerender, folderIds, fileIds);   // one confirm covers both halves
  else trashSelected(data, state, rerender);
}

// A mixed files+folders selection needs its own destination picker: files carry no restriction,
// but a folder can't move into itself or its own subtree (folderInSubtree, same guard the drag path
// and the folder-only picker use). Writes both halves inline rather than delegating to
// moveIds/openFolderMovePicker, which each open their own picker and would double up the UI.
function openMixedMovePicker(data, state, rerender, fileIds, folderIds) {
  const well = el(".movetree");
  const hasLocked = data.folders.some((f) => f.locked);
  const n = fileIds.length + folderIds.length;
  const body = el("div", {}, [
    el(".ulab", {}, ["Destination in ", el("b", {}, [rootLabel(data)])]),
    well,
    ...(hasLocked ? [el(".svnote", {}, [iconEl("move", "sm"), el("span", {}, ["Locked folders can’t receive files."])])] : []),
  ]);
  const cancel = el("button.btn", {}, ["Cancel"]);
  const go = el("button.btn.primary", { disabled: true }, ["Move here"]);
  const modal = openModal({ title: `Move ${n} item${n === 1 ? "" : "s"}`, body, footer: [cancel, go], size: "wide" });

  let dest, hasSel = false, busy = false;
  const rowById = new Map();
  const select = (id) => {
    well.querySelectorAll(".ftrow.on").forEach((r) => r.classList.remove("on"));
    rowById.get(id ?? "__root__")?.classList.add("on");
    dest = id; hasSel = true; go.disabled = busy;
  };
  const pickRow = (id, label, depth, locked) => {
    const row = el(`button.ftrow.lvl${Math.min(depth, 3)}` + (locked ? ".archived" : ""), { disabled: !!locked });
    row.append(el("span.tw"));
    const ic = iconEl(locked ? "lock" : "folder", "sm"); ic.classList.add("fic");
    row.append(ic, el("span.fn", {}, [label]));
    if (locked) { const l = iconEl("lock", "sm"); l.classList.add("ftlock"); row.append(l); }
    if (!locked) row.addEventListener("click", () => select(id));
    rowById.set(id ?? "__root__", row);
    return row;
  };
  const renderWell = () => {
    rowById.clear();
    const rows = [pickRow(null, rootLabel(data), 0, false)];
    (function walk(pid, depth) {
      for (const f of data.folders.filter((x) => (x.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name))) {
        if (folderIds.includes(f.id) || folderIds.some((id) => folderInSubtree(data.folders, id, f.id))) continue;
        rows.push(pickRow(f.id, f.name, depth, f.locked));
        walk(f.id, depth + 1);
      }
    })(null, 1);
    well.replaceChildren(...rows);
  };
  renderWell();

  cancel.addEventListener("click", () => modal.close());
  go.addEventListener("click", async () => {
    if (!hasSel || busy) return;
    busy = true; go.disabled = true; go.textContent = "Moving…";
    try {
      if (!isDemoQS()) {
        if (fileIds.length) await moveToFolder({ source: data.source, works: fileIds, destFolderId: dest });
        for (const id of folderIds) await moveFolderTo(data.source, id, dest ?? null);
      }
      const fset = new Set(fileIds);
      for (const w of data.files) if (fset.has(w.id)) w.folderId = dest ?? null;
      for (const f of data.folders) if (folderIds.includes(f.id)) f.parentId = dest ?? null;
      state.selection.clear(); state.selFolders.clear(); state.lastIdx = -1; state.lastFolderIdx = -1;
      modal.close();
      rerender();
      toast({ message: `Moved ${n} item${n === 1 ? "" : "s"}` });
    } catch (e) {
      busy = false; go.disabled = false; go.textContent = "Move here";
      toast({ message: e?.message || "Couldn’t move the selection" });
    }
  });
}

// The destination picker (gallery "Move to folder" modal): the folder tree in a scroll
// well (reuses .ftrow), a locked server folder can't receive files (disabled row), and a
// New-folder shortcut creates a destination under the current highlight without leaving
// the dialog. onPick(destId) may be async and may throw — a throw keeps the modal open
// and toasts the reason. destId is null for the server/personal root.
function openMovePicker(data, state, onPick) {
  const well = el(".movetree");
  const hasLocked = data.folders.some((f) => f.locked);
  const body = el("div", {}, [
    el(".ulab", {}, ["Destination in ", el("b", {}, [rootLabel(data)])]),
    well,
    ...(hasLocked ? [el(".svnote", {}, [iconEl("move", "sm"), el("span", {}, ["Locked folders can’t receive files."])])] : []),
  ]);
  const newBtn = el("button.btn.ghost", { style: "margin-right:auto" }, ["New folder"]);
  const cancel = el("button.btn", {}, ["Cancel"]);
  const go = el("button.btn.primary", { disabled: true }, ["Move here"]);
  const modal = openModal({ title: "Move to folder", body, footer: [newBtn, cancel, go], size: "wide" });

  let dest, hasSel = false, busy = false;
  const rowById = new Map();
  const select = (id) => {
    well.querySelectorAll(".ftrow.on").forEach((r) => r.classList.remove("on"));
    rowById.get(id ?? "__root__")?.classList.add("on");
    dest = id; hasSel = true; go.disabled = busy;
  };
  const pickRow = (id, label, depth, locked) => {
    const row = el(`button.ftrow.lvl${Math.min(depth, 3)}` + (locked ? ".archived" : ""), { disabled: !!locked });
    row.append(el("span.tw"));
    const ic = iconEl(locked ? "lock" : "folder", "sm"); ic.classList.add("fic");
    row.append(ic, el("span.fn", {}, [label]));
    if (locked) { const l = iconEl("lock", "sm"); l.classList.add("ftlock"); row.append(l); }
    if (!locked) row.addEventListener("click", () => select(id));
    rowById.set(id ?? "__root__", row);
    return row;
  };
  const renderWell = () => {
    rowById.clear();
    const rows = [pickRow(null, rootLabel(data), 0, false)];
    (function walk(pid, depth) {
      for (const f of data.folders.filter((x) => (x.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name))) {
        rows.push(pickRow(f.id, f.name, depth, f.locked));
        walk(f.id, depth + 1);
      }
    })(null, 1);
    well.replaceChildren(...rows);
    if (hasSel) { const r = rowById.get(dest ?? "__root__"); if (r) r.classList.add("on"); }
  };
  renderWell();

  // nested:true — this prompt stacks ON the move-picker and returns to it, so it must NOT
  // close the picker (single-instance would otherwise detach the well we re-render below).
  newBtn.addEventListener("click", () => promptFolderName(async (name) => {
    const parent = hasSel ? dest : null;
    let folder;
    if (isDemoQS()) folder = { id: "f-new-" + Date.now(), name, parentId: parent ?? null, archived: false, locked: false, count: 0, createdAt: new Date().toISOString() };
    else folder = await createFolder({ source: data.source, serverId: data.server?.id, parentId: parent ?? null, name });
    data.folders.push(folder);
    renderWell();
    select(folder.id);
    toast({ message: `Folder “${name}” created` });
  }, true));
  cancel.addEventListener("click", () => modal.close());
  go.addEventListener("click", async () => {
    if (!hasSel || busy) return;
    busy = true; go.disabled = true; go.textContent = "Moving…";
    try { await onPick(dest); modal.close(); }
    catch (e) { busy = false; go.disabled = false; go.textContent = "Move here"; toast({ message: e?.message || "Couldn’t move the files" }); }
  });
}

// ── Trash (CANON §C.6 / §E.3 · gallery B19) ──────────────────────────────────
// Soft-deleted works, kept 30 days then hard-purged by the scheduled job. Entering the
// view fetches the caller's trashed works in live mode (they persist across sessions);
// the demo fixture seeds a few. Delete→Trash / Restore / Delete-forever / Empty all write
// through (§E.3, plain client writes) and keep data._trash + data.files in sync — no
// refetch, matching the explorer's one-fetch model.
const TRASH_DAYS = 30;
function daysLeft(deletedAt) { return Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - new Date(deletedAt).getTime()) / 86400000)); }
function fmtWhen(ts) { const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`; }

// enter the Trash smart-folder; in live mode refresh the list from the DB first
function enterTrash(data, state, rerender) {
  state.trash = true; state.selection.clear(); state.lastIdx = -1;
  rerender();
  if (!isDemoQS()) {
    loadTrash({ source: data.source, serverId: data.server?.id, membersById: data.membersById || {} })
      .then((rows) => { data._trash = rows; if (state.trash) rerender(); })
      .catch(() => {});
  }
}

// Delete the current selection → Trash (recoverable). The works leave the folder view and
// appear in Trash; an Undo toast restores them in one action.
function trashSelected(data, state, rerender) { trashIds(data, state, rerender, [...state.selection]); }

// Soft-delete a specific set of works → Trash (the bulk selection, or one card menu).
function trashIds(data, state, rerender, ids) {
  if (!ids.length) return;
  const set = new Set(ids);
  const moved = data.files.filter((w) => set.has(w.id));
  (isDemoQS() ? Promise.resolve() : trashWorks(ids)).then(() => {
    const now = new Date().toISOString();
    data.files = data.files.filter((w) => !ids.includes(w.id));
    for (const w of moved) data._trash.unshift({ ...w, deletedAt: now });
    state.selection.clear(); state.lastIdx = -1;
    rerender();
    toast({ message: `Moved ${ids.length} to Trash`, icon: "trash", action: { label: "Undo", onClick: () => restoreMany(data, state, rerender, ids) } });
  }).catch((e) => toast({ message: e?.message || "Couldn’t delete" }));
}

// restore several works out of Trash (the Undo path); each is a real deleted_at=null write
function restoreMany(data, state, rerender, ids) {
  const set = new Set(ids);
  const back = data._trash.filter((w) => set.has(w.id));
  (isDemoQS() ? Promise.resolve() : Promise.all(ids.map(restoreWork))).then(() => {
    data._trash = data._trash.filter((w) => !set.has(w.id));
    for (const w of back) { const { deletedAt, ...rest } = w; data.files.push(rest); }
    rerender();
  }).catch((e) => toast({ message: e?.message || "Couldn’t restore" }));
}

function paintTrash(pane, data, state, rerender) {
  const rows = data._trash || [];
  const panehd = el(".panehd", {}, [el(".crumbs", {}, [el("b", {}, ["Trash"])])]);
  const view = el(".exview", { "data-exview": "trash" });
  const empty = el("button.btn.sm.danger", { disabled: !rows.length, onClick: () => emptyNow(data, rerender) }, [iconEl("trash", "sm"), "Empty trash now"]);
  view.append(el(".trashnote", {}, [iconEl("trash", "sm"), el("span", {}, ["Items are permanently deleted ", el("b", {}, ["30 days"]), " after they’re trashed."]), empty]));
  if (!rows.length) view.append(emptyState("trash", "Trash is empty", "Files you delete are kept here for 30 days, then removed."));
  else for (const w of rows) view.append(trashRow(w, data, rerender));
  pane.replaceChildren(panehd, el(".panebody", {}, [view]));
}

function trashRow(w, data, rerender) {
  const left = daysLeft(w.deletedAt);
  const acts = el(".tacts", {}, [
    el("button.btn.sm", { onClick: () => restoreMany(data, null, rerender, [w.id]) }, [iconEl("undo", "sm"), "Restore"]),
    el("button.btn.sm.danger", { onClick: () => purgeRow(data, rerender, w) }, ["Delete forever"]),
  ]);
  return el(".trrow", {}, [
    el(".tmed", {}, [trashThumb(w)]),
    el(".tinfo", {}, [el(".trname", {}, [w.title || w.name || "untitled"]), el(".tsub", {}, [`${w.who?.name ? w.who.name + " · " : ""}trashed ${fmtWhen(w.deletedAt)}`])]),
    el("span.tleft" + (left <= 7 ? ".warn" : ""), {}, [`${left}d left`]),
    acts,
  ]);
}

function trashThumb(w) {
  const url = mediaUrl(w);
  if (w.kind === "image" && url) return el("img", { src: url, alt: "", loading: "lazy" });
  return iconEl(KIND_ICON[w.kind] || "file", "sm");
}

function purgeRow(data, rerender, w) {
  (isDemoQS() ? Promise.resolve() : purgeWork(w.id)).then(async () => {
    data._trash = data._trash.filter((x) => x.id !== w.id);
    // a hard purge frees the blob's bytes server-side → refresh the footer meter (K10)
    if (!isDemoQS()) await refreshStorage(data);
    rerender();
    toast({ message: "Deleted forever" });
  }).catch((e) => toast({ message: e?.message || "Couldn’t delete" }));
}

function emptyNow(data, rerender) {
  if (!data._trash.length) return;
  (isDemoQS() ? Promise.resolve() : emptyTrash({ source: data.source, serverId: data.server?.id })).then(async () => {
    data._trash = [];
    if (!isDemoQS()) await refreshStorage(data);   // freed bytes → refresh the footer meter (K10)
    rerender(); toast({ message: "Trash emptied" });
  }).catch((e) => toast({ message: e?.message || "Couldn’t empty Trash" }));
}

// ── Star (CANON §C.6 / §E.3) ─────────────────────────────────────────────────
// Toggle a work's star — a real starred_items write (demo optimistic), reflected on the
// card IN PLACE so it doesn't clear the selection. In the Starred filter view, unstarring
// drops the card, so rerender there to keep the flat grid (+ empty state) correct.
function toggleStar(data, state, rerender, w, after) {
  const next = !w.starred;
  (isDemoQS() ? Promise.resolve() : (next ? starWork(w.id) : unstarWork(w.id))).then(() => {
    w.starred = next;
    if (state.starred && !next) { rerender(); after?.(); return; }
    const card = document.querySelector(`.card[data-id="${cssEscape(w.id)}"]`);
    if (card) {
      card.classList.toggle("starred", next);
      const sb = card.querySelector('.cardacts [data-act="star"]');
      if (sb) { sb.classList.toggle("starred", next); sb.title = next ? "Unstar" : "Star"; }
    }
    after?.();   // let an open details pane repaint its own star label
  }).catch((e) => toast({ message: e?.message || "Couldn’t update star" }));
}
function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }

// ── Card ⋯ / right-click menu (CANON §C.6, gallery card menu) ─────────────────
// Only actions with a real write path today — Star, Save to my files, Rename, Move to…,
// Delete. No stubs: Download waits on the R2 read env, Copy link on share_links, Hide from
// library on the Show-hidden filter (each returns as its backend lands). Save is omitted on
// a personal file (already yours). Anchored to the ⋯ button (or the card, for right-click).
function openCardMenu(data, state, rerender, w, anchor, at) {
  const personal = data.source === "personal";
  openMenu(anchor, [
    // P28: Open is the first item on the right-click menu (a native context menu leads with it)
    { label: "Open", icon: "expand", onClick: () => state._openFile?.(w) },
    { label: w.starred ? "Unstar" : "Star", icon: "star", onClick: () => toggleStar(data, state, rerender, w) },
    ...(personal ? [] : [{ label: "Save to my files", icon: "save", onClick: () => saveOne(w) }]),
    { label: "Share…", icon: "users", onClick: () => openShareDialog(w) },
    { label: "Copy link", icon: "link", onClick: () => copyLink(w) },
    ...writeMenuItems(data, state, rerender, w),
  ], { at });
}

// B13: the work-mutating menu items — shown ONLY to someone who can actually write the work
// (its author, or a server admin). A member seeing Rename/Delete/Hide/Change-visibility/Move on
// another member's file was a dead affordance (the writers now throw on a non-owner, K8/B13 —
// this stops offering the action at all). Personal files (no authorId in that shape) and demo
// (isAdmin) are always writable. The reader actions (Star/Save/Share/Copy link) stay ungated.
// Ships as one version (a menu-inventory gate, not a redesign — per owner's "ship small").
function canWriteWork(data, w) {
  return !!data.isAdmin || w.authorId == null || w.authorId === data.me?.id;
}
function writeMenuItems(data, state, rerender, w, hooks) {
  if (!canWriteWork(data, w)) return [];
  const repaint = hooks?.repaint, close = hooks?.close;
  return [
    { label: "Change visibility…", icon: "globe", onClick: () => openVisibilityDialog(w) },
    { label: "Rename", icon: "pen", onClick: () => renameFile(data, state, rerender, w, repaint) },
    { label: "Move to…", icon: "folder", onClick: () => { close?.(); moveIds(data, state, rerender, [w.id]); } },
    { label: w.hidden ? "Show in library" : "Hide from library", icon: "hide", onClick: () => toggleHidden(data, state, rerender, w, repaint) },
    { sep: true },
    { label: "Delete", icon: "trash", danger: true, onClick: () => { close?.(); trashIds(data, state, rerender, [w.id]); } },
  ];
}

// The SAME actions the card ⋯ menu offers, handed to the open Details pane (P5.9d parity)
// so a file can be starred/renamed/moved/hidden/deleted from the viewer, not only its card.
// One source of write logic: this reuses the card handlers, threading the pane's own hooks —
// `repaint` re-renders the pane in place (star/rename/hide, which keep it open), `close`
// dismisses it first (Move opens a picker; Delete removes the file from view). The grid
// behind is refreshed by each handler's own rerender, so both surfaces stay in sync.
export function detailMenuItems(data, state, rerender, w, { repaint, close }) {
  const personal = data.source === "personal";
  return [
    { label: w.starred ? "Unstar" : "Star", icon: "star", onClick: () => toggleStar(data, state, rerender, w, repaint) },
    ...(personal ? [] : [{ label: "Save to my files", icon: "save", onClick: () => saveOne(w) }]),
    { label: "Share…", icon: "users", onClick: () => openShareDialog(w) },
    { label: "Copy link", icon: "link", onClick: () => copyLink(w) },
    ...writeMenuItems(data, state, rerender, w, { repaint, close }),   // B13: gated by ownership
  ];
}

// Hide/show a work in the library view (#55) — a real works.hidden toggle. When hiding
// while Show-hidden is off the card leaves the view, so rerender to reflect it.
function toggleHidden(data, state, rerender, w, after) {
  const next = !w.hidden;
  (isDemoQS() ? Promise.resolve() : setHidden(w.id, next)).then(() => {
    w.hidden = next;
    rerender();
    toast({ message: next ? "Hidden from the library" : "Shown in the library", icon: "hide" });
    after?.();   // details pane stays open on the file; repaint flips its Hide/Show label
  }).catch((e) => toast({ message: e?.message || "Couldn’t update" }));
}

function saveOne(w) {
  (isDemoQS() ? Promise.resolve() : saveToFiles(w.id)).then(() => toast({ message: "Saved to your files", icon: "save" }))
    .catch((e) => toast({ message: e?.message || "Couldn’t save" }));
}

// Bulk Download (selection) — download each selected work that has stored bytes. A true
// zip-as-one-file is a later enhancement; this is honest per-file download. Files with no
// bytes yet (nothing uploaded) are skipped, with one message if the whole selection is empty.
function downloadSelected(state) {
  const works = (state._files || []).filter((w) => state.selection.has(w.id));
  const ready = works.filter((w) => mediaUrl(w));
  if (!ready.length) { toast({ message: "None of the selected files have stored bytes yet." }); return; }
  if (ready.length > 5) toast({ message: `Starting ${ready.length} downloads…`, icon: "download" });
  ready.forEach((w) => downloadWork(w));
}

// Copy link (CANON #39) — mint a share_links token and copy the /shared/:token URL. The
// clipboard write can be blocked (permissions / no gesture), so it falls back to showing
// the URL in the toast so the link is never lost.
async function copyLink(w) {
  try {
    const token = await createShareLink(w.id);
    await copyToClipboard(shareUrl(token), { ok: "Link copied — anyone with it can view" });
  } catch (e) { toast({ message: e?.message || "Couldn’t create the link" }); }
}

// Share dialog (CANON §39/#61) — set visibility (Public/Server/Private → works.visibility)
// and manage the "anyone with the link" tokens: list active links, copy or revoke each,
// create a new one. All writes are RLS-fenced; demo mutates the in-dialog list optimistically.
// P7: visibility is a property of the FILE, set here (not in the share dialog). A small picker
// reusing the Public/Server/Private segmented control. To publish a file on your profile you
// make it Public here (typically on a personal copy saved to My files).
function openVisibilityDialog(w) {
  const demo = isDemoQS();
  const seg = VisibilitySeg({
    value: visFromDb(w.visibility || "public"),
    onChange: async (v) => {
      try { w.visibility = demo ? ({ public: "public", server: "server", private: "personal" })[v] : await setVisibility(w.id, v); toast({ message: "Visibility updated", icon: "check" }); }
      catch (e) { toast({ message: e?.message || "Couldn’t update who can see this" }); }
    },
  });
  const done = Button({ label: "Done", variant: "primary" });
  const { close } = openModal({ title: `Who can see “${w.title || w.name || "file"}”`, body: el("div", { style: "min-width:320px" }, [seg]), footer: [done] });
  done.addEventListener("click", () => close());
}

function openShareDialog(w) {
  // P7: the Share dialog is LINKS ONLY (Google-Drive style). Visibility used to live here, but
  // "share to Public/Private" made no sense in a share dialog — visibility is a property of the
  // file (set from the card ⋯ menu), and to publish you save a copy to your files and make that
  // public. So this dialog just mints/copies/revokes a read-only "anyone with the link" link.
  const demo = isDemoQS();
  const links = el(".sharelinks");
  let list = [];
  const paint = () => links.replaceChildren(
    ...(list.length ? list.map(linkRow) : [el(".sharenone", {}, ["No active link yet."])]),
    Button({ label: "Create link", size: "sm", icon: "plus", onClick: create }),
  );
  function linkRow(l) {
    const url = shareUrl(l.token);
    return el(".sharerow2", {}, [
      el(".field", { style: "flex:1;min-width:0" }, [iconEl("link", "sm"), el("input", { readonly: true, value: url })]),
      Button({ label: "Copy", size: "sm", icon: "copy", onClick: () => copyToClipboard(url, { ok: "Link copied" }) }),
      Button({ label: "Revoke", size: "sm", variant: "ghost", onClick: async () => {
        try { if (!demo) await revokeShareLink(l.token); list = list.filter((x) => x.token !== l.token); paint(); toast({ message: "Link revoked" }); }
        catch (e) { toast({ message: e?.message || "Couldn’t revoke the link" }); }
      } }),
    ]);
  }
  async function create() {
    try { const token = await createShareLink(w.id); list = [{ token, created_at: new Date().toISOString() }, ...list]; paint(); }
    catch (e) { toast({ message: e?.message || "Couldn’t create the link" }); }
  }
  paint();

  const body = el("div", { style: "min-width:340px" }, [
    el("label.ulab", {}, ["Anyone with the link"]),
    el("p", { style: "color:var(--muted);font-size:var(--fs-xs);margin:2px 0 10px" }, ["Anyone with the link can view this file — no account needed. To publish it on your profile, save it to your files and set that copy public."]),
    links,
  ]);
  const done = Button({ label: "Done", variant: "primary" });
  const { close } = openModal({ title: `Share “${w.title || w.name || "file"}”`, body, footer: [done] });
  done.addEventListener("click", () => close());
  if (!demo) loadShareLinks(w.id).then((rows) => { list = rows; paint(); }).catch(() => {});
}

function renameFile(data, state, rerender, w, after) {
  promptText({ title: "Rename", placeholder: "Name", value: w.title || w.name || "", submit: "Rename", busyLabel: "Renaming…", fail: "Couldn’t rename" }, async (name) => {
    if (!isDemoQS()) await renameWork(w.id, name);
    w.title = name; w.name = name;
    rerender();
    toast({ message: "Renamed" });
    after?.();   // details pane repaints its title/filename from the mutated work
  });
}
