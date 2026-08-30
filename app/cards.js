// cards.js — the ONE work-card renderer (P5.2), shared by the explorer, feed,
// channel Files tab, and profile shelves. A card is a square cell (even grid) or
// natural aspect (masonry); media renders by kind — image thumb, video frame +
// play overlay, audio/other/text as a type card (icon + ext). It leads with the
// file name; the uploader chip carries the server hue (server surfaces only).
//
// mediaUrl(): the DB stores the content-addressed object KEY parts (blob_sha +
// file_ext); the public URL is `${R2_PUBLIC_BASE_URL}/${sha0:2}/${sha}.${ext}`.
// Until a real upload exists the bytes 404 — image/video fall back to a type card.

import { el, toast } from "./ui.js";
import { iconEl } from "./icons.js";
import { R2_PUBLIC_BASE_URL } from "./env.js";

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

export function workCard(work, { onOpen, selectable = false, actions = [], showWho = true, hue = true, starred = false, onStar } = {}) {
  const media = mediaCell(work);
  // B16: no selection-checkbox square — a selected card is shown by the .card.sel media outline
  // (the white checkbox in dark mode read as a "weird white square"). Selection still works via
  // click / ⌘-click / shift / marquee; the outline is the cue.
  // starred: a persistent gold badge (CSS shows it via .card.starred) + a star hover
  // action that toggles it. onStar is the real writer; without it neither renders.
  if (onStar) media.prepend(el("span.cardstar", { title: "Starred" }, [iconEl("star")]));
  const acts = onStar
    ? [{ act: "star", icon: "star", title: starred ? "Unstar" : "Star", cls: starred ? "starred" : "", onClick: onStar }, ...actions]
    : actions;
  if (acts.length) {
    const bar = el(".cardacts", {}, acts.map((a) =>
      el("button" + (a.cls ? "." + a.cls : ""), { title: a.title, "data-act": a.act, onClick: (e) => { e.stopPropagation(); a.onClick?.(work); } }, [iconEl(a.icon)])));
    media.append(bar);
  }
  const card = el("button.card" + (starred ? ".starred" : ""), { "data-open-details": true, onClick: () => onOpen?.(work) }, [media, el(".title", { title: work.title || work.name || "" }, [baseName(work)])]);
  if (showWho && work.who) {
    const who = el(".who");
    if (hue) {
      const chip = el("span.uchip", {}, [el("span.dot"), work.who.name]);
      if (work.who.colorIdx != null) chip.style.setProperty("--pc", `var(--m${work.who.colorIdx})`);
      who.append(chip);
    } else {
      who.append(work.who.name);   // public context — plain author, no member hue
    }
    if (work.channelName) who.append(document.createTextNode(" · #" + work.channelName));
    card.append(who);
  }
  return card;
}

// a folder card (grid). B26: it no longer opens on a single click — the explorer wires
// single-click = select, DOUBLE-click = open (consistent with files, Finder/Drive). Kept a
// button for keyboard focus; Enter-to-open is wired by the caller.
export function folderCard(folder, { onShare } = {}) {
  const card = el("button.card.foldercard", {}, [
    el(".media.fold", {}, [iconEl("folder")]),
    el(".title", { title: folder.name }, [folder.name]),
    el(".who", {}, [`${folder.count ?? 0} file${folder.count === 1 ? "" : "s"}`]),
  ]);
  // K9: right-click a folder to share it (Drive-style). The handler opens a menu anchored on the
  // card; the caller (explorer) wires the actual create-folder-share + copy-link flow.
  if (onShare) card.addEventListener("contextmenu", (e) => { e.preventDefault(); onShare(folder, card); });
  return card;
}
