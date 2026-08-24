// shell.js — the persistent three-pane app frame (P4.1) and the server rail
// (P4.2). The frame is `.app > .rail + .stage`; the router swaps which screen
// lives in `.stage`. The rail is the same across every app screen (Feed, DMs,
// a server workspace, the explorer), so it is built here, once, not per screen.
//
// Beta is web-only (CANON §C.2): the frame fills the viewport and flexes down to
// ~1024px. No mobile collapse — that's a dormant post-beta gallery.

import { el, Avatar, openMenu, toast } from "./ui.js";
import { iconEl } from "./icons.js";
import { navigate } from "./router.js";
import { signOut } from "./supabase.js";
import { isDemo } from "./data.js";

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
    { label: "Create server", icon: "plus", onClick: () => navigate("/create") },
    { label: "Join by link", icon: "link", onClick: () => toast({ message: "Paste an invite link (P9)" }) },
    { label: "Add friend", icon: "user", onClick: () => toast({ message: "Add friend (P7)" }) },
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

// ── the frame ───────────────────────────────────────────────────────────────
export function appFrame(rail, screen) {
  return el(".app", {}, [rail, el(".stage", {}, [screen])]);
}
