// screens/dms.js — the Messages screen (P7.1, CANON §C). Two panes inside the shell: the
// DM thread list (.dmlist) on the left, and a right pane that shows either a conversation
// (P7.2) or the Friends panel. Friends is fully functional here — list accepted friends,
// answer incoming requests (accept/decline), see outgoing pending, and add a friend by
// exact handle. NO member hue — DMs and friends live outside any server.

import { el, toast, Avatar, PresenceDot } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { addFriend, respondFriend, createDM } from "../data.js";
import { avatarUrl } from "../cards.js";

function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }

export function renderDMs(data) {
  const screen = el("section.screen", { "data-screen": "dms" });
  const right = el(".dmright");        // swaps between the conversation placeholder and Friends
  const list = dmList(data, right);
  screen.append(list, right);
  showEmpty(right);                    // default: no conversation open yet
  return screen;
}

// ── left: the thread list + Friends toggle + add-by-username ──────────────────
function dmList(data, right) {
  const pendingN = (data.friends?.incoming?.length || 0);
  const friendsBtn = el("button.dmfriends", { onClick: () => showFriends(right, data, friendsBtn) }, [
    iconEl("users", "sm"), "Friends", pendingN ? el("span.ct", {}, [String(pendingN)]) : null,
  ]);

  const addInput = el("input", { placeholder: "Add by username", "aria-label": "Add by username" });
  const addField = el(".dmadd", {}, [el(".field", {}, [
    iconEl("user", "sm"), addInput,
    el("button", { title: "Add", onClick: () => addByUsername(addInput) }, [iconEl("plus", "sm")]),
  ])]);
  addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addByUsername(addInput); } });

  const rows = el(".dmrows");
  const pinned = (data.dms || []).filter((d) => d.pinned);
  const rest = (data.dms || []).filter((d) => !d.pinned);
  const openConvo = (d) => { showConvo(right, d); [...rows.children].forEach((c) => c.classList?.remove("on")); };
  if (pinned.length) { rows.append(el(".dmsec", {}, ["Pinned"])); for (const d of pinned) rows.append(dmRow(d, openConvo)); }
  if (rest.length) { rows.append(el(".dmsec", {}, ["Direct messages"])); for (const d of rest) rows.append(dmRow(d, openConvo)); }
  if (!pinned.length && !rest.length) rows.append(el(".dmnone", {}, ["No conversations yet."]));

  return el(".dmlist", {}, [
    el(".hd", {}, ["Messages", el("button.iconbtn.sm", { style: "margin-left:auto", title: "New message", onClick: () => showFriends(right, data, friendsBtn) }, [iconEl("pen", "sm")])]),
    friendsBtn, addField, rows,
  ]);
}

function dmRow(d, openConvo) {
  const row = el(".dmrow" + (d.group ? ".group" : "") + ".dmconvo", { onClick: () => { openConvo(d); row.classList.add("on"); } });
  if (d.group) {
    row.append(el(".gav", {}, d.members.slice(0, 3).map((m) => Avatar({ name: m.initials, size: "sm", src: avatarUrl(m.avatar_key) }))));
  } else {
    const av = Avatar({ name: d.members[0]?.initials || d.name, size: "sm", src: avatarUrl(d.members[0]?.avatar_key) });
    av.style.position = "relative";
    av.append(PresenceDot({ state: d.members[0]?.presence || "offline", ring: "var(--surface)" }));
    row.append(av);
  }
  row.append(el("span.nm", {}, [d.name]));
  if (d.pinned) row.append(iconEl("pin", "sm"));
  else if (d.muted) row.append(iconEl("bell", "sm"));
  return row;
}

// ── right: conversation placeholder (P7.2) / empty inbox ──────────────────────
function showEmpty(right) {
  right.replaceChildren(el("main.dmmain", {}, [emptyState("mail", "Your messages", "Pick a conversation, or open Friends to start one.")]));
}
function showConvo(right, d) {
  // the live conversation (send/receive) lands in P7.2 — for now the header + a marker
  right.replaceChildren(el("main.dmmain", {}, [
    el(".mainhd", {}, [Avatar({ name: d.members[0]?.initials || d.name, size: "sm" }), el("span.t", {}, [d.name]), d.group ? null : el("span.sub", {}, ["@" + (d.members[0]?.handle || d.name)])]),
    emptyState("mail", d.name, "The live conversation view lands next (P7.2)."),
  ]));
}

// ── right: the Friends panel ──────────────────────────────────────────────────
function showFriends(right, data, friendsBtn) {
  friendsBtn.classList.add("on");
  const state = { tab: "all" };
  const body = el(".frbody");
  const tabs = el(".frtabs");
  const mkTab = (key, label, count) => {
    const t = el("a.frtab" + (state.tab === key ? ".on" : ""), { onClick: () => { state.tab = key; paintTabs(); paint(); } }, [label, count ? el("span.ct", {}, [String(count)]) : null]);
    return t;
  };
  function paintTabs() {
    tabs.replaceChildren(
      mkTab("all", "All", data.friends.accepted.length),
      mkTab("pending", "Pending", data.friends.incoming.length + data.friends.outgoing.length),
    );
  }
  paintTabs();

  const addInput = el("input", { placeholder: "Add a friend by their exact username", "aria-label": "Add a friend" });
  const add = el(".fradd", {}, [el(".field", {}, [iconEl("user", "sm"), addInput]),
    el("button.btn.primary", { onClick: () => sendReq() }, ["Send request"])]);
  addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendReq(); } });
  async function sendReq() {
    const h = addInput.value.trim().replace(/^@/, "");
    if (!h) return;
    try {
      if (!isDemoQS()) await addFriend(h);
      if (!data.friends.outgoing.some((u) => u.handle === h) && !data.friends.accepted.some((u) => u.handle === h)) {
        data.friends.outgoing.push({ id: "new-" + h, name: h, handle: h, initials: h.slice(0, 2).toUpperCase(), presence: "offline" });
      }
      addInput.value = ""; paintTabs(); paint();
      toast({ message: "Friend request sent", icon: "check" });
    } catch (e) { toast({ message: e?.message || "Couldn’t send the request" }); }
  }

  function paint() {
    body.replaceChildren(add);
    if (state.tab === "all") {
      if (!data.friends.accepted.length) { body.append(emptyState("users", "No friends yet", "Add someone by their exact username to get started.")); return; }
      body.append(el(".frsec", {}, [`Friends, ${data.friends.accepted.length}`]));
      for (const u of data.friends.accepted) body.append(friendRow(u));
    } else {
      const { incoming, outgoing } = data.friends;
      if (!incoming.length && !outgoing.length) { body.append(emptyState("users", "No pending requests", "Requests you send or receive show up here.")); return; }
      if (incoming.length) { body.append(el(".frsec", {}, [`Incoming, ${incoming.length}`])); for (const u of incoming) body.append(pendingRow(u, true)); }
      if (outgoing.length) { body.append(el(".frsec", {}, [`Outgoing, ${outgoing.length}`])); for (const u of outgoing) body.append(pendingRow(u, false)); }
    }
  }

  function friendRow(u) {
    return el(".frrow", {}, [
      avatarWithPresence(u),
      el(".info", {}, [el("b", {}, [u.name]), el("small", {}, ["@" + u.handle])]),
      el(".fracts", {}, [el("button.rbtn", { title: "Message", onClick: () => messageFriend(u) }, [iconEl("mail", "sm")])]),
    ]);
  }
  function pendingRow(u, incoming) {
    const acts = incoming
      ? el(".fracts", {}, [
        el("button.rbtn.ok", { title: "Accept", onClick: () => answer(u, true) }, [iconEl("check", "sm")]),
        el("button.rbtn.no", { title: "Decline", onClick: () => answer(u, false) }, [iconEl("x", "sm")]),
      ])
      : el("span.pendlbl", {}, ["pending"]);
    return el(".frrow", {}, [
      avatarWithPresence(u),
      el(".info", {}, [el("b", {}, [u.name]), el("small", {}, [incoming ? "incoming friend request" : "outgoing request"])]),
      acts,
    ]);
  }
  async function answer(u, accept) {
    try {
      if (!isDemoQS()) await respondFriend(u.id, accept);
      data.friends.incoming = data.friends.incoming.filter((x) => x.id !== u.id);
      if (accept) data.friends.accepted.push(u);
      paintTabs(); paint();
      toast({ message: accept ? `You’re now friends with ${u.name}` : "Request declined" });
    } catch (e) { toast({ message: e?.message || "Couldn’t respond" }); }
  }
  async function messageFriend(u) {
    try { if (!isDemoQS()) await createDM(u.handle); toast({ message: `Opening a chat with ${u.name} (P7.2)` }); }
    catch (e) { toast({ message: e?.message || "Couldn’t start the conversation" }); }
  }

  paint();
  right.replaceChildren(el(".friends", {}, [
    el(".frhd", {}, [iconEl("users"), el("span.t", {}, ["Friends"]), tabs]),
    body,
  ]));
}

function avatarWithPresence(u) {
  const av = Avatar({ name: u.initials, size: "sm", src: avatarUrl(u.avatar_key) });
  av.style.position = "relative";
  av.append(PresenceDot({ state: u.presence || "offline", ring: "var(--paper)" }));
  return av;
}

function emptyState(icon, title, sub) {
  const eic = iconEl(icon); eic.classList.add("eic");
  return el(".emptystate", {}, [eic, el("h3", {}, [title]), el("p", {}, [sub])]);
}
