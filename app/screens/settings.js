// screens/settings.js — the SERVER settings screen (P10, /s/:id/settings). Replaces the old
// stack of server-menu modals with ONE full-screen surface: a left setnav + panels (Overview,
// Roles & permissions, Invites, Join requests, Notifications, Audit log, and — for the owner —
// a Danger zone). Shares the .usersettings layout CSS (broadened to .serversettings). Each panel
// reads + writes through the same data functions the modals used, so nothing behavioural changes
// — only where it lives. Admin-gated by the caller (main.js loads the workspace bundle, which
// carries isAdmin/isOwner); a non-admin sees a read-only-ish subset (no Save/Delete).

import { el, toast, Avatar, Button, openModal, busyOverlay, withBusy, loadingLabel, cropImage } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate, reload } from "../router.js";
import { isDemo, updateServer, loadServerPrefs, setServerPrefs, loadAuditLog, loadJoinRequests, approveJoinRequest, declineJoinRequest, deleteServer, leaveServer, createInvite, loadInvites, revokeInvite } from "../data.js";
import { avatarUrl } from "../cards.js";
import { uploadBlobs } from "../upload-r2.js";
import { openRolesEditor } from "./roles.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

export function renderServerSettings(data) {
  const screen = el("section.screen.serversettings", { "data-screen": "settings" });
  const server = data.server;
  if (!server) { screen.append(el(".setpanel", {}, [head("Server settings", "No server."), ])); return screen; }
  const isOwner = !!data.isOwner, isAdmin = !!data.isAdmin || isOwner;

  const PANELS = [
    { key: "overview", label: "Overview", icon: "settings", fn: overviewPanel },
    { key: "roles", label: "Roles & permissions", icon: "users", fn: rolesPanel },
    { key: "invites", label: "Invites", icon: "link", fn: invitesPanel },
    { key: "requests", label: "Join requests", icon: "user", fn: requestsPanel },
    { key: "notifications", label: "Notifications", icon: "bell", fn: notificationsPanel },
    { key: "audit", label: "Audit log", icon: "flag", fn: auditPanel },
    { key: "danger", label: "Danger zone", icon: "trash", fn: dangerPanel },
  ].filter((p) => isAdmin || p.key === "notifications");   // a non-admin only gets their own notif prefs

  let active = PANELS[0].key;
  const nav = el(".setnav");
  nav.append(el("button.setback", { onClick: () => navigate(withDemo(`/s/${server.id}`)) }, [iconEl("arrow", "sm"), "Back to server"]));
  const navBtns = PANELS.map((p) => el("button.setrow" + (p.key === active ? ".on" : ""), { onClick: () => select(p.key) }, [iconEl(p.icon, "sm"), p.label]));
  navBtns.forEach((b) => nav.append(b));

  const panel = el(".setpanel");
  function select(key) {
    active = key;
    navBtns.forEach((b, i) => b.classList.toggle("on", PANELS[i].key === key));
    const def = PANELS.find((p) => p.key === key);
    panel.replaceChildren(def.fn(data, { isOwner, isAdmin }));
  }
  screen.append(el(".setwrap", {}, [nav, panel]));
  select(active);
  return screen;
}

function head(title, sub) { return el(".sethead", {}, [el("h1", {}, [title]), sub ? el("p", {}, [sub]) : null]); }

// ── Overview: name + icon + cover ────────────────────────────────────────────
function overviewPanel(data) {
  const s = data.server, demo = isDemo();
  const wrap = el("div", {}, [head("Overview", "Your server's name and artwork.")]);

  const iconPrev = el(".cv.icon", { style: "width:64px;height:64px;border-radius:var(--r);background:var(--paper1);display:grid;place-items:center;overflow:hidden;font-weight:600" },
    [avatarUrl(s.icon_key) ? el("img", { src: avatarUrl(s.icon_key), alt: "", style: "width:100%;height:100%;object-fit:cover" }) : document.createTextNode(s.initials)]);
  const coverPrev = el(".cv", { style: "height:96px;border-radius:var(--r);background:var(--paper1) center/cover no-repeat;display:grid;place-items:center;overflow:hidden" },
    [avatarUrl(s.cover_key) ? el("img", { src: avatarUrl(s.cover_key), alt: "", style: "width:100%;height:100%;object-fit:cover" }) : iconEl("image")]);
  const pick = (field, prev, round) => {
    const isIcon = field === "icon_key";
    const input = el("input", { type: "file", accept: "image/*", style: "position:fixed;left:-9999px;opacity:0" });
    input.addEventListener("change", async () => {
      const picked = input.files?.[0]; input.value = ""; if (!picked) return;
      // P36: crop/zoom before upload — icon is a square (--r) tile, cover is a wide 3:1 banner.
      const file = await cropImage(picked, isIcon ? { aspect: 1, title: "Adjust icon", apply: "Set icon" } : { aspect: 3, outW: 1200, title: "Adjust cover", apply: "Set cover" });
      if (!file) return;   // cancelled
      const stop = busyOverlay(prev);   // P3: spinner over the icon/cover preview during the round-trip
      try {
        let src;
        if (demo) src = URL.createObjectURL(file);
        else { const [{ key }] = await uploadBlobs([file]); await updateServer(s.id, { [field]: key }); s[field] = key; src = avatarUrl(key); }
        prev.replaceChildren(el("img", { src, alt: "", style: "width:100%;height:100%;object-fit:cover" }));
        toast({ message: field === "icon_key" ? "Server icon updated" : "Server cover updated", icon: "check" });
      } catch (e) { toast({ message: e?.message || "Couldn't upload the image" }); }
      finally { stop(); }
    });
    return input;
  };
  const iconInput = pick("icon_key", iconPrev), coverInput = pick("cover_key", coverPrev);

  const nameI = el("input", { value: s.name || "", "aria-label": "Server name" });
  const save = Button({ label: "Save name", variant: "primary" });
  save.addEventListener("click", () => withBusy(save, async () => {   // P3: button spinner while saving
    try {
      const patch = demo ? { name: nameI.value.trim() } : await updateServer(s.id, { name: nameI.value });
      Object.assign(s, patch, patch.name ? { initials: patch.name.trim().slice(0, 2).toUpperCase() } : {});
      toast({ message: "Saved", icon: "check" }); if (!demo) reload();
    } catch (e) { toast({ message: e?.message || "Couldn't save" }); }
  }));

  wrap.append(el(".setcard", {}, [
    el("label.ulab", {}, ["Server name"]), el(".field", {}, [nameI]),
    el(".setactions", {}, [save]),
  ]));
  wrap.append(el(".setcard", {}, [
    el("label.ulab", {}, ["Icon"]),
    el("div", { style: "display:flex;align-items:center;gap:12px" }, [iconPrev, iconInput, Button({ label: "Upload icon", size: "sm", icon: "image", onClick: () => iconInput.click() })]),
    el("label.ulab", { style: "margin-top:16px" }, ["Cover"]),
    coverPrev, coverInput, el(".setactions", {}, [Button({ label: "Upload cover", size: "sm", icon: "image", onClick: () => coverInput.click() })]),
  ]));
  return wrap;
}

// ── Roles: launch the roles editor modal ─────────────────────────────────────
function rolesPanel(data) {
  return el("div", {}, [
    head("Roles & permissions", "Create roles, set their colour, and toggle what each can do."),
    el(".setcard", {}, [
      el("p", { style: "color:var(--soft);font-size:var(--fs-sm);margin:0 0 12px" }, ["@everyone is the base role; add roles to grant extra permissions to members."]),
      Button({ label: "Open roles editor", variant: "primary", icon: "users", onClick: () => openRolesEditor(data.server.id) }),
    ]),
  ]);
}

// ── Invites: list · create · revoke ──────────────────────────────────────────
function invitesPanel(data) {
  const wrap = el("div", {}, [head("Invites", "Share a link so people can join.")]);
  const list = el(".setcard", {}, [el(".lb", { style: "color:var(--muted)" }, [loadingLabel("Loading")])]);
  wrap.append(list);
  const paint = (rows) => {
    list.replaceChildren();
    if (!rows.length) list.append(el(".sharenone", {}, ["No active invite links."]));
    for (const inv of rows) {
      const url = `${location.origin}/join/${inv.code}`;
      const meta = [inv.max_uses ? `${inv.uses || 0}/${inv.max_uses} uses` : `${inv.uses || 0} uses`, inv.expires_at ? "expires " + new Date(inv.expires_at).toLocaleDateString() : "no expiry"].join(" · ");
      const row = el(".sharerow2", { style: "margin-bottom:8px" }, [
        el("div", { style: "flex:1;min-width:0" }, [el(".field", {}, [iconEl("link", "sm"), el("input", { readonly: true, value: url })]), el("div", { style: "font-size:11px;color:var(--muted);margin-top:3px" }, [meta])]),
        Button({ label: "Revoke", size: "sm", variant: "ghost", onClick: async () => { try { if (!isDemo()) await revokeInvite(inv.code); paint(rows.filter((x) => x.code !== inv.code)); toast({ message: "Invite revoked" }); } catch (e) { toast({ message: e?.message || "Couldn't revoke" }); } } }),
      ]);
      list.append(row);
    }
    list.append(el(".setactions", {}, [Button({ label: "Create invite link", variant: "primary", icon: "plus", onClick: async () => {
      try { const code = isDemo() ? "demoinvite" + Date.now() : await createInvite(data.server.id, {}); paint([{ code, uses: 0, max_uses: null, expires_at: null, created_at: new Date().toISOString() }, ...rows]); }
      catch (e) { toast({ message: e?.message || "Couldn't create the invite" }); }
    } })]));
  };
  (isDemo() ? Promise.resolve([{ code: "demo1", uses: 3, max_uses: 25, expires_at: null }]) : loadInvites(data.server.id)).then(paint).catch(() => paint([]));
  return wrap;
}

// ── Join requests: approve / decline ─────────────────────────────────────────
function requestsPanel(data) {
  const wrap = el("div", {}, [head("Join requests", "People asking to join via a shared folder or link.")]);
  const list = el(".setcard", {}, [el(".lb", { style: "color:var(--muted)" }, [loadingLabel("Loading")])]);
  wrap.append(list);
  const paint = (rows) => {
    list.replaceChildren();
    if (!rows.length) { list.append(el(".sharenone", {}, ["No pending requests."])); return; }
    for (const r of rows) {
      const row = el("div", { style: "display:flex;align-items:center;gap:10px;padding:8px 0" }, [
        Avatar({ name: r.name, size: "sm", src: avatarUrl(r.avatar_key) }),
        el("div", { style: "flex:1;min-width:0" }, [el("div", { style: "font-weight:600" }, [r.name]), el("div", { style: "color:var(--muted);font-size:var(--fs-xs)" }, [r.message || `@${r.handle} · ${r.when}`])]),
      ]);
      const approve = Button({ label: "Approve", size: "sm", variant: "primary" });
      const decline = Button({ label: "Decline", size: "sm", variant: "ghost" });
      const act = (fn, msg) => async () => { approve.disabled = decline.disabled = true; try { if (!isDemo()) await fn(data.server.id, r.userId); row.remove(); toast({ message: msg }); if (!list.querySelector('[style*="padding:8px 0"]')) paint([]); } catch (e) { approve.disabled = decline.disabled = false; toast({ message: e?.message || "Couldn't" }); } };
      approve.addEventListener("click", act(approveJoinRequest, `${r.name} joined`));
      decline.addEventListener("click", act(declineJoinRequest, "Request declined"));
      row.append(el("div", { style: "display:flex;gap:6px" }, [decline, approve]));
      list.append(row);
    }
  };
  (isDemo() ? loadJoinRequests(data.server.id) : loadJoinRequests(data.server.id)).then(paint).catch(() => paint([]));
  return wrap;
}

// ── Notifications: level + suppress @everyone ────────────────────────────────
function notificationsPanel(data) {
  const wrap = el("div", {}, [head("Notifications", "How this server pings you.")]);
  const card = el(".setcard", {}, [el(".lb", { style: "color:var(--muted)" }, [loadingLabel("Loading")])]);
  wrap.append(card);
  const LEVELS = [["all", "All messages"], ["mentions", "Only @mentions"], ["none", "Nothing"]];
  loadServerPrefs(data.server.id).then((prefs) => {
    let level = prefs.level || "all", suppress = !!prefs.suppress_everyone;
    const rows = LEVELS.map(([k, lbl]) => {
      const b = el("button.setrow" + (k === level ? ".on" : ""), { onClick: () => { level = k; rows.forEach((r, i) => r.classList.toggle("on", LEVELS[i][0] === k)); } }, [iconEl("bell", "sm"), lbl]);
      return b;
    });
    const supToggle = el("label", { style: "display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;font-size:var(--fs-sm)" });
    const cb = el("input", { type: "checkbox" }); cb.checked = suppress; cb.addEventListener("change", () => suppress = cb.checked);
    supToggle.append(cb, document.createTextNode("Suppress @everyone / @here pings"));
    const save = Button({ label: "Save", variant: "primary" });
    save.addEventListener("click", async () => { try { if (!isDemo()) await setServerPrefs(data.server.id, { level, suppress_everyone: suppress }); toast({ message: "Saved", icon: "check" }); } catch (e) { toast({ message: e?.message || "Couldn't save" }); } });
    card.replaceChildren(el("label.ulab", {}, ["Notify me about"]), ...rows, supToggle, el(".setactions", {}, [save]));
  }).catch(() => card.replaceChildren(el(".lb", {}, ["Couldn't load your settings"])));
  return wrap;
}

// ── Audit log ────────────────────────────────────────────────────────────────
function auditPanel(data) {
  const wrap = el("div", {}, [head("Audit log", "Moderation actions on this server.")]);
  const list = el(".setcard", {}, [el(".lb", { style: "color:var(--muted)" }, [loadingLabel("Loading")])]);
  wrap.append(list);
  loadAuditLog(data.server.id).then((rows) => {
    list.replaceChildren();
    if (!rows.length) { list.append(el(".sharenone", {}, ["Nothing logged yet."])); return; }
    for (const r of rows) list.append(el(".setrow2", { style: "display:flex;gap:8px;padding:8px 0;box-shadow:inset 0 -1px 0 var(--line)" }, [
      iconEl("flag", "sm"),
      el("div", { style: "flex:1;min-width:0" }, [el("div", { style: "font-size:var(--fs-sm)" }, [el("b", {}, [r.actor]), ` ${r.action}`, r.reason ? ` — ${r.reason}` : ""]), el("div", { style: "color:var(--muted);font-size:11px" }, [r.time])]),
    ]));
  }).catch(() => list.replaceChildren(el(".lb", {}, ["Couldn't load the audit log"])));
  return wrap;
}

// ── Danger zone: delete (owner) / leave ──────────────────────────────────────
function dangerPanel(data, { isOwner }) {
  const s = data.server;
  const wrap = el("div", {}, [head("Danger zone", "Irreversible actions.")]);
  if (isOwner) {
    const nameI = el("input", { placeholder: `Type "${s.name}" to confirm` });
    const del = Button({ label: "Delete server", variant: "danger", disabled: true });
    nameI.addEventListener("input", () => del.disabled = nameI.value.trim() !== s.name);
    del.addEventListener("click", async () => {
      if (del.disabled) return; del.disabled = true;
      try { if (!isDemo()) await deleteServer(s.id); toast({ message: "Server deleted" }); navigate(withDemo("/")); }
      catch (e) { toast({ message: e?.message || "Couldn't delete" }); del.disabled = false; }
    });
    wrap.append(el(".setcard", { style: "border:1px solid var(--danger)" }, [
      el("p", { style: "color:var(--soft);font-size:var(--fs-sm);margin:0 0 10px" }, [`Deleting ${s.name} removes its channels, files, and messages for everyone. This can't be undone.`]),
      el(".field", {}, [nameI]), el(".setactions", {}, [del]),
    ]));
  } else {
    const leave = Button({ label: "Leave server", variant: "danger" });
    leave.addEventListener("click", async () => { try { if (!isDemo()) await leaveServer(s.id); toast({ message: "Left the server" }); navigate(withDemo("/")); } catch (e) { toast({ message: e?.message || "Couldn't leave" }); } });
    wrap.append(el(".setcard", {}, [el("p", { style: "color:var(--soft);font-size:var(--fs-sm);margin:0 0 10px" }, ["Leave this server. You'll need a fresh invite to rejoin."]), el(".setactions", {}, [leave])]));
  }
  return wrap;
}
