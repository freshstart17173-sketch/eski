// screens/upload.js — the Upload sheet (P5.11) + write path (P5.12). Fast by
// default (CANON §C.12): drop files → pick visibility → Post. Title auto-fills the
// file name; Tags + Collaborators hide behind "Add details". A Server upload draws
// the server's storage and lands in a folder; a Public/Private one draws yours.
//
// Write path: sha256 each file → POST /api/sign (presign R2 PUT, quota-gated) →
// PUT bytes to R2 → insert `works` (owner_type/owner_id/visibility/blob_sha/bytes;
// the works_blob_meter trigger dedups the blob + meters bytes) → a Server upload
// also writes a `placement` (surface='server', folder_id) → each collaborator via
// add_collaborator. There is no client-chosen key: sign.mjs derives it from the hash.

import { openModal, VisibilitySeg, Button, openMenu, toast, el, uploadProgress, putWithProgress } from "../ui.js";
import { iconEl } from "../icons.js";
import { tagEditor } from "../tags.js";
import { supabase, session, rawSession } from "../supabase.js";
import { createFolder, addFolderTag } from "../data.js";
import { sha256File, mapLimit } from "../hash.js";

// K11: how many files hash / PUT at once. Unbounded Promise.all over a folder would start every
// file simultaneously — a hundred open connections and, with the old whole-file hashing, a hundred
// files on the heap. A small cap keeps memory + sockets bounded while still overlapping work.
const HASH_CONCURRENCY = 3;
const PUT_CONCURRENCY = 3;

// ext → render kind. This is ONLY a hint for how a file previews (an image thumbnails, audio
// gets a player, everything else is an "other" download card). It is NOT an allowlist: EVERY
// file type uploads (owner ask, 2026-08-29). An unknown ext is kind 'other', not a rejection.
const KIND = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", svg: "image", bmp: "image", tiff: "image", heic: "image",
  mp3: "audio", m4a: "audio", ogg: "audio", opus: "audio", wav: "audio", flac: "audio", aac: "audio", webm: "audio", aiff: "audio", aif: "audio",
  mp4: "video", mov: "video", avi: "video", mkv: "video", m4v: "video",
  txt: "text", md: "text",
};
// The safe object-key suffix for a file. The R2 key is `<sha>.<ext>`, so the ext must never carry
// a slash, dot, or anything that could escape the key layout — we take only the segment after the
// last dot and strip it to [a-z0-9], capped at 16. A file with no usable extension (a bare
// "README", or a name whose suffix is all symbols) becomes 'bin'. The signer re-validates this
// same shape, so a bad ext can never reach R2. (kindOf still reads the RAW ext for its render hint.)
function rawExt(name) { const p = String(name || "").split("."); return p.length > 1 ? p.pop().toLowerCase() : ""; }
function safeExt(name) { const e = rawExt(name).replace(/[^a-z0-9]/g, "").slice(0, 16); return e || "bin"; }
const extOf = safeExt;               // the storable object-key suffix
const kindOf = (ext) => KIND[ext] || "other";   // ext is the (already-safe) suffix; KIND keys are clean

// File hashing lives in ../hash.js (sha256File) — a chunked, incremental SHA-256 that never
// holds the whole file in memory. See K11 / that file's header for why crypto.subtle can't do this.

// The structure-carrying path of a file. A directory *pick* sets webkitRelativePath; a directory
// *drop* has no such property (the browser doesn't populate it for drag-drop), so the entry walker
// below stamps the same "Pack/drums/kick.wav" shape onto `_relPath`. One accessor for both means
// relDir/addFiles/the summary all treat a dropped folder exactly like a picked one.
export function relPathOf(file) {
  return file.webkitRelativePath || file._relPath || "";
}

// The folder path a file sits in — "Pack/drums/kick.wav" → "Pack/drums". A loose file (no relative
// path) has no dir. webkitdirectory always includes the chosen folder as the first segment, and the
// entry walker mirrors that, so a folder upload always has a dir.
function relDir(file) {
  const parts = relPathOf(file).split("/");
  return parts.slice(0, -1).join("/");   // drop the filename
}

// Read a drop's contents including folders. dataTransfer.files flattens away structure and, for a
// folder drop, is often empty — the only way to recurse is webkitGetAsEntry() on each item. The
// entry objects must be grabbed synchronously (the DataTransferItemList empties when the handler
// returns), then walked async. Each nested file gets `_relPath` = its full path from the dropped
// root (matching webkitdirectory), so buildFolderTree recreates the tree. Loose top-level files
// get none (they upload flat). hadDir tells the caller to treat it as a folder upload.
export async function readDropEntries(dt) {
  const items = dt?.items ? [...dt.items] : [];
  const entries = items.map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return { files: [...(dt?.files || [])], hadDir: false };
  const out = []; let hadDir = false;
  const walk = (entry, prefix) => new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => { if (prefix) { try { f._relPath = prefix + entry.name; } catch {} } out.push(f); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      hadDir = true;
      const reader = entry.createReader(); const kids = [];
      // readEntries yields in batches; call until it returns empty, then recurse into each child.
      const pump = () => reader.readEntries((batch) => {
        if (!batch.length) { Promise.all(kids.map((e) => walk(e, prefix + entry.name + "/"))).then(resolve); }
        else { kids.push(...batch); pump(); }
      }, () => resolve());
      pump();
    } else resolve();
  });
  await Promise.all(entries.map((e) => walk(e, "")));
  return { files: out, hadDir };
}

// Recreate a picked folder's structure under `baseFolderId`, returning Map(dirPath → folderId).
// Creates shallow dirs first so each child's parent already exists. Uses createFolder(), which
// fences server folders through the create_folder RPC and writes personal ones to save_folders.
async function buildFolderTree(files, { source, serverId, baseFolderId }) {
  const dirs = new Set();
  for (const f of files) {
    const parts = relDir(f).split("/").filter(Boolean);
    let cum = "";
    for (const seg of parts) { cum = cum ? cum + "/" + seg : seg; dirs.add(cum); }
  }
  const sorted = [...dirs].sort((a, b) => a.split("/").length - b.split("/").length);
  const map = new Map();
  for (const dir of sorted) {
    const segs = dir.split("/");
    const parentPath = segs.slice(0, -1).join("/");
    const parentId = parentPath ? map.get(parentPath) : (baseFolderId || null);
    const folder = await createFolder({ source, serverId, parentId, name: segs[segs.length - 1] });
    map.set(dir, folder.id);
  }
  return map;
}

// Drag a file (or several) onto any surface wired with this → opens the upload sheet ready to
// post, with the right target (getOpts supplies visibility/serverId/channelId/folderId). A
// `.dropping` class is toggled for a drop-hint overlay. Ignores non-file drags (text, cards).
export function enableDropUpload(target, getOpts) {
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  let depth = 0;
  const clear = () => { depth = 0; target.classList.remove("dropping"); };
  target.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; target.classList.add("dropping"); });
  target.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
  target.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) target.classList.remove("dropping"); });
  target.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return; e.preventDefault(); clear();
    // Grab the entries synchronously (readDropEntries reads e.dataTransfer.items before the
    // event returns), then open the sheet with the walked files + folder flag.
    const { files, hadDir } = await readDropEntries(e.dataTransfer);
    if (files.length) openUpload({ ...(getOpts ? getOpts() : {}), files, folderMode: hadDir });
  });
}

export async function openUpload(opts = {}) {
  const me = session();
  if (!me) { toast({ message: "Sign in to upload" }); return; }

  let files = [];
  let visibility = opts.visibility || (opts.serverId ? "server" : "public");
  let serverId = opts.serverId || null, channelId = opts.channelId || null, folderId = opts.folderId || null;
  let folderName = null;
  // P6: Visibility is contextual. Launched from a server (channel composer / server explorer),
  // the upload is a server-folder upload — the Public/Server/Private choice is noise, so hide it
  // and show only the server/folder target. Only a personal/global upload surfaces Visibility.
  const serverContext = !!opts.serverId;
  const collabs = [];   // {handle, role}
  // Closure state declared UP HERE (was below the seed call → a TDZ ReferenceError swallowed the
  // pre-loaded drag-drop seed, leaving the sheet blank). folderMode/flatten drive the folder UI;
  // uploading/prog let a modal-exit during an in-flight upload float the progress chip instead of
  // dropping it.
  let folderMode = false;
  let flatten = false;   // folder drop, but "expose every file for tagging" → upload flat, shared tags
  let uploading = false;
  let prog = null;

  // the servers this user can post into (for the Server picker)
  const { data: sm } = await supabase.from("server_members").select("server:servers(id,name)").eq("user_id", me.id);
  const myServers = (sm || []).filter((r) => r.server).map((r) => r.server);
  if (visibility === "server" && !serverId) serverId = myServers[0]?.id || null;
  // In no servers → Server visibility is impossible; disable it and fall back to Public.
  const noServer = myServers.length === 0;
  if (noServer && visibility === "server") visibility = "public";
  const serverName = (id) => myServers.find((s) => s.id === id)?.name || "server";

  // ── body ──────────────────────────────────────────────────────────────────
  const body = el(".uploadbody");

  const picker = el("input", { type: "file", multiple: true, style: "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0" });
  // A whole-folder picker. webkitdirectory makes the browser hand back every file in the
  // chosen tree, each carrying a `webkitRelativePath` ("Pack/drums/kick.wav") — that path
  // is what lets us recreate the folder structure on upload (buildFolderTree). Kept a
  // separate input from `picker` because a directory input can't also pick loose files.
  const folderPicker = el("input", { type: "file", multiple: true, style: "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0" });
  folderPicker.setAttribute("webkitdirectory", "");
  folderPicker.setAttribute("directory", "");
  const drop = el(".dropzone", {}, [iconEl("clip"), el("div", {}, ["Drop files here, or click to choose"])]);
  const dropAlt = el(".dropalt", { style: "text-align:center;font-size:var(--fs-xs);color:var(--muted);margin-top:6px" }, [
    "or ", el("button.aslink", { type: "button", style: "color:var(--soft);font-weight:600", onClick: () => folderPicker.click() }, ["upload a folder"]),
  ]);
  // A persistent host for the "files chosen" summary — rendered by renderChosen(), so the swap is
  // idempotent and never depends on whether `drop` is still in the DOM (the old in-place replace
  // broke on the 2nd pick / a pre-seeded open). drop + dropAlt hide once files are chosen.
  const summaryHost = el(".dropchosen", { hidden: true });
  const dropWrap = el(".dropwrap", {}, [drop, dropAlt, summaryHost, picker, folderPicker]);
  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => addFiles([...picker.files], false));
  folderPicker.addEventListener("change", () => addFiles([...folderPicker.files], true));
  // DnD lives on the whole dropWrap (not the `drop` box, which hides once files are chosen) so a
  // drop registers before AND after a selection, and a folder/file dropped onto the explorer that
  // pre-seeds this sheet works too. Counter guards nested dragenter/leave flicker.
  let dragDepth = 0;
  dropWrap.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; dropWrap.classList.add("over"); });
  dropWrap.addEventListener("dragover", (e) => { e.preventDefault(); });
  dropWrap.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropWrap.classList.remove("over"); } });
  dropWrap.addEventListener("drop", async (e) => {
    e.preventDefault(); dragDepth = 0; dropWrap.classList.remove("over");
    const { files, hadDir } = await readDropEntries(e.dataTransfer);   // folders too, structure kept
    addFiles(files, hadDir);
  });

  const visSeg = VisibilitySeg({ value: visibility, noServer, onChange: (v) => { visibility = v; syncVis(); } });

  const serverBtn = el("button.selbtn", { style: "width:100%;justify-content:space-between" });
  serverBtn.addEventListener("click", () => openMenu(serverBtn, [
    ...myServers.map((s) => ({ label: s.name, onClick: () => { serverId = s.id; folderId = null; folderName = null; loadFolders(); syncVis(); } })),
    myServers.length ? { sep: true } : null,
    { label: folderId ? "Move to root folder" : "Root folder", onClick: () => { folderId = null; folderName = null; syncVis(); } },
  ].filter(Boolean)));
  const folderBtn = el("button.selbtn", { style: "width:100%;justify-content:space-between;margin-top:6px" });
  folderBtn.addEventListener("click", async () => {
    const folders = await serverFolders(serverId);
    openMenu(folderBtn, [
      { label: "Root", onClick: () => { folderId = null; folderName = null; syncVis(); } },
      ...folders.map((f) => ({ label: f.name, onClick: () => { folderId = f.id; folderName = f.name; syncVis(); } })),
    ]);
  });
  const serverPick = el("div", {}, [el("label.fl", {}, ["Which server / folder"]), serverBtn, folderBtn]);


  // P22: title + tags are now PER FILE, edited inline in the chosen-files list (renderChosen) —
  // `fileMeta[i]` (aligned to `files`) exposes getTitle()/getTags() for each rendered row. The old
  // single shared Title + Tags fields are gone; the row's rename input IS the title, the row's tag
  // editor IS the tags. Collaborators stay behind "Add details" and only apply to a single loose
  // post (a folder / multi upload has no single owner to attach a collaborator to).
  let fileMeta = [];
  // P23: a folder upload can also tag each SUBFOLDER (its own tags; no inheritance to the files
  // inside). folderTagMeta maps a directory path → getTags(); doPost applies them after the tree is
  // recreated (buildFolderTree gives dir → folderId), via addFolderTag. Rebuilt by renderChosen.
  let folderTagMeta = new Map();
  const collabInput = el("input", { placeholder: "@handle, role — Enter to add" });
  const collabChips = el(".field.collabs", {}, [collabInput]);
  collabInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = collabInput.value.trim(); if (!raw) return;
    const [handle, ...rest] = raw.replace(/^@/, "").split(",");
    const role = rest.join(",").trim();
    collabs.push({ handle: handle.trim(), role: role || null });
    collabChips.insertBefore(el("span.uchip", {}, [el("span.dot"), role ? `${handle.trim()}, ${role}` : handle.trim()]), collabInput);
    collabInput.value = "";
  });
  const addmore = el("details.addmore", {}, [
    el("summary", {}, [iconEl("chev", "sm"), "Collaborators"]),
    el("label.fl", {}, ["Collaborators ", el("span", { style: "color:var(--muted)" }, ["@handle + role"])]),
    collabChips,
  ]);

  const visBlock = el("div", { hidden: serverContext }, [
    el("label.fl", {}, ["Visibility ", el("span", { style: "color:var(--muted)" }, ["required"])]), visSeg,
  ]);
  body.append(dropWrap, visBlock, serverPick, addmore);

  // ── footer ──────────────────────────────────────────────────────────────
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const post = Button({ label: "Upload", variant: "primary", disabled: true });
  const { close } = openModal({ title: "Upload", size: "wide", body, footer: [cancel, post],
    // Closing the sheet (scrim / ✕ / Cancel) while an upload is in flight must NOT drop it —
    // float the progress chip so it finishes in the background (owner call 2026-08-30).
    onClose: () => { if (uploading && prog) prog.minimize(); },
  });
  cancel.addEventListener("click", () => close());
  post.addEventListener("click", doPost);
  syncVis();
  // Pre-loaded files (a drag-and-drop onto the explorer / a channel opens the sheet ready).
  if (opts.files?.length) addFiles([...opts.files], !!opts.folderMode);

  // ── helpers ───────────────────────────────────────────────────────────────
  function addFiles(list, asFolder) {
    // Every file type is accepted — no allowlist. A folder that mixes stems, a DAW project, and a
    // README uploads whole; unknown types just get the 'other' download card. (A 0-byte file is the
    // one thing dropped — it has nothing to store and would sign an empty PUT.)
    const rejected = list.filter((f) => f.size === 0);
    files = list.filter((f) => f.size > 0);
    folderMode = !!asFolder && files.some((f) => relPathOf(f));
    if (rejected.length) toast({ message: `Skipped ${rejected.length} empty file${rejected.length > 1 ? "s" : ""}` });
    if (files.length) renderChosen();
    syncVis();
  }
  // Render the "files chosen" state into summaryHost (hides the empty dropzone). A header + a
  // scrollable list where EVERY row is editable (P22): an inline rename input + its own tag editor,
  // so a multi-file / folder upload tags & renames each file before posting. `fileMeta[i]` (aligned
  // to `files`) captures each row's live getTitle()/getTags(). Idempotent — rebuilt on every add,
  // which resets per-file edits (the file set changed, so old edits no longer apply). DOM-capped for
  // a huge folder; files past the cap upload with their own name + no tags (documented in the row).
  const ROW_CAP = 60;
  function renderChosen() {
    summaryHost.replaceChildren();
    fileMeta = [];
    folderTagMeta = new Map();
    if (!files.length) { summaryHost.hidden = true; drop.hidden = false; dropAlt.hidden = false; return; }
    drop.hidden = true; dropAlt.hidden = true; summaryHost.hidden = false;
    // P25: the combined size of everything (owner: "show the total size of uploads, not per-file")
    const total = fmtSize(files.reduce((s, f) => s + (f.size || 0), 0));
    let title;
    if (folderMode) {
      const top = (relPathOf(files.find((f) => relPathOf(f))) || "").split("/")[0] || "folder";
      const subs = new Set(files.map((f) => relPathOf(f).split("/").slice(1, -1).join("/")).filter(Boolean));
      title = `${top} · ${files.length} file${files.length > 1 ? "s" : ""}${subs.size ? ` in ${subs.size + 1} folders` : ""}`;
    } else title = files.length > 1 ? `${files.length} files` : files[0].name;
    const change = el("button.aslink", { type: "button", title: "Choose different files", style: "margin-left:auto;color:var(--soft);font-weight:600" }, ["Change"]);
    change.addEventListener("click", () => (folderMode ? folderPicker : picker).click());
    summaryHost.append(el(".chosenhd", {}, [iconEl(folderMode ? "folder" : "clip", "sm"), el("b", {}, [title]), el("span.chosentot", {}, [total]), change]));
    // editable file list (cap the DOM for a huge folder; note the remainder)
    const list = el(".chosenlist");
    files.forEach((f, i) => {
      if (i >= ROW_CAP) return;
      const dir = folderMode ? relDir(f) : "";
      // Rename edits the work TITLE only (p_title) — it never touches relDir/placement, so a folder
      // upload keeps its tree while each file can be retitled. Defaults to the file's own name.
      const nameInput = el("input.chosenname", { value: f.name, spellcheck: "false", "aria-label": "File name" });
      const ed = tagEditor({ placeholder: "tag… (bpm:142)" });
      fileMeta[i] = { getTitle: () => nameInput.value.trim() || f.name, getTags: () => ed.getTags() };
      list.append(el(".chosenrow", {}, [
        el(".cnhead", {}, [
          dir ? el("span.cndir", { title: dir }, [dir + "/"]) : null,
          nameInput,
          el("span.cs", {}, [fmtSize(f.size)]),
        ].filter(Boolean)),
        el(".cntags", {}, [ed.node]),
      ]));
    });
    if (files.length > ROW_CAP) list.append(el(".chosenmore", {}, [`+ ${files.length - ROW_CAP} more — uploaded with their own names, no tags`]));
    summaryHost.append(list);
    if (folderMode) {
      // P23: one tag-editor row per subfolder in the tree (each folder's OWN tags, applied on post
      // via addFolderTag — no inheritance to files). Same row pattern as the per-file list above.
      const allDirs = new Set();
      for (const f of files) { const parts = relDir(f).split("/").filter(Boolean); let cum = ""; for (const seg of parts) { cum = cum ? cum + "/" + seg : seg; allDirs.add(cum); } }
      const dirs = [...allDirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
      if (dirs.length) {
        const flist = el(".chosenlist.chosenfolders");
        flist.append(el(".chosensec", {}, ["Folder tags — each folder’s own tags (not inherited by its files)"]));
        dirs.forEach((dir, i) => {
          if (i >= ROW_CAP) return;
          const ed = tagEditor({ placeholder: "tag… (bpm:142)" });
          folderTagMeta.set(dir, ed.getTags);
          flist.append(el(".chosenrow", {}, [
            el(".cnhead", {}, [iconEl("folder", "sm"), el("span.cndir", { title: dir }, [dir])]),
            el(".cntags", {}, [ed.node]),
          ]));
        });
        summaryHost.append(flist);
      }
      const flat = el("input", { type: "checkbox" }); flat.checked = flatten;
      flat.addEventListener("change", () => { flatten = flat.checked; syncVis(); });
      summaryHost.append(el("label.flatten", {}, [flat, "Flatten folders — one flat set instead of the tree (drops folder tags)"]));
    }
  }
  function fmtSize(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : b + " B"; }
  async function loadFolders() { /* prime cache; menu loads on open */ }
  async function serverFolders(sid) {
    if (!sid) return [];
    const { data } = await supabase.from("folders").select("id,name").eq("server_id", sid).eq("archived", false).order("name");
    return data || [];
  }
  function syncVis() {
    serverPick.hidden = visibility !== "server";
    if (visibility === "server") {
      serverBtn.replaceChildren(el("span", { style: "display:flex;align-items:center;gap:8px" }, [iconEl("server", "sm"), serverName(serverId)]), iconEl("chev", "sm"));
      folderBtn.replaceChildren(el("span", { style: "display:flex;align-items:center;gap:8px;color:var(--soft)" }, [iconEl("folder", "sm"), folderName || "Root folder"]), iconEl("chev", "sm"));
    }
    post.disabled = !files.length || (visibility === "server" && !serverId);
    post.textContent = files.length > 1 ? `Upload ${files.length} files` : "Upload";
    // Collaborators apply only to a single loose post (doPost gates on !structured && one file).
    addmore.hidden = !(files.length === 1 && !folderMode);
  }

  async function doPost() {
    post.disabled = true;
    uploading = true;
    // P16: a real progress bar (byte-accurate on the R2 PUT). No stage-text tips, no minimize
    // button — clicking off the sheet floats the chip (the modal onClose) and the upload finishes
    // in the background. `prog` is the closure-level ref so onClose can float it.
    prog = uploadProgress({ title: files.length > 1 ? `Uploading ${files.length} files` : "Uploading" });
    body.append(prog.node);
    try {
      // Total bytes drive both the hashing band (0–15%) and the PUT band (20–80%) so the bar
      // reflects real work, and a multi-GB file doesn't sit at 0% through its whole hash.
      const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0) || 1;
      // ── hash (chunked, concurrency-capped) ──────────────────────────────────
      // K11: sha256File reads each file in 8 MB slices — never the whole file — so a multi-GB
      // upload stays off the heap; mapLimit caps how many hash at once. Per-file byte progress
      // is summed across the in-flight files into the 0–15% band.
      const hashedBytes = new Array(files.length).fill(0);
      const hashed = await mapLimit(files, HASH_CONCURRENCY, async (f, i) => {
        const hash = await sha256File(f, (loaded) => {
          hashedBytes[i] = loaded;
          prog.set(0.15 * (hashedBytes.reduce((a, b) => a + b, 0) / totalBytes));
        });
        return { file: f, hash, ext: extOf(f.name) };
      });
      prog.set(0.15);
      const token = rawSession()?.access_token;
      const signRes = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ files: hashed.map((h) => ({ hash: h.hash, ext: h.ext })) }),
      });
      const signJson = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signJson.error || `signer said ${signRes.status}`);

      // Real transfer progress: aggregate bytes across every file → the 20–80% band of the bar.
      // K11: PUT_CONCURRENCY caps simultaneous uploads (Promise.all would open one socket per
      // file). XHR streams each File straight from disk, so only the in-flight files transfer at
      // once; each file's blob reference is dropped when its PUT settles.
      prog.set(0.20);
      const sent = new Array(hashed.length).fill(0);
      await mapLimit(hashed, PUT_CONCURRENCY, (h, i) => putWithProgress(signJson.files[i].url, h.file, {
        headers: { "content-type": h.file.type || "application/octet-stream" },
        onProgress: (loaded) => { sent[i] = loaded; prog.set(0.20 + 0.60 * (sent.reduce((a, b) => a + b, 0) / totalBytes)); },
      }));
      prog.set(0.80);

      const onServer = visibility === "server";
      // "structured" = keep the dropped/picked tree. Flatten turns a folder upload into a flat one:
      // every file lands loose (shared Tags apply), no folders recreated.
      const structured = folderMode && !flatten;
      // Folder upload: recreate the picked tree first, then file each work into the folder its
      // path names. Server folders nest under the chosen destination folder; personal ones nest
      // at the My-files root. A loose (non-folder / flattened) upload keeps the single chosen folderId.
      let folderMap = null;
      if (structured) {
        prog.set(0.82);
        folderMap = await buildFolderTree(files, {
          source: onServer ? "server" : "personal",
          serverId: onServer ? serverId : null,
          baseFolderId: onServer ? folderId : null,
        });
        // P23: apply each subfolder's own tags to the folder just created (no inheritance to files).
        // Best-effort — a folder-tag failure must never abort the upload of the files themselves.
        for (const [dir, getTags] of folderTagMeta) {
          const fid = folderMap.get(dir); if (!fid) continue;
          for (const t of (getTags() || [])) {
            try { await addFolderTag(onServer ? { folderId: fid } : { saveFolderId: fid }, t); } catch { /* skip a bad tag */ }
          }
        }
      }
      const folderFor = (h) => structured ? (folderMap.get(relDir(h.file)) || folderId || null) : (folderId || null);

      // ONE atomic write per file: create_work (SECURITY DEFINER) registers the blob, inserts the
      // work, files its placement (server) or saved_items row (personal folder), and its tags — as
      // the table owner, so it can't be undone by the works-insert RLS 42501 that made the old
      // 4-statement client write fail for real users (see schema-23-create-work-rpc.sql). The RPC
      // re-checks the fence itself (author = caller; server needs membership + the 'upload' perm),
      // so nothing is loosened. P22: title + tags come from each file's OWN row (fileMeta[i]) — a
      // folder upload carries per-file tags too (was []); a file past the row cap uses its name + [].
      prog.set(0.88);
      let saved = 0;
      const createdIds = [];   // handed to onDone so the caller can drop the new rows straight into
                                // its own view instead of a full refetch (see explorer.js's addOrRefreshFile)
      for (let i = 0; i < hashed.length; i++) {
        const h = hashed[i];
        const meta = fileMeta[i];
        const destFolder = folderFor(h);
        const { data: workId, error } = await supabase.rpc("create_work", {
          p_owner_type: onServer ? "server" : "user",
          p_owner_id: onServer ? serverId : me.id,
          p_visibility: visibility,            // RPC normalizes (server→'server', personal→'private' unless public)
          p_server_id: onServer ? serverId : null,
          p_title: (meta?.getTitle?.() || h.file.name),
          p_file_ext: h.ext,
          p_kind: kindOf(h.ext),
          p_blob_sha: h.hash,
          p_bytes: h.file.size,
          p_channel_id: onServer ? (channelId || null) : null,
          p_folder_id: destFolder,
          p_tags: (meta?.getTags?.() || []),
        });
        if (error) throw new Error(`couldn’t save the post (${error.code || "db"}): ${error.message}`);
        createdIds.push(workId);
        // Collaborators still only make sense on a single loose post.
        if (!structured && files.length === 1)
          for (const c of collabs) await supabase.rpc("add_collaborator", { work_id: workId, handle: c.handle, role: c.role });
        prog.set(0.88 + 0.12 * (++saved / hashed.length));
      }
      uploading = false;
      prog.done();
      toast({ message: files.length > 1 ? `Uploaded ${files.length} files` : "Posted", icon: "check" });
      if (!prog.minimized()) close();   // if it was minimized the sheet's already gone; the chip shows "complete"
      opts.onDone && opts.onDone(createdIds);
    } catch (e) {
      uploading = false;
      prog.fail();
      post.disabled = false;
      // Log the full error so a devtools peek shows the stage + code even after the toast fades.
      console.error("[eski upload] failed:", e);
      toast({ message: "Upload failed — " + (e.message || e), icon: "clock", duration: 7000 });
    }
  }
}
