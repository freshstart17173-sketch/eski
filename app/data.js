// data.js — the workspace data layer. One function shapes everything the
// workspace screen renders, so the screen never talks to Supabase directly and
// the same shape drives both the populated and the empty render.
//
// Two sources, one shape:
//  - `?demo=1`  → the Late Bloom LP fixture (demo.js), matching the gallery. Used
//                 to verify the P4 UI against the visual law without seeding the DB.
//  - otherwise  → the live read. Against the clean-slate database this returns the
//                 EMPTY shape, so the screen shows its empty states (which is a
//                 real, required P4 state). Live message/member/presence reads and
//                 the Realtime subscriptions are P4.10/P4.11 [GL] — wired next,
//                 against seed data — so this path is deliberately empty until then.

import { demoWorkspace } from "./demo.js";
import { session } from "./supabase.js";

/** True when the URL asks for the demo fixture (?demo=1). */
export function isDemo() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

// the empty shape — every list absent so the screen falls to its empty states.
function emptyWorkspace(serverId, channelId) {
  const user = session();
  const name = user?.email?.split("@")[0] || "you";
  return {
    me: { id: user?.id || null, name, initials: name.slice(0, 2).toUpperCase(), handle: name, colorIdx: 1 },
    isAdmin: false,
    servers: [],
    dmUnread: 0,
    server: serverId ? { id: serverId, name: "", initials: "" } : null,
    channelGroups: [],
    channel: channelId ? { id: channelId, name: "", topic: "", pins: 0, files: 0 } : null,
    messages: [],
    typing: [],
    pins: [],
    files: [],
    memberGroups: [],
    thread: null,
  };
}

/**
 * loadWorkspace({serverId, channelId}) → Promise<workspace-shape>.
 * Demo returns synchronously-resolved fixture; live returns the empty shape for
 * now (P4.10/P4.11 replace the live branch with real reads + Realtime).
 */
export async function loadWorkspace({ serverId, channelId } = {}) {
  if (isDemo()) return demoWorkspace();
  return emptyWorkspace(serverId, channelId);
}
