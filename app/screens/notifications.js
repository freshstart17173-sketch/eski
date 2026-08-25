// screens/notifications.js — the Notifications screen (P7.3, CANON §C). In-app notifications
// (v1): every kind (mention/comment/join/reaction/invite/friend) as a row with a kind icon,
// actor + text, optional context + excerpt, and time. Unread rows carry a dot; clicking a row
// (or its ✓) marks it read; "Mark all read" clears every unread. No member hue.

import { el, toast } from "../ui.js";
import { iconEl } from "../icons.js";
import { markNotifRead, markAllNotifsRead } from "../data.js";

function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }
const TABS = [["all", "All"], ["mentions", "Mentions"]];

export function renderNotifications(data) {
  const screen = el("section.screen", { "data-screen": "notifications" });
  const state = { tab: "all" };
  const items = (data.items || []).slice();   // local copy so read-state edits stick

  const panel = el(".npanel");
  const tabsEl = el(".ntabs");
  const paintTabs = () => tabsEl.replaceChildren(...TABS.map(([k, label]) =>
    el("a.ntab" + (state.tab === k ? ".on" : ""), { onClick: () => { state.tab = k; paintTabs(); paint(); } }, [label])));

  const markAll = el("a.mark", { onClick: async () => {
    try { if (!isDemoQS()) await markAllNotifsRead(); items.forEach((i) => (i.read = true)); paint(); toast({ message: "All caught up", icon: "check" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t update" }); }
  } }, ["Mark all read"]);

  function markRead(item, row) {
    if (item.read) return;
    item.read = true; row.classList.remove("unread");
    if (!isDemoQS()) markNotifRead(item.id).catch(() => {});
  }

  function paint() {
    const shown = state.tab === "mentions" ? items.filter((i) => i.kind === "mention") : items;
    if (!shown.length) { panel.replaceChildren(emptyState("bell", "You're all caught up", state.tab === "mentions" ? "Mentions of you show up here." : "Mentions, comments, reactions, joins, and friend requests land here.")); return; }
    panel.replaceChildren(...shown.map((item) => {
      const done = el("button.donebtn", { title: "Mark read", onClick: (e) => { e.stopPropagation(); markRead(item, row); } }, [iconEl("check", "sm")]);
      const row = el(".nrow" + (item.read ? "" : ".unread"), { onClick: () => markRead(item, row) }, [
        el(".nic", {}, [iconEl(item.icon || "bell", "sm")]),
        el(".nbd", {}, [
          el(".ntx", {}, [el("b", {}, [item.actor]), " " + item.text]),
          item.context ? el(".nctx", {}, [item.context]) : null,
          item.excerpt ? el(".quote", {}, [item.excerpt]) : null,
        ]),
        el("time", {}, [item.time || ""]),
        el(".nacts", {}, [done]),
      ]);
      return row;
    }));
  }

  paintTabs(); paint();
  screen.append(el(".notif", {}, [
    el(".notifhd", {}, [el("span.t", {}, ["Notifications"]), tabsEl, markAll]),
    panel,
  ]));
  return screen;
}

function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}
