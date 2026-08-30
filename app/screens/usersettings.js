// screens/usersettings.js — the User settings screen (CANON §C.10, gallery #22). Distinct from
// SERVER settings (/s/:id/settings): this is the person's own account surface. A left setnav +
// a panel on the right, "Back to profile" pinned at the top of the nav. Panels: Profile,
// Account, Appearance, Notifications, Privacy & safety, Storage. Each panel's writes go through
// their own data functions; this screen only reads + routes.

import { el, toast, Avatar, SegmentedControl, UsageBar, Button } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate, reload } from "../router.js";
import { signOut } from "../supabase.js";
import { isDemo, unblockUser, loadUserStorage, loadUserBlocked } from "../data.js";
import { avatarUrl } from "../cards.js";
import { openEditProfile } from "./profile.js";
import { setPerfEnabled, isPerfEnabled, copyPerfReport } from "../perf.js";

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }
const PRESENCE_LABEL = { online: "Online", idle: "Idle", dnd: "Do not disturb", invisible: "Invisible" };

const PANELS = [
  { key: "profile", label: "Profile", icon: "user" },
  { key: "account", label: "Account", icon: "settings" },
  { key: "appearance", label: "Appearance", icon: "image" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "privacy", label: "Privacy & safety", icon: "lock" },
  { key: "storage", label: "Storage", icon: "folder" },
];

export function renderUserSettings(data) {
  const screen = el("section.screen.usersettings", { "data-screen": "usersettings" });
  let active = "profile";

  const nav = el(".setnav");
  nav.append(el("button.setback", { onClick: () => navigate(withDemo(`/u/${data.me.handle}`)) }, [iconEl("arrow", "sm"), "Back to profile"]));
  const navBtns = PANELS.map((p) => {
    const b = el("button.setrow" + (p.key === active ? ".on" : ""), { onClick: () => select(p.key) }, [iconEl(p.icon, "sm"), p.label]);
    return b;
  });
  navBtns.forEach((b) => nav.append(b));

  const panel = el(".setpanel");
  function select(key) {
    active = key;
    navBtns.forEach((b, i) => b.classList.toggle("on", PANELS[i].key === key));
    panel.replaceChildren(PANEL_FNS[key](data));
  }

  screen.append(el(".setwrap", {}, [nav, panel]));
  select("profile");
  return screen;
}

// ── panels ───────────────────────────────────────────────────────────────────
function head(title, sub) {
  return el(".sethead", {}, [el("h1", {}, [title]), sub ? el("p", {}, [sub]) : null]);
}

function profilePanel(data) {
  const p = data.profile || {};
  const av = Avatar({ name: data.me.initials, size: "lg", src: avatarUrl(p.avatar_key) });
  const statusLine = (p.status_text || p.status_emoji)
    ? `${p.status_emoji || ""} ${p.status_text || ""}`.trim()
    : "No status set";
  return el("div", {}, [
    head("Profile", "How you appear across eski."),
    el(".setcard", { style: "display:flex;align-items:center;gap:14px" }, [
      av,
      el("div", { style: "flex:1" }, [
        el("div", { style: "font-weight:600;font-size:var(--fs-lg)" }, [p.name || data.me.name]),
        el("div", { style: "color:var(--muted);font-size:var(--fs-sm)" }, ["@" + (p.handle || data.me.handle)]),
        el("div", { style: "color:var(--soft);font-size:var(--fs-sm);margin-top:4px" }, [statusLine]),
      ]),
    ]),
    el(".setactions", { style: "display:flex;gap:8px" }, [
      Button({ label: "Edit profile", onClick: () => openEditProfile(data, { onSaved: () => reload() }) }),
      // P15: status now lives on the profile page (a text field + presence picker), not a modal.
      Button({ label: "Set a status", onClick: () => navigate(withDemo(`/u/${data.me.handle}`)) }),
    ]),
  ]);
}

function accountPanel(data) {
  return el("div", {}, [
    head("Account", "Your sign-in and account."),
    settingRow("Email", data.email || "—", el("span", { style: "color:var(--muted);font-size:var(--fs-xs)" }, ["Managed by your sign-in"])),
    settingRow("Presence", PRESENCE_LABEL[data.profile?.presence_state] || "Online"),
    el(".setcard", { style: "margin-top:12px" }, [
      Button({ label: "Sign out", variant: "danger", onClick: async () => { if (!isDemo()) await signOut(); navigate("/signin"); } }),
    ]),
  ]);
}

function appearancePanel() {
  const cur = (typeof window !== "undefined" && window.__eskiTheme) ? window.__eskiTheme.get() : "system";
  const seg = SegmentedControl({
    value: cur,
    options: [{ value: "system", label: "System", icon: "refresh" }, { value: "light", label: "Light", icon: "globe" }, { value: "dark", label: "Dark", icon: "hide" }],
    onChange: (v) => { window.__eskiTheme?.set(v); },
  });
  // Performance overlay — a diagnostic HUD the owner can enable to capture real load timings
  // and send them back (the sandbox can't reach the live site). See perf.js.
  const perfToggle = Button({ label: isPerfEnabled() ? "Turn off performance overlay" : "Turn on performance overlay" });
  perfToggle.addEventListener("click", () => {
    const now = !isPerfEnabled(); setPerfEnabled(now);
    perfToggle.textContent = now ? "Turn off performance overlay" : "Turn on performance overlay";
    toast({ message: now ? "Performance overlay on — reload to capture a full load" : "Performance overlay off" });
  });
  const copyBtn = Button({ label: "Copy performance report", onClick: () => copyPerfReport() });
  return el("div", {}, [
    head("Appearance", "Theme for this browser."),
    el(".setcard", {}, [el("label.ulab", {}, ["Theme"]), seg]),
    el(".setcard", { style: "margin-top:12px" }, [
      el("label.ulab", {}, ["Performance overlay"]),
      el("p", { style: "color:var(--muted);font-size:var(--fs-xs);margin:2px 0 8px" }, ["Shows real load timings on screen. Turn it on, reload, then Copy the report to send it over."]),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [perfToggle, copyBtn]),
    ]),
  ]);
}

function notificationsPanel() {
  return el("div", {}, [
    head("Notifications", "Where eski can reach you."),
    el(".setcard", {}, [el("p", { style: "color:var(--soft);font-size:var(--fs-sm);margin:0" }, [
      "Per-server notification levels (all / mentions / nothing) live in each server's menu → Notification settings. Account-wide email and push preferences arrive with the notifications build.",
    ])]),
  ]);
}

// P2: the blocked list is lazy-loaded (data.blocked is null until this panel opens). Render the
// card immediately with a loading line, then fill it — and cache the result back onto `data` so
// re-opening the panel doesn't refetch.
function privacyPanel(data) {
  const list = el(".setcard");
  const wrap = el("div", {}, [head("Privacy & safety", "People you've blocked."), list]);
  const paint = (blocked) => {
    list.replaceChildren();
    if (!blocked.length) { list.append(el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:0" }, ["You haven't blocked anyone."])); return; }
    for (const u of blocked) {
      const row = el(".blockrow", { style: "display:flex;align-items:center;gap:10px;padding:6px 0" });
      const un = Button({ label: "Unblock", size: "sm" });
      un.addEventListener("click", async () => {
        un.disabled = true;
        try { if (!isDemo()) await unblockUser(u.id); row.remove(); data.blocked = (data.blocked || []).filter((b) => b.id !== u.id); toast({ message: `Unblocked ${u.name}` }); if (!list.querySelector(".blockrow")) list.append(el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:0" }, ["You haven't blocked anyone."])); }
        catch (e) { un.disabled = false; toast({ message: e?.message || "Couldn’t unblock" }); }
      });
      row.append(Avatar({ name: u.initials, size: "sm", src: avatarUrl(u.avatar_key) }), el("div", { style: "flex:1" }, [el("b", {}, [u.name]), el("span", { style: "color:var(--muted);margin-left:6px;font-size:var(--fs-xs)" }, ["@" + u.handle])]), un);
      list.append(row);
    }
  };
  if (data.blocked) paint(data.blocked);
  else { list.append(el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:0" }, ["Loading…"])); loadUserBlocked().then((b) => { data.blocked = b; paint(b); }).catch(() => paint([])); }
  return wrap;
}

// P2: storage figures are lazy-loaded (data.storage is null until this panel opens). Same
// pattern — render the card immediately, then fill the numbers.
function storagePanel(data) {
  const card = el(".setcard");
  const wrap = el("div", {}, [head("Storage", "Your personal files (public + private)."), card]);
  const gb = (b) => (b / 1024 ** 3).toFixed(b < 1024 ** 3 ? 2 : 1);
  const paint = (s) => {
    const pct = s.capBytes ? Math.min(100, (s.usedBytes / s.capBytes) * 100) : 0;
    card.replaceChildren(
      el("div", { style: "display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:6px" }, [
        el("b", {}, [`${gb(s.usedBytes)} GB used`]), el("span", { style: "color:var(--muted)" }, [`of ${s.capGb} GB`]),
      ]),
      UsageBar({ pct, tone: pct > 90 ? "warn" : "" }),
      el("p", { style: "color:var(--muted);font-size:var(--fs-xs);margin-top:10px" }, ["Buying more storage arrives with billing. Server files draw the server's storage, not yours."]),
    );
  };
  if (data.storage) paint(data.storage);
  else { card.append(el("p", { style: "color:var(--muted);font-size:var(--fs-sm);margin:0" }, ["Loading…"])); loadUserStorage().then((s) => { data.storage = s; paint(s); }).catch(() => paint({ usedBytes: 0, capBytes: USER_GB, capGb: 0 })); }
  return wrap;
}
const USER_GB = 1024 ** 3;

const PANEL_FNS = {
  profile: profilePanel, account: accountPanel, appearance: appearancePanel,
  notifications: notificationsPanel, privacy: privacyPanel, storage: storagePanel,
};

function settingRow(k, v, extra) {
  return el(".setrow2", { style: "display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)" }, [
    el("span", { style: "color:var(--soft);font-size:var(--fs-sm)" }, [k]),
    el("span", { style: "display:flex;align-items:center;gap:8px;font-size:var(--fs-sm)" }, [typeof v === "string" ? document.createTextNode(v) : v, extra || null].filter(Boolean)),
  ]);
}
