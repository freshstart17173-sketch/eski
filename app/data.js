// data.js — the workspace data layer. One function shapes everything the
// workspace screen renders, so the screen never talks to Supabase directly and
// the same shape drives the demo, the live, and the empty renders.
//
// Three sources, one shape:
//  - `?demo=1`   → the Late Bloom LP fixture (demo.js), matching the gallery.
//  - signed in   → LIVE reads from Supabase (P4.10). Realtime patching lives in
//                  realtime.js + workspace.js; this module does the initial reads.
//  - signed out  → { needsAuth:true } so the shell shows a sign-in prompt.

import { demoWorkspace, demoExplorer, demoFeed, demoProfile, demoComments, demoSharedWork, demoDMs, demoDMThread, demoNotifications, demoInvites } from "./demo.js";
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
    author: { name: a.name, initials: initials(a.name), colorIdx: a.colorIdx, avatar_key: a.avatar_key || null },
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
  const { data: myServers } = await supabase.from("server_members").select("color, server:servers(id,name,owner_id,icon_key,cover_key)").eq("user_id", user.id);
  const rows = myServers || [];
  const servers = rows.filter((r) => r.server).map((r) => ({ id: r.server.id, name: r.server.name, initials: initials(r.server.name), icon_key: r.server.icon_key || null }));
  _cache.rail = { myServers: rows, servers };
  return _cache.rail;
}

const MANAGE_SERVER = 1n;   // perm_bit('manage_server')

async function loadServerBundle(activeServer) {
  const sid = activeServer.id;
  if (_cache.servers.has(sid)) return _cache.servers.get(sid);

  const [{ data: memRows }, { data: roleRows }, { data: chans }] = await Promise.all([
    supabase.from("server_members").select("user_id,color,status").eq("server_id", sid),
    supabase.from("member_roles").select("user_id, role:roles(id,name,color,permissions,is_default)").eq("server_id", sid),
    supabase.from("channels").select("id,name,kind,position,topic,slowmode_sec,post_policy").eq("server_id", sid).order("position"),
  ]);
  // profiles are fetched SEPARATELY, not embedded: server_members has no FK to
  // profiles (its user_id points at auth.users), so a PostgREST embed errors out and
  // returned nothing — the bug behind the empty members rail + "unknown" authors.
  const uids = (memRows || []).map((m) => m.user_id);
  const { data: profRows } = uids.length
    ? await supabase.from("profiles").select("id,handle,name,presence_state,status_text,avatar_key").in("id", uids)
    : { data: [] };
  const profById = {};
  for (const p of profRows || []) profById[p.id] = p;

  // member_roles → roles is a real FK, so the embed works. Derive: admin bits (manage_server),
  // the server's assignable (non-default) roles, and each member's current non-default role ids.
  const adminBits = {}, memberRoleIds = {}, rolesById = {};
  for (const r of roleRows || []) {
    if (!r.role) continue;
    if (BigInt(r.role.permissions) & MANAGE_SERVER) adminBits[r.user_id] = true;
    if (!r.role.is_default) {
      (memberRoleIds[r.user_id] ||= []).push(r.role.id);
      rolesById[r.role.id] = { id: r.role.id, name: r.role.name, color: r.role.color || 1 };
    }
  }
  const serverRoles = Object.values(rolesById);

  const membersById = {};
  for (const m of memRows || []) {
    const p = profById[m.user_id];
    const nm = p?.name || p?.handle || "member";
    membersById[m.user_id] = {
      id: m.user_id, name: nm, handle: p?.handle || nm, colorIdx: m.color || 1, initials: initials(nm),
      presence: p?.presence_state || "offline", doing: p?.status_text || "",
      admin: m.user_id === activeServer.owner_id || !!adminBits[m.user_id],
      roleIds: memberRoleIds[m.user_id] || [], avatar_key: p?.avatar_key || null,
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
    textCh.length && { kind: "text", label: "Channels", channels: textCh.map((c) => ({ id: c.id, name: c.name, topic: c.topic || "", slowmode: c.slowmode_sec || 0, postPolicy: c.post_policy || "everyone" })) },
    voiceCh.length && { kind: "voice", label: "Voice", channels: voiceCh.map((c) => ({ id: c.id, name: c.name, voice: [] })) },
  ].filter(Boolean);

  const bundle = { sid, membersById, memberGroups, channelGroups, textCh, serverRoles, server: { id: sid, name: activeServer.name, initials: initials(activeServer.name), icon_key: activeServer.icon_key || null, cover_key: activeServer.cover_key || null } };
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
  const { membersById, memberGroups, channelGroups, textCh, serverRoles } = bundle;
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
    me, isAdmin: !!membersById[user.id]?.admin, isOwner: activeServer.owner_id === user.id, servers, dmUnread: 0,
    server: { id: sid, name: activeServer.name, initials: initials(activeServer.name) },
    channelGroups,
    channel: activeChannel ? { id: activeChannel.id, name: activeChannel.name, topic: "", pins: pinCount, files: 0, slowmode: activeChannel.slowmode_sec, postPolicy: activeChannel.post_policy } : null,
    messages, typing: [], pins, files: [], memberGroups, thread: null,
    membersById, serverRoles,
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
    hidden: !!w.hidden, visibility: w.visibility || null, created_at: w.created_at, tags,
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
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,visibility,created_at").eq("server_id", sid).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("storage_meters").select("bytes_used").eq("owner_type", "server").eq("owner_id", sid).maybeSingle(),
    supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", "server").eq("owner_id", sid).maybeSingle(),
  ]);

  const works = workRows || [];
  const workIds = works.map((w) => w.id);
  const placeById = {};
  const tagsByWork = {};
  const starred = new Set();
  if (workIds.length) {
    const [{ data: plRows }, { data: tagRows }, { data: starRows }] = await Promise.all([
      supabase.from("placement").select("work_id,folder_id,channel_id").eq("surface", "server").eq("surface_id", sid).in("work_id", workIds),
      supabase.from("content_tags").select("work_id,tag").in("work_id", workIds),
      supabase.from("starred_items").select("work_id").eq("user_id", user.id).in("work_id", workIds),
    ]);
    for (const p of plRows || []) placeById[p.work_id] = p;   // one server placement per work
    for (const t of tagRows || []) (tagsByWork[t.work_id] ||= []).push(t.tag);
    for (const s of starRows || []) starred.add(s.work_id);
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

  const files = works.map((w) => { const f = shapeWork(w, placeById[w.id], membersById, chanName, tagsByWork[w.id] || []); f.starred = starred.has(w.id); return f; });

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
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,visibility,created_at").eq("owner_type", "user").eq("owner_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("storage_meters").select("bytes_used").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
    supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
  ]);

  const works = workRows || [];
  const workIds = works.map((w) => w.id);
  // location + tags: saved_items.folder_id files a work into a personal folder
  // (unfiled works — e.g. a straight personal upload — sit at root).
  const savedFolderByWork = {}, tagsByWork = {}, starred = new Set();
  if (workIds.length) {
    const [{ data: savedRows }, { data: tagRows }, { data: starRows }] = await Promise.all([
      supabase.from("saved_items").select("work_id,folder_id").eq("user_id", user.id).in("work_id", workIds),
      supabase.from("content_tags").select("work_id,tag").in("work_id", workIds),
      supabase.from("starred_items").select("work_id").eq("user_id", user.id).in("work_id", workIds),
    ]);
    for (const s of savedRows || []) savedFolderByWork[s.work_id] = s.folder_id;
    for (const t of tagRows || []) (tagsByWork[t.work_id] ||= []).push(t.tag);
    for (const s of starRows || []) starred.add(s.work_id);
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
    folderId: savedFolderByWork[w.id] || null, starred: starred.has(w.id),
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

// Create a folder under `parentId` (null = root) in whichever explorer source is
// mounted. Server folders go through the `create_folder` RPC — the RPC is the fence
// (it gates on has_perm(manage_channels) and forbids cross-server parents), the UI is
// only the signpost. Personal folders are the user's own `save_folders` rows, guarded
// by RLS on user_id, so a direct insert is correct there (no server-scoped permission
// to check). Returns the new row in the explorer's folder shape so the caller can push
// it into `data.folders` and rerender without a refetch. In demo mode there is no
// network — the caller does its own optimistic insert.
export async function createFolder({ source = "server", serverId, parentId = null, name }) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Folder name is required");
  if (source === "personal") {
    const user = session();
    if (!user) throw new Error("Sign in to create folders");
    const { data: row, error } = await supabase.from("save_folders")
      .insert({ user_id: user.id, parent_id: parentId, name: clean })
      .select("id,name,parent_id").single();
    if (error) throw error;
    return { id: row.id, name: row.name, parentId: row.parent_id, archived: false, locked: false, count: 0 };
  }
  const { data: row, error } = await supabase.rpc("create_folder", { server_id: serverId, parent_id: parentId, name: clean });
  if (error) throw error;
  return { id: row.id, name: row.name, parentId: row.parent_id, archived: !!row.archived, locked: !!row.locked, count: 0 };
}

// Re-file the given works into `destFolderId` (null = root) in the mounted source. On
// a server this is the `move_to_folder` RPC per work — the RPC is the fence (manage_
// files gate, rejects a folder outside the work's server). In My-files it's an upsert
// into `saved_items` (PK user_id+work_id) so a never-filed work (no row yet) and an
// already-filed one both land in one call, guarded by RLS on user_id. A move changes
// only where a file lives, not its visibility. Throws on the first failure so the caller
// can surface it; in demo mode there is no network (the caller moves optimistically).
export async function moveToFolder({ source = "server", works = [], destFolderId = null }) {
  if (!works.length) return;
  if (source === "personal") {
    const user = session();
    if (!user) throw new Error("Sign in to move files");
    const rows = works.map((id) => ({ user_id: user.id, work_id: id, folder_id: destFolderId }));
    const { error } = await supabase.from("saved_items").upsert(rows, { onConflict: "user_id,work_id" });
    if (error) throw error;
    return;
  }
  for (const id of works) {
    const { error } = await supabase.rpc("move_to_folder", { target: id, folder_id: destFolderId });
    if (error) throw error;
  }
}

// ── Trash (CANON §C.6 / §E.3) ────────────────────────────────────────────────
// Soft-delete, restore, and hard-purge are plain client writes, not RPCs: the `works`
// RLS already gates update/delete on `can_write_work` (author or server admin), a soft-
// deleted work stays readable by its author (can_read_work's owner branch skips the
// deleted_at guard), and the AFTER trigger `works_blob_meter` correctly leaves the
// storage meter untouched on a deleted_at flip (kept 30 days) and decrements it on the
// hard DELETE. So the writers here are direct table writes; the fence is the policy.

// Soft-delete: move works to Trash. Bulk = one update over the id set (RLS filters the
// set to writable rows). Kept 30 days, then the purge job hard-deletes them (§E.3).
export async function trashWorks(ids = []) {
  if (!ids.length) return;
  const { error } = await supabase.from("works").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}
// Restore from Trash: clear deleted_at (the row is readable by its author while trashed).
export async function restoreWork(id) {
  const { error } = await supabase.from("works").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}
// Delete forever: the hard DELETE fires works_blob_meter → blob refcount-- + meter--.
export async function purgeWork(id) {
  const { error } = await supabase.from("works").delete().eq("id", id);
  if (error) throw error;
}
// Empty trash: hard-delete every trashed work in scope (RLS keeps it to writable rows).
export async function emptyTrash({ source = "server", serverId } = {}) {
  let q = supabase.from("works").delete().not("deleted_at", "is", null);
  if (source === "personal") {
    const user = session();
    if (!user) throw new Error("Sign in");
    q = q.eq("owner_type", "user").eq("owner_id", user.id);
  } else {
    q = q.eq("server_id", serverId);
  }
  const { error } = await q;
  if (error) throw error;
}
// The Trash smart-folder's contents — trashed works the caller can read (RLS returns
// their own). Shaped for the trash list: name, kind icon, uploader, trashed-at.
export async function loadTrash({ source = "server", serverId, membersById = {} } = {}) {
  if (isDemo()) return [];
  const cols = "id,title,kind,file_ext,blob_sha,bytes,author_id,created_at,deleted_at";
  let q = supabase.from("works").select(cols).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (source === "personal") {
    const user = session();
    if (!user) return [];
    q = q.eq("owner_type", "user").eq("owner_id", user.id);
  } else {
    q = q.eq("server_id", serverId);
  }
  const { data: rows } = await q;
  return (rows || []).map((w) => ({
    id: w.id, title: w.title, name: w.title, kind: w.kind, file_ext: w.file_ext,
    blob_sha: w.blob_sha, bytes: w.bytes, created_at: w.created_at, deletedAt: w.deleted_at,
    who: source === "personal" ? null : (membersById[w.author_id] ? { name: membersById[w.author_id].name } : null),
  }));
}

// Hide/show a work in the library view (#55) — a `works.hidden` toggle, fenced by
// `works_update` (can_write_work). Hidden keeps a utility file out of the organised
// explorer view (Show-hidden reveals it); it still works inline in chat.
export async function setHidden(workId, hidden) {
  const { error } = await supabase.from("works").update({ hidden: !!hidden }).eq("id", workId);
  if (error) throw error;
}

// Rename a work — a plain `works.title` update, fenced by `works_update` (can_write_work:
// author or server admin), same gate as delete. The trigger re-derives search_tsv.
export async function renameWork(workId, title) {
  const clean = (title || "").trim();
  if (!clean) throw new Error("Name is required");
  const { error } = await supabase.from("works").update({ title: clean }).eq("id", workId);
  if (error) throw error;
}

// ── Star (CANON §C.6 / §E.3) ─────────────────────────────────────────────────
// A per-user star on a work — `starred_items` (PK user_id+work_id), owner-only RLS
// (`star_all`), granted to authenticated. So star/unstar are plain client writes.
export async function starWork(workId) {
  const user = session();
  if (!user) throw new Error("Sign in to star files");
  const { error } = await supabase.from("starred_items").upsert({ user_id: user.id, work_id: workId }, { onConflict: "user_id,work_id" });
  if (error) throw error;
}
export async function unstarWork(workId) {
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("starred_items").delete().eq("user_id", user.id).eq("work_id", workId);
  if (error) throw error;
}

// ── Save to my files (CANON §E.3 save_to_files / unsave) ─────────────────────
// An owner copy pointer into the personal library: a `saved_items` row (PK user_id+
// work_id, filed via folder_id — null = personal root). `saved_items` RLS (`si_all`)
// already fences it to the caller's own rows, so these are plain client writes. Save is
// idempotent (upsert); unsave removes the pointer (the work itself is untouched).
export async function saveToFiles(workId, folderId = null) {
  const user = session();
  if (!user) throw new Error("Sign in to save files");
  const { error } = await supabase.from("saved_items").upsert({ user_id: user.id, work_id: workId, folder_id: folderId }, { onConflict: "user_id,work_id" });
  if (error) throw error;
}
export async function unsaveWork(workId) {
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("saved_items").delete().eq("user_id", user.id).eq("work_id", workId);
  if (error) throw error;
}
export async function isWorkSaved(workId) {
  if (isDemo()) return false;
  const user = session();
  if (!user) return false;
  const { data } = await supabase.from("saved_items").select("work_id").eq("user_id", user.id).eq("work_id", workId).maybeSingle();
  return !!data;
}

// ── Post comments (CANON §E.8.5) ─────────────────────────────────────────────
// Comments are POST-level and public-context only (a server file discusses in its
// channel), so the thread renders NO member hue — colorIdx stays null throughout.
// `comments.user_id` points at auth.users (no FK to profiles), so authors are fetched
// SEPARATELY into a byId map — the same embed hazard the workspace hit (bug #1).
export async function loadComments(workId) {
  if (isDemo()) return demoComments(workId);
  const user = session();
  const { data: rows, error } = await supabase.from("comments")
    .select("id,body,user_id,created_at")
    .eq("work_id", workId).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(200);
  if (error || !rows?.length) return [];
  const uids = [...new Set(rows.map((r) => r.user_id))];
  const byId = {};
  const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", uids);
  for (const p of profs || []) byId[p.id] = p;
  return rows.map((r) => {
    const a = byId[r.user_id];
    // `mine` drives the delete affordance; the post author can also remove, but that's a
    // less common case left to a later pass — cmt_delete is the fence either way.
    return { id: r.id, name: a ? (a.name || a.handle) : "unknown", avatar_key: a?.avatar_key || null, text: r.body || "", time: fmtTime(r.created_at), mine: !!user && r.user_id === user.id };
  });
}

// Remove your own comment — a tombstone (set deleted_at), consistent with the schema's
// deleted_at column and the message-delete pattern, so loadComments' `is null` filter drops
// it. cmt_delete/cmt_update RLS fence it to the comment's author (or the post author); a
// rejected write throws for the caller to toast.
export async function deleteComment(commentId) {
  if (isDemo()) return;
  const { error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId);
  if (error) throw new Error(error.message || "Couldn’t delete the comment");
}

// ── Tags (CANON §E.10, content_tags) ─────────────────────────────────────────
// A work's tags, `content_tags(work_id, tag)` with `unique(work_id,tag)`. `ct_write` RLS
// fences writes to who can write the work (author/admin) or an accepted collaborator, so
// these are plain client writes. Tags are normalised (trim, drop a leading #, lowercase) so
// "Bridge" and "bridge" are the same tag; a duplicate insert is a no-op success (idempotent).
export async function addTag(workId, tag) {
  const clean = (tag || "").trim().replace(/^#/, "").toLowerCase();
  if (!clean) throw new Error("A tag can’t be empty");
  if (clean.length > 40) throw new Error("That tag is too long");
  if (isDemo()) return clean;
  const { error } = await supabase.from("content_tags").insert({ work_id: workId, tag: clean });
  if (error && !/duplicate|unique|23505/i.test(error.message || "")) throw new Error(error.message || "Couldn’t add the tag");
  return clean;
}
export async function removeTag(workId, tag) {
  if (isDemo()) return;
  const { error } = await supabase.from("content_tags").delete().eq("work_id", workId).eq("tag", tag);
  if (error) throw new Error(error.message || "Couldn’t remove the tag");
}

// ── Share links (CANON §E.10 / #39-40, share_links + resolve_share_link) ──────
// "Anyone with the link" — a `share_links` row (token PK). `share_write` RLS fences
// creation to who can write the work, so this is a plain client insert. The token is
// URL-safe random; the link opens the read-only /shared/:token viewer (no shell).
export function shareUrl(token) { return `${location.origin}/shared/${token}`; }

export async function createShareLink(workId) {
  const token = (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "");
  if (isDemo()) return token;
  const user = session();
  if (!user) throw new Error("Sign in to share");
  const { error } = await supabase.from("share_links").insert({ token, work_id: workId, created_by: user.id });
  if (error) throw new Error(error.message || "Couldn’t create the link");
  return token;
}

// The share dialog's link management. `share_read` RLS lets the creator (or a work writer)
// list the work's links; a revoke is a `revoked_at` tombstone (share_write RLS), so
// resolve_share_link then refuses it. Active = not yet revoked.
export async function loadShareLinks(workId) {
  if (isDemo()) return [];   // demo starts empty; links are created optimistically in-dialog
  const { data } = await supabase.from("share_links")
    .select("token,created_at,expires_at,revoked_at")
    .eq("work_id", workId).is("revoked_at", null)
    .order("created_at", { ascending: false });
  return data || [];
}
export async function revokeShareLink(token) {
  if (isDemo()) return;
  const { error } = await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("token", token);
  if (error) throw new Error(error.message || "Couldn’t revoke the link");
}

// Visibility (CANON §B.3 / #61) — the UI's Public/Server/Private maps to works.visibility
// public/server/**personal** (the DB noun for Private). A plain `works_update` write
// (can_write_work), with a check that server-visibility needs server membership.
const VIS_TO_DB = { public: "public", server: "server", private: "personal" };
const VIS_FROM_DB = { public: "public", server: "server", personal: "private" };
export function visFromDb(dbVis) { return VIS_FROM_DB[dbVis] || "public"; }
export async function setVisibility(workId, uiVis) {
  const db = VIS_TO_DB[uiVis] || "public";
  if (isDemo()) return db;
  const { error } = await supabase.from("works").update({ visibility: db }).eq("id", workId);
  if (error) throw new Error(error.message || "Couldn’t change who can see this");
  return db;
}

// Resolve a token for the anon /shared/:token viewer. `resolve_share_link` is a SECURITY
// DEFINER RPC (anon-callable) that refuses a revoked/expired/invalid token and returns the
// work; the client then reads tags + the author name (both allowed once the live link
// grants can_read_work). Any failure collapses to { dead:true } → the "link expired" state.
export async function loadSharedWork(token) {
  if (isDemo()) return demoSharedWork(token);
  const { data: w, error } = await supabase.rpc("resolve_share_link", { token });
  if (error || !w) return { dead: true };
  let who = null;
  if (w.author_id) {
    const { data: prof } = await supabase.from("profiles").select("handle,name").eq("id", w.author_id).maybeSingle();
    if (prof) who = { name: prof.name || prof.handle };
  }
  const { data: tagRows } = await supabase.from("content_tags").select("tag").eq("work_id", w.id);
  return {
    work: {
      id: w.id, title: w.title, name: w.title, kind: w.kind, file_ext: w.file_ext,
      blob_sha: w.blob_sha, bytes: w.bytes, created_at: w.created_at,
      who, tags: (tagRows || []).map((t) => t.tag),   // no colorIdx — anon/out-of-server, no hue
    },
  };
}

// Post a comment on a public post. RLS (`cmt_insert`) is the fence: only the author or a
// friend of the author may insert — a stranger's write is rejected by Postgres, surfaced
// here as a thrown error the caller turns into a toast (UI is only the signpost). Returns
// the shaped comment so the thread appends it without a refetch.
export async function postComment(workId, body) {
  const clean = (body || "").trim();
  if (!clean) throw new Error("Write something first");
  if (isDemo()) return { id: "local-" + Date.now(), name: "jax", text: clean, time: "now", mine: true };
  const user = session();
  if (!user) throw new Error("Sign in to comment");
  const { data, error } = await supabase.from("comments")
    .insert({ work_id: workId, user_id: user.id, body: clean })
    .select("id,body,created_at").single();
  if (error) throw new Error(error.message?.includes("row-level security") ? "Only the author and their friends can comment" : (error.message || "Couldn’t post the comment"));
  return { id: data.id, name: user.email?.split("@")[0] || "you", text: data.body || clean, time: fmtTime(data.created_at), mine: true };
}

// The home Feed (CANON §C.5) — the friends-only portfolio grid: friends' PUBLIC
// posts (visibility='public' and author ∈ accepted friends), same card renderer as
// the explorer, NO member colour (public context). The same "one component, two
// sources" pair as the explorer — this is the public source. Returns the rail shape
// plus `posts` (card-shaped works) so the shell wraps it.
export async function loadFeed() {
  if (isDemo()) return demoFeed();
  const user = session();
  if (!user) return { needsAuth: true, live: false };

  const { servers } = await loadRail(user);
  const me = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  // accepted friends (symmetric pair table: I'm a_user OR b_user)
  const { data: friRows } = await supabase.from("friendships").select("a_user,b_user,status").or(`a_user.eq.${user.id},b_user.eq.${user.id}`).eq("status", "accepted");
  const friendIds = (friRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user));

  let posts = [];
  if (friendIds.length) {
    const { data: workRows } = await supabase.from("works")
      .select("id,title,kind,file_ext,blob_sha,bytes,author_id,created_at")
      .eq("visibility", "public").in("author_id", friendIds).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(120);
    const authorIds = [...new Set((workRows || []).map((w) => w.author_id))];
    const profById = {};
    if (authorIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,handle,name").in("id", authorIds);
      for (const p of profs || []) profById[p.id] = p;
    }
    posts = (workRows || []).map((w) => {
      const a = profById[w.author_id];
      return {
        id: w.id, title: w.title, name: w.title, kind: w.kind, file_ext: w.file_ext,
        blob_sha: w.blob_sha, bytes: w.bytes, created_at: w.created_at, tags: [],
        who: a ? { name: a.name || a.handle } : null,   // no colorIdx — public, no hue
      };
    });
  }

  return { needsAuth: false, live: true, source: "feed", me, isAdmin: false, servers, dmUnread: 0, server: null, posts };
}

// A Profile (CANON §C.10) — a person's shelves. POV is viewer-dependent, enforced
// server-side by works_read + friendships (not a UI toggle): owner sees all three
// shelves + Settings; a stranger sees only Public; a friend sees Public + Server.
// We compute the POV for chrome, but RLS is the real fence — the shelf queries only
// return what the viewer may read, so we just group what comes back by visibility.
export async function loadProfile(handle) {
  if (isDemo()) return demoProfile(handle);
  const user = session();
  if (!user) return { needsAuth: true, live: false };

  const { servers } = await loadRail(user);
  const me = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  const { data: prof } = await supabase.from("profiles").select("id,handle,name,bio,avatar_key,banner_key,pronouns").eq("handle", handle).maybeSingle();
  if (!prof) return { needsAuth: false, live: true, notFound: true, me, servers, dmUnread: 0, server: null };

  let pov = "public";
  if (prof.id === user.id) pov = "owner";
  else {
    const { data: fr } = await supabase.from("friendships").select("status").or(`and(a_user.eq.${user.id},b_user.eq.${prof.id}),and(a_user.eq.${prof.id},b_user.eq.${user.id})`).eq("status", "accepted").maybeSingle();
    if (fr) pov = "mutual";
  }

  // RLS gates what's visible; group whatever returns by visibility into shelves.
  const { data: workRows } = await supabase.from("works")
    .select("id,title,kind,file_ext,blob_sha,bytes,visibility,created_at")
    .eq("author_id", prof.id).is("deleted_at", null).order("created_at", { ascending: false });
  const shelves = { public: [], server: [], private: [] };
  for (const w of workRows || []) {
    const card = { id: w.id, title: w.title, name: w.title, kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes, created_at: w.created_at, tags: [], who: { name: prof.name || prof.handle } };
    (shelves[w.visibility] ||= []).push(card);
  }

  return {
    needsAuth: false, live: true, source: "profile", me, servers, dmUnread: 0, server: null,
    profile: { id: prof.id, name: prof.name || prof.handle, handle: prof.handle, bio: prof.bio || "", initials: initials(prof.name || prof.handle), pronouns: prof.pronouns, avatar_key: prof.avatar_key || null, banner_key: prof.banner_key || null },
    pov, shelves,
  };
}

// Edit your own profile (CANON §C.10) — the text fields (name / handle / bio). A plain
// self-only `profiles` update (RLS `prof_update` = id === auth.uid()). The handle is
// globally UNIQUE, so a clash surfaces as "That handle is taken" (the constraint is the
// fence). Avatar/banner are R2 uploads, deferred to the R2 write env like file uploads.
// Returns the cleaned values so the profile hero repaints without a reload.
// Set your profile photo (or banner) — a self-only `profiles` update of the stored object
// key (RLS `prof_update`). The bytes are uploaded separately via upload-r2.js; this just
// points the profile at the resulting key. `field` is "avatar_key" or "banner_key".
export async function updateProfileImage(field, key) {
  if (field !== "avatar_key" && field !== "banner_key") throw new Error("bad image field");
  if (isDemo()) return key;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("profiles").update({ [field]: key }).eq("id", user.id);
  if (error) throw new Error(error.message || "Couldn’t update your photo");
  return key;
}

export async function updateProfile({ name, handle, bio }) {
  const h = (handle || "").trim().replace(/^@/, "");
  if (!h) throw new Error("A handle is required");
  if (!/^[a-z0-9_]+$/i.test(h)) throw new Error("Handles use only letters, numbers, and underscores");
  const vals = { name: (name || "").trim() || h, handle: h, bio: (bio || "").trim() };
  if (isDemo()) return vals;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("profiles").update(vals).eq("id", user.id);
  if (error) throw new Error(/duplicate|unique|23505/i.test(error.message || "") ? "That handle is taken" : (error.message || "Couldn’t save your profile"));
  return vals;
}

// Edit a server's identity (name + icon_key + cover_key) — a `servers` update fenced by
// servers_update (is_server_admin). Only the provided keys are written, so a name-only save
// doesn't clobber the icon. The image bytes are uploaded separately (upload-r2.js); this just
// points the row at the resulting object keys. Returns the applied patch for an in-place repaint.
export async function updateServer(serverId, patch = {}) {
  const p = {};
  if (patch.name != null) { const n = String(patch.name).trim(); if (!n) throw new Error("A server name is required"); p.name = n; }
  if (patch.icon_key !== undefined) p.icon_key = patch.icon_key;
  if (patch.cover_key !== undefined) p.cover_key = patch.cover_key;
  if (!Object.keys(p).length) return {};
  if (isDemo()) return p;
  const { error } = await supabase.from("servers").update(p).eq("id", serverId);
  if (error) throw new Error(error.message || "Couldn’t save the server");
  return p;
}

// ── Messages + Friends (P7.1, CANON §C — dms/friends) ────────────────────────
// The Messages screen: the DM thread list + the Friends panel. Friendships are an ORDERED
// pair (a_user < b_user); the "other" user is whichever end isn't me. dm_members / profiles
// have no FK to each other (user_id → auth.users), so profiles are fetched SEPARATELY into a
// byId map (the bug #1 embed hazard). No member hue — DMs/friends are outside any server.
export async function loadDMsScreen() {
  if (isDemo()) return demoDMs();
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  const { servers } = await loadRail(user);
  const me = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };

  const { data: friRows } = await supabase.from("friendships")
    .select("a_user,b_user,status,requested_by").or(`a_user.eq.${user.id},b_user.eq.${user.id}`);
  const { data: myDmMem } = await supabase.from("dm_members").select("dm_channel_id,pinned,muted,hidden").eq("user_id", user.id);
  const dmIds = (myDmMem || []).filter((m) => !m.hidden).map((m) => m.dm_channel_id);
  let channels = [], dmMemberRows = [];
  if (dmIds.length) {
    const [{ data: chs }, { data: mems }] = await Promise.all([
      supabase.from("dm_channels").select("id,is_group,name").in("id", dmIds),
      supabase.from("dm_members").select("dm_channel_id,user_id").in("dm_channel_id", dmIds),
    ]);
    channels = chs || []; dmMemberRows = mems || [];
  }

  const allIds = [...new Set([
    ...(friRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user)),
    ...dmMemberRows.filter((m) => m.user_id !== user.id).map((m) => m.user_id),
  ])];
  const profById = {};
  if (allIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key,presence_state").in("id", allIds);
    for (const p of profs || []) profById[p.id] = p;
  }
  const shapeUser = (id) => {
    const p = profById[id];
    const nm = p?.name || p?.handle || "user";
    return { id, name: nm, handle: p?.handle || nm, initials: initials(nm), avatar_key: p?.avatar_key || null, presence: p?.presence_state || "offline" };
  };

  const accepted = [], incoming = [], outgoing = [];
  for (const f of friRows || []) {
    const u = shapeUser(f.a_user === user.id ? f.b_user : f.a_user);
    if (f.status === "accepted") accepted.push(u);
    else if (f.status === "pending") (f.requested_by === user.id ? outgoing : incoming).push(u);
  }

  const memByChannel = {};
  for (const m of dmMemberRows) (memByChannel[m.dm_channel_id] ||= []).push(m.user_id);
  const metaById = {}; for (const m of myDmMem || []) metaById[m.dm_channel_id] = m;
  const dms = channels.map((ch) => {
    const others = (memByChannel[ch.id] || []).filter((id) => id !== user.id).map(shapeUser);
    const meta = metaById[ch.id] || {};
    return { id: ch.id, group: ch.is_group, name: ch.is_group ? (ch.name || others.map((o) => o.name).join(", ")) : (others[0]?.name || "dm"), members: others, pinned: !!meta.pinned, muted: !!meta.muted };
  });

  return { needsAuth: false, live: true, source: "dms", me, servers, dmUnread: 0, server: null, dms, friends: { accepted, incoming, outgoing } };
}

// Send a friend request by exact handle (add_friend RPC; idempotent on an existing pair).
export async function addFriend(handle) {
  const clean = (handle || "").trim().replace(/^@/, "");
  if (!clean) throw new Error("Enter a username");
  if (isDemo()) return;
  const { error } = await supabase.rpc("add_friend", { handle: clean });
  if (error) throw new Error(/no such handle/i.test(error.message) ? "No user with that username" : /blocked/i.test(error.message) ? "You can’t add this user" : (error.message || "Couldn’t send the request"));
}
// Answer an incoming request (respond_friend RPC): accept → friends, decline → the row is deleted.
export async function respondFriend(targetId, accept) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("respond_friend", { target_id: targetId, accept });
  if (error) throw new Error(error.message || "Couldn’t respond to the request");
}
// Open (or create) a 1:1 DM with a friend by handle (create_dm RPC → the dm_channels row).
// The RPC returns the dm_channels row; we hand back its id so the caller opens the thread.
export async function createDM(handle) {
  if (isDemo()) return null;
  const { data, error } = await supabase.rpc("create_dm", { handle: (handle || "").trim().replace(/^@/, "") });
  if (error) throw new Error(error.message || "Couldn’t start the conversation");
  return data?.id || null;
}

// Update your own DM membership prefs (pin / mute / hide) — a `dm_members` update fenced to
// your own row (dmm_update). `hide` is the reversible "close DM" (it drops from the list until
// a new message or a re-open). Patch is any of { pinned, muted, hidden }.
export async function setDMPref(dmChannelId, patch) {
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("dm_members").update(patch).eq("dm_channel_id", dmChannelId).eq("user_id", user.id);
  if (error) throw new Error(error.message || "Couldn’t update the conversation");
}

// Start a group DM with several friends by handle (create_group_dm RPC → the dm_channels row).
export async function createGroupDM(handles) {
  if (isDemo()) return null;
  const clean = (handles || []).map((h) => (h || "").trim().replace(/^@/, "")).filter(Boolean);
  const { data, error } = await supabase.rpc("create_group_dm", { handles: clean });
  if (error) throw new Error(error.message || "Couldn’t start the group");
  return data?.id || null;
}

// ── DM conversation (P7.2) ───────────────────────────────────────────────────
// A thread's messages. Members read (dmsg_read = dm_member). Authors have no FK to profiles
// (user_id → auth.users), so profiles are fetched SEPARATELY into a byId map (bug-#1 hazard).
// No member hue — DMs are outside any server, so author names render neutral.
function shapeDM(r, byId, meId) {
  const p = byId[r.user_id];
  const nm = p?.name || p?.handle || "user";
  return { id: r.id, author: { name: nm, initials: initials(nm), avatar_key: p?.avatar_key || null }, time: fmtTime(r.created_at), body: r.body || "", mine: r.user_id === meId };
}
export async function loadDMThread(dmChannelId) {
  if (isDemo()) return demoDMThread(dmChannelId);
  const user = session();
  if (!user) return { messages: [], memberById: {}, dmChannelId };
  const { data: rows } = await supabase.from("dm_messages")
    .select("id,body,user_id,created_at").eq("dm_channel_id", dmChannelId).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(300);
  const uids = [...new Set((rows || []).map((r) => r.user_id))];
  const byId = {};
  if (uids.length) { const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", uids); for (const p of profs || []) byId[p.id] = p; }
  return { messages: (rows || []).map((r) => shapeDM(r, byId, user.id)), memberById: byId, dmChannelId };
}
// Send a DM — a plain `dm_messages` insert (dmsg_insert = own + dm_member). Returns the shaped
// row so the stream appends it without a refetch (Realtime echo lands in a later pass).
export async function sendDM(dmChannelId, body) {
  const clean = (body || "").trim();
  if (!clean) throw new Error("Write something first");
  if (isDemo()) return { id: "local-" + Date.now(), author: { name: "jax", initials: "JX", avatar_key: null }, time: "now", body: clean, mine: true };
  const user = session();
  if (!user) throw new Error("Sign in");
  const { data, error } = await supabase.from("dm_messages").insert({ dm_channel_id: dmChannelId, user_id: user.id, body: clean }).select("id,body,created_at").single();
  if (error) throw new Error(error.message || "Couldn’t send the message");
  return { id: data.id, author: { name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), avatar_key: null }, time: fmtTime(data.created_at), body: data.body || clean, mine: true };
}

// ── Notifications (P7.3, CANON §C — notifications) ───────────────────────────
// In-app only (v1). Read/mark-read/delete your own (notif_read/update); inserts come from
// the P2 triggers. Actor profiles + server names are fetched SEPARATELY (bug-#1 hazard). The
// row text is built from `kind` + the actor; the excerpt renders as a quote. No member hue.
const NOTIF_VERB = { mention: "mentioned you", comment: "commented on your post", join: "joined", reaction: "reacted to your message", invite: "invited you", friend: "sent you a friend request" };
const NOTIF_ICON = { mention: "at", comment: "comment", join: "user", reaction: "smile", invite: "mail", friend: "user" };
// Where a notification leads when clicked (best-effort v1): a friend request → Messages, any
// server-scoped event → that server. Exact target permalinks (channel/message/post) arrive
// with permalink routing later; null means the row just marks read without navigating.
function notifHref(r) {
  if (r.kind === "friend") return "/messages";
  if (r.server_id) return `/s/${r.server_id}`;
  return null;
}
function shapeNotif(r, actById, srvById) {
  const a = actById[r.actor_id];
  const actor = a?.name || a?.handle || "someone";
  const srv = srvById[r.server_id]?.name || null;
  return {
    id: r.id, kind: r.kind, actor, avatar_key: a?.avatar_key || null,
    text: NOTIF_VERB[r.kind] || "sent you a notification",
    icon: NOTIF_ICON[r.kind] || "bell",
    context: srv, excerpt: r.excerpt || "", href: notifHref(r),
    time: fmtWhen(r.created_at), read: !!r.read_at,
  };
}
function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return fmtTime(ts);
  const days = Math.floor((now - d) / 86400000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export async function loadNotifications() {
  if (isDemo()) return demoNotifications();
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  const { servers } = await loadRail(user);
  const me = { id: user.id, name: user.email?.split("@")[0] || "you", initials: initials(user.email || "you"), handle: user.email?.split("@")[0] || "you", colorIdx: 1 };
  const { data: rows } = await supabase.from("notifications")
    .select("id,kind,actor_id,server_id,excerpt,read_at,created_at").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(100);
  const actorIds = [...new Set((rows || []).map((r) => r.actor_id).filter(Boolean))];
  const serverIds = [...new Set((rows || []).map((r) => r.server_id).filter(Boolean))];
  const actById = {}, srvById = {};
  if (actorIds.length) { const { data } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", actorIds); for (const p of data || []) actById[p.id] = p; }
  if (serverIds.length) { const { data } = await supabase.from("servers").select("id,name").in("id", serverIds); for (const s of data || []) srvById[s.id] = s; }
  const items = (rows || []).map((r) => shapeNotif(r, actById, srvById));
  return { needsAuth: false, live: true, source: "notifications", me, servers, dmUnread: 0, server: null, items, unread: items.filter((i) => !i.read).length };
}
export async function markNotifRead(id) {
  if (isDemo()) return;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Couldn’t update");
}
export async function markAllNotifsRead() {
  if (isDemo()) return;
  const user = session();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
}

// Delete your own channel message — a tombstone (deleted_at); loadWorkspace filters
// `deleted_at is null`, so it drops from the stream. `msg_update` fences it (own or a
// moderator). Pin a message to the channel via the pin_message RPC (perm-gated server-side).
export async function deleteMessage(messageId) {
  if (isDemo()) return;
  const { error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
  if (error) throw new Error(error.message || "Couldn’t delete the message");
}
export async function pinMessage(messageId) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("pin_message", { message_id: messageId });
  if (error) throw new Error(error.message || "Couldn’t pin the message");
}
// Edit your own channel message — a `messages` body update + edited_at stamp (msg_update = own).
export async function editMessage(messageId, body) {
  const clean = (body || "").trim();
  if (!clean) throw new Error("Message can’t be empty");
  if (isDemo()) return;
  const { error } = await supabase.from("messages").update({ body: clean, edited_at: new Date().toISOString() }).eq("id", messageId);
  if (error) throw new Error(error.message || "Couldn’t edit the message");
}

// ── Moderation (P8, CANON §B — admin RPCs) ───────────────────────────────────
// Kick / Timeout / Ban a member. All are SECURITY DEFINER RPCs, perm-gated server-side (the
// caller must hold the kick/ban/timeout permission) — the UI is only the signpost.
export async function kickMember(serverId, targetUser) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("kick_member", { server_id: serverId, target_user: targetUser });
  if (error) throw new Error(error.message || "Couldn’t remove the member");
}
export async function timeoutMember(serverId, targetUser, until) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("timeout_member", { server_id: serverId, target_user: targetUser, until });
  if (error) throw new Error(error.message || "Couldn’t time out the member");
}
export async function banMember(serverId, targetUser, reason) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("ban_member", { server_id: serverId, target_user: targetUser, reason: reason || null });
  if (error) throw new Error(error.message || "Couldn’t ban the member");
}
// Quick-switcher (⌘K) data — your servers + accepted friends, for a global jump palette.
export async function loadSwitcher() {
  if (isDemo()) return {
    servers: [{ id: "lb", name: "Late Bloom LP", initials: "LB" }, { id: "sp", name: "Specter", initials: "SP" }, { id: "bs", name: "Beat swap", initials: "BS" }],
    friends: [{ name: "dev", handle: "dev", initials: "DV" }, { name: "mira", handle: "mira", initials: "MI" }, { name: "rae", handle: "rae", initials: "RA" }],
  };
  const user = session();
  if (!user) return { servers: [], friends: [] };
  const { servers } = await loadRail(user);
  const { data: friRows } = await supabase.from("friendships").select("a_user,b_user,status").or(`a_user.eq.${user.id},b_user.eq.${user.id}`).eq("status", "accepted");
  const ids = (friRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user));
  let friends = [];
  if (ids.length) { const { data: profs } = await supabase.from("profiles").select("id,handle,name").in("id", ids); friends = (profs || []).map((p) => ({ name: p.name || p.handle, handle: p.handle, initials: initials(p.name || p.handle) })); }
  return { servers, friends };
}

// ── Create / join a server (P9) ──────────────────────────────────────────────
// Create a server ENTIRELY client-side: has_perm() grants the server owner (owner_id) every
// permission, so each insert passes its own RLS in turn — no RPC needed. Order matters:
// server → owner membership (sm_insert=is_server_admin, true for the owner) → the @everyone
// default role (permissions = everyone_perms() = 113664, the non-admin baseline) → starter
// channels. NOTE: these are separate inserts, not one transaction — a mid-sequence failure
// (unlikely: only the owner's own network) would leave a partial server; a future atomic
// create_server RPC would harden it. `everyone_perms()` is inlined as 113664 (see schema-02).
const EVERYONE_PERMS = 113664;
export async function createServer(name, channels = ["general"]) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("A server name is required");
  if (isDemo()) return { id: "new-server", name: clean };
  const user = session();
  if (!user) throw new Error("Sign in to create a server");
  const { data: srv, error } = await supabase.from("servers").insert({ name: clean, owner_id: user.id }).select("id,name").single();
  if (error) throw new Error(error.message || "Couldn’t create the server");
  const { error: me } = await supabase.from("server_members").insert({ server_id: srv.id, user_id: user.id, color: 1 });
  if (me) throw new Error(me.message || "Couldn’t set up your membership");
  await supabase.from("roles").insert({ server_id: srv.id, name: "everyone", is_default: true, permissions: EVERYONE_PERMS, position: 0 });
  const names = (channels.length ? channels : ["general"]).map((n) => n.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")).filter(Boolean);
  await supabase.from("channels").insert((names.length ? names : ["general"]).map((n, i) => ({ server_id: srv.id, name: n, kind: "text", position: i })));
  clearWorkspaceCache();   // the rail must re-read to show the new server
  return srv;
}

// Per-user server notification prefs (server_prefs, sp_all = own). level: all/mentions/none;
// suppress_everyone hides @everyone/@here pings. Read the current, upsert on save.
export async function loadServerPrefs(serverId) {
  if (isDemo()) return { level: "all", suppress_everyone: false };
  const user = session();
  if (!user) return { level: "all", suppress_everyone: false };
  const { data } = await supabase.from("server_prefs").select("level,suppress_everyone").eq("user_id", user.id).eq("server_id", serverId).maybeSingle();
  return data || { level: "all", suppress_everyone: false };
}
export async function setServerPrefs(serverId, patch) {
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("server_prefs").upsert({ user_id: user.id, server_id: serverId, ...patch }, { onConflict: "user_id,server_id" });
  if (error) throw new Error(error.message || "Couldn’t save your notification settings");
}

// Delete a server (owner only, servers_delete = owner_id). FK cascades remove its members,
// channels, works, invites, etc. Irreversible — the UI gates it behind a type-to-confirm.
export async function deleteServer(serverId) {
  if (isDemo()) return;
  const { error } = await supabase.from("servers").delete().eq("id", serverId);
  if (error) throw new Error(error.message || "Couldn’t delete the server");
  clearWorkspaceCache();
}

// Leave a server — delete your own `server_members` row (sm_delete = own or admin). Owners
// are guarded in the UI (they'd orphan the server); everyone else leaves cleanly.
export async function leaveServer(serverId) {
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("server_members").delete().eq("server_id", serverId).eq("user_id", user.id);
  if (error) throw new Error(error.message || "Couldn’t leave the server");
  clearWorkspaceCache();
}

// Create an invite for a server — a direct `server_invites` insert (si_insert = admin). The
// code is URL-safe random; the shareable link is `/join/:code`, consumed by join_via_invite.
// Mint an invite code. opts.expiresDays (null = never) and opts.maxUses (null = unlimited) map
// to the server_invites columns join_via_invite already enforces (expiry + a locked uses check).
export async function createInvite(serverId, { expiresDays = null, maxUses = null } = {}) {
  const code = (crypto.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, "").slice(0, 12);
  if (isDemo()) return code;
  const user = session();
  const expires_at = expiresDays ? new Date(Date.now() + expiresDays * 864e5).toISOString() : null;
  const { error } = await supabase.from("server_invites").insert({ code, server_id: serverId, created_by: user?.id || null, expires_at, max_uses: maxUses });
  if (error) throw new Error(error.message || "Couldn’t create the invite");
  return code;
}

// The active invite links for a server (admin-only read via si_read). Expired ones are dropped
// so the list shows only links that still work; each carries its expiry + usage for the panel.
export async function loadInvites(serverId) {
  if (isDemo()) return demoInvites();
  const { data, error } = await supabase.from("server_invites")
    .select("code,expires_at,max_uses,uses,created_at")
    .eq("server_id", serverId)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Couldn’t load the invites");
  return data || [];
}

// Revoke an invite (a hard delete under si_delete). join_via_invite then sees no row → invalid.
export async function revokeInvite(code) {
  if (isDemo()) return;
  const { error } = await supabase.from("server_invites").delete().eq("code", code);
  if (error) throw new Error(error.message || "Couldn’t revoke the invite");
}

// Join a server by an invite code or a pasted invite link (join_via_invite RPC).
export async function joinServer(input) {
  const code = String(input || "").trim().split("?")[0].split("/").filter(Boolean).pop();
  if (!code) throw new Error("Paste an invite link or code");
  if (isDemo()) return { id: "joined", name: "the server" };
  const { data, error } = await supabase.rpc("join_via_invite", { code });
  if (error) throw new Error(/expired|revoked|invalid|full|not found|no such/i.test(error.message || "") ? "That invite link isn’t valid anymore" : (error.message || "Couldn’t join the server"));
  clearWorkspaceCache();
  return data;
}

// Create a channel — a direct `channels` insert, fenced by `ch_write` (manage_channels). The
// name is normalised to a handle (lowercase, dashes). Returns the new {id,name} so the caller
// can navigate into it.
export async function createChannel(serverId, name, kind = "text") {
  const clean = (name || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!clean) throw new Error("A channel name is required");
  if (isDemo()) return { id: "new-" + clean, name: clean };
  const { data, error } = await supabase.from("channels").insert({ server_id: serverId, name: clean, kind }).select("id,name").single();
  if (error) throw new Error(/duplicate|unique|23505/i.test(error.message || "") ? "A channel with that name already exists" : (error.message || "Couldn’t create the channel"));
  return data;
}

// Update a channel's settings (name/topic/slowmode_sec/post_policy) — a direct `channels`
// update, fenced by `ch_write` (manage_channels). Name is normalised to a handle.
export async function updateChannel(channelId, patch) {
  const p = { ...patch };
  if (p.name != null) { p.name = String(p.name).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""); if (!p.name) throw new Error("A channel name is required"); }
  if (isDemo()) return p;
  const { error } = await supabase.from("channels").update(p).eq("id", channelId);
  if (error) throw new Error(/duplicate|unique|23505/i.test(error.message || "") ? "A channel with that name already exists" : (error.message || "Couldn’t update the channel"));
  return p;
}

// Replace a member's assignable (non-default) roles (set_member_roles RPC, manage_roles-gated).
export async function setMemberRoles(serverId, targetUser, roleIds) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("set_member_roles", { server_id: serverId, target_user: targetUser, role_ids: roleIds });
  if (error) throw new Error(error.message || "Couldn’t update the member's roles");
}

// Toggle your reaction to a channel message (toggle_reaction RPC — adds if absent, removes if
// present; returns true=added / false=removed). The caller flips the chip optimistically.
export async function toggleReaction(messageId, emoji) {
  if (isDemo()) return null;
  const user = session();
  if (!user) throw new Error("Sign in to react");
  const { data, error } = await supabase.rpc("toggle_reaction", { message_id: messageId, emoji });
  if (error) throw new Error(error.message || "Couldn’t react");
  return data;
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
