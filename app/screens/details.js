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

import { el, toast, Tag } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { MediaPlayer } from "../ui.js";
import { mediaUrl, KIND_ICON } from "../cards.js";

let openSheet = null;   // the single live overlay (only one details pane at a time)

function fmtBytes(n) {
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
    card.replaceChildren(mediaArea(w), infoRail(w, ctx, { go, hasPrev: idx > 0, hasNext: idx < sibs.length - 1 }));
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
  const url = mediaUrl(w);
  if (w.kind === "image" && url) {
    const well = el(".dmedia.bare");
    const img = el("img", { src: url, alt: w.title || "" });
    img.addEventListener("error", () => { well.classList.remove("bare"); well.replaceChildren(typeCard(w)); }, { once: true });
    well.append(img);
    return well;
  }
  if ((w.kind === "audio" || w.kind === "video") && url) {
    const player = MediaPlayer({ src: url, kind: w.kind });
    return el(".dmedia.bare", {}, [player]);
  }
  // non-previewable, or no bytes yet — a type card fills the well
  return el(".dmedia", {}, [typeCard(w)]);
}

function typeCard(w) {
  const icon = iconEl(KIND_ICON[w.kind] || "file");
  const kids = [icon, el("span.ext", {}, [(w.file_ext || "").toUpperCase()])];
  // honest note: real bytes only arrive with a live R2 upload
  kids.push(el("span.nb", {}, [w.blob_sha ? "no preview, download to open" : "preview loads after upload"]));
  return el(".dtype", {}, kids);
}

// ── info rail ─────────────────────────────────────────────────────────────────
function infoRail(w, ctx, nav) {
  const top = el(".dtop", {}, [
    el("span.dfilename", {}, [w.title || w.name || "untitled"]),
    iconBtn("flag", "Report", () => toast({ message: "Report (P8)" })),
    iconBtn("chev", "Previous item", () => nav.go(-1), { rotate: 90, disabled: !nav.hasPrev, cls: "sp" }),
    iconBtn("chev", "Next item", () => nav.go(1), { rotate: -90, disabled: !nav.hasNext }),
    iconBtn("x", "Close", closeDetails, { x: true }),
  ]);

  const scroll = el(".scroll", {}, [
    el("h2", {}, [w.title || w.name || "untitled"]),
    metaRows(w, ctx),
    (w.tags && w.tags.length) ? tagsSection(w) : null,
    // server file = NO discussion section (chat handles replies); post = comments
    ctx.isPost ? commentsSection(ctx) : null,
  ]);

  const foot = el(".foot", {}, [
    el("button.btn.primary", { onClick: () => toast({ message: "Download (needs the R2 read env)", icon: "download" }) }, [iconEl("download", "sm"), "Download", iconEl("chev", "sm")]),
    el("button.btn", { onClick: () => toast({ message: "Save to my files (P5.8)", icon: "save" }) }, [iconEl("save", "sm"), "Save to my files"]),
  ]);

  return el(".dinfo", {}, [top, scroll, foot]);
}

function metaRows(w, ctx) {
  const rows = [];
  // Location — server › folder path, each segment opens the explorer there
  const loc = el("span.loccrumb");
  const rootBtn = el("button", { onClick: () => openFolder(ctx, null) }, [iconEl(ctx.personal ? "user" : "folder", "sm"), ctx.serverName || (ctx.personal ? "My files" : "Server")]);
  loc.append(rootBtn);
  for (const seg of ctx.folderPath || []) {
    loc.append(el("span.sl", {}, ["›"]), el("button", { onClick: () => openFolder(ctx, seg.id) }, [seg.name]));
  }
  rows.push(metaRow("Location", loc));

  if (w.who) rows.push(metaRow("Uploaded by", el("button.metalink", { onClick: () => toast({ message: `${w.who.name}'s profile (P5.10)` }) }, [w.who.name])));
  if (w.channelName) rows.push(metaRow("Posted in", "#" + w.channelName));
  rows.push(metaRow("Added", fmtWhen(w.created_at)));
  if (w.file_ext) rows.push(metaRow("Format", w.file_ext.toUpperCase() + (w.kind && w.kind !== "other" ? ` · ${w.kind}` : "")));
  rows.push(metaRow("Size", fmtBytes(w.bytes)));   // Size is always LAST (eski-style §5)
  return el(".meta", {}, rows);
}

function metaRow(k, v) {
  return el(".row", {}, [el("span.k", {}, [k]), el("span.v", {}, [v])]);
}

function tagsSection(w) {
  const chips = el(".chips", {}, w.tags.map((t) => Tag({ label: t })));
  chips.append(el("button.addtag", { title: "Add tag", onClick: () => toast({ message: "Add tag (P5.9)" }) }, [iconEl("plus", "sm")]));
  return el(".dsec", {}, [el(".lb", {}, ["Tags"]), chips]);
}

function commentsSection(ctx) {
  const list = el("div", {}, (ctx.comments || []).map((c) => el(".cmt", {}, [
    el(".av.sm", { style: c.colorIdx != null ? `color:var(--m${c.colorIdx})` : null }, [(c.name || "?").slice(0, 2).toUpperCase()]),
    el(".bd", {}, [
      el(".by", {}, [el("span.u", { style: c.colorIdx != null ? `color:var(--m${c.colorIdx})` : null, class: c.colorIdx != null ? `u m${c.colorIdx}` : "u" }, [c.name]), el("time", {}, [c.time || ""])]),
      el(".tx", {}, [c.text || ""]),
    ]),
  ])));
  const field = el(".field", { style: "margin-top:8px" }, [el("input", { placeholder: "Add a comment" })]);
  return el(".dsec", {}, [el(".lb", {}, ["Comments"]), list, field]);
}

// ── helpers ───────────────────────────────────────────────────────────────────
function iconBtn(ic, title, onClick, { rotate, disabled, cls, x } = {}) {
  const b = el("button.iconbtn" + (cls ? "." + cls : ""), { title, "aria-label": title, onClick, disabled: disabled || null });
  if (x) b.setAttribute("data-x", "1");
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
