// demo.js — the Late Bloom LP fixture that matches the gallery's `workspace`
// screen (docs/design/gallery.html, ?app=1#workspace), the visual LAW for P4.
//
// The workspace renders from a data object of this exact shape; against the live
// (empty) database the data layer returns the empty equivalent and the screen
// shows its empty states. This fixture drives the POPULATED render so the P4 UI
// can be verified pixel-against-gallery without seeding the database. It is gated
// behind `?demo=1` (see data.js) — never returned to a signed-in, real user.
//
// Member hues are indices into the 30-hue palette (tokens --m1..--m30); the
// byline colour is applied inline per member (server-scoped, CANON §A).

export const me = { id: "me", name: "jax", initials: "JX", handle: "jax", colorIdx: 5 };

// people, keyed so messages/members/pins share one identity + hue
const P = {
  jax:  { name: "jax",  initials: "JX", colorIdx: 5 },
  rae:  { name: "rae",  initials: "RA", colorIdx: 1 },
  dev:  { name: "dev",  initials: "DV", colorIdx: 3 },
  tomo: { name: "tomo", initials: "TM", colorIdx: 2 },
  kofi: { name: "kofi", initials: "KO", colorIdx: 4 },
  nel:  { name: "nel",  initials: "NL", colorIdx: 6 },
  mira: { name: "mira", initials: "MI", colorIdx: 4 },
};

export function demoWorkspace() {
  return {
    me,
    isAdmin: true,                      // jax is an admin of this server
    // server rail
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB", active: true },
      { id: "sp", name: "Specter",       initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap",     initials: "BS" },
    ],
    dmUnread: 3,

    server: { id: "lb", name: "Late Bloom LP", initials: "LB" },

    // channel column — grouped by kind, in order
    channelGroups: [
      { kind: "text", label: "Channels", channels: [
        { id: "announcements", name: "announcements" },
        { id: "beats",   name: "beats", active: true },
        { id: "verses",  name: "verses", mentions: 4 },
        { id: "mixing",  name: "mixing" },
        { id: "references", name: "references" },
        { id: "stems", name: "stems and sessions" },
      ] },
      { kind: "voice", label: "Voice", channels: [
        { id: "booth", name: "the booth", voice: [
          { name: "dev", colorIdx: 3, doing: "sharing FL" },
          { name: "rae", colorIdx: 1 },
        ] },
        { id: "cowrite", name: "co-writing", voice: [] },
      ] },
    ],

    channel: { id: "beats", name: "beats", topic: "put the session name in the file name", pins: 3, files: 12 },

    // reverse-chron message stream (rendered top→bottom oldest→newest)
    messages: [
      { id: "m1", author: P.dev, time: "2:14 PM",
        body: "reworked the back half. same bpm, swapped the drums to the ones @rae liked",
        mentions: [{ name: "rae", colorIdx: 1 }],
        attach: { kind: "file", name: "late_bloom_beat.flp", ext: "FLP", tags: ["drums", "142bpm", "bridge"] },
        actions: true,
        reactions: [{ emoji: "🔥", n: 3 }, { emoji: "👀", n: 1 }],
        replies: 3 },
      { id: "m2", author: P.dev, time: "2:16 PM",
        body: "dropped the whole one-shot pack, grab what you want",
        clump: [
          { kind: "audio", name: "kick_punchy.wav" },
          { kind: "audio", name: "snare_tight.wav" },
          { kind: "audio", name: "hat_loop_142.wav" },
          { kind: "audio", name: "break_chop.wav" },
          { kind: "file",  name: "drum_bus.flp" },
        ], clumpMore: 3,
        reactions: [{ emoji: "🥁", n: 2 }] },
      { id: "m3", author: P.rae, time: "2:31 PM",
        body: "this is the one. pulling it into #mixing, dropping a scratch verse now",
        channelMentions: ["mixing"], edited: true,
        attach: { kind: "audio", name: "bridge_scratch_rae.wav", ext: "WAV", tags: ["acapella"] } },
      { id: "divider", newDivider: true },
      { id: "m4", author: P.mira, time: "2:38 PM",
        forward: { fromChannel: "references",
          author: { name: "nel", colorIdx: 6 }, when: "yesterday",
          text: "the drum sound we keep coming back to, this reference board" } },
      { id: "m5", author: P.tomo, time: "2:47 PM",
        body: "ableton user here, opened dev's stems fine. one note on the low end, dropped a comment on the bounce",
        attach: { kind: "file", name: "stems_sh040.zip", ext: "ZIP", size: "48 MB" } },
    ],

    typing: ["tomo"],

    pins: [
      { by: "jax", author: P.jax, time: "Mon", text: "session is Fri 3pm. bring stems bounced at 24/48, not the project files." },
      { by: "rae", author: P.dev, time: "2:14 PM", text: "latest beat", attach: { name: "late_bloom_beat.flp" } },
      { by: "jax", author: P.tomo, time: "Tue", text: "reference for the drum sound, the break at 0:48 is what we're chasing" },
    ],

    files: [
      { kind: "file",  name: "late_bloom_beat.flp",  ext: "FLP", who: "dev" },
      { kind: "audio", name: "bridge_scratch_rae.wav", ext: "WAV", who: "rae" },
      { kind: "image", name: "ref_drums.png", shot: "c", who: "rae" },
      { kind: "audio", name: "bounce_warm.wav", ext: "WAV", who: "dev" },
    ],

    // members rail, grouped by role
    memberGroups: [
      { label: "Admins", members: [
        { ...P.jax, doing: "arranging, Ableton", presence: "online" },
        { ...P.rae, doing: "recording", presence: "online" },
      ] },
      { label: "Members", members: [
        { ...P.dev, doing: "in FL Studio", presence: "online" },
        { ...P.tomo, doing: "reviewing the beat", presence: "online" },
        { ...P.kofi, doing: "offline", presence: "offline" },
        { ...P.nel,  doing: "offline", presence: "offline" },
      ] },
    ],

    // (the File explorer's own demo fixture lives in demoExplorer(), below)

    // a thread opened from m1's "3 replies"
    thread: {
      channel: "beats",
      parent: { author: P.dev, time: "2:14 PM", body: "reworked the back half. same bpm, swapped the drums",
        attach: { kind: "file", name: "late_bloom_beat.flp", ext: "FLP" } },
      replies: [
        { author: P.rae, time: "2:18 PM", body: "low end's a bit much on the bridge, otherwise this is the one" },
        { author: P.jax, time: "2:22 PM", body: "agreed. @tomo can you pull it down a couple db and bounce a rough?", mentions: [{ name: "tomo", colorIdx: 2 }] },
        { author: P.tomo, time: "2:26 PM", body: "on it, pushing a new bounce in a sec" },
      ],
    },
  };
}

// The File-explorer fixture (P5.4) — the same Late Bloom LP server as the
// workspace demo, shaped like loadExplorer()'s live return so the screen renders
// identically from either source. Folders nest (beats › drums); files carry their
// `folderId` (null = server root) and the member hue via `who.colorIdx`.
export function demoExplorer(source = "server") {
  if (source === "personal") return demoPersonalExplorer();
  const W = (id, title, kind, ext, bytes, who, folderId, channelName, tags = []) => ({
    id, title, name: title, kind, file_ext: ext, blob_sha: null, bytes,
    who: { name: who, colorIdx: P[who].colorIdx }, channelName, folderId,
    created_at: "2026-08-15T12:00:00Z", hidden: false, tags,
  });
  return {
    needsAuth: false, live: false,
    me, isAdmin: true, dmUnread: 3,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB", active: true },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    server: { id: "lb", name: "Late Bloom LP", initials: "LB" },
    channelGroups: [
      { kind: "text", label: "Channels", channels: [
        { id: "announcements", name: "announcements" }, { id: "beats", name: "beats" },
        { id: "verses", name: "verses" }, { id: "mixing", name: "mixing" },
        { id: "references", name: "references" }, { id: "stems", name: "stems and sessions" },
      ] },
      { kind: "voice", label: "Voice", channels: [
        { id: "booth", name: "the booth", voice: [] }, { id: "cowrite", name: "co-writing", voice: [] },
      ] },
    ],
    membersById: {},
    folders: [
      { id: "beats", name: "beats", parentId: null, archived: false, locked: false, count: 4 },
      { id: "drums", name: "drums", parentId: "beats", archived: false, locked: false, count: 0 },
      { id: "verses", name: "verses", parentId: null, archived: false, locked: false, count: 0 },
      { id: "mixing", name: "mixing", parentId: null, archived: false, locked: false, count: 0 },
      { id: "references", name: "references", parentId: null, archived: false, locked: false, count: 1 },
      { id: "stems", name: "stems and sessions", parentId: null, archived: false, locked: true, count: 1 },
    ],
    files: [
      W("f1", "late_bloom_beat.flp", "other", "flp", 8.4e6, "dev", "beats", "beats", ["drums", "142bpm", "bridge"]),
      { ...W("f2", "bridge_scratch_rae.wav", "audio", "wav", 18e6, "rae", "beats", "beats", ["acapella"]), comments: [{ name: "dev", colorIdx: 3, time: "11:02 AM", text: "looping this under the second verse" }] },
      { ...W("f3", "ref_drums.png", "image", "png", 2.1e6, "rae", "beats", "beats", ["reference"]), starred: true, comments: [{ name: "jax", colorIdx: 5, time: "2:31 PM", text: "the break at 0:48 is the one" }] },
      W("f4", "bloom_master.als", "other", "als", 36e6, "jax", "beats", "beats", ["ableton", "master"]),
      { ...W("f5", "moodboard.png", "image", "png", 3.3e6, "nel", "references", "references", ["cover", "wip"]), starred: true },
      W("f6", "stems_sh040.zip", "other", "zip", 48e6, "tomo", "stems", "stems and sessions", ["stems"]),
      W("f7", "session_notes.md", "text", "md", 4200, "jax", null, null, []),
      { ...W("f8", "system_cache.tmp", "other", "tmp", 1e5, "dev", null, null, []), hidden: true },   // #55 utility file, hidden by default
    ],
    currentFolderId: null,
    // Trash smart-folder fixture (gallery B19): soft-deleted rows with varied days-left,
    // the last near expiry (warn). deletedAt is relative to now so the countdown is live.
    trash: [
      { id: "t1", title: "old_bounce_rough.wav", name: "old_bounce_rough.wav", kind: "audio", file_ext: "wav", blob_sha: null, bytes: 12e6, deletedAt: new Date(Date.now() - 1 * 86400000).toISOString(), who: { name: "dev" } },
      { id: "t2", title: "late_bloom_beat_alt.flp", name: "late_bloom_beat_alt.flp", kind: "other", file_ext: "flp", blob_sha: null, bytes: 9e6, deletedAt: new Date(Date.now() - 9 * 86400000).toISOString(), who: { name: "dev" } },
      { id: "t3", title: "ref_moodboard.png", name: "ref_moodboard.png", kind: "image", file_ext: "png", blob_sha: null, bytes: 2.4e6, deletedAt: new Date(Date.now() - 24 * 86400000).toISOString(), who: { name: "rae" } },
    ],
    storage: { usedBytes: 74 * 1024 ** 3, capGb: 120, capBytes: 120 * 1024 ** 3, status: "active", overCap: false },
    activeServerId: "lb",
    source: "server",
  };
}

// A Profile demo fixture — the owner self-view (the gallery reference). All three
// shelves + Settings; NO member colour (public profile). Collaborators are plain text.
export function demoProfile(handle) {
  const C = (id, title, kind, ext, who) => ({ id, title, name: title, kind, file_ext: ext, blob_sha: null, bytes: 0, created_at: "2026-08-18T10:00:00Z", tags: [], who: { name: who } });
  return {
    needsAuth: false, live: false, source: "profile",
    me, dmUnread: 3, server: null,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB" },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    profile: { id: "me", name: "jax", handle: handle || "jax", initials: "JX", bio: "producer + engineer. building the Late Bloom LP with a few people.", pronouns: "they/them" },
    pov: "owner",
    shelves: {
      public: [
        C("pub1", "low ceilings, the finished verse", "audio", "wav", "jax, rae, tomo"),
        C("pub2", "cover art, bloom", "image", "png", "nel, jax"),
        C("pub3", "bloom, single", "audio", "wav", "jax, dev, tomo"),
        C("pub4", "lyric visual", "video", "mp4", "sol"),
        C("pub5", "On finishing things", "text", "md", "jax"),
      ],
      server: [
        C("srv1", "late_bloom_beat.flp", "other", "flp", "jax"),
        C("srv2", "bloom_master.als", "other", "als", "jax"),
      ],
      private: [
        C("priv1", "rough_ideas.zip", "other", "zip", "jax"),
        C("priv2", "voice_memo_03.m4a", "audio", "m4a", "jax"),
        C("priv3", "moodboard_private.png", "image", "png", "jax"),
      ],
    },
  };
}

// The home Feed demo fixture — friends' public posts, NO member colour (public).
export function demoFeed() {
  const P2 = (id, title, kind, ext, who, ar) => ({
    id, title, name: title, kind, file_ext: ext, blob_sha: null, bytes: 0,
    created_at: "2026-08-20T10:00:00Z", tags: [], who: { name: who }, ar,
  });
  return {
    needsAuth: false, live: false, source: "feed",
    me, isAdmin: false, dmUnread: 3, server: null,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB" },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    posts: [
      P2("q1", "keyframe study, the falling sequence", "image", "png", "lin"),
      P2("q2", "back half rework, drums finally sit right", "audio", "wav", "dev"),
      P2("q3", "q3 comp reel, first pass", "video", "mp4", "mira"),
      P2("q4", "On finishing things", "text", "md", "jax"),
      P2("q5", "cover art studies, warm set", "image", "png", "nel"),
      P2("q6", "low ceilings, verse idea", "audio", "wav", "rae"),
      P2("q7", "title sequence, draft", "video", "mp4", "sol"),
      P2("q8", "drum one-shots, vol 2", "audio", "wav", "jax"),
      P2("q9", "session backup, aug", "other", "zip", "dev"),
    ],
  };
}

// Post comments demo fixture (CANON §E.8.5) — public-context, per-post threads. NO member
// hue (public), so no colorIdx. Only a couple of posts carry a thread; the rest read empty.
export function demoComments(workId) {
  const c = (id, name, text, time, mine = false) => ({ id, name, text, time, mine });
  const THREADS = {
    q1: [
      c("dc1", "dev", "the falling frames read so clean here — what's driving the ease?", "2h"),
      c("dc2", "mira", "seconded, the timing on frame 40 is lovely.", "1h"),
      c("dc0", "jax", "custom cubic on the last third — glad it lands.", "40m", true),   // mine → deletable
    ],
    q2: [
      c("dc3", "lin", "the low end finally has room. bus compression?", "3h"),
    ],
  };
  return THREADS[workId] || [];
}

// Shared-link viewer demo fixture (CANON #40) — what a /shared/:token link opens to. A
// `?demo=1` token of "expired" (or "dead") shows the dead-link state; anything else shows a
// shared file. No member hue (anon / out-of-server context).
export function demoSharedWork(token) {
  if (token === "expired" || token === "dead") return { dead: true };
  return {
    work: {
      id: "sh1", title: "late_bloom_beat.flp", name: "late_bloom_beat.flp", kind: "other",
      file_ext: "flp", blob_sha: null, bytes: 8_400_000, created_at: "2026-08-18T10:00:00Z",
      who: { name: "dev" }, tags: ["drums", "142bpm", "bridge"],
    },
  };
}

// Messages + Friends demo fixture (P7.1) — DM threads + the friends panel (accepted +
// pending, incoming & outgoing). No member hue (DMs are outside any server).
export function demoDMs() {
  const u = (id, name, presence = "online") => ({ id, name, handle: name, initials: name.slice(0, 2).toUpperCase(), avatar_key: null, presence });
  return {
    needsAuth: false, live: false, source: "dms", me, dmUnread: 3, server: null,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB" },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    dms: [
      { id: "d1", group: false, name: "mira", members: [u("mira", "mira")], pinned: true, muted: false },
      { id: "d2", group: true, name: "sh040 crew", members: [u("mira", "mira"), u("lin", "lin"), u("sol", "sol", "idle")], pinned: false, muted: true },
      { id: "d3", group: false, name: "dev", members: [u("dev", "dev")], pinned: false, muted: false },
      { id: "d4", group: false, name: "tomo", members: [u("tomo", "tomo", "offline")], pinned: false, muted: false },
    ],
    friends: {
      accepted: [u("dev", "dev"), u("mira", "mira"), u("rae", "rae")],
      incoming: [u("lin", "lin")],
      outgoing: [u("sol", "sol")],
    },
  };
}

// A DM conversation demo fixture (P7.2). Keyed by channel id; unknown ids start empty so a
// freshly-opened chat (e.g. from the friend Message button) shows just the composer.
export function demoDMThread(id) {
  const m = (mid, name, initials, body, time, mine = false) => ({ id: mid, author: { name, initials, avatar_key: null }, time, body, mine });
  const THREADS = {
    d1: [
      m("m1", "mira", "MI", "saw your comps on tiktok, insane. this is so much cleaner than a drive folder", "6:02 PM"),
      m("m2", "jax", "JX", "ha thanks — sending you the Late Bloom link, it drops you straight in", "6:03 PM", true),
      m("m3", "mira", "MI", "in. the file explorer is unreal", "6:10 PM"),
    ],
    d3: [
      m("m4", "dev", "DV", "bounced the new drums, check the bridge", "2:40 PM"),
      m("m5", "jax", "JX", "on it", "2:41 PM", true),
    ],
  };
  return { messages: THREADS[id] || [], memberById: {}, dmChannelId: id };
}

// The personal "My files" demo fixture — your own Drive, distinct from any server:
// nested save-folders, own works, "Your storage" footer, no channel column.
function demoPersonalExplorer() {
  const F = (id, title, kind, ext, bytes, folderId, tags = []) => ({
    id, title, name: title, kind, file_ext: ext, blob_sha: null, bytes,
    who: null, channelName: null, folderId, created_at: "2026-08-12T09:00:00Z", hidden: false, tags,
  });
  return {
    needsAuth: false, live: false, source: "personal",
    me, isAdmin: false, dmUnread: 3,
    servers: [
      { id: "lb", name: "Late Bloom LP", initials: "LB" },
      { id: "sp", name: "Specter", initials: "SP", mentions: 7 },
      { id: "bs", name: "Beat swap", initials: "BS" },
    ],
    server: null, channelGroups: [], membersById: {},
    rootLabel: "My files", storageLabel: "Your storage",
    folders: [
      { id: "saved", name: "Saved from servers", parentId: null, archived: false, locked: false, count: 2 },
      { id: "uploads", name: "Uploads", parentId: null, archived: false, locked: false, count: 1 },
      { id: "bounces", name: "Bounces", parentId: null, archived: false, locked: false, count: 1 },
      { id: "screens", name: "Screenshots", parentId: null, archived: false, locked: false, count: 0 },
    ],
    files: [
      F("p1", "late_bloom_master.wav", "audio", "wav", 32e6, "bounces", ["master", "bloom"]),
      F("p2", "cover_bloom.png", "image", "png", 4.8e6, "saved", ["cover", "wip"]),
      F("p3", "ref_moodboard.png", "image", "png", 3.1e6, "saved", ["reference"]),
      F("p4", "verse_idea.m4a", "audio", "m4a", 6.2e6, "uploads", ["scratch"]),
      F("p5", "todo.md", "text", "md", 1800, null, []),
    ],
    currentFolderId: null,
    storage: { usedBytes: 22 * 1024 ** 3, capGb: 50, capBytes: 50 * 1024 ** 3, status: "active", overCap: false },
  };
}
