// data.js — the workspace data layer. One function shapes everything the
// workspace screen renders, so the screen never talks to Supabase directly and
// the same shape drives the demo, the live, and the empty renders.
//
// Three sources, one shape:
//  - `?demo=1`   → the Late Bloom LP fixture (demo.js), matching the gallery.
//  - signed in   → LIVE reads from Supabase (P4.10). Realtime patching lives in
//                  realtime.js + workspace.js; this module does the initial reads.
//  - signed out  → { needsAuth:true } so the shell shows a sign-in prompt.

import { demoWorkspace, demoExplorer } from "./demo.js";
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

// ── caches (P4-BUG#4: channel switching was re-reading everything) ──────────
// Server-level data changes rarely; cache it so a channel switch only fetches the
// new channel's messages. Cleared on sign-out (main.js) so a different account can't
// read a previous one's cached rail/members.
const _cache = { rail: null, servers: new Map() };
export function clearWorkspaceCache() { _cache.rail = null; _cache.servers.clear(); }

async function loadRail(user) {
  if (_cache.rail) return _cache.rail;
  const { data: myServers } = await supabase.from("server_members").select("color, server:servers(id,name,owner_id)").eq("user_id", user.id);
  const rows = myServers || [];
  const servers = rows.filter((r) => r.server).map((r) => ({ id: r.server.id, name: r.server.name, initials: initials(r.server.name) }));
  _cache.rail = { myServers: rows, servers };
  return _cache.rail;
}

const MANAGE_SERVER = 1n;   // perm_bit('manage_server')

async function loadServerBundle(activeServer) {
  const sid = activeServer.id;
  if (_cache.servers.has(sid)) return _cache.servers.get(sid);

  const [{ data: memRows }, { data: roleRows }, { data: chans }] = await Promise.all([
    supabase.from("server_members").select("user_id,color,status").eq("server_id", sid),
    supabase.from("member_roles").select("user_id, role:roles(permissions)").eq("server_id", sid),
    supabase.from("channels").select("id,name,kind,position,slowmode_sec,post_policy").eq("server_id", sid).order("position"),
  ]);
  // profiles are fetched SEPARATELY, not embedded: server_members has no FK to
  // profiles (its user_id points at auth.users), so a PostgREST embed errors out and
  // returned nothing — the bug behind the empty members rail + "unknown" authors.
  const uids = (memRows || []).map((m) => m.user_id);
  const { data: profRows } = uids.length
    ? await supabase.from("profiles").select("id,handle,name,presence_state,status_text").in("id", uids)
    : { data: [] };
  const profById = {};
  for (const p of profRows || []) profById[p.id] = p;

  const adminBits = {};
  for (const r of roleRows || []) if (r.role && (BigInt(r.role.permissions) & MANAGE_SERVER)) adminBits[r.user_id] = true;

  const membersById = {};
  for (const m of memRows || []) {
    const p = profById[m.user_id];
    const nm = p?.name || p?.handle || "member";
    membersById[m.user_id] = {
      id: m.user_id, name: nm, handle: p?.handle || nm, colorIdx: m.color || 1, initials: initials(nm),
      presence: p?.presence_state || "offline", doing: p?.status_text || "",
      admin: m.user_id === activeServer.owner_id || !!adminBits[m.user_id],
    };
  }
  const admins = [], members = [];
  for (const m of Object.values(membersById)) (m.admin ? admins : members).push(m);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const memberGroups = [
    admins.length && { label: "Admins", members: admins.sort(byName) },
    members.length && { label: "Members", members: members.sort(byName) },
  ].filter(Boolean);

  const textCh = (chans || []).filter((c) => c.kind !== "voice");
  const voiceCh = (chans || []).filter((c) => c.kind === "voice");
  const channelGroups = [
    textCh.length && { kind: "text", label: "Channels", channels: textCh.map((c) => ({ id: c.id, name: c.name })) },
    voiceCh.length && { kind: "voice", label: "Voice", channels: voiceCh.map((c) => ({ id: c.id, name: c.name, voice: [] })) },
  ].filter(Boolean);

  const bundle = { sid, membersById, memberGroups, channelGroups, textCh, server: { id: sid, name: activeServer.name, initials: initials(activeServer.name) } };
  _cache.servers.set(sid, bundle);
  return bundle;
}

// ── the live read (P4.10) ───────────────────────────────────────────────────
export async function loadWorkspace({ serverId, channelId } = {}) {
  if (isDemo()) return demoWorkspace();
  const user = session();
  if (!user) return emptyWorkspace(serverId, channelId, /*needsAuth*/ true);

  const { myServers, servers } = await loadRail(user);
  const meBase = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  const activeServer = myServers.find((r) => r.server && r.server.id === serverId)?.server
    || (!serverId ? myServers[0]?.server : null);
  if (!activeServer) return { ...emptyWorkspace(serverId, channelId, false), me: meBase, servers };
  const sid = activeServer.id;

  // server-level data (members/roles/channels/profiles) is cached per server — a
  // channel switch within the same server then only fetches that channel's messages.
  const bundle = await loadServerBundle(activeServer);
  const { membersById, memberGroups, channelGroups, textCh } = bundle;
  const meMember = membersById[user.id];
  const me = meMember
    ? { id: user.id, name: meMember.name, initials: meMember.initials, handle: meMember.handle || meMember.name, colorIdx: meMember.colorIdx }
    : meBase;

  // voice channels are v2 — never selectable as the active (text) channel (P4-BUG#3)
  const activeChannel = textCh.find((c) => c.id === channelId) || textCh[0] || null;

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

// ── the File explorer read (P5.4) ───────────────────────────────────────────
// The server File explorer + home Feed are one component parameterised by source
// (CANON §C.6); this is the SERVER source. It reads the server's folder tree and
// the works living in it (a work's location = its `placement.folder_id`), and the
// storage meter for the tree footer. Same rail/channel-column data as the
// workspace, so the explorer mounts inside the same shell with Files highlighted.
const SERVER_BASE_GB = 5;    // server free baseline before purchased_gb (CANON §C.19)
const USER_BASE_GB = 10;     // personal free baseline (CANON §C.19)
const GB = 1024 ** 3;

// a raw works row + its placement/author → the card shape cards.js renders
function shapeWork(w, place, membersById, chanName, tags = []) {
  const a = membersById[w.author_id];
  return {
    id: w.id, title: w.title, name: w.title,
    kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes,
    hidden: !!w.hidden, created_at: w.created_at, tags,
    folderId: place?.folder_id || null,
    channelName: place?.channel_id ? chanName[place.channel_id] || null : null,
    who: a ? { name: a.name, colorIdx: a.colorIdx } : null,
  };
}

export async function loadExplorer({ serverId, folderId, source = "server" } = {}) {
  if (isDemo()) return demoExplorer(source);
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  if (source === "personal") return loadPersonalExplorer(user, folderId);

  const { myServers, servers } = await loadRail(user);
  const meBase = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  const activeServer = myServers.find((r) => r.server && r.server.id === serverId)?.server
    || (!serverId ? myServers[0]?.server : null);
  if (!activeServer) return { needsAuth: false, live: true, noServer: true, me: meBase, servers, dmUnread: 0 };
  const sid = activeServer.id;

  const bundle = await loadServerBundle(activeServer);
  const { membersById, channelGroups, textCh } = bundle;
  const meMember = membersById[user.id];
  const me = meMember
    ? { id: user.id, name: meMember.name, initials: meMember.initials, handle: meMember.handle || meMember.name, colorIdx: meMember.colorIdx }
    : meBase;
  const chanName = {};
  for (const c of textCh) chanName[c.id] = c.name;

  // folder tree · works in this server · placements (folder location + channel) ·
  // the storage meter. Placements are fetched separately (no embed) — the same FK
  // caution as the workspace reads (GOTCHA U).
  const [{ data: folderRows }, { data: workRows }, { data: meterRows }, { data: balRows }] = await Promise.all([
    supabase.from("folders").select("id,name,parent_id,archived,locked").eq("server_id", sid).order("name"),
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,created_at").eq("server_id", sid).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("storage_meters").select("bytes_used").eq("owner_type", "server").eq("owner_id", sid).maybeSingle(),
    supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", "server").eq("owner_id", sid).maybeSingle(),
  ]);

  const works = workRows || [];
  const workIds = works.map((w) => w.id);
  const placeById = {};
  const tagsByWork = {};
  if (workIds.length) {
    const [{ data: plRows }, { data: tagRows }] = await Promise.all([
      supabase.from("placement").select("work_id,folder_id,channel_id").eq("surface", "server").eq("surface_id", sid).in("work_id", workIds),
      supabase.from("content_tags").select("work_id,tag").in("work_id", workIds),
    ]);
    for (const p of plRows || []) placeById[p.work_id] = p;   // one server placement per work
    for (const t of tagRows || []) (tagsByWork[t.work_id] ||= []).push(t.tag);
  }

  // per-folder file counts (all folders, for the tree tiles); root = null
  const countByFolder = {};
  for (const w of works) {
    const fid = placeById[w.id]?.folder_id || "__root__";
    countByFolder[fid] = (countByFolder[fid] || 0) + 1;
  }
  const folders = (folderRows || []).map((f) => ({
    id: f.id, name: f.name, parentId: f.parent_id, archived: !!f.archived, locked: !!f.locked,
    count: countByFolder[f.id] || 0,
  }));

  const files = works.map((w) => shapeWork(w, placeById[w.id], membersById, chanName, tagsByWork[w.id] || []));

  const usedBytes = Number(meterRows?.bytes_used || 0);
  const capGb = SERVER_BASE_GB + Number(balRows?.purchased_gb || 0);

  return {
    needsAuth: false, live: true,
    me, isAdmin: !!membersById[user.id]?.admin, servers, dmUnread: 0,
    server: { id: sid, name: activeServer.name, initials: initials(activeServer.name) },
    channelGroups, membersById,
    folders, files,
    currentFolderId: folderId || null,
    storage: { usedBytes, capGb, capBytes: capGb * GB, status: balRows?.status || "active", overCap: usedBytes > capGb * GB },
    activeServerId: sid,
    source: "server",
  };
}

// The personal "My files" mount (CANON §C.6/§E) — the SAME explorer component,
// parameterised to the personal source: the user's own works (owner_type='user')
// filed into nested `save_folders` (location via `saved_items.folder_id`, else
// root), the personal storage meter ("Your storage"), and NO server chrome (the
// channel column, channel/uploader filters drop away). Rail/servers still load so
// the shell around it is intact.
async function loadPersonalExplorer(user, folderId) {
  const { servers } = await loadRail(user);
  const me = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  const [{ data: folderRows }, { data: workRows }, { data: meterRows }, { data: balRows }] = await Promise.all([
    supabase.from("save_folders").select("id,name,parent_id").eq("user_id", user.id).order("name"),
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,created_at").eq("owner_type", "user").eq("owner_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("storage_meters").select("bytes_used").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
    supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
  ]);

  const works = workRows || [];
  const workIds = works.map((w) => w.id);
  // location + tags: saved_items.folder_id files a work into a personal folder
  // (unfiled works — e.g. a straight personal upload — sit at root).
  const savedFolderByWork = {}, tagsByWork = {};
  if (workIds.length) {
    const [{ data: savedRows }, { data: tagRows }] = await Promise.all([
      supabase.from("saved_items").select("work_id,folder_id").eq("user_id", user.id).in("work_id", workIds),
      supabase.from("content_tags").select("work_id,tag").in("work_id", workIds),
    ]);
    for (const s of savedRows || []) savedFolderByWork[s.work_id] = s.folder_id;
    for (const t of tagRows || []) (tagsByWork[t.work_id] ||= []).push(t.tag);
  }

  const countByFolder = {};
  for (const w of works) {
    const fid = savedFolderByWork[w.id] || "__root__";
    countByFolder[fid] = (countByFolder[fid] || 0) + 1;
  }
  const folders = (folderRows || []).map((f) => ({
    id: f.id, name: f.name, parentId: f.parent_id, archived: false, locked: false,
    count: countByFolder[f.id] || 0,
  }));

  const files = works.map((w) => ({
    id: w.id, title: w.title, name: w.title,
    kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes,
    hidden: !!w.hidden, created_at: w.created_at, tags: tagsByWork[w.id] || [],
    folderId: savedFolderByWork[w.id] || null,
    channelName: null, who: null,   // personal files have no server context
  }));

  const usedBytes = Number(meterRows?.bytes_used || 0);
  const capGb = USER_BASE_GB + Number(balRows?.purchased_gb || 0);

  return {
    needsAuth: false, live: true, source: "personal",
    me, isAdmin: false, servers, dmUnread: 0,
    server: null, channelGroups: [], membersById: {},
    rootLabel: "My files", storageLabel: "Your storage",
    folders, files,
    currentFolderId: folderId || null,
    storage: { usedBytes, capGb, capBytes: capGb * GB, status: balRows?.status || "active", overCap: usedBytes > capGb * GB },
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
