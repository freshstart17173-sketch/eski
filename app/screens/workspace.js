// screens/workspace.js — the Workspace screen (P4.3–P4.9), assembled from the P3
// primitives (ui.js) and the shell/workspace CSS (styles/shell.css). The visual
// law is docs/design/gallery.html ?app=1#workspace; this file reproduces that
// screen as live DOM driven by a data object from data.js.
//
// The screen is: channel column · main chat pane (Messages / Pins / Files tabs) ·
// members rail · thread pane. The server rail lives one level up in shell.js
// (it's persistent across every app screen), not here.
//
// States (driven by `view`, set from ?ws= for verification and by clicks live):
//   loading · empty (no channels) · zero-messages · timedout/slowmode composer ·
//   reconnecting banner · thread open · pins/files tab.

import { el, Avatar, IconButton, openMenu, closeMenus, toast, openModal, Button, copyToClipboard } from "../ui.js";
import { openReport } from "../report.js";
import { openRolesEditor, openChannelAccess } from "./roles.js";
import { iconEl } from "../icons.js";
import { navigate, reload } from "../router.js";
import { avatarUrl, mediaUrl } from "../cards.js";
import { openDetails } from "./details.js";
import { uploadBlobs } from "../upload-r2.js";
import { isDemo, shapeMessage, loadThread, toggleReaction, loadMessageReactions, forwardMessage, deleteMessage, pinMessage, unpinMessage, editMessage, kickMember, timeoutMember, banMember, setMemberRoles, createChannel, updateChannel, createInvite, loadInvites, revokeInvite, loadInviteCandidates, inviteByHandle, inviteUserToServer, updateServer, loadAuditLog, leaveServer, deleteServer, loadServerPrefs, setServerPrefs, fetchChannelAttachment } from "../data.js";
import { subscribeChannelMessages, subscribeChannelReactions, subscribeTyping, sendTyping, subscribeServerPresence, markRead, sendMessage } from "../realtime.js";
import { openUpload, enableDropUpload } from "./upload.js";

// ── text rendering ──────────────────────────────────────────────────────────
// A message body is HTML-escaped first, then a small inline-markdown pass turns
// **bold** / *italic* / ~~strike~~ / `code` / [text](url) into tags, and @mention /
// #channel into .men spans (member hue applied inline for @). We escape BEFORE
// inserting any tags, so the injected markup is the only HTML — safe innerHTML.
// (A full markdown lib — `marked` — is deferred; this covers the composer's toolbar.)
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function mdToHtml(text, mentions) {
  let s = esc(String(text || ""));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");   // *italic*, not ** or bare *
  const hueOf = (name) => (mentions || []).find((m) => m.name === name)?.colorIdx;
  s = s.replace(/(^|\s)@([\w.-]+)/g, (_m, sp, name) => {
    const hue = hueOf(name);
    return `${sp}<span class="men"${hue != null ? ` style="color:var(--m${hue})"` : ""}>@${name}</span>`;
  });
  s = s.replace(/(^|\s)#([\w.-]+)/g, `$1<span class="men">#$2</span>`);
  return s;
}

function renderBody(msg) {
  const tx = el(".tx");
  tx.innerHTML = mdToHtml(msg.body, msg.mentions);
  if (msg.edited) { tx.append(document.createTextNode(" ")); tx.append(el("span.edited", {}, ["(edited)"])); }
  return tx;
}

// a byline: username in member hue (the one server-scoped colour) + timestamp
function byline(person, time) {
  const u = el("span.u", {}, [person.name]);
  if (person.colorIdx != null) u.style.color = `var(--m${person.colorIdx})`;
  return el(".by", {}, [u, time ? el("time", {}, [time]) : null]);
}

// ── file shares in a message (P4.7) ─────────────────────────────────────────
const KIND_ICON = { audio: "music", image: "image", video: "video", file: "file" };

// single attachment card — the file NAME leads (CANON), kind-aware icon/ext
function fileCard(a, { compact } = {}) {
  const ext = a.file_ext || a.ext || "";   // shapeWork uses file_ext; demo fixtures use ext
  const inner = el("button.filecard", { "data-open-details": true, onClick: (e) => { e.stopPropagation(); openDetails(a); } });
  inner.append(el(".fcwave", {}, [iconEl(KIND_ICON[a.kind] || "file", "sm"), ext ? el("span.ext", {}, [ext]) : null]));
  const body = el(".fbody", {}, [el(".fname", {}, [a.name])]);
  if (a.size) body.append(el("div", { style: "font-size:11px;color:var(--muted);margin-top:3px" }, [`${a.size} · ${ext}`.trim()]));
  if (a.tags?.length) body.append(el(".ftags", {}, a.tags.map((t) => el("span.tag", {}, [t]))));
  inner.append(body);

  // B26 inline attachment actions (download / save / open in explorer)
  const acts = el(".fcacts", {}, [
    actBtn("download", "Download", () => toast({ message: `Downloading ${a.name}` })),
    actBtn("save", "Save to my files", () => toast({ message: "Saved to your files" })),
    actBtn("folder", "Open in explorer", () => openDetails(a)),
  ]);
  return el(".filecardwrap", {}, [inner, acts]);
}
function actBtn(ic, title, onClick) {
  const b = el("button", { title, "aria-label": title, onClick: (e) => { e.stopPropagation(); onClick(); } });
  b.append(iconEl(ic, "sm"));
  return b;
}
// several files in one post clump into a compact grid
function fileClump(files, more) {
  const grid = el(".fileclump");
  for (const f of files) {
    const b = el("button.fc", { "data-open-details": true, onClick: () => openDetails(f) }, [iconEl(KIND_ICON[f.kind] || "file"), el("span.n", {}, [f.name])]);
    grid.append(b);
  }
  if (more) grid.append(el("button.fc.more", {}, [`+${more} more`]));
  return grid;
}
// a forwarded message: a left-ruled quote naming its source
function forwardBlock(fwd) {
  const src = el(".src", {}, [iconEl("hash"), (() => { const u = el("span.u", {}, [fwd.author.name]); u.style.color = `var(--m${fwd.author.colorIdx})`; return u; })(), `in #${fwd.fromChannel} · ${fwd.when}`]);
  return el(".fwd", {}, [src, el(".tx", {}, [fwd.text])]);
}

// Details pane: the ONE real viewer (screens/details.js), imported above. The old local
// stub here just toasted "viewer lands in P5" and was never replaced when P5 shipped — so
// every workspace file card (chat attachments AND the channel Files tab) opened a dead toast
// instead of the viewer the explorer already used. Now they all open the real pane.

// ── message row (P4.5) ──────────────────────────────────────────────────────
function messageRow(msg, data, { onOpenThread } = {}) {
  if (msg.newDivider) return el(".newdiv", {}, [el("span", {}, ["New messages"])]);

  const own = msg.author.name === data.me.name;
  const rx = reactionsBar(msg);   // manages msg.reactions + toggling; the smile button adds
  const acts = el(".hoveracts", {}, [
    IconButton({ icon: "smile", title: "React", onClick: (e) => openMenu(e.currentTarget, REACT_EMOJI.map((em) => ({ label: em, onClick: () => rx.add(em) }))) }),
    IconButton({ icon: "reply", title: "Reply", onClick: () => onOpenThread?.(msg) }),
    IconButton({ icon: "more", title: "More", onClick: (e) => openMsgMenu(e.currentTarget, msg, own, data) }),
  ]);

  const bd = el(".bd", {}, [byline(msg.author, msg.time)]);
  if (msg.forward) bd.append(el(".tx", { style: "color:var(--muted);font-size:var(--fs-xs)", html: `forwarded from <b style="color:var(--soft)">#${msg.forward.fromChannel}</b>` }), forwardBlock(msg.forward));
  if (msg.body) bd.append(renderBody(msg));
  if (msg.attach) bd.append(fileCard(msg.attach));
  if (msg.clump) bd.append(fileClump(msg.clump, msg.clumpMore));
  bd.append(rx.bar);   // reactions (empty bar renders nothing until one is added)
  if (msg.replies) bd.append(el(".reply", { onClick: () => onOpenThread?.(msg) }, [iconEl("reply", "sm"), `${msg.replies} replies`]));

  const node = el(".msg", { "data-mid": msg.id }, [acts, Avatar({ name: msg.author.name, size: "sm", src: avatarUrl(msg.author.avatar_key) }), bd]);
  node._rx = rx;   // so a live reaction echo can refresh this row's chips (attachLive)
  return node;
}

// a message's reaction chips — toggle your own (toggle_reaction), add via the smile picker.
// Optimistic: mutate msg.reactions ({emoji,n,mine}) + repaint; the RPC is fire-and-forget.
const REACT_EMOJI = ["👍", "🔥", "😂", "❤️", "🎉", "👀"];
function reactionsBar(msg) {
  if (!msg.reactions) msg.reactions = [];
  const bar = el(".reactions");
  const paint = () => bar.replaceChildren(...msg.reactions.map((r) =>
    el("span.react" + (r.mine ? ".on" : ""), { onClick: () => flip(r) }, [r.emoji, el("span.n", {}, [String(r.n)])])));
  function flip(r) {
    const wasMine = !!r.mine;
    r.mine = !wasMine; r.n += wasMine ? -1 : 1;
    if (r.n <= 0) msg.reactions = msg.reactions.filter((x) => x !== r);
    paint();
    if (!isDemo()) toggleReaction(msg.id, r.emoji).catch(() => {});
  }
  function add(emoji) {
    let r = msg.reactions.find((x) => x.emoji === emoji);
    if (r) { if (!r.mine) { r.mine = true; r.n++; } }
    else { r = { emoji, n: 1, mine: true }; msg.reactions.push(r); }
    paint();
    if (!isDemo()) toggleReaction(msg.id, emoji).catch(() => {});
  }
  // Live echo: replace the chips with the server's truth for this message (P4.12 realtime).
  // Keeps the same bar element + closures, so the smile picker and flip still work after.
  function apply(arr) { msg.reactions = arr || []; paint(); }
  paint();
  return { bar, add, apply };
}

// Inline edit (own message): swap the .tx body for an input; Enter saves (editMessage +
// re-render with an "(edited)" marker), Esc/empty restores. Realtime edit uses the same
// renderBody path (line ~"newTx"), so this stays consistent with a live edit landing.
function startEdit(msg) {
  const tx = document.querySelector(`.msg[data-mid="${msg.id}"] .bd .tx`);
  if (!tx) return;
  const input = el("input.editinput", { value: msg.body || "", "aria-label": "Edit message" });
  const editWrap = el(".editrow", {}, [input]);
  const restore = () => editWrap.replaceWith(renderBody(msg));
  const saveEdit = async () => {
    const v = input.value.trim();
    if (!v || v === msg.body) return restore();
    try { if (!isDemo()) await editMessage(msg.id, v); msg.body = v; msg.edited = true; restore(); toast({ message: "Message edited" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t edit the message" }); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(); } else if (e.key === "Escape") { e.preventDefault(); restore(); } });
  tx.replaceWith(editWrap);
  input.focus(); input.select();
}

// A message permalink is the current channel path plus ?m=<id> — arriving there scrolls to
// and flashes the message (see flashMessage / workspaceView.focusMsg). We build it from the
// server+channel in `data`, not location.pathname, so it's canonical even from /s/:id (no
// channel segment) or a thread pane.
function msgPermalink(msg, data) {
  const chId = data.channel?.id || data.activeChannelId;
  const base = chId ? `/s/${data.server.id}/c/${chId}` : `/s/${data.server.id}`;
  return location.origin + base + "?m=" + msg.id;
}

// the ⋯ menu: own message adds Edit/Delete; everyone gets Pin + Copy link
function openMsgMenu(anchor, msg, own, data) {
  const items = [];
  if (own) items.push({ label: "Edit message", icon: "pen", onClick: () => startEdit(msg) });
  items.push({ label: "Pin to channel", icon: "pin", onClick: async () => {
    try { if (!isDemo()) await pinMessage(msg.id); toast({ message: "Pinned to the channel", icon: "pin" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t pin" }); }
  } });
  items.push({ label: "Copy link", icon: "link", onClick: () => copyToClipboard(msgPermalink(msg, data), { ok: "Message link copied" }) });
  items.push({ label: "Forward", icon: "arrow", onClick: () => forwardFlow(msg, data) });
  if (!own) items.push({ label: "Report message", icon: "flag", danger: true, onClick: () => openReport({ targetType: "message", targetId: msg.id, serverId: data.server?.id, label: "this message" }) });
  if (own) {
    items.push({ sep: true });
    items.push({ label: "Delete message", icon: "trash", danger: true, onClick: async () => {
      try { if (!isDemo()) await deleteMessage(msg.id); document.querySelector(`.msg[data-mid="${msg.id}"]`)?.remove(); toast({ message: "Message deleted" }); }
      catch (e) { toast({ message: e?.message || "Couldn’t delete" }); }
    } });
  }
  openMenu(anchor, items);
}

// Forward modal (CANON §C.4 / gallery S5): pick target text channels in this server + an
// optional note → forwardMessage writes a message per target that quotes the source.
function forwardFlow(msg, data) {
  const channels = data.channelGroups.flatMap((g) => g.channels).filter((c) => c.kind !== "voice");
  const picked = new Set();
  const rows = channels.map((c) => {
    const box = el("span.cbx", {}, [iconEl("check")]);
    const row = el("label.fwdpick", { onClick: (e) => {
      e.preventDefault();
      if (picked.has(c.id)) { picked.delete(c.id); box.classList.remove("on"); }
      else { picked.add(c.id); box.classList.add("on"); }
      send.disabled = picked.size === 0;
    } }, [box, iconEl("hash", "sm"), el("span", {}, [c.name])]);
    return row;
  });
  const quote = el(".fwdquote", {}, [
    el(".by", {}, [el("span.u", { style: `color:var(--m${msg.author.colorIdx})` }, [msg.author.name])]),
    el(".tx", {}, [msg.body ? (msg.body.length > 140 ? msg.body.slice(0, 140) + "…" : msg.body) : (msg.attach ? "a file" : "a message")]),
  ]);
  const note = el("input", { placeholder: "Add a note (optional)" });
  const send = Button({ label: "Forward", variant: "primary", disabled: true });
  const body = el("div", {}, [
    quote,
    el("label.ulab", { style: "margin-top:12px" }, ["Forward to"]),
    el(".fwdpicks", {}, rows.length ? rows : [el(".sharenone", {}, ["No channels to forward to."])]),
    el("label.ulab", { style: "margin-top:12px" }, ["Note"]),
    el(".field", {}, [note]),
  ]);
  const { close } = openModal({ title: "Forward message", body, footer: [send] });
  send.addEventListener("click", async () => {
    if (!picked.size) return;
    send.disabled = true;
    try {
      await forwardMessage(msg.id, [...picked], note.value);
      close();
      toast({ message: `Forwarded to ${picked.size} channel${picked.size === 1 ? "" : "s"}`, icon: "arrow" });
    } catch (e) { send.disabled = false; toast({ message: e?.message || "Couldn’t forward" }); }
  });
}

// ── channel column (P4.3) ───────────────────────────────────────────────────
// Exported so the File explorer mounts the SAME column (Files highlighted) — the
// owner's "Files is a channel, not a standalone server" rule (CANON §C.6): one
// click from the browser back to any channel. `view.filesActive` swaps the
// highlight onto the Files row and drops the (placeholder) voice minibar.
export function channelColumn(data, view) {
  const activeId = view.channelId || data.channel?.id;

  // server header — the bar opens the server menu (admin sees Settings)
  const bar = el("button.srvbar", { "aria-haspopup": "menu", "aria-expanded": "false", title: "Server menu" }, [
    srvIconEl(data.server), el("b", {}, [data.server.name]), iconEl("chev", "sm"),
  ]);
  bar.querySelector(".ic")?.classList.add("srvchev");
  bar.addEventListener("click", () => {
    const items = [];
    if (data.isAdmin) items.push({ label: "Server settings", icon: "settings", onClick: () => openServerSettings(data) });
    if (data.isAdmin) items.push({ label: "Roles & permissions", icon: "users", onClick: () => openRolesEditor(data.server.id) });
    if (data.isAdmin) items.push({ label: "Audit log", icon: "flag", onClick: () => openAuditLog(data) });
    items.push({ label: "Invite people", icon: "plus", onClick: () => inviteFlow(data) });
    items.push({ label: "Notification settings", icon: "bell", onClick: () => notifSettingsFlow(data) });
    items.push({ sep: true });
    items.push(data.isOwner
      ? { label: "Delete server", icon: "trash", danger: true, onClick: () => deleteServerFlow(data) }
      : { label: "Leave server", icon: "leave", danger: true, onClick: () => leaveServerFlow(data) });
    openMenu(bar, items);
  });
  const srvhd = el(".srvhd", {}, [el(".srvcover"), bar]);

  const body = el(".chanbody");
  // Files is a channel entry → opens the File explorer (highlighted when we ARE
  // the explorer, so the column reads like any other active channel).
  body.append(el(".cgroup", {}, [
    el("button.crow" + (view.filesActive ? ".on" : ""), { onClick: () => navigate(withDemo(`/s/${data.server.id}/files`)) }, [iconEl("folder"), el("span.nm", {}, ["Files"])]),
  ]));

  for (const g of data.channelGroups) {
    const label = el(".cglabel", {}, [
      el("button.cgtoggle", { "aria-expanded": "true", onClick: (e) => e.currentTarget.closest(".cgroup").classList.toggle("collapsed") }, [iconEl("chev", "sm"), g.label]),
    ]);
    label.querySelector(".cgtoggle .ic")?.classList.add("cgcaret");
    if (data.isAdmin) {
      const add = el("button.cgadd", { title: g.kind === "voice" ? "Create voice channel" : "Create channel", onClick: () => g.kind === "voice" ? toast({ message: "Voice channels ship in v2" }) : createChannelFlow(data, "text") }, [iconEl("plus", "sm")]);
      label.append(add);
    }
    const group = el(".cgroup", {}, [label]);
    const voice = g.kind === "voice";
    for (const ch of g.channels) {
      const on = ch.id === activeId && !voice;
      // voice is v2 — a voice channel never opens a text view, it just notes it's coming
      const onClick = voice ? () => toast({ message: "Voice channels ship in v2" }) : () => openChannel(data, ch, row);
      const row = el("button.crow" + (on ? ".on" : ""), { onClick }, [
        iconEl(voice ? "voice" : "hash"),
        el("span.nm", { style: ch.unread ? "font-weight:600;color:var(--ink)" : null }, [ch.name]),
      ]);
      if (ch.mentions) row.append(el("span.ct", {}, [String(ch.mentions)]));
      if (data.isAdmin && !voice) row.append(el("span.cgear", { title: "Edit channel", onClick: (e) => { e.stopPropagation(); openChannelSettings(data, ch); } }, [iconEl("settings", "sm")]));
      group.append(row);
      // voice channels list who's in them
      if (g.kind === "voice" && ch.voice?.length) {
        const vp = el(".vpeople");
        for (const p of ch.voice) {
          const cell = el(".vp", { style: `color:var(--m${p.colorIdx})` }, [el("span.live"), el("span.u", {}, [p.name])]);
          if (p.doing) cell.append(el("span", { style: "color:var(--muted)" }, [p.doing]));
          vp.append(cell);
        }
        group.append(vp);
      }
    }
    body.append(group);
  }

  // voice minibar (WIP placeholder — voice ships v2). The explorer drops it: it's
  // a chat-context affordance, out of place under a file browser.
  if (view.filesActive) return el("nav.chan", {}, [srvhd, body]);
  const mini = el(".voicemini", { title: "Voice (in progress)" }, [
    el(".vmtop", {}, [el("span.vmdot"), el(".vminfo", {}, [el("b", {}, ["Voice connected"]), el("small", {}, [`the booth · ${data.server.name}`])]),
      IconButton({ icon: "mic", title: "Mic" }), IconButton({ icon: "leave", title: "Leave" })]),
    el(".vmwip", {}, [iconEl("clock"), "This feature is currently being built"]),
  ]);

  return el("nav.chan", {}, [srvhd, body, mini]);
}

function openChannel(data, ch, row) {
  // Live: route to the channel so its messages load. Demo: the fixture only seeds
  // #beats, so switch the highlight + header locally instead of showing a name
  // that doesn't match the stream.
  if (isDemo()) {
    row.closest(".chanbody").querySelectorAll(".crow.on").forEach((r) => r.classList.remove("on"));
    row.classList.add("on");
    const hd = row.closest(".screen").querySelector(".mainhd .t");
    if (hd) hd.textContent = ch.name;
    const input = row.closest(".screen").querySelector(".composer .field input");
    if (input) input.placeholder = `Message #${ch.name}`;
  } else {
    navigate(`/s/${data.server.id}/c/${ch.id}`);
  }
}

function withDemo(path) { return isDemo() ? path + "?demo=1" : path; }

// ── composer (P4.6) ─────────────────────────────────────────────────────────
function composer(data, view, ctx = {}) {
  const disabled = view.composer === "timedout" || view.composer === "slowmode";
  const note = el(".composernote", { hidden: !disabled }, disabled ? [
    iconEl("clock", "sm"),
    el("span", {}, [view.composer === "timedout" ? "You've been timed out in this channel. You can't send messages right now." : "Slow mode is on — one message every 30s."]),
  ] : []);

  const input = el("input", { placeholder: `Message #${data.channel?.name || ""}` });
  const send = el("button.snd", { title: "Send", disabled: true }, [iconEl("send", "sm")]);
  input.addEventListener("input", () => { send.disabled = !input.value.trim(); maybeAutocomplete(input, data); if (ctx.live && input.value.trim()) sendTyping(ctx.me); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) { e.preventDefault(); doSend(input, send, ctx); } });
  send.addEventListener("click", () => input.value.trim() && doSend(input, send, ctx));

  const field = el(".field", {}, [
    IconButton({ icon: "clip", title: "Attach files", onClick: () => ctx.live
      ? openUpload({ visibility: "server", serverId: ctx.serverId, channelId: ctx.channelId, onDone: () => reload() })
      : toast({ message: "Sign in to upload files" }) }),
    input, iconEl("at", "sm"), send,
  ]);
  field.querySelector(".iconbtn").style.cssText = "width:26px;height:26px";

  // No formatting toolbar: the B/I/S/code/link/list/quote controls and the "/commands" hint
  // were never wired (owner call 2026-08-28). The composer is just the field — attach, @, send.
  const wrap = el(".composer" + (disabled ? ".disabled" : ""), {}, [note, el(".richcomposer", {}, [field])]);
  return wrap;
}
async function doSend(input, send, ctx = {}) {
  const body = input.value.trim();
  input.value = ""; send.disabled = true;
  if (ctx.live && ctx.channelId) {
    const { error } = await sendMessage(ctx.channelId, body);   // realtime echo appends it
    if (error) { toast({ message: "Couldn't send — " + error.message, icon: "clock" }); input.value = body; send.disabled = false; }
  } else {
    toast({ message: "Message sent (demo)", icon: "send" });
  }
}
// @mention / #channel autocomplete — filters members/channels for the open token
function maybeAutocomplete(input, data) {
  const upto = input.value.slice(0, input.selectionStart ?? input.value.length);
  const m = upto.match(/(^|\s)([@#])([\w.-]*)$/);
  closeMenus();
  if (!m) return;
  const [sym, term] = [m[2], m[3].toLowerCase()];
  let opts = [];
  if (sym === "@") opts = data.memberGroups.flatMap((g) => g.members).filter((p) => p.name.toLowerCase().includes(term)).map((p) => ({ label: p.name, onClick: () => insertToken(input, "@" + p.name) }));
  else opts = data.channelGroups.flatMap((g) => g.channels).filter((c) => c.name.toLowerCase().includes(term)).map((c) => ({ label: "#" + c.name, onClick: () => insertToken(input, "#" + c.name) }));
  if (opts.length) openMenu(input, opts.slice(0, 6));
}
function insertToken(input, token) {
  const s = input.selectionStart ?? input.value.length;
  const upto = input.value.slice(0, s).replace(/([@#])([\w.-]*)$/, "");
  input.value = upto + token + " " + input.value.slice(s);
  input.focus(); input.dispatchEvent(new Event("input"));
}

// ── Pins panel (P4.4) ───────────────────────────────────────────────────────
function pinsPanel(data) {
  const panel = el(".chpanel", { "data-chview": "pins", hidden: true }, [el(".lb", {}, [`${data.pins.length} pinned messages in #${data.channel.name}`])]);
  for (const p of data.pins) {
    const bd = el(".bd2", {}, [
      el(".pinby", {}, [iconEl("pin"), `pinned by ${p.by}`]),
      byline(p.author, p.time), el(".tx", {}, [p.text]),
    ]);
    if (p.attach) bd.append(el(".filecard", { style: "max-width:360px" }, [el(".fbody", {}, [el(".fname", {}, [p.attach.name])])]));
    const unpin = el("button.unpin", { title: "Unpin", onClick: async (e) => {
      const row = e.currentTarget.closest(".pinrow");
      try { if (!isDemo()) await unpinMessage(p.id); row.remove(); toast({ message: "Unpinned" }); }
      catch (err) { toast({ message: err?.message || "Couldn’t unpin" }); }
    } }, [iconEl("x", "sm")]);
    panel.append(el(".pinrow", {}, [Avatar({ name: p.author.name, size: "sm" }), bd, unpin]));
  }
  return panel;
}

// ── Files panel (P4.4) ──────────────────────────────────────────────────────
function filesPanel(data) {
  const state = { query: "", type: "all", sort: "latest" };
  const TYPES = [["all", "All types"], ["image", "Images"], ["audio", "Audio"], ["video", "Video"], ["other", "Projects"]];
  const SORTS = [["latest", "Latest"], ["oldest", "Oldest"], ["name", "Name"]];

  const search = el(".field", {}, [iconEl("search", "sm"), el("input", { placeholder: `Search files in #${data.channel.name}`, onInput: (e) => { state.query = e.target.value; repaint(); } })]);
  const typeBtn = el("button.btn", { "aria-haspopup": "menu" }, [el("span.tl", {}, ["Type"]), iconEl("chev", "sm")]);
  typeBtn.addEventListener("click", () => openMenu(typeBtn, TYPES.map(([k, l]) => ({ label: l, selected: state.type === k, onClick: () => { state.type = k; typeBtn.querySelector(".tl").textContent = k === "all" ? "Type" : l; typeBtn.classList.toggle("on", k !== "all"); repaint(); } }))));
  const sortBtn = el("button.btn", { "aria-haspopup": "menu" }, [el("span.sl", {}, ["Latest"]), iconEl("chev", "sm")]);
  sortBtn.addEventListener("click", () => openMenu(sortBtn, SORTS.map(([k, l]) => ({ label: l, selected: state.sort === k, onClick: () => { state.sort = k; sortBtn.querySelector(".sl").textContent = l; repaint(); } }))));

  const bar = el(".chfilesbar", {}, [search, typeBtn, sortBtn]);
  const grid = el(".masonry.even");
  const count = el(".lb");

  function repaint() {
    const q = state.query.trim().toLowerCase();
    let files = (data.files || []);
    if (q) files = files.filter((f) => (f.name || "").toLowerCase().includes(q));
    if (state.type !== "all") files = files.filter((f) => (f.kind || "other") === state.type);
    files = files.slice().sort((a, b) => state.sort === "name"
      ? String(a.name || "").localeCompare(String(b.name || ""))
      : (state.sort === "oldest" ? 1 : -1) * (new Date(b.created_at || 0) - new Date(a.created_at || 0)));
    count.textContent = `${files.length} file${files.length === 1 ? "" : "s"} in #${data.channel.name}`;
    grid.replaceChildren();
    // shapeWork shape (B5): file_ext (not ext), who is {name,…} (not a string). A real image
    // renders from its R2 blob (mediaUrl); the demo's shot-class placeholder is the fallback.
    for (const f of files) {
      let media;
      const src = f.kind === "image" ? mediaUrl(f) : null;
      if (f.kind === "image" && src) media = el(".media", {}, [el("img", { src, alt: "", loading: "lazy", style: "aspect-ratio:3/2;object-fit:cover;width:100%" })]);
      else if (f.kind === "image") media = el(".media", {}, [el("div.shot" + (f.shot ? "." + f.shot : ""), { style: "aspect-ratio:3/2" })]);
      else media = el(".media." + (f.kind === "audio" ? "audio" : "file"), {}, [iconEl(KIND_ICON[f.kind] || "file"), el("span.ext", {}, [f.file_ext || ""])]);
      media.querySelector(".ext")?.previousElementSibling?.classList.add("fic");
      grid.append(el("button.card", { "data-open-details": true, onClick: () => openDetails(f, { serverId: data.server?.id, serverName: data.server?.name, siblings: files }) }, [media, el(".title", {}, [f.name]), el(".who", {}, [f.who?.name || ""])]));
    }
    if (!files.length) grid.append(el(".emptystate", {}, [iconEl("grid"), el("h3", {}, [q || state.type !== "all" ? "No matching files" : "No files yet"]), q || state.type !== "all" ? el("p", {}, ["Try a different filter."]) : null]));
  }
  repaint();
  return el(".chpanel", { "data-chview": "files", hidden: true }, [bar, count, grid]);
}

// ── members rail (P4.9) ─────────────────────────────────────────────────────
// The rail's shown/hidden state is a per-browser preference (persisted), so closing it stays
// closed across channel switches and reloads instead of reopening on every re-render.
const MEM_KEY = "eski:members-hidden";
function membersHidden() { try { return localStorage.getItem(MEM_KEY) === "1"; } catch { return false; } }
function setMembersHidden(v) { try { v ? localStorage.setItem(MEM_KEY, "1") : localStorage.removeItem(MEM_KEY); } catch {} }

function membersRail(data) {
  const rail = el("aside.mem", { id: "wsMem" });
  if (membersHidden()) rail.setAttribute("hidden", "");   // start collapsed if that's the saved choice
  for (const g of data.memberGroups) {
    const grp = el(".memg", {}, [el(".lb", {}, [`${g.label}, ${g.members.length}`])]);
    for (const p of g.members) {
      const off = p.presence === "offline";
      const av = Avatar({ name: p.name, size: "sm", src: avatarUrl(p.avatar_key) });
      av.append(el("span.pr" + (off ? ".off" : p.presence === "idle" ? ".idle" : p.presence === "dnd" ? ".dnd" : "")));
      const nm = el("span.u", {}, [p.name]); nm.style.color = `var(--m${p.colorIdx})`;
      const row = el(".mrow" + (off ? ".off" : ""), { "data-uid": p.id || null }, [av, el(".info", {}, [el(".nm", {}, [nm]), el(".doing", {}, [p.doing])])]);
      // admin click → moderation menu (Timeout / Kick / Ban — real admin RPCs, perm-gated
      // server-side; Manage roles needs the role list, still a marker). data.server.id is the
      // server; p.id the target. On kick/ban the row leaves the rail optimistically.
      if (data.isAdmin && p.name !== data.me.name && p.id) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => openMenu(row, [
          { header: p.name },
          { label: "Manage roles", icon: "user", onClick: () => openRolesModal(data, p) },
          { label: "Timeout", icon: "clock", onClick: () => timeoutMemberFlow(data, p) },
          { sep: true },
          { label: "Kick from server", icon: "leave", danger: true, onClick: () => confirmModerate(data, p, "kick") },
          { label: "Ban from server", icon: "leave", danger: true, onClick: () => confirmModerate(data, p, "ban") },
        ]));
      }
      grp.append(row);
    }
    rail.append(grp);
  }
  return rail;
}

// Timeout: pick a duration → timeout_member(until). Anchored to the member's row.
function timeoutMemberFlow(data, p) {
  const DUR = [["5 minutes", 5 * 60e3], ["1 hour", 60 * 60e3], ["1 day", 24 * 60 * 60e3], ["1 week", 7 * 24 * 60 * 60e3]];
  const anchor = document.querySelector(`.mrow[data-uid="${p.id}"]`) || document.body;
  openMenu(anchor, DUR.map(([label, ms]) => ({ label: `Time out ${label}`, icon: "clock", onClick: async () => {
    try { const until = new Date(Date.now() + ms).toISOString(); if (!isDemo()) await timeoutMember(data.server.id, p.id, until); toast({ message: `${p.name} timed out for ${label}`, icon: "clock" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t time out the member" }); }
  } })));
}

// Server notification settings (server_prefs) — notify level + suppress-@everyone → upsert.
// Reads the current prefs first (live), then opens the modal pre-filled.
async function notifSettingsFlow(data) {
  let level = "all", suppress = false;
  if (!isDemo()) { try { const cur = await loadServerPrefs(data.server.id); level = cur.level || "all"; suppress = !!cur.suppress_everyone; } catch {} }
  const LEVELS = [["all", "All messages"], ["mentions", "Only @mentions"], ["none", "Nothing"]];
  const levelBtn = el("button.selbtn", { style: "width:100%;justify-content:space-between", "aria-haspopup": "menu" }, [el("span", {}, [LEVELS.find(([v]) => v === level)[1]]), iconEl("chev", "sm")]);
  levelBtn.addEventListener("click", () => openMenu(levelBtn, LEVELS.map(([v, l]) => ({ label: l, onClick: () => { level = v; levelBtn.querySelector("span").textContent = l; } }))));
  const supCb = el("input", { type: "checkbox", "aria-label": "Suppress @everyone" }); supCb.checked = suppress;
  const save = Button({ label: "Save", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [
    el("label.ulab", {}, ["Notify me about"]), levelBtn,
    el("label.setrow2", { style: "display:flex;align-items:center;gap:10px;margin-top:14px;cursor:pointer;font-size:var(--fs-sm)" }, [supCb, el("span", {}, ["Suppress @everyone and @here"])]),
  ]);
  const { close } = openModal({ title: `${data.server.name} notifications`, body, footer: [cancel, save] });
  cancel.addEventListener("click", () => close());
  save.addEventListener("click", async () => {
    if (save.disabled) return; save.disabled = true;
    try { if (!isDemo()) await setServerPrefs(data.server.id, { level, suppress_everyone: supCb.checked }); close(); toast({ message: "Notification settings saved", icon: "check" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t save" }); save.disabled = false; }
  });
}

// Delete server (owner) — a type-to-confirm (type the exact name) → deleteServer → Feed. FK
// cascades wipe everything; irreversible, hence the name gate.
function deleteServerFlow(data) {
  const input = el("input", { placeholder: data.server.name, "aria-label": "Type the server name" });
  const del = Button({ label: "Delete server", variant: "danger", disabled: true });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  input.addEventListener("input", () => { del.disabled = input.value.trim() !== data.server.name; });
  const body = el("div", {}, [
    el("p", { style: "color:var(--soft);font-size:var(--fs-sm);line-height:1.5" }, [`This permanently deletes ${data.server.name} and everything in it — channels, files, and messages. It can't be undone.`]),
    el("label.ulab", {}, ["Type ", el("b", {}, [data.server.name]), " to confirm"]),
    el(".field", {}, [input]),
  ]);
  const { close } = openModal({ title: `Delete ${data.server.name}?`, body, footer: [cancel, del] });
  cancel.addEventListener("click", () => close());
  del.addEventListener("click", async () => {
    if (del.disabled) return; del.disabled = true;
    try { if (!isDemo()) await deleteServer(data.server.id); close(); if (isDemo()) toast({ message: "Server deleted" }); else navigate(withDemo("/")); }
    catch (e) { toast({ message: e?.message || "Couldn’t delete the server" }); del.disabled = false; }
  });
}

// Leave server — a confirm, then delete your own membership → back to the Feed. Owners are
// steered to Server settings (leaving would orphan a server they own).
function leaveServerFlow(data) {
  if (data.isOwner) { toast({ message: "You own this server — delete it from Server settings instead." }); return; }
  const go = Button({ label: "Leave", variant: "danger" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("p", { style: "color:var(--soft);font-size:var(--fs-sm);line-height:1.5" }, [`Leave ${data.server.name}? You'll need a fresh invite to rejoin.`]);
  const { close } = openModal({ title: `Leave ${data.server.name}?`, body, footer: [cancel, go] });
  cancel.addEventListener("click", () => close());
  go.addEventListener("click", async () => {
    if (go.disabled) return; go.disabled = true;
    try { if (!isDemo()) await leaveServer(data.server.id); close(); if (isDemo()) toast({ message: "Left the server" }); else navigate(withDemo("/")); }
    catch (e) { toast({ message: e?.message || "Couldn’t leave" }); go.disabled = false; }
  });
}

// The server header badge — its uploaded icon (square, radius via .srvicon) or the initials.
// A load error falls back to initials so the header is never blank.
function srvIconEl(server) {
  const span = el("span.srvicon");
  const url = avatarUrl(server.icon_key);
  if (url) {
    const im = el("img", { src: url, alt: server.name || "" });
    im.addEventListener("error", () => { span.replaceChildren(); span.textContent = server.initials; }, { once: true });
    span.append(im);
  } else span.textContent = server.initials;
  return span;
}

// Server settings (admin) — gallery Server-settings → Overview: the server name + a square icon
// and a wide cover, both R2 uploads (uploadBlobs → updateServer(icon_key/cover_key)). Only the
// changed keys are written. Demo previews the picked image locally (a blob URL), never R2. The
// rail + header repaint on the NEXT navigation (they read the cached bundle we mutate here).
function openServerSettings(data) {
  const demo = isDemo();
  const s = data.server;

  const iconPrev = el(".cv.icon", {}, [avatarUrl(s.icon_key) ? el("img", { src: avatarUrl(s.icon_key), alt: "" }) : document.createTextNode(s.initials)]);
  const coverPrev = el(".cv", {}, [avatarUrl(s.cover_key) ? el("img", { src: avatarUrl(s.cover_key), alt: "" }) : iconEl("image")]);

  const pick = (field, prev) => {
    const input = el("input", { type: "file", accept: "image/*", style: "display:none" });
    input.addEventListener("change", async () => {
      const file = input.files?.[0]; input.value = "";
      if (!file) return;
      try {
        let src;
        if (demo) src = URL.createObjectURL(file);
        else { const [{ key }] = await uploadBlobs([file]); await updateServer(s.id, { [field]: key }); s[field] = key; src = avatarUrl(key); }
        prev.replaceChildren(el("img", { src, alt: "" }));
        toast({ message: field === "icon_key" ? "Server icon updated" : "Server cover updated", icon: "check" });
      } catch (e) { toast({ message: e?.message || "Couldn’t upload the image" }); }
    });
    return input;
  };
  const iconInput = pick("icon_key", iconPrev);
  const coverInput = pick("cover_key", coverPrev);

  const nameI = el("input", { value: s.name || "", "aria-label": "Server name" });
  const body = el("div", {}, [
    el("label.ulab", {}, ["Server name"]), el(".field", {}, [nameI]),
    el(".frow", { style: "margin-top:12px" }, [el("label.ulab", {}, ["Server icon"]), el(".coverpick", {}, [
      iconPrev, iconInput, Button({ label: "Upload", size: "sm", icon: "image", onClick: () => iconInput.click() }),
    ])]),
    el(".frow", { style: "margin-top:12px" }, [el("label.ulab", {}, ["Cover"]), el(".coverpick", {}, [
      coverPrev, coverInput, Button({ label: "Upload", size: "sm", icon: "image", onClick: () => coverInput.click() }),
    ])]),
  ]);
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const save = Button({ label: "Save", variant: "primary" });
  const { close } = openModal({ title: "Server settings", body, footer: [cancel, save] });
  cancel.addEventListener("click", () => close());
  save.addEventListener("click", async () => {
    if (save.disabled) return; save.disabled = true;
    try {
      const patch = await updateServer(s.id, { name: nameI.value });
      Object.assign(s, patch, patch.name ? { initials: patch.name.trim().slice(0, 2).toUpperCase() } : {});
      close(); toast({ message: "Server settings saved", icon: "check" });
      // Repaint the shell so the renamed server shows on the rail badge + channel header
      // immediately, not after a manual reload.
      if (!isDemo()) reload();
    } catch (e) { toast({ message: e?.message || "Couldn’t save" }); save.disabled = false; }
  });
}

// Audit log (admin) — the moderation actions the kick/ban/timeout RPCs record, newest first.
// Read-only; a name gate isn't needed (audit_read fences it server-side). Each row reads
// "<actor> <verb> <target>" with an optional reason and the time.
const AUDIT_VERB = { ban: ["banned", "lock"], timeout: ["timed out", "clock"], kick: ["kicked", "leave"] };
async function openAuditLog(data) {
  const list = el(".auditlist", {}, [el(".sharenone", {}, ["Loading…"])]);
  const done = Button({ label: "Done", variant: "primary" });
  const { close } = openModal({ title: `${data.server.name} — audit log`, body: el("div", {}, [list]), footer: [done] });
  done.addEventListener("click", () => close());
  let rows = [];
  try { rows = await loadAuditLog(data.server.id); } catch (e) { list.replaceChildren(el(".sharenone", {}, [e?.message || "Couldn’t load the audit log"])); return; }
  list.replaceChildren(...(rows.length ? rows.map(auditRow) : [el(".sharenone", {}, ["No moderation actions yet."])]));
}
function auditRow(r) {
  const [verb, ic] = AUDIT_VERB[r.action] || [r.action, "flag"];
  return el(".arow", {}, [
    el(".aic", {}, [iconEl(ic, "sm")]),
    el(".abd", {}, [
      el("span.atx", { html: `<b>${escapeHtml(r.actor)}</b> ${verb}${r.target ? ` <b>${escapeHtml(r.target)}</b>` : ""}` }),
      r.reason ? el("span.asub", {}, [`“${r.reason}”`]) : null,
    ]),
    el("time.atime", {}, [r.time]),
  ]);
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Invite people (gallery #inviteModal) — create a link with an expiry + max-uses, copy it, and
// manage the active links (list + revoke). Every link is consumed by join_via_invite, which
// enforces the same expiry/uses server-side; revoke is a hard delete, so the code stops working.
const inviteUrl = (code) => `${location.origin}/join/${code}`;
const EXPIRY = [["7 days", 7], ["1 day", 1], ["30 days", 30], ["Never", null]];
const USES = [["No limit", null], ["1 use", 1], ["10 uses", 10], ["25 uses", 25]];

async function inviteFlow(data) {
  let invites = [];
  try { invites = await loadInvites(data.server.id); } catch { invites = []; }
  let expiresDays = 7, maxUses = null;

  // the active-links list — each row copies or revokes; empty until the first mint.
  const list = el(".sharelinks");
  const paintList = () => list.replaceChildren(...(invites.length
    ? invites.map(linkRow)
    : [el(".sharenone", {}, ["No active links yet — create one below."])]));
  function linkRow(inv) {
    const meta = [inv.expires_at ? `expires ${relDays(inv.expires_at)}` : "never expires",
                  inv.max_uses ? `${inv.uses}/${inv.max_uses} uses` : `${inv.uses} uses`].join(" · ");
    return el(".invitem", {}, [
      el(".sharerow2", {}, [
        el(".field", { style: "flex:1;min-width:0" }, [iconEl("link", "sm"), el("input", { readonly: true, value: inviteUrl(inv.code) })]),
        Button({ label: "Copy", size: "sm", icon: "copy", onClick: () => copyToClipboard(inviteUrl(inv.code), { ok: "Invite link copied" }) }),
        Button({ label: "Revoke", size: "sm", variant: "ghost", onClick: async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try { await revokeInvite(inv.code); invites = invites.filter((x) => x.code !== inv.code); paintList(); toast({ message: "Invite revoked" }); }
          catch (err) { btn.disabled = false; toast({ message: err?.message || "Couldn’t revoke the link" }); }
        } }),
      ]),
      el(".invmeta", {}, [meta]),
    ]);
  }

  // the two selectors (expiry + max uses) drive the NEXT link's settings.
  const expBtn = selectBtn(EXPIRY.find(([, v]) => v === expiresDays)[0], EXPIRY, (label, v) => { expiresDays = v; expBtn.querySelector("span").textContent = label; });
  const useBtn = selectBtn(USES.find(([, v]) => v === maxUses)[0], USES, (label, v) => { maxUses = v; useBtn.querySelector("span").textContent = label; });

  const create = Button({ label: "Create link", size: "sm", icon: "plus" });
  create.addEventListener("click", async () => {
    create.disabled = true;
    try {
      const code = await createInvite(data.server.id, { expiresDays, maxUses });
      const inv = isDemo()
        ? { code, expires_at: expiresDays ? new Date(Date.now() + expiresDays * 864e5).toISOString() : null, max_uses: maxUses, uses: 0, created_at: new Date().toISOString() }
        : (await loadInvites(data.server.id))[0];
      invites = [inv, ...invites.filter((x) => x.code !== inv.code)]; paintList();
      await copyToClipboard(inviteUrl(inv.code), { ok: "Invite link created and copied" });
    } catch (e) { toast({ message: e?.message || "Couldn’t create the invite" }); }
    finally { create.disabled = false; }
  });

  // ── invite a specific person: by @handle, or from suggested friends-not-in-server ──
  // Sends a targeted 'invite' notification carrying a single-use code (invite_user_to_server).
  const suggested = el(".shareppl");
  const noSuggest = el(".sharenone", { hidden: true }, ["No suggestions — invite by handle above."]);
  const invited = new Set();                 // ids invited this session, so a row can't double-send

  function personRow(p) {
    const btn = Button({ label: "Invite", size: "sm" });
    const row = el(".sharerow", {}, [
      Avatar({ name: p.name, size: "sm", src: avatarUrl(p.avatar_key) }),
      el("span.nm", {}, [el("b", {}, [p.name]), p.handle ? el("span.acc", {}, ["@" + p.handle]) : null]),
      btn,
    ]);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await inviteUserToServer(data.server.id, p.id);
        invited.add(p.id);
        row.replaceChild(el("span.invited", {}, [iconEl("check", "sm"), "Invited"]), btn);
        toast({ message: `Invited ${p.name}`, icon: "check" });
      } catch (e) { btn.disabled = false; toast({ message: e?.message || "Couldn’t send the invite" }); }
    });
    return row;
  }
  async function paintSuggested() {
    let people = [];
    try { people = await loadInviteCandidates(data.server.id); } catch { people = []; }
    people = people.filter((p) => !invited.has(p.id));
    suggested.replaceChildren(...people.map(personRow));
    noSuggest.hidden = people.length > 0;
  }

  const handleInput = el("input", { placeholder: "@handle", "aria-label": "Invite by handle" });
  const handleBtn = Button({ label: "Invite", size: "sm" });
  async function doHandleInvite() {
    const h = handleInput.value.trim();
    if (!h) return;
    handleBtn.disabled = true;
    try {
      const { person } = await inviteByHandle(data.server.id, h);
      if (person.id) invited.add(person.id);
      handleInput.value = "";
      toast({ message: `Invited ${person.name || h.replace(/^@/, "")}`, icon: "check" });
      paintSuggested();
    } catch (e) { toast({ message: e?.message || "Couldn’t send the invite" }); }
    finally { handleBtn.disabled = false; }
  }
  handleBtn.addEventListener("click", doHandleInvite);
  handleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doHandleInvite(); } });

  const body = el("div", {}, [
    el("label.ulab", {}, ["Active invite links"]), list,
    el(".urow", { style: "margin-top:12px;gap:8px" }, [
      el("div", { style: "flex:1" }, [el("label.ulab", {}, ["New link expires"]), expBtn]),
      el("div", { style: "flex:1" }, [el("label.ulab", {}, ["Max uses"]), useBtn]),
    ]),
    el(".invcreate", { style: "margin-top:12px" }, [create]),
    el("label.ulab", { style: "margin-top:18px" }, ["Or invite by handle"]),
    el(".field", {}, [iconEl("at", "sm"), handleInput, handleBtn]),
    suggested, noSuggest,
  ]);
  paintList();
  paintSuggested();
  const done = Button({ label: "Done", variant: "primary" });
  const { close } = openModal({ title: `Invite to ${data.server.name}`, body, footer: [done] });
  done.addEventListener("click", () => close());
}

// A full-width dropdown trigger (selbtn) that opens a menu of [label, value] and reports the pick.
function selectBtn(current, options, onPick) {
  const b = el("button.selbtn", { style: "width:100%;justify-content:space-between", "aria-haspopup": "menu" }, [el("span", {}, [current]), iconEl("chev", "sm")]);
  b.addEventListener("click", () => openMenu(b, options.map(([label, v]) => ({ label, onClick: () => onPick(label, v) }))));
  return b;
}

// "expires in N days" / "today" for an ISO timestamp — the invite list's human expiry.
function relDays(iso) {
  const d = Math.round((new Date(iso) - Date.now()) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "in 1 day" : `in ${d} days`;
}

// Channel settings (manage_channels): edit name / topic / slowmode / post-policy → updateChannel.
// Live navigates to refresh the header; demo just toasts (the demo channel set is fixed).
function openChannelSettings(data, ch) {
  const name = el("input", { value: ch.name || "", "aria-label": "Channel name" });
  const topic = el("input", { value: ch.topic || "", placeholder: "What's this channel about?", "aria-label": "Topic" });
  const SLOW = [[0, "Off"], [5, "5s"], [10, "10s"], [30, "30s"], [60, "1m"], [300, "5m"]];
  let slow = ch.slowmode || 0;
  const slowBtn = el("button.selbtn", { style: "width:100%;justify-content:space-between", "aria-haspopup": "menu" }, [el("span", {}, [SLOW.find(([s]) => s === slow)?.[1] || "Off"]), iconEl("chev", "sm")]);
  slowBtn.addEventListener("click", () => openMenu(slowBtn, SLOW.map(([s, l]) => ({ label: l, onClick: () => { slow = s; slowBtn.querySelector("span").textContent = l; } }))));
  let policy = ch.postPolicy || "everyone";
  const polBtn = el("button.selbtn", { style: "width:100%;justify-content:space-between", "aria-haspopup": "menu" }, [el("span", {}, [policy === "admins" ? "Admins only" : "Everyone"]), iconEl("chev", "sm")]);
  polBtn.addEventListener("click", () => openMenu(polBtn, [["everyone", "Everyone"], ["admins", "Admins only"]].map(([v, l]) => ({ label: l, onClick: () => { policy = v; polBtn.querySelector("span").textContent = l; } }))));

  const save = Button({ label: "Save channel", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [
    el("label.ulab", {}, ["Channel name"]), el(".field", {}, [el("span", { style: "color:var(--muted)" }, ["#"]), name]),
    el("label.ulab", {}, ["Topic ", el("span", { style: "font-weight:400;color:var(--muted)" }, ["optional"])]), el(".field", {}, [topic]),
    el("label.ulab", {}, ["Slow mode"]), slowBtn,
    el("label.ulab", {}, ["Who can post"]), polBtn,
    el("label.ulab", {}, ["Access"]),
    (() => { const b = el("button.selbtn", { style: "width:100%;justify-content:space-between", onClick: () => openChannelAccess(data.server.id, ch) }, [el("span", {}, ["Manage which roles can see this channel"]), iconEl("lock", "sm")]); return b; })(),
  ]);
  const { close } = openModal({ title: `#${ch.name} settings`, body, footer: [cancel, save] });
  cancel.addEventListener("click", () => close());
  save.addEventListener("click", async () => {
    if (save.disabled) return; save.disabled = true;
    try {
      await updateChannel(ch.id, { name: name.value, topic: topic.value.trim(), slowmode_sec: slow, post_policy: policy });
      close();
      if (isDemo()) toast({ message: "Channel updated", icon: "check" });
      else navigate(`/s/${data.server.id}/c/${ch.id}`);
    } catch (e) { toast({ message: e?.message || "Couldn’t update the channel" }); save.disabled = false; }
  });
}

// Create a text channel (manage_channels): a name modal → createChannel → navigate into it
// (demo just toasts, since its channel set is fixed).
function createChannelFlow(data, kind = "text") {
  const input = el("input", { placeholder: "new-channel", "aria-label": "Channel name" });
  const create = Button({ label: "Create channel", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [el("label.ulab", {}, ["Channel name"]), el(".field", {}, [el("span", { style: "color:var(--muted)" }, ["#"]), input])]);
  const { close } = openModal({ title: "New channel", body, footer: [cancel, create] });
  cancel.addEventListener("click", () => close());
  const submit = async () => {
    const name = input.value.trim();
    if (!name || create.disabled) return;
    create.disabled = true;
    try {
      const ch = await createChannel(data.server.id, name, kind);
      close();
      if (isDemo()) toast({ message: `#${ch.name} created`, icon: "check" });
      else navigate(`/s/${data.server.id}/c/${ch.id}`);
    } catch (e) { toast({ message: e?.message || "Couldn’t create the channel" }); create.disabled = false; }
  };
  create.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  input.focus();
}

// Manage roles: a checklist of the server's assignable (non-default) roles, pre-checked for
// the member's current ones → set_member_roles. Role swatches are SQUARE (--r) — round is
// avatars/dots only.
function openRolesModal(data, p) {
  const roles = data.serverRoles || [];
  const current = new Set(p.roleIds || []);
  const boxes = roles.map((r) => {
    const cb = el("input", { type: "checkbox", "aria-label": r.name }); cb.checked = current.has(r.id);
    return { r, cb, row: el("label.rolerow", {}, [cb, el("span.rsw", { style: `background:var(--m${r.color || 1})` }), el("span", {}, [r.name])]) };
  });
  const save = Button({ label: "Save roles", variant: "primary" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = roles.length
    ? el(".rolelist", {}, boxes.map((b) => b.row))
    : el("p", { style: "color:var(--muted);font-size:var(--fs-sm)" }, ["This server has no assignable roles yet."]);
  const { close } = openModal({ title: `Roles for ${p.name}`, body, footer: [cancel, save] });
  cancel.addEventListener("click", () => close());
  save.addEventListener("click", async () => {
    if (save.disabled) return; save.disabled = true;
    const ids = boxes.filter((b) => b.cb.checked).map((b) => b.r.id);
    try { if (!isDemo()) await setMemberRoles(data.server.id, p.id, ids); p.roleIds = ids; close(); toast({ message: "Roles updated", icon: "check" }); }
    catch (e) { toast({ message: e?.message || "Couldn’t update roles" }); save.disabled = false; }
  });
}

// Kick / Ban confirm (danger) → the admin RPC, then drop the member's row from the rail.
function confirmModerate(data, p, kind) {
  const isBan = kind === "ban";
  const reason = el("input", { placeholder: "e.g. spamming #beats", "aria-label": "Reason" });
  const go = Button({ label: isBan ? "Ban" : "Kick", variant: "danger" });
  const cancel = Button({ label: "Cancel", variant: "ghost" });
  const body = el("div", {}, [
    el("p", { style: "color:var(--soft);font-size:var(--fs-sm);line-height:1.5;margin:2px 0 4px" }, [isBan
      ? `This removes ${p.name} from ${data.server.name} and blocks their account from rejoining on any invite link.`
      : `This removes ${p.name} from ${data.server.name}. They can rejoin on a fresh invite.`]),
    el("label.ulab", {}, ["Reason ", el("span", { style: "font-weight:400;color:var(--muted)" }, ["saved to the audit log"])]),
    el(".field", {}, [reason]),
  ]);
  const { close } = openModal({ title: `${isBan ? "Ban" : "Kick"} ${p.name}?`, body, footer: [cancel, go] });
  cancel.addEventListener("click", () => close());
  go.addEventListener("click", async () => {
    if (go.disabled) return; go.disabled = true;
    try {
      if (!isDemo()) { isBan ? await banMember(data.server.id, p.id, reason.value.trim()) : await kickMember(data.server.id, p.id); }
      document.querySelector(`.mrow[data-uid="${p.id}"]`)?.remove();
      close();
      toast({ message: isBan ? `${p.name} banned` : `${p.name} removed`, icon: "check" });
    } catch (e) { toast({ message: e?.message || "Couldn’t complete the action" }); go.disabled = false; }
  });
}

// ── thread pane (P4.8) ──────────────────────────────────────────────────────
// t = { parent, replies[], channel?/channelId }. onReply(body, alsoToChannel) is
// set live (the Realtime echo appends the reply); demo appends locally.
function threadPane(t, me, { onClose, onReply, channelName } = {}) {
  const chName = channelName || t.channel || "";
  const body = el(".tpbody", {}, [
    el(".msg", {}, [Avatar({ name: t.parent.author.name, size: "sm" }), el(".bd", {}, [byline(t.parent.author, t.parent.time), renderBody(t.parent), t.parent.attach ? fileCard(t.parent.attach) : null])]),
    el(".tpdiv", {}, [`${t.replies.length} replies`]),
    ...t.replies.map((r) => el(".msg", { "data-mid": r.id || null }, [Avatar({ name: r.author.name, size: "sm" }), el(".bd", {}, [byline(r.author, r.time), renderBody(r)])])),
  ]);

  const also = el("label.alsosend", {}, [el("span.cbx", {}, [iconEl("check")]), "Also send to #" + chName]);
  also.addEventListener("click", (e) => { e.preventDefault(); also.classList.toggle("on"); });
  const input = el("input", { placeholder: "Reply in thread" });
  const send = el("button.snd", { title: "Send" }, [iconEl("send", "sm")]);
  const post = async () => {
    const text = input.value.trim(); if (!text) return;
    input.value = "";
    if (onReply) { const { error } = await onReply(text, also.classList.contains("on")) || {}; if (error) { input.value = text; toast({ message: "Couldn't reply — " + error.message }); } }
    else { body.append(el(".msg", {}, [Avatar({ name: me.name, size: "sm" }), el(".bd", {}, [byline(me, "now"), el(".tx", {}, [text])])])); body.scrollTop = body.scrollHeight; }
  };
  send.addEventListener("click", post);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); post(); } });

  const composer = el(".composer", {}, [
    el(".field", {}, [IconButton({ icon: "clip", title: "Attach" }), input, send]),
    also,
  ]);
  composer.querySelector(".iconbtn").style.cssText = "width:26px;height:26px";

  const close = el("button.iconbtn", { id: "threadClose", title: "Close thread", onClick: onClose }, [iconEl("x", "sm")]);
  const hd = el(".tphd", {}, [el("span.lbl", {}, [iconEl("reply", "sm"), "Thread", el("span.sub", {}, ["#" + chName])]), close]);
  return el("aside.threadpane", { id: "threadPane", "data-parent": t.parent.id || "demo" }, [hd, body, composer]);
}

// ── main pane (P4.4 + P4.5) ─────────────────────────────────────────────────
function mainPane(data, view, ctx) {
  const main = el("main.main");

  // reconnecting banner (Realtime dropped)
  main.append(el(".offlinebar", { id: "offlineBar", hidden: !view.reconnecting }, [el("span.odot"), "Connection lost, reconnecting…"]));

  // channel header
  const memToggle = IconButton({ icon: "users", title: "Toggle members" });
  memToggle.setAttribute("aria-pressed", String(!membersHidden()));   // reflect the saved choice
  memToggle.addEventListener("click", () => {
    const mem = main.closest(".screen").querySelector(".mem");
    const nowHidden = !mem.hasAttribute("hidden");
    mem.toggleAttribute("hidden", nowHidden);
    memToggle.setAttribute("aria-pressed", String(!nowHidden));
    setMembersHidden(nowHidden);   // persist so it stays closed across channel switches / reloads
  });
  const hd = el(".mainhd", {}, [
    iconEl("hash"), el("span.t", {}, [data.channel.name]),
    el("span.sub", {}, [data.channel.topic]),
    el(".acts", {}, [
      IconButton({ icon: "phone", title: "Voice, in progress", onClick: () => toast({ message: "Voice ships in v2" }) }),
      IconButton({ icon: "video", title: "Video, in progress", onClick: () => toast({ message: "Video ships in v2" }) }),
      IconButton({ icon: "bell", title: "Notifications", onClick: () => navigate("/notifications") }),
      IconButton({ icon: "search", title: "Search", onClick: () => navigate("/search") }),
      memToggle,
    ]),
  ]);

  // channel tabs (Messages / Pins / Files)
  const tabs = el(".chtabs", {}, [
    chtab("messages", "hash", "Messages", null, true),
    chtab("pins", "pin", "Pins", data.channel.pins),
    chtab("files", "grid", "Files", data.channel.files),
  ]);

  // Messages view: stream + typing + composer
  const stream = el(".stream", { id: "chMessages" });
  if (view.loading) {
    for (let i = 0; i < 5; i++) stream.append(el(".skelmsg", {}, [el(".skel.sk-av"), el(".sk-bd", {}, [el(".skel.sk-line", { style: "width:30%" }), el(".skel.sk-line", { style: "width:70%" }), el(".skel.sk-line", { style: "width:52%" })])]));
  } else if (!data.messages.length) {
    stream.append(el(".emptystate", {}, [iconEl("hash"), el("h3", {}, ["This is the start of #" + data.channel.name]), el("p", {}, ["No messages yet. Say hello, or drop the first file — everything shared here shows up in the Files tab."])]));
  } else {
    stream.append(el(".day", {}, [el("span", {}, ["Today"])]));
    for (const msg of data.messages) stream.append(messageRow(msg, data, { onOpenThread: ctx.openThread }));
  }

  const typing = el(".typing", { hidden: !data.typing?.length }, data.typing?.length ? [el("span.dots", {}, [el("i"), el("i"), el("i")]), `${data.typing.join(", ")} is typing`] : []);

  main.append(hd, tabs, stream, typing, composer(data, view, ctx), pinsPanel(data), filesPanel(data));

  // tab switching
  tabs.querySelectorAll(".chtab").forEach((tb) => tb.addEventListener("click", () => switchTab(main, tb.dataset.chtab)));
  if (view.tab && view.tab !== "messages") switchTab(main, view.tab);
  return main;
}
function chtab(id, ic, label, count, on) {
  const t = el("button.chtab" + (on ? ".on" : ""), { "data-chtab": id }, [iconEl(ic, "sm"), label]);
  if (count != null) t.append(el("span.n", {}, [String(count)]));
  return t;
}
function switchTab(main, name) {
  main.querySelectorAll(".chtab").forEach((t) => t.classList.toggle("on", t.dataset.chtab === name));
  const msgs = name === "messages";
  main.querySelector(".stream").hidden = !msgs;
  main.querySelector(".typing").hidden = !msgs || !main.querySelector(".typing").childNodes.length;
  main.querySelector(".composer").hidden = !msgs;
  main.querySelectorAll(".chpanel").forEach((p) => (p.hidden = p.dataset.chview !== name));
}

// Highlight the message a permalink points at. RAF defers to after the screen is mounted in
// #stage (scrollIntoView needs it in the DOM); the .flash class runs a one-shot background
// pulse (shell.css) that we then strip so a re-flash on the next arrival re-triggers.
function flashMessage(screen, mid) {
  requestAnimationFrame(() => {
    const node = screen.querySelector(`.msg[data-mid="${CSS.escape(mid)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "center" });
    node.classList.add("flash");
    setTimeout(() => node.classList.remove("flash"), 1700);
  });
}

// ── the screen ──────────────────────────────────────────────────────────────
export function renderWorkspace(data, view = {}) {
  const screen = el(".screen", { "data-screen": "workspace" });

  // empty server: no channels yet (admin gets a create CTA)
  if (!data.channelGroups.length || !data.channel) {
    screen.append(
      channelColumnEmpty(data),
      el("main.main", {}, [el(".emptystate", {}, [
        iconEl("hash"),
        el("h3", {}, [data.server ? "No channels yet" : "Pick a server"]),
        el("p", {}, [data.server ? (data.isAdmin ? "Create the first channel to start the conversation." : "An admin hasn't set up any channels here yet.") : "Choose a server from the rail, or create one, to start collaborating."]),
        data.server && data.isAdmin ? btnPrimary("Create channel", "plus", () => createChannelFlow(data, "text")) : null,
      ])]),
    );
    return screen;
  }

  const ctx = { live: !!data.live, channelId: data.activeChannelId, serverId: data.activeServerId, me: data.me, membersById: data.membersById || {} };
  const chan = channelColumn(data, view);
  const main = mainPane(data, view, ctx);
  const mem = membersRail(data);
  screen.append(chan, main, mem);
  // Drag files onto the channel → upload sheet targeting this server + channel (live only).
  if (ctx.live) enableDropUpload(main, () => ({ visibility: "server", serverId: ctx.serverId, channelId: ctx.channelId, onDone: () => reload() }));

  // arrived via a message permalink (?m=<id>) → once mounted, scroll to it and pulse it.
  if (view.focusMsg) flashMessage(screen, view.focusMsg);

  // thread open/close: opening hides the members rail, shows the thread pane. Live
  // loads the real thread (parent + replies) for the clicked message; demo uses
  // the fixture. A live reply is a parent_id insert — the Realtime echo appends it.
  ctx.openThread = async (msg) => {
    if (screen.querySelector(".threadpane")) return;
    let t = data.thread;
    if (ctx.live) { if (!msg?.id) return; t = await loadThread(msg.id, ctx.membersById); if (!t) return; }
    if (!t) return;
    mem.setAttribute("hidden", "");
    const onReply = ctx.live ? (body, also) => sendMessage(t.channelId, body, { parentId: t.parent.id, alsoToChannel: also }) : null;
    screen.append(threadPane(t, data.me, { onClose: () => { screen.querySelector(".threadpane")?.remove(); mem.removeAttribute("hidden"); }, onReply, channelName: data.channel?.name }));
  };
  if (view.thread && data.thread) ctx.openThread({ id: data.thread.parent?.id || null });

  if (ctx.live && data.channel) attachLive(screen, data, ctx);
  return screen;
}

// ── live wiring (P4.10 messages/typing/read · P4.11 presence) ────────────────
function attachLive(screen, data, ctx) {
  markRead(ctx.channelId);

  subscribeChannelMessages(ctx.channelId, {
    onInsert: (row) => liveInsert(screen, data, ctx, row),
    onUpdate: (row) => liveUpdate(screen, ctx, row),
    onDelete: (old) => screen.querySelector(`.msg[data-mid="${old.id}"]`)?.remove(),
  });

  // live reactions: another member's react refreshes that message's chips (mine are already
  // optimistic). Table is unfiltered (no channel_id), so act only on messages on screen.
  subscribeChannelReactions(async (row) => {
    if (!row || row.user_id === ctx.me.id) return;
    const node = screen.querySelector(`.msg[data-mid="${CSS.escape(row.message_id)}"]`);
    if (!node || !node._rx) return;
    try { node._rx.apply(await loadMessageReactions(row.message_id)); } catch { /* transient */ }
  });

  let typingTimer;
  subscribeTyping(ctx.channelId, (payload) => {
    if (!payload?.user || payload.user.id === ctx.me.id) return;
    const typing = screen.querySelector(".typing");
    if (!typing) return;
    typing.replaceChildren(el("span.dots", {}, [el("i"), el("i"), el("i")]), document.createTextNode(`${payload.user.name} is typing`));
    typing.hidden = false;
    clearTimeout(typingTimer); typingTimer = setTimeout(() => { typing.hidden = true; }, 3500);
  });

  const doing = ctx.membersById[ctx.me.id]?.doing || "";
  subscribeServerPresence(ctx.serverId, { id: ctx.me.id, name: ctx.me.name, presence: "online", doing }, (state) => livePresence(screen, state));
}

function liveInsert(screen, data, ctx, row) {
  if (row.parent_id) {                              // a thread reply
    const parent = screen.querySelector(`.msg[data-mid="${row.parent_id}"]`);
    if (parent) bumpReplies(parent, ctx);
    const tp = screen.querySelector(".threadpane");
    if (tp && tp.dataset.parent === row.parent_id) {
      const tpbody = tp.querySelector(".tpbody"), shaped = shapeMessage(row, ctx.membersById);
      tpbody.append(el(".msg", { "data-mid": row.id }, [Avatar({ name: shaped.author.name, size: "sm" }), el(".bd", {}, [byline(shaped.author, shaped.time), renderBody(shaped)])]));
      tpbody.scrollTop = tpbody.scrollHeight;
    }
    return;
  }
  const stream = screen.querySelector(".stream");
  if (!stream || stream.querySelector(`.msg[data-mid="${row.id}"]`)) return;   // dedupe our own echo
  stream.querySelector(".emptystate")?.remove();
  if (!stream.querySelector(".day")) stream.append(el(".day", {}, [el("span", {}, ["Today"])]));
  const shaped = shapeMessage(row, ctx.membersById);
  const node = messageRow(shaped, data, { onOpenThread: ctx.openThread });
  stream.append(node);
  stream.scrollTop = stream.scrollHeight;
  if (row.user_id !== ctx.me.id) markRead(ctx.channelId);   // seen while viewing → stay read
  // B5: a channel-upload message carries only work_id live — resolve the work and slot its
  // attachment card in once it arrives (the message renders immediately; the card fills in).
  if (row.work_id) {
    const cName = {}; for (const g of (data.channelGroups || [])) for (const c of (g.channels || [])) cName[c.id] = c.name;
    fetchChannelAttachment(row.work_id, ctx.membersById, cName).then((att) => {
      if (!att || !node.isConnected) return;
      const bd = node.querySelector(".bd"); if (!bd) return;
      const card = fileCard(att);
      const anchor = bd.querySelector(".reactbar, .reply");   // sit above reactions/replies
      anchor ? bd.insertBefore(card, anchor) : bd.append(card);
    }).catch(() => {});
  }
}

function bumpReplies(parent, ctx) {
  let reply = parent.querySelector(".reply");
  if (reply) { const n = (parseInt(reply.textContent, 10) || 0) + 1; reply.replaceChildren(iconEl("reply", "sm"), document.createTextNode(`${n} replies`)); }
  else { const mid = parent.dataset.mid; reply = el(".reply", { onClick: () => ctx.openThread({ id: mid }) }, [iconEl("reply", "sm"), "1 reply"]); parent.querySelector(".bd").append(reply); }
}

function liveUpdate(screen, ctx, row) {
  const node = screen.querySelector(`.msg[data-mid="${row.id}"]`);
  if (!node) return;
  if (row.deleted_at) { node.remove(); return; }
  const bd = node.querySelector(".bd"), oldTx = bd.querySelector(".tx"), newTx = renderBody(shapeMessage(row, ctx.membersById));
  if (oldTx) oldTx.replaceWith(newTx); else bd.append(newTx);
}

function livePresence(screen, state) {
  const present = new Set(Object.keys(state || {}));
  screen.querySelectorAll(".mrow[data-uid]").forEach((row) => {
    const on = present.has(row.dataset.uid);
    row.classList.toggle("off", !on);
    const dot = row.querySelector(".pr"); if (dot) dot.classList.toggle("off", !on);
    const meta = state[row.dataset.uid]?.[0];
    if (on && meta?.doing) { const d = row.querySelector(".doing"); if (d) d.textContent = meta.doing; }
  });
}

// a bare channel column for the empty-server state (no channel rows)
function channelColumnEmpty(data) {
  const bar = el("button.srvbar", { "aria-haspopup": "menu" }, [el("span.srvicon", {}, [data.server?.initials || "?"]), el("b", {}, [data.server?.name || "eski"]), iconEl("chev", "sm")]);
  bar.querySelector(".ic")?.classList.add("srvchev");
  return el("nav.chan", {}, [el(".srvhd", {}, [el(".srvcover"), bar]), el(".chanbody")]);
}

function btnPrimary(label, ic, onClick) {
  const b = el("button.btn.primary", { onClick }); b.append(iconEl(ic, "sm")); b.append(document.createTextNode(label)); return b;
}
