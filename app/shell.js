// shell.js — the persistent three-pane app frame (P4.1) and the server rail
// (P4.2). The frame is `.app > .rail + .stage`; the router swaps which screen
// lives in `.stage`. The rail is the same across every app screen (Feed, DMs,
// a server workspace, the explorer), so it is built here, once, not per screen.
//
// Beta is web-only (CANON §C.2): the frame fills the viewport and flexes down to
// ~1024px. No mobile collapse — that's a dormant post-beta gallery.

import { el, Avatar, openMenu, toast, openModal, Button, SegmentedControl, SelectPill } from "./ui.js";
import { iconEl } from "./icons.js";
import { navigate, reload } from "./router.js";
import { isDemo, createServer, joinServer, updateServer, setStatus } from "./data.js";
import { avatarUrl } from "./cards.js";
import { uploadBlobs } from "./upload-r2.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

// ── server rail (P4.2) ──────────────────────────────────────────────────────
export function renderRail(data, route) {
  const rail = el("aside.rail");

  // Feed / Messages / My-files
  rail.append(railBtn({ logo: true, title: "Feed", on: route.screen === "feed", onClick: () => navigate(withDemo("/")) }));
  rail.append(railBtn({ icon: "mail", title: "Messages", on: route.screen === "dms", count: data.dmUnread, onClick: () => navigate(withDemo("/messages")) }));
  const onMyFiles = route.screen === "explorer" && !route.params?.serverId;
  rail.append(railBtn({ icon: "folder", title: "My files (your personal Drive)", on: onMyFiles, onClick: () => navigate(withDemo("/files")) }));
  rail.append(el(".railsep"));

  // one badge per server the member is in
  const activeServer = route.params?.serverId || (route.screen === "workspace" && data.server?.id) || (isDemo() ? data.server?.id : null);
  for (const s of data.servers) {
    const on = s.id === activeServer || (!activeServer && s.active);
    rail.append(railBtn({ label: s.initials, img: avatarUrl(s.icon_key), title: s.name, on, count: s.mentions, dot: s.unread && !s.mentions, onClick: () => navigate(withDemo(`/s/${s.id}`)) }));
  }
  rail.append(el(".railsep"));

  // ＋ create/join, and the own-avatar menu
  rail.append(railBtn({ icon: "plus", title: "Create or join a server", on: route.screen === "create", onClick: (e) => openMenu(e.currentTarget, [
    { label: "Create server", icon: "plus", onClick: () => openCreateServer() },
    { label: "Join by link", icon: "link", onClick: () => openJoinServer() },
    { label: "Add friend", icon: "user", onClick: () => navigate(withDemo("/messages")) },
  ]) }));

  // Your own avatar on the rail: render the uploaded photo when there is one, falling back
  // to initials on a missing/renamed object — same graceful degrade as the server badges.
  // (Was initials-only, so a set profile photo never showed on the main shell — owner bug.)
  const pfp = el("span.pfp", {}, [data.me.initials]);
  const meImg = avatarUrl(data.me.avatar_key);
  if (meImg) {
    const im = el("img.pfpimg", { src: meImg, alt: data.me.name || "" });
    im.addEventListener("error", () => pfp.replaceChildren(document.createTextNode(data.me.initials)), { once: true });
    pfp.replaceChildren(im);
  }
  // B11: the pfp goes STRAIGHT to your profile — no dropdown. Status now lives on the profile
  // page (P15); Settings is the profile's Settings tab; Sign out is in User settings → Account.
  const meBtn = el("button.railbtn.user" + (route.screen === "profile" ? ".on" : ""), { title: `${data.me.name}, your profile`, onClick: () => navigate(withDemo(`/u/${data.me.handle}`)) }, [pfp]);
  rail.append(meBtn);
  return rail;
}

function railBtn({ icon, label, img, title, on, count, dot, onClick, logo }) {
  const b = el("button.railbtn" + (on ? ".on" : "") + (logo ? ".home" : ""), { title, onClick });
  if (logo) b.append(el("span.railogo", { "aria-label": "eski" }));   // the e! mark, painted in currentColor via mask
  else if (icon) b.append(iconEl(icon));
  else if (img) {
    // a server with an uploaded icon shows it (square, per the radius rule); a load error
    // (missing/renamed object) falls back to the initials so the badge is never blank.
    const im = el("img.railimg", { src: img, alt: title || "" });
    im.addEventListener("error", () => b.replaceChildren(document.createTextNode(label)), { once: true });
    b.append(im);
  } else b.append(document.createTextNode(label));
  if (count) b.append(el("span.ct", {}, [String(count)]));
  else if (dot) b.append(el("span.rdot"));
  return b;
}

// A coverpick (gallery) that holds the picked File and previews it locally — the server doesn't
// exist yet at create time, so the bytes upload only after createServer returns an id. `square`
// makes the icon variant (.cv.icon). Returns { node, file() }.
function coverPicker({ square, label } = {}) {
  let file = null;
  const prev = el(".cv" + (square ? ".icon" : ""), {}, [iconEl("image")]);
  const input = el("input", { type: "file", accept: "image/*", style: "display:none" });
  input.addEventListener("change", () => {
    file = input.files?.[0] || null; input.value = "";
    if (file) prev.replaceChildren(el("img", { src: URL.createObjectURL(file), alt: "" }));
  });
  const node = el(".coverpick", {}, [prev, input, Button({ label: "Upload", size: "sm", icon: "image", onClick: () => input.click() })]);
  return { node, file: () => file };
}

// Create server (P9) — name + optional icon/cover + comma-separated starter channels →
// createServer (client-side, RLS-fenced) → attach the art (uploadBlobs → updateServer) → land in
// the new server. Demo just previews + toasts (its server set is fixed).
export function openCreateServer() {
  const nameI = el("input", { placeholder: "e.g. Late Bloom LP", "aria-label": "Server name" });
  const chansI = el("input", { value: "general, wips, references", "aria-label": "Starter channels" });
  const iconPick = coverPicker({ square: true });
  const coverPick = coverPicker({});
  const create = Button({ label: "Create server", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const optional = () => el("span", { style: "font-weight:400;color:var(--muted)" }, ["optional"]);
  const body = el("div", {}, [
    el("label.ulab", {}, ["Server name"]), el(".field", {}, [nameI]),
    el(".frow", { style: "margin-top:12px" }, [el("label.ulab", {}, ["Server icon ", optional()]), iconPick.node]),
    el(".frow", { style: "margin-top:12px" }, [el("label.ulab", {}, ["Cover ", optional()]), coverPick.node]),
    el("label.ulab", { style: "margin-top:12px;display:block" }, ["Starter channels ", el("span", { style: "font-weight:400;color:var(--muted)" }, ["comma-separated"])]), el(".field", {}, [chansI]),
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
      // attach the art after the row exists (live only — the picks are local File objects).
      if (!isDemo()) {
        const patch = {};
        if (iconPick.file()) { const [{ key }] = await uploadBlobs([iconPick.file()]); patch.icon_key = key; }
        if (coverPick.file()) { const [{ key }] = await uploadBlobs([coverPick.file()]); patch.cover_key = key; }
        if (Object.keys(patch).length) await updateServer(srv.id, patch).catch(() => {});
      }
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

// Set status (§C, gallery status composer) — a global custom status (emoji + text + optional
// auto-clear) and the manual presence choice. Writes profiles via setStatus, then reloads the
// shell so the rail/members reflect it. `data.me` carries the current status when known.
export function openStatus(data) {
  const cur = data.me || {};
  const emojiI = el("input", { value: cur.status_emoji || "", maxlength: "2", placeholder: "🎧", "aria-label": "Status emoji", style: "width:44px;text-align:center" });
  const textI = el("input", { value: cur.status_text || "", placeholder: "What are you working on?", "aria-label": "Status", maxlength: "80" });
  const presenceSeg = SegmentedControl({
    value: cur.presence_state || "online",
    // Short labels so the 4-way control fits one line (long "Do not disturb" wrapped/overflowed).
    options: [
      { value: "online", label: "Online" },
      { value: "idle", label: "Idle" },
      { value: "dnd", label: "DND" },
      { value: "invisible", label: "Invisible" },
    ],
  });
  const clearSel = SelectPill({
    label: "Clear", value: "never",
    options: [
      { value: "never", label: "Don’t clear" },
      { value: "30", label: "in 30 min" },
      { value: "60", label: "in 1 hour" },
      { value: "240", label: "in 4 hours" },
      { value: "today", label: "Today" },
    ],
  });
  const clearAtFor = (v) => {
    if (v === "never") return null;
    if (v === "today") { const d = new Date(); d.setHours(23, 59, 59, 0); return d.toISOString(); }
    return new Date(Date.now() + Number(v) * 60000).toISOString();
  };
  const body = el("div", {}, [
    el("label.ulab", {}, ["Your status"]),
    el(".statusrow", { style: "display:flex;gap:8px;align-items:center" }, [el(".field", { style: "flex:none;width:52px" }, [emojiI]), el(".field", { style: "flex:1;min-width:0;width:auto" }, [textI])]),
    el("label.ulab", { style: "margin-top:12px;display:block" }, ["Presence"]),
    presenceSeg,
    el(".statusrow", { style: "display:flex;align-items:center;justify-content:space-between;margin-top:12px" }, [el("label.ulab", { style: "margin:0" }, ["Clear status after"]), clearSel]),
  ]);
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const clear = Button({ label: "Clear status", variant: "ghost" });
  const save = Button({ label: "Save", variant: "primary" });
  const { close } = openModal({ title: "Set a status", body, footer: [clear, cancel, save], size: "wide" });
  cancel.addEventListener("click", () => close());
  clear.addEventListener("click", async () => {
    try { if (!isDemo()) await setStatus({ emoji: null, text: "", presence: presenceSeg.value(), clearAt: null }); close(); toast({ message: "Status cleared" }); if (!isDemo()) reload(); }
    catch (e) { toast({ message: e?.message || "Couldn’t clear your status" }); }
  });
  save.addEventListener("click", async () => {
    if (save.disabled) return; save.disabled = true;
    try {
      if (!isDemo()) await setStatus({ emoji: emojiI.value, text: textI.value, presence: presenceSeg.value(), clearAt: clearAtFor(clearSel.value()) });
      close(); toast({ message: "Status set", icon: "check" });
      if (!isDemo()) reload();
    } catch (e) { toast({ message: e?.message || "Couldn’t set your status" }); save.disabled = false; }
  });
  textI.focus();
}

// ── the frame ───────────────────────────────────────────────────────────────
export function appFrame(rail, screen) {
  return el(".app", {}, [rail, el(".stage", {}, [screen])]);
}
