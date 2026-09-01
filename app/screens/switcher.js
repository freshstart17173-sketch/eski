// screens/switcher.js — the quick-switcher (⌘K / Ctrl-K), a global jump palette. Opens over
// any screen: type to filter across standard destinations, your servers, and your friends;
// ↑/↓ move, Enter opens, Esc closes. One instance at a time.

import { el, closeMenus } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { loadSwitcher, isDemo } from "../data.js";

let open = null;
function withDemo(path) { return isDemo() ? path + (path.includes("?") ? "&" : "?") + "demo=1" : path; }

export function closeSwitcher() {
  if (!open) return;
  open.remove(); document.removeEventListener("keydown", open._onKey, true); open = null;
}

export async function openSwitcher() {
  if (open) { closeSwitcher(); return; }
  closeMenus();
  const data = await loadSwitcher().catch(() => ({ servers: [], friends: [] }));
  const entries = [
    { icon: "mail", label: "Messages", href: "/messages" },
    { icon: "folder", label: "My files", href: "/files" },
    { icon: "bell", label: "Notifications", href: "/notifications" },
    ...data.servers.map((s) => ({ initials: s.initials, label: s.name, sub: "Server", href: `/s/${s.id}` })),
    ...data.friends.map((f) => ({ initials: f.initials, label: f.name, sub: "@" + f.handle, href: `/u/${f.handle}` })),
  ];

  const input = el("input", { placeholder: "Jump to a server, person, or page…", "aria-label": "Quick switch" });
  const list = el(".qslist");
  let filtered = entries, active = 0;

  const paint = () => {
    active = Math.max(0, Math.min(active, filtered.length - 1));
    list.replaceChildren(...(filtered.length ? filtered.map((e, i) => rowFor(e, i)) : [el(".qsnone", {}, ["No matches"])]));
  };
  function rowFor(e, i) {
    const lead = e.icon ? el(".qsic", {}, [iconEl(e.icon, "sm")]) : el(".qsav", {}, [e.initials || "?"]);
    return el(".qsrow" + (i === active ? ".on" : ""), { onMouseEnter: () => { active = i; markActive(); }, onClick: () => choose(e) }, [
      lead, el(".qsbd", {}, [el("span.qslabel", {}, [e.label]), e.sub ? el("span.qssub", {}, [e.sub]) : null]),
    ]);
  }
  function markActive() { [...list.children].forEach((c, i) => c.classList?.toggle("on", i === active)); }
  function choose(e) { closeSwitcher(); navigate(withDemo(e.href)); }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    filtered = q ? entries.filter((e) => (e.label + " " + (e.sub || "")).toLowerCase().includes(q)) : entries;
    active = 0; paint();
  });

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeSwitcher(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); markActive(); scrollActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); markActive(); scrollActive(); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
  };
  function scrollActive() { list.children[active]?.scrollIntoView?.({ block: "nearest" }); }

  const box = el(".qsbox", {}, [el(".qshd", {}, [iconEl("search", "sm"), input]), list]);
  const sheet = el(".qs", { onClick: (ev) => { if (ev.target === sheet) closeSwitcher(); } }, [box]);
  sheet._onKey = onKey;
  document.addEventListener("keydown", onKey, true);
  document.body.append(sheet);
  open = sheet;
  paint();
  input.focus();
}
