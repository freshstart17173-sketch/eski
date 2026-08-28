// realtime.js — the four Supabase Realtime channels the live workspace binds to
// (CANON §E.4): `channel:{id}` message changes (P4.10), `channel:{id}:typing`
// broadcast (P4.10), `server:{id}` presence (P4.11). The notification bell
// `user:{id}` is P7. RLS is enforced on Realtime exactly like a read, so a
// subscriber only ever receives rows it could already SELECT — no unseen leaks.
//
// All open channels are tracked module-side and torn down together on navigation
// (main.js calls teardownRealtime() before each render) so a channel switch never
// leaves a dangling subscription double-patching the DOM.

import { supabase, session } from "./supabase.js";

let open = [];               // every RealtimeChannel we've opened this view
let typingChannel = null;    // the one we also broadcast our own typing into
let dmChannel = null;        // the current DM conversation's channel (replaced on convo switch)

export function teardownRealtime() {
  for (const ch of open) { try { supabase.removeChannel(ch); } catch {} }
  open = []; typingChannel = null; dmChannel = null;
}

// P4.10 — live message insert / edit / tombstone for one channel.
export function subscribeChannelMessages(channelId, { onInsert, onUpdate, onDelete }) {
  const flt = `channel_id=eq.${channelId}`;
  const ch = supabase.channel(`channel:${channelId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: flt }, (p) => onInsert?.(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: flt }, (p) => onUpdate?.(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: flt }, (p) => onDelete?.(p.old))
    .subscribe();
  open.push(ch);
  return ch;
}

// P4.10 — typing indicator over broadcast (transient, never hits the DB).
export function subscribeTyping(channelId, onTyping) {
  const ch = supabase.channel(`channel:${channelId}:typing`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "typing" }, (p) => onTyping?.(p.payload))
    .subscribe();
  open.push(ch); typingChannel = ch;
  return ch;
}
export function sendTyping(user) {
  if (typingChannel) typingChannel.send({ type: "broadcast", event: "typing", payload: { user, at: Date.now() } });
}

// P4.11 — server presence: track my {name,doing,presence}; onSync gets the full
// presence state ({ key → [meta,…] }) whenever anyone joins/leaves/updates.
export function subscribeServerPresence(serverId, meState, onSync) {
  const ch = supabase.channel(`server:${serverId}`, { config: { presence: { key: meState.id } } })
    .on("presence", { event: "sync" }, () => onSync?.(ch.presenceState()))
    .subscribe(async (status) => { if (status === "SUBSCRIBED") await ch.track(meState); });
  open.push(ch);
  return ch;
}

// P7.2 echo — live DM messages for one conversation. Only one DM conversation is open at a
// time, and switching convos happens IN-SCREEN (no route change, so no teardownRealtime), so
// this closes the previous conversation's channel before opening the new one — otherwise a
// stale subscription would keep patching a conversation you've navigated away from.
export function subscribeDMMessages(dmChannelId, { onInsert, onUpdate, onDelete } = {}) {
  if (!session()) return null;   // demo / signed-out: nothing to subscribe to
  if (dmChannel) { try { supabase.removeChannel(dmChannel); } catch {} open = open.filter((c) => c !== dmChannel); }
  const flt = `dm_channel_id=eq.${dmChannelId}`;
  const ch = supabase.channel(`dm:${dmChannelId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: flt }, (p) => onInsert?.(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_messages", filter: flt }, (p) => onUpdate?.(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "dm_messages", filter: flt }, (p) => onDelete?.(p.old))
    .subscribe();
  dmChannel = ch; open.push(ch);
  return ch;
}

// P4.12 echo — live reactions. message_reactions has NO channel_id column, so it can't be
// filtered per-channel in a postgres_changes subscription; subscribe to the whole table
// (RLS still limits delivery to reactions on messages you can read) and let the caller filter
// to the messages currently on screen. onChange gets the changed row (new on insert, old on
// delete) — both carry message_id + user_id.
export function subscribeChannelReactions(onChange) {
  if (!session()) return null;
  const ch = supabase.channel("reactions:live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (p) => onChange?.(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (p) => onChange?.(p.old))
    .subscribe();
  open.push(ch);
  return ch;
}

// P7.3 echo — live notifications for the signed-in user. RLS scopes notifications to their
// owner, so `user_id=eq.{id}` is belt-and-braces on top of that. onInsert gets the raw row;
// the caller shapes + prepends it (and bumps any unread badge).
export function subscribeNotifications(userId, onInsert) {
  if (!session() || !userId) return null;
  const ch = supabase.channel(`user:${userId}:notifs`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) => onInsert?.(p.new))
    .subscribe();
  open.push(ch);
  return ch;
}

// P4.10 — clear the channel's unread on view.
export function markRead(channelId) {
  return supabase.rpc("mark_channel_read", { channel_id: channelId });
}

// send a message (direct RLS-gated insert; there is no send_message RPC). user_id
// is NOT NULL with no default, so it's set explicitly — the RLS with-check gates
// it to auth.uid() regardless, this just satisfies the column.
export function sendMessage(channelId, body, { parentId = null, alsoToChannel = false } = {}) {
  const row = { channel_id: channelId, body, user_id: session()?.id };
  if (parentId) { row.parent_id = parentId; row.also_to_channel = alsoToChannel; }
  return supabase.from("messages").insert(row);
}
