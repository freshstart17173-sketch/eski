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

import { openModal, VisibilitySeg, Button, openMenu, toast, el } from "../ui.js";
import { iconEl } from "../icons.js";
import { supabase, session, rawSession } from "../supabase.js";
import { createFolder, visToDb } from "../data.js";

// ext → kind, and the allowlist the signer (api/sign.mjs EXT) will actually sign.
const KIND = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image",
  mp3: "audio", m4a: "audio", ogg: "audio", opus: "audio", wav: "audio", flac: "audio", aac: "audio", webm: "audio",
  mp4: "video", mov: "video", avi: "video", mkv: "video",
  txt: "text", md: "text",
  pdf: "other", zip: "other", cbz: "other", cbr: "other", epub: "other", doc: "other", docx: "other", json: "other", csv: "other",
};
const extOf = (name) => (name.split(".").pop() || "").toLowerCase();
const kindOf = (ext) => KIND[ext] || "other";

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The folder path a file sits in, from a directory pick — "Pack/drums/kick.wav" → "Pack/drums".
// A loose file (no webkitRelativePath) has no dir. Returns "" for a file at the picked root's
// top level only if the browser omitted the leading folder (it doesn't — webkitdirectory always
// includes the chosen folder as the first segment), so a folder upload always has a dir.
function relDir(file) {
  const p = file.webkitRelativePath || "";
  const parts = p.split("/");
  return parts.slice(0, -1).join("/");   // drop the filename
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
  target.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return; e.preventDefault(); clear();
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) openUpload({ ...(getOpts ? getOpts() : {}), files });
  });
}

export async function openUpload(opts = {}) {
  const me = session();
  if (!me) { toast({ message: "Sign in to upload" }); return; }

  let files = [];
  let visibility = opts.visibility || (opts.serverId ? "server" : "public");
  let serverId = opts.serverId || null, channelId = opts.channelId || null, folderId = opts.folderId || null;
  let folderName = null;
  const collabs = [];   // {handle, role}

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

  const picker = el("input", { type: "file", multiple: true, style: "display:none" });
  // A whole-folder picker. webkitdirectory makes the browser hand back every file in the
  // chosen tree, each carrying a `webkitRelativePath` ("Pack/drums/kick.wav") — that path
  // is what lets us recreate the folder structure on upload (buildFolderTree). Kept a
  // separate input from `picker` because a directory input can't also pick loose files.
  const folderPicker = el("input", { type: "file", multiple: true, style: "display:none" });
  folderPicker.setAttribute("webkitdirectory", "");
  folderPicker.setAttribute("directory", "");
  const drop = el(".dropzone", {}, [iconEl("clip"), el("div", {}, ["Drop files here, or click to choose"])]);
  const dropAlt = el(".dropalt", { style: "text-align:center;font-size:var(--fs-xs);color:var(--muted);margin-top:6px" }, [
    "or ", el("button.aslink", { type: "button", style: "color:var(--soft);font-weight:600", onClick: () => folderPicker.click() }, ["upload a folder"]),
    el("span", { style: "color:var(--muted)" }, [" (keeps its structure)"]),
  ]);
  const dropWrap = el("div", {}, [drop, dropAlt, picker, folderPicker]);
  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => addFiles([...picker.files], false));
  folderPicker.addEventListener("change", () => addFiles([...folderPicker.files], true));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...(e.dataTransfer?.files || [])], false); });

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

  const ustore = el(".ustore");

  const titleInput = el("input", { placeholder: "" });
  const tagsInput = el("input", { placeholder: "142bpm, bridge" });
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
    el("summary", {}, [iconEl("chev", "sm"), "Add details ", el("span", { style: "color:var(--muted);font-weight:400" }, ["(optional)"])]),
    el("label.fl", {}, ["Title ", el("span", { style: "color:var(--muted)" }, ["file name if blank"])]),
    el(".field", {}, [titleInput]),
    el("label.fl", {}, ["Tags"]),
    el(".field", {}, [tagsInput]),
    el("label.fl", {}, ["Collaborators ", el("span", { style: "color:var(--muted)" }, ["@handle + role"])]),
    collabChips,
  ]);

  body.append(dropWrap, el("label.fl", {}, ["Visibility ", el("span", { style: "color:var(--muted)" }, ["required"])]), visSeg, serverPick, ustore, addmore);

  // ── footer ──────────────────────────────────────────────────────────────
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const post = Button({ label: "Post", variant: "primary", disabled: true });
  const { close } = openModal({ title: "Upload", size: "wide", body, footer: [cancel, post] });
  cancel.addEventListener("click", () => close());
  post.addEventListener("click", doPost);
  syncVis();
  // Pre-loaded files (a drag-and-drop onto the explorer / a channel opens the sheet ready).
  if (opts.files?.length) addFiles([...opts.files], false);

  // ── helpers ───────────────────────────────────────────────────────────────
  let folderMode = false;
  function addFiles(list, asFolder) {
    const rejected = list.filter((f) => !KIND[extOf(f.name)]);
    files = list.filter((f) => KIND[extOf(f.name)]);
    folderMode = !!asFolder && files.some((f) => f.webkitRelativePath);
    if (rejected.length) toast({ message: `Skipped ${rejected.length} unsupported file${rejected.length > 1 ? "s" : ""}` });
    if (files.length) {
      let summary;
      if (folderMode) {
        const top = (files[0].webkitRelativePath || "").split("/")[0] || "folder";
        const subs = new Set(files.map((f) => f.webkitRelativePath.split("/").slice(1, -1).join("/")).filter(Boolean));
        summary = el(".dropsummary", {}, [iconEl("folder", "sm"), el("b", {}, [top]),
          ` · ${files.length} file${files.length > 1 ? "s" : ""}${subs.size ? ` in ${subs.size + 1} folders` : ""}`]);
        summary.title = "Choose a different folder";
        summary.addEventListener("click", () => folderPicker.click());
      } else {
        summary = el(".dropsummary", {}, [el("b", {}, [files[0].name]), files.length > 1 ? ` · ${files.length} files` : ""]);
        summary.title = "Choose different files";
        summary.addEventListener("click", () => picker.click());
      }
      summary.style.cursor = "pointer";
      // Rebuild the dropzone → summary swap idempotently (a re-pick replaces the prior summary).
      dropWrap.querySelector(".dropsummary")?.remove();
      if (drop.parentNode) drop.replaceWith(summary); else dropAlt.before(summary);
      dropAlt.hidden = true;
      drop.classList.remove("over");
      titleInput.placeholder = files[0].name;
    }
    syncVis();
  }
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
      ustore.replaceChildren(iconEl("server", "sm"), "Draws ", el("b", {}, [serverName(serverId)]), "'s storage");
    } else {
      ustore.replaceChildren(iconEl("user", "sm"), "Draws ", el("b", {}, ["your"]), " storage");
    }
    post.disabled = !files.length || (visibility === "server" && !serverId);
    post.textContent = files.length > 1 ? `Post ${files.length} files` : "Post";
  }

  async function doPost() {
    post.disabled = true;
    const prog = el(".uprogress", {}, ["Hashing…"]);
    body.append(prog);
    try {
      const hashed = await Promise.all(files.map(async (f) => ({ file: f, hash: await sha256Hex(f), ext: extOf(f.name) })));
      prog.textContent = "Getting upload URLs…";
      const token = rawSession()?.access_token;
      const signRes = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ files: hashed.map((h) => ({ hash: h.hash, ext: h.ext })) }),
      });
      const signJson = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signJson.error || `signer said ${signRes.status}`);

      prog.textContent = "Uploading…";
      await Promise.all(hashed.map((h, i) => fetch(signJson.files[i].url, {
        method: "PUT", body: h.file, headers: { "content-type": h.file.type || "application/octet-stream" },
      }).then((r) => { if (!r.ok) throw new Error(`R2 PUT failed (${r.status}) — check the bucket CORS (r2-cors.json)`); })));

      // Register each blob (sha + bytes) BEFORE inserting works: works.blob_sha has a FK to
      // media_blobs, which is RLS-locked, so this SECURITY DEFINER RPC is the only thing that
      // can create the row. Without it every works insert failed the FK (the upload "did
      // nothing"). Content-addressed → a repeated sha is a no-op.
      prog.textContent = "Finishing…";
      const seen = new Set();
      for (const h of hashed) {
        if (seen.has(h.hash)) continue; seen.add(h.hash);
        const { error: be } = await supabase.rpc("register_blob", { p_sha: h.hash, p_bytes: h.file.size });
        if (be) throw new Error(`couldn’t register the file (${be.code || "db"}): ${be.message}`);
      }

      const onServer = visibility === "server";
      // Folder upload: recreate the picked tree first, then file each work into the folder its
      // path names. Server folders nest under the chosen destination folder; personal ones nest
      // at the My-files root. A loose (non-folder) upload keeps the single chosen folderId.
      let folderMap = null;
      if (folderMode) {
        prog.textContent = "Creating folders…";
        folderMap = await buildFolderTree(files, {
          source: onServer ? "server" : "personal",
          serverId: onServer ? serverId : null,
          baseFolderId: onServer ? folderId : null,
        });
      }
      const folderFor = (h) => folderMode ? (folderMap.get(relDir(h.file)) || folderId || null) : (folderId || null);

      prog.textContent = "Posting…";
      const title = titleInput.value.trim();
      const tags = tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean);
      const user = session();
      for (const h of hashed) {
        const destFolder = folderFor(h);
        const row = {
          author_id: me.id,
          owner_type: onServer ? "server" : "user",
          owner_id: onServer ? serverId : me.id,
          visibility: visToDb(visibility),   // 'private' → 'personal' (the DB noun); raw 'private' fails the check
          server_id: onServer ? serverId : null,
          // A folder upload keeps each file's own name; a loose upload can override the title.
          title: folderMode ? h.file.name : (title || h.file.name),
          file_ext: h.ext,
          kind: kindOf(h.ext),
          blob_sha: h.hash,
          bytes: h.file.size,
        };
        const { data: work, error } = await supabase.from("works").insert(row).select("id").single();
        if (error) throw new Error(`couldn’t save the post (${error.code || "db"}): ${error.message}`);
        if (onServer) {
          const { error: pe } = await supabase.from("placement").insert({ work_id: work.id, surface: "server", surface_id: serverId, channel_id: channelId || null, folder_id: destFolder, placed_by: me.id });
          if (pe) throw new Error(`couldn’t place the file in the channel (${pe.code || "db"}): ${pe.message}`);
        } else if (destFolder) {
          // Personal upload into a folder: saved_items.folder_id is how My-files filing works.
          const { error: se } = await supabase.from("saved_items").upsert({ user_id: user.id, work_id: work.id, folder_id: destFolder }, { onConflict: "user_id,work_id" });
          if (se) throw new Error(`couldn’t file into your folder (${se.code || "db"}): ${se.message}`);
        }
        // Folder uploads skip the single Tags/Collaborators fields (they belong to a loose post).
        if (!folderMode) {
          for (const t of tags) await supabase.from("content_tags").insert({ work_id: work.id, tag: t });
          for (const c of collabs) await supabase.rpc("add_collaborator", { work_id: work.id, handle: c.handle, role: c.role });
        }
      }
      toast({ message: folderMode ? `Uploaded ${files.length} files` : (files.length > 1 ? `Posted ${files.length} files` : "Posted"), icon: "check" });
      close();
      opts.onDone && opts.onDone();
    } catch (e) {
      prog.remove();
      post.disabled = false;
      // Log the full error so a devtools peek shows the stage + code even after the toast fades.
      console.error("[eski upload] failed:", e);
      toast({ message: "Upload failed — " + (e.message || e), icon: "clock", duration: 7000 });
    }
  }
}
