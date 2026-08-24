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

import { el, toast, openMenu, closeMenus, openModal } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { createFolder, moveToFolder, trashWorks, restoreWork, purgeWork, emptyTrash, loadTrash, starWork, unstarWork, saveToFiles, renameWork, setHidden } from "../data.js";
import { workCard, folderCard, mediaUrl, KIND_ICON } from "../cards.js";
import { channelColumn } from "./workspace.js";
import { openUpload } from "./upload.js";
import { openDetails } from "./details.js";

const VIEWS = { grid: "Grid", list: "List", feed: "Feed" };
const PREVIEWABLE = new Set(["image", "video", "audio"]);
// Filters (CANON §C.6): Type/Channel/Uploader/Tag are multi-select (an empty set = no
// filter, the union within a facet, the intersection across facets); Date and Sort are
// single-select. Type maps to works.kind ("other" = Projects/archives). Channel/Uploader/
// Tag options are derived from the data. Sort keys drive the comparator in sortFiles().
const TYPES = [["image", "Images"], ["audio", "Audio"], ["video", "Video"], ["text", "Text"], ["other", "Projects"]];
const SORTS = [["latest", "Latest"], ["oldest", "Oldest"], ["name", "Name"], ["size", "Size"]];
const SORT_LABEL = Object.fromEntries(SORTS);
// Date windows measured back from now; "today" is since local midnight, the rest are
// rolling N-day windows. "any" is the no-filter default.
const DATES = [["any", "Anytime"], ["today", "Today"], ["week", "This week"], ["month", "This month"], ["year", "This year"]];
const DATE_LABEL = Object.fromEntries(DATES);
const DATE_DAYS = { week: 7, month: 30, year: 365 };

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

export function renderExplorer(data, view = {}) {
  const screen = el("section.screen", { "data-screen": "explorer" });

  // no server yet (member of nothing) — a plain empty state, no chrome to browse
  if (data.noServer) {
    screen.append(el(".pane", {}, [emptyState("folder", "No server yet", "Create or join a server, then its files live here.")]));
    return screen;
  }

  // local navigation state — one fetch already holds the whole tree + all works
  const state = {
    folderId: view.folderId ?? data.currentFolderId ?? null,
    mode: VIEWS[view.mode] ? view.mode : "grid",
    query: "",
    collapsed: new Set(),   // folder ids whose children are hidden in the tree
    selection: new Set(),   // selected work ids (Google-Drive model, §C.6)
    lastIdx: -1,            // anchor for Shift-click range
    types: new Set(),       // kind filter — empty = all (image/audio/video/text/other)
    channels: new Set(),    // by placement channel name (server only)
    uploaders: new Set(),   // by author name (server only)
    tags: new Set(),        // by content tag
    date: "any",            // any/today/week/month/year
    sort: "latest",        // latest/oldest/name/size
    dir: "desc",           // sort direction
    trash: false,           // the Trash smart-folder is open
    starred: false,         // the Starred quick-filter is on (flat grid of starred works)
    showHidden: false,      // reveal hidden/utility works in the library view (#55)
  };
  // trashed rows shown in the Trash view: seeded from the demo fixture, refreshed from
  // the DB on entering Trash in live mode, and kept in sync by the row actions.
  if (!data._trash) data._trash = (data.trash || []).slice();

  const personal = data.source === "personal";
  const pane = el(".pane");
  const tree = el("nav.filetree", { "data-tree": personal ? "personal" : "server" });
  const layout = el(".explayout", { "data-source": personal ? "personal" : "server" }, [tree, pane]);

  // Server mount keeps the channel column beside the browser (Files is a channel,
  // never a dead-end). The personal My-files mount hides it — its own tree is the
  // navigation and it carries no server chrome (CANON §C.6).
  if (personal) screen.append(layout);
  else screen.append(channelColumn(data, { filesActive: true }), layout);

  const rerender = () => { paint(tree, pane, data, state, rerender); };
  rerender();

  // Esc clears the selection; ⌘/Ctrl-A selects everything in view. A single document
  // listener, self-cleaning once this screen leaves the DOM (a nav swaps #stage).
  const onKey = (e) => {
    if (!screen.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (document.querySelector(".sheet")) return;   // the details overlay owns keys while open
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "Escape" && state.selection.size) { state.selection.clear(); state.lastIdx = -1; state._refresh?.(); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A") && state.mode === "grid") {
      e.preventDefault();
      for (const w of state._files || []) state.selection.add(w.id);
      state._refresh?.();
    }
  };
  document.addEventListener("keydown", onKey);
  return screen;
}

// what the tree root / breadcrumb root reads as, and where a folder link points
function rootLabel(data) { return data.source === "personal" ? (data.rootLabel || "My files") : data.server.name; }
function filesHref(data, folderId) {
  const base = data.source === "personal" ? "/files" : `/s/${data.server.id}/files`;
  const q = new URLSearchParams();
  if (folderId) q.set("folder", folderId);
  if (isDemoQS()) q.set("demo", "1");
  const s = q.toString();
  return base + (s ? `?${s}` : "");
}
function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }

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
  paintTree(tree, data, state, rerender);

  if (state.trash) { paintTrash(pane, data, state, rerender); return; }

  const searching = state.query.trim().length > 0;

  // breadcrumb (browsing) OR a search-results indicator (searching)
  const crumbs = el(".crumbs", { id: "exCrumbs" });
  const path = crumbPath(data.folders, state.folderId);
  crumbs.append(el("button.crumbroot", { onClick: () => { state.folderId = null; rerender(); } }, [rootLabel(data)]));
  path.forEach((f, i) => {
    crumbs.append(el("span.sl", {}, ["/"]));
    if (i === path.length - 1) crumbs.append(el("b", {}, [f.name]));
    else crumbs.append(el("button", { onClick: () => { state.folderId = f.id; rerender(); } }, [f.name]));
  });
  const searchState = el(".crumbs.exsearchstate", {}, [
    (() => { const s = iconEl("search", "sm"); s.style.color = "var(--muted)"; return s; })(),
    el("span", {}, ["Search results for ", el("b", {}, [state.query])]),
    el("button.btn.ghost.sm", { onClick: () => { state.query = ""; rerender(); } }, ["Clear search"]),
  ]);

  const viewBtn = el("button.btn", { "aria-haspopup": "menu", onClick: (e) => openMenu(e.currentTarget, Object.entries(VIEWS).map(([k, v]) => ({ label: v, onClick: () => { state.mode = k; rerender(); } }))) }, [el("span", {}, [VIEWS[state.mode]]), iconEl("chev", "sm")]);
  // Show-hidden (#55): a tucked toggle — hidden/utility works are omitted from the library
  // view unless this is on. It reveals them (dimmed); it does not rebuild the toolbar.
  const hiddenBtn = el("button.iconbtn" + (state.showHidden ? ".on" : ""), { title: state.showHidden ? "Hiding hidden files" : "Show hidden files", "aria-pressed": state.showHidden ? "true" : "false", onClick: () => { state.showHidden = !state.showHidden; hiddenBtn.classList.toggle("on", state.showHidden); hiddenBtn.setAttribute("aria-pressed", state.showHidden ? "true" : "false"); hiddenBtn.setAttribute("title", state.showHidden ? "Hiding hidden files" : "Show hidden files"); repaintBody(); } }, [iconEl("hide", "sm")]);
  const panehd = el(".panehd", {}, [
    searching ? searchState : crumbs,
    el(".hdctl", {}, [hiddenBtn, viewBtn]),
  ]);

  // toolbar — search · filters (Type/Channel/Uploader/Tag/Date/Sort) · New folder · Upload
  const personal = data.source === "personal";
  const search = el(".field", {}, [iconEl("search", "sm"),
    el("input", { placeholder: personal ? "Search your files" : "Search this server's files", value: state.query, onInput: (e) => { state.query = e.target.value; repaintBody(); } }),
  ]);
  const uploadOpts = personal ? { visibility: "private" } : { visibility: "server", serverId: data.server.id, folderId: state.folderId };

  // Facet options derived from ALL files (stable across folder nav, not just the folder
  // in view). Type is a fixed set; Channel/Uploader/Tag come from the data.
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  const channelOpts = uniq(data.files.map((w) => w.channelName)).map((c) => [c, c]);
  const uploaderOpts = uniq(data.files.map((w) => w.who?.name)).map((u) => [u, u]);
  const tagOpts = uniq(data.files.flatMap((w) => w.tags || [])).map((t) => [t, t]);

  // a multi-select filter button: filled + counted when it has selections, disabled when
  // its facet has no options. The menu toggles in place; refreshBtn keeps the count live
  // (repaintBody rebuilds only the body, never the toolbar, so the button self-updates).
  const multiBtn = (label, set, options) => {
    const b = el("button.btn.exfilter", { "aria-haspopup": "menu", disabled: options.length === 0 });
    const refreshBtn = () => {
      const n = set.size;
      b.replaceChildren(label, ...(n ? [el("span.fc", {}, [String(n)])] : []), iconEl("chev", "sm"));
      b.classList.toggle("on", n > 0);
    };
    refreshBtn();
    b.addEventListener("click", () => openFilterMenu(b, options, set, () => { refreshBtn(); repaintBody(); }));
    return b;
  };
  const typeBtn = multiBtn("Type", state.types, TYPES);
  const tagBtn = multiBtn("Tag", state.tags, tagOpts);
  // Channel + Uploader are server context only (personal files carry neither)
  const chanBtn = personal ? null : multiBtn("Channel", state.channels, channelOpts);
  const uploaderBtn = personal ? null : multiBtn("Uploader", state.uploaders, uploaderOpts);

  // Date + Sort are single-select (openMenu with a ✓ prefix; the button label updates)
  const dateBtn = el("button.btn.exfilter" + (state.date !== "any" ? ".on" : ""), { "aria-haspopup": "menu" }, [el("span.dlbl", {}, [state.date === "any" ? "Date" : DATE_LABEL[state.date]]), iconEl("chev", "sm")]);
  dateBtn.addEventListener("click", () => openMenu(dateBtn, DATES.map(([k, lbl]) => ({ label: (state.date === k ? "✓ " : "") + lbl, onClick: () => { state.date = k; dateBtn.querySelector(".dlbl").textContent = k === "any" ? "Date" : DATE_LABEL[k]; dateBtn.classList.toggle("on", k !== "any"); repaintBody(); } }))));
  const sortBtn = el("button.btn.exfilter", { "aria-haspopup": "menu" }, [el("span.slbl", {}, [SORT_LABEL[state.sort]]), iconEl("chev", "sm")]);
  sortBtn.addEventListener("click", () => openMenu(sortBtn, SORTS.map(([k, lbl]) => ({ label: (state.sort === k ? "✓ " : "") + lbl, onClick: () => { state.sort = k; sortBtn.querySelector(".slbl").textContent = SORT_LABEL[k]; repaintBody(); } }))));
  const dirBtn = el("button.iconbtn", { title: state.dir === "desc" ? "Descending" : "Ascending", "aria-pressed": state.dir === "asc" ? "true" : "false", onClick: () => { state.dir = state.dir === "desc" ? "asc" : "desc"; dirBtn.setAttribute("title", state.dir === "desc" ? "Descending" : "Ascending"); dirBtn.setAttribute("aria-pressed", state.dir === "asc" ? "true" : "false"); dirBtn.firstChild.style.transform = state.dir === "asc" ? "rotate(180deg)" : ""; repaintBody(); } }, [(() => { const g = iconEl("chev", "sm"); if (state.dir === "asc") g.style.transform = "rotate(180deg)"; return g; })()]);

  // New folder + Upload travel together as one right-aligned unit (.tbactions), so a
  // narrow pane wraps them as a pair to a second row instead of orphaning Upload.
  // Starred quick-filter: a plain star toggle in line with the filters. When on, the pane
  // shows a flat grid of every starred work (like a smart-folder), gold when active.
  const starFilterBtn = el("button.iconbtn.exstar" + (state.starred ? ".on" : ""), { title: "Starred", "aria-pressed": state.starred ? "true" : "false", onClick: () => { state.starred = !state.starred; starFilterBtn.classList.toggle("on", state.starred); starFilterBtn.setAttribute("aria-pressed", state.starred ? "true" : "false"); repaintBody(); } }, [iconEl("star", "sm")]);

  const toolbar = el(".toolbar", {}, [
    search, typeBtn, chanBtn, uploaderBtn, tagBtn, dateBtn, sortBtn, dirBtn, starFilterBtn,
    el(".tbactions", {}, [
      el("button.btn.newFolderBtn", { onClick: () => newFolder(data, state, rerender, state.folderId) }, [iconEl("plus", "sm"), "New folder"]),
      el("button.btn.primary", { onClick: () => openUpload(uploadOpts) }, [iconEl("plus", "sm"), "Upload"]),
    ]),
  ]);

  const selbar = el(".selbar");
  const body = el(".panebody");
  pane.replaceChildren(panehd, toolbar, selbar, body);

  // selection controller (Google-Drive model): refreshSel repaints the .sel outlines
  // and the bulk bar off state.selection, without rebuilding the grid.
  const sel = { state, refresh: refreshSel };
  state._refresh = refreshSel;   // for the screen-level key handler (Esc / ⌘A)
  function refreshSel() {
    body.querySelectorAll(".card[data-id]").forEach((c) => c.classList.toggle("sel", state.selection.has(c.dataset.id)));
    const n = state.selection.size;
    selbar.classList.toggle("open", n > 0);
    if (n > 0) selbar.replaceChildren(
      el("span.n", {}, [el("span", {}, [String(n)]), " selected"]),
      selAct("download", "Download", () => toast({ message: "Download (needs the R2 read env)" })),
      selAct("move", "Move to folder", () => moveSelected(data, state, rerender)),
      selAct("trash", "Delete", () => trashSelected(data, state, rerender)),
      el("span.sp"),
      selAct("x", "Clear", () => { state.selection.clear(); state.lastIdx = -1; refreshSel(); }),
    );
  }

  repaintBody();

  // re-render only the contents (search-as-you-type) without rebuilding the tree/toolbar
  function repaintBody() {
    // keep the header in sync with the browsing/searching swap
    const isSearch = state.query.trim().length > 0;
    if (isSearch !== (panehd.firstChild === crumbs ? false : true)) {
      panehd.replaceChild(isSearch ? searchState : crumbs, panehd.firstChild);
    }
    state.selection.clear(); state.lastIdx = -1;   // a new file set clears the selection
    body.replaceChildren(contents(data, state, rerender, sel));
    refreshSel();
  }
}

function selAct(icon, label, onClick) {
  return el("button", { title: label, onClick }, [iconEl(icon, "sm"), label]);
}

// the current folder's subfolders + files, as grid or list; or search results
function contents(data, state, rerender, sel) {
  const searching = state.query.trim().length > 0;
  const q = state.query.trim().toLowerCase();

  const openFolder = (f) => { state.folderId = f.id; state.query = ""; rerender(); };

  let subfolders, files;
  if (state.starred) {
    subfolders = [];   // Starred is a flat grid of every starred work (no folders)
    files = data.files.filter((w) => w.starred);
  } else if (searching) {
    subfolders = [];   // search flattens the whole tree to matching files
    files = data.files.filter((w) => (w.title || "").toLowerCase().includes(q));
  } else {
    subfolders = data.folders.filter((f) => (f.parentId || null) === state.folderId);
    files = data.files.filter((w) => (w.folderId || null) === state.folderId);
  }
  // Hidden/utility works (#55) are omitted from the library view unless Show-hidden is on.
  if (!state.showHidden) files = files.filter((w) => !w.hidden);
  // Facet filters, then sort (all apply to files only; subfolders always lead the grid).
  // Within a facet the selected values union; across facets they intersect (§C.6).
  if (state.types.size) files = files.filter((w) => state.types.has(w.kind));
  if (state.channels.size) files = files.filter((w) => state.channels.has(w.channelName));
  if (state.uploaders.size) files = files.filter((w) => state.uploaders.has(w.who?.name));
  if (state.tags.size) files = files.filter((w) => (w.tags || []).some((t) => state.tags.has(t)));
  if (state.date !== "any") { const cut = dateCutoff(state.date); files = files.filter((w) => new Date(w.created_at || 0) >= cut); }
  files = sortFiles(files, state.sort, state.dir);
  state._files = files;   // the current in-view set, for ⌘A select-all

  // a card opens the Details pane (§C.7): server files carry tags but no comments;
  // siblings = the files in view (prev/next); Location = the file's own folder path.
  const personal = data.source === "personal";
  const openFile = (w) => openDetails(w, {
    serverId: personal ? null : data.server.id,
    serverName: rootLabel(data), personal,
    folderPath: crumbPath(data.folders, w.folderId),
    siblings: files, isPost: false,
  });

  if (!subfolders.length && !files.length) {
    if (state.starred) return emptyState("star", "No starred files", "Star a file (the ★ on its card) to keep it here.");
    return searching
      ? emptyState("search", "No results", `Nothing here matches “${state.query.trim()}”.`)
      : emptyState("folder", "This folder is empty", "Upload files or create a subfolder to fill it.");
  }

  // Google-Drive selection (§C.6): single click selects (clears others), ⌘/Ctrl-click
  // toggles, Shift-click ranges; a double-click opens. List view keeps click-to-open.
  const onCardClick = (w, i, e) => {
    const s = state.selection;
    if (e.metaKey || e.ctrlKey) { s.has(w.id) ? s.delete(w.id) : s.add(w.id); state.lastIdx = i; }
    else if (e.shiftKey && state.lastIdx >= 0) {
      const [a, b] = [state.lastIdx, i].sort((x, y) => x - y);
      for (let k = a; k <= b; k++) s.add(files[k].id);
    } else { s.clear(); s.add(w.id); state.lastIdx = i; }
    sel.refresh();
  };

  const onStar = (w) => toggleStar(data, state, rerender, w);
  const onMenu = (w, anchor) => openCardMenu(data, state, rerender, w, anchor);
  if (state.mode === "feed") return feedView(data, state, openFile);
  if (state.mode === "list") return listView(subfolders, files, { openFile, openFolder });
  return gridView(subfolders, files, { openFile, openFolder, onCardClick, onStar, onMenu, showWho: data.source !== "personal" });
}

// Feed view (§C.6): flatten the current folder's whole SUBTREE to previewable works
// (image/video/audio) newest-first, each with its comments inline — an Instagram-style
// server media feed. Project files (.flp/.zip) are hidden here (grid/list show them).
function feedView(data, state, openFile) {
  // collect the current folder + all descendants
  const wantIds = new Set();
  (function walk(fid) { wantIds.add(fid); for (const f of data.folders) if ((f.parentId || null) === fid) walk(f.id); })(state.folderId);
  let items = data.files.filter((w) => PREVIEWABLE.has(w.kind) && wantIds.has(w.folderId || null));
  items = sortFiles(items, "latest", "desc");

  const here = state.folderId ? (data.folders.find((f) => f.id === state.folderId)?.name || "this folder") : rootLabel(data);
  const note = el(".ffnote", {}, [iconEl("home", "sm"), `Everything previewable in ${here} and its subfolders, newest first. Project files are hidden here — switch to grid or list for those.`]);

  if (!items.length) return el(".exview.filefeed", { "data-exview": "feed" }, [note, emptyState("image", "Nothing to preview", "This folder has no images, audio, or video yet.")]);

  const feed = el(".filefeed", {}, [note]);
  for (const w of items) {
    const folderName = w.folderId ? (data.folders.find((f) => f.id === w.folderId)?.name || "") : rootLabel(data);
    const media = el(".ffmedia", { onClick: () => openFile(w) }, [feedMedia(w)]);
    const meta = el(".ffmeta", {}, [el("b", {}, [w.title || "untitled"]), el("span.who", {}, [`${w.who?.name || ""}${folderName ? " · " + folderName : ""}`])]);
    const cmts = el(".ffcmts", {}, [
      ...(w.comments || []).map((c) => el(".cmt", {}, [
        el(".av.sm", { style: c.colorIdx != null ? `color:var(--m${c.colorIdx})` : null }, [(c.name || "?").slice(0, 2).toUpperCase()]),
        el(".bd", {}, [el(".by", {}, [el("span.u", {}, [c.name]), el("time", {}, [c.time || ""])]), el(".tx", {}, [c.text || ""])]),
      ])),
      el(".field", { style: "margin-top:6px" }, [el("input", { placeholder: "Comment" })]),
    ]);
    feed.append(el(".ffitem", {}, [media, meta, cmts]));
  }
  return el(".exview.filefeed", { "data-exview": "feed" }, [feed]);
}

function feedMedia(w) {
  const url = mediaUrl(w);
  if (w.kind === "image" && url) { const img = el("img", { src: url, alt: w.title || "", loading: "lazy" }); return img; }
  if (w.kind === "video" && url) return el("video", { src: url, muted: true, preload: "metadata", playsinline: true });
  const icon = iconEl(KIND_ICON[w.kind] || "file");   // image/video with no bytes yet
  return el(".dtype", {}, [icon, el("span.ext", {}, [(w.file_ext || "").toUpperCase()])]);
}

function gridView(subfolders, files, { openFile, openFolder, onCardClick, onStar, onMenu, showWho }) {
  const grid = el(".masonry.even");
  for (const f of subfolders) grid.append(folderCard(f, { onOpen: openFolder }));
  files.forEach((w, i) => {
    const actions = onMenu ? [{ act: "more", icon: "more", title: "More", onClick: (ww) => onMenu(ww, card.querySelector('.cardacts [data-act="more"]') || card) }] : [];
    const card = workCard(w, { selectable: true, showWho, starred: !!w.starred, onStar, actions });
    if (w.hidden) card.classList.add("ishidden");
    card.dataset.id = w.id;
    card.addEventListener("click", (e) => onCardClick(w, i, e));
    card.addEventListener("dblclick", (e) => { e.preventDefault(); openFile(w); });
    card.addEventListener("contextmenu", (e) => { e.preventDefault(); onMenu?.(w, card); });
    grid.append(card);
  });
  return el(".exview", { "data-exview": "grid" }, [grid]);
}

function listView(subfolders, files, { openFile, openFolder }) {
  const rows = [el(".flrow.flhd", {}, [el("span", {}, ["Name"]), el("span", {}, ["Type"]), el("span", {}, ["Size"]), el("span", {}, ["Uploader"]), el("span", {}, ["Added"])])];
  for (const f of subfolders) {
    rows.push(el(".flrow", { onClick: () => openFolder(f) }, [
      el("span.flnm", {}, [iconEl("folder", "sm"), f.name]),
      el("span", {}, ["folder"]), el("span", {}, ["—"]),
      el("span", {}, ["—"]), el("span", {}, [`${f.count} file${f.count === 1 ? "" : "s"}`]),
    ]));
  }
  for (const w of files) {
    rows.push(el(".flrow", { onClick: () => openFile(w) }, [
      el("span.flnm", {}, [iconEl(KIND_LIST_ICON[w.kind] || "file", "sm"), w.title || "untitled"]),
      el("span", {}, [(w.file_ext || "").toLowerCase() || "—"]),
      el("span", {}, [fmtBytes(w.bytes)]),
      el("span", {}, [w.who?.name || "—"]),
      el("span", {}, [w.created_at ? fmtDate(w.created_at) : "—"]),
    ]));
  }
  return el(".exview", { "data-exview": "list" }, rows);
}

const KIND_LIST_ICON = { audio: "voice", image: "image", video: "video", text: "type", other: "file" };

// sort a file list by the chosen key + direction. Name is A→Z at asc; the others are
// natural (latest/largest first) at the default desc.
function sortFiles(files, sort, dir) {
  const out = files.slice();
  const cmp = {
    latest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    oldest: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    name: (a, b) => (a.title || "").localeCompare(b.title || ""),
    size: (a, b) => Number(b.bytes || 0) - Number(a.bytes || 0),
  }[sort] || (() => 0);
  out.sort(cmp);
  if (dir === "asc") out.reverse();
  return out;
}

function dateCutoff(key) {
  const now = new Date();
  if (key === "today") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
  return new Date(now.getTime() - (DATE_DAYS[key] || 0) * 86400000);
}

// A multi-select filter menu (CANON §C.6): checkable rows that toggle IN PLACE without
// closing (unlike openMenu, which closes on pick), a Clear row when anything is selected,
// and outside-click / Esc to dismiss. `selected` is the live Set the button reads;
// `onChange` refreshes the button + repaints the contents after each toggle.
function openFilterMenu(anchor, options, selected, onChange) {
  closeMenus();
  const menu = el(".menu.open", { role: "menu" });
  if (selected.size) {
    const clear = el("button.fclear", { role: "menuitem" }, ["Clear"]);
    clear.addEventListener("click", (e) => { e.stopPropagation(); selected.clear(); closeMenus(); onChange(); });
    menu.append(clear, el(".sep"));
  }
  for (const [key, label] of options) {
    const on = selected.has(key);
    const mark = el("span.fcheck", {}, [on ? "✓" : ""]);
    const row = el("button", { role: "menuitemcheckbox", "aria-checked": on ? "true" : "false" }, [mark, el("span", {}, [label])]);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const now = !selected.has(key);
      now ? selected.add(key) : selected.delete(key);
      row.setAttribute("aria-checked", now ? "true" : "false");
      mark.textContent = now ? "✓" : "";
      onChange();
    });
    menu.append(row);
  }
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
function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
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
      folder = { id: "f-new-" + Date.now(), name, parentId: parentId ?? null, archived: false, locked: false, count: 0 };
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

function promptFolderName(onSubmit) {
  promptText({ title: "New folder", placeholder: "Folder name", submit: "Create", busyLabel: "Creating…", fail: "Couldn’t create the folder" }, onSubmit);
}

// The reusable single-field prompt (gallery "Prompt" dialog): a text input over the scrim,
// the submit button disabled until it's non-empty and different from the prefill, Enter
// submits. onSubmit(value) may be async and may throw — a throw keeps the modal open and
// surfaces the reason as a toast so the user can retry. Used by New folder + Rename.
function promptText({ title, placeholder = "", value = "", submit = "Save", busyLabel = "Saving…", fail = "Couldn’t save" }, onSubmit) {
  const input = el("input", { placeholder, value });
  const go = el("button.btn.primary", { disabled: true }, [submit]);
  const cancel = el("button.btn.ghost", {}, ["Cancel"]);
  const modal = openModal({ title, body: el(".field", {}, [input]), footer: [cancel, go] });
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

  newBtn.addEventListener("click", () => promptFolderName(async (name) => {
    const parent = hasSel ? dest : null;
    let folder;
    if (isDemoQS()) folder = { id: "f-new-" + Date.now(), name, parentId: parent ?? null, archived: false, locked: false, count: 0 };
    else folder = await createFolder({ source: data.source, serverId: data.server?.id, parentId: parent ?? null, name });
    data.folders.push(folder);
    renderWell();
    select(folder.id);
    toast({ message: `Folder “${name}” created` });
  }));
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
  return iconEl(KIND_LIST_ICON[w.kind] || "file", "sm");
}

function purgeRow(data, rerender, w) {
  (isDemoQS() ? Promise.resolve() : purgeWork(w.id)).then(() => {
    data._trash = data._trash.filter((x) => x.id !== w.id);
    rerender();
    toast({ message: "Deleted forever" });
  }).catch((e) => toast({ message: e?.message || "Couldn’t delete" }));
}

function emptyNow(data, rerender) {
  if (!data._trash.length) return;
  (isDemoQS() ? Promise.resolve() : emptyTrash({ source: data.source, serverId: data.server?.id })).then(() => {
    data._trash = []; rerender(); toast({ message: "Trash emptied" });
  }).catch((e) => toast({ message: e?.message || "Couldn’t empty Trash" }));
}

// ── Star (CANON §C.6 / §E.3) ─────────────────────────────────────────────────
// Toggle a work's star — a real starred_items write (demo optimistic), reflected on the
// card IN PLACE so it doesn't clear the selection. In the Starred filter view, unstarring
// drops the card, so rerender there to keep the flat grid (+ empty state) correct.
function toggleStar(data, state, rerender, w) {
  const next = !w.starred;
  (isDemoQS() ? Promise.resolve() : (next ? starWork(w.id) : unstarWork(w.id))).then(() => {
    w.starred = next;
    if (state.starred && !next) { rerender(); return; }
    const card = document.querySelector(`.card[data-id="${cssEscape(w.id)}"]`);
    if (card) {
      card.classList.toggle("starred", next);
      const sb = card.querySelector('.cardacts [data-act="star"]');
      if (sb) { sb.classList.toggle("starred", next); sb.title = next ? "Unstar" : "Star"; }
    }
  }).catch((e) => toast({ message: e?.message || "Couldn’t update star" }));
}
function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); }

// ── Card ⋯ / right-click menu (CANON §C.6, gallery card menu) ─────────────────
// Only actions with a real write path today — Star, Save to my files, Rename, Move to…,
// Delete. No stubs: Download waits on the R2 read env, Copy link on share_links, Hide from
// library on the Show-hidden filter (each returns as its backend lands). Save is omitted on
// a personal file (already yours). Anchored to the ⋯ button (or the card, for right-click).
function openCardMenu(data, state, rerender, w, anchor) {
  const personal = data.source === "personal";
  openMenu(anchor, [
    { label: w.starred ? "Unstar" : "Star", icon: "star", onClick: () => toggleStar(data, state, rerender, w) },
    ...(personal ? [] : [{ label: "Save to my files", icon: "save", onClick: () => saveOne(w) }]),
    { label: "Rename", icon: "pen", onClick: () => renameFile(data, state, rerender, w) },
    { label: "Move to…", icon: "folder", onClick: () => moveIds(data, state, rerender, [w.id]) },
    { label: w.hidden ? "Show in library" : "Hide from library", icon: "hide", onClick: () => toggleHidden(data, state, rerender, w) },
    { sep: true },
    { label: "Delete", icon: "trash", danger: true, onClick: () => trashIds(data, state, rerender, [w.id]) },
  ]);
}

// Hide/show a work in the library view (#55) — a real works.hidden toggle. When hiding
// while Show-hidden is off the card leaves the view, so rerender to reflect it.
function toggleHidden(data, state, rerender, w) {
  const next = !w.hidden;
  (isDemoQS() ? Promise.resolve() : setHidden(w.id, next)).then(() => {
    w.hidden = next;
    rerender();
    toast({ message: next ? "Hidden from the library" : "Shown in the library", icon: "hide" });
  }).catch((e) => toast({ message: e?.message || "Couldn’t update" }));
}

function saveOne(w) {
  (isDemoQS() ? Promise.resolve() : saveToFiles(w.id)).then(() => toast({ message: "Saved to your files", icon: "save" }))
    .catch((e) => toast({ message: e?.message || "Couldn’t save" }));
}

function renameFile(data, state, rerender, w) {
  promptText({ title: "Rename", placeholder: "Name", value: w.title || w.name || "", submit: "Rename", busyLabel: "Renaming…", fail: "Couldn’t rename" }, async (name) => {
    if (!isDemoQS()) await renameWork(w.id, name);
    w.title = name; w.name = name;
    rerender();
    toast({ message: "Renamed" });
  });
}
