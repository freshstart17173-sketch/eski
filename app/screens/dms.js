// screens/dms.js — the Messages screen (P7.1, CANON §C). Two panes inside the shell: the
// DM thread list (.dmlist) on the left, and a right pane that shows either a conversation
// (P7.2) or the Friends panel. Friends is fully functional here — list accepted friends,
// answer incoming requests (accept/decline), see outgoing pending, and add a friend by
// exact handle. NO member hue — DMs and friends live outside any server.

import { el, toast, Avatar, PresenceDot, openMenu, openModal, Button } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { addFriend, respondFriend, blockUser, createDM, createGroupDM, loadDMThread, sendDM, setDMPref } from "../data.js";
import { avatarUrl } from "../cards.js";
import { subscribeDMMessages } from "../realtime.js";
import { session } from "../supabase.js";
import { openReport } from "../report.js";

function isDemoQS() { return new URLSearchParams(location.search).get("demo") === "1"; }

export function renderDMs(data) {
  const screen = el("section.screen", { "data-screen": "dms" });
  const right = el(".dmright");        // swaps between the conversation placeholder and Friends
  const list = dmList(data, right);
  screen.append(list, right);
  showEmpty(right);                    // default: no conversation open yet
  return screen;
}

// ── left: ONE surface — requests + conversations + friends, no Friends button ─
// P5: Friends are not behind a button anymore; they live in this same column as sections
// (Requests · Pinned · Direct messages · Friends). Clicking a friend opens/starts their DM in
// the right pane. The old showFriends() right-pane swap is gone.
function dmList(data, right) {
  const fr = data.friends || { accepted: [], incoming: [], outgoing: [] };

  // Add a friend by exact username (previously a dangling addByUsername ref — now wired). On
  // success they land in Outgoing pending until they accept.
  const addInput = el("input", { placeholder: "Add a friend by username", "aria-label": "Add a friend by username" });
  async function addByUsername() {
    const h = addInput.value.trim().replace(/^@/, "");
    if (!h) return;
    try {
      if (!isDemoQS()) await addFriend(h);
      if (!fr.outgoing.some((u) => u.handle === h) && !fr.accepted.some((u) => u.handle === h))
        fr.outgoing.push({ id: "new-" + h, name: h, handle: h, initials: h.slice(0, 2).toUpperCase(), presence: "offline" });
      addInput.value = ""; paintRows();
      toast({ message: "Friend request sent", icon: "check" });
    } catch (e) { toast({ message: e?.message || "Couldn’t send the request" }); }
  }
  const addField = el(".dmadd", {}, [el(".field", {}, [
    iconEl("user", "sm"), addInput,
    el("button.iconbtn", { title: "Add friend", onClick: addByUsername }, [iconEl("plus", "sm")]),
  ])]);
  addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addByUsername(); } });

  const rows = el(".dmrows");
  const openConvo = (d) => { showConvo(right, d); };

  // answer an incoming request / start a DM with a friend — both repaint the column in place.
  async function answer(u, accept) {
    try {
      if (!isDemoQS()) await respondFriend(u.id, accept);
      fr.incoming = fr.incoming.filter((x) => x.id !== u.id);
      if (accept) fr.accepted.push(u);
      paintRows();
      toast({ message: accept ? `You’re now friends with ${u.name}` : "Request declined" });
    } catch (e) { toast({ message: e?.message || "Couldn’t respond" }); }
  }
  async function messageFriend(u) {
    try {
      const chId = isDemoQS() ? "dm-" + u.id : await createDM(u.handle);
      showConvo(right, { id: chId || ("dm-" + u.id), name: u.name, members: [u], group: false });
    } catch (e) { toast({ message: e?.message || "Couldn’t start the conversation" }); }
  }
  // pin/mute/hide mutate data.dms in place; the list repaints (hidden threads drop out,
  // pinned ones jump to the Pinned section). RLS is the fence via setDMPref.
  const rowMenu = (d, anchor) => openMenu(anchor, [
    { label: d.pinned ? "Unpin" : "Pin", icon: "pin", onClick: () => setPref(d, { pinned: !d.pinned }) },
    { label: d.muted ? "Unmute" : "Mute", icon: "bell", onClick: () => setPref(d, { muted: !d.muted }) },
    { sep: true },
    { label: "Close DM", icon: "hide", onClick: () => setPref(d, { hidden: true }) },
    // Block + Report only apply to a 1:1 (a group has several people).
    ...(!d.group && d.members[0]?.id ? [
      { label: "Report", icon: "flag", onClick: () => openReport({ targetType: "user", targetId: d.members[0].id, label: `@${d.members[0].handle || d.members[0].name}` }) },
      { label: "Block", icon: "leave", danger: true, onClick: () => blockDM(d) },
    ] : []),
  ]);
  async function blockDM(d) {
    const other = d.members[0];
    try {
      if (!isDemoQS()) await blockUser(other.id);
      data.dms = data.dms.filter((x) => x.id !== d.id);
      paintRows();
      toast({ message: `Blocked ${other.name}` });
    } catch (e) { toast({ message: e?.message || "Couldn’t block" }); }
  }
  async function setPref(d, patch) {
    try {
      if (!isDemoQS()) await setDMPref(d.id, patch);
      Object.assign(d, patch);
      if (patch.hidden) data.dms = data.dms.filter((x) => x.id !== d.id);
      paintRows();
      toast({ message: patch.hidden ? "Conversation hidden" : patch.pinned != null ? (patch.pinned ? "Pinned" : "Unpinned") : (patch.muted ? "Muted" : "Unmuted") });
    } catch (e) { toast({ message: e?.message || "Couldn’t update" }); }
  }
  function paintRows() {
    rows.replaceChildren();
    // Requests first — incoming ones need an answer, so they lead.
    if (fr.incoming.length || fr.outgoing.length) {
      rows.append(el(".dmsec", {}, ["Requests"]));
      for (const u of fr.incoming) rows.append(requestRow(u, true, answer));
      for (const u of fr.outgoing) rows.append(requestRow(u, false, answer));
    }
    const pinned = (data.dms || []).filter((d) => d.pinned);
    const rest = (data.dms || []).filter((d) => !d.pinned);
    if (pinned.length) { rows.append(el(".dmsec", {}, ["Pinned"])); for (const d of pinned) rows.append(dmRow(d, openConvo, rowMenu)); }
    if (rest.length) { rows.append(el(".dmsec", {}, ["Direct messages"])); for (const d of rest) rows.append(dmRow(d, openConvo, rowMenu)); }
    // Friends without an active 1:1 conversation → click to start one (no duplicate of open DMs).
    const dmIds = new Set((data.dms || []).filter((d) => !d.group && d.members[0]).map((d) => d.members[0].id));
    const friendsNoDm = (fr.accepted || []).filter((u) => !dmIds.has(u.id));
    if (friendsNoDm.length) { rows.append(el(".dmsec", {}, ["Friends"])); for (const u of friendsNoDm) rows.append(friendConvoRow(u, messageFriend)); }
    if (!fr.incoming.length && !fr.outgoing.length && !pinned.length && !rest.length && !friendsNoDm.length)
      rows.append(el(".dmnone", {}, ["No conversations or friends yet — add someone by username above."]));
  }
  paintRows();

  return el(".dmlist", {}, [
    el(".hd", {}, ["Messages", el("button.iconbtn.sm", { style: "margin-left:auto", title: "New message", onClick: () => openNewMessage(data, right) }, [iconEl("pen", "sm")])]),
    addField, rows,
  ]);
}

// A friend row in the list column — click anywhere (or the mail icon) to open/start their DM.
function friendConvoRow(u, onMessage) {
  const row = el(".dmrow.dmconvo", { onClick: () => onMessage(u) });
  const av = Avatar({ name: u.initials, size: "sm", src: avatarUrl(u.avatar_key) });
  av.style.position = "relative";
  av.append(PresenceDot({ state: u.presence || "offline", ring: "var(--surface)" }));
  row.append(av, el("span.nm", {}, [u.name]),
    el(".dmtrail", {}, [el("button.more2", { title: "Message", onClick: (e) => { e.stopPropagation(); onMessage(u); } }, [iconEl("mail", "sm")])]));
  return row;
}

// An incoming/outgoing friend request row — incoming gets accept/decline, outgoing shows "pending".
function requestRow(u, incoming, answer) {
  const row = el(".dmrow");
  const av = Avatar({ name: u.initials, size: "sm", src: avatarUrl(u.avatar_key) });
  av.style.position = "relative";
  av.append(PresenceDot({ state: u.presence || "offline", ring: "var(--surface)" }));
  const acts = incoming
    ? el(".dmtrail", {}, [
        el("button.rbtn.ok", { title: "Accept", onClick: () => answer(u, true) }, [iconEl("check", "sm")]),
        el("button.rbtn.no", { title: "Decline", onClick: () => answer(u, false) }, [iconEl("x", "sm")]),
      ])
    : el("span.pendlbl", {}, ["pending"]);
  row.append(av, el("span.nm", {}, [u.name]), acts);
  return row;
}

function dmRow(d, openConvo, rowMenu) {
  const row = el(".dmrow" + (d.group ? ".group" : "") + ".dmconvo", {
    onClick: (e) => { if (e.target.closest?.(".more2")) return; openConvo(d); [...row.parentElement.children].forEach((c) => c.classList?.remove("on")); row.classList.add("on"); },
    oncontextmenu: (e) => { e.preventDefault(); rowMenu(d, row); },
  });
  if (d.group) {
    row.append(el(".gav", {}, d.members.slice(0, 3).map((m) => Avatar({ name: m.initials, size: "sm", src: avatarUrl(m.avatar_key) }))));
  } else {
    const av = Avatar({ name: d.members[0]?.initials || d.name, size: "sm", src: avatarUrl(d.members[0]?.avatar_key) });
    av.style.position = "relative";
    av.append(PresenceDot({ state: d.members[0]?.presence || "offline", ring: "var(--surface)" }));
    row.append(av);
  }
  row.append(el("span.nm", {}, [d.name]));
  const trail = el(".dmtrail", {}, [
    d.pinned ? iconEl("pin", "sm") : (d.muted ? iconEl("bell", "sm") : null),
    el("button.more2", { title: "More", "aria-haspopup": "menu", onClick: (e) => { e.stopPropagation(); rowMenu(d, e.currentTarget); } }, [iconEl("more", "sm")]),
  ]);
  row.append(trail);
  return row;
}

// New message — pick one friend (→ createDM) or several (→ createGroupDM), then open it.
function openNewMessage(data, right) {
  const friends = data.friends?.accepted || [];
  const chosen = new Set();
  const start = Button({ label: "Start conversation", variant: "primary", disabled: true });
  const list = el(".nmlist", {}, friends.map((u) => el("label.nmrow", {}, [
    el("input", { type: "checkbox", "aria-label": u.name, onchange: (e) => { e.target.checked ? chosen.add(u) : chosen.delete(u); start.disabled = chosen.size === 0; } }),
    avatarWithPresence(u), el("span.nmname", {}, [u.name]),
  ])));
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = friends.length ? list : el("p", { style: "color:var(--muted);font-size:var(--fs-sm)" }, ["Add a friend first to start a conversation."]);
  const { close } = openModal({ title: "New message", body, footer: [cancel, start] });
  cancel.addEventListener("click", () => close());
  start.addEventListener("click", async () => {
    const arr = [...chosen];
    if (!arr.length) return;
    try {
      let d;
      if (arr.length === 1) {
        const id = isDemoQS() ? "dm-" + arr[0].id : await createDM(arr[0].handle);
        d = { id: id || ("dm-" + arr[0].id), name: arr[0].name, members: [arr[0]], group: false };
      } else {
        const id = isDemoQS() ? "g-" + Date.now() : await createGroupDM(arr.map((u) => u.handle));
        d = { id: id || ("g-" + Date.now()), name: arr.map((u) => u.name).join(", "), members: arr, group: true };
      }
      close();
      showConvo(right, d);
    } catch (e) { toast({ message: e?.message || "Couldn’t start the conversation" }); }
  });
}

// ── right: conversation placeholder (P7.2) / empty inbox ──────────────────────
function showEmpty(right) {
  right.replaceChildren(el("main.dmmain", {}, [emptyState("mail", "Your messages", "Pick a conversation, or add a friend to start one.")]));
}
function showConvo(right, d) {
  // real conversation (P7.2): header + message stream + composer. Messages load async; the
  // composer inserts a dm_message and appends it; incoming messages arrive live via
  // subscribeDMMessages (see below).
  const stream = el(".stream");
  const scrollDown = () => { stream.scrollTop = stream.scrollHeight; };
  const paint = (messages) => { stream.replaceChildren(...(messages.length ? messages.map(dmMessageRow) : [emptyState("mail", d.name, "No messages yet — say hi.")])); scrollDown(); };
  paint([]);
  loadDMThread(d.id).then((t) => paint(t.messages || [])).catch(() => {});

  // Realtime echo (P7.2): append messages from the OTHER participant(s) live. My own sends are
  // appended optimistically below, so skip my user_id; dedupe by id in case an echo races.
  const myId = session()?.id;
  const memberById = {}; for (const m of d.members || []) memberById[m.id] = m;
  const appendLive = (row) => {
    if (row.user_id === myId) return;                                    // my own message — already shown
    if (stream.querySelector(`.msg[data-mid="${row.id}"]`)) return;     // already appended
    const a = memberById[row.user_id] || { name: d.name, initials: (d.name || "?").slice(0, 2).toUpperCase(), avatar_key: null };
    const near = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;   // only autoscroll if near the bottom
    if (!stream.querySelector(".msg")) stream.replaceChildren();
    stream.append(dmMessageRow({ id: row.id, author: a, time: dmTime(row.created_at), body: row.body }));
    if (near) scrollDown();
  };
  subscribeDMMessages(d.id, {
    onInsert: appendLive,
    onUpdate: (row) => { const r = stream.querySelector(`.msg[data-mid="${row.id}"] .tx`); if (r) r.textContent = row.deleted_at ? "message deleted" : (row.body || ""); },
  });

  const input = el("input", { placeholder: "Message " + d.name, "aria-label": "Message" });
  const send = async () => {
    const body = input.value.trim();
    if (!body || input.disabled) return;
    input.disabled = true;
    try {
      const msg = await sendDM(d.id, body);
      if (!stream.querySelector(".msg")) stream.replaceChildren();   // clear the empty state
      stream.append(dmMessageRow(msg)); scrollDown();
      input.value = "";
    } catch (e) { toast({ message: e?.message || "Couldn’t send" }); }
    input.disabled = false; input.focus();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });

  right.replaceChildren(el("main.dmmain", {}, [
    el(".mainhd", {}, [Avatar({ name: d.members[0]?.initials || d.name, size: "sm", src: avatarUrl(d.members[0]?.avatar_key) }), el("span.t", {}, [d.name]), d.group ? null : el("span.sub", {}, ["@" + (d.members[0]?.handle || d.name)])]),
    stream,
    el(".composer", {}, [el(".field", {}, [input, el("button.snd", { title: "Send", onClick: send }, [iconEl("send", "sm")])])]),
  ]));
  input.focus();
}

// short clock time for a live-echoed DM row's timestamp
function dmTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }

// a lean DM message row (no member hue — DMs are outside any server). data-mid lets the
// realtime echo dedupe against an already-rendered message.
function dmMessageRow(m) {
  return el(".msg", { "data-mid": m.id || null }, [
    Avatar({ name: m.author.initials, size: "sm", src: avatarUrl(m.author.avatar_key) }),
    el(".bd", {}, [
      el(".by", {}, [el("span.u", {}, [m.author.name]), el("time", {}, [m.time || ""])]),
      el(".tx", {}, [m.body || ""]),
    ]),
  ]);
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
