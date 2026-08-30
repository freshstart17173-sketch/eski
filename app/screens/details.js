// screens/details.js — the Details pane (P5.5, CANON §C.7, eski-style §5). The ONE
// media viewer for every file kind: there is no separate lightbox. A near-full-screen
// arena on a scrim — the media takes the room (left, grows), a fixed ~380px info rail
// on the right. Closes on ✕, Esc, and a backdrop click (standard modal behaviour).
//
// Post vs server file (the load-bearing distinction): the same shell serves both;
// a **server file** has NO discussion section (replies live in the channel chat), a
// **post** gets a public comment thread. The explorer opens server files, so its
// panes carry tags but no comments.
//
// Media by kind: image fills the well; audio/video reuse the P3 MediaPlayer (real
// transport) when bytes exist; non-previewable (and, until a real R2 upload exists,
// anything with no blob) shows a type card — never a fake thumbnail.

import { el, toast, openMenu } from "../ui.js";
import { tagChip, parseTag } from "../tags.js";
import { openReport } from "../report.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { MediaPlayer } from "../ui.js";
import { mediaUrl, KIND_ICON, downloadWork, baseName } from "../cards.js";
import { saveToFiles, unsaveWork, isWorkSaved, addTag, removeTag } from "../data.js";

let openSheet = null;   // the single live overlay (only one details pane at a time)

export function fmtBytes(n) {
  n = Number(n || 0);
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
function fmtWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${date}, ${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// close whatever pane is open (Esc / ✕ / backdrop)
export function closeDetails() {
  if (!openSheet) return;
  openSheet.remove();
  document.removeEventListener("keydown", openSheet._onKey);
  openSheet = null;
}

// openDetails(work, ctx) — ctx: { serverId, serverName, folderPath:[{id,name}],
// siblings:[work], onSibling?, isPost? }
export function openDetails(work, ctx = {}) {
  closeDetails();
  const sheet = el(".sheet", { onClick: (e) => { if (e.target === sheet) closeDetails(); } });
  const card = el(".card2");
  sheet.append(card);

  // prev/next across the current folder's files (siblings)
  const sibs = ctx.siblings || [];
  let idx = Math.max(0, sibs.findIndex((w) => w.id === work.id));
  const go = (d) => { const n = idx + d; if (n < 0 || n >= sibs.length) return; idx = n; paint(sibs[idx]); };

  function paint(w) {
    const nav = { go, hasPrev: idx > 0, hasNext: idx < sibs.length - 1 };
    // file actions (⋯) — supplied by the explorer; a public post (feed/profile) omits them.
    // repaint re-renders the pane in place after an in-viewer star/rename/hide.
    if (ctx.menuItemsFor) nav.openActions = (anchor) => openMenu(anchor, ctx.menuItemsFor(w, { repaint: () => paint(w), close: closeDetails }));
    card.replaceChildren(mediaArea(w), infoRail(w, ctx, nav));
  }
  paint(work);

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeDetails(); }
    else if (e.key === "ArrowLeft" && !isMediaFocused()) go(-1);
    else if (e.key === "ArrowRight" && !isMediaFocused()) go(1);
  };
  sheet._onKey = onKey;
  document.addEventListener("keydown", onKey);
  document.body.append(sheet);
  openSheet = sheet;
  // focus the close button so Esc/Tab land inside the pane
  card.querySelector('[data-x]')?.focus();
  return sheet;
}

// ← / → drive prev/next UNLESS a media player is focused (there they mean 5s skip)
function isMediaFocused() {
  const a = document.activeElement;
  return !!a && !!a.closest?.(".dmplayer");
}

// ── media well ───────────────────────────────────────────────────────────────
function mediaArea(w) {
  const well = el(".dmedia");
  fillMedia(well, w);
  return well;
}

// The full-viewer media dispatch, shared with the shared-link viewer (screens/shared.js)
// so there's ONE place that decides image-vs-player-vs-typecard: fills `mount` with the
// right node for the kind, adding `.bare` when real bytes render (no padding around the
// media) and falling back to a type card when the bytes are missing/broken.
export function fillMedia(mount, w) {
  const url = mediaUrl(w);
  if (w.kind === "image" && url) {
    mount.classList.add("bare");
    const img = el("img", { src: url, alt: w.title || "" });
    img.addEventListener("error", () => { mount.classList.remove("bare"); mount.replaceChildren(typeCard(w)); }, { once: true });
    mount.replaceChildren(img);
    return;
  }
  if ((w.kind === "audio" || w.kind === "video") && url) {
    mount.classList.add("bare");
    mount.replaceChildren(MediaPlayer({ src: url, kind: w.kind }));
    return;
  }
  mount.replaceChildren(typeCard(w));   // non-previewable, or no bytes yet
}

export function typeCard(w) {
  const icon = iconEl(KIND_ICON[w.kind] || "file");
  const kids = [icon, el("span.ext", {}, [(w.file_ext || "").toUpperCase()])];
  // honest note: real bytes only arrive with a live R2 upload
  kids.push(el("span.nb", {}, [w.blob_sha ? "no preview, download to open" : "preview loads after upload"]));
  return el(".dtype", {}, kids);
}

// ── info rail ─────────────────────────────────────────────────────────────────
function infoRail(w, ctx, nav) {
  const top = el(".dtop", {}, [
    el("span.dfilename", {}, [baseName(w)]),
    // ⋯ file actions (star/rename/move/hide/delete) — only for files the explorer owns;
    // a public post carries no menuItemsFor, so the button doesn't render there.
    nav.openActions ? iconBtn("more", "More actions", (e) => nav.openActions(e.currentTarget), { haspopup: true }) : null,
    iconBtn("flag", "Report", () => openReport({ targetType: "work", targetId: w.id, serverId: ctx?.serverId || null, label: `“${w.title || w.name || "this file"}”` })),
    iconBtn("chev", "Previous item", () => nav.go(-1), { rotate: 90, disabled: !nav.hasPrev, cls: "sp" }),
    iconBtn("chev", "Next item", () => nav.go(1), { rotate: -90, disabled: !nav.hasNext }),
    iconBtn("x", "Close", closeDetails, { x: true }),
  ]);

  const scroll = el(".scroll", {}, [
    el("h2", {}, [baseName(w)]),
    metaRows(w, ctx),
    // tags: shown when the work carries any, OR when it's editable (an explorer file, which
    // is the same signal that gives it the ⋯ edit menu) so the first tag can be added.
    (ctx.menuItemsFor || (w.tags && w.tags.length)) ? tagsSection(w, ctx) : null,
    // No discussion thread anywhere: server files use channel chat for replies, and
    // public-post commenting was cut from the beta (P4, 2026-08-30) → the post itself
    // stays (reached from a profile's Public shelf), the comment thread is gone.
  ]);

  const foot = el(".foot", {}, [
    el("button.btn.primary", { onClick: () => downloadWork(w) }, [iconEl("download", "sm"), "Download"]),
    // Save to my files: a real saved_items pointer (§E.3), a toggle. Hidden on a personal
    // file — it's already in your library. Own state is confirmed async on open.
    ctx.personal ? null : saveButton(w),
  ]);

  return el(".dinfo", {}, [top, scroll, foot]);
}

function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }

// Save to my files — a toggle backed by a real `saved_items` pointer (§E.3). The label +
// icon carry the state (Save ⇄ Saved); the current state is confirmed async after open so
// a re-open of an already-saved file reads correctly. Demo toggles optimistically.
function saveButton(w) {
  const btn = el("button.btn");
  let saved = false, busy = false;
  const render = () => btn.replaceChildren(iconEl(saved ? "check" : "save", "sm"), saved ? "Saved to my files" : "Save to my files");
  render();
  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const next = !saved;
    try {
      if (!isDemoQS()) { next ? await saveToFiles(w.id) : await unsaveWork(w.id); }
      saved = next; render();
      toast({ message: saved ? "Saved to your files" : "Removed from your files", icon: saved ? "check" : "save" });
    } catch (e) { toast({ message: e?.message || "Couldn’t save" }); }
    busy = false;
  });
  if (!isDemoQS()) isWorkSaved(w.id).then((s) => { if (s) { saved = true; render(); } }).catch(() => {});
  return btn;
}

function metaRows(w, ctx) {
  const rows = [];
  // Location — root › folder path, each segment opens the explorer there. Shown
  // for server/personal files (which live in a tree); a public post reached from
  // the Feed has no local tree here, so it leads with Posted-by instead.
  if (ctx.serverId || ctx.personal) {
    const loc = el("span.loccrumb");
    loc.append(el("button", { onClick: () => openFolder(ctx, null) }, [iconEl(ctx.personal ? "user" : "folder", "sm"), ctx.serverName || (ctx.personal ? "My files" : "Server")]));
    for (const seg of ctx.folderPath || []) {
      loc.append(el("span.sl", {}, ["›"]), el("button", { onClick: () => openFolder(ctx, seg.id) }, [seg.name]));
    }
    rows.push(metaRow("Location", loc));
  }

  // The author link opens their profile (the profile screen is real). Close the details
  // sheet first so we don't leave an overlay hanging over the navigated-to page. No handle
  // (older shapes) → fall back to the toast rather than a dead link to /u/undefined.
  if (w.who) rows.push(metaRow(ctx.isPost ? "Posted by" : "Uploaded by", el("button.metalink", { onClick: () => {
    if (w.who.handle) { closeDetails(); navigate("/u/" + w.who.handle + (isDemoQS() ? "?demo=1" : "")); }
    else toast({ message: `${w.who.name}'s profile` });
  } }, [w.who.name])));
  if (w.channelName) rows.push(metaRow("Posted in", "#" + w.channelName));
  rows.push(metaRow("Added", fmtWhen(w.created_at)));
  if (w.file_ext) rows.push(metaRow("Format", w.file_ext.toUpperCase() + (w.kind && w.kind !== "other" ? ` · ${w.kind}` : "")));
  rows.push(metaRow("Size", fmtBytes(w.bytes)));   // Size is always LAST (eski-style §5)
  return el(".meta", {}, rows);
}

function metaRow(k, v) {
  return el(".row", {}, [el("span.k", {}, [k]), el("span.v", {}, [v])]);
}

// Tags — read-only on a non-editable post, add/remove on an editable explorer file (gated by
// ctx.menuItemsFor, the same signal as the ⋯ edit menu). Writes go to content_tags; RLS is
// the real fence. The "+" swaps to an inline input (Enter adds, Esc cancels); each chip on an
// editable work carries a remove ×. Optimistic: the local w.tags is patched then repainted.
function tagsSection(w, ctx = {}) {
  const editable = !!ctx.menuItemsFor;
  if (!w.tags) w.tags = [];
  const chips = el(".chips");

  async function add(raw) {
    // P11 — normalize via parseTag so a typed "bpm:142" is stored as type:value (type lowercased,
    // value kept as typed); an untyped tag keeps its text. Strips a leading # if present.
    const clean = parseTag((raw || "").replace(/^#/, "")).raw;
    if (!clean) return;
    if (w.tags.includes(clean)) { toast({ message: "Already tagged" }); paint(); return; }
    try { if (!isDemoQS()) await addTag(w.id, clean); w.tags.push(clean); paint(); }
    catch (e) { toast({ message: e?.message || "Couldn’t add the tag" }); paint(); }
  }
  async function remove(t) {
    try { if (!isDemoQS()) await removeTag(w.id, t); w.tags = w.tags.filter((x) => x !== t); paint(); }
    catch (e) { toast({ message: e?.message || "Couldn’t remove the tag" }); }
  }
  function openInput() {
    const input = el("input", { placeholder: "tag or bpm:142", "aria-label": "New tag" });
    const holder = el(".field", { style: "max-width:130px;height:26px" }, [input]);
    // `closed` guards the double-fire: committing on Enter repaints (detaching the input),
    // which fires blur — without the guard that would re-add the same value.
    let closed = false;
    const done = (v) => { if (closed) return; closed = true; (v || "").trim() ? add(v) : paint(); };
    chips.replaceChildren(...w.tags.map(chip), holder);
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(input.value); }
      else if (e.key === "Escape") { e.preventDefault(); closed = true; paint(); }
    });
    input.addEventListener("blur", () => done(input.value));
  }
  // P26: clicking a tag (not the ✕) starts a search for every file carrying it (ctx.onTagSearch,
  // wired by the explorer). Removable ✕ stays for editable files.
  function chip(t) { return tagChip(t, { removable: editable, onRemove: () => remove(t), onSearch: ctx.onTagSearch }); }
  function paint() {
    chips.replaceChildren(...w.tags.map(chip));
    if (editable) chips.append(el("button.addtag", { title: "Add tag", "aria-label": "Add tag", onClick: openInput }, [iconEl("plus", "sm")]));
  }
  paint();
  return el(".dsec", {}, [el(".lb", {}, ["Tags"]), chips]);
}

// Public-post commenting was cut from the beta (P4, 2026-08-30): the post itself stays
// (reached from a profile's Public shelf), but the comment thread — commentsSection /
// commentRow, wired to the `comments` table — is gone. The `comments` table + the
// post_comment RPC remain in the schema, dormant, for a post-beta return (D1).

// ── helpers ───────────────────────────────────────────────────────────────────
function iconBtn(ic, title, onClick, { rotate, disabled, cls, x, haspopup } = {}) {
  const b = el("button.iconbtn" + (cls ? "." + cls : ""), { title, "aria-label": title, onClick, disabled: disabled || null });
  if (x) b.setAttribute("data-x", "1");
  if (haspopup) b.setAttribute("aria-haspopup", "menu");
  const g = iconEl(ic, "sm");
  if (rotate) g.style.transform = `rotate(${rotate}deg)`;
  b.append(g);
  if (disabled) b.style.opacity = ".4";
  return b;
}

// a Location segment click leaves the pane for the explorer at that folder
function openFolder(ctx, folderId) {
  if (!ctx.personal && !ctx.serverId) return;
  closeDetails();
  const base = ctx.personal ? "/files" : `/s/${ctx.serverId}/files`;
  const q = new URLSearchParams();
  if (folderId) q.set("folder", folderId);
  if (new URLSearchParams(location.search).get("demo") === "1") q.set("demo", "1");
  const qs = q.toString();
  navigate(base + (qs ? `?${qs}` : ""));
}
