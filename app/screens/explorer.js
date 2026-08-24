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

import { el, toast, openMenu } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { workCard, folderCard } from "../cards.js";
import { channelColumn } from "./workspace.js";
import { openUpload } from "./upload.js";
import { openDetails } from "./details.js";

const VIEWS = { grid: "Grid", list: "List" };

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
  };

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
    el("button.iconbtn.sm.newFolderBtn", { title: "New folder", onClick: () => toast({ message: "New folder (P5.6)" }) }, [iconEl("plus", "sm")]),
  ]);

  const rows = [];
  // the root row (lvl0), then the nested folders under it
  const rootOn = state.folderId == null;
  rows.push(treeRow({
    label: rootLabel(data), level: 0, on: rootOn, hasKids: childrenOf(null).length > 0,
    open: !state.collapsed.has("__root__"),
    onToggle: () => { toggle(state.collapsed, "__root__"); rerender(); },
    onOpen: () => { state.folderId = null; rerender(); },
  }));
  if (!state.collapsed.has("__root__")) walk(null, 1);

  function walk(pid, level) {
    for (const f of childrenOf(pid)) {
      const kids = childrenOf(f.id);
      const open = !state.collapsed.has(f.id);
      rows.push(treeRow({
        label: f.name, level, on: state.folderId === f.id, hasKids: kids.length > 0, open,
        locked: f.locked, archived: f.archived,
        onToggle: () => { toggle(state.collapsed, f.id); rerender(); },
        onOpen: () => { state.folderId = f.id; state.query = ""; rerender(); },
      }));
      if (open && kids.length) walk(f.id, level + 1);
    }
  }

  // Trash + storage footer pinned to the foot
  const bottom = el(".ftbottom", {}, [
    el(".ftsep"),
    treeRow({ label: "Trash", level: 0, icon: "trash", meta: "30d", onOpen: () => toast({ message: "Trash view (P5.7)" }) }),
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
  const panehd = el(".panehd", {}, [
    searching ? searchState : crumbs,
    el(".hdctl", {}, [
      el("button.iconbtn", { title: "Show hidden files", onClick: () => toast({ message: "Show hidden (P5.5)" }) }, [iconEl("hide", "sm")]),
      viewBtn,
    ]),
  ]);

  // toolbar — search + New folder + Upload (filters/sort are a later pass)
  const personal = data.source === "personal";
  const search = el(".field", {}, [iconEl("search", "sm"),
    el("input", { placeholder: personal ? "Search your files" : "Search this server's files", value: state.query, onInput: (e) => { state.query = e.target.value; repaintBody(); } }),
  ]);
  const uploadOpts = personal ? { visibility: "private" } : { visibility: "server", serverId: data.server.id, folderId: state.folderId };
  const toolbar = el(".toolbar", {}, [
    search,
    el("span", { style: "flex:1" }),
    el("button.btn.newFolderBtn", { onClick: () => toast({ message: "New folder (P5.6)" }) }, [iconEl("plus", "sm"), "New folder"]),
    el("button.btn.primary", { onClick: () => openUpload(uploadOpts) }, [iconEl("plus", "sm"), "Upload"]),
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
      selAct("move", "Move to folder", () => toast({ message: "Move to folder (P5.6)" })),
      selAct("trash", "Delete", () => toast({ message: "Delete → Trash (P5.7)" })),
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
  if (searching) {
    subfolders = [];   // search flattens the whole tree to matching files
    files = data.files.filter((w) => (w.title || "").toLowerCase().includes(q));
  } else {
    subfolders = data.folders.filter((f) => (f.parentId || null) === state.folderId);
    files = data.files.filter((w) => (w.folderId || null) === state.folderId);
  }
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

  if (state.mode === "list") return listView(subfolders, files, { openFile, openFolder });
  return gridView(subfolders, files, { openFile, openFolder, onCardClick, showWho: data.source !== "personal" });
}

function gridView(subfolders, files, { openFile, openFolder, onCardClick, showWho }) {
  const grid = el(".masonry.even");
  for (const f of subfolders) grid.append(folderCard(f, { onOpen: openFolder }));
  files.forEach((w, i) => {
    const card = workCard(w, { selectable: true, showWho });
    card.dataset.id = w.id;
    card.addEventListener("click", (e) => onCardClick(w, i, e));
    card.addEventListener("dblclick", (e) => { e.preventDefault(); openFile(w); });
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

// ── shared empty state (CANON §C.6 reusable pattern) ─────────────────────────
function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}

function toggle(set, id) { set.has(id) ? set.delete(id) : set.add(id); }
