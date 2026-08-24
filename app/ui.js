// ui.js — the P3 design-system primitives as render helpers. Each is a small
// function returning a real DOM element (interactive ones wire their own
// behaviour); NOT a React component. Screens (P4+) import from here and never
// re-mint a primitive. Styling lives in styles/primitives.css — this file owns
// behaviour and markup only. Icons come from the mounted sprite via icon().

import { icon, iconEl } from "./icons.js";

// tiny element helper: el("button.btn.primary", {onClick}, ["Save"])
export function el(sel, attrs = {}, kids = []) {
  const [tag, ...cls] = sel.split(".");
  const node = document.createElement(tag || "div");
  if (cls.length) node.className = cls.join(" ");
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "onClick") node.addEventListener("click", v);
    else if (k === "onInput") node.addEventListener("input", v);
    else if (k === "onChange") node.addEventListener("change", v);
    else if (k === "html") node.innerHTML = v;
    else if (k in node && k !== "list") { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// ── P3.1 Button ────────────────────────────────────────────────────────────
export function Button({ label, variant = "", size, icon: ic, onClick, disabled, loading, type = "button" } = {}) {
  const cls = ["btn", ...variant.split(" ").filter(Boolean), size === "sm" && "sm", loading && "loading"].filter(Boolean);
  const b = el("button." + cls.join("."), { type, onClick, "aria-busy": loading ? "true" : null });
  if (disabled) b.disabled = true;
  if (ic) b.append(iconEl(ic));           // icon leads the label
  if (label) b.append(document.createTextNode(label));
  return b;
}

// ── P3.2 IconButton + CloseButton ───────────────────────────────────────────
export function IconButton({ icon: ic, title, onClick, disabled } = {}) {
  const b = el("button.iconbtn", { onClick, title, "aria-label": title });
  if (disabled) b.disabled = true;
  b.append(iconEl(ic));
  return b;
}
export function CloseButton(opts = {}) {
  return IconButton({ icon: "x", title: opts.title || "Close", onClick: opts.onClick });
}

// ── P3.3 Field ──────────────────────────────────────────────────────────────
export function Field({ icon: ic, at, placeholder, value = "", onChange, onInput, type = "text", error, disabled, required } = {}) {
  const cls = ["field", error && "err", required && "req"].filter(Boolean).join(".");
  const wrap = el("." + cls, { "aria-disabled": disabled ? "true" : null });
  if (ic) wrap.append(iconEl(ic));
  if (at) wrap.append(el("span.at", {}, ["@"]));
  const input = el("input", { type, placeholder, value, onInput, onChange });
  if (disabled) input.disabled = true;
  wrap.append(input);
  wrap.input = input;
  return wrap;
}

// ── P3.4 Modal ───────────────────────────────────────────────────────────────
// openModal({title, body, footer, size, onClose}) → { el, close }. Scrim darkens
// the page, card has no shadow, focus is trapped, Esc + scrim-click both close.
export function openModal({ title, body, footer, size, onClose } = {}) {
  const closeBtn = CloseButton();
  const card = el("." + ["modal", size === "wide" && "wide"].filter(Boolean).join("."), { role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" });
  const head = el(".uhd", {}, [el("b", {}, [title || ""]), closeBtn]);
  card.append(head);
  if (body != null) card.append(el(".mbody", {}, [body.nodeType ? body : el("p", {}, [String(body)])]));
  if (footer) card.append(el(".mfoot", {}, [].concat(footer)));
  const scrim = el(".scrim", {}, [card]);

  const prevFocus = document.activeElement;
  function focusables() {
    return [...card.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {                       // trap
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onScrim(e) { if (e.target === scrim) close(); }
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onKey, true);
    scrim.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    onClose && onClose();
  }
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("mousedown", onScrim);
  document.addEventListener("keydown", onKey, true);
  document.body.append(scrim);
  (focusables()[0] || card).focus?.();
  return { el: scrim, close };
}

// ── P3.5 Menu + MenuItem ─────────────────────────────────────────────────────
// openMenu(anchor, items) — items: {label, icon?, danger?, onClick} | {sep:true}
// | {header:"..."}. Positions to the anchor, closes on outside-click/Esc, and is
// arrow-key navigable. Never overflows the viewport.
export function openMenu(anchor, items = []) {
  closeMenus();
  const menu = el(".menu.open", { role: "menu" });
  const rows = [];
  for (const it of items) {
    if (it.sep) { menu.append(el(".sep")); continue; }
    if (it.header) { menu.append(el(".mlabel", {}, [it.header])); continue; }
    const b = el("button" + (it.danger ? ".danger" : ""), { role: "menuitem", tabindex: "-1", onClick: () => { closeMenus(); it.onClick && it.onClick(); } });
    if (it.icon) b.append(iconEl(it.icon));
    b.append(el("span", {}, [it.label]));
    rows.push(b); menu.append(b);
  }
  document.body.append(menu);
  // position under the anchor, clamped to the viewport
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  menu.style.left = Math.max(8, left) + "px";
  menu.style.top = top + "px";
  anchor.setAttribute("aria-expanded", "true");

  let idx = -1;
  function move(d) { idx = (idx + d + rows.length) % rows.length; rows[idx]?.focus(); }
  function onKey(e) {
    // Escape closes ONLY the menu — stop it bubbling to a parent surface's own Escape
    // handler (e.g. the details-pane sheet), which would otherwise close both at once.
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenus(); anchor.focus?.(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  }
  menu.addEventListener("keydown", onKey);
  menu._cleanup = () => { anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", onDoc, true); };
  function onDoc(e) { if (!menu.contains(e.target) && e.target !== anchor) closeMenus(); }
  setTimeout(() => document.addEventListener("mousedown", onDoc, true));
  rows[0]?.focus();
  return menu;
}
export function closeMenus() {
  document.querySelectorAll(".menu.open").forEach((m) => { m._cleanup?.(); m.remove(); });
}

// ── P3.6 Avatar + PresenceDot ─────────────────────────────────────────────────
export function Avatar({ name = "", src, size = "md", colorIdx } = {}) {
  const a = el("." + ["av", size].filter(Boolean).join("."));
  const initials = () => {
    a.textContent = name.trim().slice(0, 2).toUpperCase() || "?";
    if (colorIdx != null) a.style.color = `var(--m${colorIdx})`;   // hue: server surfaces only
  };
  if (src) {
    const img = el("img", { src, alt: name });
    // a stored photo that 404s (key set but object gone) falls back to initials, never a
    // broken image — the same graceful degrade the media cards use for missing bytes.
    img.addEventListener("error", () => { a.replaceChildren(); initials(); }, { once: true });
    a.append(img);
  } else initials();
  return a;
}
export function PresenceDot({ state = "online", ring } = {}) {
  const map = { online: "", idle: "idle", dnd: "dnd", offline: "off" };
  const d = el("." + ["pres", map[state]].filter(Boolean).join("."), { "aria-label": state });
  if (ring) d.style.setProperty("--ring", ring);
  return d;
}

// ── P3.7 Tag + Chip ───────────────────────────────────────────────────────────
export function Tag({ label, removable, onRemove } = {}) {
  const t = el("span." + ["tag", removable && "rm"].filter(Boolean).join("."), {}, [label]);
  if (removable) {
    const x = el("span.x", { role: "button", "aria-label": "Remove", onClick: onRemove }, [iconEl("x")]);
    x.classList.add("iconbtn"); x.style.width = x.style.height = "16px";
    t.append(x);
  }
  return t;
}
export function Chip({ name, colorIdx, removable, onRemove } = {}) {
  const c = el("span.uchip", {}, [name]);
  if (colorIdx != null) c.style.color = `var(--m${colorIdx})`;   // member hue, server-scoped
  if (removable) { const x = IconButton({ icon: "x", title: "Remove", onClick: onRemove }); x.style.width = x.style.height = "16px"; c.append(x); }
  return c;
}

// ── P3.8 Toggle ────────────────────────────────────────────────────────────────
export function Toggle({ on = false, onChange, disabled } = {}) {
  const t = el(".tgl" + (on ? ".on" : ""), { role: "switch", tabindex: disabled ? "-1" : "0", "aria-checked": String(on), "aria-disabled": disabled ? "true" : null });
  function set(v) { t.classList.toggle("on", v); t.setAttribute("aria-checked", String(v)); onChange && onChange(v); }
  if (!disabled) {
    t.addEventListener("click", () => set(!t.classList.contains("on")));
    t.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); set(!t.classList.contains("on")); } });
  }
  t.set = set;
  return t;
}

// ── P3.9 Checkbox ──────────────────────────────────────────────────────────────
export function Checkbox({ checked = false, onChange, disabled } = {}) {
  const c = el(".cbx" + (checked ? ".on" : ""), { role: "checkbox", tabindex: disabled ? "-1" : "0", "aria-checked": String(checked), "aria-disabled": disabled ? "true" : null }, [iconEl("check")]);
  function set(v) { c.classList.toggle("on", v); c.setAttribute("aria-checked", String(v)); onChange && onChange(v); }
  if (!disabled) {
    c.addEventListener("click", () => set(!c.classList.contains("on")));
    c.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); set(!c.classList.contains("on")); } });
  }
  c.set = set;
  return c;
}

// ── P3.10 UsageBar ─────────────────────────────────────────────────────────────
export function UsageBar({ pct = 0, tone } = {}) {
  const p = Math.max(0, Math.min(100, pct));
  const b = el("." + ["bar", tone === "warn" && "warn"].filter(Boolean).join("."), { role: "progressbar", "aria-valuenow": String(Math.round(p)), "aria-valuemin": "0", "aria-valuemax": "100" });
  const fill = el("i"); fill.style.width = p + "%"; b.append(fill);
  b.set = (v) => { fill.style.width = Math.max(0, Math.min(100, v)) + "%"; b.setAttribute("aria-valuenow", String(Math.round(v))); };
  return b;
}

// ── P3.11 Toast ──────────────────────────────────────────────────────────────
function toastStack() {
  let s = document.querySelector(".toaststack");
  if (!s) { s = el(".toaststack"); document.body.append(s); }
  return s;
}
export function toast({ message, action, duration = 3200, icon: ic = "check" } = {}) {
  const t = el(".toast");
  if (ic) t.append(iconEl(ic));
  t.append(el("span", {}, [message]));
  let timer;
  const close = () => { clearTimeout(timer); t.remove(); };
  if (action) t.append(el("span.tact", { role: "button", onClick: () => { close(); action.onClick && action.onClick(); } }, [action.label || "Undo"]));
  t.append(el("span.tclose", { role: "button", "aria-label": "Dismiss", onClick: close }, [iconEl("x")]));
  toastStack().append(t);
  if (duration) timer = setTimeout(close, duration);
  t.close = close;
  return t;
}

// ── P3.12 Tabs ────────────────────────────────────────────────────────────────
// items: [{id,label,count?}]. Active shows the inset underline; keyboard-navigable.
export function Tabs({ items = [], active, onChange } = {}) {
  const row = el(".tabrow", { role: "tablist", style: "display:inline-flex;gap:4px" });
  let cur = active ?? items[0]?.id;
  const tabs = items.map((it) => {
    const t = el("button." + ["nav", it.id === cur && "on"].filter(Boolean).join("."), {
      role: "tab", "aria-selected": String(it.id === cur), tabindex: it.id === cur ? "0" : "-1",
      onClick: () => select(it.id),
    }, [it.label]);
    if (it.count != null) t.append(el("span.n", {}, [String(it.count)]));
    return t;
  });
  function select(id) {
    cur = id;
    tabs.forEach((t, i) => { const on = items[i].id === id; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    onChange && onChange(id);
  }
  row.addEventListener("keydown", (e) => {
    const i = items.findIndex((it) => it.id === cur);
    if (e.key === "ArrowRight") { e.preventDefault(); const n = tabs[(i + 1) % tabs.length]; select(items[(i + 1) % items.length].id); n.focus(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); const n = tabs[(i - 1 + tabs.length) % tabs.length]; select(items[(i - 1 + items.length) % items.length].id); n.focus(); }
  });
  tabs.forEach((t) => row.append(t));
  row.select = select;
  return row;
}

// ── P3.13 SegmentedControl ──────────────────────────────────────────────────
// options: [{value,label,icon?}]. One active at a time. The visibility control
// passes Public(globe)/Server(server — NOT users)/Private(lock).
export function SegmentedControl({ options = [], value, onChange } = {}) {
  const seg = el(".seg", { role: "radiogroup" });
  let cur = value ?? options[0]?.value;
  const cells = options.map((o) => {
    const c = el(".o" + (o.value === cur ? ".on" : ""), { role: "radio", tabindex: "0", "aria-checked": String(o.value === cur), onClick: () => select(o.value) });
    if (o.icon) c.append(iconEl(o.icon));
    c.append(el("span", {}, [o.label]));
    return c;
  });
  function select(v) {
    cur = v;
    cells.forEach((c, i) => { const on = options[i].value === v; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); });
    onChange && onChange(v);
  }
  cells.forEach((c) => seg.append(c));
  seg.select = select; seg.value = () => cur;
  return seg;
}
export function VisibilitySeg({ value = "public", onChange } = {}) {
  return SegmentedControl({
    value, onChange,
    options: [{ value: "public", label: "Public", icon: "globe" }, { value: "server", label: "Server", icon: "server" }, { value: "private", label: "Private", icon: "lock" }],
  });
}

// ── P3.14 SelectPill / Dropdown ─────────────────────────────────────────────
// The pill shows the current value + chevron; opening shows a Menu; selection
// updates the label. Square (--r), not round.
export function SelectPill({ label, options = [], value, onChange, size } = {}) {
  let cur = value ?? options[0]?.value;
  const labelSpan = el("span", {}, [labelFor()]);
  const chev = iconEl("chev"); chev.classList.add("chev");
  const btn = el("button." + ["selbtn", size === "sm" && "sm"].filter(Boolean).join("."), { "aria-haspopup": "menu", "aria-expanded": "false" }, [labelSpan, chev]);
  function labelFor() { const o = options.find((o) => o.value === cur); return (label ? label + ": " : "") + (o ? o.label : ""); }
  btn.addEventListener("click", () => {
    if (btn.getAttribute("aria-expanded") === "true") { closeMenus(); return; }
    openMenu(btn, options.map((o) => ({ label: o.label, icon: o.icon, onClick: () => { cur = o.value; labelSpan.textContent = labelFor(); onChange && onChange(o.value); } })));
  });
  btn.value = () => cur;
  return btn;
}

// ── P3.15 MediaPlayer ─────────────────────────────────────────────────────────
// The one player. Every control drives the element. Options: {src, kind, poster}.
export function MediaPlayer({ src, kind = "audio", poster } = {}) {
  const media = kind === "video" ? el("video", { src, poster, playsinline: true }) : el("audio", { src });
  const bigIcon = iconEl("play");
  const big = el("button.dmbigplay", { "aria-label": "Play" }, [bigIcon]);
  const fill = el("i"), knob = el("span.knob");
  const track = el(".track", { role: "slider", tabindex: "0", "aria-label": "Seek" }, [fill, knob]);
  const cur = el("span.t.cur", {}, ["0:00"]), tot = el("span.t.tot", {}, ["0:00"]);
  const volIcon = iconEl("volume");
  const rew = el("button.tbtn", { "aria-label": "Back 10 seconds" }, [iconEl("rewind")]);
  const ff = el("button.tbtn", { "aria-label": "Forward 10 seconds" }, [iconEl("ff")]);
  const vol = el("button.tbtn", { "aria-label": "Mute" }, [volIcon]);
  const transport = el(".dmtransport", {}, [rew, cur, track, tot, ff, vol]);
  let fs;
  if (kind === "video") { fs = el("button.tbtn", { "aria-label": "Fullscreen" }, [iconEl("expand")]); transport.append(fs); }
  const wrap = el(".dmplayer", { "data-kind": kind, tabindex: "0" }, [el(".dmmedia", {}, [media, big]), transport]);

  const fmt = (t) => (!isFinite(t) || t < 0) ? "0:00" : Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  // icon swap that replaces the button's child so the glyph reflects state
  function setPlayIcon(paused) { big.replaceChildren(iconEl(paused ? "play" : "pause")); big.setAttribute("aria-label", paused ? "Play" : "Pause"); }
  function setVolIcon() { vol.replaceChildren(iconEl(media.muted ? "mute" : "volume")); vol.setAttribute("aria-label", media.muted ? "Unmute" : "Mute"); }

  const toggle = () => { media.paused ? media.play() : media.pause(); };
  const skip = (d) => { const dur = media.duration || 0; media.currentTime = Math.max(0, Math.min(dur || media.currentTime + d, media.currentTime + d)); };
  function seekToClientX(clientX) {
    const r = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    if (isFinite(media.duration)) media.currentTime = ratio * media.duration;
  }

  big.addEventListener("click", toggle);
  rew.addEventListener("click", () => skip(-10));
  ff.addEventListener("click", () => skip(10));
  vol.addEventListener("click", () => { media.muted = !media.muted; setVolIcon(); });
  fs && fs.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen?.(); });

  media.addEventListener("play", () => setPlayIcon(false));
  media.addEventListener("pause", () => setPlayIcon(true));
  media.addEventListener("loadedmetadata", () => { tot.textContent = fmt(media.duration); });
  media.addEventListener("timeupdate", () => {
    const d = media.duration || 0, ratio = d ? media.currentTime / d : 0;
    fill.style.width = (ratio * 100) + "%"; knob.style.left = (ratio * 100) + "%";
    cur.textContent = fmt(media.currentTime);
  });

  // click + drag the track to scrub
  let dragging = false;
  track.addEventListener("pointerdown", (e) => { dragging = true; track.setPointerCapture(e.pointerId); seekToClientX(e.clientX); });
  track.addEventListener("pointermove", (e) => { if (dragging) seekToClientX(e.clientX); });
  track.addEventListener("pointerup", (e) => { dragging = false; track.releasePointerCapture?.(e.pointerId); });

  // keys: space = play/pause, ←/→ = skip
  wrap.addEventListener("keydown", (e) => {
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); skip(-10); }
    else if (e.key === "ArrowRight") { e.preventDefault(); skip(10); }
  });

  setPlayIcon(true); setVolIcon();
  wrap.media = media;
  return wrap;
}
