// cards.js — the ONE work-card renderer (P5.2), shared by the explorer, feed,
// channel Files tab, and profile shelves. A card is a square cell (even grid) or
// natural aspect (masonry); media renders by kind — image thumb, video frame +
// play overlay, audio/other/text as a type card (icon + ext). It leads with the
// file name; the uploader chip carries the server hue (server surfaces only).
//
// mediaUrl(): the DB stores the content-addressed object KEY parts (blob_sha +
// file_ext); the public URL is `${R2_PUBLIC_BASE_URL}/${sha0:2}/${sha}.${ext}`.
// Until a real upload exists the bytes 404 — image/video fall back to a type card.

import { el, toast, Avatar } from "./ui.js";
import { iconEl } from "./icons.js";
import { R2_PUBLIC_BASE_URL } from "./env.js";
import { tagChip } from "./tags.js";

export const KIND_ICON = { audio: "music", image: "image", video: "video", text: "type", other: "file" };

export function mediaUrl(work) {
  if (!work?.blob_sha || !work?.file_ext) return null;
  const s = work.blob_sha;
  return `${R2_PUBLIC_BASE_URL}/${s.slice(0, 2)}/${s}.${work.file_ext}`;
}

// a profile photo/banner URL from its stored object key (profiles.avatar_key/banner_key,
// already the full `${sha0:2}/${sha}.${ext}` path). Null when unset → the avatar shows initials.
export function avatarUrl(key) { return key ? `${R2_PUBLIC_BASE_URL}/${key}` : null; }

// Download a work's bytes with its real filename (not the content-addressed sha key).
// The object lives cross-origin on cdn.eski.lol, where the `download` attribute is
// ignored — so fetch the blob (R2's GET * CORS rule allows it) and save via a blob URL;
// if that's blocked or the object is missing, fall back to opening the URL directly. A
// work with no stored bytes yet (no upload) has nothing to download — say so, don't 404.
export async function downloadWork(work) {
  const url = mediaUrl(work);
  if (!url) { toast({ message: "This file has no stored bytes yet — nothing to download." }); return; }
  const name = work.title || work.name || `file.${work.file_ext || "bin"}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`R2 ${res.status}`);
    const href = URL.createObjectURL(await res.blob());
    const a = el("a", { href, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, "_blank", "noopener");   // cross-origin block / missing object → let the browser handle it
  }
}

function typeCard(work) {
  const icon = iconEl(KIND_ICON[work.kind] || "file"); icon.classList.add("fic");
  return el(".media." + (work.kind === "audio" ? "audio" : "file"), {}, [
    icon, el("span.ext", {}, [(work.file_ext || "").toUpperCase()]),
  ]);
}
// swap a media cell's contents to the type-card fallback (missing/broken bytes)
function fallbackTo(cell, work) {
  const tc = typeCard(work);
  cell.className = tc.className;
  cell.replaceChildren(...tc.childNodes);
}

// media cell by kind, with graceful fallback to a type card when bytes are missing
function mediaCell(work) {
  const url = mediaUrl(work);
  if (work.kind === "image" && url) {
    const m = el(".media");
    const img = el("img.shot", { src: url, alt: work.title || "", loading: "lazy" });
    img.addEventListener("error", () => fallbackTo(m, work), { once: true });
    m.append(img);
    return m;
  }
  if (work.kind === "video" && url) {
    const m = el(".media");
    const v = el("video.shot", { src: url, muted: true, preload: "metadata", playsinline: true });
    v.addEventListener("error", () => fallbackTo(m, work), { once: true });
    m.append(v, el(".playover", {}, [iconEl("play")]));
    return m;
  }
  return typeCard(work);
}

// workCard(work, { onOpen, selectable, actions, showWho, hue })
// `hue` (default true) applies the server member colour to the uploader chip. The
// Feed and public profile pass hue:false — member colour is server-scoped and must
// render nowhere public (CANON design rule) — so the author shows as plain text.
// Display name WITHOUT the file extension (owner: the extension is noise on the card + title —
// it lives in the Format meta row instead). Strips only the KNOWN ext (work.file_ext), so a name
// with incidental dots and no recognised suffix is left intact.
export function baseName(work) {
  const n = work.title || work.name || "untitled";
  const ext = (work.file_ext || "").toLowerCase();
  return (ext && n.toLowerCase().endsWith("." + ext)) ? n.slice(0, -(ext.length + 1)) : n;
}

// ── the tile band (thumbnail redesign, owner 2026-08-31) ──────────────────────
// A card is a media plane + a distinct --surface band beneath it, landing-page style: name on top,
// then a row of a couple tags (left) and the uploader pfp + name (right). It stops a tile reading as
// "a square with loose text" and gives the grid contrast. Two shared helpers so file + folder cards
// build the SAME band (one definition, no drift).

// name element whose long value SCROLLS on hover (marquee). We can't know the overflow until it's in
// the DOM, so wireNameScroll() measures on first hover and drives an inner-span translate; a fade
// mask (.scrolls) hints "there's more" at rest. Short names never get the mask or the animation.
function bandName(full) {
  return el(".fname", { title: full }, [el("span.fnt", {}, [full])]);
}
function wireNameScroll(card, fname) {
  const inner = fname.querySelector(".fnt");
  let measured = false;
  card.addEventListener("mouseenter", () => {
    const over = inner.scrollWidth - fname.clientWidth;
    if (over <= 3) return;                       // fits — nothing to scroll
    if (!measured) { fname.classList.add("scrolls"); measured = true; }
    inner.style.transitionDuration = Math.min(Math.max(over / 45, 0.5), 3) + "s";
    inner.style.transform = `translateX(${-over}px)`;
  });
  // Snap back INSTANTLY on leave (owner: the slow scroll-back is annoying) — kill the transition
  // for the reset so it jumps home, then the next enter re-arms its own duration.
  card.addEventListener("mouseleave", () => { inner.style.transitionDuration = "0s"; inner.style.transform = ""; });
}
// the second band row: a couple read-only tag chips (left) + a who cell (right). `tags` is an array
// of raw tag strings; only the first two show (the details view carries them all). Chips are
// read-only here — clicking a tag to filter, and removing tags, is the deferred tag session (P38).
function bandRow(tags, whoCell) {
  const row = el(".frow");
  const shown = (tags || []).slice(0, 2);
  if (shown.length) row.append(el(".ftags", {}, shown.map((raw) => tagChip(raw))));
  if (whoCell) row.append(whoCell);
  return row;
}

export function workCard(work, { onOpen, selectable = false, actions = [], showWho = true, hue = true, starred = false, onStar } = {}) {
  const media = mediaCell(work);
  // B16: no selection-checkbox square — a selected card is shown by the .card.sel outline.
  // B33 (owner 2026-08-31): ONE star, top-left, click-to-toggle — the indicator and the toggle are
  // the same element in the same spot (they used to be an indicator top-left + a separate hover
  // action top-right that swapped places). Gold + filled when starred; a ghost star appears on
  // card hover so you can star. The star is NOT in the hover ⋯ cluster any more.
  if (onStar) {
    media.prepend(el("button.cardstar" + (starred ? ".on" : ""), { title: starred ? "Unstar" : "Star",
      onClick: (e) => { e.stopPropagation(); onStar(work); } }, [iconEl("star")]));
  }
  const acts = actions;
  if (acts.length) {
    const bar = el(".cardacts", {}, acts.map((a) =>
      el("button" + (a.cls ? "." + a.cls : ""), { title: a.title, "data-act": a.act, onClick: (e) => { e.stopPropagation(); a.onClick?.(work); } }, [iconEl(a.icon)])));
    media.append(bar);
  }
  // the uploader cell: a small pfp + name (server hue on the pfp/name only where allowed). A public
  // surface (feed / public profile) passes hue:false → no member colour, and the pfp still shows.
  let whoCell = null;
  if (showWho && work.who) {
    whoCell = el(".who");
    const av = Avatar({ name: work.who.name, src: avatarUrl(work.who.avatar_key), size: "sm", colorIdx: hue ? work.who.colorIdx : null });
    const name = el("span.uname", {}, [work.who.name + (work.channelName ? " · #" + work.channelName : "")]);
    if (hue && work.who.colorIdx != null) name.style.color = `var(--m${work.who.colorIdx})`;
    whoCell.append(av, name);
  }
  const foot = el(".cardfoot", {}, [bandName(baseName(work)), bandRow(work.tags, whoCell)]);
  const card = el("button.card", { "data-open-details": true, onClick: () => onOpen?.(work) }, [media, foot]);
  wireNameScroll(card, foot.querySelector(".fname"));
  return card;
}

// a folder card (grid). B26: it no longer opens on a single click — the explorer wires
// single-click = select, DOUBLE-click = open (consistent with files, Finder/Drive). Kept a
// button for keyboard focus; Enter-to-open is wired by the caller.
export function folderCard(folder, { onShare } = {}) {
  // same tile band as file cards, so the grid is uniform: folder glyph plane + a --surface band with
  // the name. The file-count "who" was dropped (owner 2026-08-31: it unbalanced the thumbnail) — the
  // count still lives in list view + the Properties popover. Tag chips are injected into .frow by
  // decorateFolderTags (explorer) after this builds, so the frow starts empty.
  const media = el(".media.fold", {}, [iconEl("folder")]);
  // owner 2026-08-31: "folders have no selection menu" — a hover ⋯ button gives touch/no-right-click
  // users the SAME menu (rename/move/copy-link/properties/delete) the right-click opens, matching the
  // file card's .cardacts "more" button one-to-one.
  if (onShare) {
    const bar = el(".cardacts", {}, [
      el("button", { title: "More", "data-act": "more", onClick: (e) => { e.stopPropagation(); onShare(folder, e.currentTarget); } }, [iconEl("more")]),
    ]);
    media.append(bar);
  }
  const foot = el(".cardfoot", {}, [bandName(folder.name), el(".frow", {})]);
  const card = el("button.card.foldercard", {}, [media, foot]);
  wireNameScroll(card, foot.querySelector(".fname"));
  return card;
}
