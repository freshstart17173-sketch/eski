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
  const serverName = (id) => myServers.find((s) => s.id === id)?.name || "server";

  // ── body ──────────────────────────────────────────────────────────────────
  const body = el(".uploadbody");

  const picker = el("input", { type: "file", multiple: true, style: "display:none" });
  const drop = el(".dropzone", {}, [iconEl("clip"), el("div", {}, ["Drop files here, or click to choose"])]);
  const dropWrap = el("div", {}, [drop, picker]);
  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => addFiles([...picker.files]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...(e.dataTransfer?.files || [])]); });

  const visSeg = VisibilitySeg({ value: visibility, onChange: (v) => { visibility = v; syncVis(); } });

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

  // ── helpers ───────────────────────────────────────────────────────────────
  function addFiles(list) {
    const rejected = list.filter((f) => !KIND[extOf(f.name)]);
    files = list.filter((f) => KIND[extOf(f.name)]);
    if (rejected.length) toast({ message: `Skipped ${rejected.length} unsupported file${rejected.length > 1 ? "s" : ""}` });
    if (files.length) {
      const summary = el(".dropsummary", {}, [el("b", {}, [files[0].name]), files.length > 1 ? ` · ${files.length} files` : ""]);
      summary.style.cursor = "pointer"; summary.title = "Choose different files";
      summary.addEventListener("click", () => picker.click());
      drop.replaceWith(summary); drop.classList.remove("over");
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

      prog.textContent = "Posting…";
      const title = titleInput.value.trim();
      const tags = tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean);
      for (const h of hashed) {
        const onServer = visibility === "server";
        const row = {
          author_id: me.id,
          owner_type: onServer ? "server" : "user",
          owner_id: onServer ? serverId : me.id,
          visibility,
          server_id: onServer ? serverId : null,
          title: title || h.file.name,
          file_ext: h.ext,
          kind: kindOf(h.ext),
          blob_sha: h.hash,
          bytes: h.file.size,
        };
        const { data: work, error } = await supabase.from("works").insert(row).select("id").single();
        if (error) throw new Error(`couldn’t save the post (${error.code || "db"}): ${error.message}`);
        if (onServer) {
          const { error: pe } = await supabase.from("placement").insert({ work_id: work.id, surface: "server", surface_id: serverId, channel_id: channelId || null, folder_id: folderId || null, placed_by: me.id });
          if (pe) throw new Error(`couldn’t place the file in the channel (${pe.code || "db"}): ${pe.message}`);
        }
        for (const t of tags) await supabase.from("content_tags").insert({ work_id: work.id, tag: t });
        for (const c of collabs) await supabase.rpc("add_collaborator", { work_id: work.id, handle: c.handle, role: c.role });
      }
      toast({ message: files.length > 1 ? `Posted ${files.length} files` : "Posted", icon: "check" });
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
