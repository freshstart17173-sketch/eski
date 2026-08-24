// cards.js — the ONE work-card renderer (P5.2), shared by the explorer, feed,
// channel Files tab, and profile shelves. A card is a square cell (even grid) or
// natural aspect (masonry); media renders by kind — image thumb, video frame +
// play overlay, audio/other/text as a type card (icon + ext). It leads with the
// file name; the uploader chip carries the server hue (server surfaces only).
//
// mediaUrl(): the DB stores the content-addressed object KEY parts (blob_sha +
// file_ext); the public URL is `${R2_PUBLIC_BASE_URL}/${sha0:2}/${sha}.${ext}`.
// Until a real upload exists the bytes 404 — image/video fall back to a type card.

import { el } from "./ui.js";
import { iconEl } from "./icons.js";
import { R2_PUBLIC_BASE_URL } from "./env.js";

export const KIND_ICON = { audio: "music", image: "image", video: "video", text: "type", other: "file" };

export function mediaUrl(work) {
  if (!work?.blob_sha || !work?.file_ext) return null;
  const s = work.blob_sha;
  return `${R2_PUBLIC_BASE_URL}/${s.slice(0, 2)}/${s}.${work.file_ext}`;
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
export function workCard(work, { onOpen, selectable = false, actions = [], showWho = true, hue = true, starred = false, onStar } = {}) {
  const media = mediaCell(work);
  if (selectable) media.prepend(el("span.cardsel", {}, [iconEl("check")]));
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
  const card = el("button.card" + (starred ? ".starred" : ""), { "data-open-details": true, onClick: () => onOpen?.(work) }, [media, el(".title", {}, [work.title || work.name || "untitled"])]);
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

// a folder card (grid): a folder tile that descends on click
export function folderCard(folder, { onOpen } = {}) {
  return el("button.card.foldercard", { onClick: () => onOpen?.(folder) }, [
    el(".media.fold", {}, [iconEl("folder")]),
    el(".title", {}, [folder.name]),
    el(".who", {}, [`${folder.count ?? 0} file${folder.count === 1 ? "" : "s"}`]),
  ]);
}
