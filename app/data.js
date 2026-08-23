// data.js — the workspace data layer. One function shapes everything the
// workspace screen renders, so the screen never talks to Supabase directly and
// the same shape drives the demo, the live, and the empty renders.
//
// Three sources, one shape:
//  - `?demo=1`   → the Late Bloom LP fixture (demo.js), matching the gallery.
//  - signed in   → LIVE reads from Supabase (P4.10). Realtime patching lives in
//                  realtime.js + workspace.js; this module does the initial reads.
//  - signed out  → { needsAuth:true } so the shell shows a sign-in prompt.

import { demoWorkspace } from "./demo.js";
import { supabase } from "./supabase.js";
import { session } from "./supabase.js";

export function isDemo() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

// ── shared shapers (also used by realtime.js for live-inserted rows) ─────────
export function initials(name = "") { return name.trim().slice(0, 2).toUpperCase() || "?"; }
export function fmtTime(ts) {
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
// a raw messages row → the shape messageRow() renders. `members` is a byId map
// {user_id → {name, colorIdx}}; mentions get their hue by matching @name.
export function shapeMessage(row, members) {
  const a = members[row.user_id] || { name: "unknown", colorIdx: 1 };
  const body = row.body || "";
  const mentions = Object.values(members).filter((m) => body.includes("@" + m.name)).map((m) => ({ name: m.name, colorIdx: m.colorIdx }));
  return {
    id: row.id,
    author: { name: a.name, initials: initials(a.name), colorIdx: a.colorIdx },
    time: fmtTime(row.created_at),
    body, edited: !!row.edited_at, mentions,
    reactions: [], replies: 0,
  };
}

// ── the empty / signed-out shapes ───────────────────────────────────────────
function emptyWorkspace(serverId, channelId, needsAuth) {
  const user = session();
  const name = user?.email?.split("@")[0] || "you";
  return {
    needsAuth: !!needsAuth, live: false,
    me: { id: user?.id || null, name, initials: initials(name), handle: name, colorIdx: 1 },
    isAdmin: false, servers: [], dmUnread: 0,
    server: serverId ? { id: serverId, name: "", initials: "" } : null,
    channelGroups: [],
    channel: channelId ? { id: channelId, name: "", topic: "", pins: 0, files: 0 } : null,
    messages: [], typing: [], pins: [], files: [], memberGroups: [], thread: null,
    membersById: {},
  };
}

// ── the live read (P4.10) ───────────────────────────────────────────────────
export async function loadWorkspace({ serverId, channelId } = {}) {
  if (isDemo()) return demoWorkspace();
  const user = session();
  if (!user) return emptyWorkspace(serverId, channelId, /*needsAuth*/ true);

  // my profile + the servers I'm in (rail)
  const [{ data: prof }, { data: myServers }] = await Promise.all([
    supabase.from("profiles").select("handle,name").eq("id", user.id).maybeSingle(),
    supabase.from("server_members").select("color, server:servers(id,name,owner_id)").eq("user_id", user.id),
  ]);
  const servers = (myServers || []).filter((r) => r.server).map((r) => ({
    id: r.server.id, name: r.server.name, initials: initials(r.server.name),
  }));
  const meName = prof?.name || prof?.handle || user.email?.split("@")[0] || "you";
  const me = { id: user.id, name: meName, initials: initials(meName), handle: prof?.handle || meName, colorIdx: 1 };

  const activeServer = (myServers || []).find((r) => r.server && r.server.id === serverId)?.server
    || (!serverId ? myServers?.[0]?.server : null);
  if (!activeServer) {
    const base = emptyWorkspace(serverId, channelId, false);
    return { ...base, me, servers };
  }
  const sid = activeServer.id;

  // members (+ roles for admin grouping) and channels, in parallel
  const [{ data: memRows }, { data: roleRows }, { data: chans }] = await Promise.all([
    supabase.from("server_members").select("user_id,color,status,profile:profiles(handle,name,presence_state,status_text)").eq("server_id", sid),
    supabase.from("member_roles").select("user_id, role:roles(permissions)").eq("server_id", sid),
    supabase.from("channels").select("id,name,kind,position,slowmode_sec,post_policy").eq("server_id", sid).order("position"),
  ]);

  // admin = server owner OR holds a role with the manage_server bit (1)
  const MANAGE_SERVER = 1n;
  const adminBits = {};
  for (const r of roleRows || []) { if (r.role && (BigInt(r.role.permissions) & MANAGE_SERVER)) adminBits[r.user_id] = true; }
  const membersById = {};
  for (const m of memRows || []) {
    const nm = m.profile?.name || m.profile?.handle || "member";
    membersById[m.user_id] = { id: m.user_id, name: nm, colorIdx: m.color || 1, initials: initials(nm),
      presence: m.profile?.presence_state || "offline", doing: m.profile?.status_text || "",
      admin: m.user_id === activeServer.owner_id || !!adminBits[m.user_id] };
  }
  if (membersById[user.id]) me.colorIdx = membersById[user.id].colorIdx;

  const admins = [], members = [];
  for (const [uid, m] of Object.entries(membersById)) (m.admin ? admins : members).push(m);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const memberGroups = [
    admins.length && { label: "Admins", members: admins.sort(byName) },
    members.length && { label: "Members", members: members.sort(byName) },
  ].filter(Boolean);

  // channel groups by kind, preserving order
  const textCh = (chans || []).filter((c) => c.kind !== "voice");
  const voiceCh = (chans || []).filter((c) => c.kind === "voice");
  const channelGroups = [
    textCh.length && { kind: "text", label: "Channels", channels: textCh.map((c) => ({ id: c.id, name: c.name })) },
    voiceCh.length && { kind: "voice", label: "Voice", channels: voiceCh.map((c) => ({ id: c.id, name: c.name, voice: [] })) },
  ].filter(Boolean);

  const activeChannel = (chans || []).find((c) => c.id === channelId) || textCh[0] || null;

  let messages = [], pins = [], pinCount = 0;
  if (activeChannel) {
    const cid = activeChannel.id;
    const [{ data: msgRows }, { data: pinRows }] = await Promise.all([
      supabase.from("messages").select("id,body,created_at,edited_at,parent_id,user_id,deleted_at").eq("channel_id", cid).is("deleted_at", null).order("created_at"),
      supabase.from("message_pins").select("message_id,pinned_by,created_at, message:messages(body,user_id)").eq("channel_id", cid).order("created_at"),
    ]);
    const all = msgRows || [];
    const replyCount = {};
    for (const r of all) if (r.parent_id) replyCount[r.parent_id] = (replyCount[r.parent_id] || 0) + 1;
    // reactions grouped for the visible top-level messages
    const topIds = all.filter((r) => !r.parent_id).map((r) => r.id);
    const rxByMsg = {};
    if (topIds.length) {
      const { data: rxAll } = await supabase.from("message_reactions").select("message_id,emoji,user_id").in("message_id", topIds);
      for (const r of rxAll || []) {
        (rxByMsg[r.message_id] ||= {});
        (rxByMsg[r.message_id][r.emoji] ||= { emoji: r.emoji, n: 0, mine: false });
        rxByMsg[r.message_id][r.emoji].n++;
        if (r.user_id === user.id) rxByMsg[r.message_id][r.emoji].mine = true;
      }
    }
    messages = all.filter((r) => !r.parent_id).map((r) => {
      const m = shapeMessage(r, membersById);
      m.replies = replyCount[r.id] || 0;
      m.reactions = Object.values(rxByMsg[r.id] || {});
      return m;
    });
    pins = (pinRows || []).map((p) => {
      const auth = membersById[p.message?.user_id] || { name: "unknown", colorIdx: 1 };
      const byName = membersById[p.pinned_by]?.name || "someone";
      return { by: byName, author: { name: auth.name, initials: initials(auth.name), colorIdx: auth.colorIdx }, time: fmtTime(p.created_at), text: p.message?.body || "" };
    });
    pinCount = pins.length;
  }

  return {
    needsAuth: false, live: true,
    me, isAdmin: !!membersById[user.id]?.admin, servers, dmUnread: 0,
    server: { id: sid, name: activeServer.name, initials: initials(activeServer.name) },
    channelGroups,
    channel: activeChannel ? { id: activeChannel.id, name: activeChannel.name, topic: "", pins: pinCount, files: 0, slowmode: activeChannel.slowmode_sec, postPolicy: activeChannel.post_policy } : null,
    messages, typing: [], pins, files: [], memberGroups, thread: null,
    membersById,
    activeServerId: sid, activeChannelId: activeChannel?.id || null,
  };
}

// a channel's thread (parent + replies), loaded on demand when a thread opens
export async function loadThread(parentId, membersById) {
  const { data: parent } = await supabase.from("messages").select("id,body,created_at,edited_at,user_id,channel_id").eq("id", parentId).maybeSingle();
  const { data: replies } = await supabase.from("messages").select("id,body,created_at,edited_at,user_id").eq("parent_id", parentId).is("deleted_at", null).order("created_at");
  if (!parent) return null;
  return {
    channelId: parent.channel_id,
    parent: shapeMessage(parent, membersById),
    replies: (replies || []).map((r) => shapeMessage(r, membersById)),
  };
}
