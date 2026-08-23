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

export function teardownRealtime() {
  for (const ch of open) { try { supabase.removeChannel(ch); } catch {} }
  open = []; typingChannel = null;
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
