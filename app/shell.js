// shell.js — the persistent three-pane app frame (P4.1) and the server rail
// (P4.2). The frame is `.app > .rail + .stage`; the router swaps which screen
// lives in `.stage`. The rail is the same across every app screen (Feed, DMs,
// a server workspace, the explorer), so it is built here, once, not per screen.
//
// Beta is web-only (CANON §C.2): the frame fills the viewport and flexes down to
// ~1024px. No mobile collapse — that's a dormant post-beta gallery.

import { el, Avatar, openMenu, toast, openModal, Button } from "./ui.js";
import { iconEl } from "./icons.js";
import { navigate } from "./router.js";
import { signOut } from "./supabase.js";
import { isDemo, createServer, joinServer } from "./data.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

// ── server rail (P4.2) ──────────────────────────────────────────────────────
export function renderRail(data, route) {
  const rail = el("aside.rail");

  // Feed / Messages / My-files
  rail.append(railBtn({ icon: "home", title: "Feed", on: route.screen === "feed", onClick: () => navigate(withDemo("/")) }));
  rail.append(railBtn({ icon: "mail", title: "Messages", on: route.screen === "dms", count: data.dmUnread, onClick: () => navigate(withDemo("/messages")) }));
  const onMyFiles = route.screen === "explorer" && !route.params?.serverId;
  rail.append(railBtn({ icon: "folder", title: "My files (your personal Drive)", on: onMyFiles, onClick: () => navigate(withDemo("/files")) }));
  rail.append(el(".railsep"));

  // one badge per server the member is in
  const activeServer = route.params?.serverId || (route.screen === "workspace" && data.server?.id) || (isDemo() ? data.server?.id : null);
  for (const s of data.servers) {
    const on = s.id === activeServer || (!activeServer && s.active);
    rail.append(railBtn({ label: s.initials, title: s.name, on, count: s.mentions, dot: s.unread && !s.mentions, onClick: () => navigate(withDemo(`/s/${s.id}`)) }));
  }
  rail.append(el(".railsep"));

  // ＋ create/join, and the own-avatar menu
  rail.append(railBtn({ icon: "plus", title: "Create or join a server", on: route.screen === "create", onClick: (e) => openMenu(e.currentTarget, [
    { label: "Create server", icon: "plus", onClick: () => openCreateServer() },
    { label: "Join by link", icon: "link", onClick: () => openJoinServer() },
    { label: "Add friend", icon: "user", onClick: () => navigate(withDemo("/messages")) },
  ]) }));

  const meBtn = el("button.railbtn.user" + (route.screen === "profile" ? ".on" : ""), { title: `${data.me.name}, your profile` }, [el("span.pfp", {}, [data.me.initials])]);
  meBtn.addEventListener("click", (e) => openMenu(e.currentTarget, [
    { header: data.me.name },
    { label: "Profile", icon: "user", onClick: () => navigate(`/u/${data.me.handle}`) },
    { label: "Set status", icon: "smile", onClick: () => toast({ message: "Status (P7)" }) },
    { label: "Settings", icon: "settings", onClick: () => toast({ message: "User settings (P9)" }) },
    { sep: true },
    { label: "Sign out", icon: "leave", danger: true, onClick: async () => { await signOut(); navigate("/signin"); } },
  ]));
  rail.append(meBtn);
  return rail;
}

function railBtn({ icon, label, title, on, count, dot, onClick }) {
  const b = el("button.railbtn" + (on ? ".on" : ""), { title, onClick });
  if (icon) b.append(iconEl(icon)); else b.append(document.createTextNode(label));
  if (count) b.append(el("span.ct", {}, [String(count)]));
  else if (dot) b.append(el("span.rdot"));
  return b;
}

// Create server (P9) — name + comma-separated starter channels → createServer (client-side,
// RLS-fenced) → land in the new server. Demo just toasts (its server set is fixed).
function openCreateServer() {
  const nameI = el("input", { placeholder: "e.g. Late Bloom LP", "aria-label": "Server name" });
  const chansI = el("input", { value: "general, wips, references", "aria-label": "Starter channels" });
  const create = Button({ label: "Create server", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [
    el("label.ulab", {}, ["Server name"]), el(".field", {}, [nameI]),
    el("label.ulab", {}, ["Starter channels ", el("span", { style: "font-weight:400;color:var(--muted)" }, ["comma-separated"])]), el(".field", {}, [chansI]),
    el(".svnote", {}, [iconEl("check", "sm"), el("span", {}, ["A private studio — you invite people with a link, there's no public listing."])]),
  ]);
  const { close } = openModal({ title: "New server", body, footer: [cancel, create] });
  cancel.addEventListener("click", () => close());
  const submit = async () => {
    const name = nameI.value.trim();
    if (!name || create.disabled) return;
    create.disabled = true;
    try {
      const srv = await createServer(name, chansI.value.split(",").map((s) => s.trim()).filter(Boolean));
      close();
      if (isDemo()) toast({ message: `${srv.name} created`, icon: "check" });
      else navigate(`/s/${srv.id}`);
    } catch (e) { toast({ message: e?.message || "Couldn’t create the server" }); create.disabled = false; }
  };
  create.addEventListener("click", submit);
  nameI.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  nameI.focus();
}

// Join server (P9) — paste an invite link/code → join_via_invite → land in the server.
function openJoinServer() {
  const codeI = el("input", { placeholder: "join.eski.lol/late-bloom-77", "aria-label": "Invite link" });
  const join = Button({ label: "Join", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [el("label.ulab", {}, ["Invite link"]), el(".field", {}, [iconEl("link", "sm"), codeI])]);
  const { close } = openModal({ title: "Join a server", body, footer: [cancel, join] });
  cancel.addEventListener("click", () => close());
  const submit = async () => {
    const v = codeI.value.trim();
    if (!v || join.disabled) return;
    join.disabled = true;
    try {
      const srv = await joinServer(v);
      close();
      if (isDemo()) toast({ message: "Joined (demo)", icon: "check" });
      else navigate(`/s/${srv.id}`);
    } catch (e) { toast({ message: e?.message || "Couldn’t join the server" }); join.disabled = false; }
  };
  join.addEventListener("click", submit);
  codeI.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  codeI.focus();
}

// ── the frame ───────────────────────────────────────────────────────────────
export function appFrame(rail, screen) {
  return el(".app", {}, [rail, el(".stage", {}, [screen])]);
}
