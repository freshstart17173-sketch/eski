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

import { el, Avatar, IconButton, openMenu, closeMenus, toast } from "../ui.js";
import { iconEl } from "../icons.js";
import { navigate } from "../router.js";
import { isDemo, shapeMessage, loadThread } from "../data.js";
import { subscribeChannelMessages, subscribeTyping, sendTyping, subscribeServerPresence, markRead, sendMessage } from "../realtime.js";

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
  const inner = el("button.filecard", { "data-open-details": true, onClick: (e) => { e.stopPropagation(); openDetails(a); } });
  inner.append(el(".fcwave", {}, [iconEl(KIND_ICON[a.kind] || "file", "sm"), a.ext ? el("span.ext", {}, [a.ext]) : null]));
  const body = el(".fbody", {}, [el(".fname", {}, [a.name])]);
  if (a.size) body.append(el("div", { style: "font-size:11px;color:var(--muted);margin-top:3px" }, [`${a.size} · ${a.ext || ""}`.trim()]));
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

// Details pane is P5.7 — until then, acknowledge the intent so the click isn't dead.
function openDetails(a) { toast({ message: `Details: ${a.name} (viewer lands in P5)`, icon: "file" }); }

// ── message row (P4.5) ──────────────────────────────────────────────────────
function messageRow(msg, data, { onOpenThread } = {}) {
  if (msg.newDivider) return el(".newdiv", {}, [el("span", {}, ["New messages"])]);

  const own = msg.author.name === data.me.name;
  const acts = el(".hoveracts", {}, [
    IconButton({ icon: "smile", title: "React", onClick: () => toast({ message: "Reaction added" }) }),
    IconButton({ icon: "reply", title: "Reply", onClick: () => onOpenThread?.(msg) }),
    IconButton({ icon: "more", title: "More", onClick: (e) => openMsgMenu(e.currentTarget, msg, own) }),
  ]);

  const bd = el(".bd", {}, [byline(msg.author, msg.time)]);
  if (msg.forward) bd.append(el(".tx", { style: "color:var(--muted);font-size:var(--fs-xs)", html: `forwarded from <b style="color:var(--soft)">#${msg.forward.fromChannel}</b>` }), forwardBlock(msg.forward));
  if (msg.body) bd.append(renderBody(msg));
  if (msg.attach) bd.append(fileCard(msg.attach));
  if (msg.clump) bd.append(fileClump(msg.clump, msg.clumpMore));
  if (msg.reactions?.length) bd.append(el(".reactions", {}, msg.reactions.map((r) => el("span.react", { onClick: () => toast({ message: "Reaction toggled" }) }, [`${r.emoji}`, el("span.n", {}, [String(r.n)])]))));
  if (msg.replies) bd.append(el(".reply", { onClick: () => onOpenThread?.(msg) }, [iconEl("reply", "sm"), `${msg.replies} replies`]));

  return el(".msg", { "data-mid": msg.id }, [acts, Avatar({ name: msg.author.name, size: "sm" }), bd]);
}

// the ⋯ menu: own message adds Edit/Delete; everyone gets Pin + Copy link
function openMsgMenu(anchor, msg, own) {
  const items = [];
  if (own) items.push({ label: "Edit message", icon: "pen", onClick: () => toast({ message: "Edit (P4.10)" }) });
  items.push({ label: "Pin to channel", icon: "pin", onClick: () => toast({ message: "Pinned" }) });
  items.push({ label: "Copy link", icon: "link", onClick: () => toast({ message: "Link copied" }) });
  if (own) { items.push({ sep: true }); items.push({ label: "Delete message", icon: "trash", danger: true, onClick: () => toast({ message: "Deleted" }) }); }
  openMenu(anchor, items);
}

// ── channel column (P4.3) ───────────────────────────────────────────────────
function channelColumn(data, view) {
  const activeId = view.channelId || data.channel?.id;

  // server header — the bar opens the server menu (admin sees Settings)
  const bar = el("button.srvbar", { "aria-haspopup": "menu", "aria-expanded": "false", title: "Server menu" }, [
    el("span.srvicon", {}, [data.server.initials]), el("b", {}, [data.server.name]), iconEl("chev", "sm"),
  ]);
  bar.querySelector(".ic")?.classList.add("srvchev");
  bar.addEventListener("click", () => {
    const items = [];
    if (data.isAdmin) items.push({ label: "Server settings", icon: "settings", onClick: () => navigate(`/s/${data.server.id}/settings`) });
    items.push({ label: "Invite people", icon: "plus", onClick: () => toast({ message: "Invite link copied" }) });
    items.push({ label: "Notification settings", icon: "bell", onClick: () => toast({ message: "Notifications (P8)" }) });
    items.push({ sep: true });
    items.push({ label: "Leave server", icon: "leave", danger: true, onClick: () => toast({ message: "Left server" }) });
    openMenu(bar, items);
  });
  const srvhd = el(".srvhd", {}, [el(".srvcover"), bar]);

  const body = el(".chanbody");
  // Files is a channel entry → opens the File explorer
  body.append(el(".cgroup", {}, [
    el("button.crow", { onClick: () => navigate(withDemo(`/s/${data.server.id}/files`)) }, [iconEl("folder"), el("span.nm", {}, ["Files"])]),
  ]));

  for (const g of data.channelGroups) {
    const label = el(".cglabel", {}, [
      el("button.cgtoggle", { "aria-expanded": "true", onClick: (e) => e.currentTarget.closest(".cgroup").classList.toggle("collapsed") }, [iconEl("chev", "sm"), g.label]),
    ]);
    label.querySelector(".cgtoggle .ic")?.classList.add("cgcaret");
    if (data.isAdmin) {
      const add = el("button.cgadd", { title: g.kind === "voice" ? "Create voice channel" : "Create channel", onClick: () => toast({ message: "Create channel (P8)" }) }, [iconEl("plus", "sm")]);
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
      if (data.isAdmin) row.append(el("span.cgear", { title: "Edit channel", onClick: (e) => { e.stopPropagation(); toast({ message: "Channel settings (P8)" }); } }, [iconEl("settings", "sm")]));
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

  // voice minibar (WIP placeholder — voice ships v2)
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
    IconButton({ icon: "clip", title: "Attach files", onClick: () => toast({ message: "Attach (P5 upload)" }) }),
    input, iconEl("at", "sm"), send,
  ]);
  field.querySelector(".iconbtn").style.cssText = "width:26px;height:26px";

  const bar = el(".cbar", {}, [
    fbtn("B", "Bold", () => wrapSel(input, "**", "**"), "font-weight:700"),
    fbtn("I", "Italic", () => wrapSel(input, "*", "*"), "font-style:italic"),
    fbtn("S", "Strikethrough", () => wrapSel(input, "~~", "~~"), "text-decoration:line-through"),
    fbtn("</>", "Code", () => wrapSel(input, "`", "`"), "font-family:monospace;font-size:12px"),
    fbtnIcon("link", "Link", () => wrapSel(input, "[", "](url)")),
    el("span.sep"),
    fbtn("•", "Bulleted list", () => prefixLine(input, "- ")),
    fbtn("”", "Quote", () => prefixLine(input, "> "), "font-weight:700"),
    fbtnIcon("smile", "Emoji", (e) => openEmoji(e.currentTarget, input)),
    el("span.slash", { html: 'type <b>/</b> for commands' }),
  ]);

  const wrap = el(".composer" + (disabled ? ".disabled" : ""), {}, [note, el(".richcomposer", {}, [bar, field])]);
  return wrap;
}
function fbtn(label, title, onClick, css) {
  const b = el("button.fbtn", { title, onClick: (e) => onClick(e) }, [label]);
  if (css) b.style.cssText = css;
  return b;
}
function fbtnIcon(ic, title, onClick) { const b = el("button.fbtn", { title, onClick: (e) => onClick(e) }, [iconEl(ic, "sm")]); return b; }
function wrapSel(input, before, after) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
  const v = input.value;
  input.value = v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e);
  input.focus(); input.selectionStart = s + before.length; input.selectionEnd = e + before.length;
  input.dispatchEvent(new Event("input"));
}
function prefixLine(input, prefix) {
  const s = input.selectionStart ?? input.value.length;
  const lineStart = input.value.lastIndexOf("\n", s - 1) + 1;
  input.value = input.value.slice(0, lineStart) + prefix + input.value.slice(lineStart);
  input.focus(); input.dispatchEvent(new Event("input"));
}
function openEmoji(anchor, input) {
  // emoji-mart is the real picker (P4.6 stack); a small set stands in for now.
  openMenu(anchor, ["🔥", "👀", "🥁", "🎧", "✅", "🙌"].map((e) => ({ label: e, onClick: () => { input.value += e; input.focus(); input.dispatchEvent(new Event("input")); } })));
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
    const unpin = el("button.unpin", { title: "Unpin", onClick: (e) => { e.currentTarget.closest(".pinrow").remove(); toast({ message: "Unpinned" }); } }, [iconEl("x", "sm")]);
    panel.append(el(".pinrow", {}, [Avatar({ name: p.author.name, size: "sm" }), bd, unpin]));
  }
  return panel;
}

// ── Files panel (P4.4) ──────────────────────────────────────────────────────
function filesPanel(data) {
  const bar = el(".chfilesbar", {}, [
    (() => { const f = el(".field", {}, [iconEl("search", "sm"), el("input", { placeholder: `Search files in #${data.channel.name}` })]); return f; })(),
    el("button.btn", { onClick: (e) => openMenu(e.currentTarget, [{ label: "All types" }, { label: "Audio" }, { label: "Images" }, { label: "Projects" }]) }, ["Type", iconEl("chev", "sm")]),
    el("button.btn", { onClick: (e) => openMenu(e.currentTarget, [{ label: "Latest" }, { label: "Oldest" }, { label: "Name" }]) }, ["Latest", iconEl("chev", "sm")]),
  ]);
  const grid = el(".masonry.even");
  for (const f of data.files) {
    let media;
    if (f.kind === "image") media = el(".media", {}, [el("div.shot" + (f.shot ? "." + f.shot : ""), { style: "aspect-ratio:3/2" })]);
    else media = el(".media." + (f.kind === "audio" ? "audio" : "file"), {}, [iconEl(KIND_ICON[f.kind] || "file"), el("span.ext", {}, [f.ext])]);
    media.querySelector(".ext")?.previousElementSibling?.classList.add("fic");
    grid.append(el("button.card", { "data-open-details": true, onClick: () => openDetails(f) }, [media, el(".title", {}, [f.name]), el(".who", {}, [f.who])]));
  }
  return el(".chpanel", { "data-chview": "files", hidden: true }, [bar, el(".lb", {}, [`${data.channel.files} files in #${data.channel.name}`]), grid]);
}

// ── members rail (P4.9) ─────────────────────────────────────────────────────
function membersRail(data) {
  const rail = el("aside.mem", { id: "wsMem" });
  for (const g of data.memberGroups) {
    const grp = el(".memg", {}, [el(".lb", {}, [`${g.label}, ${g.members.length}`])]);
    for (const p of g.members) {
      const off = p.presence === "offline";
      const av = Avatar({ name: p.name, size: "sm" });
      av.append(el("span.pr" + (off ? ".off" : p.presence === "idle" ? ".idle" : p.presence === "dnd" ? ".dnd" : "")));
      const nm = el("span.u", {}, [p.name]); nm.style.color = `var(--m${p.colorIdx})`;
      const row = el(".mrow" + (off ? ".off" : ""), { "data-uid": p.id || null }, [av, el(".info", {}, [el(".nm", {}, [nm]), el(".doing", {}, [p.doing])])]);
      // admin hover → manage (role toggle P8.5, timeout, kick)
      if (data.isAdmin && p.name !== data.me.name) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => openMenu(row, [
          { header: p.name },
          { label: "Manage roles", icon: "user", onClick: () => toast({ message: "Roles (P8.5)" }) },
          { label: "Timeout", icon: "clock", onClick: () => toast({ message: "Timed out" }) },
          { sep: true },
          { label: "Kick from server", icon: "leave", danger: true, onClick: () => toast({ message: "Kicked" }) },
        ]));
      }
      grp.append(row);
    }
    rail.append(grp);
  }
  return rail;
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
  memToggle.setAttribute("aria-pressed", "true");
  memToggle.addEventListener("click", () => {
    const mem = main.closest(".screen").querySelector(".mem");
    const hidden = mem.hasAttribute("hidden");
    mem.toggleAttribute("hidden", !hidden);
    memToggle.setAttribute("aria-pressed", String(hidden));
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
        data.server && data.isAdmin ? btnPrimary("Create channel", "plus", () => toast({ message: "Create channel (P8)" })) : null,
      ])]),
    );
    return screen;
  }

  const ctx = { live: !!data.live, channelId: data.activeChannelId, serverId: data.activeServerId, me: data.me, membersById: data.membersById || {} };
  const chan = channelColumn(data, view);
  const main = mainPane(data, view, ctx);
  const mem = membersRail(data);
  screen.append(chan, main, mem);

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
  stream.append(messageRow(shapeMessage(row, ctx.membersById), data, { onOpenThread: ctx.openThread }));
  stream.scrollTop = stream.scrollHeight;
  if (row.user_id !== ctx.me.id) markRead(ctx.channelId);   // seen while viewing → stay read
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
