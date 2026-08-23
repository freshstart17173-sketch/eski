// primitives.demo.js — the P3 critique + verification surface. Instantiates every
// primitive from /app/ui.js in its states, on both themes (toggle top-right). This
// is to P3 what gallery.html is to the screens: the measured target + the harness
// verify-primitives.mjs drives. Not shipped to the app; a docs/design artifact.

import * as UI from "/app/ui.js";
import { icon } from "/app/icons.js";

const demo = document.getElementById("demo");
function section(title, ...nodes) {
  const s = UI.el("section.pdemo");
  s.append(UI.el("h2", {}, [title]));
  const row = UI.el(".prow");
  nodes.flat().forEach((n) => row.append(n));
  s.append(row);
  demo.append(s);
}
const box = (label, node) => UI.el(".pcell", {}, [UI.el(".plabel", {}, [label]), node]);

// a short silent WAV as a blob: URL so the player has a real, seekable duration
function silentWav(seconds = 4, rate = 8000) {
  const n = seconds * rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); wr(8, "WAVE"); wr(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); wr(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

// ── P3.1 Button ──
section("Button",
  box("primary", UI.Button({ label: "Save changes", variant: "primary" })),
  box("default", UI.Button({ label: "Cancel changes" })),
  box("default sm", UI.Button({ label: "Small", size: "sm" })),
  box("danger", UI.Button({ label: "Delete", variant: "danger" })),
  box("ghost", UI.Button({ label: "Cancel", variant: "ghost" })),
  box("outline", UI.Button({ label: "Sign up", variant: "outline" })),
  box("icon+label", UI.Button({ label: "Upload", variant: "primary", icon: "download" })),
  box("disabled", UI.Button({ label: "Disabled", disabled: true })),
  box("loading", UI.Button({ label: "Loading", variant: "primary", loading: true })),
);

// ── P3.2 IconButton + CloseButton ──
section("IconButton + CloseButton",
  box("iconbtn", UI.IconButton({ icon: "settings", title: "Settings" })),
  box("iconbtn", UI.IconButton({ icon: "search", title: "Search" })),
  box("close", UI.CloseButton()),
  box("disabled", UI.IconButton({ icon: "trash", title: "Delete", disabled: true })),
);

// ── P3.3 Field ──
section("Field",
  box("default", UI.Field({ placeholder: "Channel name" })),
  box("leading icon", UI.Field({ icon: "search", placeholder: "Search" })),
  box("@ prefix", UI.Field({ at: true, placeholder: "handle" })),
  box("error", UI.Field({ placeholder: "taken", value: "rae", error: true })),
  box("disabled", UI.Field({ placeholder: "locked", disabled: true })),
);

// ── P3.4 Modal ──
const openBtn = UI.Button({ label: "Open modal", variant: "primary", onClick: () => {
  UI.openModal({ title: "Delete channel?", body: "This removes the channel and its messages. This can't be undone.",
    footer: [UI.Button({ label: "Cancel", variant: "ghost", onClick: () => m.close() }), UI.Button({ label: "Delete", variant: "danger", onClick: () => m.close() })] });
} });
openBtn.id = "open-modal";
let m; const openWide = UI.Button({ label: "Open wide", onClick: () => { m = UI.openModal({ title: "Invite people", size: "wide", body: UI.Field({ icon: "link", value: "eski.lol/join/ab12cd" }), footer: [UI.Button({ label: "Done", variant: "primary", onClick: () => m.close() })] }); } });
section("Modal", box("scrim + trap + Esc", openBtn), box("wide", openWide));

// ── P3.5 Menu ──
const menuBtn = UI.Button({ label: "Open menu", onClick: () => UI.openMenu(menuBtn, [
  { header: "Message" }, { label: "Reply", icon: "reply", onClick() {} }, { label: "Copy link", icon: "link", onClick() {} },
  { sep: true }, { label: "Delete", icon: "trash", danger: true, onClick() {} }]) });
menuBtn.id = "open-menu";
section("Menu + MenuItem", box("right-click / ⋯ / dropdown", menuBtn));

// ── P3.6 Avatar + PresenceDot ──
section("Avatar + PresenceDot",
  box("sm", UI.Avatar({ name: "Rae", size: "sm" })), box("md", UI.Avatar({ name: "Rae" })), box("lg", UI.Avatar({ name: "Rae", size: "lg" })),
  box("hue (server)", UI.Avatar({ name: "Mel", colorIdx: 7 })),
  box("online", UI.PresenceDot({ state: "online" })), box("idle", UI.PresenceDot({ state: "idle" })),
  box("dnd", UI.PresenceDot({ state: "dnd" })), box("offline", UI.PresenceDot({ state: "offline" })),
);

// ── P3.7 Tag + Chip ──
section("Tag + Chip",
  box("tag", UI.Tag({ label: "sketch" })), box("tag removable", UI.Tag({ label: "wip", removable: true, onRemove() {} })),
  box("uchip (hue)", UI.Chip({ name: "Mel", colorIdx: 12 })),
);

// ── P3.8 Toggle ──
const tgl = UI.Toggle({ on: false }); tgl.id = "tgl";
section("Toggle", box("off→on", tgl), box("on", UI.Toggle({ on: true })), box("disabled", UI.Toggle({ on: true, disabled: true })));

// ── P3.9 Checkbox ──
const cbx = UI.Checkbox({ checked: false }); cbx.id = "cbx";
section("Checkbox", box("unchecked", cbx), box("checked", UI.Checkbox({ checked: true })), box("disabled", UI.Checkbox({ checked: true, disabled: true })));

// ── P3.10 UsageBar ──
section("UsageBar",
  box("0%", UI.UsageBar({ pct: 0 })), box("50%", UI.UsageBar({ pct: 50 })),
  box("100%", UI.UsageBar({ pct: 100 })), box("over-cap", UI.UsageBar({ pct: 96, tone: "warn" })));

// ── P3.11 Toast ──
const toastBtn = UI.Button({ label: "Show toast", onClick: () => UI.toast({ message: "Link copied", action: { label: "Undo", onClick() {} } }) });
toastBtn.id = "toast-btn";
section("Toast", box("copied / saved / sent", toastBtn));

// ── P3.12 Tabs ──
const tabs = UI.Tabs({ items: [{ id: "files", label: "Files", count: 24 }, { id: "pins", label: "Pinned", count: 3 }, { id: "members", label: "Members" }], active: "files" });
tabs.id = "tabs";
section("Tabs", box("underline-active + count", tabs));

// ── P3.13 SegmentedControl ──
const seg = UI.VisibilitySeg({ value: "server" }); seg.id = "seg"; seg.style.minWidth = "320px";
section("SegmentedControl (visibility)", box("Public / Server / Private", seg));

// ── P3.14 SelectPill / Dropdown ──
const sel = UI.SelectPill({ label: "Sort", options: [{ value: "recent", label: "Recent" }, { value: "name", label: "Name" }, { value: "size", label: "Size" }], value: "recent" });
sel.id = "sel";
section("SelectPill / Dropdown", box("pill + chevron → menu", sel));

// ── P3.15 MediaPlayer ──
const mp = UI.MediaPlayer({ src: silentWav(40), kind: "audio" }); mp.id = "mp"; mp.style.width = "460px";
section("MediaPlayer (audio)", box("full transport — every control drives the element", mp));
