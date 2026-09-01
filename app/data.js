// data.js — the workspace data layer. One function shapes everything the
// workspace screen renders, so the screen never talks to Supabase directly and
// the same shape drives the demo, the live, and the empty renders.
//
// Three sources, one shape:
//  - `?demo=1`   → the Late Bloom LP fixture (demo.js), matching the gallery.
//  - signed in   → LIVE reads from Supabase (P4.10). Realtime patching lives in
//                  realtime.js + workspace.js; this module does the initial reads.
//  - signed out  → { needsAuth:true } so the shell shows a sign-in prompt.

// demo.js (the Late Bloom LP fixture, ~25 KB) is NEVER statically imported — every real user
// would otherwise download it and never use it. Each `isDemo()` branch below dynamic-imports it
// on the spot instead (OPTIMIZATION.md §1.2); the module is fetched once and cached by the
// browser/ESM loader, so a demo SESSION (which hits many of these branches) pays the cost once.
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
  const [smRes, profRes] = await Promise.all([
    supabase.from("server_members").select("color, server:servers(id,name,owner_id,icon_key,cover_key)").eq("user_id", user.id),
    // Also pull bio + banner_key here so loadUserSettings can reuse this cached row instead of
    // firing a second identical `profiles` read (P2 — the settings Profile panel was re-fetching
    // what the rail already had). The extra two columns are free on a row we already select.
    supabase.from("profiles").select("handle,name,avatar_key,banner_key,bio,status_emoji,status_text,presence_state").eq("id", user.id).maybeSingle(),
  ]);
  const rows = smRes.data || [];
  const servers = rows.filter((r) => r.server).map((r) => ({ id: r.server.id, name: r.server.name, initials: initials(r.server.name), icon_key: r.server.icon_key || null }));
  // The canonical signed-in identity. `handle` MUST come from the profiles row, never the
  // email prefix — otherwise a self profile link (/u/:handle) points at the wrong handle the
  // moment the user picks a username, and 404s. Fall back to the email prefix ONLY when no
  // profile/handle exists yet (fresh account before onboarding). See meFor().
  // `hasProfile` gates onboarding: a fresh account has no profiles row (no signup trigger),
  // so the app must send it through create-profile before it can be linked to.
  const result = { myServers: rows, servers, me: meFor(user, profRes.data), profile: profRes.data || null, hasProfile: !!(profRes.data && profRes.data.handle), profileErr: !!profRes.error };
  // B21: only CACHE when the reads actually SUCCEEDED. A transient error returns null data → an
  // empty rail (no servers); caching THAT stranded the user with a serverless rail until a manual
  // reload (owner: "sometimes my server isn't there, I reload to get it back"). On any error, skip
  // the cache so the next render retries the fetch instead of serving a bad empty snapshot.
  if (!smRes.error && !profRes.error) _cache.rail = result;
  return result;
}

// True when the signed-in user hasn't set up a profile yet (no handle). Drives the one-time
// create-profile onboarding gate in main.js. Signed-out returns false — that's needsAuth,
// handled separately.
export async function needsProfileSetup() {
  const user = session();
  if (!user || isDemo()) return false;
  let { hasProfile, profileErr } = await loadRail(user);
  // A returning user MUST NOT be dumped into onboarding because a profiles read hiccuped on a fresh
  // device (owner: signed in on another PC → sent to account creation, though the profile exists).
  // prof_read is `true`, so a real profile is always readable — a null-with-error is a transient
  // failure, not "no account". Retry once (uncached), then only onboard when we CONFIRMED no profile.
  if (profileErr) { clearWorkspaceCache(); ({ hasProfile, profileErr } = await loadRail(user)); }
  return !hasProfile && !profileErr;
}

// Create the signed-in user's profile (onboarding). An UPSERT on `id` so it works whether a
// partial row exists or none does (prof_insert / prof_update both fence to id = auth.uid()).
// The handle is globally UNIQUE — a clash surfaces as "That username is taken".
export async function createProfile({ handle, name }) {
  const h = (handle || "").trim().replace(/^@/, "");
  if (!h) throw new Error("Pick a username");
  if (!/^[a-z0-9_]{2,20}$/i.test(h)) throw new Error("Usernames are 2–20 letters, numbers, or underscores");
  const vals = { handle: h, name: (name || "").trim() || h };
  if (isDemo()) return vals;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("profiles").upsert({ id: user.id, ...vals }, { onConflict: "id" });
  if (error) throw new Error(/duplicate|unique|23505/i.test(error.message || "") ? "That username is taken" : (error.message || "Couldn’t create your profile"));
  clearWorkspaceCache();   // rail.me + hasProfile are cached — refresh so the app sees the new identity
  return vals;
}

// Build the canonical `me` for the signed-in user. Handle/name come from the profiles row;
// the email prefix is a last-resort fallback for an account with no profile yet. Everything
// that needs "who am I" (rail avatar, the Profile link, the feed You tab) reads this so a
// username change is reflected everywhere and never leaves a stale email-prefix handle.
export function meFor(user, prof) {
  const emailStem = user?.email?.split("@")[0] || "you";
  const handle = (prof?.handle || emailStem);
  const name = prof?.name || handle;
  return { id: user?.id || null, name, handle, initials: initials(name), avatar_key: prof?.avatar_key || null, colorIdx: 1,
    status_emoji: prof?.status_emoji || "", status_text: prof?.status_text || "", presence_state: prof?.presence_state || "online" };
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

// P20 — the channel stream is windowed to the newest N top-level messages (was an unbounded
// fetch of the whole history on every channel open). `loadEarlierMessages` pages older ones in
// on scroll-up. B3 permalinks to a message outside the window are handled by the scroll-up loader
// (workspace.js fetches earlier until the ?m=<id> row is found, then flashes it).
const CHANNEL_PAGE = 50;

// Resolve a set of TOP-LEVEL message rows into the shaped messages the stream renders — reply
// counts, grouped reactions, forward quote-blocks (§C.4), and attachment cards (B5). Shared by
// the initial windowed load and the scroll-up load-earlier so both stay identical. `chanNameById`
// maps channel_id → name (for forwards' "from #channel" + attachment placement labels).
async function resolveTopMessages(top, membersById, chanNameById, userId) {
  if (!top || !top.length) return [];
  const topIds = top.map((r) => r.id);
  const fwdIds = [...new Set(top.filter((r) => r.forwarded_from).map((r) => r.forwarded_from))];
  const attachIds = [...new Set(top.filter((r) => r.work_id).map((r) => r.work_id))];

  // Perf (P30): these four grouped reads only depend on `top` (already in hand), never on each
  // other — so fire them CONCURRENTLY instead of awaiting one at a time. On a channel switch this
  // was reply-counts → reactions → forwards → attachments in series (up to 4 sequential round-trips);
  // one Promise.all collapses them to a single round-trip's latency. Post-processing is unchanged.
  const [{ data: reps }, { data: rxAll }, { data: srcs }, [{ data: aworks }, { data: atags }]] = await Promise.all([
    // reply counts: replies aren't rendered inline in the stream, only counted (the thread view
    // fetches the bodies on open).
    supabase.from("messages").select("parent_id").in("parent_id", topIds).is("deleted_at", null),
    // reactions grouped for the windowed messages
    supabase.from("message_reactions").select("message_id,emoji,user_id").in("message_id", topIds),
    // forwards → each source's quote block (only sources the viewer can read, RLS fences it)
    fwdIds.length
      ? supabase.from("messages").select("id,body,user_id,channel_id,created_at").in("id", fwdIds)
      : Promise.resolve({ data: [] }),
    // attachment messages (B5): work_id → the attachment card in the stream (+ its tags)
    attachIds.length
      ? Promise.all([
          supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,visibility,created_at").in("id", attachIds).is("deleted_at", null),
          supabase.from("content_tags").select("work_id,tag").in("work_id", attachIds),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }]),
  ]);

  const replyCount = {};
  for (const r of reps || []) replyCount[r.parent_id] = (replyCount[r.parent_id] || 0) + 1;

  const rxByMsg = {};
  for (const r of rxAll || []) {
    (rxByMsg[r.message_id] ||= {});
    (rxByMsg[r.message_id][r.emoji] ||= { emoji: r.emoji, n: 0, mine: false });
    rxByMsg[r.message_id][r.emoji].n++;
    if (r.user_id === userId) rxByMsg[r.message_id][r.emoji].mine = true;
  }

  const srcById = {};
  for (const s of srcs || []) {
    const a = membersById[s.user_id] || { name: "someone", colorIdx: 1 };
    srcById[s.id] = { author: { name: a.name, colorIdx: a.colorIdx }, fromChannel: chanNameById[s.channel_id] || "a channel", text: s.body || "", when: fmtWhen(s.created_at) };
  }

  const attachById = {};
  const atagsByWork = {}; for (const t of atags || []) (atagsByWork[t.work_id] ||= []).push(t.tag);
  for (const w of aworks || []) attachById[w.id] = shapeWork(w, null, membersById, chanNameById, atagsByWork[w.id] || []);

  return top.map((r) => {
    const m = shapeMessage(r, membersById);
    m.replies = replyCount[r.id] || 0;
    m.reactions = Object.values(rxByMsg[r.id] || {});
    if (r.forwarded_from && srcById[r.forwarded_from]) m.forward = srcById[r.forwarded_from];
    if (r.work_id && attachById[r.work_id]) m.attach = attachById[r.work_id];
    return m;
  });
}

// P20 — page older top-level messages in on scroll-up. `beforeIso` is the created_at of the
// oldest message currently loaded; returns the next-older window (ascending) + whether more
// remain + the new oldest cursor. Reuses `data` for membersById + the channel-name map.
export async function loadEarlierMessages(channelId, beforeIso, data) {
  if (isDemo() || !channelId || !beforeIso) return { messages: [], hasMore: false, oldestAt: beforeIso };
  const user = session();
  const chanNameById = {};
  for (const g of data.channelGroups || []) for (const c of g.channels || []) chanNameById[c.id] = c.name;
  const { data: topRows } = await supabase.from("messages")
    .select("id,body,created_at,edited_at,parent_id,user_id,deleted_at,forwarded_from,work_id")
    .eq("channel_id", channelId).is("parent_id", null).is("deleted_at", null)
    .lt("created_at", beforeIso).order("created_at", { ascending: false }).limit(CHANNEL_PAGE);
  const top = (topRows || []).slice().reverse();   // fetched newest-first → ascending for the stream
  const messages = await resolveTopMessages(top, data.membersById, chanNameById, user?.id);
  return { messages, hasMore: (topRows || []).length === CHANNEL_PAGE, oldestAt: top.length ? top[0].created_at : beforeIso };
}

// ── the live read (P4.10) ───────────────────────────────────────────────────
export async function loadWorkspace({ serverId, channelId } = {}) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoWorkspace(); }
  const user = session();
  if (!user) return emptyWorkspace(serverId, channelId, /*needsAuth*/ true);

  const { myServers, servers, me: meBase } = await loadRail(user);

  const activeServer = myServers.find((r) => r.server && r.server.id === serverId)?.server
    || (!serverId ? myServers[0]?.server : null);
  if (!activeServer) return { ...emptyWorkspace(serverId, channelId, false), me: meBase, servers };
  const sid = activeServer.id;

  // server-level data (members/roles/channels/profiles) is cached per server — a
  // channel switch within the same server then only fetches that channel's messages.
  const bundle = await loadServerBundle(activeServer);
  const { membersById, memberGroups, channelGroups, textCh, serverRoles } = bundle;
  const meMember = membersById[user.id];
  // Carry avatar_key from the rail identity — the members row doesn't always have it, and
  // without it the rail profile button falls back to initials while inside a server (owner bug).
  const me = meMember
    ? { id: user.id, name: meMember.name, initials: meMember.initials, handle: meMember.handle || meMember.name, colorIdx: meMember.colorIdx, avatar_key: meMember.avatar_key || meBase.avatar_key || null }
    : meBase;

  // voice channels are v2 — never selectable as the active (text) channel (P4-BUG#3)
  const activeChannel = textCh.find((c) => c.id === channelId) || textCh[0] || null;

  // Perf (P30): the per-channel unread counts (P19, one membership-gated RPC) and the active
  // channel's messages+pins are independent reads — fire them CONCURRENTLY instead of awaiting the
  // unread RPC first and the messages after it (two serial round-trips on every channel switch).
  const cid = activeChannel?.id || null;
  const unreadP = supabase.rpc("channel_unread_counts", { p_server: sid })
    .then((r) => r.data || []).catch(() => []);
  // P20: window to the newest CHANNEL_PAGE top-level messages (fetch newest-first, reverse to
  // ascending for the stream) instead of the whole channel history. `hasMore` = we hit the page
  // limit, so a scroll-up load-earlier is offered.
  const chanP = activeChannel
    ? Promise.all([
        supabase.from("messages").select("id,body,created_at,edited_at,parent_id,user_id,deleted_at,forwarded_from,work_id").eq("channel_id", cid).is("parent_id", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(CHANNEL_PAGE),
        supabase.from("message_pins").select("message_id,pinned_by,created_at, message:messages(body,user_id)").eq("channel_id", cid).order("created_at"),
      ])
    : Promise.resolve([{ data: [] }, { data: [] }]);
  const [uc, [{ data: topRows }, { data: pinRows }]] = await Promise.all([unreadP, chanP]);

  // Annotate a FRESH channelGroups (never the per-server cached bundle) with the unread counts.
  // The channel we're opening reads as 0 regardless (attachLive marks it read on mount).
  const unreadById = {};
  for (const r of uc || []) unreadById[r.channel_id] = r.unread;
  const channelGroupsUnread = channelGroups.map((g) => ({
    ...g,
    channels: g.channels.map((c) => {
      const n = c.id === activeChannel?.id ? 0 : (unreadById[c.id] || 0);
      return { ...c, unread: n > 0, unreadCount: n };
    }),
  }));

  let messages = [], pins = [], pinCount = 0, hasMoreMessages = false, oldestMsgAt = null;
  if (activeChannel) {
    const chanNameById = {}; for (const c of textCh) chanNameById[c.id] = c.name;
    const top = (topRows || []).slice().reverse();
    hasMoreMessages = (topRows || []).length === CHANNEL_PAGE;
    oldestMsgAt = top.length ? top[0].created_at : null;
    messages = await resolveTopMessages(top, membersById, chanNameById, user.id);
    pins = (pinRows || []).map((p) => {
      const auth = membersById[p.message?.user_id] || { name: "unknown", colorIdx: 1 };
      const byName = membersById[p.pinned_by]?.name || "someone";
      return { id: p.message_id, by: byName, author: { name: auth.name, initials: initials(auth.name), colorIdx: auth.colorIdx }, time: fmtTime(p.created_at), text: p.message?.body || "" };
    });
    pinCount = pins.length;
  }

  // NB the per-channel Files TAB was removed (round-5): channel uploads surface as file messages
  // in the stream (resolved above via messages.work_id) + in the server File explorer, so a
  // separate channel-scoped file fetch here is dead weight. `files` stays [] for the workspace.

  return {
    needsAuth: false, live: true,
    me, isAdmin: !!membersById[user.id]?.admin, isOwner: activeServer.owner_id === user.id, servers, dmUnread: 0,
    server: { id: sid, name: activeServer.name, initials: initials(activeServer.name), icon_key: activeServer.icon_key || null, cover_key: activeServer.cover_key || null },
    channelGroups: channelGroupsUnread,
    channel: activeChannel ? { id: activeChannel.id, name: activeChannel.name, topic: "", pins: pinCount, files: 0, slowmode: activeChannel.slowmode_sec, postPolicy: activeChannel.post_policy, hasMore: hasMoreMessages, oldestAt: oldestMsgAt } : null,
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
    authorId: w.author_id || null,   // B13: lets the card/detail menus gate write items by ownership
    kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes,
    hidden: !!w.hidden, visibility: w.visibility || null, created_at: w.created_at, tags,
    folderId: place?.folder_id || null,
    channelName: place?.channel_id ? chanName[place.channel_id] || null : null,
    who: a ? { name: a.name, colorIdx: a.colorIdx, handle: a.handle } : null,
  };
}

// Resolve one work into the attachment-card shape (shapeWork) for a live channel-upload echo
// (B5): the realtime message row carries only work_id, so when it lands we fetch the work + its
// tags and shape it with the caller's already-loaded membersById. Returns null if it can't read
// the work (RLS) or it was deleted — the message then just renders without an attachment.
export async function fetchChannelAttachment(workId, membersById = {}, chanName = {}) {
  if (!workId || isDemo()) return null;
  const [{ data: w }, { data: tags }] = await Promise.all([
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,visibility,created_at").eq("id", workId).is("deleted_at", null).maybeSingle(),
    supabase.from("content_tags").select("tag").eq("work_id", workId),
  ]);
  if (!w) return null;
  return shapeWork(w, null, membersById, chanName, (tags || []).map((t) => t.tag));
}

// P-RT: resolve one work into the EXPLORER's file shape (loadServerExplorer/loadPersonalExplorer's
// per-row shape, not the channel-attachment one above) for a live works INSERT/UPDATE echo — the
// postgres_changes payload carries only the changed columns, never the joined placement/tags a card
// needs. Mirrors those two loaders' per-file shaping exactly so a realtime-added file renders
// identically to one from the initial load. Returns null if it can't read the work (RLS) or it was
// soft-deleted after the event fired.
export async function fetchExplorerFile(workId, { source = "server", serverId = null, membersById = {} } = {}) {
  if (!workId || isDemo()) return null;
  const isServer = source === "server";
  const [{ data: w }, { data: tagRows }, { data: place }] = await Promise.all([
    supabase.from("works").select("id,title,kind,file_ext,blob_sha,bytes,author_id,hidden,visibility,created_at").eq("id", workId).is("deleted_at", null).maybeSingle(),
    supabase.from("content_tags").select("tag").eq("work_id", workId),
    isServer
      ? supabase.from("placement").select("folder_id,channel_id").eq("work_id", workId).eq("surface", "server").eq("surface_id", serverId).maybeSingle()
      : supabase.from("saved_items").select("folder_id").eq("work_id", workId).maybeSingle(),
  ]);
  if (!w) return null;
  const tags = (tagRows || []).map((t) => t.tag);
  if (isServer) return shapeWork(w, place, membersById, {}, tags);
  return {
    id: w.id, title: w.title, name: w.title,
    kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes,
    hidden: !!w.hidden, created_at: w.created_at, tags,
    folderId: place?.folder_id || null, starred: false,
    channelName: null, who: null,
  };
}

// P24: server-side file search (the search_files RPC — schema-35). Does the heavy matching in
// Postgres so it scales past the client-side substring filter: full-text over the filename +
// tag-contains (B19), the P21 modifiers (exact tags, hastag types, sortby), plus Type(ext)/Date
// facets, paginated. Returns { total, items } with items shaped exactly like data.files (so the
// same explorer cards/handlers render them). `membersById` gives the member hue; `starredIds` sets
// the star state from what the explorer already knows. Throws on RPC error (the caller falls back
// to the client-side filter over the already-loaded works).
export async function searchFiles(opts = {}) {
  const {
    source = "server", serverId = null, text = null, tags = [], hastypes = [], exts = [],
    uploader = null, since = null, sort = "latest", sortTag = null, dir = "desc",
    limit = 60, offset = 0, membersById = {}, starredIds = null,
    folderId = null,   // schema-42: never search above this folder; null = the whole mount
  } = opts;
  const { data, error } = await supabase.rpc("search_files", {
    p_source: source, p_server: serverId, p_text: text || null,
    p_tags: tags || [], p_hastypes: hastypes || [], p_exts: exts || [],
    p_uploader: uploader || null, p_since: since || null,
    p_sort: sort || "latest", p_sort_tag: sortTag || null, p_dir: dir || "desc",
    p_limit: limit, p_offset: offset, p_folder_id: folderId,
  });
  if (error) throw error;
  const rows = data || [];
  const total = rows.length ? Number(rows[0].total || rows.length) : 0;
  const items = rows.map((r) => {
    const m = membersById[r.author_id];
    return {
      id: r.id, title: r.title, name: r.title, authorId: r.author_id || null,
      kind: r.kind, file_ext: r.file_ext, blob_sha: r.blob_sha, bytes: r.bytes,
      hidden: !!r.hidden, created_at: r.created_at, tags: r.tags || [],
      folderId: r.folder_id || null, channelName: r.channel_name || null,
      // avatar_key + initials feed the uploader pfp in the card band (tile redesign); membersById
      // carries the key, the flat author_* fallback (out-of-server author) has no pfp → initials.
      who: m ? { name: m.name, colorIdx: m.colorIdx, handle: m.handle, avatar_key: m.avatar_key || null, initials: m.initials || initials(m.name) }
             : ((r.author_name || r.author_handle) ? { name: r.author_name || r.author_handle, handle: r.author_handle, initials: initials(r.author_name || r.author_handle) } : null),
      starred: starredIds ? starredIds.has(r.id) : false,
    };
  });
  return { total, items };
}

// schema-42: the "if an entire folder matches, surface it too" half — a folder's own name/tags,
// same downward-only scope as searchFiles (never above p_folder_id), the folder you're standing
// in excluded from its own results. Shaped to match the explorer's normal folder rows so a search
// result folder card renders identically to a browsed one.
export async function searchFolders(opts = {}) {
  const { source = "server", serverId = null, text = null, tags = [], folderId = null, limit = 30 } = opts;
  const { data, error } = await supabase.rpc("search_folders", {
    p_source: source, p_server: serverId, p_text: text || null, p_tags: tags || [],
    p_folder_id: folderId, p_limit: limit,
  });
  if (error) throw error;
  return (data || []).map((f) => ({
    id: f.id, name: f.name, parentId: f.parent_id, archived: false, locked: false,
    count: 0, tags: f.tags || [], createdAt: f.created_at,
  }));
}

export async function loadExplorer({ serverId, folderId, source = "server" } = {}) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoExplorer(source); }
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  if (source === "personal") return loadPersonalExplorer(user, folderId);

  const { myServers, servers, me: meBase } = await loadRail(user);

  const activeServer = myServers.find((r) => r.server && r.server.id === serverId)?.server
    || (!serverId ? myServers[0]?.server : null);
  if (!activeServer) return { needsAuth: false, live: true, noServer: true, me: meBase, servers, dmUnread: 0 };
  const sid = activeServer.id;

  const bundle = await loadServerBundle(activeServer);
  const { membersById, channelGroups, textCh } = bundle;
  const meMember = membersById[user.id];
  // Carry avatar_key from the rail identity — the members row doesn't always have it, and
  // without it the rail profile button falls back to initials while inside a server (owner bug).
  const me = meMember
    ? { id: user.id, name: meMember.name, initials: meMember.initials, handle: meMember.handle || meMember.name, colorIdx: meMember.colorIdx, avatar_key: meMember.avatar_key || meBase.avatar_key || null }
    : meBase;
  const chanName = {};
  for (const c of textCh) chanName[c.id] = c.name;

  // folder tree · works in this server · placements (folder location + channel) ·
  // the storage meter. Placements are fetched separately (no embed) — the same FK
  // caution as the workspace reads (GOTCHA U).
  const [{ data: folderRows }, { data: workRows }, { data: meterRows }, { data: balRows }] = await Promise.all([
    supabase.from("folders").select("id,name,parent_id,archived,locked,created_at").eq("server_id", sid).order("name"),
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
    count: countByFolder[f.id] || 0, tags: [], createdAt: f.created_at,
  }));
  // P23: each folder's own tags (no inheritance to files). One indexed read over the folders in view.
  if (folders.length) {
    const { data: ftRows } = await supabase.from("folder_tags").select("folder_id,tag").in("folder_id", folders.map((f) => f.id));
    const byFolder = {}; for (const r of ftRows || []) (byFolder[r.folder_id] ||= []).push(r.tag);
    for (const f of folders) f.tags = byFolder[f.id] || [];
  }

  const files = works.map((w) => { const f = shapeWork(w, placeById[w.id], membersById, chanName, tagsByWork[w.id] || []); f.starred = starred.has(w.id); return f; });

  const usedBytes = Number(meterRows?.bytes_used || 0);
  const capGb = SERVER_BASE_GB + Number(balRows?.purchased_gb || 0);

  return {
    needsAuth: false, live: true,
    me, isAdmin: !!membersById[user.id]?.admin, servers, dmUnread: 0,
    // K2: carry icon_key/cover_key so the reused channelColumn header renders the server art
    // in the explorer too (it read data.server, which had only id/name/initials → initials + the
    // gradient fallback, so an uploaded icon/cover never showed on the Files screen).
    server: { id: sid, name: activeServer.name, initials: initials(activeServer.name), icon_key: activeServer.icon_key || null, cover_key: activeServer.cover_key || null },
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
  const { servers, me } = await loadRail(user);

  const [{ data: folderRows }, { data: workRows }, { data: meterRows }, { data: balRows }] = await Promise.all([
    supabase.from("save_folders").select("id,name,parent_id,created_at").eq("user_id", user.id).order("name"),
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
    count: countByFolder[f.id] || 0, tags: [], createdAt: f.created_at,
  }));
  // P23: personal folder tags (keyed by save_folder_id; no inheritance to files).
  if (folders.length) {
    const { data: ftRows } = await supabase.from("folder_tags").select("save_folder_id,tag").in("save_folder_id", folders.map((f) => f.id));
    const byFolder = {}; for (const r of ftRows || []) (byFolder[r.save_folder_id] ||= []).push(r.tag);
    for (const f of folders) f.tags = byFolder[f.id] || [];
  }

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

// Re-read just the storage meter + balance for the currently-mounted explorer source and
// update `data.storage` IN PLACE. Called after a hard PURGE (Delete forever / Empty trash),
// which decrements the meter server-side (the works_blob_meter DELETE branch) — the client's
// cached `data.storage` would otherwise stay at the pre-purge (too-high) number until a full
// route reload (K10 "reload needed for things to update"). A soft trash keeps the blob for 30
// days and does NOT change the meter, so it must not refresh here. Mirrors the exact meter/cap
// math in loadServerExplorer/loadPersonalExplorer so the footer stays consistent. Never throws.
export async function refreshStorage(data) {
  if (!data || !data.storage || isDemo()) return;
  const user = session();
  if (!user) return;
  const isServer = data.source === "server" && !!data.server?.id;
  const ownerType = isServer ? "server" : "user";
  const ownerId = isServer ? data.server.id : user.id;
  try {
    const [{ data: meterRows }, { data: balRows }] = await Promise.all([
      supabase.from("storage_meters").select("bytes_used").eq("owner_type", ownerType).eq("owner_id", ownerId).maybeSingle(),
      supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", ownerType).eq("owner_id", ownerId).maybeSingle(),
    ]);
    const usedBytes = Number(meterRows?.bytes_used || 0);
    const capGb = (isServer ? SERVER_BASE_GB : USER_BASE_GB) + Number(balRows?.purchased_gb || 0);
    data.storage = { usedBytes, capGb, capBytes: capGb * GB, status: balRows?.status || "active", overCap: usedBytes > capGb * GB };
  } catch { /* leave the last-known storage in place if the re-read fails */ }
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
      .select("id,name,parent_id,created_at").single();
    if (error) throw error;
    return { id: row.id, name: row.name, parentId: row.parent_id, archived: false, locked: false, count: 0, createdAt: row.created_at };
  }
  const { data: row, error } = await supabase.rpc("create_folder", { server_id: serverId, parent_id: parentId, name: clean });
  if (error) throw error;
  return { id: row.id, name: row.name, parentId: row.parent_id, archived: !!row.archived, locked: !!row.locked, count: 0, createdAt: row.created_at };
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
  // schema-40: one bulk RPC instead of one `move_to_folder` round trip per file — a multi-file move
  // used to serialize N network round trips (Supabase is eu-north-1; each one ~100-250ms from a
  // far client), which is most of why a big move used to feel slow.
  const { error } = await supabase.rpc("move_works_to_folder", { work_ids: works, folder_id: destFolderId });
  if (error) throw error;
}

// schema-41: the Copy half of Cut/Copy/Paste (C4) — an independent duplicate (a new work row the
// caller now owns, not another placement of the same one; content-addressed storage means it
// costs zero extra billed bytes). Server-side only for now (no demo path) — the explorer's
// clipboard flow checks isDemoQS() itself before calling this, same as every other write here.
export async function duplicateWork(workId, destFolderId = null) {
  const { data: newId, error } = await supabase.rpc("duplicate_work", { p_work_id: workId, p_dest_folder_id: destFolderId });
  if (error) throw error;
  return newId;
}

// Reparent a FOLDER itself (not its contents) — server folders reuse the SAME `move_to_folder` RPC
// as a file move: it detects the target is a folder row and reparents it, rejecting a cross-server
// move and a cycle (moving a folder into its own subtree) server-side. Personal folders have no such
// RPC — `save_folders` RLS is the simple owner-only class (K8: `user_id = auth.uid()`, reliable), so
// a direct update is correct here; the caller (explorer.js) runs its own client-side cycle check
// before calling this, since nothing server-side guards it for the personal case.
export async function moveFolderTo(source, folderId, destFolderId = null) {
  if (source === "personal") {
    const user = session();
    if (!user) throw new Error("Sign in to move folders");
    const { data, error } = await supabase.from("save_folders").update({ parent_id: destFolderId }).eq("id", folderId).eq("user_id", user.id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("Only the folder's owner can move it.");
    return;
  }
  const { error } = await supabase.rpc("move_to_folder", { target: folderId, folder_id: destFolderId });
  if (error) throw error;
}

// Rename a folder — server `folders.name` (admin/`manage_channels`-gated RLS), personal
// `save_folders.name` (owner-only RLS). Both are the SIMPLE/helper-gated classes (K8's reliable
// tier: `folders_upd` calls `has_perm(...)`, `sf_all` is a plain `user_id = auth.uid()`), so a
// direct update is correct — no RPC needed. `.select()` + a throw-on-zero-rows catches the
// silent-no-op hazard (an RLS mismatch returns 0 rows with NO error, which reads as a fake success).
export async function renameFolder(source, folderId, name) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Folder name is required");
  const table = source === "personal" ? "save_folders" : "folders";
  const { data, error } = await supabase.from(table).update({ name: clean }).eq("id", folderId).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error(source === "personal" ? "Only the folder's owner can rename it." : "Only a server admin can rename this folder.");
  return clean;
}

// Delete a folder. Subfolders cascade (parent_id is ON DELETE CASCADE on both folders and
// save_folders); any file placed in it or a descendant is un-filed to root, NEVER deleted
// (placement.folder_id / saved_items.folder_id are ON DELETE SET NULL) — a folder delete only
// removes the folder tree, it can't take a file down with it.
export async function deleteFolder(source, folderId) {
  const table = source === "personal" ? "save_folders" : "folders";
  const { data, error } = await supabase.from(table).delete().eq("id", folderId).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error(source === "personal" ? "Only the folder's owner can delete it." : "Only a server admin can delete this folder.");
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
  // `.select()` returns the rows the write actually touched. RLS silently filters the set to
  // writable rows, so an update that changed NOTHING (you don't own any of these) comes back
  // with no error AND no rows — without this check the caller would show a false "deleted".
  const { data, error } = await supabase.from("works").update({ deleted_at: new Date().toISOString() }).in("id", ids).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("You can only delete files you own.");
}
// Restore from Trash: clear deleted_at (the row is readable by its author while trashed).
export async function restoreWork(id) {
  const { data, error } = await supabase.from("works").update({ deleted_at: null }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("You can only restore files you own.");
}
// Delete forever: the hard DELETE fires works_blob_meter → blob refcount-- + meter--.
export async function purgeWork(id) {
  const { data, error } = await supabase.from("works").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("You can only delete files you own.");
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
    who: source === "personal" ? null : (membersById[w.author_id] ? { name: membersById[w.author_id].name, handle: membersById[w.author_id].handle } : null),
  }));
}

// Hide/show a work in the library view (#55) — a `works.hidden` toggle, fenced by
// `works_update` (can_write_work). Hidden keeps a utility file out of the organised
// explorer view (Show-hidden reveals it); it still works inline in chat.
export async function setHidden(workId, hidden) {
  // `.select()` so a no-op (RLS filtered you out — not the author/admin) throws instead of
  // reading as success and letting the card optimistically flip its Hide/Show state.
  const { data, error } = await supabase.from("works").update({ hidden: !!hidden }).eq("id", workId).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("Only the file's owner or a server admin can do that.");
}

// Rename a work — a plain `works.title` update, fenced by `works_update` (can_write_work:
// author or server admin), same gate as delete. The trigger re-derives search_tsv.
export async function renameWork(workId, title) {
  const clean = (title || "").trim();
  if (!clean) throw new Error("Name is required");
  const { data, error } = await supabase.from("works").update({ title: clean }).eq("id", workId).select("id");
  if (error) throw error;
  if (!data || !data.length) throw new Error("Only the file's owner or a server admin can rename it.");
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
  if (isDemo()) { const d = await import("./demo.js"); return d.demoComments(workId); }
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

// P23 — folder tags (a folder's own tags; NO inheritance to its files). One of folderId (server
// folder) / saveFolderId (personal folder) is set, never both. Writes go through the DEFINER RPCs
// (add_folder_tag / remove_folder_tag, schema-37) which re-check the same fence as editing the
// folder (server → manage_channels, personal → owner). Same "type:value or bare" tag convention as
// content_tags, so the coloured tagChip renders folder tags too.
export async function addFolderTag({ folderId = null, saveFolderId = null }, tag) {
  const clean = (tag || "").trim().replace(/^#/, "").toLowerCase();
  if (!clean) throw new Error("A tag can’t be empty");
  if (clean.length > 120) throw new Error("That tag is too long");
  if (isDemo()) return clean;
  const { error } = await supabase.rpc("add_folder_tag", { p_folder: folderId, p_save_folder: saveFolderId, p_tag: clean });
  if (error) throw new Error(error.message || "Couldn’t add the tag");
  return clean;
}
export async function removeFolderTag({ folderId = null, saveFolderId = null }, tag) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("remove_folder_tag", { p_folder: folderId, p_save_folder: saveFolderId, p_tag: tag });
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

// ── Drive-style folder sharing (K9) ──────────────────────────────────────────
// Share a whole FOLDER to a public read-only link (server folder or personal My-files folder).
// `create_folder_share` is a SECURITY DEFINER RPC (fenced: a server folder needs membership, a
// personal one must be yours); the token opens `/shared/folder/:token`. `resolve_folder_share`
// is anon — the token is the capability.
export function folderShareUrl(token) { return `${location.origin}/shared/folder/${token}`; }
export async function createFolderShare(source, folderId) {
  if (isDemo()) return "demofoldertoken";
  const user = session();
  if (!user) throw new Error("Sign in to share");
  const { data, error } = await supabase.rpc("create_folder_share", { p_source: source, p_folder_id: folderId });
  if (error) throw new Error(error.message || "Couldn’t create the folder link");
  return data;
}
// Resolve a shared folder for the anon viewer. Shaped as an EXPLORER data object (P9) so the
// same file-browser component renders it read-only: `shared:true`, `source:"shared"`, the folder
// name as the crumb root, an empty folder tree, and the folder's works as `files`. Returns
// `{ dead:true }` for a revoked/expired/invalid token (main.js shows the dead-link state).
export async function loadSharedFolder(token) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoSharedFolder(token); }
  const { data, error } = await supabase.rpc("resolve_folder_share", { p_token: token });
  if (error || !data || !data.length) return { dead: true };
  const first = data[0];
  return {
    shared: true, source: "shared", live: true, needsAuth: false,
    rootLabel: first.folder_name || "Shared folder",
    serverId: first.server_id || null, serverName: first.server_name || null,
    server: null, folders: [], currentFolderId: null, storage: null,
    files: data.filter((r) => r.file_id).map((r) => ({
      id: r.file_id, title: r.title, name: r.title, kind: r.kind, file_ext: r.file_ext,
      blob_sha: r.blob_sha, bytes: r.bytes, created_at: null, folderId: null,
      channelName: null, who: null, tags: [], starred: false,
    })),
  };
}

// ── Request to join a server (K9) ────────────────────────────────────────────
// Ask to join (from a shared folder / a server you found without an invite). Idempotent — an
// active member gets 'member', otherwise a pending request is filed for the admins to review.
export async function requestToJoin(serverId, message = null) {
  if (isDemo()) return "pending";
  const user = session();
  if (!user) throw new Error("Sign in to request to join");
  const { data, error } = await supabase.rpc("request_to_join_server", { p_server_id: serverId, p_message: message });
  if (error) throw new Error(/banned/i.test(error.message || "") ? "You’re banned from this server" : (error.message || "Couldn’t send your request"));
  return data;   // 'pending' | 'member'
}
// Admin: the pending join requests for a server (jr_read RLS lets an admin read them), with the
// requester's profile. Returns [] for a non-admin (RLS filters the rows out).
export async function loadJoinRequests(serverId) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoJoinRequests(); }
  const { data: reqs } = await supabase.from("join_requests")
    .select("user_id,message,created_at").eq("server_id", serverId).eq("status", "pending")
    .order("created_at", { ascending: true });
  const rows = reqs || [];
  if (!rows.length) return [];
  const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", rows.map((r) => r.user_id));
  const byId = {}; for (const p of profs || []) byId[p.id] = p;
  return rows.map((r) => {
    const p = byId[r.user_id];
    return { userId: r.user_id, name: p?.name || p?.handle || "someone", handle: p?.handle || "", avatar_key: p?.avatar_key || null, initials: initials(p?.name || p?.handle || "?"), message: r.message || "", when: fmtTime(r.created_at) };
  });
}
export async function approveJoinRequest(serverId, userId) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("approve_join_request", { p_server_id: serverId, p_user_id: userId });
  if (error) throw new Error(error.message || "Couldn’t approve the request");
  clearWorkspaceCache();   // the member roster changed
}
export async function declineJoinRequest(serverId, userId) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("decline_join_request", { p_server_id: serverId, p_user_id: userId });
  if (error) throw new Error(error.message || "Couldn’t decline the request");
}

// Visibility (CANON §B.3 / #61) — the UI's Public/Server/Private maps to works.visibility
// public/server/**personal** (the DB noun for Private). A plain `works_update` write
// (can_write_work), with a check that server-visibility needs server membership.
// Private and Personal are the SAME visibility — the UI says "Private", so that is now the one
// canonical value in the DB too (migration p12 widened works_visibility_check to accept it, and
// 'personal' stays accepted only as a legacy alias until a later migration drops it). So these
// maps are now identity: no translation, one name per concept. `visFromDb` still folds the
// legacy 'personal' → 'private' so any old row reads correctly.
const VIS_FROM_DB = { public: "public", server: "server", personal: "private", private: "private" };
export function visFromDb(dbVis) { return VIS_FROM_DB[dbVis] || "public"; }
export function visToDb(uiVis) { return uiVis === "private" ? "private" : (uiVis === "server" ? "server" : "public"); }
export async function setVisibility(workId, uiVis) {
  const db = visToDb(uiVis);
  if (isDemo()) return db;
  const { data, error } = await supabase.from("works").update({ visibility: db }).eq("id", workId).select("id");
  if (error) throw new Error(error.message || "Couldn’t change who can see this");
  if (!data || !data.length) throw new Error("Only the file's owner or a server admin can change its visibility.");
  return db;
}

// Resolve a token for the anon /shared/:token viewer. `resolve_share_link` is a SECURITY
// DEFINER RPC (anon-callable) that refuses a revoked/expired/invalid token and returns the
// work; the client then reads tags + the author name (both allowed once the live link
// grants can_read_work). Any failure collapses to { dead:true } → the "link expired" state.
export async function loadSharedWork(token) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoSharedWork(token); }
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

// Post a comment on a public post. Routed through the `post_comment` SECURITY DEFINER RPC
// (K8): the `cmt_insert` fence is a COMPLEX inline-`auth.uid()` check (can_read_work + author/
// friend-of-author subqueries) — the exact shape that failed live for `works` — so a direct
// client insert is the suspect path. The RPC re-checks the same fence (author or a friend of
// the author, and readable) as the table owner, so it can't be silently denied. A rejected
// write throws for the caller to toast (UI is only the signpost). Returns the shaped comment
// so the thread appends it without a refetch.
export async function postComment(workId, body) {
  const clean = (body || "").trim();
  if (!clean) throw new Error("Write something first");
  if (isDemo()) return { id: "local-" + Date.now(), name: "jax", text: clean, time: "now", mine: true };
  const user = session();
  if (!user) throw new Error("Sign in to comment");
  const { data, error } = await supabase.rpc("post_comment", { p_work_id: workId, p_body: clean });
  if (error) throw new Error(/friends|42501|row-level/i.test(error.message || "") ? "Only the author and their friends can comment" : (error.message || "Couldn’t post the comment"));
  const row = Array.isArray(data) ? data[0] : data;   // set-returning RPC → array of one row
  const { me } = await loadRail(user);   // real display name (cached), never the email stem
  return { id: row?.id, name: me.name, text: clean, time: fmtTime(row?.created_at), mine: true };
}

// (loadFeed — the home Feed / friends' public posts — was removed 2026-09-01: the Feed screen
// is cut, "/" is the personal File explorer now. See main.js/router.js/shell.js for the redirect.)

// A Profile (CANON §C.10) — a person's shelves. POV is viewer-dependent, enforced
// server-side by works_read + friendships (not a UI toggle): owner sees all three
// shelves + Settings; a stranger sees only Public; a friend sees Public + Server.
// We compute the POV for chrome, but RLS is the real fence — the shelf queries only
// return what the viewer may read, so we just group what comes back by visibility.
export async function loadProfile(handle) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoProfile(handle); }
  const user = session();
  if (!user) return { needsAuth: true, live: false };

  const { servers, me } = await loadRail(user);

  const { data: prof } = await supabase.from("profiles").select("id,handle,name,bio,avatar_key,banner_key,pronouns,status_text,presence_state").eq("handle", handle).maybeSingle();
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
    const card = { id: w.id, title: w.title, name: w.title, kind: w.kind, file_ext: w.file_ext, blob_sha: w.blob_sha, bytes: w.bytes, created_at: w.created_at, tags: [], who: { name: prof.name || prof.handle, handle: prof.handle } };
    (shelves[w.visibility] ||= []).push(card);
  }

  return {
    needsAuth: false, live: true, source: "profile", me, servers, dmUnread: 0, server: null,
    profile: { id: prof.id, name: prof.name || prof.handle, handle: prof.handle, bio: prof.bio || "", initials: initials(prof.name || prof.handle), pronouns: prof.pronouns, avatar_key: prof.avatar_key || null, banner_key: prof.banner_key || null, status_text: prof.status_text || "", presence_state: prof.presence_state || "online" },
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
  clearWorkspaceCache();   // rail.me caches the avatar — refresh it so the new photo shows
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
  clearWorkspaceCache();   // rail.me caches handle/name — refresh so /u/:handle links follow the change
  return vals;
}

// Set the signed-in user's global custom status + presence (a self `profiles` write, RLS
// self-guarded). `presence` is one of online/idle/dnd/invisible (§E.5). `clearAt` is an
// RFC-3339 timestamp or null (never clear). Passing an empty text + emoji clears the status
// but keeps the chosen presence. Presence is a stored preference here — the ambient online
// dot is Realtime Presence, but the manual online/idle/dnd/invisible choice lives on the row.
export async function setStatus({ emoji = null, text = "", presence, clearAt = null } = {}) {
  const vals = {
    status_emoji: (emoji || "").trim() || null,
    status_text: (text || "").trim() || null,
    status_expires_at: clearAt || null,
  };
  if (presence) vals.presence_state = presence;   // online | idle | dnd | invisible
  if (isDemo()) return vals;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("profiles").update(vals).eq("id", user.id);
  if (error) throw new Error(error.message || "Couldn’t update your status");
  clearWorkspaceCache();   // the rail + members cache presence/status — refresh so it shows at once
  return vals;
}

// Clear a blocked edge (there is no unblock RPC — block_user only sets it). Deleting the
// `friendships` row is self-guarded by RLS (you can only delete an edge you're part of), and
// removes the block both ways. Matches either ordering of the (a_user,b_user) pair.
export async function unblockUser(targetId) {
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("friendships").delete()
    .eq("status", "blocked")
    .or(`and(a_user.eq.${user.id},b_user.eq.${targetId}),and(a_user.eq.${targetId},b_user.eq.${user.id})`);
  if (error) throw new Error(error.message || "Couldn’t unblock this user");
}

// The User-settings screen data (§C.10): identity, account email, appearance is client-only,
// the blocked-users list (Privacy), and the personal storage meter. Read-only aggregation —
// each panel's writes go through their own functions (updateProfile, setStatus, unblockUser,
// signOut, theme).
export async function loadUserSettings() {
  const user = session();
  if (!user || isDemo()) {
    const dm = { id: "me", name: "jax", handle: "jax", initials: "JX", avatar_key: null, colorIdx: 5 };
    return { needsAuth: !isDemo(), servers: [], me: dm, email: "jax@demo.eski", profile: { handle: "jax", name: "jax", avatar_key: null, status_emoji: "🎧", status_text: "cooking beats", presence_state: "online" }, blocked: [], storage: { usedBytes: 2.1 * GB, capGb: USER_BASE_GB, capBytes: USER_BASE_GB * GB, status: "active" } };
  }
  // P2: reuse the profile row loadRail already fetched (it now carries bio + banner_key) instead
  // of a second identical `profiles` read; and DON'T fetch storage/blocked here — the Profile
  // panel is what renders first, and it shouldn't wait on storage_meters/storage_balance/
  // friendships. Those are lazy-loaded by their own panels (loadUserStorage / loadUserBlocked).
  const { servers, me, profile: prof } = await loadRail(user);
  return {
    needsAuth: false, servers, me,
    email: user.email || "",
    profile: { handle: prof?.handle || me.handle, name: prof?.name || me.name, bio: prof?.bio || "", avatar_key: prof?.avatar_key || null, banner_key: prof?.banner_key || null, initials: me.initials, status_emoji: prof?.status_emoji || "", status_text: prof?.status_text || "", presence_state: prof?.presence_state || "online" },
    blocked: null,   // lazy — loadUserBlocked() on the Privacy panel
    storage: null,   // lazy — loadUserStorage() on the Storage panel
  };
}

// P2: the Storage panel's data, fetched only when that panel opens (not on every settings load).
export async function loadUserStorage() {
  const user = session();
  if (!user || isDemo()) return { usedBytes: 2.1 * GB, capGb: USER_BASE_GB, capBytes: USER_BASE_GB * GB, status: "active" };
  const [{ data: meterRows }, { data: balRows }] = await Promise.all([
    supabase.from("storage_meters").select("bytes_used").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
    supabase.from("storage_balance").select("purchased_gb,status").eq("owner_type", "user").eq("owner_id", user.id).maybeSingle(),
  ]);
  const capGb = USER_BASE_GB + Number(balRows?.purchased_gb || 0);
  return { usedBytes: Number(meterRows?.bytes_used || 0), capGb, capBytes: capGb * GB, status: balRows?.status || "active" };
}

// P2: the Privacy panel's blocked list, fetched only when that panel opens.
export async function loadUserBlocked() {
  const user = session();
  if (!user || isDemo()) return [];
  const { data: blockRows } = await supabase.from("friendships").select("a_user,b_user,requested_by").eq("status", "blocked").or(`a_user.eq.${user.id},b_user.eq.${user.id}`);
  const otherIds = (blockRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user));
  if (!otherIds.length) return [];
  const { data: bp } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", otherIds);
  return (bp || []).map((p) => ({ id: p.id, name: p.name || p.handle, handle: p.handle, avatar_key: p.avatar_key || null, initials: initials(p.name || p.handle) }));
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
  clearWorkspaceCache();   // rail + server bundle cache the name/icon — refresh so a rename/icon shows without a manual reload
  return p;
}

// ── Messages + Friends (P7.1, CANON §C — dms/friends) ────────────────────────
// The Messages screen: the DM thread list + the Friends panel. Friendships are an ORDERED
// pair (a_user < b_user); the "other" user is whichever end isn't me. dm_members / profiles
// have no FK to each other (user_id → auth.users), so profiles are fetched SEPARATELY into a
// byId map (the bug #1 embed hazard). No member hue — DMs/friends are outside any server.
export async function loadDMsScreen() {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoDMs(); }
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  const { servers, me } = await loadRail(user);

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
// Block a user (block_user RPC) — sets the friendship edge to 'blocked'; they can't message or
// add you and are hidden from you. Symmetric-hide is enforced server-side by RLS.
export async function blockUser(targetId) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("block_user", { target_id: targetId });
  if (error) throw new Error(error.message || "Couldn’t block this user");
}

// File a report against a message / file / user / DM (CANON §C.4/§C.7/§C.11). A direct `reports`
// insert (rep_insert = reporter is you); a moderator reads them via rep_read. targetType is a
// free label ('message'|'work'|'user'|'dm'); serverId scopes a server-context report.
export async function reportTarget({ targetType, targetId = null, serverId = null, reason }) {
  if (!reason) throw new Error("Pick a reason");
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const { error } = await supabase.from("reports").insert({ reporter_id: user.id, server_id: serverId, target_type: targetType, target_id: targetId, reason });
  if (error) throw new Error(error.message || "Couldn’t submit the report");
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
  if (isDemo()) { const d = await import("./demo.js"); return d.demoDMThread(dmChannelId); }
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
  const { me } = await loadRail(user);   // real display name + avatar (cached), never the email stem
  return { id: data.id, author: { name: me.name, initials: me.initials, avatar_key: me.avatar_key }, time: fmtTime(data.created_at), body: data.body || clean, mine: true };
}

// ── Notifications (P7.3, CANON §C — notifications) ───────────────────────────
// In-app only (v1). Read/mark-read/delete your own (notif_read/update); inserts come from
// the P2 triggers. Actor profiles + server names are fetched SEPARATELY (bug-#1 hazard). The
// row text is built from `kind` + the actor; the excerpt renders as a quote. No member hue.
const NOTIF_VERB = { mention: "mentioned you", comment: "commented on your post", join: "joined", reaction: "reacted to your message", invite: "invited you to join", friend: "sent you a friend request" };
const NOTIF_ICON = { mention: "at", comment: "comment", join: "user", reaction: "smile", invite: "mail", friend: "user" };
// Where a notification leads when clicked (best-effort v1): a friend request → Messages, any
// server-scoped event → that server. Exact target permalinks (channel/message/post) arrive
// with permalink routing later; null means the row just marks read without navigating.
function notifHref(r) {
  if (r.kind === "friend") return "/messages";
  // An invite leads to the join screen for its single-use code — the invitee isn't a
  // member yet, so /s/:id would be RLS-denied; /join/:code is the tested join path.
  if (r.kind === "invite") return r.target_ref ? `/join/${r.target_ref}` : null;
  if (r.server_id) return `/s/${r.server_id}`;
  return null;
}
function shapeNotif(r, actById, srvById) {
  const a = actById[r.actor_id];
  const actor = a?.name || a?.handle || "someone";
  // For an invite the server name rides in `excerpt` (the invitee can't read `servers`
  // pre-join); every other kind resolves it from the joined servers.
  const srv = r.kind === "invite" ? (r.excerpt || null) : (srvById[r.server_id]?.name || null);
  return {
    id: r.id, kind: r.kind, actor, avatar_key: a?.avatar_key || null,
    text: NOTIF_VERB[r.kind] || "sent you a notification",
    icon: NOTIF_ICON[r.kind] || "bell",
    context: srv, excerpt: r.kind === "invite" ? "" : (r.excerpt || ""), href: notifHref(r),
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
// Shape a single realtime-inserted notification row (the caller prepends it live). Fetches the
// actor profile (world-readable) and, for a server-scoped non-invite kind, the server name (an
// invite carries its server name in `excerpt`, since the recipient can't read `servers` yet).
export async function shapeIncomingNotif(row) {
  const actById = {}, srvById = {};
  if (row.actor_id) {
    const { data } = await supabase.from("profiles").select("id,handle,name,avatar_key").eq("id", row.actor_id).maybeSingle();
    if (data) actById[data.id] = data;
  }
  if (row.server_id && row.kind !== "invite") {
    const { data } = await supabase.from("servers").select("id,name").eq("id", row.server_id).maybeSingle();
    if (data) srvById[data.id] = data;
  }
  return shapeNotif(row, actById, srvById);
}

export async function loadNotifications() {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoNotifications(); }
  const user = session();
  if (!user) return { needsAuth: true, live: false };
  const { servers, me } = await loadRail(user);
  const { data: rows } = await supabase.from("notifications")
    .select("id,kind,actor_id,server_id,excerpt,target_ref,read_at,created_at").eq("user_id", user.id)
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

// The server audit log (CANON §D — utility screens) — moderation actions the kick/ban/timeout
// RPCs record. Admin/view_audit only (audit_read). actor_id + target_id point at auth.users with
// NO FK to profiles, so names are fetched SEPARATELY into a byId map (the #1 embed hazard), never
// PostgREST-embedded. Returns shaped rows: {id, action, actor, target, time, reason, until}.
export async function loadAuditLog(serverId) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoAudit(); }
  const { data: rows, error } = await supabase.from("audit_log")
    .select("id,action,actor_id,target_type,target_id,meta,created_at")
    .eq("server_id", serverId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message || "Couldn’t load the audit log");
  const ids = [...new Set((rows || []).flatMap((r) => [r.actor_id, r.target_type === "user" ? r.target_id : null]).filter(Boolean))];
  const byId = {};
  if (ids.length) { const { data } = await supabase.from("profiles").select("id,handle,name").in("id", ids); for (const p of data || []) byId[p.id] = p; }
  const nameOf = (id) => byId[id] ? (byId[id].name || byId[id].handle) : "someone";
  return (rows || []).map((r) => ({
    id: r.id, action: r.action,
    actor: r.actor_id ? nameOf(r.actor_id) : "a former admin",
    target: r.target_type === "user" ? nameOf(r.target_id) : null,
    time: fmtTime(r.created_at), reason: r.meta?.reason || null, until: r.meta?.until || null,
  }));
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
// Unpin — a direct delete from message_pins (RLS `pin_delete` gates it to the pinner/admins).
export async function unpinMessage(messageId) {
  if (isDemo()) return;
  const { error } = await supabase.from("message_pins").delete().eq("message_id", messageId);
  if (error) throw new Error(error.message || "Couldn’t unpin the message");
}
// Edit your own channel message — a `messages` body update + edited_at stamp (msg_update = own).
export async function editMessage(messageId, body) {
  const clean = (body || "").trim();
  if (!clean) throw new Error("Message can’t be empty");
  if (isDemo()) return;
  const { error } = await supabase.from("messages").update({ body: clean, edited_at: new Date().toISOString() }).eq("id", messageId);
  if (error) throw new Error(error.message || "Couldn’t edit the message");
}

// Forward a message into one or more channels (CANON §C.4). Each target gets a new message
// whose `forwarded_from` points at the source + an optional note; the messages RLS gates the
// insert to channels you may post in. The source renders as a quote block on load.
export async function forwardMessage(sourceId, channelIds, note = "") {
  const targets = (channelIds || []).filter(Boolean);
  if (!targets.length) throw new Error("Pick at least one channel");
  if (isDemo()) return;
  const user = session();
  if (!user) throw new Error("Sign in");
  const rows = targets.map((cid) => ({ channel_id: cid, user_id: user.id, body: (note || "").trim() || null, forwarded_from: sourceId }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) throw new Error(error.message || "Couldn’t forward the message");
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

// The global search screen (/search, §C.18): jump across your servers, their channels, and
// your people. (Full-text file/message search needs a search RPC over search_tsv — a follow-up;
// this covers the navigational search the quick-switcher does, as a full screen.)
export async function loadSearch() {
  if (isDemo()) {
    const sw = await loadSwitcher();
    return { needsAuth: false, me: { handle: "jax" }, servers: sw.servers, friends: sw.friends,
      channels: [{ id: "beats", name: "beats", serverId: "lb", serverName: "Late Bloom LP" }, { id: "mix", name: "mixing", serverId: "lb", serverName: "Late Bloom LP" }] };
  }
  const user = session();
  if (!user) return { needsAuth: true };
  const { servers, me } = await loadRail(user);
  const [{ data: friRows }, chanRes] = await Promise.all([
    supabase.from("friendships").select("a_user,b_user").eq("status", "accepted").or(`a_user.eq.${user.id},b_user.eq.${user.id}`),
    servers.length ? supabase.from("channels").select("id,name,server_id,kind").in("server_id", servers.map((s) => s.id)) : Promise.resolve({ data: [] }),
  ]);
  const ids = (friRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user));
  let friends = [];
  if (ids.length) { const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", ids); friends = (profs || []).map((p) => ({ name: p.name || p.handle, handle: p.handle, avatar_key: p.avatar_key || null, initials: initials(p.name || p.handle) })); }
  const sName = Object.fromEntries(servers.map((s) => [s.id, s.name]));
  const channels = (chanRes.data || []).filter((c) => c.kind !== "voice").map((c) => ({ id: c.id, name: c.name, serverId: c.server_id, serverName: sName[c.server_id] || "server" }));
  return { needsAuth: false, me, servers, friends, channels };
}

// ── Create / join a server (P9) ──────────────────────────────────────────────
// Create a server ENTIRELY client-side: has_perm() grants the server owner (owner_id) every
// permission, so each insert passes its own RLS in turn — no RPC needed. Order matters:
// server → owner membership (sm_insert=is_server_admin, true for the owner) → the @everyone
// default role (permissions = everyone_perms() = 113664, the non-admin baseline) → starter
// Create a server — one atomic `create_server` SECURITY DEFINER RPC (K5). Was 4 sequential
// client inserts (servers → server_members → @everyone role → channels) that weren't atomic: a
// mid-way failure left a half-made, unusable server. The RPC seats the owner + role + channels in
// one transaction as the table owner, so it can't half-succeed and dodges the create-time RLS
// chicken-and-egg. Returns the new servers row.
export async function createServer(name, channels = ["general"]) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("A server name is required");
  if (isDemo()) return { id: "new-server", name: clean };
  const user = session();
  if (!user) throw new Error("Sign in to create a server");
  const names = (channels || []).map((n) => String(n || "").trim()).filter(Boolean);
  const { data: srv, error } = await supabase.rpc("create_server", { p_name: clean, p_channels: names.length ? names : ["general"] });
  if (error) throw new Error(error.message || "Couldn’t create the server");
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

// Delete a server (owner only) via the `delete_server` SECURITY DEFINER RPC (K4). FK cascades
// remove its members, channels, works, invites, roles. Was a direct `servers.delete` — but a
// destructive delete that matches no RLS row is a silent 0-row no-op (K8), so a non-owner would
// see "success" having deleted nothing. The RPC RAISES for a non-owner (or a missing server)
// instead, so the outcome is never a silent lie. Irreversible — the UI gates it behind a
// type-the-name confirm.
export async function deleteServer(serverId) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("delete_server", { p_server_id: serverId });
  if (error) throw new Error(/owner/i.test(error.message || "") ? "Only the owner can delete this server" : (error.message || "Couldn’t delete the server"));
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
  if (isDemo()) { const d = await import("./demo.js"); return d.demoInvites(); }
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

// Suggested people to invite: my accepted friends who aren't already active members of the
// server. Pure client query — friendships (fr_read: my edges) and server_members (sm_read: a
// member sees the roster) are both readable to me, and profiles are world-readable.
export async function loadInviteCandidates(serverId) {
  if (isDemo()) { const d = await import("./demo.js"); return d.demoInviteCandidates(); }
  const user = session();
  if (!user) return [];
  const [{ data: friRows }, { data: memRows }] = await Promise.all([
    supabase.from("friendships").select("a_user,b_user").or(`a_user.eq.${user.id},b_user.eq.${user.id}`).eq("status", "accepted"),
    supabase.from("server_members").select("user_id").eq("server_id", serverId).eq("status", "active"),
  ]);
  const memberIds = new Set((memRows || []).map((m) => m.user_id));
  const friendIds = [...new Set((friRows || []).map((f) => (f.a_user === user.id ? f.b_user : f.a_user)))].filter((id) => !memberIds.has(id));
  if (!friendIds.length) return [];
  const { data: profs } = await supabase.from("profiles").select("id,handle,name,avatar_key").in("id", friendIds);
  return (profs || []).map((p) => ({ id: p.id, name: p.name || p.handle || "friend", handle: p.handle || "", avatar_key: p.avatar_key || null, initials: initials(p.name || p.handle || "?") }));
}

// Turn an invite_user_to_server error into copy a person can act on.
function friendlyInviteErr(msg = "") {
  if (/already a member/i.test(msg)) return "They’re already in this server";
  if (/not permitted/i.test(msg)) return "Only admins can invite people";
  if (/yourself/i.test(msg)) return "You can’t invite yourself";
  if (/no such user/i.test(msg)) return "No user with that username";
  return msg || "Couldn’t send the invite";
}

// Invite a specific user (by id) to a server — the admin-gated invite_user_to_server RPC.
// It mints a single-use code and drops an 'invite' notification carrying it; returns the code.
export async function inviteUserToServer(serverId, userId) {
  if (isDemo()) return "demo-invite-code";
  const { data, error } = await supabase.rpc("invite_user_to_server", { p_target: userId, p_server: serverId });
  if (error) throw new Error(friendlyInviteErr(error.message));
  return data;
}

// Invite by exact handle: resolve the handle to a user (profiles are world-readable), then
// invite them. Returns { code, person } so the caller can confirm who was invited.
export async function inviteByHandle(serverId, handle) {
  const clean = (handle || "").trim().replace(/^@/, "");
  if (!clean) throw new Error("Enter a username");
  if (isDemo()) return { code: "demo-invite-code", person: { id: "u-" + clean, name: clean, handle: clean, avatar_key: null } };
  const { data: prof } = await supabase.from("profiles").select("id,handle,name,avatar_key").eq("handle", clean).maybeSingle();
  if (!prof) throw new Error("No user with that username");
  const code = await inviteUserToServer(serverId, prof.id);
  return { code, person: { id: prof.id, name: prof.name || prof.handle || clean, handle: prof.handle || clean, avatar_key: prof.avatar_key || null } };
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

// Anon-safe invite preview (K1) — the invite landing (screens/join.js) can't read `servers` or
// `server_members` before joining (RLS), so it showed generic copy. `preview_invite` is a
// SECURITY DEFINER RPC (anon-callable) returning the server name/icon, active member count, and
// inviter for a VALID, live, under-cap code; a revoked/expired/invalid code returns nothing →
// null here → the caller shows the dead-invite state. Never throws (a preview must not block the
// page); a network error just yields null and the card falls back to generic copy.
export async function loadInvitePreview(code) {
  const clean = String(code || "").trim().split("?")[0].split("/").filter(Boolean).pop();
  if (isDemo()) return { serverId: "lb", name: "Late Bloom LP", iconKey: null, memberCount: 6, inviter: "jax" };
  if (!clean) return null;
  try {
    const { data, error } = await supabase.rpc("preview_invite", { p_code: clean });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { serverId: row.server_id, name: row.server_name, iconKey: row.icon_key || null, memberCount: row.member_count ?? 0, inviter: row.inviter_name || null };
  } catch { return null; }
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
  clearWorkspaceCache();   // the server bundle caches the channel list — refresh so the new channel shows in the sidebar
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
  clearWorkspaceCache();   // channel name/topic is cached in the bundle — refresh so the edit shows without a reload
  return p;
}

// Replace a member's assignable (non-default) roles (set_member_roles RPC, manage_roles-gated).
export async function setMemberRoles(serverId, targetUser, roleIds) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("set_member_roles", { server_id: serverId, target_user: targetUser, role_ids: roleIds });
  if (error) throw new Error(error.message || "Couldn’t update the member's roles");
}

// ── Roles editor (§C.16) ─────────────────────────────────────────────────────
// Roles are edited by direct `roles` table CRUD — roles_write is FOR ALL gated by
// has_perm(manage_roles), so no RPC is needed. permissions is a bit-OR of perm_bit() flags;
// the whole flag set fits in a JS Number (max 131071), so no BigInt.
export const PERM_GROUPS = [
  { group: "Server", flags: [["manage_server", "Manage server"], ["manage_roles", "Manage roles"], ["manage_channels", "Manage channels"], ["manage_invites", "Manage invites"], ["view_audit", "View audit log"], ["manage_billing", "Manage billing"]] },
  { group: "Members", flags: [["kick", "Kick members"], ["ban", "Ban members"], ["timeout", "Time out members"], ["create_invite", "Create invites"]] },
  { group: "Content", flags: [["send_messages", "Send messages"], ["upload", "Upload files"], ["add_tags", "Add tags"], ["comment", "Comment"], ["pin_message", "Pin messages"], ["delete_any_message", "Delete any message"], ["view_channel", "View channels"]] },
];
const PERM_BIT = { manage_server: 1, manage_roles: 2, manage_channels: 4, manage_invites: 8, view_audit: 16, manage_billing: 32, kick: 64, ban: 128, timeout: 256, create_invite: 512, upload: 1024, add_tags: 2048, comment: 4096, pin_message: 8192, delete_any_message: 16384, view_channel: 32768, send_messages: 65536 };
export function permBit(flag) { return PERM_BIT[flag] || 0; }

export async function loadRoles(serverId) {
  if (isDemo()) return [
    { id: "r-admin", name: "producer", color: 4, permissions: 65535, is_default: false, position: 1 },
    { id: "r-mod", name: "moderator", color: 12, permissions: 64 + 128 + 256, is_default: false, position: 2 },
    { id: "r-everyone", name: "@everyone", color: null, permissions: 1024 + 2048 + 4096 + 8192 + 32768 + 65536, is_default: true, position: 99 },
  ];
  const { data, error } = await supabase.from("roles").select("id,name,color,position,permissions,is_default").eq("server_id", serverId).order("position");
  if (error) throw new Error(error.message || "Couldn’t load the roles");
  return (data || []).map((r) => ({ ...r, permissions: Number(r.permissions) }));
}
export async function createRole(serverId, name) {
  if (isDemo()) return { id: "r-" + Date.now(), name: name || "new role", color: 20, permissions: 0, is_default: false };
  const { data, error } = await supabase.from("roles").insert({ server_id: serverId, name: name || "new role", color: 20, permissions: 0 }).select("id,name,color,permissions,is_default").single();
  if (error) throw new Error(error.message || "Couldn’t create the role");
  return { ...data, permissions: Number(data.permissions) };
}
export async function updateRole(roleId, patch) {
  if (isDemo()) return;
  const { error } = await supabase.from("roles").update(patch).eq("id", roleId);
  if (error) throw new Error(error.message || "Couldn’t save the role");
}
export async function deleteRole(roleId) {
  if (isDemo()) return;
  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) throw new Error(error.message || "Couldn’t delete the role");
}

// ── Channel permissions (§C.18) — a private channel's role allow-list ─────────
// The beta scopes private channels by ROLE only (channel_roles); zero rows = open to all
// members. Read the current allow-list, and replace it via set_channel_access.
export async function loadChannelRoles(channelId) {
  if (isDemo()) return [];
  const { data } = await supabase.from("channel_roles").select("role_id").eq("channel_id", channelId);
  return (data || []).map((r) => r.role_id);
}
export async function setChannelAccess(channelId, roleIds) {
  if (isDemo()) return;
  const { error } = await supabase.rpc("set_channel_access", { channel_id: channelId, role_ids: roleIds });
  if (error) throw new Error(error.message || "Couldn’t update channel access");
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

// All reactions on one message, grouped into the {emoji, n, mine} chips the row renders.
// Used by the realtime echo to refresh a message's chips from server truth after someone
// else reacts. RLS lets a channel member read reactions on messages they can see.
export async function loadMessageReactions(messageId) {
  const user = session();
  const { data } = await supabase.from("message_reactions").select("emoji,user_id").eq("message_id", messageId);
  const byEmoji = new Map();
  for (const r of data || []) {
    const e = byEmoji.get(r.emoji) || { emoji: r.emoji, n: 0, mine: false };
    e.n++; if (user && r.user_id === user.id) e.mine = true;
    byEmoji.set(r.emoji, e);
  }
  return [...byEmoji.values()];
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
